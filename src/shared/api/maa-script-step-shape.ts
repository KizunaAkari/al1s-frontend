/** Type checks for fields the editor reads; business ranges remain server owned. */

type Step = Record<string, unknown> & { action: string }

const requiredNumbers: Record<string, readonly string[]> = {
  tap: ['x', 'y'], swipe: ['x1', 'y1', 'x2', 'y2', 'duration_ms'],
  wait: ['seconds'], course_schedule: [
    'course_action_timeout_seconds', 'course_region_count', 'course_ticket_limit',
  ],
  wait_random: ['min_seconds', 'max_seconds'],
}
const optionalNumbers: Record<string, readonly string[]> = {
  wait_text: ['poll_interval_seconds'], click_text: ['poll_interval_seconds'],
  launch_app: ['wait_seconds'],
  wait_image: ['threshold', 'poll_interval_seconds', 'consecutive_match_count'],
  smart_swipe: [
    'threshold', 'poll_interval_seconds', 'swipe_duration_ms', 'swipe_for_seconds',
    'wait_after_swipe_seconds',
  ],
  wait_click: [
    'threshold', 'poll_interval_seconds', 'click_count', 'click_interval_ms',
    'click_threshold', 'marker_component_max_area', 'marker_component_min_area',
    'marker_group_distance', 'match_index', 'match_max_clicks', 'match_offset_x',
    'match_offset_y', 'wait_after_click_seconds',
  ],
  recognize_execute: ['threshold', 'poll_interval_seconds', 'click_threshold',
    'execution_count', 'execution_interval_ms'],
}
const requiredStrings: Record<string, readonly string[]> = {
  wait_text: ['text'], click_text: ['text'], launch_app: ['package'],
}
const optionalStrings: Record<string, readonly string[]> = {
  launch_app: ['activity'], feedback: ['subject', 'message'],
}
const rectangles: Record<string, readonly string[]> = {
  wait_text: ['search_region'], click_text: ['search_region'],
  wait_image: ['template_rect'], smart_swipe: ['template_rect'],
  wait_click: ['template_rect', 'click_template_rect', 'search_region'],
  recognize_execute: ['template_rect', 'click_template_rect', 'search_region'],
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function fields(
  step: Record<string, unknown>, names: readonly string[] | undefined,
  valid: (value: unknown) => boolean,
  nullable = false,
): boolean {
  return (names ?? []).every(name => !(name in step) ||
    (nullable && step[name] === null) || valid(step[name]))
}

function coordinates(value: unknown, keys: readonly string[], complete = false): boolean {
  return record(value) && keys.every(key =>
    (!complete && !(key in value)) || number(value[key]))
}

function rectangle(value: unknown): boolean {
  return coordinates(value, ['x', 'y', 'width', 'height'], true) && record(value) &&
    Object.keys(value).length === 4
}

function imageBranch(value: unknown): boolean {
  if (!record(value)) return false
  return fields(value, ['id', 'name'], item => typeof item === 'string', true) &&
    fields(value, [
      'threshold', 'click_threshold', 'click_count', 'click_interval_ms',
      'timeout_seconds', 'click_timeout_seconds', 'wait_after_click_seconds',
    ], number, true) &&
    fields(value, [
      'template_rect', 'click_template_rect', 'search_region', 'click_search_region',
    ], rectangle, true) &&
    fields(value, ['click_mode'], item => item === 'image' || item === 'match_center')
}

export function hasValidCoreFieldTypes(step: Step): boolean {
  const action = step.action
  if (['back', 'home', 'task_view'].includes(action) &&
    !fields(step, ['wait_before_execution_seconds', 'wait_after_execution_seconds'], number, true)) return false
  if (['recognize_execute', 'wait_click', 'wait_image', 'wait_text', 'click_text', 'smart_swipe'].includes(action) &&
    !fields(step, ['wait_after_execution_seconds'], number, true)) return false
  if (!fields(step, ['timeout_seconds'], number, true) ||
    !fields(step, requiredNumbers[action], number) ||
    !fields(step, optionalNumbers[action], number, true) ||
    !fields(step, requiredStrings[action], value => typeof value === 'string') ||
    !fields(step, optionalStrings[action], value => typeof value === 'string', true) ||
    !fields(step, rectangles[action], rectangle, true)) return false

  if (action === 'launch_app' && !fields(step, ['force_stop_before_launch'],
    value => typeof value === 'boolean')) return false
  if (action === 'smart_swipe' && (
    !fields(step, ['mode'], value => value === 'after_image' || value === 'until_image') ||
    !fields(step, ['swipe'], value => coordinates(value, ['x1', 'y1', 'x2', 'y2', 'duration_ms']))
  )) return false
  if (action === 'wait_click' && (
    !fields(step, ['click_mode'], value => typeof value === 'string' && [
      'color_marker', 'fixed', 'image', 'match_center', 'match_offset', 'template_center',
    ].includes(value)) ||
    !fields(step, ['click'], value => coordinates(value, ['x', 'y']), true) ||
    !fields(step, ['image_branches'], value => Array.isArray(value) && value.every(imageBranch), true)
  )) return false
  if (action === 'recognize_execute' && (
    !fields(step, ['recognition_mode'], value => value === 'image' || value === 'text') ||
    !fields(step, ['execution_mode'], value => ['fixed_tap', 'fixed_swipe', 'image_center', 'match_center'].includes(String(value))) ||
    !fields(step, ['text'], value => typeof value === 'string') ||
    !fields(step, ['click'], value => coordinates(value, ['x', 'y']), true) ||
    !fields(step, ['swipe'], value => coordinates(value, ['x1', 'y1', 'x2', 'y2', 'duration_ms']), true)
  )) return false
  if (action === 'course_schedule' && !fields(step, ['course_target_avatars'], Array.isArray))
    return false
  return true
}
