import { beforeEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { createBotChannel } from '../src/shared/api/notifications'
import { approveReview, batchReviews, fetchReview, type Review } from '../src/shared/api/reviews'
import { saveBotConfig } from '../src/shared/api/bots'

vi.mock('../src/shared/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
})
it('binds a channel by Bot identity without copying credentials', async () => {
  await createBotChannel('QQ', 'bot-id', 'stable-key')
  expect(apiClient.post).toHaveBeenCalledWith('/notifications/channels',
    { name: 'QQ', kind: 'qq', bot_service_id: 'bot-id', settings: {} },
    { headers: { 'Idempotency-Key': 'stable-key' } })
})
it('fences approvals and leaves original text on the server', async () => {
  const review = { id: 'r', row_version: 4 } as Review
  await approveReview(review, null)
  expect(apiClient.post).toHaveBeenCalledWith('/notifications/reviews/r/approve',
    { row_version: 4, text: null })
})
it('sends only identities and operation for batch rejection', async () => {
  await batchReviews(['a', 'b'], 'reject')
  expect(apiClient.post).toHaveBeenCalledWith('/notifications/reviews/batch',
    { ids: ['a', 'b'], action: 'reject' })
})
it('does not hide body lookup failures', async () => {
  vi.mocked(apiClient.get).mockRejectedValue(new Error('expired'))
  await expect(fetchReview('id')).rejects.toThrow('expired')
})
it('uses concurrency and replay headers when saving a Bot candidate', async () => {
  await saveBotConfig({ service_id: 'b', name: 'Bot', kind: 'discord_bridge', enabled: true,
    row_version: 5, applied_config_version_id: null, desired_config_version_id: null },
  {}, 'test-secret', 'gateway', 'same')
  expect(apiClient.post).toHaveBeenCalledWith('/bots/services/b/config-versions',
    { settings: {}, secret: 'test-secret', onebot_service_id: 'gateway' },
    { headers: { 'Idempotency-Key': 'same', 'If-Match': '5' } })
})
it('requests server-side secret retention for forwarding-only changes', async () => {
  await saveBotConfig({ service_id: 'b', name: 'Bot', kind: 'discord_bridge', enabled: true,
    row_version: 6, applied_config_version_id: 'source', desired_config_version_id: 'source' },
  { DISCORD_GUILD_IDS: '1439045928785940598' }, null, 'gateway', 'same', 'source')
  expect(apiClient.post).toHaveBeenCalledWith('/bots/services/b/config-versions',
    { settings: { DISCORD_GUILD_IDS: '1439045928785940598' }, secret: null,
      onebot_service_id: 'gateway', retain_secret_from_config_version_id: 'source' },
    { headers: { 'Idempotency-Key': 'same', 'If-Match': '6' } })
})
