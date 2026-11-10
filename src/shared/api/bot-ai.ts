import { apiClient } from './client'

export type AiRole = 'chat' | 'vision' | 'stt' | 'tts'
export type AiNetworkMode = 'direct' | 'proxy'
export type AiTtsMode = 'off' | 'voice_input' | 'always'
export interface AiProviderView {
  adapter_kind: string
  model_id: string
  base_url: string
  voice: string
  secret_configured: boolean
  network_mode?: AiNetworkMode
}
export interface AiProviderWrite extends Omit<AiProviderView, 'secret_configured'> {
  secret_input: string | null
  clear_secret: boolean
}
export interface AiSmartOptions {
  style: 'context' | 'random'
  min_interval_seconds: number
  cooldown_seconds: number
  window_seconds: number
  max_replies: number
  voice_enabled: boolean
  stickers_enabled: boolean
  collect_stickers: boolean
}
export interface AiSettingsWrite {
  enabled: boolean
  event_ws_url: string | null
  allow_private: boolean
  groups: string[]
  reply_all_groups: string[]
  smart_reply_groups?: string[]
  smart_reply?: AiSmartOptions
  wake_words: string[]
  persona: string
  vision_enabled: boolean
  stt_enabled: boolean
  tts_mode: AiTtsMode
  providers: Partial<Record<AiRole, AiProviderWrite>>
}
export interface AiSettingsRecord extends Omit<AiSettingsWrite, 'providers'> {
  service_id: string
  providers: Partial<Record<AiRole, AiProviderView>>
  desired_version: number
  applied_version: number
  last_error: string | null
}
export interface AiStatus {
  state: string
  desired_version: number
  applied_version: number
  synchronized: boolean
  connected?: boolean
  last_error?: string | null
}
export interface AiRequest {
  id: string
  scope_kind: string
  target_id: string
  sender_id: string
  status: string
  send_status: string
  result_code: string | null
  created_at: string
}

export const fetchAiSettings = async (id: string) =>
  (await apiClient.get<AiSettingsRecord>(`/bots/ai/settings/${id}`)).data
export const saveAiSettings = async (id: string, data: AiSettingsWrite, version: number, operation: string) =>
  (await apiClient.put<AiSettingsRecord>(`/bots/ai/settings/${id}`, data, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': operation },
  })).data
export const fetchAiStatus = async (id: string) =>
  (await apiClient.get<AiStatus>(`/bots/ai/status/${id}`)).data
export const fetchAiRequests = async (id: string) =>
  (await apiClient.get<{ items: AiRequest[]; next_after_id: string | null }>(`/bots/ai/requests/${id}`)).data
export const testAiProvider = async (id: string, role: AiRole) =>
  (await apiClient.post<{ state: string; message?: string }>(`/bots/ai/providers/test/${id}`, { role }, { timeout: 75_000 })).data
export const clearAiSession = async (id: string, scope_kind: 'qq_group' | 'qq_private', target_id: string) =>
  (await apiClient.post<{ state: string }>(`/bots/ai/sessions/${id}/clear`, { scope_kind, target_id })).data

export interface AiSticker {
  id: string
  group_id: string
  category: string
  category_label?: string
  description: string
  overlay_text: string
  tags: string[]
  scenes?: string[]
  scene_count?: number
  uses: number
  enabled: boolean
}
export interface AiStickerResult {
  status: string
  total?: number
  library_total?: number
  capacity?: number
  pending?: number
  categories?: { key: string; name: string }[]
  items?: AiSticker[]
  item?: AiSticker
}
export const manageAiSticker = async (id: string, data: Record<string, unknown>) =>
  (await apiClient.post<AiStickerResult>(`/bots/ai/stickers/${id}`, data)).data
export const previewAiSticker = async (id: string, group: string, image: string) =>
  (await apiClient.post<Blob>(`/bots/ai/stickers/${id}`,
    { action: 'preview', group_id: group, image_id: image }, { responseType: 'blob' })).data
export const importAiStickers = async (id: string, group: string, offset: number, file: File) =>
  (await apiClient.post<{status:string; queued:number; total:number; next_offset:number|null}>(
    `/bots/ai/stickers/${id}/import/${group}/${offset}`, file,
    { headers: {'Content-Type':'application/octet-stream'}, timeout: 30_000 })).data

export interface AiChatProfileView {
  id: string
  name: string
  description: string
  persona: string
  adapter_kind: string
  model_id: string
  base_url: string
  secret_configured: boolean
  supports_vision: boolean
  is_default: boolean
  network_mode?: AiNetworkMode
}
export interface AiChatProfileWrite extends Omit<AiChatProfileView, 'id' | 'secret_configured'> {
  secret_input: string | null
  clear_secret: boolean
}

export const fetchAiChatProfiles = async (id: string) =>
  (await apiClient.get<{ items: AiChatProfileView[] }>(`/bots/ai/chat-profiles/${id}`)).data.items
export const saveAiChatProfile = async (id: string, profileId: string, data: AiChatProfileWrite, version: number, operation: string) =>
  (await apiClient.put<{ profile: AiChatProfileView; desired_version: number }>(`/bots/ai/chat-profiles/${id}/${profileId}`, data, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': operation },
  })).data
export const deleteAiChatProfile = async (id: string, profileId: string, version: number, operation: string) =>
  (await apiClient.delete<{ deleted: string; desired_version: number }>(`/bots/ai/chat-profiles/${id}/${profileId}`, {
    headers: { 'If-Match': String(version), 'Idempotency-Key': operation },
  })).data
export const testAiChatProfile = async (id: string, profileId: string) =>
  (await apiClient.post<{ state: string; message?: string }>(`/bots/ai/chat-profiles/${id}/${profileId}/test`, undefined, { timeout: 75_000 })).data
