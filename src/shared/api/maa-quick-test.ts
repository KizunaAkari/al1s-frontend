import { apiClient } from './client'
import { downloadVerifiedBlob } from './verified-download'

export interface QuickTestCommand {
  scriptId: string; candidateId: string; terminalId: string; deviceId: string; key: string; stepNumber?: number
}
export interface QuickTestDetail {
  session_id: string; candidate_version_id: string
  status: 'issued' | 'claimed' | 'completed' | 'expired' | 'cancelled'
  expires_at: string; qualification_status: 'passed' | 'failed' | null
  error_code: string | null; step_number: number | null; failed_step_number: number | null
  started_at?: string | null; cancel_requested_at?: string | null
  failure_detail?: QuickTestFailureDetail | null
}
export interface QuickTestFailureDetail {
  step_number: number; script_name: string; rule_name: string | null
  stage: 'recognition' | 'click_target' | 'post_assertion'; algorithm: 'TemplateMatch' | 'OCR'
  best_score: number | null; threshold: number | null; consecutive_misses: number | null
  timeout_seconds: number | null; elapsed_seconds: number | null
}
export interface QuickTestEvent {
  sequence: number; kind: 'started' | 'step_started' | 'step_succeeded' | 'step_failed' | 'log'
  step_number: number | null; code: string | null; created_at: string
  rule_name?: string | null
}
export interface QuickTestScreenshot {
  artifact_id: string
  attempt_id: string
  file_name: string
  status: string
  downloadable: boolean
}
export async function issueQuickTest(command: QuickTestCommand) {
  return (await apiClient.post<{ session_id: string }>(`/maa/scripts/${command.scriptId}/quick-test-definition`, {
    candidate_version_id: command.candidateId, terminal_id: command.terminalId, target_device_id: command.deviceId,
    ...(command.stepNumber === undefined ? {} : { step_number: command.stepNumber }),
  }, { headers: { 'Idempotency-Key': command.key } })).data
}
export async function readQuickTest(scriptId: string, sessionId: string) {
  return (await apiClient.get<QuickTestDetail>(`/maa/scripts/${scriptId}/quick-tests/${sessionId}`)).data
}
export async function stopQuickTest(scriptId: string, sessionId: string) {
  return (await apiClient.post<QuickTestDetail>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/quick-tests/${encodeURIComponent(sessionId)}/stop`,
  )).data
}
export async function fetchQuickTestEvents(scriptId: string, sessionId: string, after = 0) {
  return (await apiClient.get<{ items: QuickTestEvent[]; next_after: number | null }>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/quick-tests/${encodeURIComponent(sessionId)}/events`,
    { params: { after, limit: 50 } },
  )).data
}
export async function fetchQuickTestScreenshots(scriptId: string, sessionId: string, cursor: string | null = null) {
  return (await apiClient.get<{ items: QuickTestScreenshot[]; next_cursor: string | null }>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/quick-tests/${encodeURIComponent(sessionId)}/screenshots`,
    { params: { cursor: cursor ?? undefined, limit: 20 } },
  )).data
}
export async function downloadQuickTestScreenshot(
  scriptId: string, sessionId: string, artifactId: string, fallbackName = '调试截图.png',
) {
  const response = await apiClient.get<Blob>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/quick-tests/${encodeURIComponent(sessionId)}/screenshots/${encodeURIComponent(artifactId)}/download`,
    { responseType: 'blob' },
  )
  await downloadVerifiedBlob(response, fallbackName)
}
