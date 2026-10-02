import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton } from 'element-plus'

const get = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { get } }))

import TerminalCapability from '../src/modules/terminals/TerminalCapability.vue'
import TerminalStorage from '../src/modules/terminals/TerminalStorage.vue'

const storage = {
  directory: '/var/lib/al1s',
  total_bytes: 20 * 1024 ** 3,
  used_bytes: 10 * 1024 ** 3,
  available_bytes: 10 * 1024 ** 3,
}

afterEach(() => {
  vi.restoreAllMocks()
  get.mockReset()
})

describe('terminal storage presentation', () => {
  it('shows the directory, GiB values, percentage and live state', () => {
    const wrapper = mount(TerminalStorage, {
      props: { storage, storageObservedAt: '2026-09-20T01:02:03Z', storageProbeOk: true, serviceStatus: 'online' },
    })
    try {
      expect(wrapper.text()).toContain('/var/lib/al1s')
      expect(wrapper.text()).toContain('20.00 GiB')
      expect(wrapper.text()).toContain('10.00 GiB')
      expect(wrapper.text()).toContain('50.0%')
      expect(wrapper.text()).toContain('当前观测')
      expect(wrapper.text()).not.toContain('实时正常')
    } finally { wrapper.unmount() }
  })

  it('marks offline or failed probes as last observation and unknown now', () => {
    const wrapper = mount(TerminalStorage, {
      props: { storage, storageObservedAt: '2026-09-20T01:02:03Z', storageProbeOk: false, serviceStatus: 'offline' },
    })
    try {
      expect(wrapper.text()).toContain('最后观测/当前未知')
      expect(wrapper.text()).not.toContain('实时正常')
    } finally { wrapper.unmount() }
  })

  it('keeps the capacity visible in the capability detail with a stale status', async () => {
    get.mockResolvedValue({ data: {
      profile_id: 'profile', revision: 1, observed_at: '2026-09-20T01:02:03Z',
      os_name: 'Linux', architecture: 'x86_64', cpu_cores: 4, memory_bytes: 2 * 1024 ** 3,
      storage_available_bytes: storage.available_bytes, provider_keys: [],
      adb_online: 0, adb_offline: 0, adb_unauthorized: 0,
    } })
    const wrapper = mount(TerminalCapability, {
      props: {
        terminalId: 'terminal', serviceStatus: 'offline', storage,
        storageObservedAt: '2026-09-20T01:02:03Z', storageProbeOk: true,
      },
    })
    try {
      await wrapper.findComponent(ElButton).trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('/var/lib/al1s')
      expect(wrapper.text()).toContain('最后观测/当前未知')
      expect(wrapper.text()).not.toContain('实时正常')
    } finally { wrapper.unmount() }
  })
})
