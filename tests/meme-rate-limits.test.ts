import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import MemeRateLimits from '../src/modules/bots/memes/MemeRateLimits.vue'
import BotConfiguration from '../src/modules/bots/BotConfiguration.vue'
const api = vi.hoisted(() => ({ fetchRateLimits: vi.fn(), saveRateLimit: vi.fn() }))
vi.mock('../src/shared/api/memes', async original => ({ ...await original<typeof import('../src/shared/api/memes')>(), ...api, createMemeApi: () => api }))
beforeEach(() => {
  vi.resetAllMocks()
  api.fetchRateLimits.mockResolvedValue([{ platform: 'discord', interval_seconds: 5, row_version: 3 }, { platform: 'qq', interval_seconds: 10, row_version: 2 }])
})
it('rejects invalid seconds and keeps pending saves locked', async () => {
  const wrapper = mount(MemeRateLimits, { props: { platform: 'discord' } })
  await flushPromises()
  await wrapper.get('[data-field="global-discord"]').setValue(0)
  expect(wrapper.get('[data-action="save-global-discord"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-field="global-discord"]').setValue(7)
  let complete!: (value: unknown) => void
  api.saveRateLimit.mockReturnValue(new Promise(resolve => { complete = resolve }))
  await wrapper.get('[data-action="save-global-discord"]').trigger('click')
  expect(wrapper.get('[data-field="global-discord"]').attributes('disabled')).toBeDefined()
  expect(wrapper.find('[data-field="global-qq"]').exists()).toBe(false)
  complete({ platform: 'discord', interval_seconds: 7, row_version: 4 })
  await flushPromises()
  expect(wrapper.text()).toContain('已保存 7 秒')
  expect(api.saveRateLimit).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('preserves unsaved input after a failed save and lets the user refresh to reconcile', async () => {
  api.saveRateLimit.mockRejectedValue(new Error('timeout'))
  const wrapper = mount(MemeRateLimits, { props: { platform: 'qq' } })
  await flushPromises()
  await wrapper.get('[data-field="global-qq"]').setValue(12)
  await wrapper.get('[data-action="save-global-qq"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-field="global-qq"]').element).toHaveProperty('value', '12')
  expect(wrapper.text()).toContain('刷新核对')
  await wrapper.get('[data-action="refresh-global-rates"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-field="global-qq"]').element).toHaveProperty('value', '10')
  wrapper.unmount()
})

it('places only the matching global interval in each Bot management page', async () => {
  const wrapper = mount(BotConfiguration, { props: { kind: 'qq', services: [] }, global: { directives: { loading: {} } } })
  try {
    await flushPromises()
    expect(wrapper.find('[data-field="global-qq"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="global-discord"]').exists()).toBe(false)
    api.saveRateLimit.mockResolvedValue({ platform: 'qq', interval_seconds: 30, row_version: 3 })
    await wrapper.get('[data-field="global-qq"]').setValue(30)
    await wrapper.get('[data-action="save-global-qq"]').trigger('click')
    await flushPromises()
    expect(api.saveRateLimit).toHaveBeenCalledWith('qq', 30, 2)
    await wrapper.setProps({ kind: 'discord' })
    await flushPromises()
    expect(wrapper.find('[data-field="global-qq"]').exists()).toBe(false)
    expect(wrapper.get('[data-field="global-discord"]').element).toHaveProperty('value', '5')
  } finally { wrapper.unmount() }
})

it('does not apply a late save result to another Bot platform page', async () => {
  let complete!: (value: unknown) => void
  api.saveRateLimit.mockReturnValue(new Promise(resolve => { complete = resolve }))
  const wrapper = mount(BotConfiguration, { props: { kind: 'qq', services: [] }, global: { directives: { loading: {} } } })
  try {
    await flushPromises()
    await wrapper.get('[data-field="global-qq"]').setValue(27)
    await wrapper.get('[data-action="save-global-qq"]').trigger('click')
    await wrapper.setProps({ kind: 'discord' })
    await flushPromises()
    complete({ platform: 'qq', interval_seconds: 27, row_version: 3 })
    await flushPromises()
    expect(wrapper.get('[data-field="global-discord"]').element).toHaveProperty('value', '5')
    expect(wrapper.text()).not.toContain('已保存为 27 秒')
    expect(wrapper.find('[data-field="global-qq"]').exists()).toBe(false)
  } finally { wrapper.unmount() }
})
