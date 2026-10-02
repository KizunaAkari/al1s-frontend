import { mount } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import { expect, it } from 'vitest'
import StepActionForm from '../src/modules/maa/editor/StepActionForm.vue'
import { parseScriptDocument } from '../src/shared/api/maa-script-contract'

it.each(['back', 'home', 'task_view'])('configures both waits on %s without changing other fields', async action => {
  const step = { action, timeout_seconds: 20 }
  const wrapper = mount(StepActionForm, { props: { step } })
  try {
    const before = wrapper.findAllComponents(ElInputNumber).find(input => input.find('[aria-label="执行前等待秒数"]').exists())!
    const after = wrapper.findAllComponents(ElInputNumber).find(input => input.find('[aria-label="执行后等待秒数"]').exists())!
    expect(before).toBeDefined(); expect(after).toBeDefined()
    expect(before.props('modelValue')).toBe(0)
    before.vm.$emit('change', 1.25)
    const changed = wrapper.emitted('change')![0]![0]
    expect(changed).toEqual({ ...step, wait_before_execution_seconds: 1.25 })
    expect(parseScriptDocument({ version: 2, steps: [changed] }).steps[0]).toEqual(changed)
    expect(() => parseScriptDocument({ version: 2, steps: [{ action, wait_before_execution_seconds: '1' }] })).toThrow()
  } finally { wrapper.unmount() }
})
