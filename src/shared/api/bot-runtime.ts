import { apiClient } from './client'

export type BotRuntimeState = 'online' | 'offline' | 'unknown' | 'disabled' | 'unconfigured'

export type BotRuntimeStatus = {
  service_id: string
  state: BotRuntimeState
  checked_at: string
  observed_at: string | null
  reason_code: string
  error_code: string | null
}

export async function fetchBotRuntimeStatus(serviceId: string, signal?: AbortSignal) {
  return (await apiClient.get<BotRuntimeStatus>(
    `/bots/services/${encodeURIComponent(serviceId)}/runtime-status`, { signal },
  )).data
}
