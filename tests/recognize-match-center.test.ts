import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { ElOption, ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import StepRecognizeExecuteForm from '../src/modules/maa/editor/StepRecognizeExecuteForm.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import HelpHint from '../src/shared/ui/HelpHint.vue'
import { regionPickerKey } from '../src/modules/maa/editor/region-picker-context'
import { parseScriptDocument, type WorkflowStep } from '../src/shared/api/maa-script-contract'

function form(step: WorkflowStep) {
  return mount(StepRecognizeExecuteForm, { props: { step }, global: { provide: {
    [regionPickerKey as symbol]: { active: ref(), disabled: ref(false), select: () => {} },
  } } })
}
it('explains repeated matching for image reuse and preserves the fixed-action explanation', async () => {
  const wrapper = form({ action: 'recognize_execute', recognition_mode: 'image', execution_mode: 'match_center' })
  try {
    const help = () => wrapper.findAllComponents(HelpHint).find(item => item.props('subject') === '执行次数')!
    await help().get('button').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('每次重新识别目标图片')
    await wrapper.setProps({ step: { action: 'recognize_execute', execution_mode: 'fixed_tap' } })
    expect(document.body.textContent).toContain('先识别一次')
  } finally { wrapper.unmount() }
})
it('selects the existing recognized image as the click target without another binding', async () => {
  const step: WorkflowStep = { action: 'recognize_execute', recognition_mode: 'image',
    execution_mode: 'fixed_tap', template_base64: { $blob: 'recognized-image' },
    template_rect: { x: 10, y: 20, width: 31, height: 21 }, threshold: 0.85,
    execution_count: 3, execution_interval_ms: 150, click: { x: 1, y: 2 } }
  const wrapper = form(step)
  try {
    const select = wrapper.findAllComponents(ElSelect)[1]!
    const option = wrapper.findAllComponents(ElOption).find(item => item.props('value') === 'match_center')
    expect(option).toBeDefined()
    select.vm.$emit('change', 'match_center')
    const changed = wrapper.emitted('change')![0]![0] as WorkflowStep
    expect(changed).toEqual({ ...step, execution_mode: 'match_center' })
    expect(step.execution_mode).toBe('fixed_tap')
    await wrapper.setProps({ step: changed })
    expect(wrapper.findAllComponents(StepRegionField).map(field => field.props('use'))).toEqual(['template'])
    expect(wrapper.find('[aria-label="点击图片阈值"]').exists()).toBe(false)
    expect(parseScriptDocument(JSON.parse(JSON.stringify({ version: 2, steps: [changed] }))).steps[0])
      .toEqual(changed)
    await wrapper.setProps({ step })
    expect(select.props('modelValue')).toBe('fixed_tap')
  } finally { wrapper.unmount() }
})
it('does not select image reuse for OCR and keeps the stored mode when switching conditions', async () => {
  const wrapper = form({ action: 'recognize_execute', recognition_mode: 'text', text: '领取', execution_mode: 'fixed_tap' })
  try {
    const option = wrapper.findAllComponents(ElOption).find(item => item.props('value') === 'match_center')!
    expect(option).toBeDefined()
    expect(option.props('disabled')).toBe(true)
    wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('change', 'match_center')
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.setProps({ step: { action: 'recognize_execute', recognition_mode: 'text', execution_mode: 'match_center' } })
    expect(wrapper.text()).toContain('复用识别选区需要图片识别')
  } finally { wrapper.unmount() }
})
