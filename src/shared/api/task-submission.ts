import { apiClient } from './client'

export type TaskSubmission = {
  idempotency_key: string; name: string; task_type: 'single' | 'loop' | 'timed'
  source_module: 'maa'; logical_content_id: string
  requested_terminal_id: string; requested_target_device_id: string
  timeout_seconds: number; max_retries: number; record_video: boolean
  loop?: { repeat_count: number }
  timed?: { timezone: string; start_date: string; end_date: string; daily_times: string[] }
}

export async function submitTask(body: TaskSubmission) {
  return (await apiClient.post<{ task_id: string }>('/tasks', body)).data
}

const pendingKey = 'al1s.pending-task-submission.v1'
export function restorePendingTask(): TaskSubmission | null {
  const text = sessionStorage.getItem(pendingKey)
  if (!text) return null
  const value = JSON.parse(text) as TaskSubmission
  if (!value || value.source_module !== 'maa' || typeof value.idempotency_key !== 'string'
    || !['single', 'loop', 'timed'].includes(value.task_type)) {
    throw new Error('本地待确认请求损坏，请先在任务历史核对，不要重复下发。')
  }
  return value
}
export function preservePendingTask(body: TaskSubmission | null): void {
  if (body) sessionStorage.setItem(pendingKey, JSON.stringify(body))
  else sessionStorage.removeItem(pendingKey)
}
