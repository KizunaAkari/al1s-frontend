import { mount } from '@vue/test-utils'
import { ElAlert, ElInputNumber, ElOption, ElSelect } from 'element-plus'
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

it('offers the three editable click modes and changes only click_mode', () => {
  const step = {
    action: 'wait_click',
    click_mode: 'match_center',
    click: { x: 12, y: 34, unknown_click_field: 'keep' },
    click_count: 4,
    click_interval_ms: 200,
    unknown_step_field: { keep: true },
  }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const select = wrapper.findComponent(ElSelect)
    expect(select.props('modelValue')).toBe('match_center')
    expect(select.findAllComponents(ElOption).map(option => option.props('value')))
      .toEqual(expect.arrayContaining(['match_center', 'fixed', 'image']))

    select.vm.$emit('change', 'fixed')
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, click_mode: 'fixed' }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('shows terminal defaults without writing them into the step', () => {
  const step = { action: 'wait_click' }
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findComponent(ElSelect).props('modelValue')).toBe('fixed')
    expect(numberInput(wrapper, '固定点击 X 坐标').props('max')).toBe(8191)
    expect(numberInput(wrapper, '固定点击 Y 坐标').props('max')).toBe(8191)
    expect(wrapper.findComponent(ElAlert).exists()).toBe(false)
    expect(step).toEqual({ action: 'wait_click' })
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally { wrapper.unmount() }

  const imageWrapper = mount(StepActionForm, { props: { step: { action: 'wait_click', click_mode: 'image' } } })
  try {
    expect(numberInput(imageWrapper, '图片点击阈值').props('min')).toBe(0.000001)
  } finally { imageWrapper.unmount() }
})

it('displays existing match_offset and color_marker modes without replacing them', async () => {
  for (const mode of ['match_offset', 'color_marker']) {
    const step = { action: 'wait_click', click_mode: mode, mode_specific: { keep: true } }
    const wrapper = mount(StepActionForm, { props: { step } })
    try {
      if (mode === 'color_marker') {
        expect(wrapper.text()).toContain('颜色标记循环')
        expect(wrapper.findComponent(ElSelect).exists()).toBe(false)
      } else {
        expect(wrapper.findComponent(ElSelect).props('modelValue')).toBe(mode)
        expect(await helpText(wrapper, '点击模式')).toContain(mode)
      }
      expect(wrapper.emitted('change')).toBeUndefined()
      expect(step).toEqual({ action: 'wait_click', click_mode: mode, mode_specific: { keep: true } })
    } finally { wrapper.unmount() }
  }
})

it('shows click count and interval defaults, preserves fields, and keeps large values intact', async () => {
  const step = { action: 'wait_click', unknown_step_field: 'keep' }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const count = numberInput(wrapper, '点击次数')
    const interval = numberInput(wrapper, '点击间隔（毫秒）')
    expect(count.props('modelValue')).toBe(1)
    expect(count.props('min')).toBe(1)
    expect(interval.props('modelValue')).toBe(120)
    expect(interval.props('min')).toBe(0)
    expect(interval.props('max')).toBe(3600000)
    const clickHelp = await helpText(wrapper, '点击设置')
    expect(clickHelp).toContain('连击受步骤剩余时间限制')
    expect(clickHelp).toContain('遇到失败或取消停止')
    expect(clickHelp).toContain('独立规则处理期间暂停该步骤计时')

    count.vm.$emit('change', 1000001)
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, click_count: 1000001 }])
    interval.vm.$emit('change', 25000)
    expect(wrapper.emitted('change')?.[1]).toEqual([{ ...step, click_interval_ms: 25000 }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('updates fixed coordinates while preserving unknown click fields and props', () => {
  const step = {
    action: 'wait_click',
    click_mode: 'fixed',
    click: { x: 10, y: 20, unknown_click_field: { keep: true } },
    click_count: 2,
    click_interval_ms: 100,
    unknown_step_field: 'keep',
  }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    numberInput(wrapper, '固定点击 X 坐标').vm.$emit('change', 100)
    expect(wrapper.emitted('change')?.[0]).toEqual([{
      ...step,
      click: { ...step.click, x: 100 },
    }])
    numberInput(wrapper, '固定点击 Y 坐标').vm.$emit('change', 200)
    expect(wrapper.emitted('change')?.[1]).toEqual([{
      ...step,
      click: { ...step.click, y: 200 },
    }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('edits click wait and image threshold within their bounds without adding budget fields', () => {
  const step = {
    action: 'wait_click',
    click_mode: 'image',
    click_template_base64: 'bound-template',
    click_threshold: 0.8,
    wait_after_click_seconds: 2,
    click_count: 3,
    click_interval_ms: 100,
    other: 'keep',
  }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const wait = numberInput(wrapper, '点击后等待秒数')
    const threshold = numberInput(wrapper, '图片点击阈值')
    expect(wait.props('min')).toBe(0)
    expect(wait.props('max')).toBe(300)
    expect(threshold.props('min')).toBe(0.000001)
    expect(threshold.props('max')).toBe(1)

    wait.vm.$emit('change', 12)
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, wait_after_click_seconds: 12 }])
    threshold.vm.$emit('change', 0.95)
    expect(wrapper.emitted('change')?.[1]).toEqual([{ ...step, click_threshold: 0.95 }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('warns for image mode without a template and does not invent a resource', () => {
  const step = { action: 'wait_click', click_mode: 'image', custom: 'keep' }
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findAllComponents(StepRegionField).find(field => field.props('use') === 'click')?.props()).toMatchObject({ title: '点击图片', bound: false })
    expect(step).not.toHaveProperty('click_template_base64')
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally { wrapper.unmount() }
})

it('keeps the existing recognition form for wait_image steps', () => {
  const step = {
    action: 'wait_image',
    template_base64: 'image',
    threshold: 0.85,
    timeout_seconds: 20,
    poll_interval_seconds: 1,
    failure_retry: { enabled: true },
    unknown: 'keep',
  }
  const before = structuredClone(step)
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    expect(wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(4)
    numberInput(wrapper, '图片匹配阈值').vm.$emit('change', 0.9)
    expect(wrapper.emitted('change')?.[0]).toEqual([{ ...step, threshold: 0.9 }])
    expect(step).toEqual(before)
  } finally { wrapper.unmount() }
})

it('does not add click controls to other actions', () => {
  const wrapper = mount(StepActionForm, { props: { step: { action: 'feedback', message: 'keep' } } })
  try {
    expect(wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(wrapper.text()).toContain('反馈内容')
  } finally { wrapper.unmount() }
})
