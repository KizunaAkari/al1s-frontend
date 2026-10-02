import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import StepPointPicker from '../src/modules/maa/editor/StepPointPicker.vue'
import StepRegionField from '../src/modules/maa/editor/StepRegionField.vue'
import { regionPickerKey, type RegionRequest } from '../src/modules/maa/editor/region-picker-context'

it('requests a screenshot or reuses one for the exact feature and clears selection on removal', async () => {
  const active = ref<RegionRequest>()
  const hasScreenshot = ref(false)
  const disabled = ref(false)
  const select = vi.fn((request: RegionRequest) => { active.value = request })
  const w = mount(StepRegionField, {
    props: { use: 'assertion', title: '断言图片' },
    global: { provide: { [regionPickerKey as symbol]: { active, hasScreenshot, disabled, select } } },
  })
  expect(w.findAll('button')).toHaveLength(1)
  await w.get('button').trigger('click')
  expect(select).toHaveBeenLastCalledWith(expect.objectContaining({ use: 'assertion', title: '断言图片' }), true)
  hasScreenshot.value = true
  await w.vm.$nextTick()
  expect(w.findAll('button')).toHaveLength(1)
  expect(w.text()).not.toContain('使用当前截图')
  disabled.value = true
  await w.vm.$nextTick()
  expect(w.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  w.unmount()
  expect(active.value).toBeUndefined()
})

it('offers optional screenshot point picking without an image binding card', async () => {
  const active = ref<RegionRequest>(), select = vi.fn()
  const wrapper = mount(StepPointPicker, { global: { provide: { [regionPickerKey as symbol]: {
    active, disabled: ref(false), hasScreenshot: ref(false), select,
  } } } })
  try {
    await wrapper.get('button').trigger('click')
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ use: 'point' }), true)
    expect(wrapper.text()).toContain('截图取点')
    expect(wrapper.find('img').exists()).toBe(false)
  } finally { wrapper.unmount() }
})
