import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BotManagement from '../src/modules/bots/BotManagement.vue'

const api = vi.hoisted(() => ({ services: vi.fn(), version: vi.fn(), runtime: vi.fn(), settings: vi.fn(),
  saveSettings: vi.fn(), rates: vi.fn(), saveRate: vi.fn(), templates: vi.fn(), get: vi.fn() }))
vi.mock('../src/shared/api/bots', async original => ({ ...await original<typeof import('../src/shared/api/bots')>(),
  fetchBotServices: api.services, fetchBotConfigVersion: api.version }))
vi.mock('../src/shared/api/bot-runtime', () => ({ fetchBotRuntimeStatus: api.runtime }))
vi.mock('../src/shared/api/memes', async original => ({ ...await original<typeof import('../src/shared/api/memes')>(),
  fetchMemeSettings: api.settings, saveMemeSettings: api.saveSettings,
  fetchRateLimits: api.rates, saveRateLimit: api.saveRate, fetchTemplates: api.templates,
  createMemeApi: () => ({ fetchMemeSettings: api.settings, saveMemeSettings: api.saveSettings,
    fetchRateLimits: api.rates, saveRateLimit: api.saveRate, fetchTemplates: api.templates }) }))
vi.mock('../src/shared/api/client', () => ({ apiClient: { get: api.get } }))

const services = [
  { service_id: 'qq-1', kind: 'onebot_gateway', name: 'QQ一号', enabled: true, row_version: 1,
    desired_config_version_id: 'v1', applied_config_version_id: 'v1' },
  { service_id: 'qq-2', kind: 'onebot_gateway', name: 'QQ二号', enabled: true, row_version: 1,
    desired_config_version_id: null, applied_config_version_id: null },
  { service_id: 'dc-1', kind: 'discord_bridge', name: 'Discord', enabled: true, row_version: 1,
    desired_config_version_id: null, applied_config_version_id: null },
]
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.services.mockResolvedValue({ items: services, next_cursor: null })
  api.version.mockResolvedValue({ settings: { ONEBOT_BASE_URL: 'http://gateway:3000' }, secret_configured: false })
  api.runtime.mockImplementation(async (id: string) => ({ service_id: id, state: 'offline',
    checked_at: '2026-10-09T09:00:00Z', observed_at: null, reason_code: 'qq_not_logged_in', error_code: null }))
  api.get.mockImplementation(async (path: string) => {
    if (/^\/bots\/updates\/(qq|discord)\/versions$/.test(path)) return { data: { items: [], next_cursor: null } }
    if (path.startsWith('/components/')) return { data: { items: [], next_cursor: null } }
    if (path.startsWith('/bots/updates/')) return { data: { alias: path.endsWith('/qq') ? 'qq' : 'discord',
      current: { version: null, image: null, image_id: null, observed_at: null }, runtime_version: null } }
    return { data: path.includes('native-ui') ? { url: null }
      : { running: true, status: 'running', health: 'healthy', revision: 'r1', started_at: null } }
  })
  api.settings.mockImplementation(async (id: string) => ({ bot_service_id: id, row_version: 3,
    enabled: true, private_enabled: false, qq_event_ws_url: 'ws://gateway:3001', cooldown_seconds: 5,
    scopes: [{ kind: 'qq_group', target_id: '123456789', guild_id: null }] }))
  api.saveSettings.mockImplementation(async value => ({ ...value, row_version: 4 }))
  api.rates.mockResolvedValue([{ platform: 'qq', interval_seconds: 10, row_version: 2 },
    { platform: 'discord', interval_seconds: 5, row_version: 1 }])
  api.saveRate.mockImplementation(async (platform, seconds) => ({ platform, interval_seconds: seconds, row_version: 3 }))
  api.templates.mockResolvedValue({ items: [], next_cursor: null })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
async function consolePage() {
  wrapper = mount(BotManagement, { global: { directives: { loading: {} } } })
  await flushPromises()
  return wrapper
}

it('uses a two-platform console with contextual navigation and lazy workshop content', async () => {
  const page = await consolePage()
  expect(page.find('[aria-label="Bot功能导航"]').exists()).toBe(true)
  expect(page.get('[aria-label="Bot 类型"]').findAll('[role="tab"]')).toHaveLength(2)
  expect(page.find('[data-panel="workshop"]').exists()).toBe(false)
  expect(page.get('[aria-label="互动表情子页"]').findAll('[role="tab"]')).toHaveLength(2)
  expect(page.get('[data-panel="interaction"]').text()).toContain('互动表情')
  expect(page.text()).toContain('当前连接')
  expect(page.text()).toContain('发送频率')
  expect(api.templates).not.toHaveBeenCalled()
  await page.get('[data-interaction-tab="workshop"]').trigger('click')
  await flushPromises()
  expect(api.templates).toHaveBeenCalledTimes(1)
  expect((page.get('#bot-interaction-settings').element as HTMLElement).style.display).toBe('none')
  expect((page.get('#bot-interaction-workshop').element as HTMLElement).style.display).not.toBe('none')
  expect(page.get('.bot-content-heading h2').text()).toBe('表情包工坊')
  await page.get('[data-interaction-tab="settings"]').trigger('click')
  await page.get('[data-interaction-tab="workshop"]').trigger('click')
  expect(api.templates).toHaveBeenCalledTimes(1)
})

