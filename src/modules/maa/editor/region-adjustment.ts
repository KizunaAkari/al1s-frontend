import type { Rect } from './image-binding'

export type RegionHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function adjustRegion(rect: Rect, handle: RegionHandle, dx: number, dy: number, size: { width: number; height: number }): Rect {
  if (handle === 'move') return { ...rect,
    x: clamp(rect.x + dx, 0, size.width - rect.width),
    y: clamp(rect.y + dy, 0, size.height - rect.height) }
  let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height
  if (handle.includes('w')) left = clamp(left + dx, 0, right - 1)
  if (handle.includes('e')) right = clamp(right + dx, left + 1, size.width)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 1)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + 1, size.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
