import { mount } from '@vue/test-utils'
import { ElInput, ElInputNumber, ElSwitch } from 'element-plus'
import { expect, it } from 'vitest'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import StepActionForm from '../src/modules/maa/editor/StepActionForm.vue'
import { helpText } from './help-test-utils'

function numberInput(wrapper: ReturnType<typeof mount>, label: string) {
  const input = wrapper.findAllComponents(ElInputNumber)
    .find(component => component.find('input').attributes('aria-label') === label)
  if (!input) throw new Error('未找到带 aria-label 的数字输入框：' + label)
  return input
}

it('changes only the requested field without mutating resources or retry configuration', async () => {
  const step = { action: 'wait_image', template_base64: 'image', threshold: 0.85, failure_retry: { enabled: true }, image_branches: [{ branch: 'kept' }] }
    const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const threshold = wrapper.findAllComponents(ElInputNumber)
      .find(input => input.find('input').attributes('aria-label') === '图片匹配阈值')!
    threshold.vm.$emit('change', 0.9)
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, threshold: 0.9 }])
    expect(step.threshold).toBe(0.85)
  } finally { wrapper.unmount() }
})
it('shows the unified step timeout for custom nodes without silently writing defaults', async () => {
  const wrapper = mount(StepActionForm, { props: { step: { action: 'course_schedule', course_ticket_limit: 5 } } })
  try {
    expect(await helpText(wrapper, '自定义动作')).toContain('自定义动作保留原参数')
    expect(wrapper.text()).toContain('步骤超时（秒，最多4小时）')
    const timeout = wrapper.findComponent(ElInputNumber)
    expect(timeout.props('min')).toBe(0.1)
    expect(timeout.props('max')).toBe(14400)
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally { wrapper.unmount() }
})

it('explains that screenshot steps keep the original image in the current task', async () => {
  const wrapper = mount(StepActionForm, { props: { step: { action: 'screenshot' } } })
  try {
    expect(await helpText(wrapper, '截图')).toContain('执行时保存原图到当前任务，不自动向外发送。')
    expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(1)
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally { wrapper.unmount() }
})

it('shows literal OCR text controls with controlled defaults and no click budget fields', () => {
  const step = { action: 'wait_text', unknown_step_field: { keep: true } }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const text = wrapper.findAllComponents(ElInput)
      .find(input => input.find('input').attributes('aria-label') === '识别文字')!
    expect(text.props('modelValue')).toBe('')
    expect(text.props('maxlength')).toBe('200')
    expect(text.props('minlength')).toBe('1')
    expect(text.find('input').attributes('required')).toBeDefined()
    expect(numberInput(wrapper, '步骤超时').props('modelValue')).toBe(30)
    const poll = numberInput(wrapper, '文字识别间隔')
    expect(poll.props('modelValue')).toBe(1)
    expect(poll.props('min')).toBe(0.05)
    expect(poll.props('max')).toBe(10)
    expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(3)
    expect(wrapper.text()).toContain('按字面匹配')
    expect(wrapper.text()).not.toContain('点击次数')
    expect(wrapper.text()).not.toContain('点击间隔')

    text.vm.$emit('input', '登录')
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, text: '登录' }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('supports click_text without repeated-click parameters', async () => {
  const wrapper = mount(StepActionForm, { props: { step: { action: 'click_text', text: '确定' } } })
  try {
    expect(await helpText(wrapper, '文字识别')).toContain('点击第一个文字框中心')
    expect(wrapper.text()).not.toContain('点击次数')
    expect(wrapper.text()).not.toContain('点击间隔')
    expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(3)
  } finally { wrapper.unmount() }
})

it('edits an optional OCR search region immutably and preserves unknown step fields', () => {
  const step = {
    action: 'wait_text',
    text: '继续',
    search_region: { x: 4, y: 5, width: 100, height: 200 },
    unknown_step_field: 'keep',
  }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findComponent(ElSwitch).props('modelValue')).toBe(true)
    numberInput(wrapper, '搜索区域 X').vm.$emit('change', 12)
    expect(wrapper.emitted('change')?.[0]).toEqual([{
      ...step,
      search_region: { ...step.search_region, x: 12 },
    }])
    wrapper.findComponent(ElSwitch).vm.$emit('change', false)
    expect(wrapper.emitted('change')?.[1]).toEqual([{
      action: 'wait_text', text: '继续', unknown_step_field: 'keep',
    }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('creates OCR search-region defaults only after the user enables the region', () => {
  const step = { action: 'click_text', text: '确定', unknown: 'keep' }
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findComponent(ElSwitch).props('modelValue')).toBe(false)
    expect(step).toEqual({ action: 'click_text', text: '确定', unknown: 'keep' })
    wrapper.findComponent(ElSwitch).vm.$emit('change', true)
    expect(wrapper.emitted('change')?.[0]).toEqual([{
      ...step,
      search_region: { x: 0, y: 0, width: 1, height: 1 },
    }])
    expect(step).toEqual({ action: 'click_text', text: '确定', unknown: 'keep' })
  } finally { wrapper.unmount() }
})

it('shows launch force-stop default enabled without writing it into the step', () => {
  const step = { action: 'launch_app', package: 'com.example.app' }
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findComponent(ElSwitch).props('modelValue')).toBe(true)
    expect(step).toEqual({ action: 'launch_app', package: 'com.example.app' })
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally { wrapper.unmount() }
})

it('requires only coordinates for fixed clicks while keeping image-target selection', async () => {
  const wrapper = mount(StepActionForm, { props: { step: { action: 'wait_click', click_mode: 'fixed', click: { x: 2102, y: 928 } } } })
  try {
    expect(wrapper.findAllComponents(StepRegionField).some(field => field.props('use') === 'point')).toBe(false)
    expect(numberInput(wrapper, '固定点击 X 坐标').props('modelValue')).toBe(2102)
    expect(numberInput(wrapper, '固定点击 Y 坐标').props('modelValue')).toBe(928)
    await wrapper.setProps({ step: { action: 'wait_click', click_mode: 'image' } })
    expect(wrapper.findAllComponents(StepRegionField).some(field => field.props('use') === 'click')).toBe(true)
  } finally { wrapper.unmount() }
})