it('retains settings and workshop drafts across child pages, navigation and platform changes', async () => {
  const page = await consolePage()
  await page.get('[data-field="enabled"]').setValue(false)
  await page.get('[data-interaction-tab="workshop"]').trigger('click')
  await flushPromises()
  await page.get('[data-action="create-template"]').trigger('click')
  const name = () => page.get('.meme-editor input[maxlength="64"]')
  await name().setValue('未保存的模板草稿')
  await page.get('[data-interaction-tab="settings"]').trigger('click')
  expect(page.get('[data-field="enabled"]').element).toHaveProperty('checked', false)
  await page.get('[data-panel="runtime"]').trigger('click')
  await page.get('[data-panel="interaction"]').trigger('click')
  await page.get('[data-interaction-tab="workshop"]').trigger('click')
  expect(name().element).toHaveProperty('value', '未保存的模板草稿')
  await page.get('[aria-label="Bot 类型"]').findAll('[role="tab"]')[1]!.trigger('click')
  await flushPromises()
  expect(name().element).toHaveProperty('value', '未保存的模板草稿')
  expect(api.templates).toHaveBeenCalledTimes(2)
  expect(api.saveSettings).not.toHaveBeenCalled()
})

it('supports keyboard selection and links each child tab to its content', async () => {
  const page = await consolePage()
  const settings = page.get('[data-interaction-tab="settings"]')
  const workshop = page.get('[data-interaction-tab="workshop"]')
  expect(settings.attributes('aria-controls')).toBe('bot-interaction-settings')
  expect(settings.attributes('aria-selected')).toBe('true')
  await settings.trigger('keydown', { key: 'ArrowRight' })
  await flushPromises()
  expect(workshop.attributes('aria-selected')).toBe('true')
  expect(workshop.attributes('tabindex')).toBe('0')
  expect(settings.attributes('tabindex')).toBe('-1')
  expect(page.get('#bot-interaction-workshop').attributes('aria-labelledby')).toBe(workshop.attributes('id'))
  await workshop.trigger('keydown', { key: 'Home' })
  expect(settings.attributes('aria-selected')).toBe('true')
})

it('keeps the only account monitor in the status banner and does not infer online from healthy', async () => {
  const page = await consolePage()
  expect(page.find('.bot-console-status').exists()).toBe(true)
  expect(page.findAll('[aria-label="Bot 在线状态"]')).toHaveLength(1)
  expect(page.get('.bot-console-status').text()).toContain('账号离线')
  expect(page.get('.bot-console-status').text()).toContain('运行中')
  expect(page.get('.bot-console-status').text()).toContain('正常')
  await page.get('[data-panel="runtime"]').trigger('click')
  expect(page.findAll('[aria-label="Bot 在线状态"]')).toHaveLength(1)
})

it('keeps connection scopes and platform intervals as separate saves', async () => {
  const page = await consolePage()
  expect(page.find('[data-action="add-scope"]').exists()).toBe(true)
  await page.get('[data-action="add-scope"]').trigger('click')
  await page.get('[data-field="scope-entry"]').setValue('987654321')
  await page.get('[data-action="confirm-scope"]').trigger('click')
  await page.get('[data-action="save-meme-settings"]').trigger('click')
  await flushPromises()
  expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ bot_service_id: 'qq-1',
    scopes: [{ kind: 'qq_group', target_id: '123456789', guild_id: null },
      { kind: 'qq_group', target_id: '987654321', guild_id: null }] }), expect.any(String))
  expect(api.saveRate).not.toHaveBeenCalled()
  await page.get('[data-field="global-qq"]').setValue(9)
  await page.get('[data-action="save-global-qq"]').trigger('click')
  await flushPromises()
  expect(api.saveRate).toHaveBeenCalledWith('qq', 9, 2)
  expect(api.saveSettings).toHaveBeenCalledTimes(1)
})

it('keeps an unsaved interaction change when visiting another panel', async () => {
  const page = await consolePage()
  expect(page.find('[data-panel="runtime"]').exists()).toBe(true)
  await page.get('[data-field="enabled"]').setValue(false)
  await page.get('[data-panel="runtime"]').trigger('click')
  await page.get('[data-panel="interaction"]').trigger('click')
  expect(page.get('[data-field="enabled"]').element).toHaveProperty('checked', false)
  expect(page.text()).toContain('有未保存修改')
  expect(api.saveSettings).not.toHaveBeenCalled()
})

it('searches navigation locally and follows the selected connection', async () => {
  const page = await consolePage()
  expect(page.find('[aria-label="搜索功能与设置"]').exists()).toBe(true)
  await page.get('[aria-label="搜索功能与设置"]').setValue('表情')
  expect(page.find('[data-panel="connection"]').exists()).toBe(false)
  expect(page.find('[data-panel="interaction"]').exists()).toBe(true)
  page.findComponent(ElSelect).vm.$emit('update:modelValue', 'qq-2')
  await flushPromises()
  expect(api.settings).toHaveBeenLastCalledWith('qq-2')
  expect(api.runtime.mock.calls.every(call => ['qq-1', 'qq-2'].includes(call[0]))).toBe(true)
})

it('does not silently drop a typed scope that has not been added', async () => {
  const page = await consolePage()
  await page.get('[data-action="add-scope"]').trigger('click')
  await page.get('[data-field="scope-entry"]').setValue('987654321')
  await page.get('[data-action="save-meme-settings"]').trigger('click')
  await flushPromises()
  expect(api.saveSettings).not.toHaveBeenCalled()
  expect(page.text()).toContain('请先点击添加范围')
  expect(page.get('[data-field="scope-entry"]').element).toHaveProperty('value', '987654321')
})

it('does not label an unsaved default connection configuration as saved', async () => {
  api.settings.mockResolvedValue({ bot_service_id: 'qq-1', row_version: 0, enabled: false,
    private_enabled: false, qq_event_ws_url: null, cooldown_seconds: 5, scopes: [] })
  const page = await consolePage()
  expect(page.get('.bot-panel-feedback').text()).toContain('尚未保存')
  expect(page.get('.bot-panel-feedback').classes()).not.toContain('saved')
})
