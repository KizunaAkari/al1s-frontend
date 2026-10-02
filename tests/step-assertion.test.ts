import { mount } from '@vue/test-utils'
import { ElInput, ElInputNumber, ElSelect, ElSwitch } from 'element-plus'
import { expect, it } from 'vitest'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import StepAssertionForm from '../src/modules/maa/editor/StepAssertionForm.vue'

it('blocks enabling without a bound assertion image', () => {
  const step = { action: 'wait_image', post_assertion: { enabled: false, custom: 'keep' } }
  const wrapper = mount(StepAssertionForm, { props: { step } })
  try {
    const toggle = wrapper.findComponent(ElSwitch)
    expect(toggle.props('disabled')).toBe(true)
    toggle.vm.$emit('change', true)
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.getComponent(StepRegionField).props()).toMatchObject({ use: 'assertion', title: '断言图片' })
  } finally { wrapper.unmount() }
})

it('fills assertion defaults only when enabling a bound assertion image', () => {
  const step = {
    action: 'wait_image',
    post_assertion: { enabled: false, template_base64: 'bound-image', custom: 'keep' },
  }
  const wrapper = mount(StepAssertionForm, { props: { step } })
  try {
    wrapper.findComponent(ElSwitch).vm.$emit('change', true)
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      ...step,
      post_assertion: {
        enabled: true,
        template_base64: 'bound-image',
        custom: 'keep',
        threshold: 0.85,
        timeout_seconds: 20,
        poll_interval_seconds: 1,
        max_retries: 1,
      },
    })
    expect(step.post_assertion).toEqual({ enabled: false, template_base64: 'bound-image', custom: 'keep' })
  } finally { wrapper.unmount() }
})

it('allows disabling and preserves the assertion template and unknown fields', () => {
  const step = {
    action: 'wait_image',
    post_assertion: {
      enabled: true,
      template_base64: 'bound-image',
      template_rect: { x: 1, y: 2, width: 3, height: 4 },
      custom: { value: 'keep' },
      threshold: 0.9,
      timeout_seconds: 30,
      poll_interval_seconds: 0.5,
      max_retries: 2,
    },
  }
  const wrapper = mount(StepAssertionForm, { props: { step } })
  try {
    wrapper.findComponent(ElSwitch).vm.$emit('change', false)
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      ...step,
      post_assertion: { ...step.post_assertion, enabled: false },
    })
    expect(step.post_assertion.enabled).toBe(true)
  } finally { wrapper.unmount() }
})

it('changes only the selected parameter without losing fields or mutating props', () => {
  const step = {
    action: 'wait_image',
    other: { untouched: true },
    post_assertion: {
      enabled: true,
      template_base64: { $blob: 'bound-resource' },
      template_rect: { x: 1, y: 2, width: 3, height: 4 },
      threshold: 0.85,
      timeout_seconds: 20,
      poll_interval_seconds: 1,
      max_retries: 1,
      custom: 'keep',
    },
  }
  const original = structuredClone(step)
  const wrapper = mount(StepAssertionForm, { props: { step } })
  try {
    wrapper.findAllComponents(ElInputNumber)[0]!.vm.$emit('change', 0.9)
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      ...step,
      post_assertion: { ...step.post_assertion, threshold: 0.9 },
    })
    expect(step).toEqual(original)
  } finally { wrapper.unmount() }
})

it('renders defaults without emitting a change while loading', () => {
  const step = { action: 'wait_image', post_assertion: { enabled: true, template_base64: 'bound-image' } }
  const wrapper = mount(StepAssertionForm, { props: { step } })
  try {
    const inputs = wrapper.findAllComponents(ElInputNumber)
    expect(inputs.map(input => input.props('modelValue'))).toEqual([0.85, 20, 1, 1])
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(step.post_assertion).toEqual({ enabled: true, template_base64: 'bound-image' })
  } finally { wrapper.unmount() }
})

it('configures literal OCR assertions without requiring an image and preserves image settings', async () => {
 const step = { action: 'wait', post_assertion: { enabled: false, recognition_mode: 'text', text: '', template_base64: 'old' } }
 const w = mount(StepAssertionForm, { props: { step } })
 try {
  expect(w.getComponent(ElSwitch).props('disabled')).toBe(true)
  expect(w.getComponent(StepRegionField).props('use')).toBe('assertion_ocr')
  w.getComponent(ElInput).vm.$emit('update:modelValue', '开始[游戏]+')
  const next = w.emitted('change')!.at(-1)![0] as typeof step
  expect(next.post_assertion.template_base64).toBe('old')
  expect(next.post_assertion.text).toBe('开始[游戏]+')
  await w.setProps({ step: next })
  expect(w.getComponent(ElSwitch).props('disabled')).toBe(false)
  w.getComponent(ElSwitch).vm.$emit('change', true)
  const enabled = w.emitted('change')!.at(-1)![0] as typeof step
  expect(enabled.post_assertion.enabled).toBe(true)
  await w.setProps({ step: enabled })
  expect(w.find('[aria-label="断言匹配阈值"]').exists()).toBe(false)
  w.getComponent(ElSelect).vm.$emit('change', 'image')
  expect(w.emitted('change')!.at(-1)![0]).toMatchObject({ post_assertion: { recognition_mode: 'image', enabled: false, text: '开始[游戏]+' } })
 } finally { w.unmount() }
})
