import {
  AdbReverseNotSupportedError,
  AdbServerClient,
  type Adb,
} from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  AndroidScreenPowerMode,
  DefaultServerPath,
  ScrcpyPointerId,
  type AndroidKeyCode as AndroidKeyCodeType,
  type AndroidMotionEventAction as MotionAction,
} from '@yume-chan/scrcpy'
import {
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs'
import {
  MaybeConsumable,
  ReadableStream,
  WritableStream,
  type MaybeConsumable as MaybeConsumableValue,
} from '@yume-chan/stream-extra'

const SERVER_URL = '/vendor/scrcpy-server-v3.3.3'
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

class WebSocketAdbConnector implements AdbServerClient.ServerConnector {
  readonly sockets = new Set<WebSocket>()

  constructor(private readonly url: string) {}

  async connect(options?: AdbServerClient.ServerConnectionOptions): Promise<AdbServerClient.ServerConnection> {
    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch {
      throw new Error(`无法连接终端 scrcpy 中继：${this.displayEndpoint()}`)
    }
    socket.binaryType = 'arraybuffer'
    this.sockets.add(socket)

    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        socket.close()
        reject(options?.signal?.reason || new Error('ADB WebSocket connection aborted'))
      }
      if (options?.signal?.aborted) return abort()
      options?.signal?.addEventListener('abort', abort)
      socket.addEventListener('open', () => {
        options?.signal?.removeEventListener('abort', abort)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        options?.signal?.removeEventListener('abort', abort)
        reject(new Error(`无法连接终端 scrcpy 中继：${this.displayEndpoint()}`))
      }, { once: true })
    })

    let closedResolve!: (value: undefined) => void
    const closed = new Promise<undefined>((resolve) => { closedResolve = resolve })
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        socket.addEventListener('message', (event) => {
          const value = event.data
          if (value instanceof ArrayBuffer) controller.enqueue(new Uint8Array(value))
          else if (value instanceof Blob) void value.arrayBuffer().then((buffer) => controller.enqueue(new Uint8Array(buffer)))
        })
        socket.addEventListener('close', () => {
          try { controller.close() } catch { /* already closed */ }
          closedResolve(undefined)
        }, { once: true })
        socket.addEventListener('error', () => {
          try { controller.error(new Error('ADB WebSocket connection failed')) } catch { /* already closed */ }
        })
      },
      cancel() { socket.close() },
    })

    const writable = new WritableStream<MaybeConsumableValue<Uint8Array>>({
      async write(chunk) {
        while (socket.bufferedAmount > MAX_BUFFERED_BYTES && socket.readyState === WebSocket.OPEN) {
          await new Promise((resolve) => window.setTimeout(resolve, 4))
        }
        if (socket.readyState !== WebSocket.OPEN) throw new Error('ADB WebSocket 已断开')
        MaybeConsumable.tryConsume(chunk, (value) => {
          const copy = new Uint8Array(value.byteLength)
          copy.set(value)
          socket.send(copy.buffer)
        })
      },
      close() { socket.close() },
      abort() { socket.close() },
    })

    const close = async () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
      if (socket.readyState !== WebSocket.CLOSED) await closed
      this.sockets.delete(socket)
    }

    return { readable, writable, closed, close }
  }

  addReverseTunnel(): never { throw new AdbReverseNotSupportedError() }
  removeReverseTunnel(): void {}
  clearReverseTunnels(): void {}

  private displayEndpoint() {
    try {
      const parsed = new URL(this.url)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return '地址无效'
    }
  }

  closeAll() {
    for (const socket of this.sockets) socket.close()
    this.sockets.clear()
  }
}

export interface BrowserScrcpySessionOptions {
  wsUrl: string
  serial: string
  canvas: HTMLCanvasElement
  onSize?: (width: number, height: number) => void
  onStats?: (frames: number, skipped: number) => void
  onClosed?: (error?: unknown) => void
  onLog?: (line: string) => void
}

export class BrowserScrcpySession {
  private readonly connector: WebSocketAdbConnector
  private readonly adb: Adb
  private readonly client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>
  private readonly decoder: WebCodecsVideoDecoder
  private readonly statsTimer: number
  private closing = false
  private controlQueue = Promise.resolve()
  width: number
  height: number

  private constructor(
    connector: WebSocketAdbConnector,
    adb: Adb,
    client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>,
    decoder: WebCodecsVideoDecoder,
    width: number,
    height: number,
    options: BrowserScrcpySessionOptions,
  ) {
    this.connector = connector
    this.adb = adb
    this.client = client
    this.decoder = decoder
    this.width = width
    this.height = height
    let previousFrames = decoder.framesRendered
    this.statsTimer = window.setInterval(() => {
      const currentFrames = decoder.framesRendered
      options.onStats?.(currentFrames - previousFrames, decoder.framesSkipped)
      previousFrames = currentFrames
    }, 1000)
    decoder.sizeChanged(({ width: nextWidth, height: nextHeight }) => {
      this.width = nextWidth
      this.height = nextHeight
      options.canvas.width = nextWidth
      options.canvas.height = nextHeight
      options.onSize?.(nextWidth, nextHeight)
    })
    void client.exited.then(() => {
      if (!this.closing) options.onClosed?.()
    }).catch((error) => {
      if (!this.closing) options.onClosed?.(error)
    })
  }

