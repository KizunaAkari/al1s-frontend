import { avcCodec } from './h264-config'
import type { VideoEvent } from './scrcpy-stream'

/** Browser-only decoding; callers close the websocket when onError is invoked. */
export class PhoneVideoDecoder {
  private decoder: VideoDecoder
  private config = new Uint8Array(0)
  private needsKey = true
  private disposed = false
  private pendingFrame: VideoFrame | undefined
  private paintId: number | undefined
  private hasPainted = false
  private codec = ''
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined

  constructor(canvas: HTMLCanvasElement, private onError: (error: Error) => void, onFrame: () => void = () => {}) {
    if (typeof VideoDecoder === 'undefined') throw new Error('浏览器不支持WebCodecs，请使用支持的安全页面')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建视频画布')
    const draw = (frame: VideoFrame) => {
        try {
          if (this.disposed) return
          if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth
          if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight
          context.drawImage(frame, 0, 0)
          clearTimeout(this.recoveryTimer)
          this.recoveryTimer = undefined
          onFrame()
        } catch (error) {
          this.close()
          onError(error instanceof Error ? error : new Error('视频绘制失败'))
        } finally { frame.close() }
    }
    this.decoder = new VideoDecoder({
      output: frame => {
        if (this.disposed) { frame.close(); return }
        clearTimeout(this.recoveryTimer)
        this.recoveryTimer = undefined
        if (!this.hasPainted) {
          this.hasPainted = true
          draw(frame)
          return
        }
        this.pendingFrame?.close()
        this.pendingFrame = frame
        if (this.paintId !== undefined) return
        this.paintId = requestAnimationFrame(() => {
          this.paintId = undefined
          const latest = this.pendingFrame
          this.pendingFrame = undefined
          if (latest) draw(latest)
        })
      },
      error: error => {
        this.close()
        onError(error.name === 'NotSupportedError'
          ? new Error(`当前浏览器不支持H.264视频解码（${this.codec}），请使用支持H.264的Chrome或Edge。`)
          : error)
      },
    })
  }

  accept(event: VideoEvent): void {
    if (this.disposed) throw new Error('视频解码器已关闭')
    if (event.kind === 'metadata') return
    if (event.config) {
      // Rotation/new codec configuration invalidates queued output geometry too.
      if (this.paintId !== undefined) cancelAnimationFrame(this.paintId)
      this.paintId = undefined
      this.pendingFrame?.close()
      this.pendingFrame = undefined
      this.hasPainted = false
      if (this.decoder.state === 'configured') this.decoder.reset()
      this.codec = avcCodec(event.data)
      this.decoder.configure({ codec: this.codec, optimizeForLatency: true })
      this.config = new Uint8Array(event.data)
      this.needsKey = true
      return
    }
    if (this.decoder.state !== 'configured') throw new Error('视频帧早于解码配置')
    // Reset dependent frames together; resume only from a fresh key frame.
    if (this.decoder.decodeQueueSize >= 8) this.recoverBacklog()
    if (this.needsKey && !event.key) return
    if (event.timestamp > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('视频时间戳超出范围')
    const prefix = event.key ? this.config : new Uint8Array(0)
    const data = new Uint8Array(prefix.length + event.data.length)
    data.set(prefix); data.set(event.data, prefix.length)
    this.decoder.decode(new EncodedVideoChunk({
      type: event.key ? 'key' : 'delta', timestamp: Number(event.timestamp), data,
    }))
    this.needsKey = false
  }

  private recoverBacklog(): void {
    this.decoder.reset()
    this.decoder.configure({ codec: this.codec, optimizeForLatency: true })
    this.needsKey = true
    if (this.recoveryTimer !== undefined) return
    this.recoveryTimer = setTimeout(() => {
      this.close()
      this.onError(new Error('视频画面恢复超时，请重新连接'))
    }, 5000)
  }

  close(): void {
    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = undefined
    this.disposed = true
    if (this.paintId !== undefined) cancelAnimationFrame(this.paintId)
    this.paintId = undefined
    this.pendingFrame?.close()
    this.pendingFrame = undefined
    this.config = new Uint8Array(0)
    if (this.decoder.state !== 'closed') this.decoder.close()
  }
}
