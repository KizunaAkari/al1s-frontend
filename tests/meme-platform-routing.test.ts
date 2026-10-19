import { beforeEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { createMemeApi, type PreviewInput } from '../src/shared/api/memes'

vi.mock('../src/shared/api/client', () => ({ apiClient: { post: vi.fn(), get: vi.fn(), put: vi.fn() } }))
beforeEach(() => { vi.mocked(apiClient.post).mockReset(); vi.mocked(apiClient.post).mockResolvedValue({ data: new Blob() }) })
it('binds each preview to its platform without changing another client', async () => {
  const qq = createMemeApi('qq'), discord = createMemeApi('discord')
  const input = {} as PreviewInput
  await qq.preview(input); await discord.preview(input); await qq.preview(input)
  expect(vi.mocked(apiClient.post).mock.calls.map(call => call[0])).toEqual(['/bots/memes/qq/preview', '/bots/memes/discord/preview', '/bots/memes/qq/preview'])
})
it('routes connection configuration and global rates to the selected bot backend', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
  const qq = createMemeApi('qq')
  await qq.fetchMemeSettings('connection-1')
  await qq.fetchRateLimits()
  expect(apiClient.get).toHaveBeenCalledWith('/bots/memes/qq/settings/connection-1')
  expect(apiClient.get).toHaveBeenCalledWith('/bots/memes/qq/rate-limits')
})
