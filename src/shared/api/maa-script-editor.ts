import { apiClient } from './client'
import { fetchApplication, type MaaScript } from './maa'
import { parseScriptDocument, type ScriptDocument } from './maa-script-contract'

export type { CoreWorkflowAction, CoreWorkflowStep, ScriptDocument, WorkflowStep } from './maa-script-contract'

export async function openScript(id: string) {
  const script = (await apiClient.get<MaaScript>(`/maa/scripts/${id}`)).data
  if (!script.current_version_id && script.candidate_version_id) {
    throw new Error('这是旧版候选脚本，尚未迁移到新编辑流程；请先完成旧数据迁移。')
  }
  const version = script.current_version_id
  if (!version) {
    const application = await fetchApplication(script.application_id)
    const document: ScriptDocument = {
      version: 2,
      script_type: script.script_type,
      target: { application_package: application.package_name },
      cleanup_on_finish: false,
      steps: script.script_type === 'module_start'
        ? [{ action: 'start' }, { action: 'launch_app', package: application.package_name }]
        : [],
    }
    return { script, document }
  }
  const response = await apiClient.get<{ manifest: unknown }>(
    `/maa/scripts/${id}/versions/${version}`,
  )
  return { script, document: parseScriptDocument(response.data.manifest) }
}

export async function createScriptFromForeground(deviceId: string, key: string, name?: string) {
  return (await apiClient.post<{
    script_id: string; application_id: string; package_name: string;
    script_type: 'module_start' | 'module_process'; created_category: boolean;
  }>('/maa/editor/scripts', { device_id: deviceId, name: name || null },
    { headers: { 'Idempotency-Key': key } })).data
}

export async function fetchForegroundPackage(deviceId: string): Promise<string> {
  const response = await apiClient.get<{ package_name: string }>('/maa/editor/foreground',
    { params: { device_id: deviceId } })
  return response.data.package_name
}

export async function saveScriptDocument(script: MaaScript, manifest: ScriptDocument, deviceId: string, key: string) {
  parseScriptDocument(manifest)
  return (await apiClient.put<MaaScript>(
    `/maa/scripts/${script.script_id}/document`, { manifest, device_id: deviceId },
    { headers: { 'Idempotency-Key': key, 'If-Match': String(script.row_version) } },
  )).data
}

export async function fetchEditorDrafts(deviceId: string, signal?: AbortSignal): Promise<MaaScript[]> {
  const drafts: MaaScript[] = []
  let cursor: string | null = null
  do {
    signal?.throwIfAborted()
    const response: { data: { items: MaaScript[]; next_after_id: string | null } } = await apiClient.get(
      '/maa/editor/drafts', {
        params: { device_id: deviceId, after_id: cursor ?? undefined, limit: 200 }, signal,
      },
    )
    drafts.push(...response.data.items)
    cursor = response.data.next_after_id
  } while (cursor)
  return drafts
}
