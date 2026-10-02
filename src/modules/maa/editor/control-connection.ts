/** Fixed scrcpy subset. No text, clipboard, shell, or arbitrary ADB commands. */
export function keyPacket(action: 0 | 1, key: 3 | 4): ArrayBuffer {
  const packet = new ArrayBuffer(14)
  const view = new DataView(packet)
  view.setUint8(1, action)
  view.setUint32(2, key)
  return packet
}

export function touchPacket(action: 0 | 1 | 2, x: number, y: number, width: number, height: number): ArrayBuffer {
  if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1 || width > 8192 || height > 8192 || x < 0 || x >= width || y < 0 || y >= height) {
    throw new Error('触控坐标超出画面范围')
  }
  const packet = new ArrayBuffer(32)
  const view = new DataView(packet)
  view.setUint8(0, 2)
  view.setUint8(1, action)
  view.setInt32(10, x)
  view.setInt32(14, y)
  view.setUint16(18, width)
  view.setUint16(20, height)
  view.setUint16(22, action === 1 ? 0 : 65535)
  return packet
}

export function connectPhoneControl(url: string, onReady: () => void, onClosed: () => void) {
  const target = new URL(url)
  if (!['ws:', 'wss:'].includes(target.protocol) || target.username || target.password || (location.protocol === 'https:' && target.protocol !== 'wss:')) {
    throw new Error('控制通道不符合当前页面的安全要求')
  }
  const socket = new WebSocket(url)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    socket.onopen = socket.onclose = socket.onerror = null
    socket.close()
    onClosed()
  }
  socket.onopen = () => { if (!closed) onReady() }
  socket.onclose = socket.onerror = close
  return {
    close,
    send(packet: ArrayBuffer) {
      if (closed || socket.readyState !== WebSocket.OPEN) return
      // Never queue stale gestures across a slow or suspended connection.
      if (socket.bufferedAmount > 4096) { close(); return }
      socket.send(packet)
    },
  }
}
