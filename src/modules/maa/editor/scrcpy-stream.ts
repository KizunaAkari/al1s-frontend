/** Pinned scrcpy 3.3.4 stream framing, independent of WebSocket message boundaries. */
export type VideoEvent =
  | { kind: 'metadata'; width: number; height: number }
  | { kind: 'packet'; config: boolean; key: boolean; timestamp: bigint; data: Uint8Array }

const MAX_PACKET = 4 * 1024 * 1024
const MAX_EDGE = 2400

export class ScrcpyStream {
  private buffer = new Uint8Array(12)
  private used = 0
  private phase: 'metadata' | 'header' | 'payload' = 'metadata'
  private flags = 0n
  private failed = false

  /** Callback consumes each packet synchronously; no unbounded output queue. */
  push(input: Uint8Array, consume: (event: VideoEvent) => void): void {
    if (this.failed) throw new Error('视频连接已失效，请重新连接')
    try {
      let offset = 0
      while (offset < input.length) {
        const count = Math.min(this.buffer.length - this.used, input.length - offset)
        this.buffer.set(input.subarray(offset, offset + count), this.used)
        this.used += count
        offset += count
        if (this.used === this.buffer.length) this.complete(consume)
      }
    } catch (error) {
      this.failed = true
      this.buffer = new Uint8Array(0)
      throw error
    }
  }

  finish(): void {
    if (this.failed || this.phase !== 'header' || this.used !== 0) {
      this.failed = true
      this.buffer = new Uint8Array(0)
      throw new Error('视频流不完整')
    }
    this.failed = true
  }

  private complete(consume: (event: VideoEvent) => void): void {
    const view = new DataView(this.buffer.buffer)
    if (this.phase === 'metadata') {
      const width = view.getUint32(4), height = view.getUint32(8)
      if (view.getUint32(0) !== 0x68323634 || !width || !height || width > MAX_EDGE || height > MAX_EDGE) {
        throw new Error('不支持的视频格式或尺寸')
      }
      this.phase = 'header'
      consume({ kind: 'metadata', width, height })
    } else if (this.phase === 'header') {
      this.flags = view.getBigUint64(0)
      const length = view.getUint32(8)
      if (!length || length > MAX_PACKET) throw new Error('视频帧长度超出限制')
      this.buffer = new Uint8Array(length)
      this.phase = 'payload'
    } else {
      const data = this.buffer
      this.buffer = new Uint8Array(12)
      this.phase = 'header'
      consume({ kind: 'packet', config: Boolean(this.flags & (1n << 63n)),
        key: Boolean(this.flags & (1n << 62n)), timestamp: this.flags & ((1n << 62n) - 1n), data })
    }
    this.used = 0
  }
}
