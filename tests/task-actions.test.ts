import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../src/shared/api/client'
import {
  cancelSingleTask,
  controlSchedule,
  deleteTaskHistory,
  fetchScheduleOccurrences,
  reviseTimedSchedule,
} from '../src/shared/api/tasks'

afterEach(() => vi.restoreAllMocks())

describe('task center management API', () => {
  it('protects task cancellation and history deletion with the current row version', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: undefined })
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: undefined })

    await cancelSingleTask({ task_id: 'task-1', row_version: 4 })
    await deleteTaskHistory({ task_id: 'task-1', row_version: 5 })

    expect(post).toHaveBeenCalledWith('/tasks/task-1/cancel', { expected_version: 4 })
    expect(remove).toHaveBeenCalledWith('/tasks/task-1', {
      data: { expected_version: 5 },
    })
  })

  it('uses the schedule row version for lifecycle commands', async () => {
    const response = {
      schedule_id: 'schedule-1',
      task_request_id: 'task-1',
      schedule_type: 'loop' as const,
      status: 'paused' as const,
      total_occurrences: 14,
      current_revision: null,
      row_version: 8,
      paused_at: '2026-09-04T12:00:00Z',
      completed_at: null,
    }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: response })

    await expect(
      controlSchedule({ schedule_id: 'schedule-1', row_version: 7 }, 'pause'),
    ).resolves.toEqual(response)
    expect(post).toHaveBeenCalledWith('/task-schedules/schedule-1/pause', {
      expected_version: 7,
    })
  })

  it('submits a new timed definition without rewriting old revisions', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        schedule: {},
        revision: 3,
        changed: true,
        retained_occurrences: 2,
        cancelled_occurrences: 1,
        added_occurrences: 4,
      },
    })

    await reviseTimedSchedule(
      { schedule_id: 'schedule-1', row_version: 9 },
      {
        start_date: '2026-09-04',
        end_date: '2026-09-18',
        daily_times: ['11:00:00', '19:00:00'],
      },
    )

    expect(post).toHaveBeenCalledWith('/task-schedules/schedule-1/revision', {
      expected_version: 9,
      start_date: '2026-09-04',
      end_date: '2026-09-18',
      daily_times: ['11:00:00', '19:00:00'],
    })
  })

  it('requests current and historical occurrence pages explicitly', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { items: [], next_cursor: null },
    })

    await fetchScheduleOccurrences('schedule-1', null, 'current')
    await fetchScheduleOccurrences('schedule-1', 'cursor-1', 'history')

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/task-schedules/schedule-1/occurrences',
      { params: { cursor: undefined, limit: 50, scope: 'current' } },
    )
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/task-schedules/schedule-1/occurrences',
      { params: { cursor: 'cursor-1', limit: 50, scope: 'history' } },
    )
  })
})
