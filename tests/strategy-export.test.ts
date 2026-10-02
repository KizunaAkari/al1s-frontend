import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const get = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({
  apiClient: { get },
  normalizeApiError: (value: unknown) => ({ message: value instanceof Error ? value.message : '导出失败' }),
}))

import StrategyExportButton from '../src/modules/maa/StrategyExportButton.vue'
import type { MaaStrategy } from '../src/shared/api/maa'

const strategy = {
  strategy_id: 'strategy', current_version_id: 'version', name: '每日策略',
} as MaaStrategy

beforeEach(() => {
  get.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:strategy')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

it('downloads the current strategy archive through the maa export route', async () => {
  get.mockResolvedValue({ data: new Blob(['zip']) })
  const wrapper = mount(StrategyExportButton, { props: { strategy } })
  try {
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/maa/strategies/strategy/archive', { responseType: 'blob', timeout: 180000 })
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('导出失败')
  } finally { wrapper.unmount() }
})

it('does not request an archive without a current published version', async () => {
  const wrapper = mount(StrategyExportButton, { props: { strategy: { ...strategy, current_version_id: null } } })
  try {
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(get).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('shows export failure without retrying automatically', async () => {
  get.mockRejectedValue(new Error('归档暂不可用'))
  const wrapper = mount(StrategyExportButton, { props: { strategy } })
  try {
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('归档暂不可用')
    expect(get).toHaveBeenCalledOnce()
  } finally { wrapper.unmount() }
})
