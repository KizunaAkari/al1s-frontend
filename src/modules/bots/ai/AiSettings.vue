<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import HelpHint from '../../../shared/ui/HelpHint.vue'
import AiChatProfiles from './AiChatProfiles.vue'
import BotSwitchRow from '../BotSwitchRow.vue'
import BotQqGroups from '../BotQqGroups.vue'
import AiStickerLibrary from './AiStickerLibrary.vue'
import LocalVisionControl from './LocalVisionControl.vue'
import { navigateBotTabs } from '../bot-console-model'
import { formatDateTime } from '../../../shared/presentation/format'
import {
  clearAiSession, fetchAiRequests, fetchAiSettings, fetchAiStatus, saveAiSettings, testAiProvider,
  type AiProviderView, type AiProviderWrite, type AiRequest, type AiRole,
  type AiSettingsRecord, type AiSettingsWrite, type AiSmartOptions, type AiStatus,
} from '../../../shared/api/bot-ai'

const props = defineProps<{ serviceId: string | null }>()
type AiSection = 'access' | 'groups' | 'profiles' | 'requests' | 'voice' | 'vision' | 'stickers'
const activeSection = ref<AiSection>('access')
const requestStatusLabels: Record<string, string> = {
  queued: '排队中', running: '处理中', stopping: '停止中', blocked: '等待恢复',
  completed: '已完成', failed: '失败', expired: '已过期', interrupted: '已中断', unknown: '状态未知',
}
const sendStatusLabels: Record<string, string> = {
  none: '未发送', ready: '待发送', sending: '发送中', sent: '已发送', failed: '发送失败', unknown: '发送状态未知',
}
const resultLabels: Record<string, string> = {
  ai_silent: '选择沉默', ai_coarse_skipped: '无需参与', ai_rate_limited: '参与频率限制',
  ai_decision_failed: '判定失败', ai_decision_provider_missing: '判定模型未配置',
  ai_decision_timeout: '判定超时', ai_decision_provider_error: '判定接口出错',
  ai_decision_json_invalid: '判定结果不是有效 JSON', ai_decision_schema_invalid: '判定结果字段无效',
  ai_media_unavailable: '图片或语音识别不可用',
}
type ProviderDraft = AiProviderWrite & { secret_configured: boolean }
type Draft = Omit<AiSettingsWrite, 'providers' | 'groups' | 'wake_words' | 'smart_reply' | 'smart_reply_groups'> & {
  groupsText: string; wakeWordsText: string; providers: Record<AiRole, ProviderDraft>
  smart_reply: AiSmartOptions; smart_reply_groups: string[]
}
const roles: { id: AiRole; label: string; adapters: { value: string; label: string }[] }[] = [
  { id: 'chat', label: '对话模型', adapters: [
    { value: 'openai_chat_completion', label: 'OpenAI 兼容 / DeepSeek' },
    { value: 'openai_responses', label: 'OpenAI Responses' },
    { value: 'googlegenai_chat_completion', label: 'Google Gemini' },
  ] },
  { id: 'vision', label: '图像识别', adapters: [
    { value: 'al1s_comfyui_vision', label: '本地 ComfyUI / Qwen3-VL' },
    { value: 'follow_chat', label: '使用对话模型' },
    { value: 'openai_chat_completion', label: 'OpenAI 兼容' },
    { value: 'openai_responses', label: 'OpenAI Responses' },
    { value: 'googlegenai_chat_completion', label: 'Google Gemini' },
  ] },
  { id: 'stt', label: '语音识别', adapters: [
    { value: 'openai_whisper_api', label: 'OpenAI 兼容转写' },
  ] },
  { id: 'tts', label: '语音合成', adapters: [
    { value: 'gemini_tts', label: 'Gemini TTS' },
    { value: 'openai_tts_api', label: 'OpenAI TTS' },
  ] },
]
const initialProvider = (role: AiRole, value?: AiProviderView): ProviderDraft => ({
  adapter_kind: value?.adapter_kind ?? (role === 'vision' ? 'follow_chat' : roles.find(item => item.id === role)!.adapters[0]!.value),
  model_id: value?.model_id ?? '', base_url: value?.base_url ?? '', voice: value?.voice ?? '',
  secret_configured: value?.secret_configured ?? false, secret_input: null, clear_secret: false,
  network_mode: value?.network_mode ?? 'direct',
})
const view = ref<AiSettingsRecord | null>(null)
const draft = ref<Draft | null>(null)
const status = ref<AiStatus | null>(null)
const requests = ref<AiRequest[]>([])
const busy = ref(false), error = ref(''), notice = ref(''), profileDirty = ref(false), stickerDirty = ref(false)
const stickerVisited = ref(false)
const groupEditor = ref<InstanceType<typeof BotQqGroups> | null>(null)
const selectedGroup = ref('')
const testBusy = ref<AiRole | null>(null)
const statusBusy = ref(false), statusMessage = ref('')
const clearScope = ref<'qq_group' | 'qq_private'>('qq_group'), clearTarget = ref('')
let generation = 0
let savedFingerprint = ''
let pending: { fingerprint: string; key: string } | null = null
const fingerprint = () => JSON.stringify(draft.value)
const generalUnsaved = computed(() => Boolean(draft.value && fingerprint() !== savedFingerprint))
const hasUnsaved = computed(() => generalUnsaved.value || profileDirty.value || stickerDirty.value || Boolean(groupEditor.value?.hasPending))
const authorizedGroups = computed(() => [...new Set((draft.value?.groupsText ?? '').split(/[\s,，]+/).filter(Boolean))])
watch(authorizedGroups, groups => {
  if (!groups.includes(selectedGroup.value)) selectedGroup.value = groups[0] ?? ''
}, { immediate: true })
const desiredVersion = computed(() => status.value?.desired_version ?? view.value?.desired_version ?? 0)
const appliedVersion = computed(() => status.value?.applied_version ?? view.value?.applied_version ?? 0)
const syncText = computed(() => !view.value ? '未连接' : status.value?.last_error ? '配置应用失败' :
  desiredVersion.value === 0 ? '尚未配置' : desiredVersion.value === appliedVersion.value ? '配置已同步' : '等待服务同步')
