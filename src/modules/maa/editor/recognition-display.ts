import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
import { savedRegion, savedRegionImage } from './region-selection'

export const recognitionActions = ['wait_click', 'wait_image', 'smart_swipe', 'recognize_execute', 'wait_text', 'click_text']
export function textRecognition(step: WorkflowStep) {
  return ['wait_text', 'click_text'].includes(step.action) ||
    (step.action === 'recognize_execute' && step.recognition_mode === 'text')
}
export function recognitionDisplay(step: WorkflowStep) {
  const text = textRecognition(step), area = text ? savedRegion(step, 'ocr_region') : undefined
  const resource = text ? area ? savedRegionImage(step, 'ocr_region') : undefined : step.template_base64
  const blob = resource && typeof resource === 'object' && '$blob' in resource ? String(resource.$blob) : undefined
  const inline = typeof resource === 'string' && resource.startsWith('data:image/png;base64,') ? resource : undefined
  return { text, blob, inline, target: typeof step.text === 'string' ? step.text : '',
    kind: text ? 'OCR 文字' : '图片匹配',
    binding: blob || inline ? text ? '文字区域已绑定' : '识别图片已绑定' : '',
    empty: text ? area ? '已设置文字区域，暂无选区图片' : '全屏文字识别（未设置选区图片）' : '未绑定识别图片',
  }
}
