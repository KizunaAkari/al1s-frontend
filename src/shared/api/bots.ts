import { apiClient } from './client'

export type BotService = {
  row_version: number
  service_id: string; name: string; kind: string; enabled: boolean
  desired_config_version_id: string | null; applied_config_version_id: string | null
}

export type BotConfigVersion = {
  config_version_id: string
  service_id: string
  version_no: number
  settings: Record<string, unknown>
  secret_configured: boolean
  onebot_service_id: string | null
  created_at: string
}

export async function fetchBotConfigVersion(serviceId: string, versionId: string) {
  return (await apiClient.get<BotConfigVersion>(
    `/bots/services/${encodeURIComponent(serviceId)}/config-versions/${encodeURIComponent(versionId)}`,
  )).data
}

export async function resolveDiscordApplicationId(token: string) {
  return (await apiClient.post<{ application_id: string }>(
    '/bots/discord/application-id', { token }, { timeout: 10_000 },
  )).data.application_id
}

export async function createBot(kind: string, name: string, key: string) {
  return (await apiClient.post<BotService>('/bots/services', { kind, name },
    { headers: { 'Idempotency-Key': key } })).data
}
export async function saveBotConfig(service: BotService, settings: Record<string, unknown>,
  secret: string | null, onebot_service_id: string | null, key: string,
  retainSecretFromVersionId?: string) {
  return (await apiClient.post<{ service: BotService; version: BotConfigVersion; application: BotApplication }>(`/bots/services/${service.service_id}/config-versions`,
    { settings, secret, onebot_service_id,
      ...(retainSecretFromVersionId ? { retain_secret_from_config_version_id: retainSecretFromVersionId } : {}) },
    { headers: { 'Idempotency-Key': key, 'If-Match': String(service.row_version) } })).data
}
export async function probeGateway(id: string) {
  return (await apiClient.post<{ applied: boolean }>(`/bots/services/${id}/probe`, {},
    { timeout: 25_000 })).data
}
export async function botGrant(id: string) {
  return (await apiClient.post<{ registration_code: string; expires_at: string }>(
    `/bots/services/${id}/registration-grants`, { ttl_seconds: 600 })).data
}
export async function botHealth(id: string) {
  return (await apiClient.get<{ items: Array<{ status: string; reported_at: string; config_version_id: string | null; diagnostics: Record<string, unknown> }> }>(
    `/bots/services/${id}/health-reports`, { params: { limit: 1 } })).data
}
export type BotApplication = {
  application_id: string; config_version_id: string
  status: 'pending' | 'applied' | 'rejected'; error_code: string | null
  requested_at: string; completed_at: string | null
}
export async function fetchBotServices(after_id?: string) {
  return (await apiClient.get<{ items: BotService[]; next_cursor: string | null }>(
    '/bots/services', { params: { after_id, limit: 50 } },
  )).data
}
export async function fetchBotApplications(service: string, cursor?: string) {
  return (await apiClient.get<{ items: BotApplication[]; next_cursor: string | null }>(
    `/bots/services/${encodeURIComponent(service)}/config-applications`,
    { params: { cursor, limit: 50 } },
  )).data
}
