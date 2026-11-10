import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ quant: vi.fn(), freqtrade: vi.fn(), owner: vi.fn(), account: vi.fn(), save: vi.fn() }))
vi.mock('../src/shared/api/quant', () => ({ fetchQuantSettings: api.quant, fetchQuantStatus: vi.fn(),
  fetchQuantCredentials: vi.fn().mockResolvedValue({}), saveQuantSettings: api.save, saveQuantCredential: vi.fn() }))
vi.mock('../src/shared/api/freqtrade', () => ({ fetchFreqtradeSettings: api.freqtrade, fetchFreqtradeStatus: vi.fn(),
  saveFreqtradeSettings: api.save }))
vi.mock('../src/shared/api/trading-accounts', () => ({ fetchTradingOwner: api.owner, fetchTradingAccount: api.account,
  saveTradingOwner: vi.fn(), submitTradingAction: vi.fn(), fetchTradingOperation: vi.fn() }))

import QuantSettings from '../src/modules/bots/quant/QuantSettings.vue'
import FreqtradeSettings from '../src/modules/bots/freqtrade/FreqtradeSettings.vue'

beforeEach(() => {
  vi.clearAllMocks()
  const settings = { enabled: true, private_enabled: false, event_ws_url: 'ws://llbot:3001', groups: [],
    initial_cash: '1000', commission_rate: '0', minimum_commission: '0', stamp_tax_rate: '0', slippage: '0',
    max_quote_age_seconds: 120, bar_cache_days: 30, refresh_seconds: 60, reply_interval_seconds: 10,
    provider: 'sina', provider_order: ['sina'], fee: '0.001', futures_enabled: true, futures_initial_cash: '1000',
    futures_fee: '0.0005', futures_default_leverage: 3, futures_max_leverage: 0, max_active_accounts: 5, idle_seconds: 300 }
  api.quant.mockResolvedValue({ desired: { settings, commands: {}, row_version: 1, mapping_version: 1 },
    applied: { row_version: 1, mapping_version: 1 }, process_applied: { row_version: 1, mapping_version: 1 }, synchronized: true })
  api.freqtrade.mockResolvedValue({ desired: { settings, commands: {}, row_version: 1 }, applied_version: 1, synchronized: true })
  api.owner.mockResolvedValue({ qq_id: '123456', row_version: 1 })
  api.account.mockResolvedValue({ status: 'failed', code: 'account_missing', owner_version: 1 })
})

it.each([[QuantSettings, 'quant'], [FreqtradeSettings, 'freqtrade']] as const)(
  'keeps the deployed settings tabs and opens account management', async (component, prefix) => {
    const page = mount(component, { props: { serviceId: 'qq' } })
    await flushPromises()
    expect(page.get(`#${prefix}-tab-general`).text()).toContain('通用设置')
    expect(page.get(`#${prefix}-tab-sources`).text()).toContain('行情数据')
    expect(page.get(`#${prefix}-tab-replies`).text()).toContain('指令配置')
    await page.get(`#${prefix}-tab-accounts`).trigger('click')
    await flushPromises()
    expect(page.get(`#${prefix}-panel-accounts`).text()).toContain('QQ 123456')
    expect(page.text()).toContain('尚未开户')
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  },
)
