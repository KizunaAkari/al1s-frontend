import { afterEach, expect, it, vi } from 'vitest'
import { readImportedScreenshot } from '../src/modules/maa/editor/imported-screenshot'

afterEach(() => vi.unstubAllGlobals())

it.each(['image/png', 'image/jpeg', 'image/webp'])('keeps original %s bytes and dimensions, then releases the bitmap', async type => {
  const close = vi.fn()
  const decode = vi.fn().mockResolvedValue({ width: 1600, height: 720, close })
  vi.stubGlobal('createImageBitmap', decode)
  const file = new File(['image'], 'failure.png', { type })
  expect(await readImportedScreenshot(file)).toEqual({ blob: file, width: 1600, height: 720 })
  expect(decode).toHaveBeenCalledWith(file)
  expect(close).toHaveBeenCalledOnce()
})
it.each(['image/svg+xml', 'text/plain', ''])('rejects unsupported file type %s before decoding', async type => {
  const decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  await expect(readImportedScreenshot(new File(['bad'], 'bad.png', { type }))).rejects.toThrow('PNG')
  expect(decode).not.toHaveBeenCalled()
})
it('rejects empty and oversized files without decoding', async () => {
  const decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  await expect(readImportedScreenshot(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow('为空')
  const large = new File(['x'], 'large.png', { type: 'image/png' })
  Object.defineProperty(large, 'size', { value: 16 * 1024 * 1024 + 1 })
  await expect(readImportedScreenshot(large)).rejects.toThrow('16')
  expect(decode).not.toHaveBeenCalled()
})
it.each([[0, 720], [8193, 720], [5000, 5000]])('rejects %i×%i and releases decoded resources', async (width, height) => {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
  await expect(readImportedScreenshot(new File(['image'], 'failure.png', { type: 'image/png' }))).rejects.toThrow('分辨率')
  expect(close).toHaveBeenCalledOnce()
})
it('reports corrupt data as a decode failure', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('invalid image data')))
  await expect(readImportedScreenshot(new File(['bad'], 'failure.png', { type: 'image/png' }))).rejects.toThrow('解码')
})
it('discards and releases a bitmap that finishes decoding after cancellation', async () => {
  const stop = new AbortController(), close = vi.fn()
  let finish!: (value: { width: number; height: number; close: () => void }) => void
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(resolve => { finish = resolve })))
  const pending = readImportedScreenshot(new File(['image'], 'failure.png', { type: 'image/png' }), stop.signal)
  stop.abort()
  finish({ width: 1600, height: 720, close })
  await expect(pending).rejects.toThrow('取消')
  expect(close).toHaveBeenCalledOnce()
})
