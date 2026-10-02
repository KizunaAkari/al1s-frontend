import { apiClient } from './client'
import type { CursorPage } from './pagination'

export type TaskType = 'single' | 'loop' | 'timed' | 'batch'
export type LifecycleStatus = 'active' | 'completed' | 'cancelled' | 'terminated'
export type ExecutionStatus = 'waiting' | 'queued' | 'running' | 'ended' | 'cancelled' | 'timed_out'
export type ExecutionResult = 'success' | 'failure'

export type ActionAvailability = {
  allowed: boolean
  refusal_code: string | null
  refusal_message: string | null
}

export type TaskHistoryItem = {
  source_module?: string
  logical_content_id?: string
  task_id: string
  name: string
  task_type: TaskType
  lifecycle_status: LifecycleStatus
  schedule_status: string | null
  latest_execution_id: string | null
  latest_execution_status: ExecutionStatus | null
  latest_result: ExecutionResult | null
  batch_summary?: { image_count: number; execution_status: ExecutionStatus; result: ExecutionResult | null } | null
  record_video: boolean
  created_at: string
  completed_at: string | null
  row_version: number
  cancel: ActionAvailability
  delete: ActionAvailability
}

export type ActiveSchedule = {
  task_id: string
  schedule_id: string
  name: string
  schedule_type: Exclude<TaskType, 'single'>
  status: 'active' | 'paused' | 'terminating' | 'terminated' | 'completed'
  timezone: string | null
  start_date: string | null
  end_date: string | null
  daily_times: string[]
  current_revision: number | null
  total_occurrences: number
  settled_occurrences: number
  planned_occurrences: number
  materialized_occurrences: number
  skipped_occurrences: number
  cancelled_occurrences: number
  current_occurrence_ordinal: number | null
  next_occurrence_ordinal: number | null
  row_version: number
  updated_at: string
  pause: ActionAvailability
  resume: ActionAvailability
  terminate: ActionAvailability
  revise: ActionAvailability
}

export type ScheduleMutationResult = {
  schedule_id: string
  task_request_id: string
  schedule_type: TaskType
  status: ActiveSchedule['status']
  total_occurrences: number
  current_revision: number | null
  row_version: number
  paused_at: string | null
  completed_at: string | null
}

export type TimedScheduleRevisionResult = {
  schedule: ScheduleMutationResult
  revision: number
  changed: boolean
  retained_occurrences: number
  cancelled_occurrences: number
  added_occurrences: number
}

export type OccurrenceItem = {
  occurrence_id: string
  schedule_revision_id: string | null
  schedule_revision: number | null
  display_ordinal: number | null
  history_ordinal: number
  scheduled_for: string | null
  status: 'planned' | 'materialized' | 'skipped' | 'cancelled'
  execution_id: string | null
  execution_status: ExecutionStatus | null
  execution_result: ExecutionResult | null
}

export type OccurrenceScope = 'current' | 'history'

type TaskHistoryPageResponse = { items: TaskHistoryItem[]; next_cursor: string | null }
type ActiveSchedulePageResponse = { items: ActiveSchedule[]; next_cursor: string | null }
type OccurrencePageResponse = { items: OccurrenceItem[]; next_cursor: string | null }

export async function fetchTaskHistory(
  cursor: string | null,
): Promise<CursorPage<TaskHistoryItem, string>> {
  const response = await apiClient.get<TaskHistoryPageResponse>('/tasks', {
    params: { cursor: cursor ?? undefined, limit: 30 },
  })
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}

export async function fetchActiveSchedules(
  cursor: string | null,
  sort: 'asc' | 'desc',
): Promise<CursorPage<ActiveSchedule, string>> {
  const response = await apiClient.get<ActiveSchedulePageResponse>('/task-schedules', {
    params: { cursor: cursor ?? undefined, limit: 30, sort },
  })
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}

export async function cancelSingleTask(task: Pick<TaskHistoryItem, 'task_id' | 'row_version'>): Promise<void> {
  await apiClient.post(`/tasks/${task.task_id}/cancel`, { expected_version: task.row_version })
}

export async function deleteTaskHistory(task: Pick<TaskHistoryItem, 'task_id' | 'row_version'>): Promise<void> {
  await apiClient.delete(`/tasks/${task.task_id}`, {
    data: { expected_version: task.row_version },
  })
}

export async function controlSchedule(
  schedule: Pick<ActiveSchedule, 'schedule_id' | 'row_version'>,
  action: 'pause' | 'resume' | 'terminate',
): Promise<ScheduleMutationResult> {
  const response = await apiClient.post<ScheduleMutationResult>(
    `/task-schedules/${schedule.schedule_id}/${action}`,
    { expected_version: schedule.row_version },
  )
  return response.data
}

export async function reviseTimedSchedule(
  schedule: Pick<ActiveSchedule, 'schedule_id' | 'row_version'>,
  definition: Pick<ActiveSchedule, 'start_date' | 'end_date' | 'daily_times'>,
): Promise<TimedScheduleRevisionResult> {
  const response = await apiClient.post<TimedScheduleRevisionResult>(
    `/task-schedules/${schedule.schedule_id}/revision`,
    {
      expected_version: schedule.row_version,
      start_date: definition.start_date,
      end_date: definition.end_date,
      daily_times: definition.daily_times,
    },
  )
  return response.data
}

export async function fetchScheduleOccurrences(
  scheduleId: string,
  cursor: string | null,
  scope: OccurrenceScope,
): Promise<CursorPage<OccurrenceItem, string>> {
  const response = await apiClient.get<OccurrencePageResponse>(
    `/task-schedules/${scheduleId}/occurrences`,
    { params: { cursor: cursor ?? undefined, limit: 50, scope } },
  )
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}
