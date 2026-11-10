import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { componentApi, componentLabel, targetKey } from '../src/shared/api/components'
import { botUpdateApi } from '../src/shared/api/bot-updates'

afterEach(() => vi.restoreAllMocks())
it('keeps framework and terminal identity separate and rejects empty target IDs', async () => {
  expect(componentLabel('maa')).toBe('MaaFramework')
  expect(componentLabel('linux-terminal')).toBe('Linux 终端')
  expect(targetKey({ kind: 'platform' })).toBe('platform')
  const post = vi.spyOn(apiClient, 'post')
  await expect(componentApi.preflight({ kind: 'terminal', terminal_id: '' }, 'release')).rejects.toThrow()
  expect(post).not.toHaveBeenCalled()
})

it('submits only the immutable preflight selection and expected source identity', async () => {
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { state: 'accepted' } })
  const input = { component: 'postgresql' as const, target: { kind: 'platform' as const },
    release_id: 'release', expected_source: 'a'.repeat(64), idempotency_key: 'operation-key' }
  const response = await componentApi.start(input)
  expect(response.state).toBe('accepted')
  expect(post).toHaveBeenCalledWith('/components/upgrades', input, { timeout: 28_000 })
})

it('allows time for Bot capability probes on version and upgrade requests', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} })
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
  await botUpdateApi.state('qq')
  await componentApi.preflight({ kind: 'bot', bot_alias: 'qq' }, 'release')
  expect(get).toHaveBeenCalledWith('/bots/updates/qq', { timeout: 28_000 })
  expect(post).toHaveBeenCalledWith('/components/preflight',
    { target: { kind: 'bot', bot_alias: 'qq' }, release_id: 'release' }, { timeout: 28_000 })
})
