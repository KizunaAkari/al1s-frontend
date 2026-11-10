import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), status: vi.fn(), requests: vi.fn(), test: vi.fn(), clear: vi.fn(), profiles: vi.fn(), profileSave: vi.fn(), profileDelete: vi.fn(), profileTest: vi.fn() }))
vi.mock('../src/shared/api/bot-ai', () => ({
  fetchAiSettings: api.fetch, saveAiSettings: api.save, fetchAiStatus: api.status,
  fetchAiRequests: api.requests, testAiProvider: api.test, clearAiSession: api.clear,
  fetchAiChatProfiles: api.profiles, saveAiChatProfile: api.profileSave,
  deleteAiChatProfile: api.profileDelete, testAiChatProfile: api.profileTest,
}))
import AiSettings from '../src/modules/bots/ai/AiSettings.vue'

const record = (service = 'qq-service') => ({
  service_id: service, enabled: false, event_ws_url: 'ws://gateway:3001', allow_private: false,
  groups: ['123456'], wake_words: [], persona: '你好', vision_enabled: false, stt_enabled: false,
  tts_mode: 'off', desired_version: 2, applied_version: 1, last_error: null,
  providers: { chat: { adapter_kind: 'openai_chat_completion', model_id: 'example', base_url: '',
    voice: '', secret_configured: true } },
})

const chatProfile = (id = 'profile-1', name = '大肥鱼') => ({
  id, name, description: '日常聊天', persona: '你好', adapter_kind: 'openai_chat_completion',
  model_id: 'example', base_url: '', secret_configured: true, supports_vision: false,
  is_default: id === 'profile-1',
})