const engineText = computed(() => {
  if (!status.value) return '未知'
  if (status.value.last_error) return '配置应用失败'
  if (status.value.state === 'unavailable') return '不可用'
  if (status.value.state === 'applying') return '正在同步'
  if (!desiredVersion.value) return '未配置'
  if (!view.value?.enabled) return '已关闭'
  return status.value.connected ? '已连接' : '未连接'
})
defineExpose({ hasUnsaved })

function apply(value: AiSettingsRecord) {
  view.value = value
  draft.value = {
    enabled: value.enabled, event_ws_url: value.event_ws_url, allow_private: value.allow_private,
    groupsText: value.groups.join('\n'), reply_all_groups: [...(value.reply_all_groups ?? [])],
    smart_reply_groups: [...(value.smart_reply_groups ?? [])],
    smart_reply: {style:'context',min_interval_seconds:20,cooldown_seconds:30,window_seconds:120,
      max_replies:2,voice_enabled:false,stickers_enabled:true,collect_stickers:true,...(value.smart_reply ?? {})},
    wakeWordsText: value.wake_words.join('\n'), persona: value.persona,
    vision_enabled: value.vision_enabled, stt_enabled: value.stt_enabled, tts_mode: value.tts_mode,
    providers: {
      chat: initialProvider('chat', value.providers.chat), vision: initialProvider('vision', value.providers.vision),
      stt: initialProvider('stt', value.providers.stt), tts: initialProvider('tts', value.providers.tts),
    },
  }
  savedFingerprint = fingerprint()
}

async function refreshStatus(id: string, request = generation, manual = false) {
  if (manual && statusBusy.value) return
  if (manual) { statusBusy.value = true; statusMessage.value = '' }
  const [health, recent] = await Promise.allSettled([fetchAiStatus(id), fetchAiRequests(id)])
  if (request !== generation) return
  status.value = health.status === 'fulfilled' ? health.value : null
  requests.value = recent.status === 'fulfilled' ? recent.value.items : []
  if (manual) {
    statusBusy.value = false
    statusMessage.value = health.status === 'fulfilled' && recent.status === 'fulfilled' ? '状态已刷新' : '部分状态刷新失败，请重试'
  }
}
async function load(id: string | null) {
  const request = ++generation
  view.value = null; draft.value = null; status.value = null; requests.value = []
  pending = null; error.value = ''; notice.value = ''; statusBusy.value = false; statusMessage.value = ''
  profileDirty.value = false; stickerDirty.value = false; stickerVisited.value = false
  if (!id) return
  busy.value = true
  void refreshStatus(id, request)
  try { const value = await fetchAiSettings(id); if (request === generation) apply(value) }
  catch { if (request === generation) error.value = '读取 AI 配置失败，请检查 QQ 后台状态。' }
  finally { if (request === generation) busy.value = false }
}
watch(() => props.serviceId, id => { void load(id) }, { immediate: true })
onBeforeUnmount(() => { generation++ })

