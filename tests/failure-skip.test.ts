import { mount } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import StepSkipForm from '../src/modules/maa/editor/StepSkipForm.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'

it('offers failure skip and preserves the target and original image when switching', async () => {
  const step = { action: 'back', skip_condition: { enabled: true, mode: 'image',
    preview_base64: 'existing', skip_to_step_index: 3 }, extra: 'keep' }
  const wrapper = mount(StepSkipForm, { props: { step, index: 0, count: 3 } })
  try {
    expect(wrapper.findAllComponents(ElOption).some(option => option.props('value') === 'execution_failure')).toBe(true)
    wrapper.findAllComponents(ElSelect)[0]!.vm.$emit('change', 'execution_failure')
    const changed = wrapper.emitted('change')![0]![0] as typeof step
    expect(changed).toMatchObject({ ...step, skip_condition: { ...step.skip_condition, mode: 'execution_failure' } })
    expect(step.skip_condition.mode).toBe('image')
    await wrapper.setProps({ step: changed })
    expect(wrapper.findComponent(StepRegionField).exists()).toBe(false)
    expect(wrapper.find('[aria-label="跳过比较方式"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('失败重试')
    expect(wrapper.findAllComponents(ElSelect)[1]!.props('modelValue')).toBe(3)
    await wrapper.setProps({ step })
    expect(wrapper.findComponent(StepRegionField).exists()).toBe(true)
  } finally { wrapper.unmount() }
})

it('reopens failure skip without an image and keeps the existing start restriction', () => {
  const wrapper = mount(StepSkipForm, { props: { step: { action: 'back',
    skip_condition: { enabled: true, mode: 'execution_failure' } }, index: 0, count: 1 } })
  try {
    expect(wrapper.findComponent(StepRegionField).exists()).toBe(false)
    expect(wrapper.findAllComponents(ElSelect)[1]!.props('modelValue')).toBe(0)
  } finally { wrapper.unmount() }
})
