/** Editor-facing action names in maa-dsl-v2.2. Extension payloads remain opaque. */
import { hasValidCoreFieldTypes } from './maa-script-step-shape'

export const coreWorkflowActions = [
  'back', 'cleanup', 'course_schedule', 'feedback', 'screenshot', 'home',
  'task_view', 'launch_app', 'smart_swipe', 'start', 'wait', 'wait_click',
  'wait_image', 'wait_text', 'click_text', 'tap', 'swipe', 'wait_random',
  'recognize_execute',
] as const

export type CoreWorkflowAction = typeof coreWorkflowActions[number]

// Fields are optional here because the editor also holds incomplete drafts. The
// platform validator checks required fields and ranges before a version is saved.
type CommonStep = {
  wait_before_execution_seconds?: number | null
  wait_after_execution_seconds?: number | null
  failure_retry?: unknown
  post_assertion?: unknown
  skip_condition?: unknown
  timeout_seconds?: number | null
}
type Nullable<T> = T | null
type Point = { x?: number; y?: number }
type Rect = { x: number; y: number; width: number; height: number }
type Recognition = {
  template_base64?: unknown
  template_rect?: Nullable<Rect>
  threshold?: Nullable<number>
  poll_interval_seconds?: Nullable<number>
  wait_after_execution_seconds?: Nullable<number>
}
type SwipeCoordinates = { x1?: number; y1?: number; x2?: number; y2?: number; duration_ms?: number }
export type CoreImageBranch = Record<string, unknown> & {
  id?: string | null
  name?: string | null
  template_rect?: Rect | null
  threshold?: number | null
  click_mode?: 'image' | 'match_center'
  click_template_rect?: Rect | null
  click_threshold?: number | null
  click_count?: number | null
  click_interval_ms?: number | null
  timeout_seconds?: number | null
  click_timeout_seconds?: number | null
  wait_after_click_seconds?: number | null
  search_region?: Rect | null
  click_search_region?: Rect | null
}
type ClickFields = {
  click_mode?: 'color_marker' | 'fixed' | 'image' | 'match_center' | 'match_offset' | 'template_center'
  click?: Nullable<Point>
  click_count?: Nullable<number>
  click_interval_ms?: Nullable<number>
  click_template_base64?: unknown
  click_template_rect?: Nullable<Rect>
  click_threshold?: Nullable<number>
  image_branches?: CoreImageBranch[] | null
  marker_absence_checks?: unknown
  marker_component_max_area?: Nullable<number>
  marker_component_min_area?: Nullable<number>
  marker_group_distance?: Nullable<number>
  marker_hsv_lower?: unknown
  marker_hsv_upper?: unknown
  match_anchor?: unknown
  match_index?: Nullable<number>
  match_max_clicks?: Nullable<number>
  match_offset_x?: Nullable<number>
  match_offset_y?: Nullable<number>
  match_order?: unknown
  search_region?: Nullable<Rect>
  wait_after_click_seconds?: Nullable<number>
}

export type CoreWorkflowStep = CommonStep & (
  | { action: 'tap'; x?: number; y?: number }
  | ({ action: 'swipe' } & Partial<SwipeCoordinates>)
  | { action: 'wait'; seconds?: number }
  | { action: 'wait_random'; min_seconds?: number; max_seconds?: number }
  | { action: 'recognize_execute'; recognition_mode?: 'image' | 'text';
      execution_mode?: 'fixed_tap' | 'fixed_swipe' | 'image_center' | 'match_center'; text?: string;
      search_region?: Nullable<Rect>; click?: Nullable<Point>; swipe?: SwipeCoordinates;
      click_template_base64?: unknown; click_template_rect?: Nullable<Rect>;
      click_threshold?: Nullable<number>; execution_count?: number;
      execution_interval_ms?: number } & Recognition
  | { action: 'wait_text' | 'click_text'; text?: string; search_region?: Nullable<Rect>; poll_interval_seconds?: Nullable<number>;
      wait_after_execution_seconds?: Nullable<number> }
  | { action: 'launch_app'; package?: string; activity?: Nullable<string>; force_stop_before_launch?: boolean; wait_seconds?: Nullable<number> }
  | { action: 'wait_image'; consecutive_match_count?: Nullable<number> } & Recognition
  | { action: 'smart_swipe'; mode?: 'after_image' | 'until_image'; swipe?: SwipeCoordinates;
      swipe_duration_ms?: Nullable<number>; swipe_for_seconds?: Nullable<number>;
      wait_after_swipe_seconds?: Nullable<number> } & Recognition
  | ({ action: 'wait_click' } & Recognition & ClickFields)
  | { action: 'course_schedule'; course_action_timeout_seconds?: number; course_region_count?: number;
      course_ticket_limit?: number; course_target_avatars?: unknown[] }
  | { action: 'feedback'; message?: Nullable<string>; subject?: Nullable<string> }
  | { action: 'back' | 'cleanup' | 'screenshot' | 'home' | 'start' | 'task_view' }
)

export type WorkflowStep = Record<string, unknown> & { action: string }
export type ScriptDocument = Record<string, unknown> & { steps: WorkflowStep[] }

export function isCoreWorkflowStep(step: WorkflowStep): step is WorkflowStep & CoreWorkflowStep {
  return coreWorkflowActions.includes(step.action as CoreWorkflowAction) &&
    hasValidCoreFieldTypes(step)
}

/** Check known field types at ingress; the platform owns required fields and ranges. */
export function parseScriptDocument(value: unknown): ScriptDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('脚本文档格式无效')
  const document = value as Record<string, unknown>
  if (document.version !== 2)
    throw new Error('不支持的脚本文档版本')
  if (!Array.isArray(document.steps) || document.steps.length > 1000 ||
    document.steps.some(step => !step || typeof step !== 'object' || Array.isArray(step) ||
      typeof step.action !== 'string' || !step.action.trim() ||
      (coreWorkflowActions.includes(step.action as CoreWorkflowAction) &&
        !isCoreWorkflowStep(step as WorkflowStep))))
    throw new Error('脚本步骤格式无效')
  return value as ScriptDocument
}
