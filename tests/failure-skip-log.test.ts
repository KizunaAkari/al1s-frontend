import { expect, it } from 'vitest'
import { failureSkipEvent, failureSkipLabel } from '../src/modules/maa/editor/quick-test-failure-skip'

it.each(['maa_failure_skipped:recognition:step_timeout', 'maa_failure_skipped:recognition:step_timeout:2'])('shows the persisted log code %s with a null step field', code => {
  expect(failureSkipLabel({kind:'log', step_number:null, code, sequence:6, created_at:'2026-10-01T04:49:17Z'}))
    .toBe('识别失败已跳过（步骤超时）')
})

it('reads the step from the code and rejects invalid numbers', () => {
  const event = {kind:'log' as const, step_number:null, code:'maa_failure_skipped:recognition:step_timeout:6', sequence:1, created_at:'2026-10-01T00:00:00Z'}
  expect(failureSkipEvent(event)?.step).toBe(6)
  expect(failureSkipEvent({...event, code:'maa_failure_skipped:recognition:step_timeout:1001'})).toBeUndefined()
})