function payload(value: Draft): AiSettingsWrite {
  const providers: AiSettingsWrite['providers'] = {}
  for (const role of roles) {
    const p = value.providers[role.id]
    if (!p.model_id.trim() && p.adapter_kind !== 'follow_chat'
      && !p.secret_configured && !p.secret_input) continue
    if (role.id === 'vision' && p.adapter_kind === 'follow_chat' && !value.vision_enabled && !p.secret_configured) continue
    providers[role.id] = { adapter_kind: p.adapter_kind, model_id: p.model_id.trim(),
      base_url: p.base_url.trim(), voice: p.voice.trim(), secret_input: p.secret_input || null,
      clear_secret: p.clear_secret, network_mode: p.network_mode ?? 'direct' }
  }
  return {
    enabled: value.enabled, event_ws_url: value.event_ws_url?.trim() || null,
    allow_private: value.allow_private, groups: value.groupsText.split(/[\s,，]+/).filter(Boolean),
    reply_all_groups: value.reply_all_groups.filter(group => authorizedGroups.value.includes(group)),
    smart_reply_groups: value.smart_reply_groups.filter(group => authorizedGroups.value.includes(group)),
    smart_reply: {...value.smart_reply},
    wake_words: value.wakeWordsText.split(/\n/).map(word => word.trim()).filter(Boolean),
    persona: value.persona, vision_enabled: value.vision_enabled, stt_enabled: value.stt_enabled,
    tts_mode: value.tts_mode, providers,
  }
}
async function save() {
  if (!props.serviceId || !draft.value || !view.value || busy.value || profileDirty.value || stickerDirty.value) return
  if (groupEditor.value && !groupEditor.value.validatePending()) { activeSection.value = 'access'; return }
  const id = props.serviceId, request = generation, version = view.value.desired_version
  const value = payload(draft.value)
  const key = JSON.stringify({ version, value })
  if (!pending || pending.fingerprint !== key) pending = { fingerprint: key, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await saveAiSettings(id, value, version, pending.key)
    if (request === generation) {
      status.value = null; apply(result); pending = null
      notice.value = result.desired_version === result.applied_version ? '配置已同步' : '已保存，等待服务同步'
      void refreshStatus(id, request)
    }
  } catch (cause) { if (request === generation) error.value = cause instanceof Error ? cause.message : '保存失败' }
  finally { if (request === generation) busy.value = false }
}
function openSection(section: AiSection) {
  activeSection.value = section
  if (section === 'stickers') stickerVisited.value = true
}
function openGroup(group: string) { selectedGroup.value = group; openSection('groups') }
function groupMode(group: string): 'trigger' | 'all' | 'smart' {
  if (draft.value?.smart_reply_groups.includes(group)) return 'smart'
  return draft.value?.reply_all_groups.includes(group) ? 'all' : 'trigger'
}
function setGroupMode(group: string, mode: 'trigger' | 'all' | 'smart') {
  if (!draft.value) return
  draft.value.reply_all_groups = draft.value.reply_all_groups.filter(value => value !== group)
  draft.value.smart_reply_groups = draft.value.smart_reply_groups.filter(value => value !== group)
  if (mode === 'all') draft.value.reply_all_groups.push(group)
  if (mode === 'smart') draft.value.smart_reply_groups.push(group)
}
function removeGroup(group: string) {
  if (!draft.value) return
  setGroupMode(group, 'trigger')
}
function changeAdapter(role: AiRole) {
  if (role === 'vision' && draft.value?.providers.vision.adapter_kind === 'al1s_comfyui_vision') {
    const vision = draft.value.providers.vision
    vision.model_id = 'Qwen/Qwen3-VL-4B-Instruct'
    vision.base_url = vision.base_url || 'http://host.docker.internal:8188'
    vision.network_mode = 'direct'; vision.secret_input = null; vision.clear_secret = false
  }
}
async function testProvider(role: AiRole) {
  if (!props.serviceId || hasUnsaved.value || testBusy.value) { notice.value = '请先保存配置再测试。'; return }
  const id = props.serviceId, request = generation
  testBusy.value = role; error.value = ''; notice.value = ''
  try { const result = await testAiProvider(id, role); if (request === generation) notice.value = result.message || result.state }
  catch { if (request === generation) error.value = '模型测试失败，请核对配置和网络。' }
  finally { if (request === generation) testBusy.value = null }
}
function removeProvider(role: AiRole) {
  if (!draft.value || role === 'chat') return
  if ((role === 'vision' && draft.value.vision_enabled) || (role === 'stt' && draft.value.stt_enabled)
      || (role === 'tts' && draft.value.tts_mode !== 'off')) {
    notice.value = '请先关闭对应的图片或语音功能，再删除配置。'
    return
  }
  if (!window.confirm('删除这项模型配置？保存设置后生效。')) return
  draft.value.providers[role] = initialProvider(role)
  notice.value = '已移除配置，请保存设置。'
}
async function clearContext() {
  if (!props.serviceId || !clearTarget.value.trim() || busy.value) return
  if (!window.confirm('清空该会话的 AI 对话上下文？交易和表情数据不会删除。')) return
  const id = props.serviceId, request = generation
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await clearAiSession(id, clearScope.value, clearTarget.value.trim())
    if (request === generation) notice.value = result.state === 'cleared' ? '会话上下文已清空' : '清空请求未确认'
  } catch { if (request === generation) error.value = '无法清空上下文，请检查会话状态。' }
  finally { if (request === generation) busy.value = false }
}
</script>

