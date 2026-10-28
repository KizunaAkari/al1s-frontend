import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), status: vi.fn(), credentials: vi.fn(), saveCredential: vi.fn() }))
vi.mock('../src/shared/api/quant', () => ({ fetchQuantSettings: api.fetch, saveQuantSettings: api.save, fetchQuantStatus: api.status, fetchQuantCredentials: api.credentials, saveQuantCredential: api.saveCredential }))
import QuantSettings from '../src/modules/bots/quant/QuantSettings.vue'

const record = () => ({ desired: { settings: { enabled: false, private_enabled: false,
  event_ws_url: 'ws://llbot:3001', groups: ['123456'], initial_cash: '100000', commission_rate: '0',
  minimum_commission: '0', stamp_tax_rate: '0', slippage: '0', max_quote_age_seconds: 120,
  bar_cache_days: 30, refresh_seconds: 60, reply_interval_seconds: 10, provider: 'sina', provider_order: ['sina', 'tencent', 'eastmoney', 'tushare', 'gugudata'] },
  commands: { open: '模拟开户', buy: '模拟买入', sell: '模拟卖出', balance: '模拟资产',
    positions: '模拟持仓', orders: '模拟成交', backtest: '回测', help: '量化帮助' },
  row_version: 1, mapping_version: 1 }, applied: { row_version: 1, mapping_version: 1 },
  process_applied: { row_version: 1, mapping_version: 1 }, synchronized: true })

describe('QQ quant settings', () => {
  beforeEach(() => { vi.clearAllMocks(); api.fetch.mockResolvedValue(record()); api.save.mockResolvedValue(record()); api.credentials.mockResolvedValue({ tushare: false, gugudata: false }); api.saveCredential.mockResolvedValue({ configured: true }); api.status.mockResolvedValue({ database: 'available', engine: { version: '0.3.71', entitlement_supported: true }, source: {}, rss_bytes: 1024, cpu_seconds: 1, cpu_percent: 0.5 }) })

  it('loads configuration and saves editable literal command with version', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.get('[aria-label="量化服务监测"]').text()).toContain('数据库：正常')
    expect(page.get('[aria-label="量化服务监测"]').text()).toContain('0.5%')
    expect((page.get('[data-command="buy"]').element as HTMLInputElement).value).toBe('模拟买入')
    await page.get('[data-command="buy"]').setValue('买股票')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({
      commands: expect.objectContaining({ buy: '买股票' }),
    }), 1, expect.any(String))
  })

  it('keeps the draft when the save conflicts and does not claim success', async () => {
    api.save.mockRejectedValue(new Error('quant_keyword_conflict'))
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-command="buy"]').setValue('摸摸')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect((page.get('[data-command="buy"]').element as HTMLInputElement).value).toBe('摸摸')
    expect(page.text()).toContain('quant_keyword_conflict')
  })

  it('reorders providers and keeps credentials out of settings', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-source-up="tencent"]').trigger('click')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({ settings: expect.objectContaining({ provider: 'tencent', provider_order: ['tencent', 'sina', 'eastmoney', 'tushare', 'gugudata'] }) }), 1, expect.any(String))
    await page.get('[data-credential="tushare"]').setValue('private-key')
    await page.get('[data-save-credential="tushare"]').trigger('click')
    await flushPromises()
    expect(api.saveCredential).toHaveBeenCalledWith('tushare', 'private-key')
    expect((page.get('[data-credential="tushare"]').element as HTMLInputElement).value).toBe('')
  })
})
