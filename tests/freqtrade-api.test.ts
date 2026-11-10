import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../src/shared/api/client', () => ({ apiClient: api }))

import { fetchFreqtradeSettings, fetchFreqtradeStatus, saveFreqtradeSettings } from '../src/shared/api/freqtrade'

const write = {
  settings: {
    enabled: false, private_enabled: false, event_ws_url: null, groups: [], initial_cash: '1000', fee: '0.001',
    futures_enabled: false, futures_initial_cash: '1000', futures_fee: '0.0005', futures_default_leverage: 3, futures_max_leverage: 20,
    reply_interval_seconds: 10, max_active_accounts: 5, idle_seconds: 300,
  },
  commands: { open: '币开户', buy: '币买入', sell: '币卖出', balance: '币资产', positions: '币持仓', orders: '币成交', help: '币帮助', chart: '币走势', deposit: '币充值',
    f_open: '合约开户', long: '合约开多', short: '合约开空', close: '合约平仓', f_balance: '合约资产', f_positions: '合约持仓', f_orders: '合约成交', f_chart: '合约走势', f_deposit: '合约充值', f_margin: '合约加保证金' },
}

describe('Freqtrade API contract', () => {
  it('uses the settings/status paths and conditional write headers', async () => {
    api.get.mockResolvedValueOnce({ data: { desired: { ...write, row_version: 3 }, applied_version: 3, synchronized: true } })
      .mockResolvedValueOnce({ data: { state: 'ready' } })
    api.put.mockResolvedValueOnce({ data: { desired: { ...write, row_version: 4 }, applied_version: 4, synchronized: true } })

    await fetchFreqtradeSettings('qq-service')
    await saveFreqtradeSettings('qq-service', write, 3, 'stable-operation')
    await fetchFreqtradeStatus()

    expect(api.get).toHaveBeenNthCalledWith(1, '/bots/freqtrade/settings/qq-service')
    expect(api.put).toHaveBeenCalledWith('/bots/freqtrade/settings/qq-service', write, {
      headers: { 'If-Match': '3', 'Idempotency-Key': 'stable-operation' },
    })
    expect(api.get).toHaveBeenNthCalledWith(2, '/bots/freqtrade/status')
  })
})
