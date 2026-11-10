import { apiClient } from './client'

export type DrawingKind = 'txt2img' | 'image_edit' | 'both'
export type GroupMode = 'green' | 'r18'
export interface DrawingSettings {
  service_id: string
  enabled: boolean
  keep_drawing_warm: boolean
  default_text_preset_id: string | null
  default_edit_preset_id: string | null
  default_online_preset_id: string | null
  row_version: number
  applied_version: number
  resource_configured: boolean
  allow_private: boolean
  event_ws_url: string | null
  comfy_base_url: string
  groups: string[]
}
export type DrawingSettingsWrite = Pick<DrawingSettings, 'enabled' | 'keep_drawing_warm' | 'default_text_preset_id' | 'default_edit_preset_id' | 'default_online_preset_id' | 'allow_private' | 'event_ws_url' | 'comfy_base_url' | 'groups'>
export interface DrawingPromptModel {
  id: string; name: string; row_version: number; revision: number
  adapter_kind: string; model_id: string; base_url: string; network_mode: 'direct' | 'proxy'; secret_configured: boolean
}
export interface DrawingPromptWrite extends Omit<DrawingPromptModel, 'id' | 'row_version' | 'revision' | 'secret_configured'> {
  voice: string; secret_input: string | null; clear_secret: boolean
}
export interface DrawingPromptCatalog { items: DrawingPromptModel[]; active_id: string | null; selection_version: number }
export interface DrawingGroupWrite { mode: GroupMode; restrict_workflows: boolean; allowed_preset_ids: string[] }
export interface DrawingGroup extends DrawingGroupWrite { group_id: string; row_version: number }
export interface DrawingPreset {
  id: string; number: number; name: string; kind: DrawingKind; engine?: 'comfy' | 'openai'; enabled: boolean
  revision: number; row_version: number; validation_state: 'unchecked' | 'missing' | 'needs_preview' | 'ready'
  lora_keys: string[]
}
export interface DrawingBinding { node_id: string; input_name: string }
export interface DrawingBindings {
  positive: DrawingBinding
  negative: DrawingBinding | null
  positive_prefix: string
  negative_prefix: string
  image: DrawingBinding | null
  seed: DrawingBinding | null
  output: { node_id: string; output_index: number }
}
export interface DrawingPresetDraft {
  name: string; kind: DrawingKind; enabled: boolean; graph: Record<string, unknown>
  bindings: DrawingBindings; aliases: Record<string, string>
}
export interface DrawingPresetDetail extends DrawingPresetDraft {
  id: string; number: number; revision: number; row_version: number; validation_state: DrawingPreset['validation_state']
}
export interface DrawingOnlinePresetWrite {
  name: string; model_id: 'gpt-image-2.6-flare' | 'gpt-image-2.6-sunburst'; base_url: string
  network_mode: 'direct' | 'proxy'; size: 'auto' | '1024x1024' | '1024x1536' | '1536x1024'
  quality: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'; use_prompt_model: boolean; enabled: boolean
  secret_input: string | null; clear_secret: boolean
}
export interface DrawingOnlinePresetDetail extends Omit<DrawingOnlinePresetWrite, 'secret_input' | 'clear_secret'> {
  id: string; number: number; revision: number; row_version: number; secret_configured: boolean
}
export interface DrawingResources {
  state: 'available' | 'unconfigured' | 'unavailable'
  effective_resident?: boolean
  active?: number
  gpu_busy?: boolean
  qq_connection?: 'connected' | 'connecting' | 'unconfigured' | 'conflict' | 'disabled'
  queued?: number
  media_used_bytes?: number
  media_limit_bytes?: number
  drawing_resources?: number
  vision_resources?: number
  vision_state?: 'disabled' | 'cold' | 'loading' | 'warm' | 'suspended'
  idle_seconds_remaining?: number | null
  release_status?: string
}
export interface DrawingTask {
  id: string; operation: 'draw' | 'tag'; origin: 'qq' | 'admin_preview'; generation_status: string
  audit_status: string; send_status: string; cleanup_status: string; error_code: string | null; created_at: string
  processing_stage: string; cancel_requested: boolean; deletion_state: 'visible' | 'deleting' | 'deleted'
  online_request_state?: 'not_started' | 'submitting' | 'sent' | 'received' | 'unknown' | 'failed' | null
  online_request_sent?: boolean; online_image_received?: boolean
  online_moderation_details?: { stage: 'input' | 'output' | 'unknown' | null; categories: string[] } | null
  prompt_model_used?: boolean; prompt_status?: string; has_input_image?: boolean | null; input_audit_status?: string
  resource_registration_state?: string; prompt_transport_started?: boolean; has_started?: boolean; reply_kind?: string | null
  scope_kind: string | null; target_id: string | null; queue_position: number | null
  progress: { node_id: string; node_name: string; value: number | null; max: number | null; updated_at: string } | null
  wish_text?: string | null; positive?: string | null; negative?: string | null
  has_image?: boolean
}

const path = (id: string, suffix: string) => `/bots/ai/drawing/${id}/${suffix}`
const headers = (version: number, operation: string) => ({ 'If-Match': String(version), 'Idempotency-Key': operation })
export const fetchDrawingSettings = async (id: string) => (await apiClient.get<DrawingSettings>(path(id, 'settings'))).data
export const saveDrawingSettings = async (id: string, value: DrawingSettingsWrite, version: number, operation: string) =>
  (await apiClient.put<Partial<DrawingSettings>>(path(id, 'settings'), value, { headers: headers(version, operation) })).data
