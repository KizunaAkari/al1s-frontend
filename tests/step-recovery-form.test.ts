import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { ElSwitch } from 'element-plus'
import StepRecoveryForm from '../src/modules/maa/editor/StepRecoveryForm.vue'

it('toggles recovery without changing skip or action fields', async () => {
  const step = { action: 'wait', seconds: 3, skip_condition: { enabled: true, operator: 'gt', value: 1 } }
  const wrapper = mount(StepRecoveryForm, { props: { step, scripts: [], scriptId: 's' } })
  wrapper.findComponent(ElSwitch).vm.$emit('change', true)
  expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({ ...step, failure_retry: { enabled: true, max_retries: 1 } })
  expect(step).not.toHaveProperty('failure_retry')
})
it('does not allow recovery on start actions', () => {
  const wrapper = mount(StepRecoveryForm, { props: { step: { action: 'start' }, scripts: [], scriptId: 's' } })
  expect(wrapper.findComponent(ElSwitch).props('disabled')).toBe(true)
})
