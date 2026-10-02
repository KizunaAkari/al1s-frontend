import { describe, expect, it } from 'vitest'

import { formatDailyTimes, formatDateTime } from '../src/shared/presentation/format'
import { statusLabel, statusTone } from '../src/shared/presentation/status'

describe('presentation helpers', () => {
  it('keeps lifecycle and result language distinct', () => {
    expect(statusLabel('running')).toBe('执行中')
    expect(statusLabel('failure')).toBe('失败')
    expect(statusTone('timed_out')).toBe('danger')
    expect(statusLabel(null)).toBe('---')
  })

  it('formats schedules without inventing missing values', () => {
    expect(formatDailyTimes(['11:00:00', '19:00:00'])).toBe('11:00、19:00')
    expect(formatDailyTimes([])).toBe('---')
    expect(formatDateTime(null)).toBe('---')
  })
})
