import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import UnifiedNotificationRules from '../src/modules/notifications/UnifiedNotificationRules.vue'
import { eventsFor, parseTargets } from '../src/modules/notifications/notification-form'
import { helpText } from './help-test-utils'

const api = vi.hoisted(() => ({
  fetchChannels: vi.fn(), fetchNotificationRoutes: vi.fn(), fetchDiscordForwardRules: vi.fn(),
  fetchBotServices: vi.fn(), botHealth: vi.fn(), createNotificationRoute: vi.fn(),
  saveDiscordForwardRule: vi.fn(), toggleNotificationRoute: vi.fn(), deleteDiscordForwardRule: vi.fn(),
}))
vi.mock('../src/shared/api/notifications', async original => ({
  ...await original<typeof import('../src/shared/api/notifications')>(),
  fetchChannels: api.fetchChannels, fetchNotificationRoutes: api.fetchNotificationRoutes,
  fetchDiscordForwardRules: api.fetchDiscordForwardRules, createNotificationRoute: api.createNotificationRoute,
  saveDiscordForwardRule: api.saveDiscordForwardRule, toggleNotificationRoute: api.toggleNotificationRoute,
  deleteDiscordForwardRule: api.deleteDiscordForwardRule,
}))
vi.mock('../src/shared/api/bots', async original => ({
  ...await original<typeof import('../src/shared/api/bots')>(),
  fetchBotServices: api.fetchBotServices, botHealth: api.botHealth,
}))

beforeEach(() => {
  api.fetchChannels.mockResolvedValue({ items: [{ channel_id: 'smtp-1', kind: 'smtp', name: '邮件', enabled: true }], next_cursor: null })
  api.fetchNotificationRoutes.mockResolvedValue({ items: [
    { route_id: 'route-1', notification_kind: 'terminal_alert', channel_id: 'smtp-1', targets: ['a@example.com'], enabled: true },
    { route_id: 'old-route', notification_kind: 'forward', channel_id: 'smtp-1', targets: ['old@example.com'], enabled: true },
  ], next_cursor: null })
  api.fetchBotServices.mockResolvedValue({ items: [{ service_id: 'bot-1', kind: 'discord_bridge', name: 'Discord Bot', enabled: true, desired_config_version_id: 'version-1', applied_config_version_id: 'version-1' }], next_cursor: null })
  api.fetchDiscordForwardRules.mockResolvedValue({ items: [{ id: 'rule-1', row_version: 1, bot_service_id: 'bot-1', name: '消息规则', guild_id: '123', channel_id: '456', trigger_kind: 'frequency', trigger_text: null, frequency_count: 6, frequency_window_seconds: 10, cooldown_seconds: 10, actions: [{ kind: 'qq_group', channel_id: 'qq-1', target: '789', review_policy: 'lexicon' }], enabled: true }], next_cursor: null })
})
afterEach(() => { vi.clearAllMocks() })

it('keeps platform and Discord rules in one list and starts the form with source only', async () => {
  const wrapper = mount(UnifiedNotificationRules, { props: { revision: 0 }, global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } } })
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('平台事件 · 邮件')
    expect(wrapper.text()).toContain('Discord 消息 · Discord Bot')
    expect(wrapper.text()).not.toContain('old@example.com')
    expect(wrapper.findAll('h2').map(node => node.text())).toEqual(['通知规则'])
    expect(wrapper.text()).toContain('选择规则来源')
    expect(wrapper.text()).not.toContain('来源服务器 ID')
    expect(wrapper.text()).not.toContain('收件邮箱（每行一个）')
  } finally { wrapper.unmount() }
})

it('reveals only the selected trigger parameters', async () => {
  const wrapper = mount(UnifiedNotificationRules, { props: { revision: 0 }, global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } } })
  try {
    await flushPromises()
    await wrapper.findAll('.unified-rule-source-choice button')[1]!.trigger('click')
    expect(wrapper.text()).toContain('选择触发条件')
    expect(wrapper.text()).not.toContain('来源服务器 ID')
    await wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'frequency')
    await flushPromises()
    expect(wrapper.text()).toContain('每 n 条触发一次')
    expect(wrapper.text()).toContain('统计窗口（秒）')
    expect(wrapper.text()).toContain('冷却时间（秒）')
    expect(wrapper.text()).not.toContain('藏头目标文字')
    await wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'contains')
    await flushPromises()
    const containsHelp = await helpText(wrapper, '消息包含的文字')
    expect(containsHelp).toContain('@显示名或 @用户ID')
    expect(containsHelp).toContain('@everyone 仅匹配真实全员提及')
  } finally { wrapper.unmount() }
})

it('keeps target parsing and platform event options aligned with existing routes', () => {
  expect(Object.keys(eventsFor('discord'))).toEqual(['terminal_alert'])
  expect(eventsFor('smtp')).not.toHaveProperty('conditional_skip')
  expect(parseTargets('123\n123\n456', 'qq', 'group')).toEqual(['group:123', 'group:456'])
  expect(parseTargets('a@example.com', 'smtp', 'private')).toEqual(['a@example.com'])
})

it('edits and saves a reactive rule without cloning a Vue proxy', async () => {
  api.botHealth.mockResolvedValue({ items: [{ reported_at: new Date().toISOString(), config_version_id: 'version-1', status: 'healthy', diagnostics: { discord_ready: true } }] })
  api.saveDiscordForwardRule.mockResolvedValue({})
  const wrapper = mount(UnifiedNotificationRules, { props: { revision: 0 }, global: { stubs: { ElDialog: { template: '<div><slot /><slot name="footer" /></div>' } } } })
  try {
    await flushPromises()
    const edit = wrapper.findAll('.unified-rule-table-wrap button').find(node => node.text() === '编辑')
    expect(edit).toBeDefined()
    await edit!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('每 n 条触发一次')
    const save = wrapper.findAll('button').find(node => node.text() === '保存规则')
    await save!.trigger('click')
    await flushPromises()
    expect(api.saveDiscordForwardRule).toHaveBeenCalledOnce()
    expect(api.saveDiscordForwardRule.mock.calls[0]?.[0]).toMatchObject({ name: '消息规则', actions: [{ kind: 'qq_group', target: '789' }] })
  } finally { wrapper.unmount() }
})
