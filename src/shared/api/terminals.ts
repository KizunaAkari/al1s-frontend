import { apiClient } from './client'
import type { CursorPage } from './pagination'

export type ActionAvailability = {
  allowed: boolean
  refusal_code: string | null
  refusal_message: string | null
}

export type StorageObservation = {
  directory: string
  total_bytes: number
  used_bytes: number
  available_bytes: number
}

export type Terminal = {
  terminal_id: string
  installation_id: string
  terminal_type: 'linux' | 'android'
  display_name: string
  service_status: 'online' | 'offline'
  acceptance_status: 'accepting' | 'draining' | 'disabled'
  agent_version: string
  current_capability_profile_id: string | null
  row_version: number
  name_version: number
  created_at: string
  last_seen_at: string | null
  storage?: StorageObservation | null
  storage_observed_at?: string | null
  storage_probe_ok?: boolean
  delete: ActionAvailability
}

export type TargetDevice = {
  device_id: string
  display_name: string
  platform: string
  mode: 'unassigned' | 'standalone' | 'mounted'
  managing_terminal_id: string | null
  row_version: number
  created_at: string
  updated_at: string
  availability?: 'connected' | 'disconnected' | 'unauthorized' | 'unknown'
  availability_reason?: string | null
  availability_observed_at?: string | null
}

export type TargetDeviceDiscovery = {
  identifier_id: string
  target_device_id: string | null
  source_terminal_id: string
  source_type: 'apk_installation' | 'adb_serial' | 'android_id'
  display_hint: string
  row_version: number
  created_at: string
  bound_at: string | null
}

type TerminalPageResponse = { items: Terminal[]; next_cursor: string | null }
type TargetDevicePageResponse = { items: TargetDevice[]; next_cursor: string | null }
type TargetDeviceDiscoveryPageResponse = {
  items: TargetDeviceDiscovery[]
  next_cursor: string | null
}

export type RegistrationGrant = {
  grant_id: string
  registration_code: string
  expires_at: string
  target_device_id: string | null
}

export async function fetchTerminals(cursor: string | null): Promise<CursorPage<Terminal, string>> {
  const response = await apiClient.get<TerminalPageResponse>('/terminals', {
    params: { after_id: cursor ?? undefined, limit: 24 },
  })
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}

export async function fetchTargetDevices(
  cursor: string | null,
): Promise<CursorPage<TargetDevice, string>> {
  const response = await apiClient.get<TargetDevicePageResponse>('/target-devices', {
    params: { after_id: cursor ?? undefined, limit: 24 },
  })
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}

export async function fetchTargetDevice(deviceId: string): Promise<TargetDevice> {
  const response = await apiClient.get<TargetDevice>(
    `/target-devices/${encodeURIComponent(deviceId)}`,
  )
  return response.data
}

export async function renameTargetDevice(
  device: Pick<TargetDevice, 'device_id' | 'row_version'>,
  displayName: string,
): Promise<TargetDevice> {
  const response = await apiClient.patch<TargetDevice>(
    `/target-devices/${encodeURIComponent(device.device_id)}/display-name`,
    { expected_version: device.row_version, display_name: displayName },
  )
  return response.data
}

export async function fetchTargetDeviceDiscoveries(
  terminalId: string,
  cursor: string | null,
): Promise<CursorPage<TargetDeviceDiscovery, string>> {
  const response = await apiClient.get<TargetDeviceDiscoveryPageResponse>('/target-devices/adb-discoveries', {
    params: { terminal_id: terminalId, after_id: cursor ?? undefined, limit: 50 },
  })
  return { items: response.data.items, nextCursor: response.data.next_cursor }
}

export async function connectTargetDeviceDiscovery(
  identifierId: string,
  expectedIdentifierVersion: number,
  displayName: string,
): Promise<TargetDevice> {
  const response = await apiClient.post<TargetDevice>(
    `/target-devices/discoveries/${encodeURIComponent(identifierId)}/connect`,
    { expected_identifier_version: expectedIdentifierVersion, display_name: displayName },
  )
  return response.data
}

export async function createRegistrationGrant(
  terminalType: Terminal['terminal_type'] | null,
  ttlSeconds: number,
  targetDeviceId: string | null = null,
): Promise<RegistrationGrant> {
  const response = await apiClient.post<RegistrationGrant>('/terminals/registration-grants', {
    allowed_terminal_type: terminalType,
    target_device_id: targetDeviceId,
    ttl_seconds: ttlSeconds,
  })
  return response.data
}

export async function deleteTerminal(terminal: Pick<Terminal, 'terminal_id' | 'row_version'>): Promise<void> {
  await apiClient.delete(`/terminals/${terminal.terminal_id}`, {
    data: { expected_version: terminal.row_version },
  })
}

export async function renameTerminal(
  terminal: Pick<Terminal, 'terminal_id' | 'name_version'>,
  displayName: string,
): Promise<Pick<Terminal, 'terminal_id' | 'display_name' | 'row_version' | 'name_version'>> {
  const response = await apiClient.patch<Terminal>(
    `/terminals/${encodeURIComponent(terminal.terminal_id)}/display-name`,
    { expected_name_version: terminal.name_version, display_name: displayName },
  )
  return response.data
}
