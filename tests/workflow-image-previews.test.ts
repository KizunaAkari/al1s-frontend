import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, provide, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WorkflowCanvas from '../src/modules/maa/editor/WorkflowCanvas.vue'
import CanvasNodeImage from '../src/modules/maa/editor/CanvasNodeImage.vue'
import { ApiError, apiClient } from '../src/shared/api/client'
import { regionPreviewsKey, useRegionPreviews } from '../src/modules/maa/editor/use-region-previews'

const blob = new Blob(['png'])
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${Math.random()}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})
function canvas(ids: string[]) {
  const wrapper = mount(WorkflowCanvas, { props: {
    scriptId: 'script', versionId: 'version', selected: 0, disabled: false,
    steps: ids.map(id => ({ action: 'recognize_execute', template_base64: { $blob: id } })),
  } })
  wrappers.push(wrapper)
  return wrapper
}

it('shows a locally uploaded image before the first saved version exists', async () => {
  const get = vi.spyOn(apiClient, 'get')
  const wrapper = mount(defineComponent({ setup() {
    const previews = useRegionPreviews(() => 'script', () => undefined)
    previews.remember({ $blob: 'new' } as never, blob)
    provide(regionPreviewsKey, previews)
    return () => h(WorkflowCanvas, { scriptId: 'script', selected: 0, disabled: false,
      steps: [{ action: 'wait_image', template_base64: { $blob: 'new' } }] })
  } }))
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find('.node-image img').exists()).toBe(true)
  expect(get).not.toHaveBeenCalled()
})

it('shows three simultaneous nodes through one FIFO queue within the two-request API limit', async () => {
  let active = 0, maximum = 0
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async () => {
    if (active === 2) throw new ApiError('busy', { code: 'image_busy', status: 429 })
    maximum = Math.max(maximum, ++active)
    await Promise.resolve()
    active--
    return { data: blob } as never
  })
  const wrapper = canvas(['a', 'b', 'c', 'a'])
  await flushPromises()
  expect(wrapper.findAll('.node-image img')).toHaveLength(4)
  expect(wrapper.text()).not.toContain('图片读取失败')
  expect(maximum).toBe(1)
  expect(get.mock.calls.map(call => call[0])).toEqual(['a', 'b', 'c'].map(id =>
    `/maa/scripts/script/versions/version/images/${id}`))
})

it('recovers a transient 429 before declaring a node failed', async () => {
  vi.useFakeTimers()
  const get = vi.spyOn(apiClient, 'get')
    .mockRejectedValueOnce(new ApiError('busy', { code: 'image_busy', status: 429 }))
    .mockResolvedValue({ data: blob })
  const wrapper = canvas(['a'])
  await flushPromises()
  expect(wrapper.text()).not.toContain('图片读取失败')
  await vi.advanceTimersByTimeAsync(200)
  await flushPromises()
  expect(wrapper.find('.node-image img').exists()).toBe(true)
  expect(get).toHaveBeenCalledTimes(2)
})

it('shares the editor cache with nodes and leaves URL disposal to the owner', async () => {
  const { regionPreviewsKey } = await import('../src/modules/maa/editor/use-region-previews')
  const show = ref(true)
  let previews!: ReturnType<typeof useRegionPreviews>
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: blob })
  const wrapper = mount(defineComponent({
    setup() {
      previews = useRegionPreviews(() => 'script', () => 'version')
      provide(regionPreviewsKey, previews)
      return () => show.value ? h(WorkflowCanvas, {
        scriptId: 'script', versionId: 'version', selected: 0, disabled: false,
        steps: [{ action: 'wait_image', template_base64: { $blob: 'a' } }],
      }) : h('div')
    },
  }))
  wrappers.push(wrapper)
  const url = await previews.load({ $blob: 'a' })
  await flushPromises()
  expect(wrapper.get('.node-image img').attributes('src')).toBe(url)
  expect(get).toHaveBeenCalledTimes(1)
  show.value = false
  await flushPromises()
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  expect(await previews.load({ $blob: 'a' })).toBe(url)
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
})

it('waits for visibility and ignores old version replies', async () => {
  const callbacks: IntersectionObserverCallback[] = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { callbacks.push(callback) }
    observe() {}
    disconnect() {}
  })
  let finish!: (value: { data: Blob }) => void
  const get = vi.spyOn(apiClient, 'get')
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve }) as never)
    .mockResolvedValue({ data: blob })
  const wrapper = canvas(['a'])
  await flushPromises()
  expect(get).not.toHaveBeenCalled()
  callbacks[0]!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
  await wrapper.setProps({ versionId: 'next' })
  callbacks[1]!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
  finish({ data: blob })
  await flushPromises()
  expect(wrapper.findAllComponents(CanvasNodeImage)).toHaveLength(1)
  expect(wrapper.find('.node-image img').exists()).toBe(true)
  expect(get.mock.calls[1]?.[0]).toContain('/versions/next/')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
})
