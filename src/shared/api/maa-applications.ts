import { apiClient } from './client'
import type { MaaApplication } from './maa'

export type ApplicationActions = { rename: string | null; delete: string | null }

export async function fetchApplicationActions(id: string): Promise<ApplicationActions> {
  return (await apiClient.get<ApplicationActions>(`/maa/applications/${id}/actions`)).data
}

export type ApplicationDeletePreview = {
  script_count: number; strategy_count: number; device_count: number;
  blocking_task_ids: string[]; has_more_blockers: boolean;
}

export async function fetchApplicationDeletePreview(id: string): Promise<ApplicationDeletePreview> {
  return (await apiClient.get<ApplicationDeletePreview>(`/maa/applications/${id}/delete-preview`)).data
}

export async function renameApplication(
  application: MaaApplication, displayName: string, key: string,
): Promise<MaaApplication> {
  return (await apiClient.patch<MaaApplication>(`/maa/applications/${application.application_id}`,
    { display_name: displayName },
    { headers: { 'Idempotency-Key': key, 'If-Match': String(application.row_version) } },
  )).data
}

export async function deleteApplication(application: MaaApplication, key: string): Promise<void> {
  await apiClient.delete(`/maa/applications/${application.application_id}`, {
    headers: { 'Idempotency-Key': key, 'If-Match': String(application.row_version) },
  })
}

export async function uploadApplicationIcon(
  application: MaaApplication, file: File, key: string,
): Promise<MaaApplication> {
  return (await apiClient.put<MaaApplication>(`/maa/applications/${application.application_id}/icon`, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Idempotency-Key': key,
      'If-Match': String(application.row_version),
    },
  })).data
}

export async function deleteApplicationIcon(application: MaaApplication, key: string): Promise<MaaApplication> {
  return (await apiClient.delete<MaaApplication>(`/maa/applications/${application.application_id}/icon`, {
    headers: { 'Idempotency-Key': key, 'If-Match': String(application.row_version) },
  })).data
}
