import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import { ApiError } from '../src/shared/api/client'

const api = vi.hoisted(() => ({ owner: vi.fn(), bind: vi.fn(), account: vi.fn(), submit: vi.fn(), operation: vi.fn() }))
vi.mock('../src/shared/api/trading-accounts', () => ({ fetchTradingOwner: api.owner, saveTradingOwner: api.bind,
  fetchTradingAccount: api.account, submitTradingAction: api.submit, fetchTradingOperation: api.operation }))
import TradingAccounts from '../src/modules/bots/TradingAccounts.vue'

const identity = '123456'
const op = 'c96e1f1b-4d30-4539-8b08-013c57fd328f'

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  api.owner.mockResolvedValue({ qq_id: identity, row_version: 1 })
  api.account.mockImplementation(async (_service, market, view) => ({ status: 'success', owner_version: 1,
    account_state: 'ready', data: view === 'account'
      ? market === 'a-share' ? { cash: '1000', market_value: '500', total_assets: '1500', account_state: 'active' }
        : { currencies: [{ currency: 'USDT', free: '100' }], unrealized_pnl: '2', deposits_total: '10', added_margin: '0' }
      : view === 'positions' ? { positions: [] } : { trades: [] } }))
  api.submit.mockResolvedValue({ id: op, status: 'completed', result: '委托已受理' })
  api.operation.mockResolvedValue({ id: op, status: 'completed', result: '委托已受理' })
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(op)
})

it('asks the administrator to confirm a self-declared QQ binding without opening an account', async () => {
  api.owner.mockResolvedValue({ qq_id: null, row_version: 0 })
  api.bind.mockResolvedValue({ qq_id: identity, row_version: 1 })
  api.account.mockResolvedValue({ status: 'failed', code: 'account_missing', owner_version: 1 })
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  expect(page.text()).toContain('不验证 QQ 身份')
  await page.get('.paper-bind input').setValue(identity)
  await page.get('.paper-bind').trigger('submit'); await flushPromises()
  expect(api.bind).toHaveBeenCalledWith(identity, 0)
  expect(page.text()).toContain('尚未开户')
  expect(api.submit).not.toHaveBeenCalled()
  page.unmount()
})

it('submits an A-share order for the bound account with a recoverable operation id', async () => {
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  const inputs = page.findAll('.paper-order input')
  await inputs[0]!.setValue('600000'); await inputs[1]!.setValue('100')
  await page.get('.paper-order').trigger('submit'); await flushPromises()
  expect(api.submit).toHaveBeenCalledWith('qq', 'a-share', { owner_version: 1, action: 'buy', symbol: '600000', quantity: 100 }, op)
  expect(page.text()).toContain('委托已受理')
  expect(page.get('.paper-primary').attributes('disabled')).toBeUndefined()
  expect(sessionStorage.getItem('al1s-paper-operation:qq:a-share')).toBeNull()
  page.unmount()
})

it('shows verified stock names with codes and does not repeat a missing name', async () => {
  api.account.mockImplementation(async (_service, _market, view) => ({ status: 'success', owner_version: 1,
    data: view === 'account' ? { cash: '1000', account_state: 'active' }
      : view === 'positions' ? { positions: [
        { code: '300750', name: '宁德时代', quantity: 100, available: 100, total_cost: '10' },
        { code: '600000', name: '600000', quantity: 100, available: 100, total_cost: '20' },
      ] } : { trades: [{ id: 'a', code: '300750', name: '宁德时代', side: 'buy', quantity: 100, status: 'filled' },
        { id: 'b', code: '600000', name: null, side: 'sell', quantity: 100, status: 'filled' }] } }))
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  const holdings = page.get('.paper-grid .paper-section').findAll('tbody tr')
  const history = page.get('.paper-history').findAll('tbody tr')
  for (const rows of [holdings, history]) {
    expect(rows[0]!.find('td').text()).toBe('宁德时代300750')
    expect(rows[1]!.find('td').text()).toBe('600000')
    expect(rows[1]!.find('td small').exists()).toBe(false)
  }
  expect(api.submit).not.toHaveBeenCalled()
  page.unmount()
})

it('offers spot and futures operations with their distinct units', async () => {
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'crypto' } })
  await flushPromises()
  expect(page.text()).toContain('金额（USDT）')
  await page.findAll('[role="tab"]').find(tab => tab.text() === '合约')!.trigger('click'); await flushPromises()
  expect(page.text()).toContain('开多')
  expect(page.text()).toContain('开空')
  expect(page.text()).toContain('追加保证金')
  expect(page.text()).toContain('保证金（USDT）')
  expect(page.text()).toContain('杠杆倍数（可选）')
  expect(api.submit).not.toHaveBeenCalled()
  page.unmount()
})

