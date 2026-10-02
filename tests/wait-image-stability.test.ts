import { mount } from '@vue/test-utils'
import { ElInputNumber, ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import StepWaitForm from '../src/modules/maa/editor/StepWaitForm.vue'
import { newWorkflowStep } from '../src/modules/maa/editor/workflow-defaults'
import { parseScriptDocument, type WorkflowStep } from '../src/shared/api/maa-script-contract'

const label = '等待图片连续命中轮数'

it('edits consecutive rounds, reopens and cancels without changing the source step', async () => {
  const step: WorkflowStep = { action: 'wait_image', template_base64: 'image',
    threshold: 0.85, poll_interval_seconds: 1, timeout_seconds: 90,
    wait_after_execution_seconds: 2, failure_retry: { enabled: true } }
  const wrapper = mount(StepWaitForm, { props: { step } })
  try {
    const input = wrapper.findAllComponents(ElInputNumber)
      .find(field => field.find('input').attributes('aria-label') === label)!
    expect(input.props()).toMatchObject({ modelValue: 1, min: 1, precision: 0, step: 1, stepStrictly: true })
    input.vm.$emit('change', 3)
    const changed = wrapper.emitted('change')![0]![0] as WorkflowStep
    expect(changed).toEqual({ ...step, consecutive_match_count: 3 })
    expect(step).not.toHaveProperty('consecutive_match_count')
    await wrapper.setProps({ step: changed })
    expect(input.props('modelValue')).toBe(3)
    await wrapper.setProps({ step })
    expect(input.props('modelValue')).toBe(1)
    for (const invalid of [0, -1, 1.5, NaN, null]) input.vm.$emit('change', invalid)
    expect(wrapper.emitted('change')).toHaveLength(1)
  } finally { wrapper.unmount() }
})

it.each(['wait', 'wait_random'])('keeps the setting out of %s mode', action => {
  const wrapper = mount(StepWaitForm, { props: { step: newWorkflowStep(action) } })
  try { expect(wrapper.find(`[aria-label="${label}"]`).exists()).toBe(false) }
  finally { wrapper.unmount() }
})

it('starts image mode at one round and removes image settings when switching to fixed wait', async () => {
  const wrapper = mount(StepWaitForm, { props: { step: newWorkflowStep('wait') } })
  try {
    wrapper.findComponent(ElSelect).vm.$emit('change', 'image')
    const image = wrapper.emitted('change')![0]![0] as WorkflowStep
    expect(image).toMatchObject({ action: 'wait_image', consecutive_match_count: 1 })
    await wrapper.setProps({ step: { ...image, consecutive_match_count: 3 } })
    wrapper.findComponent(ElSelect).vm.$emit('change', 'fixed')
    expect(wrapper.emitted('change')![1]![0]).not.toHaveProperty('consecutive_match_count')
  } finally { wrapper.unmount() }
})

it('retains round counts and unknown fields through document serialization', () => {
  for (const count of [undefined, null, 1, 3]) {
    const doc = { version: 2, steps: [{ action: 'wait_image', consecutive_match_count: count,
      extension_hint: { keep: true } }] }
    const serialized = JSON.parse(JSON.stringify(doc))
    expect(parseScriptDocument(serialized)).toEqual(serialized)
  }
  for (const count of ['3', true, {}, Infinity, NaN]) {
    expect(() => parseScriptDocument({ version: 2,
      steps: [{ action: 'wait_image', consecutive_match_count: count }] })).toThrow('脚本步骤格式无效')
  }
})
