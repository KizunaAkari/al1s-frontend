import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import MemeConnectionSettings from '../src/modules/bots/memes/MemeConnectionSettings.vue'

const api = vi.hoisted(() => ({ fetchMemeSettings: vi.fn(), saveMemeSettings: vi.fn() }))
vi.mock('../src/shared/api/memes', () => api)
it('loads only on opening and saves QQ event URL and allowed groups under the chosen connection', async () => {
  const identity = '11111111-1111-4111-8111-111111111111'
  const settings = { bot_service_id: identity, row_version: 0, enabled: false, private_enabled: false,
    qq_event_ws_url: null, cooldown_seconds: 5, scopes: [] }
  api.fetchMemeSettings.mockResolvedValue(settings)
  api.saveMemeSettings.mockImplementation(async value => ({ ...value, row_version: 1 }))
  const wrapper = mount(MemeConnectionSettings, { props: { serviceId: identity, kind: 'qq' } })
  expect(api.fetchMemeSettings).not.toHaveBeenCalled()
  await wrapper.get('[data-action="open-meme-settings"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-field="event-url"]').setValue('ws://al1s-llbot:3001')
  await wrapper.get('[data-field="scopes"]').setValue('12345\n67890')
  await wrapper.get('[data-field="enabled"]').setValue(true)
  await wrapper.get('[data-action="save-meme-settings"]').trigger('click')
  await flushPromises()
  expect(api.saveMemeSettings).toHaveBeenCalledWith(expect.objectContaining({
    bot_service_id: identity, enabled: true, qq_event_ws_url: 'ws://al1s-llbot:3001',
    scopes: [{ kind: 'qq_group', target_id: '12345', guild_id: null }, { kind: 'qq_group', target_id: '67890', guild_id: null }],
  }), expect.any(String))
  wrapper.unmount()
})

it('keeps the settings panel open while a save is pending and restores controls afterwards', async () => {
  const identity = '11111111-1111-4111-8111-111111111111'
  const settings = { bot_service_id: identity, row_version: 0, enabled: false, private_enabled: false,
    qq_event_ws_url: null, cooldown_seconds: 5, scopes: [] }
  api.fetchMemeSettings.mockResolvedValue(settings)
  let complete!: (value: typeof settings) => void
  api.saveMemeSettings.mockReturnValue(new Promise(resolve => { complete = resolve }))
  const wrapper = mount(MemeConnectionSettings, { props: { serviceId: identity, kind: 'qq' } })
  await wrapper.get('[data-action="open-meme-settings"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-action="save-meme-settings"]').trigger('click')
  await wrapper.get('[data-action="open-meme-settings"]').trigger('click')
  expect(wrapper.find('[data-field="scopes"]').exists()).toBe(true)
  complete({ ...settings, row_version: 1 })
  await flushPromises()
  expect(wrapper.get('[data-action="save-meme-settings"]').attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})
