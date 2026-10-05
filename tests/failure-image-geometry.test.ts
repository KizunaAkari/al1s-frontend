import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import FailureImage from '../src/modules/tasks/FailureImage.vue'
import { apiClient } from '../src/shared/api/client'
import type { FailureDetail } from '../src/shared/api/task-details'

afterEach(() => vi.restoreAllMocks())

async function image(width = 2400) {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob(['png']) })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const detail = { screenshot_id: 'image', click_x: null, click_y: null, recognition_geometry: {
    template_rect: { x: 2064, y: 108, width: 99, height: 84 }, search_region: null,
    match_rect: { x: 2100, y: 110, width: 99, height: 84 }, match_score: .724205,
    match_threshold: .85, match_passed: false, basis_size: { width: 2400, height: 1080 },
    match_size: { width: 2400, height: 1080 },
  } } as unknown as FailureDetail
  const wrapper = mount(FailureImage, { props: { task: 'task', attempt: 'attempt', detail } })
  await flushPromises()
  Object.defineProperties(wrapper.find('img').element, { naturalWidth: { value: width }, naturalHeight: { value: 1080 } })
  await wrapper.find('img').trigger('load')
  return wrapper
}

it('overlays expected and candidate rectangles with original pixel percentages', async () => {
  const wrapper = await image()
  expect(wrapper.find('[data-template-rect]').attributes('style')).toContain('left: 86%')
  expect(wrapper.find('[data-match-rect]').attributes('style')).toContain('left: 87.5%')
  expect(wrapper.text()).toContain('未通过阈值')
  expect(wrapper.text()).toContain('全图搜索')
  expect(wrapper.text()).toContain('36')
  await wrapper.find('input[type="checkbox"]').setValue(false)
  expect(wrapper.find('[data-template-rect]').exists()).toBe(false)
  expect(wrapper.find('[data-match-rect]').exists()).toBe(false)
  expect(wrapper.find('img').exists()).toBe(true)
  expect(vi.mocked(apiClient.get).mock.calls[0]![1]).toMatchObject({ params: { preview: true } })
})

it('does not rescale coordinates onto a different-sized screenshot', async () => {
  const wrapper = await image(1600)
  expect(wrapper.find('[data-template-rect]').exists()).toBe(false)
  expect(wrapper.find('[data-match-rect]').exists()).toBe(false)
  expect(wrapper.text()).toContain('尺寸不一致')
})
