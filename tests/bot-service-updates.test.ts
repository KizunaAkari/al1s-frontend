import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import BotServiceUpdates from '../src/modules/bots/BotServiceUpdates.vue'
import { botUpdateApi } from '../src/shared/api/bot-updates'
import { componentApi, type InventoryEntry, type ComponentRelease } from '../src/shared/api/components'

afterEach(() => vi.restoreAllMocks())
function state(alias: 'qq' | 'discord', version: string) {
  return { alias, runtime_version: '1.0.0', current: { component: `${alias}-bot`, upgrade_unit: `${alias}-bot`,
    target: { kind: 'bot', bot_alias: alias }, display_name: alias, version, architecture: 'amd64',
    status: 'healthy', observed_at: null, image: 'image', image_id: 'sha256:' + '1'.repeat(64),
    source_identity: '2'.repeat(64), reason: null } as InventoryEntry }
}
it('separates QQ official checking from Discord packages and drops late QQ inventory', async () => {
  let finish!: (value: ReturnType<typeof state>) => void
  vi.spyOn(botUpdateApi, 'state').mockImplementation(alias => alias === 'qq'
    ? new Promise(resolve => { finish = resolve }) : Promise.resolve(state('discord', 'dc-current')))
  vi.spyOn(botUpdateApi, 'versions').mockResolvedValue({ items: [], next_cursor: null })
  vi.spyOn(componentApi, 'operations').mockResolvedValue({ items: [], next_cursor: null })
  const page = mount(BotServiceUpdates, { props: { alias: 'qq' } })
  try {
    expect(page.text()).toContain('检查官方版本')
    await page.setProps({ alias: 'discord' }); await flushPromises()
    expect(page.text()).not.toContain('检查官方版本')
    expect(page.text()).toContain('平台版本包')
    finish(state('qq', 'late-qq')); await flushPromises()
    expect(page.text()).toContain('dc-current')
    expect(page.text()).not.toContain('late-qq')
    expect(page.find('[data-action="upgrade-bot"]').exists()).toBe(false)
  } finally { page.unmount() }
})

it('discards a historical page response after switching Bot', async () => {
  let finish!: (page: { items: ComponentRelease[]; next_cursor: string | null }) => void
  vi.spyOn(botUpdateApi, 'state').mockImplementation(alias => Promise.resolve(state(alias, alias === 'qq' ? '8.3.2' : '0.1.0')))
  vi.spyOn(componentApi, 'operations').mockResolvedValue({ items: [], next_cursor: null })
  vi.spyOn(botUpdateApi, 'versions').mockImplementation((alias, _limit, cursor) => cursor
    ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ items: [], next_cursor: alias === 'qq' ? 'history' : null }))
  const page = mount(BotServiceUpdates, { props: { alias: 'qq' }, global: { stubs: {
    ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  } } })
  try {
    await flushPromises(); await page.get('[data-action="history-versions"]').trigger('click')
    await page.setProps({ alias: 'discord' }); await flushPromises()
    finish({ items: [{ release_id: 'old', native_version: 'late-qq', state: 'published' } as ComponentRelease], next_cursor: null })
    await flushPromises()
    expect(page.text()).not.toContain('late-qq')
    expect(page.find('[data-test="history-versions"]').exists()).toBe(false)
  } finally { page.unmount() }
})

it('shows the newest five numeric versions and selects a published historical version', async () => {
  const rows = ['8.1.9','8.3.0','8.2.1','8.1.10','8.3.2','8.3.1','8.2.0'].map(version => ({
    release_id: version, native_version: version, version, component: 'qq-bot', runtime_version: '1.0.0',
    architecture: 'amd64', state: 'published', created_at: '2026-10-14T00:00:00Z', row_version: 1,
  } as ComponentRelease))
  vi.spyOn(botUpdateApi, 'state').mockResolvedValue(state('qq', '8.3.2'))
  vi.spyOn(componentApi, 'operations').mockResolvedValue({ items: [], next_cursor: null })
  vi.spyOn(botUpdateApi, 'versions').mockImplementation((_alias, _limit, cursor) => Promise.resolve({
    items: cursor ? rows.filter(row => ['8.1.9','8.1.10'].includes(row.native_version)) : rows,
    next_cursor: cursor ? null : '8.2.0',
  }))
  const page = mount(BotServiceUpdates, { props: { alias: 'qq' }, global: { stubs: {
    ComponentUpgradeDialog: { props: ['row','initialRelease'], template: '<div data-selected>{{ initialRelease?.native_version }}</div>' },
    ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  } } })
  try {
    await flushPromises()
    const latest=page.find('[data-test="latest-versions"]')
    expect(latest.findAll('article').map(row => row.attributes('data-version'))).toEqual(['8.3.2','8.3.1','8.3.0','8.2.1','8.2.0'])
    await page.get('[data-action="history-versions"]').trigger('click'); await flushPromises()
    expect(page.get('[data-test="history-versions"]').text()).toContain('8.1.10')
    await page.get('[data-test="history-versions"] [data-version="8.1.9"] [data-action="select-version"]').trigger('click'); await flushPromises()
    expect(page.get('[data-selected]').text()).toBe('8.1.9')
  } finally { page.unmount() }
})
