import type { SavedScript, ScriptType } from './types'

export type InteractionMode = 'none' | 'template' | 'click_template' | 'click' | 'swipe' | 'ocr_region' | 'assertion_template'
export type PhoneMode = 'control' | 'annotate'
export type ScreenOrigin = 'terminal' | 'imported'
export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type EditorScriptType = Exclude<ScriptType, 'invalid'>

export interface SkipCondition {
  enabled: boolean
  /** Editor-only id of the later event to jump to. Serialized as a 1-based index. */
  skip_to_step_id?: string
  skip_to_step_index?: number
  mode?: 'numeric' | 'image'
  operator: 'gt' | 'lt'
  value: number
  threshold?: number
  region?: Rect
  preview_base64?: string
}

export interface PostAssertion {
  enabled: boolean
  template_base64?: string
  template_rect?: Rect
  threshold: number
  timeout_seconds: number
  poll_interval_seconds: number
  max_retries: number
}

export interface FailureRetry {
  enabled: boolean
  max_retries: number
  process_script_name: string
}

export interface EditorStep {
  id: string
  action: string
  template_base64?: string
  template_rect?: Rect
  click_template_base64?: string
  click_template_rect?: Rect
  click_threshold?: number
  click?: Point
  click_mode?: 'image' | 'fixed' | 'match_offset' | 'template_center' | 'match_center'
  click_count?: number
  click_interval_ms?: number
  match_order?: 'Horizontal' | 'Vertical' | 'Score'
  match_index?: number
  match_anchor?: 'center' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  match_offset_x?: number
  match_offset_y?: number
  match_max_clicks?: number
  wait_after_click_seconds?: number
  swipe?: { x1: number; y1: number; x2: number; y2: number; duration_ms: number }
  swipe_duration_ms?: number
  threshold?: number
  timeout_seconds?: number
  poll_interval_seconds?: number
  wait_after_swipe_seconds?: number
  swipe_for_seconds?: number
  mode?: 'until_image' | 'after_image'
  package?: string
  activity?: string
  wait_seconds?: number
  force_stop_before_launch?: boolean
  seconds?: number
  subject?: string
  message?: string
  skip_condition?: SkipCondition
  post_assertion?: PostAssertion
  failure_retry?: FailureRetry
  [key: string]: unknown
}

export interface GlobalPopupRule {
  id: string
  name: string
  enabled: boolean
  step_ids: string[]
  template_base64?: string
  template_rect?: Rect
  click_template_base64?: string
  click_template_rect?: Rect
  click_threshold?: number
  click?: Point
  click_mode: 'image' | 'fixed' | 'template_center' | 'match_center'
  click_count: number
  click_interval_ms: number
  threshold: number
  cooldown_seconds: number
  wait_after_click_seconds: number
}

export const eventDefinitions = [
  { action: 'wait_click', label: '点击事件', hint: '等待图片后单击、双击或连续点击' },
  { action: 'smart_swipe', label: '滑动事件', hint: '滑动直到出现或出现后滑动' },
  { action: 'back', label: '返回事件', hint: '调用 Android 系统返回键' },
  { action: 'home', label: '主页事件', hint: '强制返回系统主界面' },
  { action: 'launch_app', label: '打开应用', hint: '自动捕获当前打开的应用并记住' },
  { action: 'wait_image', label: '等待画面', hint: '等待图片出现但不操作' },
  { action: 'wait', label: '等待事件', hint: '暂停 N 秒后继续下一步' },
  { action: 'feedback', label: '反馈事件', hint: '截图并通过平台邮件发送成功反馈' },
] as const

export function createEditorId(prefix = 'step') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function displayScriptName(name: string) {
  return name.trim().replace(/\.json$/i, '')
}

export function storageScriptName(name: string) {
  return `${displayScriptName(name)}.json`
}

function legacyCenterFromRect(value: unknown): Point | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rect = value as Partial<Rect>
  const x = Number(rect.x)
  const y = Number(rect.y)
  const width = Number(rect.width)
  const height = Number(rect.height)
  if (![x, y, width, height].every(Number.isFinite)) return undefined
  return { x: x + Math.round(width / 2), y: y + Math.round(height / 2) }
}

