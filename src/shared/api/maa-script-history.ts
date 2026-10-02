import { apiClient } from './client'
import { parseScriptDocument } from './maa-script-contract'

export type ScriptHistoryVersion = { script_version_id: string; revision: number; created_at: string }
export async function fetchScriptHistory(scriptId: string, after?: number | null, signal?: AbortSignal) {
  return (await apiClient.get<{ items: ScriptHistoryVersion[]; next_after_revision: number | null }>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/versions`, {
      params: { newest_first: true, after_revision: after ?? undefined, limit: 20 }, signal,
    })).data
}
export async function readScriptHistory(scriptId: string, versionId: string, signal?: AbortSignal) {
  const result = await apiClient.get<{ manifest: unknown }>(
    `/maa/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`, { signal })
  return parseScriptDocument(result.data.manifest)
}
