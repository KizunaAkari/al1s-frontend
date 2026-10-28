import { apiClient } from './client'

export interface Slot { x: number; y: number; width: number; height: number; order: number }
export interface AvatarSlot extends Slot { shape: 'circle' | 'rectangle'; fit: 'cover' | 'contain'; rotation: number }
export interface TextSlot extends Slot { font_size: number; color: string; stroke_color: string; stroke_width: number; align: 'left' | 'center' | 'right' }
export interface MemeLayout {
  schema_version: 1; engine: 'composite' | 'petpet' | 'caption'; width: number; height: number;
  avatars: AvatarSlot[]; texts: TextSlot[]; frame_duration_ms: number; background_color: string;
}
export interface MemeTemplate {
  name: string; keyword: string; aliases: string[]; enabled: boolean; random_enabled: boolean;
  layout: MemeLayout; background_blob_id: string | null; foreground_blob_id: string | null;
}
export interface MemeRecord extends MemeTemplate {
  id: string; version_id: string; version_no: number; row_version: number; builtin: boolean;
}
export interface MemeScope { kind: 'qq_group' | 'discord_channel'; target_id: string; guild_id: string | null }
export interface MemeSettings {
  bot_service_id: string; enabled: boolean; private_enabled: boolean; qq_event_ws_url: string | null;
  cooldown_seconds: number; row_version: number; scopes: MemeScope[];
}
export interface PreviewInput { template: MemeTemplate; avatars: string[]; images: string[]; texts: string[] }
const ROOT = '/bots/memes'
export type MemePlatform = 'discord' | 'qq'
export interface MemeRateLimit { platform: MemePlatform; interval_seconds: number; row_version: number }
export const fetchRateLimits = async () => (await apiClient.get<MemeRateLimit[]>(`${ROOT}/rate-limits`)).data
export const saveRateLimit = async (platform: MemePlatform, seconds: number, version: number) => (await apiClient.put<MemeRateLimit>(`${ROOT}/rate-limits/${platform}`, { interval_seconds: seconds }, { headers: { 'If-Match': String(version) } })).data
export const fetchTemplates = async (cursor?: string) => (await apiClient.get<{ items: MemeRecord[]; next_cursor: string | null }>(`${ROOT}/templates`, { params: cursor ? { after_id: cursor } : {} })).data
export const saveTemplate = async (id: string, value: MemeTemplate, rowVersion: number, operation: string) => (await apiClient.put<MemeRecord>(`${ROOT}/templates/${id}`, value, {
  headers: { 'If-Match': String(rowVersion), 'Idempotency-Key': operation },
})).data
export const deleteTemplate = async (item: MemeRecord, operation: string) => apiClient.delete(`${ROOT}/templates/${item.id}`, {
  headers: { 'If-Match': String(item.row_version), 'Idempotency-Key': operation },
})
export const preview = async (value: PreviewInput, signal?: AbortSignal): Promise<Blob> => (await apiClient.post(`${ROOT}/preview`, value, { responseType: 'blob', signal, timeout: 15_000 })).data
export const uploadAsset = async (file: File): Promise<{ blob_id: string; width: number; height: number }> => (await apiClient.post(`${ROOT}/assets`, file, { headers: { 'Content-Type': file.type }, timeout: 30_000 })).data
export const readAsset = async (id: string): Promise<Blob> => (await apiClient.get(`${ROOT}/assets/${id}`, { responseType: 'blob' })).data
export const fetchMemeSettings = async (id: string) => (await apiClient.get<MemeSettings>(`${ROOT}/settings/${id}`)).data
export async function saveMemeSettings(value: MemeSettings, operation: string): Promise<MemeSettings> {
  const { bot_service_id, row_version, ...body } = value
  return (await apiClient.put<MemeSettings>(`${ROOT}/settings/${bot_service_id}`, body, { headers: {
    'If-Match': String(row_version), 'Idempotency-Key': operation,
  } })).data
}
export function templateBody(value: MemeTemplate): MemeTemplate {
  return { name: value.name, keyword: value.keyword, aliases: [...value.aliases], enabled: value.enabled,
    random_enabled: value.random_enabled, layout: JSON.parse(JSON.stringify(value.layout)),
    background_blob_id: value.background_blob_id, foreground_blob_id: value.foreground_blob_id }
}

export function createMemeApi(platform: MemePlatform) {
  if (platform !== 'qq' && platform !== 'discord') throw new Error('未知表情平台')
  const root = `${ROOT}/${platform}`
  return {
    templateBody,
    fetchRateLimits: async () => (await apiClient.get<MemeRateLimit[]>(`${root}/rate-limits`)).data,
    saveRateLimit: async (target: MemePlatform, seconds: number, version: number) => (await apiClient.put<MemeRateLimit>(`${root}/rate-limits/${target}`, { interval_seconds: seconds }, { headers: { 'If-Match': String(version) } })).data,
    fetchTemplates: async (cursor?: string) => (await apiClient.get<{ items: MemeRecord[]; next_cursor: string | null }>(`${root}/templates`, { params: cursor ? { after_id: cursor } : {} })).data,
    saveTemplate: async (id: string, value: MemeTemplate, version: number, operation: string) => (await apiClient.put<MemeRecord>(`${root}/templates/${id}`, value, { headers: { 'If-Match': String(version), 'Idempotency-Key': operation } })).data,
    deleteTemplate: async (item: MemeRecord, operation: string) => apiClient.delete(`${root}/templates/${item.id}`, { headers: { 'If-Match': String(item.row_version), 'Idempotency-Key': operation } }),
    preview: async (value: PreviewInput, signal?: AbortSignal): Promise<Blob> => (await apiClient.post(`${root}/preview`, value, { responseType: 'blob', signal, timeout: 15_000 })).data,
    uploadAsset: async (file: File): Promise<{ blob_id: string; width: number; height: number }> => (await apiClient.post(`${root}/assets`, file, { headers: { 'Content-Type': file.type }, timeout: 30_000 })).data,
    readAsset: async (id: string): Promise<Blob> => (await apiClient.get(`${root}/assets/${id}`, { responseType: 'blob' })).data,
    fetchMemeSettings: async (id: string) => (await apiClient.get<MemeSettings>(`${root}/settings/${id}`)).data,
    saveMemeSettings: async (value: MemeSettings, operation: string): Promise<MemeSettings> => {
      const { bot_service_id, row_version, ...body } = value
      return (await apiClient.put<MemeSettings>(`${root}/settings/${bot_service_id}`, body, { headers: { 'If-Match': String(row_version), 'Idempotency-Key': operation } })).data
    },
  }
}
export type MemeApi = ReturnType<typeof createMemeApi>