export function migratedClickFields(value: Record<string, unknown>) {
  const oldMode = String(value.click_mode || '')
  if (oldMode === 'match_offset') {
    const order = String(value.match_order || 'Vertical')
    const anchor = String(value.match_anchor || 'center')
    return {
      click_mode: 'match_offset' as const,
      match_order: ['Horizontal', 'Vertical', 'Score'].includes(order)
        ? order as 'Horizontal' | 'Vertical' | 'Score'
        : 'Vertical' as const,
      match_index: Number(value.match_index ?? 1),
      match_anchor: ['center', 'top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(anchor)
        ? anchor as 'center' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
        : 'center' as const,
      match_offset_x: Number(value.match_offset_x ?? 0),
      match_offset_y: Number(value.match_offset_y ?? 0),
      match_max_clicks: Number(value.match_max_clicks ?? 50),
      wait_after_click_seconds: Number(value.wait_after_click_seconds ?? 0.7),
    }
  }
  if (oldMode === 'image' || value.click_template_base64) {
    return {
      click_mode: 'image' as const,
      click_template_base64: value.click_template_base64,
      click_template_rect: value.click_template_rect,
      click_threshold: Number(value.click_threshold ?? value.threshold ?? 0.85),
    }
  }
  if (oldMode === 'match_center') {
    return {
      click_mode: 'image' as const,
      click_template_base64: value.template_base64,
      click_template_rect: value.template_rect,
      click_threshold: Number(value.threshold ?? 0.85),
    }
  }
  return {
    click_mode: 'fixed' as const,
    click: value.click || (oldMode === 'template_center' ? legacyCenterFromRect(value.template_rect) : undefined),
    click_threshold: Number(value.click_threshold ?? value.threshold ?? 0.85),
  }
}

export function migratedPostAssertion(value: unknown): PostAssertion | undefined {
  if (!value || typeof value !== 'object') return undefined
  const assertion = value as Partial<PostAssertion>
  return {
    ...assertion,
    enabled: assertion.enabled === true,
    threshold: Number(assertion.threshold ?? 0.85),
    timeout_seconds: Number(assertion.timeout_seconds ?? 3),
    poll_interval_seconds: Number(assertion.poll_interval_seconds ?? 0.5),
    max_retries: Number(assertion.max_retries ?? 2),
  }
}

export function migratedFailureRetry(value: unknown): FailureRetry | undefined {
  if (!value || typeof value !== 'object') return undefined
  const retry = value as Partial<FailureRetry>
  const processScriptName = String(retry.process_script_name || '').trim()
  return {
    enabled: retry.enabled === true && Boolean(processScriptName),
    max_retries: Number(retry.max_retries ?? 2),
    process_script_name: processScriptName,
  }
}

export function migratedSkipCondition(value: unknown): SkipCondition | undefined {
  if (!value || typeof value !== 'object') return undefined
  const condition = value as Partial<SkipCondition> & { skip_remaining_steps?: unknown }
  const { skip_remaining_steps: _legacySkipRemaining, ...rest } = condition
  const target = Number(condition.skip_to_step_index)
  return {
    ...rest,
    enabled: condition.enabled === true,
    skip_to_step_id: '',
    ...(Number.isInteger(target) && target > 0 ? { skip_to_step_index: target } : {}),
    mode: condition.mode === 'image' ? 'image' : 'numeric',
    operator: condition.operator === 'lt' ? 'lt' : 'gt',
    value: Number(condition.value ?? 0),
    threshold: Number(condition.threshold ?? 0.85),
  }
}

export function startStep(): EditorStep {
  return { id: createEditorId(), action: 'start' }
}

export function scriptTypeLabel(value: ScriptType) {
  const labels: Record<ScriptType, string> = {
    standard: '普通脚本',
    module_start: '开始脚本',
    module_process: '过程脚本',
    invalid: '格式无效',
  }
  return labels[value]
}

export function scriptOptionLabel(item: SavedScript) {
  const cleanup = item.script_type === 'module_process' && item.cleanup_on_finish ? ' · 结束清理' : ''
  return `${displayScriptName(item.name)} · ${scriptTypeLabel(item.script_type)}${cleanup}`
}

export function labelFor(action: string) {
  if (action === 'start') return '开始'
  return eventDefinitions.find((item) => item.action === action)?.label || action
}

function stepSummary(step: EditorStep) {
  if (step.action === 'start') return '唤醒屏幕、解除无密码锁屏并返回主页'
  if (step.action === 'wait_click') {
    const count = Number(step.click_count || 1)
    const mode = count === 1 ? '单击' : count === 2 ? '双击' : count === 3 ? '三连击' : `连点 ${count} 次`
    const position = step.click_mode === 'image'
      ? (step.click_template_base64 ? '点击图片中心' : '未设置点击图片')
      : step.click_mode === 'match_offset'
        ? `循环清除第 ${step.match_index ?? 1} 个匹配`
        : (step.click ? `${step.click.x}, ${step.click.y}` : '未设置点击点')
    return `${step.template_base64 ? '已截取目标' : '未设置目标'} · ${mode} ${position}`
  }
  if (step.action === 'smart_swipe') return `${step.mode === 'after_image' ? '图片出现后滑动' : '滑动直到图片出现'} · ${step.swipe ? '轨迹已设置' : '未设置轨迹'}`
  if (step.action === 'launch_app') return step.package || '等待自动识别目标应用'
  if (step.action === 'wait_image') return step.template_base64 ? '目标图片已设置' : '未设置目标图片'
  if (step.action === 'wait') return `等待 ${step.seconds ?? 1} 秒`
  if (step.action === 'feedback') return step.subject?.trim() || '截图并发送到通知收件人'
  if (step.action === 'back') return 'KEYCODE_BACK'
  if (step.action === 'home') return 'KEYCODE_HOME'
  return '兼容步骤'
}

export function displayStepSummary(step: EditorStep) {
  const condition = step.skip_condition
  const skipScope = condition?.skip_to_step_id ? '跳转到指定后续事件' : '跳过当前事件'
  const guard = condition?.enabled
    ? condition.mode === 'image'
      ? `IF 图片相似度达到 ${condition.threshold ?? 0.85} 时${skipScope}`
      : condition.region
        ? `IF 数值${condition.operator === 'gt' ? '大于' : '小于'} ${condition.value} 时${skipScope}`
        : ''
    : ''
  const assertion = step.post_assertion?.enabled
    ? `断言失败重试 ${step.post_assertion.max_retries ?? 2} 次`
    : ''
  return [guard, stepSummary(step), assertion].filter(Boolean).join(' · ')
}

export function makeStep(action: string): EditorStep {
  const common = { id: createEditorId(), action }
  if (action === 'wait_click') return {
    ...common,
    threshold: 0.85,
    timeout_seconds: 30,
    poll_interval_seconds: 0.5,
    click_mode: 'image',
    click_threshold: 0.85,
    click_count: 1,
    click_interval_ms: 120,
    match_order: 'Vertical',
    match_index: 1,
    match_anchor: 'center',
    match_offset_x: 0,
    match_offset_y: 0,
    match_max_clicks: 50,
    wait_after_click_seconds: 0.7,
  }
  if (action === 'smart_swipe') return {
    ...common,
    mode: 'until_image',
    threshold: 0.85,
    timeout_seconds: 45,
    poll_interval_seconds: 0.5,
    wait_after_swipe_seconds: 0.7,
    swipe_for_seconds: 5,
    swipe_duration_ms: 350,
  }
  if (action === 'wait_image') return { ...common, threshold: 0.85, timeout_seconds: 30, poll_interval_seconds: 0.5 }
  if (action === 'launch_app') return {
    ...common,
    package: '',
    activity: '',
    wait_seconds: 1,
    force_stop_before_launch: true,
  }
  if (action === 'wait') return { ...common, seconds: 1 }
  if (action === 'feedback') return {
    ...common,
    subject: '',
    message: '脚本已执行到反馈步骤，当前手机画面见附件。',
  }
  return common
}
