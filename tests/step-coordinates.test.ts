import { mount } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import { expect, it } from 'vitest'
import StepCoordinatesForm from '../src/modules/maa/editor/StepCoordinatesForm.vue'
import { bindImage } from '../src/modules/maa/editor/image-binding'

it('changes only the chosen coordinate and leaves props untouched', () => {
  const step = { action: 'tap', x: 1, y: 2, custom: 'keep' }
  const wrapper = mount(StepCoordinatesForm, { props: { step } })
  wrapper.findComponent(ElInputNumber).vm.$emit('change', 30)
  expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({ ...step, x: 30 })
  expect(step.x).toBe(1)
  wrapper.unmount()
})

it('does not expose coordinate controls for a known action with wrong field types', () => {
  const wrapper = mount(StepCoordinatesForm, {
    props: { step: { action: 'tap', x: 'invalid', y: 2 } },
  })
  expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(0)
  wrapper.unmount()
})

it('binds a raw coordinate baseline without uploading a resource', () => {
  const doc = { steps: [{ action: 'swipe', x1: 1, y1: 2, x2: 3, y2: 4, duration_ms: 300 }] }
  const next = bindImage(doc, 0, { width: 64, height: 96 }, { x: 0, y: 0, width: 64, height: 96 }, 'screen')
  expect(next.steps).toEqual(doc.steps)
  expect(next.target).toEqual({ screen_size: { width: 64, height: 96 } })
})

it('uses the selected native pixel region centre for a fixed tap', () => {
  const doc = { steps: [{ action: 'tap', x: 0, y: 0 }] }
  const next = bindImage(doc, 0, { width: 64, height: 96 }, { x: 10, y: 20, width: 5, height: 7 }, 'point')
  expect(next.steps[0]).toEqual({ action: 'tap', x: 12, y: 23 })
  expect(doc.steps[0]).toEqual({ action: 'tap', x: 0, y: 0 })
})