<template>
  <div class="quant-settings ai-settings">
    <div class="ai-section-tabs" role="tablist" aria-label="AI 设置分区" @keydown="navigateBotTabs">
      <button v-for="section in ([['access', '通用设置'], ['groups', '群聊配置'], ['profiles', '角色记忆'], ['requests', '会话记录'], ['voice', '语音识别'], ['vision', '图像识别'], ['stickers', '表情图库']] as const)"
        :key="section[0]" :id="`ai-tab-${section[0]}`" type="button" role="tab" :data-ai-tab="section[0]" :aria-selected="activeSection === section[0]" :aria-controls="`ai-panel-${section[0]}`" :tabindex="activeSection === section[0] ? 0 : -1"
        :disabled="busy" @click="openSection(section[0])">{{ section[1] }}</button>
      <span v-if="hasUnsaved" class="ai-draft-indicator">有未保存的更改</span>
    </div>
    <div class="ai-statebar"><div class="quant-sync">{{ syncText }}</div>
    <div class="quant-health" aria-label="AI 服务状态">
      <span>对话引擎：{{ engineText }}</span><span>AI 运行时：{{ status?.connected ? '就绪' : '未就绪' }}</span>
      <span>配置：{{ desiredVersion }} / {{ appliedVersion }}</span>
      <span v-if="statusMessage" role="status">{{ statusMessage }}</span><button type="button" :disabled="!serviceId || statusBusy" @click="serviceId && refreshStatus(serviceId, generation, true)">{{ statusBusy ? '刷新中…' : '刷新状态' }}</button>
    </div></div>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="status?.last_error" class="bot-inline-error" role="status">{{ status.last_error === 'ai_proxy_unavailable' ? '现有代理不可用，AI 配置未应用；请检查容器代理。' : status.last_error === 'ai_proxy_credentials_unsupported' ? '现有代理含认证信息，暂不支持用于模型。' : status.last_error === 'ai_sticker_queue_pending' ? '正在等待已接收的表情导入完成。' : status.last_error === 'ai_vision_cleanup_pending' ? '正在等待视觉任务清理完成。' : '配置应用失败，AI 对话已暂停；系统会重试，请检查模型和地址后刷新状态。' }}</p>
    <template v-if="draft">
      <fieldset class="ai-content" :disabled="busy" :aria-busy="busy">
        <div id="ai-panel-access" v-show="activeSection === 'access'" class="ai-top-grid" role="tabpanel" aria-labelledby="ai-tab-access">
          <section v-show="activeSection === 'access'" class="quant-card bot-general-items" data-section="ai-basic">
            <div class="bot-switch-list">
              <BotSwitchRow v-model="draft.enabled" title="启用 AI 对话" description="允许在授权范围内使用 AI 对话。" />
              <BotSwitchRow v-model="draft.allow_private" title="允许私聊" description="允许在私聊中触发 AI 对话。" />
              <BotSwitchRow v-model="draft.stt_enabled" title="语音识别" description="将收到的语音转换为文本用于对话。" />
              <BotSwitchRow v-model="draft.vision_enabled" title="图像识别" description="允许 AI 处理消息中的图片。" />
            </div>
            <div class="bot-general-fields">
              <label class="bot-setting-line"><span class="bot-setting-text">QQ 事件 WebSocket 地址</span><input v-model="draft.event_ws_url" class="bot-setting-control" data-field="event-url" placeholder="ws://llbot:3001"></label>
              <BotQqGroups ref="groupEditor" v-model="draft.groupsText" :disabled="stickerDirty" clickable @removed="removeGroup" @selected="openGroup" />
              <label class="bot-setting-line"><span class="bot-setting-text">唤醒词<small>每行一个，留空时使用 @ 或回复触发</small></span><textarea v-model="draft.wakeWordsText" class="bot-setting-control" rows="2" /></label>
              <label class="bot-setting-line"><span class="bot-setting-text">语音回复方式</span><select v-model="draft.tts_mode" class="bot-setting-control"><option value="off">关闭</option><option value="voice_input">仅回复语音输入</option><option value="always">所有聊天回复</option></select></label>
            </div>
          </section>
          <section class="quant-card bot-general-items" data-section="ai-smart">
            <h3>智能参与</h3><p class="bot-help">频率和回复形式仅对智能参与群生效；表情回复开关适用于所有授权群。</p>
            <div class="bot-general-fields">
              <label class="bot-setting-line"><span class="bot-setting-text">回复形式</span><select v-model="draft.smart_reply.style" class="bot-setting-control"><option value="context">按语境选择组合</option><option value="random">随机组合可用形式</option></select></label>
              <label class="bot-setting-line"><span class="bot-setting-text">判断最小间隔（秒）</span><input v-model.number="draft.smart_reply.min_interval_seconds" class="bot-setting-control" type="number" min="0" max="3600"></label>
              <label class="bot-setting-line"><span class="bot-setting-text">回复冷却（秒）</span><input v-model.number="draft.smart_reply.cooldown_seconds" class="bot-setting-control" type="number" min="0" max="3600"></label>
              <label class="bot-setting-line"><span class="bot-setting-text">频率窗口（秒）</span><input v-model.number="draft.smart_reply.window_seconds" class="bot-setting-control" type="number" min="1" max="3600"></label>
              <label class="bot-setting-line"><span class="bot-setting-text">窗口内最多回复次数</span><input v-model.number="draft.smart_reply.max_replies" class="bot-setting-control" type="number" min="1" max="50"></label>
            </div>
            <div class="bot-switch-list">
              <BotSwitchRow v-model="draft.smart_reply.stickers_enabled" title="表情回复" description="允许 AI 对话在授权群中使用表情回复。" />
              <BotSwitchRow v-model="draft.smart_reply.voice_enabled" title="语音参与组合" description="将语音纳入智能参与的回复形式。" :disabled="draft.tts_mode === 'off'" />
            </div>
            <small v-if="draft.tts_mode === 'off'" class="bot-help">语音回复已关闭，组合只使用文字和表情。</small>
          </section>
        </div>
        <div id="ai-panel-groups" v-show="activeSection === 'groups'" role="tabpanel" aria-labelledby="ai-tab-groups">
          <section class="quant-card bot-general-items ai-group-card" data-section="ai-group-config">
            <div class="bot-general-fields" v-if="authorizedGroups.length">
              <label class="bot-setting-line ai-group-select-row"><span class="bot-setting-text">选择群聊<small>选择已授权的群进行配置。</small></span><select v-model="selectedGroup" class="bot-setting-control" data-ai-group-select><option v-for="group in authorizedGroups" :key="group" :value="group">{{ group }}</option></select></label>
              <div class="bot-setting-line"><span class="bot-setting-text">触发模式 <HelpHint subject="群聊参与方式" content="按触发：收到 @、唤醒词或回复时参与。逐条回复：按顺序处理消息。智能参与：合并同一人的短消息，即使被 @ 也可以保持沉默。" /><small>按触发、逐条回复或智能参与。</small></span>
                <div class="ai-group-modes" role="radiogroup" :aria-label="`群 ${selectedGroup} 的参与方式`">
                  <label><input type="radio" :name="`ai-group-${selectedGroup}`" :checked="groupMode(selectedGroup) === 'trigger'" :data-group-mode="`${selectedGroup}-trigger`" @change="setGroupMode(selectedGroup, 'trigger')"><span>按触发</span></label>
                  <label><input type="radio" :name="`ai-group-${selectedGroup}`" :checked="groupMode(selectedGroup) === 'all'" :data-group-mode="`${selectedGroup}-all`" @change="setGroupMode(selectedGroup, 'all')"><span>逐条回复</span></label>
                  <label><input type="radio" :name="`ai-group-${selectedGroup}`" :checked="groupMode(selectedGroup) === 'smart'" :data-group-mode="`${selectedGroup}-smart`" @change="setGroupMode(selectedGroup, 'smart')"><span>智能参与</span></label>
                </div>
              </div>
            </div>
            <p v-else class="ai-group-empty">添加授权群后，可在这里设置参与方式。</p>
          </section>
        </div>
        <AiChatProfiles v-if="serviceId" id="ai-panel-profiles" v-show="activeSection === 'profiles'" role="tabpanel" aria-labelledby="ai-tab-profiles" :service-id="serviceId" :version="view?.desired_version ?? 0"
              :enabled="view?.enabled ?? false" :synchronized="desiredVersion > 0 && desiredVersion === appliedVersion"
              :blocked="busy || generalUnsaved" @changed="serviceId && load(serviceId)" @dirty="profileDirty = $event" />
        <div v-if="activeSection === 'voice' || activeSection === 'vision'" :id="`ai-panel-${activeSection}`" class="ai-media-providers" data-section="ai-providers" role="tabpanel" :aria-labelledby="`ai-tab-${activeSection}`">
            <p class="bot-help">各能力可选择不同服务。密钥保存后不回显；留空保持原密钥。</p>
            <fieldset v-for="role in roles.filter(item => activeSection === 'vision' ? item.id === 'vision' : item.id === 'stt' || item.id === 'tts')" :key="role.id" :data-role="role.id">
              <legend>{{ role.label }}</legend>
              <div class="quant-fields ai-provider-fields">
                <label>接口类型<select v-model="draft.providers[role.id].adapter_kind" data-field="adapter" @change="changeAdapter(role.id)"><option v-for="item in role.adapters" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label v-if="draft.providers[role.id].adapter_kind !== 'follow_chat'">模型 ID<input v-model="draft.providers[role.id].model_id" data-field="model" placeholder="填写服务商提供的模型 ID"></label>
                <label v-if="draft.providers[role.id].adapter_kind !== 'follow_chat'">API 地址<input v-model="draft.providers[role.id].base_url" data-field="base-url" placeholder="留空使用服务商默认地址"></label>
                <label v-if="!['follow_chat', 'al1s_comfyui_vision'].includes(draft.providers[role.id].adapter_kind)">网络环境<select v-model="draft.providers[role.id].network_mode" data-field="network"><option value="direct">直连</option><option value="proxy">使用现有代理</option></select></label>
                <small v-else-if="draft.providers[role.id].adapter_kind === 'follow_chat'">网络环境跟随当前对话模型</small>
                <small v-else>直连本机 ComfyUI，无需 API 密钥；离线时不会切换云端。</small>
                <label v-if="role.id === 'tts'">音色<input v-model="draft.providers[role.id].voice" data-field="voice"></label>
                <label v-if="!['follow_chat', 'al1s_comfyui_vision'].includes(draft.providers[role.id].adapter_kind)"><span>API 密钥 <small>{{ draft.providers[role.id].secret_configured ? '已保存' : '未保存' }}</small></span>
                  <input v-model="draft.providers[role.id].secret_input" data-field="secret" type="password" autocomplete="new-password" placeholder="留空保持原密钥">
                </label>
                <label v-if="draft.providers[role.id].secret_configured && !['follow_chat', 'al1s_comfyui_vision'].includes(draft.providers[role.id].adapter_kind)" class="ai-clear-secret"><input v-model="draft.providers[role.id].clear_secret" type="checkbox"> 清除已保存的密钥</label>
                <LocalVisionControl v-if="role.id === 'vision' && draft.providers.vision.adapter_kind === 'al1s_comfyui_vision' && activeSection === 'vision'"
                  :service-id="props.serviceId ?? undefined" :vision-enabled="view?.vision_enabled ?? false"
                  :syncing="desiredVersion !== appliedVersion" />
                <div class="ai-provider-actions">
                  <button type="button" :disabled="busy || Boolean(testBusy)" @click="testProvider(role.id)">测试{{ role.label }}</button>
                  <button v-if="draft.providers[role.id].secret_configured || draft.providers[role.id].model_id" type="button"
                    :data-action="`delete-${role.id}`" @click="removeProvider(role.id)">删除此配置</button>
                </div>
              </div>
            </fieldset>
        </div>
        <AiStickerLibrary v-if="serviceId && stickerVisited" id="ai-panel-stickers" v-show="activeSection === 'stickers'"
          role="tabpanel" aria-labelledby="ai-tab-stickers" :service-id="serviceId" :groups="authorizedGroups"
          :enabled="view?.enabled ?? false" :synchronized="desiredVersion > 0 && desiredVersion === appliedVersion"
          :blocked="busy || generalUnsaved || profileDirty" @dirty="stickerDirty = $event" />
        <div v-show="activeSection === 'access' || activeSection === 'groups' || activeSection === 'voice' || activeSection === 'vision' || generalUnsaved" class="ai-save" :class="{ 'bot-general-save': activeSection === 'access' || activeSection === 'groups' }"><span>{{ profileDirty ? '请先保存或放弃人格修改' : stickerDirty ? '请先保存或取消表情编辑' : hasUnsaved ? '有未保存的更改' : '配置无未保存更改' }} · 保存全部 AI 常规设置</span><button type="button" class="bot-save-button" data-action="save-ai-settings" :disabled="busy || profileDirty || stickerDirty" @click="save">{{ busy ? '保存中…' : '保存' }}</button></div>
        <section id="ai-panel-requests" v-show="activeSection === 'requests'" class="quant-card" data-section="ai-requests" role="tabpanel" aria-labelledby="ai-tab-requests">
          <h3>最近请求</h3>
          <p v-if="!requests.length" class="bot-help">暂无请求记录</p>
          <div v-for="item in requests" :key="item.id" class="ai-request-row" :data-request="item.id">
            <time :datetime="item.created_at">{{ formatDateTime(item.created_at) }}</time>
            <span>{{ item.scope_kind === 'qq_group' ? '群聊' : '私聊' }} {{ item.target_id }}</span>
            <span>{{ requestStatusLabels[item.status] ?? item.status }} · {{ sendStatusLabels[item.send_status] ?? item.send_status }}</span>
            <span v-if="item.result_code">{{ resultLabels[item.result_code] ?? item.result_code }}</span>
          </div>
          <div class="ai-clear"><label>清空会话<select v-model="clearScope"><option value="qq_group">群聊</option><option value="qq_private">私聊</option></select></label><label>群号或 QQ 号<input v-model="clearTarget" inputmode="numeric"></label><button type="button" :disabled="busy || !clearTarget" @click="clearContext">清空上下文</button></div>
        </section>
      </fieldset>
    </template>
  </div>
