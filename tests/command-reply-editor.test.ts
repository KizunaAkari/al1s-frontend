import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CommandReplyEditor from '../src/modules/bots/CommandReplyEditor.vue'
import CommandReplyLayout from '../src/modules/bots/CommandReplyLayout.vue'
import type { TradingCommandsView } from '../src/shared/api/trading-replies'

const api = vi.hoisted(() => ({ fetchTradingCommands: vi.fn(), saveTradingCommand: vi.fn(), previewTradingCommand: vi.fn() }))
vi.mock('../src/shared/api/trading-replies', () => api)
const record = (): TradingCommandsView => ({ engine: 'quant', row_version: 1, mapping_version: 1, synchronized: true,
  commands: ['buy', 'balance'].map(id => ({ id, label: id === 'buy' ? '买入' : '资产', group: 'A股',
    keyword: id === 'buy' ? '模拟买入' : '模拟资产', default_keyword: id === 'buy' ? '模拟买入' : '模拟资产',
    description: '用途', usage: '示例', templates: {}, variants: [{ id: 'main', label: '正常结果',
      default_template: '{value}', variables: [{ key: 'value', label: '数值', example: '100' }] }] })) })
beforeEach(() => {
  vi.clearAllMocks()
  api.fetchTradingCommands.mockResolvedValue(record())
  api.previewTradingCommand.mockResolvedValue({ content: '示例消息' })
  api.saveTradingCommand.mockImplementation(async (_id, _engine, action, payload, version) => {
    const value = record(); value.row_version = version + 1
    Object.assign(value.commands.find(item => item.id === action)!, payload)
    return value
  })
})

it('switches template source only for the current branch and saves it explicitly', async () => {
  const page = mount(CommandReplyEditor, { props: { serviceId: 'qq', engine: 'quant', revision: 1 } })
  await flushPromises()
  page.findComponent(CommandReplyLayout).vm.$emit('templateCustom'); await flushPromises()
  await page.get('[data-field="template"]').setValue('临时 {value}')
  await page.get('[data-field="template"]').setValue('{value}')
  expect(page.findComponent(CommandReplyLayout).props('customTemplate')).toBe(true)
  await page.get('[data-action="save-command-reply"]').trigger('click'); await flushPromises()
  expect(api.saveTradingCommand).toHaveBeenLastCalledWith('qq', 'quant', 'buy',
    { keyword: '模拟买入', templates: { main: '{value}' } }, 1, expect.any(String))
  page.findComponent(CommandReplyLayout).vm.$emit('templateDefault'); await flushPromises()
  await page.get('[data-action="save-command-reply"]').trigger('click'); await flushPromises()
  expect(api.saveTradingCommand).toHaveBeenLastCalledWith('qq', 'quant', 'buy',
    { keyword: '模拟买入', templates: {} }, 2, expect.any(String))
  page.unmount()
})

it('saves only the selected command and preserves another command draft', async () => {
  const page = mount(CommandReplyEditor, { props: { serviceId: 'qq', engine: 'quant', revision: 1 } })
  await flushPromises()
  await page.get('[data-field="keyword"]').setValue('买股票')
  await page.get('[data-entry="balance"]').trigger('click')
  await page.get('[data-field="template"]').setValue('资产 {value}')
  await page.get('[data-action="save-command-reply"]').trigger('click')
  await flushPromises()
  expect(api.saveTradingCommand).toHaveBeenCalledWith('qq', 'quant', 'balance',
    { keyword: '模拟资产', templates: { main: '资产 {value}' } }, 1, expect.any(String))
  await page.get('[data-entry="buy"]').trigger('click')
  expect((page.get('[data-field="keyword"]').element as HTMLInputElement).value).toBe('买股票')
  expect(page.text()).toContain('有未保存')
  expect(page.emitted('saved')?.[0]?.[0]).toMatchObject({ row_version: 2 })
  page.unmount()
})

it('keeps failed drafts and reuses the operation key on an identical retry', async () => {
  api.saveTradingCommand.mockRejectedValueOnce(new Error('网络失败'))
  const page = mount(CommandReplyEditor, { props: { serviceId: 'qq', engine: 'quant', revision: 1 } })
  await flushPromises()
  await page.get('[data-field="template"]').setValue('新回复 {value}')
  await page.get('[data-action="save-command-reply"]').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('网络失败')
  await page.get('[data-action="save-command-reply"]').trigger('click')
  await flushPromises()
  expect(api.saveTradingCommand.mock.calls[0]![5]).toBe(api.saveTradingCommand.mock.calls[1]![5])
  page.unmount()
})

it('validates variables locally and restores only the current command draft', async () => {
  const page = mount(CommandReplyEditor, { props: { serviceId: 'qq', engine: 'quant', revision: 1 } })
  await flushPromises()
  await page.get('[data-field="template"]').setValue('{fake}')
  expect(page.text()).toContain('不可用变量')
  expect(page.get('[data-action="save-command-reply"]').attributes('disabled')).toBeDefined()
  await page.get('[data-field="template"]').setValue('{}')
  expect(page.text()).toContain('不可用变量')
  expect(page.get('[data-action="save-command-reply"]').attributes('disabled')).toBeDefined()
  await page.get('[data-action="restore-command-reply"]').trigger('click')
  expect((page.get('[data-field="template"]').element as HTMLTextAreaElement).value).toBe('{value}')
  expect(api.saveTradingCommand).not.toHaveBeenCalled()
  page.unmount()
})

it('does not let an old connection response overwrite the current connection', async () => {
  let resolve!: (value: TradingCommandsView) => void
  api.fetchTradingCommands.mockImplementationOnce(() => new Promise<TradingCommandsView>(done => { resolve = done }))
  const page = mount(CommandReplyEditor, { props: { serviceId: 'old', engine: 'quant', revision: 1 } })
  await page.setProps({ serviceId: 'new' })
  await flushPromises()
  const old = record(); old.commands[0]!.keyword = '旧连接'
  resolve(old); await flushPromises()
  expect((page.get('[data-field="keyword"]').element as HTMLInputElement).value).toBe('模拟买入')
  page.unmount()
})
