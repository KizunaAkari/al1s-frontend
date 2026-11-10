import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), status: vi.fn(), requests: vi.fn(), profiles: vi.fn() }))
vi.mock('../src/shared/api/bot-ai', () => ({
  fetchAiSettings: api.fetch, saveAiSettings: api.save, fetchAiStatus: api.status,
  fetchAiRequests: api.requests, fetchAiChatProfiles: api.profiles,
  testAiProvider: vi.fn(), clearAiSession: vi.fn(), saveAiChatProfile: vi.fn(),
  deleteAiChatProfile: vi.fn(), testAiChatProfile: vi.fn(),
}))
import AiSettings from '../src/modules/bots/ai/AiSettings.vue'

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ service_id:'qq', enabled:true, event_ws_url:'ws://llbot:3001', allow_private:false,
    groups:['100','200'], reply_all_groups:['200'], smart_reply_groups:['100'],
    smart_reply:{style:'context',min_interval_seconds:1,cooldown_seconds:3,window_seconds:120,max_replies:5,
      voice_enabled:false,stickers_enabled:true,collect_stickers:false},
    wake_words:[], persona:'', vision_enabled:true, stt_enabled:false, tts_mode:'off',
    desired_version:3, applied_version:3, last_error:null,
    providers:{chat:{adapter_kind:'openai_chat_completion',model_id:'test',base_url:'',voice:'',secret_configured:true},
      vision:{adapter_kind:'al1s_comfyui_vision',model_id:'Qwen/Qwen3-VL-4B-Instruct',
        base_url:'http://host.docker.internal:8188',voice:'',secret_configured:false}} })
  api.status.mockResolvedValue({state:'idle',desired_version:3,applied_version:3,connected:true})
  api.requests.mockResolvedValue({items:[]})
  api.profiles.mockResolvedValue([])
  api.save.mockImplementation(async (_id, value) => ({ ...(await api.fetch()), ...value }))
})

it('preserves smart participation settings and lets groups switch modes independently', async () => {
  const page = mount(AiSettings, {props:{serviceId:'qq'}, global:{stubs:{AiChatProfiles:true, LocalVisionControl:true}}})
  await flushPromises()
  expect((page.get('[data-group-mode="100-smart"]').element as HTMLInputElement).checked).toBe(true)
  await page.get('[data-ai-tab="groups"]').trigger('click')
  await page.get('[data-ai-group-select]').setValue('200')
  await page.get('[data-group-mode="200-smart"]').setValue(true)
  await page.get('[data-action="save-ai-settings"]').trigger('click')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', expect.objectContaining({
    reply_all_groups:[], smart_reply_groups:['100','200'],
    smart_reply:expect.objectContaining({min_interval_seconds:1,cooldown_seconds:3,collect_stickers:false}),
  }), 3, expect.any(String))
  page.unmount()
})

it('keeps local vision controls and presents the local runtime rather than a bridge', async () => {
  const page = mount(AiSettings, {props:{serviceId:'qq'}, global:{stubs:{AiChatProfiles:true, LocalVisionControl:true}}})
  await flushPromises()
  await page.get('[data-ai-tab="vision"]').trigger('click')
  expect(page.find('local-vision-control-stub').exists()).toBe(true)
  expect(page.text()).toContain('AI 运行时')
  expect(page.text()).not.toContain('桥接：')
  expect(page.find('[data-ai-tab="stickers"]').exists()).toBe(true)
  page.unmount()
})

it('shows why an intelligent reply did not run', async () => {
  api.requests.mockResolvedValue({items:[{id:'r1',scope_kind:'qq_group',target_id:'100',sender_id:'1',
    status:'completed',send_status:'none',result_code:'ai_decision_timeout',created_at:'2026-11-01T00:00:00Z'}]})
  const page = mount(AiSettings, {props:{serviceId:'qq'}, global:{stubs:{AiChatProfiles:true}}})
  await flushPromises()
  await page.get('[data-ai-tab="requests"]').trigger('click')
  expect(page.get('[data-request="r1"]').text()).toContain('判定超时')
  page.unmount()
})

it('explains that accepted imports are finishing during a settings switch', async () => {
  api.status.mockResolvedValue({state:'applying',desired_version:4,applied_version:3,
    connected:true,last_error:'ai_sticker_queue_pending'})
  const page = mount(AiSettings, {props:{serviceId:'qq'}, global:{stubs:{AiChatProfiles:true}}})
  await flushPromises()
  expect(page.text()).toContain('正在等待已接收的表情导入完成')
  page.unmount()
})
