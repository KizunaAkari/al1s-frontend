import type { QuickTestDetail, QuickTestEvent } from '../../../shared/api/maa-quick-test'
import { ruleEvent } from './quick-test-rule-events'

export type DebugProgress = {
  sessionId: string | null
  versionId: string | null
  step: number | null
  phase: 'idle' | 'waiting' | 'running' | 'passed' | 'failed' | 'finished' | 'cancelled' | 'expired'
  completed: number[]
  ruleName?: string | null
}

export function debugProgress(detail: QuickTestDetail | undefined, events: QuickTestEvent[]): DebugProgress {
  const result: DebugProgress = { sessionId: detail?.session_id ?? null,
    versionId: detail?.candidate_version_id ?? null, step: null, phase: 'idle', completed: [] }
  if (!detail) return result
  result.phase = detail.started_at ? 'running' : 'waiting'
  let lastFailure: number | null = null
  let activeRule: string | undefined
  const completed = new Set<number>()
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const rule = ruleEvent(event)
    if (rule) {
      if (rule.phase === 'started' || rule.phase === 'failed') {
        activeRule = rule.key
        result.ruleName = rule.name
        result.phase = 'running'
      } else if (activeRule === rule.key) {
        activeRule = undefined
        result.ruleName = null
      }
      continue
    }
    if (!event.step_number) continue
    if (event.kind === 'step_started') {
      activeRule = undefined
      result.ruleName = null
      result.step = event.step_number
      result.phase = 'running'
      completed.delete(event.step_number)
    } else if (event.kind === 'step_succeeded') completed.add(event.step_number)
    else if (event.kind === 'step_failed') lastFailure = event.step_number
  }
  if (detail.status === 'completed') {
    result.phase = detail.qualification_status === 'passed' ? 'passed'
      : detail.qualification_status === 'failed' || detail.failed_step_number || detail.error_code ? 'failed' : 'finished'
    if (result.phase === 'failed') {
      if (detail.failure_detail?.rule_name) result.ruleName = detail.failure_detail.rule_name
      result.step = detail.failed_step_number ?? lastFailure ?? result.step
      if (result.step && !result.ruleName) completed.delete(result.step)
    } else result.ruleName = null
  } else if (detail.status === 'expired' || detail.status === 'cancelled') {
    result.phase = detail.status
    result.ruleName = null
  }
  result.completed = [...completed].sort((a, b) => a - b)
  return result
}
