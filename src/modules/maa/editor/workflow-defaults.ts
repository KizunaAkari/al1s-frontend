import type { CoreWorkflowStep, WorkflowStep } from '../../../shared/api/maa-script-editor'

export function newWorkflowStep(action: string): WorkflowStep {
  switch (action) {
    case 'wait':
      return { action, seconds: 1 } satisfies CoreWorkflowStep
    case 'wait_random':
      return { action, min_seconds: 1, max_seconds: 2, timeout_seconds: 20 } satisfies CoreWorkflowStep
    case 'recognize_execute':
      return { action, recognition_mode: 'image', execution_mode: 'fixed_tap',
        threshold: 0.85, poll_interval_seconds: 1, timeout_seconds: 20,
        execution_count: 1, execution_interval_ms: 120,
        click: { x: 0, y: 0 } } satisfies CoreWorkflowStep
    case 'feedback':
      return { action, message: '' } satisfies CoreWorkflowStep
    case 'wait_image':
      return { action, threshold: 0.85, timeout_seconds: 20, poll_interval_seconds: 1,
        consecutive_match_count: 1 } satisfies CoreWorkflowStep
    case 'wait_click':
      return { action, threshold: 0.85, timeout_seconds: 20, poll_interval_seconds: 1,
        click_mode: 'match_center' } satisfies CoreWorkflowStep
    case 'smart_swipe':
      return { action, threshold: 0.85, timeout_seconds: 20, poll_interval_seconds: 1,
        mode: 'until_image', swipe: { x1: 0, y1: 0, x2: 0, y2: 0, duration_ms: 350 } } satisfies CoreWorkflowStep
    case 'wait_text':
    case 'click_text':
      return { action, text: '', timeout_seconds: 30, poll_interval_seconds: 1 } satisfies CoreWorkflowStep
    case 'tap':
      return { action, x: 0, y: 0 } satisfies CoreWorkflowStep
    case 'swipe':
      return { action, x1: 0, y1: 0, x2: 0, y2: 0, duration_ms: 300 } satisfies CoreWorkflowStep
    default:
      return { action }
  }
}