it('keeps an uncertain submission blocked until its saved receipt is checked', async () => {
  api.submit.mockRejectedValue(new Error('网络中断'))
  api.operation.mockResolvedValueOnce({ id: op, status: 'unknown', result: '结果待核实' })
    .mockResolvedValueOnce({ id: op, status: 'completed', result: '委托已记录' })
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  const inputs = page.findAll('.paper-order input')
  await inputs[0]!.setValue('600000'); await inputs[1]!.setValue('100')
  await page.get('.paper-order').trigger('submit'); await flushPromises()
  expect(page.text()).toContain('结果待核实')
  expect(page.get('.paper-primary').attributes('disabled')).toBeDefined()
  expect(JSON.parse(sessionStorage.getItem('al1s-paper-operation:qq:a-share')!).id).toBe(op)
  await page.findAll('button').find(button => button.text() === '查询回执')!.trigger('click'); await flushPromises()
  expect(api.submit).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem('al1s-paper-operation:qq:a-share')).toBeNull()
  page.unmount()
})

it('keeps receipt lookup available when the account summary cannot be loaded', async () => {
  sessionStorage.setItem('al1s-paper-operation:qq:a-share', JSON.stringify({ id: op,
    input: { owner_version: 1, action: 'buy', symbol: '600000', quantity: 100 } }))
  api.account.mockRejectedValue(new Error('账户暂不可用'))
  api.operation.mockResolvedValue({ id: op, status: 'unknown', result: '结果待核实' })
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  expect(page.text()).toContain('账户暂不可用')
  await page.findAll('button').find(button => button.text() === '查询回执')!.trigger('click'); await flushPromises()
  expect(api.operation).toHaveBeenCalledWith('qq', 'a-share', op)
  expect(api.submit).not.toHaveBeenCalled()
  page.unmount()
})

it('retries an unrecorded request only with the same operation and bound-owner version', async () => {
  api.submit.mockRejectedValueOnce(new Error('网络中断'))
    .mockResolvedValueOnce({ id: op, status: 'completed', result: '委托已受理' })
  api.operation.mockRejectedValueOnce(new ApiError('trading_operation_not_found', { code: 'http_404', status: 404 }))
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  const inputs = page.findAll('.paper-order input')
  await inputs[0]!.setValue('600000'); await inputs[1]!.setValue('100')
  await page.get('.paper-order').trigger('submit'); await flushPromises()
  await page.findAll('button').find(button => button.text() === '重试原请求')!.trigger('click'); await flushPromises()
  expect(api.submit).toHaveBeenCalledTimes(2)
  expect(api.submit.mock.calls[0]).toEqual(api.submit.mock.calls[1])
  expect(api.submit.mock.calls[1]![2]).toMatchObject({ owner_version: 1, action: 'buy' })
  expect(sessionStorage.getItem('al1s-paper-operation:qq:a-share')).toBeNull()
  page.unmount()
})

it('does not show another binding’s data if the owner changed during a read', async () => {
  api.account.mockResolvedValue({ status: 'success', owner_version: 2, data: { cash: '999999' } })
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  expect(page.text()).toContain('绑定已变更')
  expect(page.text()).not.toContain('999999')
  expect(page.find('.paper-order').exists()).toBe(false)
  page.unmount()
})

it('does not label failed holdings or history reads as empty accounts', async () => {
  api.account.mockImplementation(async (_service, _market, view) => {
    if (view === 'orders') throw new Error('读取失败')
    return view === 'account' ? { status: 'success', owner_version: 1, data: { cash: '100', account_state: 'active' } }
      : { status: 'success', owner_version: 1, data: { positions: [] } }
  })
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  expect(page.text()).toContain('无法读取持仓')
  expect(page.text()).toContain('无法读取记录')
  expect(page.text()).not.toContain('暂无委托与成交')
  page.unmount()
})

it('clears a local pending marker when a definitive rejection has no server receipt', async () => {
  api.submit.mockRejectedValue(new ApiError('trading_operation_pending', { code: 'http_409', status: 409 }))
  api.operation.mockRejectedValue(new ApiError('trading_operation_not_found', { code: 'http_404', status: 404 }))
  const page = mount(TradingAccounts, { props: { serviceId: 'qq', engine: 'a-share' } })
  await flushPromises()
  const inputs = page.findAll('.paper-order input')
  await inputs[0]!.setValue('600000'); await inputs[1]!.setValue('100')
  await page.get('.paper-order').trigger('submit'); await flushPromises()
  expect(sessionStorage.getItem('al1s-paper-operation:qq:a-share')).toBeNull()
  expect(page.text()).toContain('账户有未完成或待核实的操作')
  page.unmount()
})
