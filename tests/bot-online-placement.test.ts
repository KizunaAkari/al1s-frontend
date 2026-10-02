import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import BotManagement from '../src/modules/bots/BotManagement.vue'

const api = vi.hoisted(() => ({ fetchBotServices: vi.fn(), fetchBotApplications: vi.fn(), get: vi.fn() }))
vi.mock('../src/shared/api/bots', async original => ({
  ...await original<typeof import('../src/shared/api/bots')>(),
  fetchBotServices: api.fetchBotServices,
  fetchBotApplications: api.fetchBotApplications,
}))
vi.mock('../src/shared/api/client', () => ({ apiClient: { get: api.get } }))

const configurationStub = defineComponent({
  props: { kind: { type: String, required: true }, services: { type: Array, required: true } },
  emits: ['selected'],
  template: `<section data-test="configuration">
    <button data-test="select-first" @click="$emit('selected', 'qq-1')">选择第一个</button>
    <button data-test="select-second" @click="$emit('selected', 'qq-2')">选择第二个</button>
    <button data-test="create" @click="$emit('selected', null)">创建连接</button>
  </section>`,
})
const containersStub = defineComponent({
  props: { alias: { type: String, required: true }, serviceId: { type: String, default: null } },
  template: `<section data-test="containers" :data-service-id="serviceId ?? ''">
    <div v-if="serviceId" data-test="online-status">在线监测：{{ serviceId }}</div>
    <div v-else data-test="online-empty">请选择连接</div>
  </section>`,
})

const global = {
  directives: { loading: { mounted() {} } },
  stubs: {
    BotConfiguration: configurationStub,
    BotContainers: containersStub,
    BotBrandIcon: { template: '<span />' },
    HelpHint: { template: '<span />' },
    ElButton: { template: '<button v-bind="$attrs"><slot /></button>' },
    ElDrawer: { template: '<div><slot /></div>' },
    ElEmpty: { template: '<div />' },
    ElTable: { template: '<div><slot /></div>' },
    ElTableColumn: { template: '<div />' },
  },
}

const services = [
  { service_id: 'qq-1', name: 'QQ 1', kind: 'onebot_gateway', enabled: true, row_version: 1, desired_config_version_id: null, applied_config_version_id: null },
  { service_id: 'qq-2', name: 'QQ 2', kind: 'onebot_gateway', enabled: true, row_version: 1, desired_config_version_id: null, applied_config_version_id: null },
  { service_id: 'discord-1', name: 'Discord 1', kind: 'discord_bridge', enabled: true, row_version: 1, desired_config_version_id: null, applied_config_version_id: null },
]

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  api.fetchBotServices.mockResolvedValue({ items: services, next_cursor: null })
  api.fetchBotApplications.mockResolvedValue({ items: [], next_cursor: null })
  api.get.mockResolvedValue({ data: { url: null } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.clearAllMocks() })

it('keeps online monitoring only in the right container and follows selection, create mode, and tab changes', async () => {
  wrapper = mount(BotManagement, { global })
  await flushPromises()
  const configuration = wrapper.get('[data-test="configuration"]')
  const containers = wrapper.get('[data-test="containers"]')

  expect(configuration.find('[data-test="online-status"]').exists()).toBe(false)
  expect(containers.find('[data-test="online-empty"]').exists()).toBe(true)

  await configuration.get('[data-test="select-first"]').trigger('click')
  expect(containers.attributes('data-service-id')).toBe('qq-1')
  expect(containers.get('[data-test="online-status"]').text()).toContain('qq-1')

  await configuration.get('[data-test="select-second"]').trigger('click')
  expect(containers.attributes('data-service-id')).toBe('qq-2')
  expect(containers.get('[data-test="online-status"]').text()).toContain('qq-2')

  await configuration.get('[data-test="create"]').trigger('click')
  expect(containers.attributes('data-service-id')).toBe('')
  expect(containers.find('[data-test="online-status"]').exists()).toBe(false)

  await configuration.get('[data-test="select-first"]').trigger('click')
  await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
  expect(containers.attributes('data-service-id')).toBe('')
  expect(containers.find('[data-test="online-status"]').exists()).toBe(false)
})
