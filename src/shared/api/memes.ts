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
