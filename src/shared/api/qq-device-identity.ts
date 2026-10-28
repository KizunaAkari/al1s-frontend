import { apiClient } from './client'

export type QqDeviceSettings = { device_name: string; guid: string }
export type QqIdentityState = {
  mode?: 'direct' | 'pmhq'; available?: boolean; unavailable_reason?: string | null
  revision: string; configured: boolean; desired: QqDeviceSettings
  applied: { settings: QqDeviceSettings; reported_device_name: string; applied_at: string } | null
  current_guid: string; pending: boolean; phase: string; error_code: string | null; observed_at: string
}
export async function fetchQqDeviceIdentity() {
  return (await apiClient.get<QqIdentityState>('/bots/qq/device-identity', { timeout: 30_000 })).data
}
export async function saveQqDeviceIdentity(settings: QqDeviceSettings, revision: string,
  requestId: string, confirmGuidChange: boolean) {
  return (await apiClient.put<QqIdentityState>('/bots/qq/device-identity', {
    settings, confirm_guid_change: confirmGuidChange,
  }, { headers: { 'If-Match': revision, 'Idempotency-Key': requestId }, timeout: 30_000 })).data
}
export const qqDeviceIdentityApi = { read: fetchQqDeviceIdentity, save: saveQqDeviceIdentity }
