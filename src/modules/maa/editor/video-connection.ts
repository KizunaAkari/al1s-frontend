import { ScrcpyStream } from './scrcpy-stream'
import { PhoneVideoDecoder } from './video-decoder'

/** Receives only. No input method is exposed by the video connection. */
export function connectPhoneVideo(
  url: string, canvas: HTMLCanvasElement, onError: (error: Error) => void,
  onReady: () => void = () => {},
  onGeometry: (width: number, height: number) => void = () => {},
): () => void {
  const target = new URL(url)
  if (!['ws:', 'wss:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('无效的视频通道地址')
  }
  if (location.protocol === 'https:' && target.protocol !== 'wss:') {
    throw new Error('HTTPS平台需要WSS终端视频通道，不能降级为明文连接')
  }
  let socket: WebSocket | undefined
  let player: PhoneVideoDecoder | undefined
  let closed = false
  let ready = false
  let firstFrameTimer: ReturnType<typeof setTimeout> | undefined
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(firstFrameTimer)
    if (socket) {
      socket.onmessage = socket.onerror = socket.onclose = null
      socket.close()
    }
    player?.close()
  }
  const fail = (error: Error) => { if (!closed) { close(); onError(error) } }
  try {
    player = new PhoneVideoDecoder(canvas, fail, () => {
      if (!closed) onGeometry(canvas.width, canvas.height)
      if (closed || ready) return
      ready = true
      clearTimeout(firstFrameTimer)
      onReady()
    })
    firstFrameTimer = setTimeout(() => fail(new Error('连接后15秒未收到可显示画面，请检查终端并重连')), 15000)
    const parser = new ScrcpyStream()
    socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    socket.onmessage = event => {
      try {
        if (!(event.data instanceof ArrayBuffer)) throw new Error('视频通道返回非二进制数据')
        parser.push(new Uint8Array(event.data), item => {
          if (item.kind !== 'metadata' && item.config) onGeometry(0, 0)
          player!.accept(item)
        })
      } catch (error) { fail(error instanceof Error ? error : new Error('视频数据无效')) }
    }
    socket.onerror = () => fail(new Error('无法连接终端视频通道，请检查终端地址与证书'))
    socket.onclose = () => fail(new Error('视频连接已断开，请重新建立会话'))
    return close
  } catch (error) { close(); throw error }
}