  static async start(options: BrowserScrcpySessionOptions): Promise<BrowserScrcpySession> {
    if (!WebCodecsVideoDecoder.isSupported || !WebGLVideoFrameRenderer.isSupported) {
      throw new Error('当前浏览器不支持 WebCodecs/WebGL；请使用新版 Chrome 并通过 localhost 或 HTTPS 打开平台')
    }
    const connector = new WebSocketAdbConnector(options.wsUrl)
    let adb: Adb | undefined
    let client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>> | undefined
    let decoder: WebCodecsVideoDecoder | undefined
    try {
      const serverClient = new AdbServerClient(connector)
      adb = await serverClient.createAdb({ serial: options.serial })
      const serverResponse = await fetch(SERVER_URL, { cache: 'force-cache' })
      if (!serverResponse.ok || !serverResponse.body) throw new Error(`scrcpy-server 下载失败：HTTP ${serverResponse.status}`)
      await AdbScrcpyClient.pushServer(adb, serverResponse.body as unknown as ReadableStream<Uint8Array>)

      const scrcpyOptions = new AdbScrcpyOptions3_3_3({
        video: true,
        audio: false,
        control: true,
        tunnelForward: true,
        videoCodec: 'h264',
        videoBitRate: 4_000_000,
        maxSize: 1080,
        maxFps: 30,
        powerOn: true,
        stayAwake: true,
        cleanup: true,
        logLevel: 'info',
      })
      const startedClient = await AdbScrcpyClient.start(adb, DefaultServerPath, scrcpyOptions)
      client = startedClient
      void startedClient.output.pipeTo(new WritableStream<string>({ write: (line) => options.onLog?.(line) })).catch(() => {})
      const video = await startedClient.videoStream
      if (!video) throw new Error('scrcpy 没有返回视频流')
      const renderer = new WebGLVideoFrameRenderer(options.canvas, true)
      decoder = new WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer })
      const width = video.width || video.metadata.width || 1
      const height = video.height || video.metadata.height || 1
      options.canvas.width = width
      options.canvas.height = height
      options.onSize?.(width, height)
      void video.stream.pipeTo(decoder.writable).catch((error) => options.onClosed?.(error))
      return new BrowserScrcpySession(connector, adb, startedClient, decoder, width, height, options)
    } catch (error) {
      decoder?.dispose()
      await client?.close().catch(() => {})
      await adb?.close().catch(() => {})
      connector.closeAll()
      throw error
    }
  }

  private enqueueControl(action: () => Promise<void>) {
    this.controlQueue = this.controlQueue.then(action, action)
    return this.controlQueue
  }

  touch(action: MotionAction, x: number, y: number) {
    const controller = this.client.controller
    if (!controller) return Promise.reject(new Error('scrcpy 控制通道不可用'))
    const released = action === AndroidMotionEventAction.Up || action === AndroidMotionEventAction.Cancel
    return this.enqueueControl(() => controller.injectTouch({
      action,
      pointerId: ScrcpyPointerId.Finger,
      pointerX: Math.max(0, Math.min(this.width - 1, Math.round(x))),
      pointerY: Math.max(0, Math.min(this.height - 1, Math.round(y))),
      videoWidth: this.width,
      videoHeight: this.height,
      pressure: released ? 0 : 1,
      actionButton: AndroidMotionEventButton.Primary,
      buttons: released ? AndroidMotionEventButton.None : AndroidMotionEventButton.Primary,
    }))
  }

  key(keyCode: AndroidKeyCodeType) {
    const controller = this.client.controller
    if (!controller) return Promise.reject(new Error('scrcpy 控制通道不可用'))
    return this.enqueueControl(async () => {
      await controller.injectKeyCode({ action: AndroidKeyEventAction.Down, keyCode, repeat: 0, metaState: AndroidKeyEventMeta.None })
      await controller.injectKeyCode({ action: AndroidKeyEventAction.Up, keyCode, repeat: 0, metaState: AndroidKeyEventMeta.None })
    })
  }

  back() { return this.key(AndroidKeyCode.AndroidBack) }
  home() { return this.key(AndroidKeyCode.AndroidHome) }

  setScreenPower(on: boolean) {
    const controller = this.client.controller
    if (!controller) return Promise.reject(new Error('scrcpy 控制通道不可用'))
    return this.enqueueControl(() => controller.setScreenPowerMode(on ? AndroidScreenPowerMode.Normal : AndroidScreenPowerMode.Off))
  }

  injectText(text: string) {
    const controller = this.client.controller
    if (!controller) return Promise.reject(new Error('scrcpy 控制通道不可用'))
    return this.enqueueControl(() => controller.injectText(text))
  }

  snapshot() { return this.decoder.snapshot() }

  async close() {
    if (this.closing) return
    this.closing = true
    window.clearInterval(this.statsTimer)
    await this.controlQueue.catch(() => {})
    await this.client.close().catch(() => {})
    this.decoder.dispose()
    await this.adb.close().catch(() => {})
    this.connector.closeAll()
  }
}

export { AndroidMotionEventAction }
