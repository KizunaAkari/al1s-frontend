import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
import { savedRegion, savedRegionImage } from './region-selection'

export const recognitionActions = ['wait_click', 'wait_image', 'smart_swipe', 'recognize_execute', 'wait_text', 'click_text']
export function textRecognition(step: WorkflowStep) {
  return ['wait_text', 'click_text'].includes(step.action) ||
    (step.action === 'recognize_execute' && step.recognition_mode === 'text')
}
export function colorMarkerRecognition(step: WorkflowStep) {
  return step.action === 'wait_click' && step.click_mode === 'color_marker'
}
export function recognitionTitle(step: WorkflowStep, fallback: string) {
  if (step.name || step.title) return String(step.name || step.title)
  if (colorMarkerRecognition(step)) return '颜色标记循环'
  if (step.action === 'recognize_execute' && textRecognition(step) && typeof step.text === 'string' && step.text.trim()) {
    return `识别“${step.text}”并执行`
  }
  return fallback
}
export function recognitionDisplay(step: WorkflowStep) {
  if (colorMarkerRecognition(step)) return { marker: true, text: false, kind: '颜色标记循环',
    blob: undefined, inline: undefined, target: '', binding: '', empty: '' }
  const text = textRecognition(step), area = text ? savedRegion(step, 'ocr_region') : undefined
  const resource = text ? area ? savedRegionImage(step, 'ocr_region') : undefined : step.template_base64
  const blob = resource && typeof resource === 'object' && '$blob' in resource ? String(resource.$blob) : undefined
  const inline = typeof resource === 'string' && resource.startsWith('data:image/png;base64,') ? resource : undefined
  return { marker: false, text, blob, inline, target: typeof step.text === 'string' ? step.text : '',
    kind: text ? 'OCR 文字' : '图片匹配',
    binding: blob || inline ? text ? '文字区域已绑定' : '识别图片已绑定' : '',
    empty: text ? area ? '已设置文字区域，暂无选区图片' : '全屏文字识别（未设置选区图片）' : '未绑定识别图片',
  }
}
