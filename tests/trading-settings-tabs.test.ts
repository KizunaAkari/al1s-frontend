import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import QuantSettings from '../src/modules/bots/quant/QuantSettings.vue'

const api = vi.hoisted(() => ({ fetchQuantSettings: vi.fn(), fetchQuantStatus: vi.fn(), saveQuantSettings: vi.fn(), fetchQuantCredentials: vi.fn(), saveQuantCredential: vi.fn() }))
vi.mock('../src/shared/api/quant', () => api)

it('keeps changes across focused trading sections without saving them', async () => {
  const settings = { enabled: false, private_enabled: false, event_ws_url: null, groups: [], initial_cash: '100000',
    commission_rate: '0', minimum_commission: '5', stamp_tax_rate: '0', slippage: '0', max_quote_age_seconds: 120,
    bar_cache_days: 30, refresh_seconds: 60, reply_interval_seconds: 10, provider: 'sina', provider_order: ['sina','tencent','eastmoney','tushare','gugudata'] }
  const value = { desired: { settings, commands: { buy: '模拟买入' }, row_version: 1, mapping_version: 1 },
    applied: { row_version: 1, mapping_version: 1 }, process_applied: { row_version: 1, mapping_version: 1 }, synchronized: true }
  api.fetchQuantSettings.mockResolvedValue(value); api.fetchQuantCredentials.mockResolvedValue({})
  api.fetchQuantStatus.mockRejectedValue(new Error('not requested')); api.saveQuantSettings.mockClear()
  const page = mount(QuantSettings, { props: { serviceId: 'qq' } })
  await flushPromises()
  await page.get('[data-settings-tab="general"]').trigger('keydown', { key: 'ArrowRight' })
  expect(page.get('[data-settings-tab="sources"]').attributes('aria-selected')).toBe('true')
  await page.get('[data-settings-tab="general"]').trigger('click')
  await page.get('[data-rate="commission_rate"]').setValue('0.03')
  await page.get('[data-settings-tab="sources"]').trigger('click')
  expect(page.get('[data-section="basic"]').attributes('style')).toContain('display: none')
  expect((page.get('[data-section="sources"]').element as HTMLElement).style.display).not.toBe('none')
  await page.get('[data-settings-tab="general"]').trigger('click')
  expect((page.get('[data-rate="commission_rate"]').element as HTMLInputElement).value).toBe('0.03')
  expect(api.saveQuantSettings).not.toHaveBeenCalled()
  page.unmount()
})

it('keeps general drafts when one command is saved and sends settings without command mappings', async () => {
  const settings = { enabled: false, private_enabled: false, event_ws_url: null, groups: [], initial_cash: '100000',
    commission_rate: '0', minimum_commission: '5', stamp_tax_rate: '0', slippage: '0', max_quote_age_seconds: 120,
    bar_cache_days: 30, refresh_seconds: 60, reply_interval_seconds: 10, provider: 'sina', provider_order: ['sina','tencent','eastmoney','tushare','gugudata'] }
  const value = { desired: { settings, commands: { buy: '模拟买入' }, row_version: 1, mapping_version: 1 },
    applied: { row_version: 1, mapping_version: 1 }, process_applied: { row_version: 1, mapping_version: 1 }, synchronized: true }
  api.fetchQuantSettings.mockResolvedValue(value); api.fetchQuantCredentials.mockResolvedValue({})
  api.fetchQuantStatus.mockRejectedValue(new Error('not requested'))
  api.saveQuantSettings.mockResolvedValue(value)
  const page = mount(QuantSettings, { props: { serviceId: 'qq' }, global: { stubs: {
    CommandReplyEditor: { template: '<button data-command-saved @click="$emit(\'saved\', {row_version: 2, mapping_version: 2, synchronized: true, commands: [{id: \'buy\', keyword: \'买股票\'}]})">保存当前指令</button>' },
  } } })
  await flushPromises()
  await page.get('[data-rate="commission_rate"]').setValue('0.03')
  await page.get('[data-settings-tab="replies"]').trigger('click')
  await page.get('[data-command-saved]').trigger('click')
  await page.get('[data-settings-tab="general"]').trigger('click')
  expect((page.get('[data-rate="commission_rate"]').element as HTMLInputElement).value).toBe('0.03')
  await page.get('[data-action="save-quant-settings"]').trigger('click'); await flushPromises()
  expect(api.saveQuantSettings).toHaveBeenCalledWith('qq', { settings: expect.objectContaining({ commission_rate: '0.0003' }) }, 2, expect.any(String))
  expect(page.find('[data-command="buy"]').exists()).toBe(false)
  page.unmount()
})
