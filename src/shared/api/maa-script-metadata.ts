import { apiClient } from './client'
import type { MaaScript } from './maa'

export async function fetchScriptMetadataActions(id: string) {
  return (await apiClient.get<{ rename: string | null; row_version: number }>(
    `/maa/scripts/${id}/metadata-actions`,
  )).data
}

export async function renameScript(script: MaaScript, name: string, key: string): Promise<void> {
  await apiClient.patch(`/maa/scripts/${script.script_id}`, { name }, {
    headers: { 'Idempotency-Key': key, 'If-Match': String(script.row_version) },
  })
}
