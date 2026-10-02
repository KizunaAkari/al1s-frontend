import { expect, it } from 'vitest'
import { defaultNodeLayout } from '../src/modules/maa/editor/canvas-layout'

it('fits more than four nodes when the available width allows it', () => {
  const layout = defaultNodeLayout(
    [{ action: 'wait' }, { action: 'back' }, { action: 'home' }, { action: 'tap' }, { action: 'wait' }],
    {},
    1300,
  )

  expect(layout.slice(0, 5).every(node => node.y === 0)).toBe(true)
  expect(layout[4]).toMatchObject({ x: 1040, y: 0, width: 216, height: 110 })
})

it('wraps by measured row height in a narrow viewport', () => {
  const layout = defaultNodeLayout(
    [{ action: 'wait_click' }, { action: 'wait' }, { action: 'back' }],
    { 0: 270 },
    500,
  )

  expect(layout[0]).toEqual({ x: 0, y: 0, width: 216, height: 270 })
  expect(layout[1]).toEqual({ x: 260, y: 0, width: 216, height: 110 })
  expect(layout[2]).toEqual({ x: 0, y: 314, width: 216, height: 110 })
})

it('keeps the compact start node when wrapping by width', () => {
  const layout = defaultNodeLayout(
    [{ action: 'start' }, { action: 'wait' }, { action: 'back' }],
    {},
    400,
  )

  expect(layout[0]).toEqual({ x: 0, y: 0, width: 132, height: 52 })
  expect(layout[1]).toMatchObject({ x: 176, y: 0, width: 216, height: 110 })
  expect(layout[2]).toMatchObject({ x: 0, y: 154, width: 216, height: 110 })
})

it('keeps the legacy four-column layout when width is omitted', () => {
  const layout = defaultNodeLayout(
    [{ action: 'start' }, { action: 'wait' }, { action: 'wait_click' }, { action: 'back' }, { action: 'home' }],
    { 2: 270 },
  )

  expect(layout[0]).toEqual({ x: 0, y: 0, width: 132, height: 52 })
  expect(layout[3]?.y).toBe(0)
  expect(layout[4]).toEqual({ x: 0, y: 314, width: 216, height: 110 })
})
