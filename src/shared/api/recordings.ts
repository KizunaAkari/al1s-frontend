import { apiClient } from './client'

export type Recording = {
  artifact_id: string
  attempt_id: string
  file_name: string
  status: 'pending' | 'ready' | 'expired'
  downloadable: boolean
}

export async function fetchRecordings(taskId: string, cursor?: string | null) {
  const response = await apiClient.get<{ items: Recording[]; next_cursor: string | null }>(
    `/tasks/${encodeURIComponent(taskId)}/recordings`, { params: { cursor, limit: 20 } },
  )
  return response.data
}

export function recordingDownloadUrl(taskId: string, artifactId: string): string {
  return apiClient.getUri({
    url: `/tasks/${encodeURIComponent(taskId)}/recordings/${encodeURIComponent(artifactId)}/download`,
  })
}
