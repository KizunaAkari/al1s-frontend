import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useEditorScreenshot } from '../src/modules/maa/editor/use-editor-screenshot'
import type { NativeScreenshot } from '../src/modules/maa/editor/screenshot-connection'

const read = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
vi.mock('../src/modules/maa/editor/imported-screenshot', () => ({ readImportedScreenshot: read }))
vi.mock('../src/modules/maa/editor/screenshot-connection', () => ({ capturePhoneScreenshot: capture }))
const image = { blob: new Blob(['file']), width: 1600, height: 720 }

function harness() {
  const focus = ref('script:step:device'), landscape = ref(false), open = ref(true), url = ref<string>()
  const size = ref<{ width: number; height: number }>()
  const live = vi.fn(), screenshot = vi.fn()
  let session!: ReturnType<typeof useEditorScreenshot>
  const wrapper = mount(defineComponent({ setup() {
    session = useEditorScreenshot({ url: () => url.value, landscape: () => landscape.value,
      focus: () => focus.value, configurable: () => open.value, blocked: () => false,
      screenSize: () => size.value, showLive: live, showScreenshot: screenshot })
    return () => null
  } }))
  return { wrapper, session, focus, landscape, open, url, size, live, screenshot }
}
afterEach(() => { read.mockReset(); capture.mockReset() })

it('imports offline using the same screenshot reference without a phone request', async () => {
  const h = harness()
  try {
    read.mockResolvedValue(image)
    const file = new File(['file'], 'failed-step-04.png', { type: 'image/png' })
    expect(await h.session.importScreenshot(file)).toBe(true)
    expect(h.session.screenshot.value).toEqual(image)
    expect(h.session.importedName.value).toBe('failed-step-04.png')
    expect(h.screenshot).toHaveBeenCalledOnce()
    expect(capture).not.toHaveBeenCalled()
  } finally { h.wrapper.unmount() }
})
it('keeps a local frame independent of phone transport connection changes', async () => {
  const h = harness()
  try {
    read.mockResolvedValue(image)
    await h.session.importScreenshot(new File(['file'], 'failure.png', { type: 'image/png' }))
    h.url.value = 'wss://phone/new-session/screenshot'; await nextTick()
    expect(h.session.screenshot.value).toEqual(image)
    h.url.value = undefined; await nextTick()
    expect(h.session.screenshot.value).toEqual(image)
    expect(h.session.importedName.value).toBe('failure.png')
  } finally { h.wrapper.unmount() }
})
it('allows file decoding to finish when the same phone reconnects during import', async () => {
  const h = harness()
  try {
    let finish!: (image: NativeScreenshot) => void
    read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.session.importScreenshot(new File(['file'], 'failure.png', { type: 'image/png' }))
    h.url.value = 'wss://phone/new-session/screenshot'; await nextTick()
    finish(image)
    expect(await pending).toBe(true)
    expect(h.session.screenshot.value).toEqual(image)
  } finally { h.wrapper.unmount() }
})
it('does not retain an invalidated phone frame when a pending file import fails', async () => {
  const h = harness()
  try {
    h.url.value = 'wss://phone/old-session/screenshot'; await nextTick()
    capture.mockResolvedValue(image)
    await h.session.openScreenshot()
    let fail!: () => void
    read.mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error('图片解码失败')) }))
    const pending = h.session.importScreenshot(new File(['file'], 'bad.png', { type: 'image/png' }))
    h.url.value = 'wss://phone/new-session/screenshot'; await nextTick()
    fail(); await pending
    expect(h.session.screenshot.value).toBeUndefined()
    expect(h.session.captureError.value).toContain('解码')
  } finally { h.wrapper.unmount() }
})
it('keeps the prior image when an import is corrupt or has incompatible original dimensions', async () => {
  const h = harness()
  try {
    h.size.value = { width: 1600, height: 720 }
    read.mockResolvedValueOnce(image).mockRejectedValueOnce(new Error('图片解码失败'))
      .mockResolvedValueOnce({ ...image, width: 720, height: 1600 })
    const file = new File(['file'], 'failure.png', { type: 'image/png' })
    await h.session.importScreenshot(file)
    expect(await h.session.importScreenshot(file)).toBe(false)
    expect(h.session.screenshot.value).toEqual(image)
    expect(h.session.captureError.value).toContain('解码')
    expect(await h.session.importScreenshot(file)).toBe(false)
    expect(h.session.captureError.value).toContain('1600×720')
    expect(h.session.screenshot.value).toEqual(image)
    expect(h.session.importedName.value).toBe('failure.png')
  } finally { h.wrapper.unmount() }
})
it.each(['focus', 'landscape', 'close', 'unmount'])('discards late decoding after %s changes', async change => {
  const h = harness()
  let finish!: (image: NativeScreenshot) => void
  read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = h.session.importScreenshot(new File(['file'], 'failure.png', { type: 'image/png' }))
  if (change === 'focus') h.focus.value = 'another:step:device'
  else if (change === 'landscape') h.landscape.value = true
  else if (change === 'close') h.open.value = false
  else h.wrapper.unmount()
  await nextTick()
  finish(image)
  expect(await pending).toBe(false)
  expect(h.session.screenshot.value).toBeUndefined()
  expect(h.session.importedName.value).toBeUndefined()
  expect(h.screenshot).not.toHaveBeenCalled()
  if (change !== 'unmount') h.wrapper.unmount()
})
it('rejects changed dimensions while decoding and accepts repeated selection of the same file', async () => {
  const h = harness()
  try {
    let finish!: (image: NativeScreenshot) => void
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(image)
    const file = new File(['file'], 'failure.png', { type: 'image/png' })
    const pending = h.session.importScreenshot(file)
    h.size.value = { width: 720, height: 1600 }
    finish(image)
    expect(await pending).toBe(false)
    h.size.value = { width: 1600, height: 720 }
    expect(await h.session.importScreenshot(file)).toBe(true)
    expect(await h.session.importScreenshot(file)).toBe(true)
    expect(read).toHaveBeenCalledTimes(3)
    await flushPromises()
  } finally { h.wrapper.unmount() }
})
