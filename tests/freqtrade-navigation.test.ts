import { computed, defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BotManagement from '../src/modules/bots/BotManagement.vue'

const api = vi.hoisted(() => ({ fetchBotServices: vi.fn(), fetchBotApplications: vi.fn(), get: vi.fn() }))
vi.mock('../src/shared/api/bots', async original => ({
  ...await original<typeof import('../src/shared/api/bots')>(),
  fetchBotServices: api.fetchBotServices,
  fetchBotApplications: api.fetchBotApplications,
}))
vi.mock('../src/shared/api/client', () => ({ apiClient: { get: api.get } }))

const ConfigurationStub = defineComponent({
  emits: ['selected'],
  mounted() { this.$emit('selected', 'qq-1') },
  template: '<div />',
})
const DraftStub = (name: string) => defineComponent({
  setup() { const draft = ref(''); return { draft, hasUnsaved: computed(() => Boolean(draft.value)) } },
  template: `<input :data-engine="'${name}'" v-model="draft">`,
})
const StatusStub = defineComponent({ template: '<div />', setup(_, { expose }) { expose({ refresh() {} }) } })

const services = [{ service_id: 'qq-1', kind: 'onebot_gateway', name: 'QQ一号', enabled: true, row_version: 1,
  desired_config_version_id: null, applied_config_version_id: null }]
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.fetchBotServices.mockResolvedValue({ items: services, next_cursor: null })
  api.fetchBotApplications.mockResolvedValue({ items: [], next_cursor: null })
  api.get.mockResolvedValue({ data: { url: null } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

it('keeps both simulation drafts while switching engine tabs and updates the title', async () => {
  wrapper = mount(BotManagement, { global: { directives: { loading: {} }, stubs: {
    BotConfiguration: ConfigurationStub,
    ThemeMenu: true,
    BotStatusBar: StatusStub,
    BotInteractionSettings: true,
    BotContainers: true,
    BotBrandIcon: true,
    BotServiceUpdates: true,
    QqDeviceIdentity: true,
    MemeWorkshop: true,
    QuantSettings: DraftStub('akquant'),
    FreqtradeSettings: DraftStub('freqtrade'),
    ElButton: { template: '<button v-bind="$attrs"><slot /></button>' },
    ElDrawer: { template: '<div><slot /></div>' },
    ElEmpty: { template: '<div />' },
    ElTable: { template: '<div><slot /></div>' },
    ElTableColumn: { template: '<div />' },
  } } })
  await flushPromises()
  await wrapper.get('[data-panel="quant"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('.bot-content-heading h2').text()).toBe('模拟交易')
  expect(wrapper.get('[data-engine-tab="akquant"]').text()).toContain('A股')
  await wrapper.get('[data-engine="akquant"]').setValue('A股草稿')
  await wrapper.get('[data-engine-tab="freqtrade"]').trigger('click')
  expect(wrapper.get('.bot-content-heading h2').text()).toBe('模拟交易')
  expect(wrapper.get('[data-engine-tab="freqtrade"]').text()).toContain('虚拟币')
  await wrapper.get('[data-engine="freqtrade"]').setValue('币草稿')
  await wrapper.get('[data-engine-tab="akquant"]').trigger('click')
  expect(wrapper.get('[data-engine="akquant"]').element).toHaveProperty('value', 'A股草稿')
  await wrapper.get('[data-engine-tab="freqtrade"]').trigger('click')
  expect(wrapper.get('[data-engine="freqtrade"]').element).toHaveProperty('value', '币草稿')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await wrapper.get('.bot-tabs button:nth-child(2)').trigger('click')
  expect(confirm).toHaveBeenCalledOnce()
  expect(wrapper.get('[data-engine="freqtrade"]').element).toHaveProperty('value', '币草稿')
  const leave = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(leave)
  expect(leave.defaultPrevented).toBe(true)
})
