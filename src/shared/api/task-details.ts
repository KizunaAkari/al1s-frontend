import { apiClient } from './client'
import { downloadVerifiedBlob } from './verified-download'

export type FailureDetail = {
  module_number: number | null; script_name: string | null; step_number: number | null
  stage: string | null; title: string | null; message: string | null
  screenshot_id: string | null; screenshot_error: string | null
  click_x: number | null; click_y: number | null
  actual_score: number | null; configured_threshold: number | null
}
export type ExecutionScreenshot = { artifact_id: string; file_name: string }
export async function previewFailureScreenshot(task: string, attempt: string, artifact: string) {
  return (await apiClient.get<Blob>(`/tasks/${task}/attempts/${attempt}/screenshots/${artifact}`, {
    responseType: 'blob', params: { preview: true },
  })).data
}
export type AttemptDetail = {
  attempt_id: string; execution_id: string; attempt_no: number; status: string
  result: string | null; error_code: string | null; failure_phase: string | null
  confirmed: boolean; expired: boolean; no_screenshot: boolean; details: FailureDetail[]
  screenshots?: ExecutionScreenshot[]
}
export async function fetchTaskDetails(task: string, cursor: string | null = null) {
  return (await apiClient.get<{ items: AttemptDetail[]; next_cursor: string | null; lineup_record_id?: string | null; source_module?: string | null }>(
    `/tasks/${task}/details`, { params: { cursor: cursor ?? undefined } },
  )).data
}
export async function downloadFailureScreenshot(task: string, attempt: string, artifact: string) {
  const response = await apiClient.get<Blob>(
    `/tasks/${task}/attempts/${attempt}/screenshots/${artifact}`, { responseType: 'blob' },
  )
  await downloadVerifiedBlob(response, '失败截图.png')
}
export async function confirmFailure(task: string, attempt: string) {
  await apiClient.post(`/tasks/${task}/attempts/${attempt}/confirm-failure`)
}