describe('AI settings', () => {

  it('opens the selected authorized group in its own configuration page', async () => {
    api.fetch.mockResolvedValue({ ...record(), groups: ['123456', '789012'], reply_all_groups: ['789012'] })
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.find('[data-section="ai-groups"]').exists()).toBe(false)
    await page.get('[data-ai-configure-group="789012"]').trigger('click')
    expect(page.get('[data-ai-tab="groups"]').attributes('aria-selected')).toBe('true')
    expect((page.get('[data-ai-group-select]').element as HTMLSelectElement).value).toBe('789012')
    expect((page.get('[data-group-mode="789012-all"]').element as HTMLInputElement).checked).toBe(true)
    await page.get('[data-ai-group-select]').setValue('123456')
    await page.get('[data-group-mode="123456-smart"]').setValue(true)
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({
      reply_all_groups: ['789012'], smart_reply_groups: ['123456'],
    }), 2, expect.any(String))
    page.unmount()
  })

  it('supports keyboard navigation between AI sections with connected tab panels', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    const access = page.get('[data-ai-tab="access"]')
    expect(access.attributes('aria-controls')).toBe('ai-panel-access')
    await access.trigger('keydown', { key: 'ArrowRight' })
    expect(page.get('[data-ai-tab="groups"]').attributes('aria-selected')).toBe('true')
    await page.get('[data-ai-tab="groups"]').trigger('keydown', { key: 'ArrowRight' })
    expect(page.get('[data-ai-tab="profiles"]').attributes('aria-selected')).toBe('true')
    expect(page.get('#ai-panel-profiles').attributes('aria-labelledby')).toBe('ai-tab-profiles')
    page.unmount()
  })

  it('keeps AI and persona drafts when switching between focused sections', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-field="event-url"]').setValue('ws://edited:3001')
    await page.get('[data-ai-tab="profiles"]').trigger('click')
    expect(page.get('#ai-panel-access').attributes('style')).toContain('display: none')
    expect(page.get('[data-action="save-profile"]').element.closest('fieldset[disabled]')).not.toBeNull()
    await page.get('[data-ai-tab="access"]').trigger('click')
    expect((page.get('[data-field="event-url"]').element as HTMLInputElement).value).toBe('ws://edited:3001')
    expect(api.save).not.toHaveBeenCalled()
    page.unmount()
  })

  it('keeps a persona draft when switching to another AI section and back', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-ai-tab="profiles"]').trigger('click')
    await page.get('[data-field="profile-persona"]').setValue('保留的人格草稿')
    await page.get('[data-ai-tab="vision"]').trigger('click')
    expect(page.get('[data-section="ai-chat-profiles"]').attributes('style')).toContain('display: none')
    await page.get('[data-ai-tab="profiles"]').trigger('click')
    expect((page.get('[data-field="profile-persona"]').element as HTMLTextAreaElement).value).toBe('保留的人格草稿')
    expect(api.profileSave).not.toHaveBeenCalled()
    page.unmount()
  })

  it('selects authorized groups for ordinary text replies while retaining voice settings', async () => {
    api.fetch.mockResolvedValue({ ...record(), groups: ['123456', '789012'], reply_all_groups: ['123456'],
      stt_enabled: true, tts_mode: 'voice_input' })
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-ai-tab="groups"]').trigger('click')
    expect((page.get('[data-group-mode="123456-all"]').element as HTMLInputElement).checked).toBe(true)
    await page.get('[data-group-mode="123456-trigger"]').setValue(true)
    await page.get('[data-ai-group-select]').setValue('789012')
    await page.get('[data-group-mode="789012-all"]').setValue(true)
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({
      groups: ['123456', '789012'], reply_all_groups: ['789012'],
      stt_enabled: true, tts_mode: 'voice_input',
    }), 2, expect.any(String))
  })

  it('does not retain reply-all selection when its group is removed from authorization', async () => {
    api.fetch.mockResolvedValue({ ...record(), groups: ['123456', '789012'], reply_all_groups: ['123456'] })
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[aria-label="移除 123456"]').trigger('click')
    expect(page.find('[data-group-mode="123456-all"]').exists()).toBe(false)
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({
      groups: ['789012'], reply_all_groups: [],
    }), 2, expect.any(String))
  })

  it('saves the selected network mode only for the edited persona', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-field="profile-network"]').setValue('proxy')
    await page.get('[data-action="save-profile"]').trigger('click')
    await flushPromises()
    expect(api.profileSave).toHaveBeenCalledWith('qq-service', 'profile-1',
      expect.objectContaining({ network_mode: 'proxy' }), 2, expect.any(String))
  })

  it('saves an independent speech route and explains vision following the chat model', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-ai-tab="vision"]').trigger('click')
    expect(page.get('[data-role="vision"]').text()).toContain('跟随当前对话模型')
    await page.get('[data-ai-tab="voice"]').trigger('click')
    await page.get('[data-role="stt"] [data-field="model"]').setValue('speech-model')
    await page.get('[data-role="stt"] [data-field="network"]').setValue('proxy')
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('qq-service', expect.objectContaining({
      providers: expect.objectContaining({ stt: expect.objectContaining({ network_mode: 'proxy' }) }),
    }), 2, expect.any(String))
  })

  it('marks the selected persona and updates the selection accessibly', async () => {
    api.profiles.mockResolvedValue([chatProfile(), chatProfile('profile-2', '哈基米')])
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.get('[data-profile="profile-1"]').attributes('aria-pressed')).toBe('true')
    expect(page.get('[data-profile="profile-2"]').attributes('aria-pressed')).toBe('false')
    await page.get('[data-profile="profile-2"]').trigger('click')
    expect(page.get('[data-profile="profile-1"]').attributes('aria-pressed')).toBe('false')
    expect(page.get('[data-profile="profile-2"]').attributes('aria-pressed')).toBe('true')
    expect((page.get('[data-field="profile-name"]').element as HTMLInputElement).value).toBe('哈基米')
  })

  it('shows saved chat personas in a selectable configuration list', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.get('[data-section="ai-chat-profiles"]').text()).toContain('大肥鱼')
    expect(page.get('[data-section="ai-chat-profiles"]').text()).toContain('日常聊天')
  })
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    api.fetch.mockResolvedValue(record())
    api.save.mockResolvedValue(record())
    api.status.mockResolvedValue({ state: 'unavailable', synchronized: false, desired_version: 2, applied_version: 1 })
    api.requests.mockResolvedValue({ items: [], next_after_id: null })
    api.profiles.mockResolvedValue([chatProfile()])
    api.profileSave.mockResolvedValue({ profile: chatProfile(), desired_version: 3 })
    api.profileDelete.mockResolvedValue({ deleted: 'profile-2', desired_version: 3 })
    api.profileTest.mockResolvedValue({ state: 'success', message: '连接测试通过' })
  })

  it('allows independent model configuration without automatically testing the API', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.text()).toContain('等待服务同步')
    expect(page.get('[data-field="profile-model"]').element).toHaveProperty('value', 'example')
    expect(page.get('[data-section="ai-chat-profiles"]').text()).toContain('密钥已保存')
    await page.get('[data-field="profile-secret"]').setValue('new-key')
    await page.get('[data-action="save-profile"]').trigger('click')
    await flushPromises()
    expect(api.profileSave).toHaveBeenCalledWith('qq-service', 'profile-1', expect.objectContaining({
      model_id: 'example', secret_input: 'new-key',
    }), 2, expect.any(String))
    expect(api.test).not.toHaveBeenCalled()
    expect((page.get('[data-field="profile-secret"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows recent request time and results in a readable form', async () => {
    api.requests.mockResolvedValue({ items: [{ id: 'request-1', created_at: '2026-10-30T07:11:04Z',
      scope_kind: 'qq_group', target_id: '123456', sender_id: '100', status: 'completed',
      send_status: 'sent', result_code: null }], next_after_id: null })
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    const row = page.get('[data-request="request-1"]')
    expect(row.get('time').attributes('datetime')).toBe('2026-10-30T07:11:04Z')
    expect(row.text()).toContain('群聊 123456')
    expect(row.text()).toContain('已完成')
    expect(row.text()).toContain('已发送')
  })

  it('shows the live applied version and explains a failed configuration sync', async () => {
    api.status.mockResolvedValueOnce({ state: 'idle', connected: true, synchronized: true,
      desired_version: 2, applied_version: 2, last_error: null })
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    expect(page.text()).toContain('配置已同步')
    expect(page.text()).toContain('配置：2 / 2')
    api.status.mockResolvedValueOnce({ state: 'idle', connected: false, synchronized: false,
      desired_version: 2, applied_version: 1, last_error: 'ai_apply_failed' })
    await page.get('[aria-label="AI 服务状态"] button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('配置应用失败')
    expect(page.text()).toContain('已暂停')
  })

  it('shows progress and completion when refreshing an unchanged AI status', async () => {
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    let finish!: (value: unknown) => void
    api.status.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await page.get('[aria-label="AI 服务状态"] button').trigger('click')
    expect(page.get('[aria-label="AI 服务状态"] button').text()).toContain('刷新中')
    finish({ state: 'unavailable', synchronized: false, desired_version: 2, applied_version: 1 })
    await flushPromises()
    expect(page.text()).toContain('状态已刷新')
  })

  it('prevents editing submitted fields until a delayed save returns', async () => {
    let finish!: (value: ReturnType<typeof record>) => void
    api.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-field="event-url"]').setValue('ws://new:3001')
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    expect(page.get('[data-field="event-url"]').element.closest('fieldset[disabled]')).not.toBeNull()
    expect(page.get('[data-field="profile-model"]').element.closest('fieldset[disabled]')).not.toBeNull()
    finish(record())
    await flushPromises()
    expect(page.get('[data-field="event-url"]').element.closest('fieldset[disabled]')).toBeNull()
  })

  it('keeps the draft and idempotency key after a failed save', async () => {
    api.save.mockRejectedValueOnce(new Error('保存失败')).mockResolvedValueOnce(record())
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-field="event-url"]').setValue('ws://new:3001')
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('保存失败')
    expect((page.get('[data-field="event-url"]').element as HTMLInputElement).value).toBe('ws://new:3001')
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save.mock.calls[0]![3]).toBe(api.save.mock.calls[1]![3])
  })


  it('selects and deletes one saved persona without changing the default', async () => {
    api.profiles.mockResolvedValue([chatProfile(), { ...chatProfile('profile-2', '哈基米'),
      model_id: 'gemini-example', description: '支持图片', supports_vision: true }])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-profile="profile-2"]').trigger('click')
    expect((page.get('[data-field="profile-name"]').element as HTMLInputElement).value).toBe('哈基米')
    await page.get('[data-action="delete-profile"]').trigger('click')
    await flushPromises()
    expect(api.profileDelete).toHaveBeenCalledWith('qq-service', 'profile-2', 2, expect.any(String))
  })

  it('keeps a new persona draft after a failed save', async () => {
    api.profileSave.mockRejectedValueOnce(new Error('保存失败'))
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-action="add-profile"]').trigger('click')
    await page.get('[data-field="profile-name"]').setValue('GPT')
    await page.get('[data-field="profile-model"]').setValue('example')
    await page.get('[data-action="save-profile"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('保存失败')
    expect((page.get('[data-field="profile-name"]').element as HTMLInputElement).value).toBe('GPT')
  })

  it('requires voice recognition to be off before removing its saved API', async () => {
    api.fetch.mockResolvedValue({ ...record(), stt_enabled: true, providers: { ...record().providers,
      stt: { adapter_kind: 'openai_whisper_api', model_id: 'speech', base_url: '', voice: '', secret_configured: true } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await flushPromises()
    await page.get('[data-ai-tab="voice"]').trigger('click')
    await page.get('[data-action="delete-stt"]').trigger('click')
    expect(page.text()).toContain('请先关闭对应的图片或语音功能')
    await page.get('[data-ai-tab="access"]').trigger('click')
    const speech = page.findAll('.bot-switch-row').find(row => row.text().startsWith('语音识别'))!
    await speech.get('input').setValue(false)
    await page.get('[data-ai-tab="voice"]').trigger('click')
    await page.get('[data-action="delete-stt"]').trigger('click')
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save.mock.calls[0]![1].providers.stt).toBeUndefined()
  })

  it('ignores an old service response after switching connections', async () => {
    let finishOld!: (value: ReturnType<typeof record>) => void
    api.fetch.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce(record('other-service'))
    const page = mount(AiSettings, { props: { serviceId: 'qq-service' } })
    await page.setProps({ serviceId: 'other-service' })
    await flushPromises()
    finishOld(record('qq-service'))
    await flushPromises()
    await page.get('[data-action="save-ai-settings"]').trigger('click')
    await flushPromises()
    expect(api.save.mock.calls[0]![0]).toBe('other-service')
  })
})
