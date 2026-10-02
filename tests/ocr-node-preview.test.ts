import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WorkflowCanvas from '../src/modules/maa/editor/WorkflowCanvas.vue'
import { apiClient } from '../src/shared/api/client'

const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function canvas(step: Record<string, unknown> & { action: string }) {
  const wrapper = mount(WorkflowCanvas, { props: { steps: [step], selected: 0, disabled: false,
    scriptId: 'script', versionId: 'version' } })
  wrappers.push(wrapper); return wrapper
}
const ocr = { action: 'recognize_execute', recognition_mode: 'text', text: '剧情活动', threshold: 0.85,
  search_region: { x: 10, y: 20, width: 50, height: 30 },
  template_base64: { $blob: 'old-image' }, click_template_base64: { $blob: 'click-image' },
  region_previews: { ocr_region_base64: { $blob: 'ocr-region' } } }

it('shows the actual OCR region and target text instead of an unbound image or image threshold', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob(['png']) })
  const wrapper = canvas(ocr)
  await flushPromises()
  expect(wrapper.text()).toContain('OCR 文字')
  expect(wrapper.text()).toContain('剧情活动')
  expect(wrapper.text()).toContain('文字区域已绑定')
  expect(wrapper.text()).not.toContain('未绑定识别图片')
  expect(wrapper.find('[aria-label="图片匹配阈值"]').exists()).toBe(false)
  expect(wrapper.find('.node-image img').exists()).toBe(true)
  expect(get.mock.calls.map(call => call[0])).toEqual(['/maa/scripts/script/versions/version/images/ocr-region'])
  expect(wrapper.emitted('edit')).toBeUndefined()
  await wrapper.setProps({ steps: [{ ...ocr, recognition_mode: 'image' }] })
  await flushPromises()
  expect(wrapper.text()).toContain('图片匹配')
  expect(wrapper.find('[aria-label="图片匹配阈值"]').exists()).toBe(true)
  expect(get.mock.calls.at(-1)?.[0]).toContain('/old-image')
})

it.each(['wait_text', 'click_text'])('retains inline text editing while previewing the region for %s', async action => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob(['png']) })
  const wrapper = canvas({ ...ocr, action })
  await flushPromises()
  expect(wrapper.text()).toContain('OCR 文字')
  expect(wrapper.find('.node-image img').exists()).toBe(true)
  await wrapper.get('[aria-label="识别文字"]').setValue('领取')
  expect(wrapper.emitted('edit')?.[0]?.[1]).toEqual({ ...ocr, action, text: '领取' })
  expect(get).toHaveBeenCalledTimes(1)
})

it('distinguishes fullscreen, old region without preview, and missing target text', async () => {
  const get = vi.spyOn(apiClient, 'get')
  const wrapper = canvas({ action: 'recognize_execute', recognition_mode: 'text', text: '剧情活动',
    region_previews: ocr.region_previews })
  await flushPromises()
  expect(wrapper.text()).toContain('全屏文字识别')
  expect(get).not.toHaveBeenCalled()
  await wrapper.setProps({ steps: [{ action: 'recognize_execute', recognition_mode: 'text', search_region: ocr.search_region }] })
  expect(wrapper.text()).toContain('暂无选区图片')
  expect(wrapper.text()).toContain('未设置识别文字')
})
