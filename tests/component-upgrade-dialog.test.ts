import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { ElButton, ElSelect } from 'element-plus'
import ComponentUpgradeDialog from '../src/modules/maintenance/ComponentUpgradeDialog.vue'
import { componentApi, type InventoryEntry, type ComponentRelease } from '../src/shared/api/components'
import { botUpdateApi } from '../src/shared/api/bot-updates'

afterEach(() => vi.restoreAllMocks())
const row: InventoryEntry = { component: 'maa', upgrade_unit: 'linux-terminal', target: { kind: 'terminal', terminal_id: 'terminal-id' }, display_name: 'Linux', version: 'v5.12.1', architecture: 'arm64', status: 'healthy', observed_at: null, image: null, image_id: null, source_identity: 'a'.repeat(64), reason: null }
it('shows target Maa SDK separately and requires explicit preflight and confirmation', async () => {
  const candidate = { release_id: 'release-1', component: 'linux-terminal', version: 'bundle-r37', native_version: '0.1.0', maa_version: 'v5.13.0', architecture: 'arm64', state: 'published' } as ComponentRelease
  vi.spyOn(componentApi, 'releases').mockResolvedValue({ items: [candidate], next_cursor: null })
  const preflight = vi.spyOn(componentApi, 'preflight').mockResolvedValue({ component: 'linux-terminal', target: row.target, release_id: 'release-1', expected_source: 'a'.repeat(64), current_version: 'agent-r36', target_version: '0.1.0', allowed: true, reasons: [], affected_services: ['terminal-agent'], backup_required: false })
  const start = vi.spyOn(componentApi, 'start')
  const wrapper = mount(ComponentUpgradeDialog, { props: { row }, attachTo: document.body })
  try {
    await flushPromises()
    expect(start).not.toHaveBeenCalled()
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'release-1')
    await wrapper.vm.$nextTick()
    const check = wrapper.findAllComponents(ElButton).find(button => button.text() === '检查兼容性与影响')!
    check.vm.$emit('click', new MouseEvent('click')); await flushPromises()
    expect(preflight).toHaveBeenCalledWith(row.target, 'release-1')
    expect(document.body.textContent).toContain('目标版本：v5.13.0')
    expect(start).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('preselects a published historical Bot version and keeps rejected downgrade confirmation disabled', async () => {
  const bot = { ...row, component: 'qq-bot', upgrade_unit: 'qq-bot', target: { kind: 'bot', bot_alias: 'qq' }, version: '8.3.2', architecture: 'amd64' } as InventoryEntry
  const old = { release_id: 'old-release', component: 'qq-bot', native_version: '8.1.9', version: 'old-runtime', architecture: 'amd64', state: 'published' } as ComponentRelease
  vi.spyOn(botUpdateApi, 'versions').mockResolvedValue({ items: [], next_cursor: null })
  vi.spyOn(componentApi, 'releases').mockResolvedValue({ items: [], next_cursor: null })
  const preflight = vi.spyOn(componentApi, 'preflight').mockResolvedValue({ component: 'qq-bot', target: bot.target, release_id: old.release_id, expected_source: 'a'.repeat(64), current_version: '8.3.2', target_version: '8.1.9', allowed: false, reasons: ['source_version_incompatible'], affected_services: ['llbot'], backup_required: true })
  const start = vi.spyOn(componentApi, 'start')
  const wrapper = mount(ComponentUpgradeDialog, { props: { row: bot, initialRelease: old }, attachTo: document.body })
  try {
    await flushPromises()
    expect(wrapper.findComponent(ElSelect).props('modelValue')).toBe(old.release_id)
    wrapper.findAllComponents(ElButton).find(button => button.text() === '检查兼容性与影响')!.vm.$emit('click', new MouseEvent('click'))
    await flushPromises()
    expect(preflight).toHaveBeenCalledWith(bot.target, old.release_id)
    expect(wrapper.findAllComponents(ElButton).find(button => button.text() === '确认降级')!.props('disabled')).toBe(true)
    expect(start).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('discards a preflight response after the selected component changes', async () => {
  vi.spyOn(componentApi, 'releases').mockResolvedValue({ items: [{ release_id: 'release-1', component: 'linux-terminal', architecture: 'arm64', state: 'published' } as ComponentRelease], next_cursor: null })
  let resolve!: (value: Awaited<ReturnType<typeof componentApi.preflight>>) => void
  vi.spyOn(componentApi, 'preflight').mockImplementation(() => new Promise(done => { resolve = done }))
  const wrapper = mount(ComponentUpgradeDialog, { props: { row }, attachTo: document.body })
  try {
    await flushPromises()
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'release-1')
    await wrapper.vm.$nextTick()
    wrapper.findAllComponents(ElButton).find(button => button.text() === '检查兼容性与影响')!.vm.$emit('click', new MouseEvent('click'))
    await wrapper.setProps({ row: { ...row, display_name: 'Another terminal', target: { kind: 'terminal', terminal_id: 'another' } } })
    resolve({ component: 'linux-terminal', target: row.target, release_id: 'release-1', expected_source: 'a'.repeat(64), current_version: 'old', target_version: 'stale-version', allowed: true, reasons: [], affected_services: ['terminal-agent'], backup_required: false })
    await flushPromises()
    expect(document.body.textContent).not.toContain('stale-version')
    expect(wrapper.findAllComponents(ElButton).find(button => button.text() === '确认升级')!.props('disabled')).toBe(true)
  } finally { wrapper.unmount() }
})
it('does not confirm a late preflight for a previously selected version', async () => {
  vi.spyOn(componentApi, 'releases').mockResolvedValue({items:['first','second'].map(id => ({release_id:id,component:'linux-terminal',architecture:'arm64',state:'published'} as ComponentRelease)),next_cursor:null})
  let finish!: (value: Awaited<ReturnType<typeof componentApi.preflight>>) => void
  vi.spyOn(componentApi,'preflight').mockImplementation(()=>new Promise(resolve => {finish=resolve}))
  const wrapper=mount(ComponentUpgradeDialog,{props:{row},attachTo:document.body})
  try {
    await flushPromises()
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue','first'); await wrapper.vm.$nextTick()
    wrapper.findAllComponents(ElButton).find(button=>button.text()==='检查兼容性与影响')!.vm.$emit('click',new MouseEvent('click'))
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue','second'); await wrapper.vm.$nextTick()
    finish({component:'linux-terminal',target:row.target,release_id:'first',expected_source:'a'.repeat(64),current_version:'old',target_version:'stale',allowed:true,reasons:[],affected_services:[],backup_required:false})
    await flushPromises()
    expect(wrapper.findAllComponents(ElButton).find(button=>button.text()==='确认升级')!.props('disabled')).toBe(true)
  } finally {wrapper.unmount()}
})
