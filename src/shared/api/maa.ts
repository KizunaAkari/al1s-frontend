import { apiClient } from './client'
import type { CursorPage } from './pagination'

export type MaaApplication = {
  application_id: string
  package_name: string
  display_name: string
  row_version: number
  created_at: string
  updated_at: string
  icon_data_url: string | null
}

export type MaaApplicationSummary = MaaApplication & { script_count: number }

export type MaaScript = {
  script_id: string
  application_id: string
  name: string
  script_type: 'standard' | 'module_start' | 'module_process' | 'module_end'
  status: string
  current_version_id: string | null
  candidate_version_id: string | null
  row_version: number
  created_at: string
  updated_at: string
}

export type MaaStrategy = {
  strategy_id: string
  application_id: string
  name: string
  status: string
  current_version_id: string | null
  row_version: number
  created_at: string
  updated_at: string
}

type ApplicationPageResponse = { items: MaaApplicationSummary[]; next_after_id: string | null }
type ScriptPageResponse = { items: MaaScript[]; next_after_id: string | null }
type StrategyPageResponse = { items: MaaStrategy[]; next_after_id: string | null }

export async function fetchApplications(
  cursor: string | null,
): Promise<CursorPage<MaaApplicationSummary, string>> {
  const response = await apiClient.get<ApplicationPageResponse>('/maa/applications', {
    params: { after_id: cursor ?? undefined, limit: 50 },
  })
  return { items: response.data.items, nextCursor: response.data.next_after_id }
}

export async function fetchApplication(id: string): Promise<MaaApplication> {
  return (await apiClient.get<MaaApplication>(`/maa/applications/${id}`)).data
}

export async function fetchScripts(
  applicationId: string,
  cursor: string | null,
): Promise<CursorPage<MaaScript, string>> {
  const response = await apiClient.get<ScriptPageResponse>('/maa/scripts', {
    params: { application_id: applicationId, after_id: cursor ?? undefined, limit: 40 },
  })
  return { items: response.data.items, nextCursor: response.data.next_after_id }
}

export async function fetchLibraryScripts(
  applicationId: string,
  cursor: string | null,
): Promise<CursorPage<MaaScript, string>> {
  const response = await apiClient.get<ScriptPageResponse>(
    `/maa/applications/${applicationId}/library-scripts`,
    { params: { after_id: cursor ?? undefined, limit: 40 } },
  )
  return { items: response.data.items, nextCursor: response.data.next_after_id }
}

export async function reorderLibraryScript(
  applicationId: string,
  scriptId: string,
  targetId: string,
  placement: 'before' | 'after',
): Promise<void> {
  await apiClient.put(`/maa/applications/${applicationId}/library-scripts/order`, {
    script_id: scriptId, target_id: targetId, placement,
  }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
}

export async function fetchStrategies(
  applicationId: string,
  cursor: string | null,
): Promise<CursorPage<MaaStrategy, string>> {
  const response = await apiClient.get<StrategyPageResponse>('/maa/strategies', {
    params: { application_id: applicationId, after_id: cursor ?? undefined, limit: 40 },
  })
  return { items: response.data.items, nextCursor: response.data.next_after_id }
}
