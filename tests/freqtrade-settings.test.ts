import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), status: vi.fn() }))
vi.mock('../src/shared/api/freqtrade', () => ({
  fetchFreqtradeSettings: api.fetch,
  saveFreqtradeSettings: api.save,
  fetchFreqtradeStatus: api.status,
}))

import FreqtradeSettings from '../src/modules/bots/freqtrade/FreqtradeSettings.vue'
import type { FreqtradeAction, FreqtradeSettings as FreqtradeSettingsShape, FreqtradeView } from '../src/shared/api/freqtrade'

const commandReplyEditorStub = {
  props: ['revision'],
  template: '<div data-section="command-replies"><button data-command-saved type="button" @click="$emit(\'saved\', { row_version: revision + 1, mapping_version: revision + 1, synchronized: true, commands: [{ id: \'buy\', keyword: \'买股票\' }] })">保存当前指令</button></div>',
}
const settingsGlobal = { stubs: { CommandReplyEditor: commandReplyEditorStub } }

const record = () => ({
  desired: {
    settings: {
      enabled: false, private_enabled: false, event_ws_url: null, groups: ['123456'], initial_cash: '1000', fee: '0.00125',
      reply_interval_seconds: 10, max_active_accounts: 5, idle_seconds: 300,
    },
    commands: { open: '币开户', buy: '币买入', sell: '币卖出', balance: '币资产', positions: '币持仓', orders: '币成交', help: '币帮助' },
    row_version: 3,
  },
  applied_version: 3,
  synchronized: true,
})
const fullRecord = (settings: Partial<FreqtradeSettingsShape> = {}): FreqtradeView => ({
  desired: {
    settings: {
      enabled: false, private_enabled: false, event_ws_url: null, groups: ['123456'], initial_cash: '1000', fee: '0.00125',
      futures_enabled: false, futures_initial_cash: '1000', futures_fee: '0.0005', futures_default_leverage: 3, futures_max_leverage: 0,
      reply_interval_seconds: 10, max_active_accounts: 5, idle_seconds: 300, ...settings,
    },
    commands: {
      open: '币开户', buy: '币买入', sell: '币卖出', balance: '币资产', positions: '币持仓', orders: '币成交', help: '币帮助',
      chart: '币走势', deposit: '币充值', f_open: '合约开户', long: '合约开多', short: '合约开空', close: '合约平仓', f_balance: '合约资产', f_positions: '合约持仓', f_orders: '合约成交', f_chart: '合约走势', f_deposit: '合约充值', f_margin: '合约加保证金',
    } satisfies Record<FreqtradeAction, string>,
    row_version: 3,
  },
  applied_version: 3,
  synchronized: true,
})
const status = () => ({
  state: 'ready', version: '2026.9', active_accounts: 1, total_accounts: 2, max_active_accounts: 5, rss_bytes: 1024, cpu_percent: 0.5,
  market: { state: 'available', last_success: '2026-10-28T10:00:00Z', error: null },
})

