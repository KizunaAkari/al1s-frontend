import { describe, expect, it } from 'vitest'
import { defaultLayout, normalizeSlot, transformSlot } from '../src/modules/bots/memes/layout'

describe('meme layout geometry', () => {
  it('normalizes direct numeric edits into the canvas, including empty and out-of-range values', () => {
    const layout = defaultLayout()
    const slot = { x: 9999, y: -4, width: 9999, height: Number.NaN, order: 0 }
    normalizeSlot(layout, slot)
    expect(slot).toEqual({ x: 0, y: 0, width: 320, height: 1, order: 0 })
  })
  it('converts pointer deltas using the displayed canvas scale and clamps inside the original', () => {
    const layout = defaultLayout()
    layout.avatars = [{ x: 20, y: 20, width: 80, height: 80, order: 0, shape: 'circle', fit: 'cover', rotation: 0 }]
    const result = transformSlot(layout, 'avatar', 0, layout.avatars[0]!, 40, -100, 0.5, 'move')
    expect(result.avatars[0]).toMatchObject({ x: 100, y: 0, width: 80 })
    expect(layout.avatars[0]!.x).toBe(20)
  })
  it('keeps resized avatar and text boxes inside the canvas without changing another slot', () => {
    const layout = defaultLayout()
    layout.avatars = [{ x: 200, y: 200, width: 80, height: 80, order: 0, shape: 'rectangle', fit: 'cover', rotation: 0 }]
    const result = transformSlot(layout, 'avatar', 0, layout.avatars[0]!, 1000, 1000, 1, 'resize')
    expect(result.avatars[0]).toMatchObject({ width: 120, height: 120 })
  })
})
