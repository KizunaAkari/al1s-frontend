import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }))
vi.mock('../src/shared/api/bot-drawing', () => ({ fetchDrawingOnlinePreset: api.fetch, saveDrawingOnlinePreset: api.save }))
import AiDrawingOnlinePresetEditor from '../src/modules/bots/drawing/AiDrawingOnlinePresetEditor.vue'

beforeEach(() => { vi.clearAllMocks(); api.save.mockResolvedValue({ id: 'online', number: 7, revision: 1, row_version: 1 }) })

it('defaults new online presets to automatic size and quality', async () => {
  const page = mount(AiDrawingOnlinePresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  expect((page.get('[data-online-field="size"]').element as HTMLSelectElement).value).toBe('auto')
  expect((page.get('[data-online-field="quality"]').element as HTMLSelectElement).value).toBe('auto')
  await page.get('[data-online-field="name"]').setValue('自动绘图')
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', null, expect.objectContaining({ size: 'auto', quality: 'auto' }),
    0, expect.any(String))
})

it('creates a Sunburst preset with its own credentials and image settings', async () => {
  const page = mount(AiDrawingOnlinePresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  await page.get('[data-online-field="name"]').setValue('细节绘图')
  await page.get('[data-online-field="model"]').setValue('gpt-image-2.6-sunburst')
  await page.get('[data-online-field="secret"]').setValue('example-test-value')
  await page.get('[data-online-field="network"]').setValue('proxy')
  await page.get('[data-online-field="size"]').setValue('1024x1536')
  await page.get('[data-online-field="enabled"]').setValue(true)
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', null, expect.objectContaining({
    name: '细节绘图', model_id: 'gpt-image-2.6-sunburst', network_mode: 'proxy', size: '1024x1536',
    enabled: true, secret_input: 'example-test-value', use_prompt_model: false,
  }), 0, expect.any(String))
  expect(page.emitted('saved')).toHaveLength(1)
})

it('editing a preset leaves its saved key unchanged unless explicitly replaced or cleared', async () => {
  api.fetch.mockResolvedValue({ id: 'online', name: '快速绘图', model_id: 'gpt-image-2.6-flare', base_url: '',
    network_mode: 'direct', size: '1024x1024', quality: 'medium', use_prompt_model: false,
    enabled: true, row_version: 4, secret_configured: true })
  const page = mount(AiDrawingOnlinePresetEditor, { props: { serviceId: 'qq', presetId: 'online', open: true } })
  await flushPromises()
  expect((page.get('[data-online-field="secret"]').element as HTMLInputElement).value).toBe('')
  expect((page.get('[data-online-field="size"]').element as HTMLSelectElement).value).toBe('1024x1024')
  expect((page.get('[data-online-field="quality"]').element as HTMLSelectElement).value).toBe('medium')
  await page.get('[data-online-field="name"]').setValue('快速绘图 2')
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', 'online', expect.objectContaining({
    secret_input: null, clear_secret: false,
  }), 4, expect.any(String))
})
