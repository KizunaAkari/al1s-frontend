import { mount } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import { expect, it } from 'vitest'
import StepCoordinatesForm from '../src/modules/maa/editor/StepCoordinatesForm.vue'
import StepRecognizeExecuteForm from '../src/modules/maa/editor/StepRecognizeExecuteForm.vue'
import StepSmartSwipeForm from '../src/modules/maa/editor/StepSmartSwipeForm.vue'
import GlobalPopupRuleForm from '../src/modules/maa/editor/GlobalPopupRuleForm.vue'
import StrategyDefinitionForm from '../src/modules/maa/StrategyDefinitionForm.vue'
import HistoryDocumentPreview from '../src/modules/maa/editor/HistoryDocumentPreview.vue'
import { historyDifference } from '../src/modules/maa/editor/history-diff'

function input(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAllComponents(ElInputNumber).find(field => field.find('input').attributes('aria-label') === label)!
}

it('displays legacy coordinate durations in seconds and preserves their stored millisecond range', () => {
  const step = { action: 'swipe', x1: 1, y1: 2, x2: 3, y2: 4, duration_ms: 300, extension: 'keep' }
  const wrapper = mount(StepCoordinatesForm, { props: { step } })
  try {
    const field = input(wrapper, '滑动时长')
    expect(field.props('modelValue')).toBe(0.3)
    expect(field.props('min')).toBe(0.001)
    expect(field.props('max')).toBe(60)
    expect(field.props('precision')).toBe(3)
    expect(wrapper.emitted('change')).toBeUndefined()
    field.vm.$emit('change', 0.001)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({ ...step, duration_ms: 1 })
    field.vm.$emit('change', 60)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({ ...step, duration_ms: 60000 })
    expect(step.duration_ms).toBe(300)
  } finally { wrapper.unmount() }
})

it('converts repeated execution and nested swipe seconds without changing other action fields', () => {
  const step = { action: 'recognize_execute', execution_mode: 'fixed_swipe', execution_count: 2,
    execution_interval_ms: 5000, swipe: { x1: 1, y1: 2, x2: 3, y2: 4, duration_ms: 450, extension: 'keep' } }
  const wrapper = mount(StepRecognizeExecuteForm, { props: { step } })
  try {
    expect(input(wrapper, '执行间隔').props('modelValue')).toBe(5)
    expect(input(wrapper, '滑动时长').props('modelValue')).toBe(0.45)
    input(wrapper, '执行间隔').vm.$emit('change', 0.12)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({ ...step, execution_interval_ms: 120 })
    input(wrapper, '滑动时长').vm.$emit('change', 0.625)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ swipe: { ...step.swipe, duration_ms: 625 } })
  } finally { wrapper.unmount() }
})

it('converts smart swipe seconds before validating integer milliseconds', () => {
  const step = { action: 'smart_swipe', swipe: { x1: 1, y1: 2, x2: 3, y2: 4, duration_ms: 350, extension: true } }
  const wrapper = mount(StepSmartSwipeForm, { props: { step } })
  try {
    const field = input(wrapper, '滑动时长（秒）')
    expect(field.props('modelValue')).toBe(0.35)
    field.vm.$emit('change', 0.625)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ swipe: { ...step.swipe, duration_ms: 625 } })
  } finally { wrapper.unmount() }
})

it('keeps popup click intervals in milliseconds while showing decimal seconds', () => {
  const document = { version: 2, steps: [{ action: 'wait', seconds: 1 }], global_popups: [
    { name: 'notice', enabled: true, template_base64: 'template', click_interval_ms: 500, extension: 'keep' },
  ] }
  const wrapper = mount(GlobalPopupRuleForm, { props: { document, activeIndex: 0 } })
  try {
    const field = input(wrapper, '弹窗点击间隔')
    expect(field.props('modelValue')).toBe(0.5)
    field.vm.$emit('change', 0)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ global_popups: [{ ...document.global_popups[0], click_interval_ms: 0 }] })
  } finally { wrapper.unmount() }
})

it('rounds strategy seconds to integer milliseconds and preserves the rest of the definition', () => {
  const definition = { start_script_id: 'start', end_script_id: 'end', start_wait_after_ms: 1500,
    process_modules: [{ script_id: 'process', wait_after_ms: 2500 }], default_parameters: { keep: true } }
  const wrapper = mount(StrategyDefinitionForm, { props: { modelValue: definition, scripts: [], applicationId: 'app' } })
  try {
    const fields = wrapper.findAllComponents(ElInputNumber)
    expect(fields[0]!.props('modelValue')).toBe(1.5)
    expect(fields[1]!.props('modelValue')).toBe(2.5)
    expect(fields[0]!.props('max')).toBe(14400)
    fields[0]!.vm.$emit('change', 0.12300000000000001)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ ...definition, start_wait_after_ms: 123 })
    fields[1]!.vm.$emit('change', 0.001)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ ...definition, process_modules: [{ script_id: 'process', wait_after_ms: 1 }] })
  } finally { wrapper.unmount() }
})

it('shows history intervals in seconds without modifying the original snapshot', () => {
  const before = { version: 2, steps: [{ action: 'wait', seconds: 1, execution_interval_ms: 120 }] }
  const after = { version: 2, steps: [{ action: 'wait', seconds: 1, execution_interval_ms: 5000 }] }
  expect(historyDifference(before, after).lines.join(' ')).toContain('0.12 秒 → 5 秒')
  const wrapper = mount(HistoryDocumentPreview, { props: { document: before, scriptId: 'script' } })
  try { expect(wrapper.text()).toContain('间隔 0.12 秒'); expect(before.steps[0]!.execution_interval_ms).toBe(120) }
  finally { wrapper.unmount() }
})
