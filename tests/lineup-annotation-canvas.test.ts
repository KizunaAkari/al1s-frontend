import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LineupAnnotationCanvas from '../src/modules/lineup/LineupAnnotationCanvas.vue'

import {
  boxFromPoints,
  clampBox,
  moveBox,
  nudgeBox,
  type AnnotationBox,
} from '../src/modules/lineup/annotation-geometry'

describe('lineup annotation geometry', () => {
  it('creates an integer box from a drag and clamps it to the original image', () => {
    expect(boxFromPoints({ x: -12.4, y: 30.6 }, { x: 225.7, y: 180.2 }, 200, 160))
      .toEqual([0, 31, 200, 129])
    expect(boxFromPoints({ x: 150.2, y: 120.8 }, { x: 30.1, y: 20.2 }, 200, 160))
      .toEqual([30, 20, 120, 101])
  })

  it('ignores a drag with no native pixel area', () => {
    expect(boxFromPoints({ x: 12.1, y: 20.1 }, { x: 12.4, y: 20.4 }, 200, 160)).toBeNull()
    expect(boxFromPoints({ x: 12, y: 20 }, { x: 20, y: 20 }, 200, 160)).toBeNull()
  })

  it('normalizes and clamps an existing box without leaving the image', () => {
    expect(clampBox([-10.4, 140.8, 240.6, 40.2], 200, 160)).toEqual([0, 141, 200, 19])
    expect(clampBox([150.8, 90.3, -80.2, -30.7], 200, 160)).toEqual([71, 60, 80, 30])
  })

  it('moves a box by integer pixels and clamps its origin', () => {
    const box: AnnotationBox = [20, 30, 60, 40]
    expect(moveBox(box, -50, 200, 200, 160)).toEqual([0, 120, 60, 40])
    expect(moveBox(box, 200, -200, 200, 160)).toEqual([140, 0, 60, 40])
  })

  it('nudges a box by one pixel while preserving its size', () => {
    expect(nudgeBox([0, 0, 20, 20], -1, -1, 200, 160)).toEqual([0, 0, 20, 20])
    expect(nudgeBox([0, 0, 20, 20], 1, 1, 200, 160)).toEqual([1, 1, 20, 20])
  })
})

describe('LineupAnnotationCanvas events', () => {
  function setCanvasRect(wrapper: ReturnType<typeof mount>) {
    const stage = wrapper.get('[data-annotation-stage]').element as HTMLElement
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 }),
    })
  }

  it('emits a bounded original-pixel box while drawing', async () => {
    const wrapper = mount(LineupAnnotationCanvas, {
      props: { imageUrl: '/lineup.png', width: 200, height: 100, regions: [], activeKey: null, drawing: true },
    })
    setCanvasRect(wrapper)
    const svg = wrapper.get('svg')
    await svg.trigger('pointerdown', { button: 0, clientX: -10, clientY: -5, pointerId: 1 })
    await svg.trigger('pointermove', { button: 0, clientX: 120, clientY: 60, pointerId: 1 })
    await svg.trigger('pointerup', { button: 0, clientX: 120, clientY: 60, pointerId: 1 })
    expect(wrapper.emitted('draw')).toEqual([[[0, 0, 200, 100]]])
  })

  it('selects on click and emits a moved box after dragging a region', async () => {
    const wrapper = mount(LineupAnnotationCanvas, {
      props: {
        imageUrl: '/lineup.png', width: 200, height: 100,
        regions: [{ side: 'attack', index: 0, kind: 'portrait', box: [20, 20, 40, 30] }],
        activeKey: null, drawing: false,
      },
    })
    setCanvasRect(wrapper)
    const region = wrapper.get('[data-region-key="attack-0-portrait"]')
    await region.trigger('pointerdown', { button: 0, clientX: 30, clientY: 20, pointerId: 2 })
    await region.trigger('pointerup', { button: 0, clientX: 30, clientY: 20, pointerId: 2 })
    expect(wrapper.emitted('select')).toEqual([['attack-0-portrait']])

    await region.trigger('pointerdown', { button: 0, clientX: 30, clientY: 20, pointerId: 3 })
    await region.trigger('pointermove', { button: 0, clientX: 40, clientY: 25, pointerId: 3 })
    await region.trigger('pointerup', { button: 0, clientX: 40, clientY: 25, pointerId: 3 })
    expect(wrapper.emitted('change')).toEqual([['attack-0-portrait', [40, 30, 40, 30]]])
  })

  it('nudges and removes the caller-selected region from keyboard controls', async () => {
    const wrapper = mount(LineupAnnotationCanvas, {
      props: {
        imageUrl: '/lineup.png', width: 200, height: 100,
        regions: [{ side: 'attack', index: 0, kind: 'portrait', box: [20, 20, 40, 30] }],
        activeKey: 'attack-0-portrait', drawing: false,
      },
    })
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    await wrapper.trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('change')).toEqual([['attack-0-portrait', [21, 20, 40, 30]]])
    expect(wrapper.emitted('remove')).toEqual([['attack-0-portrait']])
  })

  it('fits the source image on load and cancels a stale draw after the source changes', async () => {
    const wrapper = mount(LineupAnnotationCanvas, {
      props: { imageUrl: '/first.png', width: 200, height: 100, regions: [], activeKey: null, drawing: true },
    })
    setCanvasRect(wrapper)
    const viewport = wrapper.get('.annotation-viewport').element as HTMLElement
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 50 },
    })
    await wrapper.get('img').trigger('load')
    expect((wrapper.get('[data-annotation-stage]').element as HTMLElement).style.width).toBe('100px')

    const svg = wrapper.get('svg')
    await svg.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 7 })
    await wrapper.setProps({ imageUrl: '/second.png' })
    await svg.trigger('pointerup', { button: 0, clientX: 80, clientY: 40, pointerId: 7 })
    expect(wrapper.emitted('draw')).toBeUndefined()
  })

  it('scrolls a newly active region into the bounded viewport', async () => {
    const wrapper = mount(LineupAnnotationCanvas, {
      props: {
        imageUrl: '/lineup.png', width: 200, height: 100,
        regions: [{ side: 'attack', index: 0, kind: 'portrait', box: [150, 20, 30, 30] }],
        activeKey: null, drawing: false,
      },
    })
    const region = wrapper.get('[data-region-key="attack-0-portrait"]').element as SVGRectElement
    let scrolled = false
    Object.defineProperty(region, 'scrollIntoView', { configurable: true, value: () => { scrolled = true } })
    await wrapper.setProps({ activeKey: 'attack-0-portrait' })
    await flushPromises()
    expect(scrolled).toBe(true)
  })
})
