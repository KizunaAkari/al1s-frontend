import { mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import StepRecognizeExecuteForm from '../src/modules/maa/editor/StepRecognizeExecuteForm.vue'
import StepWaitForm from '../src/modules/maa/editor/StepWaitForm.vue'
import type { WorkflowStep } from '../src/shared/api/maa-script-editor'
import { helpText } from './help-test-utils'

it('changes wait mode while keeping the step safeguards', async () => {
  const step: WorkflowStep = { action: 'wait_image', timeout_seconds: 45,
    skip_condition: { enabled: true }, post_assertion: { enabled: true },
    failure_retry: { max_attempts: 2 } }
  const wrapper = mount(StepWaitForm, { props: { step } })
  try {
    wrapper.findComponent(ElSelect).vm.$emit('change', 'random')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      action: 'wait_random', min_seconds: 1, max_seconds: 2, timeout_seconds: 45,
      skip_condition: { enabled: true }, post_assertion: { enabled: true },
      failure_retry: { max_attempts: 2 },
    })
  } finally { wrapper.unmount() }
})

it('extends the wait timeout when a longer duration is entered', async () => {
  const wrapper = mount(StepWaitForm, { props: { step: { action: 'wait', seconds: 1 } } })
  try {
    await wrapper.find('[aria-label="等待秒数"]').setValue('60')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      action: 'wait', seconds: 60, timeout_seconds: 61,
    })
  } finally { wrapper.unmount() }
})

it('defaults recognition execution to one action and allows a repeated count', async () => {
  const step: WorkflowStep = { action: 'recognize_execute', recognition_mode: 'image',
    execution_mode: 'fixed_tap', execution_count: 1, click: { x: 20, y: 30 } }
  const wrapper = mount(StepRecognizeExecuteForm, { props: { step } })
  try {
    expect(await helpText(wrapper, '执行次数')).toContain('先识别一次，再连续执行设定次数')
    await wrapper.find('[aria-label="执行次数"]').setValue('3')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({ execution_count: 3 })
  } finally { wrapper.unmount() }
})
