import { flushPromises, mount } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WorkflowCanvas from '../src/modules/maa/editor/WorkflowCanvas.vue'
import StepActionForm from '../src/modules/maa/editor/StepActionForm.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import { apiClient } from '../src/shared/api/client'

const marker = { action: 'wait_click', click_mode: 'color_marker',
  template_base64: { $blob: 'coffee-compatibility' }, threshold: .85,
  match_anchor: 'top_right', match_offset_x: 45, match_offset_y: 110,
  match_max_clicks: 32, marker_absence_checks: 6,
  marker_hsv_lower: [10, 160, 200], marker_hsv_upper: [40, 255, 255],
  search_region: { x: 250, y: 220, width: 2110, height: 660 },
  poll_interval_seconds: 1, timeout_seconds: 120, wait_after_click_seconds: 1.1,
  failure_retry: { enabled: true, process_script_id: 'refresh', max_retries: 2 } }
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('shows the color loop rather than loading the compatibility coffee image', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob(['png']) })
  const wrapper = mount(WorkflowCanvas, { props: { steps: [marker], selected: 0,
    disabled: false, scriptId: 'script', versionId: 'version' } })
  wrappers.push(wrapper); await flushPromises()
  expect(wrapper.find('.node-title').text()).toContain('颜色标记循环')
  expect(wrapper.text()).toContain('每次点击后重新识别')
  expect(wrapper.text()).toContain('连续无标记后结束')
  expect(wrapper.text()).toContain('点击上限：32')
  expect(wrapper.find('[aria-label="图片匹配阈值"]').exists()).toBe(false)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(get).not.toHaveBeenCalled()
  expect(wrapper.emitted('edit')).toBeUndefined()
  await wrapper.setProps({ steps: [{ ...marker, click_mode: 'match_center' }] })
  await flushPromises()
  expect(wrapper.text()).toContain('图片匹配')
  expect(wrapper.find('[aria-label="图片匹配阈值"]').exists()).toBe(true)
  expect(get.mock.calls.at(-1)?.[0]).toContain('/images/coffee-compatibility')
})

it('shows meaningful loop settings and preserves every specialized field when timing is edited', () => {
  const before = structuredClone(marker)
  const wrapper = mount(StepActionForm, { props: { step: marker } })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('颜色标记循环')
  expect(wrapper.text()).toContain('连续无标记后结束')
  expect(wrapper.text()).not.toContain('图片匹配阈值')
  expect(wrapper.text()).not.toContain('点击次数')
  expect(wrapper.text()).not.toContain('点击间隔（毫秒）')
  expect(wrapper.findComponent(StepRegionField).exists()).toBe(false)
  const poll = wrapper.findAllComponents(ElInputNumber)
    .find(input => input.find('input').attributes('aria-label') === '识别间隔')!
  expect(poll).toBeDefined()
  expect(wrapper.emitted('change')).toBeUndefined()
  poll.vm.$emit('change', 2)
  expect(wrapper.emitted('change')?.[0]).toEqual([{ ...marker, poll_interval_seconds: 2 }])
  expect(marker).toEqual(before)
})

it('makes the OCR operation visible in its node title without adding persisted fields', () => {
  const step = { action: 'recognize_execute', recognition_mode: 'text', text: '编辑模式' }
  const wrapper = mount(WorkflowCanvas, { props: { steps: [step], selected: 0,
    disabled: false, scriptId: 'script' } })
  wrappers.push(wrapper)
  expect(wrapper.find('.node-title').text()).toContain('编辑模式')
  expect(wrapper.emitted('edit')).toBeUndefined()
  expect(step).toEqual({ action: 'recognize_execute', recognition_mode: 'text', text: '编辑模式' })
})
