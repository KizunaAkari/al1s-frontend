import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import MemeWorkshop from '../src/modules/bots/memes/MemeWorkshop.vue'
import { defaultLayout } from '../src/modules/bots/memes/layout'

const api = vi.hoisted(() => ({ fetchTemplates: vi.fn(), saveTemplate: vi.fn(), deleteTemplate: vi.fn(), preview: vi.fn(), readAsset: vi.fn(), uploadAsset: vi.fn(), fetchRateLimits: vi.fn(), saveRateLimit: vi.fn() }))
vi.mock('../src/shared/api/memes', async importOriginal => ({
  ...await importOriginal<typeof import('../src/shared/api/memes')>(), ...api,
}))
beforeEach(() => {
  vi.clearAllMocks()
  api.fetchTemplates.mockResolvedValue({ items: [], next_cursor: null })
  api.fetchRateLimits.mockResolvedValue([{ platform: 'discord', interval_seconds: 5, row_version: 1 }, { platform: 'qq', interval_seconds: 10, row_version: 1 }])
})
it('keeps global sending policy out of the content workshop', async () => {
  const wrapper = mount(MemeWorkshop)
  await flushPromises()
  expect(wrapper.find('[data-field="global-discord"]').exists()).toBe(false)
  expect(wrapper.find('[data-field="global-qq"]').exists()).toBe(false)
  expect(api.fetchRateLimits).not.toHaveBeenCalled()
  expect(api.saveRateLimit).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('offers template management and editing without any chat send controls', async () => {
  const wrapper = mount(MemeWorkshop)
  await flushPromises()
  expect(wrapper.text()).toContain('表情包工坊')
  expect(wrapper.text()).toContain('新建模板')
  expect(wrapper.text()).not.toContain('发送到QQ群')
  await wrapper.get('[data-action="create-template"]').trigger('click')
  expect(wrapper.text()).toContain('底图')
  expect(wrapper.text()).toContain('添加头像')
  expect(wrapper.text()).toContain('添加文字')
  wrapper.unmount()
})

it('does not reopen the editor when the initial catalog completes after an explicit close', async () => {
  let complete!: (value: unknown) => void
  api.fetchTemplates.mockReturnValue(new Promise(resolve => { complete = resolve }))
  const wrapper = mount(MemeWorkshop)
  await wrapper.get('[data-action="create-template"]').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click')
  complete({ items: [{ id: 'test', name: 'test', keyword: 'test', aliases: [], row_version: 1,
    enabled: true, random_enabled: true, builtin: false, layout: defaultLayout(),
    background_blob_id: null, foreground_blob_id: null }], next_cursor: null })
  await flushPromises()
  expect(wrapper.find('.meme-editor').exists()).toBe(false)
  wrapper.unmount()
})
