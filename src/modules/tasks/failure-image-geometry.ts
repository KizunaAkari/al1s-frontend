import type { ImageSize, PixelRect } from '../../shared/api/task-details'

export function sameImageSize(size: ImageSize | null | undefined, width: number, height: number) {
  return !!size && width > 0 && size.width === width && size.height === height
}
export function rectangleStyle(rect: PixelRect | null | undefined, size: ImageSize | null | undefined, width: number, height: number) {
  if (!rect || !sameImageSize(size, width, height)) return null
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > width || rect.y + rect.height > height) return null
  return { left: `${100 * rect.x / width}%`, top: `${100 * rect.y / height}%`, width: `${100 * rect.width / width}%`, height: `${100 * rect.height / height}%` }
}
