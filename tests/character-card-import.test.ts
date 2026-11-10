import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiChatProfiles from '../src/modules/bots/ai/AiChatProfiles.vue'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), remove: vi.fn(), test: vi.fn() }))
vi.mock('../src/shared/api/bot-ai', () => ({ fetchAiChatProfiles: api.fetch, saveAiChatProfile: api.save,
  deleteAiChatProfile: api.remove, testAiChatProfile: api.test }))
const profile = () => ({ id: 'p1', name: '原人格', description: '原说明', persona: '原设定',
  adapter_kind: 'openai_chat_completion', model_id: 'existing-model', base_url: 'https://example.test/v1',
  network_mode: 'proxy', secret_configured: true, is_default: true, supports_vision: true })
const fixture = (description = '你是 {{char}}，使用中文。') => JSON.stringify({ spec: 'chara_card_v3', spec_version: '3.0', data: {
  name: 'ヤマトタケル', description, personality: '直率', mes_example: '{{user}}：你好',
  character_book: { entries: [{ comment: '背景', content: '朋友很重要', enabled: true }] },
} })
const open = async () => {
  const page = mount(AiChatProfiles, { props: { serviceId: 'qq', version: 3, enabled: true, synchronized: true, blocked: false } })
  await flushPromises()
  await page.get('[data-action="open-card-import"]').trigger('click')
  return page
}
async function pick(page: Awaited<ReturnType<typeof open>>, content: string, deferred?: Promise<ArrayBuffer>) {
  const encoded = new TextEncoder().encode(content)
  const file = new File([content], 'test.json', { type: 'application/json' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => deferred ?? Promise.resolve(encoded.buffer) })
  const input = page.get('[data-field="character-card-file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue([profile()])
  api.save.mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('character card import into the current profile draft', () => {
  it('previews and selects lore, then applies without saving or changing provider settings', async () => {
    const page = await open()
    await page.get('[data-field="profile-secret"]').setValue('pending-secret')
    await pick(page, fixture())
    expect(page.get('[data-field="profile-name"]').element).toHaveProperty('value', '原人格')
    expect(page.get('[data-field="card-preview"]').element).toHaveProperty('value', expect.not.stringContaining('朋友很重要'))
    await page.get('[data-card-world="0"]').setValue(true)
    expect(page.get('[data-field="card-preview"]').element).toHaveProperty('value', expect.stringContaining('朋友很重要'))
    await page.get('[data-action="apply-character-card"]').trigger('click')
    expect(page.get('[data-field="profile-name"]').element).toHaveProperty('value', 'ヤマトタケル')
    expect(page.get('[data-field="profile-persona"]').element).toHaveProperty('value', expect.stringContaining('当前发言者：你好'))
    expect(api.save).not.toHaveBeenCalled()
    await page.get('[data-action="save-profile"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq', 'p1', expect.objectContaining({ model_id: 'existing-model',
      base_url: 'https://example.test/v1', network_mode: 'proxy', secret_input: 'pending-secret',
      supports_vision: true, is_default: true, description: '原说明', clear_secret: false }), 3, expect.any(String))
    page.unmount()
  })
  it('keeps the draft after a rejected confirmation, parse error and cancellation', async () => {
    const page = await open()
    await pick(page, fixture())
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await page.get('[data-action="apply-character-card"]').trigger('click')
    expect(page.get('[data-field="profile-persona"]').element).toHaveProperty('value', '原设定')
    await pick(page, '{invalid')
    expect(page.get('[data-section="character-card-import"]').text()).toContain('JSON')
    await page.get('[data-action="cancel-card-import"]').trigger('click')
    expect(page.find('[data-section="character-card-import"]').exists()).toBe(false)
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  })
  it('discards an old file read when the service changes', async () => {
    const page = await open()
    let finish!: (value: ArrayBuffer) => void
    const pending = new Promise<ArrayBuffer>(resolve => { finish = resolve })
    await pick(page, fixture(), pending)
    api.fetch.mockResolvedValue([{ ...profile(), id: 'p2', name: '另一个服务' }])
    await page.setProps({ serviceId: 'other' })
    await flushPromises()
    finish(new TextEncoder().encode(fixture()).buffer)
    await flushPromises()
    expect(page.get('[data-field="profile-name"]').element).toHaveProperty('value', '另一个服务')
    expect(page.find('[data-action="apply-character-card"]').exists()).toBe(false)
    page.unmount()
  })
  it('renders markup as text and blocks oversized selection until reduced', async () => {
    const page = await open()
    await pick(page, fixture('<img src=x onerror="alert(1)">' + '甲'.repeat(12000)))
    expect(page.find('img').exists()).toBe(false)
    expect(page.get('[data-action="apply-character-card"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-section="character-card-import"]').text()).toContain('12,000')
    await page.get('[data-card-field="description"]').setValue(false)
    expect(page.get('[data-action="apply-character-card"]').attributes('disabled')).toBeUndefined()
    page.unmount()
  })
})