</template>

<style scoped>
.ai-settings { min-width:0; }
.ai-section-tabs { display:flex; align-items:center; gap:8px; padding:0 24px; border-bottom:1px solid var(--border); overflow-x:auto; }
.ai-section-tabs button { flex:none; border:0; border-radius:0; border-bottom:2px solid transparent; padding:12px 10px; color:var(--muted); background:transparent; }
.ai-section-tabs button[aria-selected='true'] { color:var(--accent); border-bottom-color:var(--accent); font-weight:700; }
.ai-draft-indicator { margin-left:auto; color:var(--muted); font-size:12px; white-space:nowrap; }
.ai-settings p { margin:0; }
.quant-sync { color:var(--muted); font-size:13px; }
.quant-health,.quant-card,.ai-save { min-width:0; padding:18px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
.quant-health { display:flex; align-items:center; flex-wrap:wrap; gap:16px; font-size:13px; }
.quant-health button { margin-left:auto; }
.ai-settings>p { margin:12px 26px 0; }
.ai-content { display:grid; gap:14px; min-width:0; margin:0; padding:18px 26px; border:0; }
.ai-top-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:start; }
.ai-group-card { container-type:inline-size; }
.ai-settings .ai-group-card .ai-group-select-row { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.ai-settings .ai-group-card .ai-group-select-row select { flex:none; width:min(100%, 280px); }
.ai-group-heading,.ai-group-title { display:flex; align-items:center; gap:8px; }
.ai-group-heading { justify-content:space-between; gap:12px; margin-bottom:6px; }
.ai-group-card .ai-group-heading h3 { margin:0; }
.ai-group-count { color:var(--muted); font-size:12px; white-space:nowrap; }
.ai-group-list { display:grid; max-height:440px; overflow:auto; scrollbar-width:thin; }
.ai-group-row { display:grid; grid-template-columns:minmax(110px,1fr) minmax(236px,auto); align-items:center; gap:16px; padding:14px 0; border-bottom:1px solid var(--border); }
.ai-group-row:last-child { border-bottom:0; padding-bottom:0; }
.ai-group-identity { display:flex; align-items:center; gap:10px; font-size:14px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.ai-group-mark { display:grid; place-items:center; width:28px; height:28px; flex:none; border-radius:8px; color:var(--muted); background:var(--surface-soft); font-weight:500; }
.ai-group-modes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; padding:4px; border:1px solid var(--border); border-radius:10px; background:var(--surface-soft); }
.ai-group-modes label { position:relative; display:block; min-width:0; cursor:pointer; }
.ai-group-modes input { position:absolute; width:1px; height:1px; margin:0; padding:0; border:0; overflow:hidden; clip-path:inset(50%); }
.ai-group-modes span { display:block; padding:8px 10px; border-radius:7px; color:var(--muted); text-align:center; font-size:13px; line-height:20px; white-space:nowrap; transition:background .15s,color .15s,box-shadow .15s; }
.ai-group-modes label:hover span { color:var(--text); }
.ai-group-modes input:checked + span { color:var(--accent); background:var(--surface); box-shadow:0 1px 4px rgb(25 55 95 / 12%); font-weight:600; }
.ai-group-modes input:focus-visible + span { outline:2px solid var(--accent); outline-offset:1px; }
.ai-group-modes input:disabled + span { opacity:.55; cursor:not-allowed; }
.ai-group-empty { margin:16px 0 0; color:var(--muted); font-size:13px; }
@container (max-width:420px) {
  .ai-group-row { grid-template-columns:minmax(0,1fr); gap:10px; }
}
.ai-media-providers { display:grid; gap:14px; min-width:0; }
.ai-media-providers>fieldset { min-width:0; margin:0; padding:16px; border:1px solid var(--border); border-radius:8px; }
.ai-media-providers legend { padding:0 6px; font-weight:600; }
.quant-card h3 { margin:0 0 6px; font-size:17px; }
.quant-card>.bot-help { margin:0 0 18px; }
.quant-switches { display:flex; flex-wrap:wrap; gap:24px; margin:20px 0; }
.quant-switches label { display:flex; align-items:center; gap:12px; font-size:13px; }
.quant-switches input { appearance:none; position:relative; width:44px; height:24px; margin:0; border:1px solid var(--border-strong); border-radius:20px; background:var(--border-strong); cursor:pointer; }
.quant-switches input::after { content:''; position:absolute; width:18px; height:18px; top:2px; left:2px; border-radius:50%; background:#fff; transition:transform .15s; }
.quant-switches input:checked { background:var(--accent); border-color:var(--accent); }
.quant-switches input:checked::after { transform:translateX(20px); }
.quant-switches input:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.quant-fields { display:grid; gap:14px; }
.quant-fields label,.ai-clear label { display:grid; align-content:start; gap:6px; min-width:0; font-size:13px; }
.quant-fields input:not([type=checkbox]),.quant-fields textarea,.quant-fields select,.ai-clear input,.ai-clear select { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--border-strong); border-radius:5px; background:var(--surface); color:var(--text); font:inherit; }
.quant-fields input:not([type=checkbox]),.quant-fields select,.ai-clear input,.ai-clear select { height:38px; }
.quant-fields small { color:var(--muted); overflow-wrap:anywhere; }
.ai-clear-secret input { accent-color:var(--accent); }
.ai-provider-grid fieldset { min-width:0; margin:0; padding:16px; border:1px solid var(--border); border-radius:8px; }
.ai-provider-grid legend { padding:0 6px; font-weight:600; }
.ai-provider-fields { grid-template-columns:repeat(2,minmax(0,1fr)); }
.quant-fields .ai-clear-secret { display:flex; align-items:center; gap:8px; }
.ai-settings button { border:1px solid var(--border-strong); border-radius:5px; padding:8px 11px; color:var(--accent); background:var(--surface); cursor:pointer; font:inherit; font-size:13px; white-space:nowrap; }
.ai-settings button:disabled { color:var(--muted); cursor:not-allowed; opacity:.55; }
.ai-settings .ai-section-tabs button { flex:none; border:0; border-radius:0; border-bottom:2px solid transparent; padding:12px 10px; color:var(--muted); background:transparent; }
.ai-settings .ai-section-tabs button[aria-selected='true'] { color:var(--accent); border-bottom-color:var(--accent); font-weight:700; }
.ai-settings .ai-section-tabs button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.ai-settings .ai-section-tabs { box-sizing:border-box; height:52px; gap:0; padding:9px 26px; }
.ai-settings .ai-section-tabs button { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; height:32px; padding:0 16px; border:0; border-radius:4px; background:transparent; color:var(--muted); font:inherit; font-size:14px; line-height:20px; font-weight:400; }
.ai-settings .ai-section-tabs button[aria-selected='true'] { color:var(--accent); background:var(--surface-soft); font-weight:600; }
.ai-statebar { display:flex; align-items:center; gap:12px; padding:10px 26px 0; }
.ai-statebar .quant-health { flex:1; padding:8px 12px; }
.ai-save { position:sticky; bottom:0; z-index:1; }
.ai-provider-actions { grid-column:1 / -1; display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.ai-save { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; }
.ai-save button { color:#fff; background:var(--accent); border-color:var(--accent); }
.ai-request-row { display:grid; grid-template-columns:minmax(135px,auto) minmax(120px,1fr) auto; gap:8px 16px; padding:10px 0; border-bottom:1px solid var(--border); font-size:13px; overflow-wrap:anywhere; }
.ai-request-row time { color:var(--muted); }
.ai-clear { display:flex; align-items:end; gap:12px; flex-wrap:wrap; margin-top:16px; }
.ai-clear label { flex:1 1 160px; }
@container bot-workspace (max-width:1282px) { .ai-top-grid,.ai-provider-grid { grid-template-columns:1fr; } .ai-content,.ai-settings .ai-section-tabs { padding-inline:16px; } }
@container bot-workspace (max-width:650px) { .ai-provider-fields { grid-template-columns:1fr; } .ai-save { flex-wrap:wrap; } .ai-request-row { grid-template-columns:1fr; gap:3px; } }
@media (max-width:1000px) { .ai-top-grid,.ai-provider-grid { grid-template-columns:1fr; } }
@media (max-width:600px) { .ai-provider-fields { grid-template-columns:1fr; } .ai-save { flex-wrap:wrap; } .ai-request-row { grid-template-columns:1fr; gap:3px; } }
</style>
