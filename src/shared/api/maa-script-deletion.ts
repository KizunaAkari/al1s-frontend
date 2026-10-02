import { apiClient } from './client'
import type { MaaScript } from './maa'
export type ScriptReferrer = { script_id: string; name: string; step_indices: number[] }
export async function fetchScriptReferrers(id: string, cursor: string | null) {
  const { data } = await apiClient.get<{ items: ScriptReferrer[]; next_after_id: string | null }>(
    `/maa/scripts/${id}/referrers`, { params: { after_id: cursor ?? undefined, limit: 50 } },
  )
  return { items: data.items, nextCursor: data.next_after_id }
}
export async function deleteScript(script: MaaScript, key: string) {
  await apiClient.delete(`/maa/scripts/${script.script_id}`, {
    headers: { 'If-Match': String(script.row_version), 'Idempotency-Key': key },
  })
}
