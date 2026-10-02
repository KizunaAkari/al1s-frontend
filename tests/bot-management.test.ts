import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton } from 'element-plus'
import BotConfiguration from '../src/modules/bots/BotConfiguration.vue'
import type { BotService } from '../src/shared/api/bots'
import { helpText } from './help-test-utils'

const api = vi.hoisted(() => ({
  createBot: vi.fn(), fetchBotConfigVersion: vi.fn(), saveBotConfig: vi.fn(),
  probeGateway: vi.fn(), botGrant: vi.fn(), resolveDiscordApplicationId: vi.fn(),
}))
vi.mock('../src/shared/api/bots', () => api)
const service: BotService = {
  service_id: '11111111-1111-4111-8111-111111111111', kind: 'onebot_gateway',
  name: 'QQ 主机器人', enabled: true, row_version: 1,
  desired_config_version_id: null, applied_config_version_id: null,
}
const mounted: { unmount: () => void }[] = []
function view(services: BotService[], kind: 'qq' | 'discord' = 'qq') {
  const wrapper = mount(BotConfiguration, {
    props: { kind, services }, global: { directives: { loading: { mounted() {} } } },
  })
  mounted.push(wrapper)
  return wrapper
}
function button(wrapper: ReturnType<typeof view>, label: string) {
  return wrapper.findAllComponents(ElButton).find(item => item.text() === label)!
}
beforeEach(() => {
  vi.clearAllMocks()
  api.createBot.mockResolvedValue(service)
  api.saveBotConfig.mockResolvedValue({
    service: { ...service, row_version: 2 }, version: { secret_configured: false },
  })
  api.resolveDiscordApplicationId.mockResolvedValue('1234567890123456789')
})
afterEach(() => mounted.splice(0).forEach(item => item.unmount()))

it('requires a connection name and maps the QQ form without raw JSON or a mandatory token', async () => {
  const wrapper = view([])
  expect(wrapper.text()).not.toContain('配置JSON')
  await button(wrapper, '创建连接').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('请填写连接名称')
  expect(api.createBot).not.toHaveBeenCalled()

  await wrapper.get('#bot-name').setValue('QQ 主机器人')
  await button(wrapper, '创建连接').trigger('click')
  await flushPromises()
  expect(api.createBot).toHaveBeenCalledWith('onebot_gateway', 'QQ 主机器人', expect.any(String))
  await wrapper.setProps({ services: [service] })
  await flushPromises()
  const addressHelp = await helpText(wrapper, 'OneBot HTTP 地址')
  expect(addressHelp).toContain('浏览器无法打开这个地址')
  expect(addressHelp).toContain('“原生管理页”入口')
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(api.saveBotConfig).toHaveBeenCalledWith(
    service, { ONEBOT_BASE_URL: 'http://al1s-llbot:3000' }, null, null, expect.any(String),
  )
})

it('prefills nonsecret settings but requires reentry of an existing token', async () => {
  api.fetchBotConfigVersion.mockResolvedValue({
    settings: { ONEBOT_BASE_URL: 'http://al1s-llbot:3001' },
    secret_configured: true, onebot_service_id: null,
  })
  const configured = { ...service, desired_config_version_id: '22222222-2222-4222-8222-222222222222' }
  const wrapper = view([configured])
  await flushPromises()
  expect((wrapper.get('#bot-url').element as HTMLInputElement).value).toBe('http://al1s-llbot:3001')
  expect((wrapper.get('#bot-secret').element as HTMLInputElement).value).toBe('')
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('重新输入令牌')
  expect(api.saveBotConfig).not.toHaveBeenCalled()
})

it('gets the Application ID from the Bot Token and sends both to separate fields', async () => {
  const discord = { ...service, service_id: '33333333-3333-4333-8333-333333333333', kind: 'discord_bridge' as const }
  const wrapper = view([service, discord], 'discord')
  await flushPromises()
  expect(wrapper.get('#bot-application').attributes('placeholder')).toContain('自动获取')
  expect(wrapper.get('#bot-application').element.compareDocumentPosition(wrapper.get('#bot-secret').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(wrapper.get('#bot-application').attributes('readonly')).toBeDefined()
  await wrapper.get('#bot-secret').setValue('long.bot.token.with.many.characters')
  await wrapper.get('#bot-secret').trigger('blur')
  await flushPromises()
  expect(api.resolveDiscordApplicationId).toHaveBeenCalledWith('long.bot.token.with.many.characters')
  expect((wrapper.get('#bot-application').element as HTMLInputElement).value).toBe('1234567890123456789')

  expect(wrapper.find('#bot-owners').exists()).toBe(false)
  expect(wrapper.find('#bot-linked').exists()).toBe(false)
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(api.saveBotConfig).toHaveBeenCalledWith(discord, {
    DISCORD_APPLICATION_ID: '1234567890123456789',
  }, 'long.bot.token.with.many.characters', null, expect.any(String))
  expect(api.resolveDiscordApplicationId).toHaveBeenCalledTimes(1)
})

it('drops retired forwarding settings when the Discord Token is updated', async () => {
  const discord = { ...service, service_id: '33333333-3333-4333-8333-333333333333',
    kind: 'discord_bridge' as const, desired_config_version_id: '44444444-4444-4444-8444-444444444444' }
  api.fetchBotConfigVersion.mockResolvedValue({
    settings: {
      DISCORD_APPLICATION_ID: '1234567890123456789',
      DISCORD_OWNER_USER_IDS: '2234567890123456789',
      DISCORD_GUILD_IDS: '3234567890123456789',
      DISCORD_CHANNEL_IDS: '4234567890123456789',
      DISCORD_GROUP_CHANNEL_IDS: '',
      DISCORD_HISTORY_SCAN_LIMIT: 20,
    },
    onebot_service_id: service.service_id, secret_configured: true,
  })
  const wrapper = view([service, discord], 'discord')
  await flushPromises()
  await wrapper.get('#bot-secret').setValue('new.long.bot.token.with.many.characters')
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(api.saveBotConfig).toHaveBeenCalledWith(discord, {
    DISCORD_APPLICATION_ID: '1234567890123456789',
  }, 'new.long.bot.token.with.many.characters', null, expect.any(String))
})

it('resolves on save and does not submit if the current Token cannot be resolved', async () => {
  const discord = { ...service, service_id: '33333333-3333-4333-8333-333333333333', kind: 'discord_bridge' as const }
  const wrapper = view([service, discord], 'discord')
  await flushPromises()
  await wrapper.get('#bot-secret').setValue('first.bot.token.with.many.characters')
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(api.saveBotConfig).toHaveBeenCalledTimes(1)

  await wrapper.get('#bot-secret').setValue('second.bot.token.with.many.characters')
  await flushPromises()
  expect((wrapper.get('#bot-application').element as HTMLInputElement).value).toBe('')
  api.resolveDiscordApplicationId.mockRejectedValueOnce(new Error('Discord 未接受这个 Bot Token。'))
  await button(wrapper, '保存配置').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Discord 未接受这个 Bot Token。')
  expect(api.saveBotConfig).toHaveBeenCalledTimes(1)
})
