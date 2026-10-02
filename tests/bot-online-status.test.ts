import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import BotContainers from '../src/modules/bots/BotContainers.vue'
import BotOnlineStatus from '../src/modules/bots/BotOnlineStatus.vue'
import type { BotRuntimeStatus } from '../src/shared/api/bot-runtime'

const runtimeApi = vi.hoisted(() => ({ fetchBotRuntimeStatus: vi.fn() }))
const containerApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../src/shared/api/bot-runtime', () => runtimeApi)
vi.mock('../src/shared/api/client', () => ({ apiClient: containerApi }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function status(overrides: Partial<BotRuntimeStatus> = {}): BotRuntimeStatus {
  return {
    service_id: 'service-1', state: 'online', checked_at: '2026-10-01T12:00:00.000Z',
    observed_at: '2026-10-01T11:59:58.000Z', reason_code: 'online', error_code: null,
    ...overrides,
  }
}

const host = defineComponent({
  components: { BotContainers, BotOnlineStatus },
  template: '<div><BotContainers alias="discord" /><BotOnlineStatus service-id="service-1" /></div>',
})

const global = {
  stubs: {
    ElButton: { template: '<button v-bind="$attrs"><slot /></button>' },
    HelpHint: { template: '<span><slot /></span>' },
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  runtimeApi.fetchBotRuntimeStatus.mockReset()
  containerApi.get.mockReset()
  containerApi.post.mockReset()
  containerApi.get.mockResolvedValue({ data: {
    alias: 'discord', instance_id: 'i', running: true, status: 'running',
    started_at: '2026-10-01T11:00:00.000Z', finished_at: '', health: 'healthy', revision: 'r',
  }})
})

afterEach(() => { vi.useRealTimers() })

describe('BotOnlineStatus', () => {
  it('reads the selected service on mount and polls every ten seconds without overlapping requests', async () => {
    const first = deferred<BotRuntimeStatus>()
    runtimeApi.fetchBotRuntimeStatus.mockReturnValueOnce(first.promise).mockResolvedValue(status())
    const wrapper = mount(BotOnlineStatus, { props: { serviceId: 'service-1' } })

    await flushPromises()
    expect(runtimeApi.fetchBotRuntimeStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runtimeApi.fetchBotRuntimeStatus).toHaveBeenCalledTimes(1)
    first.resolve(status())
    await flushPromises()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runtimeApi.fetchBotRuntimeStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('isolates late replies after switching services and aborts on unmount', async () => {
    const first = deferred<BotRuntimeStatus>()
    const firstRequest = runtimeApi.fetchBotRuntimeStatus
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(status({ service_id: 'service-2', state: 'offline', reason_code: 'discord_disconnected' }))
    const wrapper = mount(BotOnlineStatus, { props: { serviceId: 'service-1' } })
    await flushPromises()
    const firstSignal = firstRequest.mock.calls[0]?.[1] as AbortSignal

    await wrapper.setProps({ serviceId: 'service-2' })
    await flushPromises()
    expect(runtimeApi.fetchBotRuntimeStatus).toHaveBeenCalledTimes(2)
    expect(firstSignal.aborted).toBe(true)
    expect(wrapper.text()).toContain('离线')
    first.resolve(status({ service_id: 'service-1', state: 'online' }))
    await flushPromises()
    expect(wrapper.text()).toContain('离线')
    expect(wrapper.get('.bot-online-value').text()).not.toBe('在线')

    wrapper.unmount()
  })

  it('aborts the current runtime request on unmount', async () => {
    const pending = deferred<BotRuntimeStatus>()
    runtimeApi.fetchBotRuntimeStatus.mockReturnValueOnce(pending.promise)
    const wrapper = mount(BotOnlineStatus, { props: { serviceId: 'service-1' } })
    await flushPromises()
    const signal = runtimeApi.fetchBotRuntimeStatus.mock.calls[0]?.[1] as AbortSignal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
  })

  it('clears an online result when a refresh fails and renders fixed reason/error labels', async () => {
    runtimeApi.fetchBotRuntimeStatus
      .mockResolvedValueOnce(status({ reason_code: 'discord_heartbeat_stale', error_code: 'discord_login_timeout' }))
      .mockRejectedValueOnce(new Error('raw exception must not be shown'))
    const wrapper = mount(BotOnlineStatus, { props: { serviceId: 'service-1' } })
    await flushPromises()
    expect(wrapper.text()).toContain('在线')
    expect(wrapper.text()).toContain('Discord 心跳过期')
    expect(wrapper.text()).toContain('Discord 登录超时')

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('未知')
    expect(wrapper.get('.bot-online-value').text()).not.toBe('在线')
    expect(wrapper.text()).not.toContain('raw exception must not be shown')
    wrapper.unmount()
  })

  it('keeps container health separate from an offline account status', async () => {
    runtimeApi.fetchBotRuntimeStatus.mockResolvedValue(status({ state: 'offline', reason_code: 'qq_not_logged_in' }))
    const wrapper = mount(host, { global })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(containerApi.get).toHaveBeenCalled()
    expect(wrapper.text()).toContain('容器健康检查')
    expect(wrapper.text()).toContain('正常')
    expect(wrapper.text()).toContain('离线')
    expect(wrapper.text()).toContain('QQ 未登录')
    expect(wrapper.text()).not.toContain('账号状态')
    wrapper.unmount()
  })

  it('shows restarting separately from a health check in progress', async () => {
    containerApi.get.mockResolvedValueOnce({ data: {
      alias: 'discord', instance_id: 'i', running: false, status: 'restarting',
      started_at: null, finished_at: '', health: 'starting', revision: 'r',
    }})
    const wrapper = mount(BotContainers, { props: { alias: 'discord' }, global })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    expect(wrapper.text()).toContain('重启中')
    expect(wrapper.text()).toContain('检查中')
    wrapper.unmount()
  })

  it('shows unknown rather than unconfigured when the container status cannot be read', async () => {
    containerApi.get.mockRejectedValueOnce(new Error('control unavailable'))
    const wrapper = mount(BotContainers, { props: { alias: 'discord' }, global })
    await flushPromises()
    expect(wrapper.text()).toContain('容器健康检查')
    expect(wrapper.text()).toContain('未知')
    expect(wrapper.text()).not.toContain('未配置')
    wrapper.unmount()
  })

  it.each([
    ['disabled', '已停用'], ['unconfigured', '未配置'], ['unknown', '未知'],
  ] as const)('maps runtime state %s to %s', async (state, label) => {
    runtimeApi.fetchBotRuntimeStatus.mockResolvedValue(status({ state, reason_code: state }))
    const wrapper = mount(BotOnlineStatus, { props: { serviceId: 'service-1' } })
    await flushPromises()
    expect(wrapper.text()).toContain(label)
    wrapper.unmount()
  })
})
