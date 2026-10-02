import { expect, it } from 'vitest'
import { adjustRegion, type RegionHandle } from '../src/modules/maa/editor/region-adjustment'

const rect = { x: 20, y: 30, width: 40, height: 50 }
const size = { width: 100, height: 120 }
it('moves without changing size and clamps to image boundaries', () => {
  expect(adjustRegion(rect, 'move', -100, 100, size)).toEqual({ x: 0, y: 70, width: 40, height: 50 })
  expect(adjustRegion(rect, 'move', 1, -1, size)).toEqual({ ...rect, x: 21, y: 29 })
})
it('resizes each edge and corner without crossing the opposite edge', () => {
  for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as RegionHandle[]) {
    for (const delta of [-200, 200]) {
      const result = adjustRegion(rect, handle, delta, delta, size)
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeGreaterThanOrEqual(0)
      expect(result.width).toBeGreaterThanOrEqual(1)
      expect(result.height).toBeGreaterThanOrEqual(1)
      expect(result.x + result.width).toBeLessThanOrEqual(size.width)
      expect(result.y + result.height).toBeLessThanOrEqual(size.height)
    }
  }
  expect(adjustRegion(rect, 'nw', 5, 7, size)).toEqual({ x: 25, y: 37, width: 35, height: 43 })
})
