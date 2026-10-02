export type FrameSize = { width: number; height: number }
export type PickedPoint = FrameSize & { x: number; y: number }
export function videoPoint(clientX: number, clientY: number, rect: {left:number;top:number;width:number;height:number}, size: FrameSize): PickedPoint | null {
  if (![clientX, clientY, rect.left, rect.top].every(Number.isFinite) || ![rect.width, rect.height, size.width, size.height].every(n => Number.isFinite(n) && n > 0)) return null
  const scale = Math.min(rect.width / size.width, rect.height / size.height)
  const w = size.width * scale, h = size.height * scale
  const x = clientX - rect.left - (rect.width - w) / 2, y = clientY - rect.top - (rect.height - h) / 2
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  return { x: Math.floor(x / scale), y: Math.floor(y / scale), ...size }
}
export function nativePoint(p: PickedPoint, size: FrameSize): PickedPoint {
  if (![p.x,p.y].every(Number.isFinite) || p.x < 0 || p.y < 0 || p.x >= p.width || p.y >= p.height) throw new Error('拾取坐标超出画面范围')
  if (![p.width,p.height,size.width,size.height].every(n=>Number.isFinite(n)&&n>0)
    || Math.abs(p.width / p.height - size.width / size.height) > 0.005) throw new Error('视频与原始截图方向或比例不同，请重新截图后拾取')
  return { ...size, x: Math.min(size.width-1,Math.floor(p.x * size.width / p.width)), y: Math.min(size.height-1,Math.floor(p.y * size.height / p.height)) }
}
