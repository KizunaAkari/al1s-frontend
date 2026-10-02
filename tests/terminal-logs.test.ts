import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const get = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { get } }))

import TerminalLogs from '../src/modules/terminals/TerminalLogs.vue'

it('shows bounded host logs and ignores a late response from another terminal', async () => {
  let finishFirst!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
  get.mockResolvedValueOnce({ data: { observed_at: '2026-09-25T00:00:00Z', lines: ['second terminal'] } })
  const wrapper = mount(TerminalLogs, {
    props: { terminalId: 'first', active: true },
  })
  try {
    await wrapper.setProps({ terminalId: 'second' })
    await flushPromises()
    finishFirst({ data: { observed_at: '2026-09-25T00:00:00Z', lines: ['first terminal'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('second terminal')
    expect(wrapper.text()).not.toContain('first terminal')
    expect(get).toHaveBeenCalledWith('/terminals/second/maintenance/logs', { timeout: 20000 })
  } finally { wrapper.unmount(); get.mockReset() }
})