describe('Freqtrade settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetch.mockResolvedValue(record())
    api.save.mockResolvedValue(record())
    api.status.mockResolvedValue(status())
  })

  it('keeps both market drafts across focused sections without saving on navigation', async () => {
    api.fetch.mockResolvedValue(fullRecord())
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-rate="fee"]').setValue('0.03')
    await page.get('[data-field="futures-initial-cash"]').setValue('2000')
    await page.get('[data-settings-tab="sources"]').trigger('click')
    expect((page.get('[data-section="market"]').element as HTMLElement).style.display).not.toBe('none')
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-settings-tab="general"]').trigger('click')
    expect((page.get('[data-field="futures-initial-cash"]').element as HTMLInputElement).value).toBe('2000')
    expect((page.get('[data-rate="fee"]').element as HTMLInputElement).value).toBe('0.03')
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  })

  it('lets the user switch between auto-tier and a remembered fixed leverage limit', async () => {
    api.fetch.mockResolvedValue(fullRecord({ futures_max_leverage: 12 }))
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-leverage-mode="auto"]').setValue()
    expect((page.get('[data-field="futures-max-leverage"]').element as HTMLInputElement).value).toBe('0')
    await page.get('[data-settings-tab="sources"]').trigger('click')
    await page.get('[data-settings-tab="general"]').trigger('click')
    await page.get('[data-leverage-mode="fixed"]').setValue()
    expect((page.get('[data-field="futures-max-leverage"]').element as HTMLInputElement).value).toBe('12')
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  })

  it('shows fixed dry-run market details and converts the API fee ratio to percent on save', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    expect(page.get('[data-section="market"]').text()).toContain('Binance Spot')
    expect(page.get('[data-section="market"]').text()).toContain('BTC/USDT ETH/USDT SOL/USDT')
    expect(page.get('[data-section="market"]').text()).toContain('dry-run')
    expect((page.get('[data-rate="fee"]').element as HTMLInputElement).value).toBe('0.125')

    await page.get('[data-rate="fee"]').setValue('0.03')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', { settings: expect.objectContaining({ fee: '0.0003' }) }, 3, expect.any(String))
  })

  it('acknowledges a manual status refresh even when values do not change', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    page.vm.refreshStatus()
    await flushPromises()
    expect(page.vm.statusMessage).toBe('状态已刷新')
  })

  it('prevents editing submitted futures settings while a save is in flight', async () => {
    let finish!: (value: ReturnType<typeof record>) => void
    api.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-field="futures-initial-cash"]').setValue('2500')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    expect(page.get('[data-field="futures-initial-cash"]').element.closest('fieldset[disabled]')).not.toBeNull()
    expect(page.get('[data-settings-tab="replies"]').element.matches(':disabled')).toBe(true)
    finish(record())
    await flushPromises()
    expect(page.get('[data-field="futures-initial-cash"]').element.closest('fieldset[disabled]')).toBeNull()
  })

  it('keeps a failed draft and reuses its idempotency key on an identical retry', async () => {
    api.save.mockRejectedValueOnce(new Error('保存失败')).mockResolvedValueOnce(record())
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    const replyInterval = page.findAll('[data-section="basic"] label').find(label => label.text().includes('回复间隔'))!.get('input')
    await replyInterval.setValue('11')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    expect((replyInterval.element as HTMLInputElement).value).toBe('11')
    expect(page.text()).toContain('保存失败')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    expect(api.save.mock.calls[0]![3]).toBe(api.save.mock.calls[1]![3])
  })

  it('does not silently save while an authorization group is still being entered', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('.qq-group-button').trigger('click')
    await page.get('input[aria-label="QQ群号"]').setValue('987654321')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    expect(api.save).not.toHaveBeenCalled()
    expect(page.text()).toContain('请先添加或清空待输入的群号')
    expect(page.vm.hasUnsaved).toBe(true)
    page.unmount()
  })

  it('shows saved command words in help without saving general settings', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, attachTo: document.body, global: settingsGlobal })
    try {
      await flushPromises()
      await page.get('[data-settings-tab="replies"]').trigger('click')
      await flushPromises()
      const button = page.get('button[aria-label="Freqtrade帮助说明"]')
      await button.trigger('click')
      await flushPromises()
      const help = () => document.querySelector('.freqtrade-help-content')?.textContent ?? ''
      expect(help()).toContain('币买入 BTC 100')
      await page.get('[data-command-saved]').trigger('click')
      await flushPromises()
      expect(help()).toContain('买股票 BTC 100')
      expect(help()).not.toContain('币买入 BTC 100')
      expect(help()).toContain('币走势 BTC 1小时')
      expect(help()).toContain('合约走势 BTC 4小时')
      expect(help()).toContain('币充值 1000')
      expect(help()).toContain('合约充值 1000')
      expect(help()).toContain('合约加保证金 BTC 100')
      expect(help()).toContain('不改变数量、均价或原始杠杆')
      expect(help()).toContain('最多4位小数')
      expect(help()).toContain('dry_run扩展')
      expect(help()).toContain('PNG收盘价折线图')
      expect(help()).toContain('无需开户')
      expect(api.save).not.toHaveBeenCalled()
    } finally { page.unmount() }
  })

  it('merges legacy responses with futures defaults and exposes the reply tab', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    expect((page.get('[data-field="futures-initial-cash"]').element as HTMLInputElement).value).toBe('1000')
    expect((page.get('[data-rate="futures_fee"]').element as HTMLInputElement).value).toBe('0.05')
    expect((page.get('[data-field="futures-default-leverage"]').element as HTMLInputElement).value).toBe('3')
    expect((page.get('[data-field="futures-max-leverage"]').element as HTMLInputElement).value).toBe('0')
    expect(page.get('[data-section="futures-trading"]').text()).toContain('0=跟随原生模拟档位')
    expect(page.find('[data-command]').exists()).toBe(false)
    expect(page.get('[data-settings-tab="replies"]').text()).toContain('19')
  })

  it('keeps legacy saved command words while adding chart defaults to help', async () => {
    const legacy = record()
    legacy.desired.commands.buy = '自定义买入'
    api.fetch.mockResolvedValue(legacy)
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, attachTo: document.body, global: settingsGlobal })
    try {
      await flushPromises()
      await page.get('[data-settings-tab="replies"]').trigger('click')
      await flushPromises()
      await page.get('button[aria-label="Freqtrade帮助说明"]').trigger('click')
      await flushPromises()
      const help = () => document.querySelector('.freqtrade-help-content')?.textContent ?? ''
      expect(help()).toContain('自定义买入 BTC 100')
      expect(help()).toContain('币走势 BTC 1小时')
      expect(help()).toContain('合约走势 BTC 4小时')
      expect(page.find('[data-command]').exists()).toBe(false)
    } finally { page.unmount() }
  })

  it('switches spot and futures views without fetching, saving, or converting either draft', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    const spotCash = page.findAll('[data-section="basic"] label').find(label => label.text().includes('现货新账户初始虚拟资金'))!.get('input')
    await spotCash.setValue('1200')
    await page.get('[data-field="futures-initial-cash"]').setValue('2500')
    await page.get('[data-settings-tab="sources"]').trigger('click')
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-market-view="spot"]').trigger('click')
    await page.get('[data-settings-tab="general"]').trigger('click')
    expect((spotCash.element as HTMLInputElement).value).toBe('1200')
    expect((page.get('[data-field="futures-initial-cash"]').element as HTMLInputElement).value).toBe('2500')
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(api.save).not.toHaveBeenCalled()
  })

  it('serializes futures fields and fee ratio without command mappings', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-field="futures-enabled"]').setValue(true)
    await page.get('[data-field="futures-initial-cash"]').setValue('2500')
    await page.get('[data-rate="futures_fee"]').setValue('0.08')
    await page.get('[data-field="futures-default-leverage"]').setValue('7')
    await page.get('[data-field="futures-max-leverage"]').setValue('12')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', { settings: expect.objectContaining({ futures_enabled: true, futures_initial_cash: '2500', futures_fee: '0.0008', futures_default_leverage: 7, futures_max_leverage: 12 }) }, 3, expect.any(String))
  })

  it('uses the replaced settings object for edits and a second save', async () => {
    api.save.mockResolvedValueOnce(fullRecord({ futures_initial_cash: '2000', futures_default_leverage: 4 }))
      .mockResolvedValueOnce(fullRecord({ futures_initial_cash: '2600', futures_default_leverage: 6 }))
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-field="futures-initial-cash"]').setValue('2500')
    await page.get('[data-field="futures-default-leverage"]').setValue('5')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    await page.get('[data-field="futures-initial-cash"]').setValue('2600')
    await page.get('[data-field="futures-default-leverage"]').setValue('6')
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    const [, secondValue] = api.save.mock.calls[1]!
    expect(secondValue.settings.futures_initial_cash).toBe('2600')
    expect(secondValue.settings.futures_default_leverage).toBe(6)
  })

  it('saves auto-tier leverage zero while preserving the configured default leverage', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-field="futures-default-leverage"]').setValue('9')
    expect(page.find('[data-error="leverage"]').exists()).toBe(false)
    await page.get('[data-action="save-freqtrade-settings"]').trigger('click')
    await flushPromises()
    const [, value] = api.save.mock.calls[0]!
    expect(value.settings.futures_default_leverage).toBe(9)
    expect(value.settings.futures_max_leverage).toBe(0)
  })

  it('shows leverage feedback and blocks saving when default exceeds maximum', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-market-view="futures"]').trigger('click')
    await page.get('[data-field="futures-default-leverage"]').setValue('20')
    await page.get('[data-field="futures-max-leverage"]').setValue('10')
    expect(page.get('[data-error="leverage"]').text()).toContain('默认杠杆不能高于最大杠杆')
    expect(page.get('[data-action="save-freqtrade-settings"]').attributes('disabled')).toBeDefined()
    expect(api.save).not.toHaveBeenCalled()
  })

  it('explains futures margin, notional value, and close examples without saving', async () => {
    const page = mount(FreqtradeSettings, { props: { serviceId: 'qq-service' }, attachTo: document.body, global: settingsGlobal })
    try {
      await flushPromises()
      await page.get('[data-settings-tab="replies"]').trigger('click')
      await flushPromises()
      const button = page.get('button[aria-label="Freqtrade帮助说明"]')
      await button.trigger('click')
      await flushPromises()
      const help = () => document.querySelector('.freqtrade-help-content')?.textContent ?? ''
      expect(help()).toContain('合约开多 BTC 100 10')
      expect(help()).toContain('约1000 USDT名义价值')
      expect(help()).toContain('合约开空 ETH 50 5')
      expect(help()).toContain('合约平仓 BTC 全部')
      expect(api.save).not.toHaveBeenCalled()
    } finally { page.unmount() }
  })
})
