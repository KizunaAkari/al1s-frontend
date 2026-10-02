import type { ImageUse, Rect } from './image-binding'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function savedRegion(value: unknown, use: ImageUse): Rect | undefined {
  const step = record(value)
  const assertion = record(step.post_assertion), skip = record(step.skip_condition)
  let area: unknown
  if (use === 'template') area = step.template_rect
  else if (use === 'click') area = step.click_template_rect
  else if (use === 'assertion') area = assertion.template_rect
  else if (use === 'assertion_ocr') area = assertion.search_region
  else if (use === 'region') area = skip.region
  else if (use === 'skip') area = skip.preview_rect
  else if (use === 'ocr_region') area = step.search_region
  else if (use === 'point') area = { ...record(step.action === 'tap' ? step : step.click), width: 1, height: 1 }
  else if (use === 'swipe_start' || use === 'swipe_end') {
    const swipe = record(step.swipe), start = use === 'swipe_start'
    area = { x: swipe[start ? 'x1' : 'x2'], y: swipe[start ? 'y1' : 'y2'], width: 1, height: 1 }
  }
  const rect = record(area)
  if (![rect.x, rect.y, rect.width, rect.height].every(v => typeof v === 'number' && Number.isInteger(v))) return
  if (Number(rect.x) < 0 || Number(rect.y) < 0 || Number(rect.width) < 1 || Number(rect.height) < 1) return
  return rect as Rect
}

export function savedRegionImage(value: unknown, use: ImageUse): unknown {
  const step = record(value)
  if (use === 'template') return step.template_base64
  if (use === 'click') return step.click_template_base64
  if (use === 'assertion') return record(step.post_assertion).template_base64
  if (use === 'skip') return record(step.skip_condition).preview_base64
  return record(step.region_previews)[`${use}_base64`]
}
