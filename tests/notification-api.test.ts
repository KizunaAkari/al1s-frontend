import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { createSmtpChannel, enqueueNotificationTest, fetchDeliveries, fetchDelivery, setChannelEnabled, toggleNotificationRoute } from '../src/shared/api/notifications'

vi.mock('../src/shared/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

describe('notification read API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the same test identity when a network response is retried', async () => {
    const body = { channel_id: 'channel', targets: ['me@example.test'], summary: 'test' }
    vi.mocked(apiClient.post).mockResolvedValue({ data: { delivery_id: 'd', replayed: true } })
    await enqueueNotificationTest(body, 'same-key')
    await enqueueNotificationTest(body, 'same-key')
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/notifications/tests', body,
      { headers: { 'Idempotency-Key': 'same-key' } })
  })

  it('fences route status updates with the loaded row version', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} })
    await toggleNotificationRoute({
      route_id: 'route', channel_id: 'channel', notification_kind: 'script_failure',
      targets: ['me@example.test'], template_key: 'script_failure.v1', enabled: true, row_version: 3,
    })
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/routes/route',
      { enabled: false }, { headers: { 'If-Match': '3' } })
  })

  it('passes status, cursor and bounded page size', async () => {
    const page = { items: [], next_cursor: 'next' }
    vi.mocked(apiClient.get).mockResolvedValue({ data: page })
    expect(await fetchDeliveries('dead_letter', 'cursor', 'forward')).toEqual(page)
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/deliveries', {
      params: { status: 'dead_letter', cursor: 'cursor', notification_kind: 'forward', limit: 50 },
    })
  })

  it('reads per-delivery attempts without posting a retry', async () => {
    const result = { delivery: {}, attempts: [] }
    vi.mocked(apiClient.get).mockResolvedValue({ data: result })
    expect(await fetchDelivery('a/b')).toEqual(result)
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/deliveries/a%2Fb')
  })

  it('does not turn transport errors into empty success', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'))
    await expect(fetchDeliveries()).rejects.toThrow('offline')
  })

  it('reuses the supplied creation key and identifies the channel as SMTP', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
    const body = { name: 'mail', settings: { host: 'example.test' }, secret: null }
    await createSmtpChannel(body, 'stable-key')
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/channels',
      { ...body, kind: 'smtp' }, { headers: { 'Idempotency-Key': 'stable-key' } })
  })

  it('includes the loaded version when disabling a channel', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} })
    await setChannelEnabled({
      channel_id: 'id', name: 'mail', kind: 'smtp', enabled: true,
      row_version: 7, secret_configured: true,
    }, false)
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/channels/id',
      { enabled: false }, { headers: { 'If-Match': '7' } })
  })
})
