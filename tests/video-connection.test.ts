import { afterEach, expect, it, vi } from 'vitest'
import { connectPhoneVideo } from '../src/modules/maa/editor/video-connection'

const decoder = vi.hoisted(() => ({ close: vi.fn(), accept: vi.fn() }))
vi.mock('../src/modules/maa/editor/video-decoder', () => ({ PhoneVideoDecoder: class {
  constructor() { return decoder }
} }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers() })

it('does not report ready for an open socket without a decoded frame', () => {
  vi.useFakeTimers()
  vi.stubGlobal('location', { protocol: 'https:' })
  const socket = { close: vi.fn() }
  vi.stubGlobal('WebSocket', class { constructor() { return socket } })
  const error = vi.fn(), ready = vi.fn()
  connectPhoneVideo('wss://terminal/video', {} as HTMLCanvasElement, error, ready)
  expect(ready).not.toHaveBeenCalled()
  vi.advanceTimersByTime(15000)
  expect(error).toHaveBeenCalledOnce()
  expect(socket.close).toHaveBeenCalledOnce()
  expect(ready).not.toHaveBeenCalled()
})

it('does not downgrade an HTTPS page to insecure video', () => {
  vi.stubGlobal('location', { protocol: 'https:' })
  expect(() => connectPhoneVideo('ws://terminal/video', {} as HTMLCanvasElement, vi.fn())).toThrow('WSS')
})

it('closes decoder and socket on invalid data without sending anything', () => {
  vi.stubGlobal('location', { protocol: 'http:' })
  const socket = { close: vi.fn(), send: vi.fn(), onmessage: null as null | ((e: { data: unknown }) => void) }
  vi.stubGlobal('WebSocket', class { constructor() { return socket } })
  const error = vi.fn()
  const close = connectPhoneVideo('ws://terminal/video', {} as HTMLCanvasElement, error)
  socket.onmessage!({ data: 'not video' })
  close()
  expect(error).toHaveBeenCalledOnce()
  expect(socket.close).toHaveBeenCalledOnce()
  expect(decoder.close).toHaveBeenCalledOnce()
  expect(socket.send).not.toHaveBeenCalled()
})
