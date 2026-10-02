import { mount } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import { expect, it } from 'vitest'
import StepActionForm from '../src/modules/maa/editor/StepActionForm.vue'
import StepRecognizeExecuteForm from '../src/modules/maa/editor/StepRecognizeExecuteForm.vue'
import StepWaitForm from '../src/modules/maa/editor/StepWaitForm.vue'
import { parseScriptDocument } from '../src/shared/api/maa-script-contract'
import type { WorkflowStep } from '../src/shared/api/maa-script-contract'

const actions = ['recognize_execute', 'wait_click', 'wait_image', 'wait_text', 'click_text', 'smart_swipe']

it.each(actions)('edits the final wait on %s without changing the original step', async action => {
  const component = action === 'recognize_execute' ? StepRecognizeExecuteForm
    : action === 'wait_image' ? StepWaitForm : StepActionForm
  const step = { action, template_base64: 'image', text: '领取',
    click: { x: 12, y: 34 }, execution_count: 3, click_count: 3,
    failure_retry: { enabled: true }, unknown_field: { keep: true } }
  const wrapper = mount(component, { props: { step } })
  try {
    const wait = wrapper.findAllComponents(ElInputNumber)
      .find(input => input.find('input').attributes('aria-label') === '执行后等待秒数')!
    expect(wait.props('modelValue')).toBe(0)
    expect(wait.props('min')).toBe(0)
    expect(wait.props('max')).toBe(14400)
    expect(wrapper.emitted('change')).toBeUndefined()
    wait.vm.$emit('change', 2.75)
    const changed = wrapper.emitted('change')?.[0]?.[0] as WorkflowStep
    expect(changed).toEqual({ ...step, wait_after_execution_seconds: 2.75 })
    expect(step).not.toHaveProperty('wait_after_execution_seconds')
    await wrapper.setProps({ step: changed })
    expect(wait.props('modelValue')).toBe(2.75)
    await wrapper.setProps({ step }) // Cancel the local edit.
    expect(wait.props('modelValue')).toBe(0)
  } finally { wrapper.unmount() }
})

it.each(['wait', 'wait_random', 'tap'])('does not add recognition settings to %s', action => {
  const wrapper = mount(action === 'tap' ? StepActionForm : StepWaitForm, { props: { step: { action } } })
  try { expect(wrapper.find('[aria-label="执行后等待秒数"]').exists()).toBe(false) }
  finally { wrapper.unmount() }
})

it.each(actions)('preserves the %s wait through document serialization and rejects invalid types', action => {
  const document = { version: 2, steps: [{ action, wait_after_execution_seconds: 2.75 }] }
  expect(parseScriptDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  for (const value of ['2', true, {}, Infinity, NaN]) {
    expect(() => parseScriptDocument({ version: 2, steps: [{ action, wait_after_execution_seconds: value }] }))
      .toThrow('脚本步骤格式无效')
  }
  expect(parseScriptDocument({ version: 2, steps: [{ action, wait_after_execution_seconds: null }] })
    .steps[0]?.wait_after_execution_seconds).toBeNull()
})
