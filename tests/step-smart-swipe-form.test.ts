import { mount } from '@vue/test-utils'
import { ElInputNumber, ElOption, ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import StepSmartSwipeForm from '../src/modules/maa/editor/StepSmartSwipeForm.vue'
import type { WorkflowStep } from '../src/shared/api/maa-script-editor'

function inputNumber(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAllComponents(ElInputNumber).find(input => (
    input.find('input').attributes('aria-label') === label
  ))!
}

function latestChange(wrapper: ReturnType<typeof mount>) {
  return wrapper.emitted('change')!.at(-1)![0] as WorkflowStep
}

it('shows controlled defaults without changing a smart swipe step', () => {
  const step: WorkflowStep = { action: 'smart_swipe', step_unknown: { keep: true } }
  const wrapper = mount(StepSmartSwipeForm, { props: { step } })

  expect(wrapper.findComponent(ElSelect).props('modelValue')).toBe('until_image')
  expect(inputNumber(wrapper, 'x1').props('modelValue')).toBe(0)
  expect(inputNumber(wrapper, 'y1').props('modelValue')).toBe(0)
  expect(inputNumber(wrapper, 'x2').props('modelValue')).toBe(0)
  expect(inputNumber(wrapper, 'y2').props('modelValue')).toBe(0)
  expect(inputNumber(wrapper, '滑动时长（毫秒）').props('modelValue')).toBe(350)
  expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(6)
  expect(wrapper.emitted('change')).toBeUndefined()
  expect(step).toEqual({ action: 'smart_swipe', step_unknown: { keep: true } })
  wrapper.unmount()
})

it('changes mode and after-image timing without creating or dropping other fields', async () => {
  const step: WorkflowStep = {
    action: 'smart_swipe',
    template_base64: 'template',
    step_unknown: 'keep',
    wait_after_swipe_seconds: 2,
  }
  const before = structuredClone(step)
  const wrapper = mount(StepSmartSwipeForm, { props: { step } })

  await wrapper.findComponent(ElSelect).vm.$emit('change', 'after_image')
  const afterMode = latestChange(wrapper)
  expect(afterMode).toEqual({ ...step, mode: 'after_image' })
  await wrapper.setProps({ step: afterMode })

  await inputNumber(wrapper, '识别后滑动秒数').vm.$emit('change', 14400)
  const next = latestChange(wrapper)
  expect(next).toEqual({ ...afterMode, swipe_for_seconds: 14400 })
  expect(next.template_base64).toBe('template')
  expect(next.step_unknown).toBe('keep')
  expect(next.swipe).toBeUndefined()
  expect(step).toEqual(before)
  wrapper.unmount()
})

it('creates default nested swipe fields on edit and preserves nested unknown fields', async () => {
  const step: WorkflowStep = {
    action: 'smart_swipe',
    swipe: { x1: 4, y1: 5, x2: 6, y2: 7, duration_ms: 900, swipe_unknown: 'keep' },
    step_unknown: true,
  }
  const before = structuredClone(step)
  const wrapper = mount(StepSmartSwipeForm, { props: { step } })

  await inputNumber(wrapper, 'x2').vm.$emit('change', 8191)
  let next = latestChange(wrapper)
  expect(next.swipe).toEqual({
    x1: 4,
    y1: 5,
    x2: 8191,
    y2: 7,
    duration_ms: 900,
    swipe_unknown: 'keep',
  })
  await wrapper.setProps({ step: next })
  await inputNumber(wrapper, '滑动时长（毫秒）').vm.$emit('change', 60000)
  next = latestChange(wrapper)
  expect((next.swipe as Record<string, unknown>).duration_ms).toBe(60000)
  expect((next.swipe as Record<string, unknown>).swipe_unknown).toBe('keep')
  expect(step).toEqual(before)
  wrapper.unmount()
})

it('creates all nested defaults when a missing swipe is edited and exposes the requested limits', () => {
  const step: WorkflowStep = { action: 'smart_swipe' }
  const wrapper = mount(StepSmartSwipeForm, { props: { step } })
  const x1 = inputNumber(wrapper, 'x1')
  const duration = inputNumber(wrapper, '滑动时长（毫秒）')
  const wait = inputNumber(wrapper, '滑动后等待秒数')

  expect(x1.props('min')).toBe(0)
  expect(x1.props('max')).toBe(8191)
  expect(duration.props('min')).toBe(1)
  expect(duration.props('max')).toBe(60000)
  expect(wait.props('min')).toBe(0)
  expect(wait.props('max')).toBe(300)
  expect(wrapper.findAllComponents(ElOption).some(option => (
    option.props('value') === 'until_image'
  ))).toBe(true)

  x1.vm.$emit('change', 1)
  const next = latestChange(wrapper)
  expect(next.swipe).toEqual({ x1: 1, y1: 0, x2: 0, y2: 0, duration_ms: 350 })
  expect(step).toEqual({ action: 'smart_swipe' })
  wrapper.unmount()
})

it('does not render controls for another action', () => {
  const wrapper = mount(StepSmartSwipeForm, { props: { step: { action: 'swipe' } } })
  expect(wrapper.find('[aria-label="智能滑动参数"]').exists()).toBe(false)
  expect(wrapper.emitted('change')).toBeUndefined()
  wrapper.unmount()
})
