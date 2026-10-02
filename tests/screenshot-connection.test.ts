import { afterEach, expect, it, vi } from 'vitest'
import { capturePhoneScreenshot } from '../src/modules/maa/editor/screenshot-connection'

function setup() {
  const socket = { close: vi.fn(), send: vi.fn(), onmessage: null as null | ((e: { data: unknown }) => void),
    onclose: null as null | (() => void), onerror: null as null | (() => void) }
  vi.stubGlobal('WebSocket', class { constructor() { return socket } })
  vi.stubGlobal('location', { protocol: 'https:' })
  return socket
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('refuses insecure channels', async () => {
  setup()
  await expect(capturePhoneScreenshot('ws://phone/screenshot')).rejects.toThrow('WSS')
})
it('receives native dimensions without sending input', async () => {
  const socket = setup()
  const promise = capturePhoneScreenshot('wss://phone/screenshot')
  const data = new Uint8Array(33)
  data.set([137, 80, 78, 71, 13, 10, 26, 10])
  data.set([73, 72, 68, 82], 12)
  const view = new DataView(data.buffer)
  view.setUint32(16, 2400); view.setUint32(20, 1080)
  socket.onmessage!({ data: data.buffer })
  expect(await promise).toMatchObject({ width: 2400, height: 1080 })
  expect(socket.send).not.toHaveBeenCalled()
  expect(socket.close).toHaveBeenCalledOnce()
})
it('rejects unexpected data and releases the connection', async () => {
  const socket = setup()
  const result = capturePhoneScreenshot('wss://phone/screenshot')
  socket.onmessage!({ data: 'not a PNG' })
  await expect(result).rejects.toThrow('大小')
  expect(socket.close).toHaveBeenCalledOnce()
})
it('cancels pending capture when device changes', async () => {
  const socket = setup(), abort = new AbortController()
  const result = capturePhoneScreenshot('wss://phone/screenshot', abort.signal)
  abort.abort()
  await expect(result).rejects.toThrow('取消')
  expect(socket.close).toHaveBeenCalledOnce()
})
it('has a bounded timeout and never retries automatically', async () => {
  vi.useFakeTimers()
  const socket = setup()
  const result = capturePhoneScreenshot('wss://phone/screenshot')
  const check = expect(result).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(15000)
  await check
  expect(socket.close).toHaveBeenCalledOnce()
})
