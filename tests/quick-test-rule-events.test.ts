import { expect, it } from 'vitest'
import { debugProgress } from '../src/modules/maa/editor/quick-test-progress'
import { ruleEventLabel } from '../src/modules/maa/editor/quick-test-rule-events'
import { quickTestFailureLines } from '../src/modules/maa/editor/quick-test-failure'
import type { QuickTestDetail, QuickTestEvent, QuickTestFailureDetail } from '../src/shared/api/maa-quick-test'

const detail: QuickTestDetail = { session_id: 's', candidate_version_id: 'v', status: 'claimed',
  started_at: '2026-09-30T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
  qualification_status: null, error_code: null, step_number: null, failed_step_number: null }
function rule(phase: string, sequence: number): QuickTestEvent {
  return { sequence, kind: 'log', step_number: null, code: `maa_rule_${phase}:recovery:abc:0`,
    rule_name: '通知', created_at: '' }
}
const main: QuickTestEvent[] = [
  { sequence: 1, kind: 'step_started', step_number: 3, code: null, created_at: '' },
  { sequence: 2, kind: 'step_succeeded', step_number: 3, code: null, created_at: '' },
]
it('shows independent events as 00 without generating a main-step completion or start', () => {
  const started = rule('started', 3)
  expect(ruleEventLabel(started)).toBe('00 · 全局规则 · 通知 · 开始处理')
  expect(debugProgress(detail, [...main, started])).toMatchObject({ step: 3, completed: [3], ruleName: '通知' })
  expect(debugProgress(detail, [...main, started, rule('succeeded', 4)]))
    .toMatchObject({ completed: [3], ruleName: null })
  expect(debugProgress(detail, [...main, started, rule('failed', 4)]))
    .toMatchObject({ phase: 'running', completed: [3], ruleName: '通知' })
})
it('preserves single-step and legacy main-step numbers', () => {
  expect(debugProgress(detail, [{ ...main[0]!, step_number: 7 }])).toMatchObject({ step: 7, ruleName: null })
  expect(ruleEventLabel({ ...rule('started', 1), code: 'old-code' })).toBeUndefined()
  expect(ruleEventLabel({ ...rule('started', 1), step_number: 3 })).toBeUndefined()
})
it('uses the rule identity in the final failure and labels its main step as context', () => {
  const failure: QuickTestFailureDetail = { step_number: 4, script_name: '开始脚本', rule_name: '通知',
    stage: 'click_target', algorithm: 'TemplateMatch', best_score: 0.3, threshold: 0.8,
    consecutive_misses: 7, timeout_seconds: 30, elapsed_seconds: 31 }
  expect(debugProgress({ ...detail, status: 'completed', qualification_status: 'failed',
    failed_step_number: 4, failure_detail: failure }, main))
    .toMatchObject({ phase: 'failed', ruleName: '通知', completed: [3] })
  expect(quickTestFailureLines(failure)[0]).toContain('00 · 全局规则“通知”（关联主步骤 04）')
})
