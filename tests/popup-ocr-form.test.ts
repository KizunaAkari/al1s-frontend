import { mount } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import { expect, it } from 'vitest'
import GlobalPopupRuleForm from '../src/modules/maa/editor/GlobalPopupRuleForm.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'

it('offers literal OCR text, its region and matched-text clicking without a required template', async () => {
  const document = { steps: [{ action: 'back' }], global_popups: [
    { recognition_mode: 'text', text: '重复挑战追加', click_mode: 'match_center', timeout_seconds: 30 },
  ] }
  const wrapper = mount(GlobalPopupRuleForm, { props: { document, activeIndex: 0 } })
  expect(wrapper.findAllComponents(StepRegionField).map(field => field.props('use'))).toEqual(['ocr_region'])
  expect(wrapper.findAllComponents(ElOption).map(option => option.props('label'))).toContain('点击识别文字中心')
  await wrapper.get('input[aria-label="弹窗识别文字"]').setValue('确认追加')
  expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ global_popups: [{ text: '确认追加', click_mode: 'match_center' }] })
  wrapper.findAllComponents(ElSelect)[0]!.vm.$emit('change', 'image')
  expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ global_popups: [{ recognition_mode: 'image', text: '重复挑战追加' }] })
  wrapper.unmount()
})
