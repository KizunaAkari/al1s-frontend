export type NativeScreenshot = { blob: Blob; width: number; height: number }

/** One receive-only, size-bounded native PNG. Never reuse a compressed video frame. */
export function capturePhoneScreenshot(url: string, signal?: AbortSignal): Promise<NativeScreenshot> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    if (!['ws:', 'wss:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
      throw new Error('无效的截图通道地址')
    }
    if (location.protocol === 'https:' && target.protocol !== 'wss:') throw new Error('截图通道必须使用WSS')
    if (signal?.aborted) throw new Error('截图已取消')
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    let finished = false
    const finish = (error?: Error, result?: NativeScreenshot) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
      if (error) reject(error)
      else resolve(result!)
    }
    const abort = () => finish(new Error('截图已取消'))
    const timer = setTimeout(() => finish(new Error('截图超时，请检查手机连接后重试')), 15000)
    signal?.addEventListener('abort', abort, { once: true })
    socket.onerror = () => finish(new Error('截图连接失败，请检查终端地址与证书'))
    socket.onclose = () => finish(new Error('未收到完整截图，终端可能尚不支持此功能'))
    socket.onmessage = event => {
      try {
        const data = event.data
        if (!(data instanceof ArrayBuffer) || data.byteLength < 33 || data.byteLength > 16 * 1024 * 1024) throw new Error('截图大小无效')
        const bytes = new Uint8Array(data)
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
          || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('截图不是PNG')
        const view = new DataView(data)
        const width = view.getUint32(16), height = view.getUint32(20)
        if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('截图分辨率超出限制')
        finish(undefined, { blob: new Blob([data], { type: 'image/png' }), width, height })
      } catch (e) { finish(e instanceof Error ? e : new Error('截图无效')) }
    }
  })
}
