import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../src/shared/api/client', () => ({ apiClient: api }))
import { testAiChatProfile, testAiProvider } from '../src/shared/api/bot-ai'

describe('AI provider test requests', () => {
  it('allows time for a slow model without changing the global request timeout', async () => {
    api.post.mockResolvedValue({ data: { state: 'failed' } })
    await testAiProvider('service', 'vision')
    await testAiChatProfile('service', 'profile')
    expect(api.post).toHaveBeenNthCalledWith(1, '/bots/ai/providers/test/service', { role: 'vision' }, { timeout: 75_000 })
    expect(api.post).toHaveBeenNthCalledWith(2, '/bots/ai/chat-profiles/service/profile/test', undefined, { timeout: 75_000 })
  })
})
