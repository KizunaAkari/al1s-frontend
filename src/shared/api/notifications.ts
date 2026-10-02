import { apiClient } from './client'

export type NotificationChannel = {
  channel_id: string
  name: string
  kind: 'smtp' | 'qq' | 'discord'
  enabled: boolean
  row_version: number
  secret_configured: boolean
}

export async function fetchChannels(cursor?: string) {
  return (await apiClient.get<{ items: NotificationChannel[]; next_cursor: string | null }>(
    '/notifications/channels', { params: { cursor, limit: 50 } },
  )).data
}

export async function setChannelEnabled(channel: NotificationChannel, enabled: boolean) {
  return (await apiClient.patch<NotificationChannel>(
    `/notifications/channels/${channel.channel_id}`, { enabled },
    { headers: { 'If-Match': String(channel.row_version) } },
  )).data
}

export async function renameNotificationChannel(channel: NotificationChannel, name: string) {
  return (await apiClient.patch<NotificationChannel>(
    `/notifications/channels/${channel.channel_id}`, { name },
    { headers: { 'If-Match': String(channel.row_version) } },
  )).data
}

export async function deleteNotificationChannel(channel: NotificationChannel) {
  await apiClient.delete(`/notifications/channels/${channel.channel_id}`, {
    headers: { 'If-Match': String(channel.row_version) },
  })
}

export async function createSmtpChannel(body: {
  name: string
  settings: Record<string, unknown>
  secret: string | null
}, key: string) {
  return (await apiClient.post<NotificationChannel>(
    '/notifications/channels', { ...body, kind: 'smtp' },
    { headers: { 'Idempotency-Key': key } },
  )).data
}

export async function createBotChannel(name: string, bot_service_id: string, key: string, kind: 'qq' | 'discord' = 'qq') {
  return (await apiClient.post<NotificationChannel>(
    '/notifications/channels', { name, kind, bot_service_id, settings: {} },
    { headers: { 'Idempotency-Key': key } },
  )).data
}

export type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'dead_letter' | 'cancelled'
export type NotificationRoute = {
  route_id: string
  notification_kind: string
  channel_id: string
  targets: string[]
  template_key: string
  enabled: boolean
  row_version: number
}

export async function fetchNotificationRoutes(cursor?: string) {
  return (await apiClient.get<{ items: NotificationRoute[]; next_cursor: string | null }>(
    '/notifications/routes', { params: { cursor, limit: 50 } },
  )).data
}

export async function createNotificationRoute(body: {
  notification_kind: string; channel_id: string; targets: string[]; template_key: string
}, key: string) {
  return (await apiClient.post<NotificationRoute>('/notifications/routes', body, {
    headers: { 'Idempotency-Key': key },
  })).data
}

export async function toggleNotificationRoute(route: NotificationRoute) {
  return (await apiClient.patch<NotificationRoute>(
    `/notifications/routes/${route.route_id}`, { enabled: !route.enabled },
    { headers: { 'If-Match': String(route.row_version) } },
  )).data
}

export async function enqueueNotificationTest(body: {
  channel_id: string; targets: string[]; summary: string
}, key: string) {
  return (await apiClient.post<{ intent_id: string; delivery_id: string; replayed: boolean }>(
    '/notifications/tests', body, { headers: { 'Idempotency-Key': key } },
  )).data
}
export type Delivery = {
  delivery_id: string
  notification_kind: string
  channel_name: string
  channel_kind: string
  targets: string[]
  status: DeliveryStatus
  attempt_count: number
  last_error_type: string | null
  last_error_code: string | null
  created_at: string
  sent_at: string | null
}
export type DeliveryAttempt = {
  attempt_id: string
  attempt_no: number
  outcome: 'sent' | 'failed'
  retryable: boolean
  error_type: string | null
  error_code: string | null
  provider_message_id: string | null
  started_at: string
  completed_at: string
}

export async function fetchDeliveries(status?: DeliveryStatus, cursor?: string, notificationKind?: string) {
  const response = await apiClient.get<{ items: Delivery[]; next_cursor: string | null }>(
    '/notifications/deliveries', { params: { status, cursor, notification_kind: notificationKind, limit: 50 } },
  )
  return response.data
}

export async function fetchDelivery(id: string) {
  const response = await apiClient.get<{ delivery: Delivery; attempts: DeliveryAttempt[] }>(
    `/notifications/deliveries/${encodeURIComponent(id)}`,
  )
  return response.data
}

export type DiscordForwardAction = {
  id?: string
  channel_id: string
  kind: 'qq_private' | 'qq_group' | 'smtp'
  target: string
  review_policy: 'none' | 'lexicon'
}

export type DiscordForwardRule = {
  id: string
  bot_service_id: string
  name: string
  guild_id: string
  channel_id: string
  trigger_kind: 'contains' | 'acrostic' | 'frequency'
  trigger_text: string | null
  frequency_count: number | null
  frequency_window_seconds: number | null
  cooldown_seconds: number | null
  enabled: boolean
  row_version: number
  actions: DiscordForwardAction[]
}

export type DiscordForwardRuleInput = Omit<DiscordForwardRule, 'id' | 'row_version'>

export async function fetchDiscordForwardRules(botServiceId: string, afterId?: string) {
  return (await apiClient.get<{ items: DiscordForwardRule[]; next_cursor: string | null }>(
    '/notifications/discord-forward-rules',
    { params: { bot_service_id: botServiceId, after_id: afterId, limit: 50 } },
  )).data
}

export async function saveDiscordForwardRule(body: DiscordForwardRuleInput, current?: DiscordForwardRule) {
  if (current) {
    return (await apiClient.put<DiscordForwardRule>(
      `/notifications/discord-forward-rules/${current.id}`, body,
      { headers: { 'If-Match': String(current.row_version) } },
    )).data
  }
  return (await apiClient.post<DiscordForwardRule>('/notifications/discord-forward-rules', body)).data
}

export async function deleteDiscordForwardRule(rule: DiscordForwardRule) {
  await apiClient.delete(`/notifications/discord-forward-rules/${rule.id}`, {
    headers: { 'If-Match': String(rule.row_version) },
  })
}
