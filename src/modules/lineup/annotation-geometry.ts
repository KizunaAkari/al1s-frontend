export type AnnotationBox = [number, number, number, number]

export type AnnotationPoint = {
  x: number
  y: number
}

export type ClientRect = {
  left: number
  top: number
  width: number
  height: number
}

function imageDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function clampPoint(point: AnnotationPoint, width: number, height: number): AnnotationPoint {
  const imageWidth = imageDimension(width)
  const imageHeight = imageDimension(height)
  return {
    x: clampInteger(finite(point.x), 0, imageWidth),
    y: clampInteger(finite(point.y), 0, imageHeight),
  }
}

export function pointFromClient(
  clientX: number,
  clientY: number,
  rect: ClientRect,
  width: number,
  height: number,
): AnnotationPoint {
  const scaleX = rect.width > 0 ? width / rect.width : 0
  const scaleY = rect.height > 0 ? height / rect.height : 0
  return clampPoint({
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }, width, height)
}

export function clampBox(box: AnnotationBox, width: number, height: number): AnnotationBox {
  const imageWidth = imageDimension(width)
  const imageHeight = imageDimension(height)
  const x1 = finite(box[0])
  const y1 = finite(box[1])
  const x2 = x1 + finite(box[2])
  const y2 = y1 + finite(box[3])
  const left = clampInteger(Math.min(x1, x2), 0, imageWidth)
  const top = clampInteger(Math.min(y1, y2), 0, imageHeight)
  const right = clampInteger(Math.max(x1, x2), 0, imageWidth)
  const bottom = clampInteger(Math.max(y1, y2), 0, imageHeight)
  return [left, top, Math.max(0, right - left), Math.max(0, bottom - top)]
}

export function boxFromPoints(
  start: AnnotationPoint,
  end: AnnotationPoint,
  width: number,
  height: number,
): AnnotationBox | null {
  const first = clampPoint(start, width, height)
  const second = clampPoint(end, width, height)
  const box = clampBox([
    Math.min(first.x, second.x),
    Math.min(first.y, second.y),
    Math.abs(second.x - first.x),
    Math.abs(second.y - first.y),
  ], width, height)
  return box[2] > 0 && box[3] > 0 ? box : null
}

export function moveBox(box: AnnotationBox, dx: number, dy: number, width: number, height: number): AnnotationBox {
  const current = clampBox(box, width, height)
  const imageWidth = imageDimension(width)
  const imageHeight = imageDimension(height)
  const nextX = clampInteger(current[0] + Math.round(finite(dx)), 0, Math.max(0, imageWidth - current[2]))
  const nextY = clampInteger(current[1] + Math.round(finite(dy)), 0, Math.max(0, imageHeight - current[3]))
  return [nextX, nextY, current[2], current[3]]
}

export function nudgeBox(box: AnnotationBox, dx: number, dy: number, width: number, height: number): AnnotationBox {
  return moveBox(box, dx, dy, width, height)
}

export function boxesEqual(left: AnnotationBox, right: AnnotationBox): boolean {
  return left.every((value, index) => value === right[index])
}
