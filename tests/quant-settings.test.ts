import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), status: vi.fn(), credentials: vi.fn(), saveCredential: vi.fn() }))
vi.mock('../src/shared/api/quant', () => ({ fetchQuantSettings: api.fetch, saveQuantSettings: api.save, fetchQuantStatus: api.status, fetchQuantCredentials: api.credentials, saveQuantCredential: api.saveCredential }))
import QuantSettings from '../src/modules/bots/quant/QuantSettings.vue'
import { ElPopover } from 'element-plus'
import { shiftDecimal } from '../src/modules/bots/trading-decimal'

const commandReplyEditorStub = {
  props: ['revision'],
  template: '<div data-section="command-replies"><button data-command-saved type="button" @click="$emit(\'saved\', { row_version: revision + 1, mapping_version: revision + 1, synchronized: true, commands: [{ id: \'buy\', keyword: \'买股票\' }] })">保存当前指令</button></div>',
}
const settingsGlobal = { stubs: { CommandReplyEditor: commandReplyEditorStub } }

const record = () => ({ desired: { settings: { enabled: false, private_enabled: false,
  event_ws_url: 'ws://llbot:3001', groups: ['123456'], initial_cash: '100000', commission_rate: '0',
  minimum_commission: '0', stamp_tax_rate: '0', slippage: '0', max_quote_age_seconds: 120,
  bar_cache_days: 30, refresh_seconds: 60, reply_interval_seconds: 10, provider: 'sina', provider_order: ['sina', 'tencent', 'eastmoney', 'tushare', 'gugudata'] },
  commands: { open: '模拟开户', buy: '模拟买入', sell: '模拟卖出', balance: '模拟资产',
    positions: '模拟持仓', orders: '模拟成交', backtest: '回测', help: '量化帮助' },
  row_version: 1, mapping_version: 1 }, applied: { row_version: 1, mapping_version: 1 },
  process_applied: { row_version: 1, mapping_version: 1 }, synchronized: true })

it('keeps decimal conversion precise for scientific and invalid inputs', () => {
  expect(shiftDecimal('1e-7', 2)).toBe('0.00001')
  expect(shiftDecimal('.3', -2)).toBe('0.003')
  expect(shiftDecimal('1e101', 2)).toBe('1e101')
  expect(shiftDecimal('invalid', 2)).toBe('invalid')
})

describe('QQ quant settings', () => {
  beforeEach(() => { vi.clearAllMocks(); api.fetch.mockResolvedValue(record()); api.save.mockResolvedValue(record()); api.credentials.mockResolvedValue({ tushare: false, gugudata: false }); api.saveCredential.mockResolvedValue({ configured: true }); api.status.mockResolvedValue({ database: 'available', engine: { version: '0.3.71', entitlement_supported: true }, source: {}, rss_bytes: 1024, cpu_seconds: 1, cpu_percent: 0.5 }) })

  it('loads configuration and saves only general settings with version', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    expect(page.vm.health?.database).toBe('available')
    expect(page.vm.health?.cpu_percent).toBe(0.5)
    expect(page.find('[data-command]').exists()).toBe(false)
    await page.get('[data-section="basic"] input[type="checkbox"]').setValue(true)
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', { settings: expect.objectContaining({ enabled: true }) }, 1, expect.any(String))
  })

  it('acknowledges a manual status refresh even when values do not change', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    page.vm.refreshHealth()
    await flushPromises()
    expect(page.vm.healthMessage).toBe('状态已刷新')
  })

  it('prevents editing submitted settings while a save is in flight', async () => {
    let finish!: (value: ReturnType<typeof record>) => void
    api.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-rate="commission_rate"]').setValue('0.03')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    expect(page.get('[data-rate="commission_rate"]').element.closest('fieldset[disabled]')).not.toBeNull()
    expect(page.get('[data-settings-tab="replies"]').element.matches(':disabled')).toBe(true)
    finish(record())
    await flushPromises()
    expect(page.get('[data-rate="commission_rate"]').element.closest('fieldset[disabled]')).toBeNull()
  })

  it('keeps the draft when the save conflicts and does not claim success', async () => {
    api.save.mockRejectedValue(new Error('quant_keyword_conflict'))
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('[data-section="basic"] input[type="number"]').setValue('11')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect((page.get('[data-section="basic"] input[type="number"]').element as HTMLInputElement).value).toBe('11')
    expect(page.text()).toContain('quant_keyword_conflict')
  })

  it('does not silently save while an authorization group is still being entered', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    await page.get('.qq-group-button').trigger('click')
    await page.get('input[aria-label="QQ群号"]').setValue('987654321')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    expect(api.save).not.toHaveBeenCalled()
    expect(page.text()).toContain('请先添加或清空待输入的群号')
    expect(page.vm.hasUnsaved).toBe(true)
    page.unmount()
  })

  it('opens command help with saved examples and closes on Escape', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, attachTo: document.body, global: settingsGlobal })
    try {
      await flushPromises()
      await page.get('[data-settings-tab="replies"]').trigger('click')
      await flushPromises()
      expect(page.text()).toContain('查看提示')
      const button = page.get('button[aria-label="量化帮助说明"]')
      expect(page.findComponent(ElPopover).props('visible')).toBe(false)
      await button.trigger('click')
      await flushPromises()
      expect(page.findComponent(ElPopover).props('visible')).toBe(true)
      const help = () => document.querySelector('.quant-help-content')?.textContent
      expect(help()).toContain('模拟买入 600000 100')
      expect(help()).toContain('已提交不代表已成交')
      expect(help()).toContain('保存并同步后在 QQ 生效')
      await page.get('[data-command-saved]').trigger('click')
      await flushPromises()
      expect(help()).toContain('买股票 600000 100')
      expect(help()).not.toContain('模拟买入 600000 100')
      expect(help()).toContain('佣金、最低佣金、仅卖出印花税和滑点')
      expect(api.save).not.toHaveBeenCalled()
      expect(api.saveCredential).not.toHaveBeenCalled()
      await button.trigger('keydown', { key: 'Escape' })
      expect(page.findComponent(ElPopover).props('visible')).toBe(false)
    } finally { page.unmount() }
  })

  it('reorders providers and keeps credentials out of settings', async () => {
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
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

  it('groups settings and edits rates as percentages without changing the API ratio', async () => {
    const value = record()
    value.desired.settings.commission_rate = '0.00125'
    api.fetch.mockResolvedValue(value)
    const page = mount(QuantSettings, { props: { serviceId: 'qq-service' }, global: settingsGlobal })
    await flushPromises()
    expect(page.get('[data-section="basic"]').text()).toContain('授权群号')
    expect(page.get('[data-section="basic"]').text()).toContain('佣金比例')
    expect(page.get('[data-section="sources"]').text()).toContain('Tushare')
    expect(page.get('[data-settings-tab="replies"]').text()).toContain('8')
    expect((page.get('[data-rate="commission_rate"]').element as HTMLInputElement).value).toBe('0.125')
    await page.get('[data-rate="commission_rate"]').setValue('0.03')
    await page.get('[data-rate="stamp_tax_rate"]').setValue('0.1')
    await page.get('[data-action="save-quant-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({ settings: expect.objectContaining({ commission_rate: '0.0003', stamp_tax_rate: '0.001' }) }), 1, expect.any(String))
  })
})