export const fetchDrawingPromptModels = async (id: string) =>
  (await apiClient.get<DrawingPromptCatalog>(path(id, 'prompt-models'))).data
export const saveDrawingPromptModel = async (id: string, profile: string | null, value: DrawingPromptWrite, version: number, operation: string) =>
  (await apiClient.request<DrawingPromptModel>({ method: profile ? 'PUT' : 'POST',
    url: path(id, profile ? `prompt-models/${profile}` : 'prompt-models'), data: value, headers: headers(version, operation) })).data
export const activateDrawingPromptModel = async (id: string, profile: string | null, version: number, operation: string) =>
  (await apiClient.put<{active_id: string | null; selection_version: number}>(path(id, 'prompt-models/active'),
    { profile_id: profile }, { headers: headers(version, operation) })).data
export const deleteDrawingPromptModel = async (id: string, profile: string, version: number, operation: string) =>
  (await apiClient.delete(path(id, `prompt-models/${profile}`), { headers: headers(version, operation) })).data
export const testDrawingPromptModel = async (id: string, profile: string) =>
  (await apiClient.post<{state: string; message: string}>(path(id, `prompt-models/${profile}/test`), {}, { timeout: 25_000 })).data
export const fetchDrawingGroups = async (id: string) => (await apiClient.get<{items: DrawingGroup[]}>(path(id, 'group-modes'))).data.items
export const saveDrawingGroup = async (id: string, group: string, value: DrawingGroupWrite, version: number, operation: string) =>
  (await apiClient.put<DrawingGroup>(path(id, `group-modes/${group}`), value, { headers: headers(version, operation) })).data
export const fetchDrawingPresets = async (id: string) => (await apiClient.get<{items: DrawingPreset[]}>(path(id, 'presets'))).data.items
export const fetchDrawingPreset = async (id: string, preset: string) =>
  (await apiClient.get<DrawingPresetDetail>(path(id, `presets/${preset}`))).data
export const fetchDrawingOnlinePreset = async (id: string, preset: string) =>
  (await apiClient.get<DrawingOnlinePresetDetail>(path(id, `presets/${preset}`))).data
export const saveDrawingOnlinePreset = async (id: string, preset: string | null, value: DrawingOnlinePresetWrite, version: number, operation: string) =>
  (await apiClient.request<{id: string; number: number; revision: number; row_version: number}>({
    method: preset ? 'PUT' : 'POST', url: path(id, preset ? `online-presets/${preset}` : 'online-presets'), data: value,
    headers: headers(version, operation),
  })).data
export const saveDrawingPreset = async (id: string, preset: string | null, value: DrawingPresetDraft, version: number, operation: string) =>
  (await apiClient.request<{id: string; number: number; revision: number; row_version: number}>({
    method: preset ? 'PUT' : 'POST', url: path(id, preset ? `presets/${preset}` : 'presets'), data: value,
    headers: headers(version, operation), timeout: 120_000,
  })).data
export const checkDrawingPreset = async (id: string, preset: string, version: number, operation: string) =>
  (await apiClient.post<{validation_state: string}>(path(id, `presets/${preset}/check`), {},
    { headers: headers(version, operation), timeout: 130_000 })).data
export const previewDrawingPreset = async (id: string, preset: string, data: FormData, version: number, operation: string) =>
  (await apiClient.post<{task_id: string}>(path(id, `presets/${preset}/preview`), data,
    { headers: headers(version, operation), timeout: 30_000 })).data
export const fetchDrawingResources = async (id: string) => (await apiClient.get<DrawingResources>(path(id, 'resources'))).data
export const releaseDrawingResources = async (id: string) =>
  (await apiClient.post<{status: 'queued' | 'deferred'}>(path(id, 'resources/release'), {})).data
export const fetchDrawingTasks = async (id: string, view: 'active' | 'history' | 'all' = 'all', afterId?: string) =>
  (await apiClient.get<{items: DrawingTask[]; next_after_id: string | null}>(path(id, 'tasks'),
    { params: { view, ...(afterId ? { after_id: afterId } : {}) } })).data
export const fetchDrawingTask = async (id: string, task: string) =>
  (await apiClient.get<DrawingTask>(path(id, `tasks/${task}`))).data
export const fetchDrawingTaskImage = async (id: string, task: string) =>
  (await apiClient.get<Blob>(path(id, `tasks/${task}/image`), { responseType: 'blob' })).data
export const cancelDrawingTask = async (id: string, task: string, operation: string) =>
  (await apiClient.post(path(id, `tasks/${task}/cancel`), {}, { headers: { 'Idempotency-Key': operation } })).data
export const retryDrawingSend = async (id: string, task: string, operation: string) =>
  (await apiClient.post(path(id, `tasks/${task}/retry-send`), {}, { headers: { 'Idempotency-Key': operation } })).data
export const deleteDrawingTasks = async (id: string, tasks: string[], operation: string) =>
  (await apiClient.post<{deleted: string[]; pending: string[]}>(path(id, 'tasks/batch-delete'),
    { task_ids: tasks }, { headers: { 'Idempotency-Key': operation } })).data
