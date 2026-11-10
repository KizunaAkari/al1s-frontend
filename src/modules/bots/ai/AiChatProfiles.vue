<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CharacterCardImport from './CharacterCardImport.vue'
import BotSwitchRow from '../BotSwitchRow.vue'
import { personaLength } from './character-card'
import {
  deleteAiChatProfile, fetchAiChatProfiles, saveAiChatProfile, testAiChatProfile,
  type AiChatProfileView, type AiChatProfileWrite,
} from '../../../shared/api/bot-ai'

const props = defineProps<{ serviceId: string; version: number; enabled: boolean; synchronized: boolean; blocked: boolean }>()
const emit = defineEmits<{ changed: []; dirty: [value: boolean] }>()
const profiles = ref<AiChatProfileView[]>([])
const selected = ref<string | null>(null)
const draft = ref<AiChatProfileWrite | null>(null)
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const importingCard = ref(false)
let generation = 0, saved = ''
let pending: { fingerprint: string; key: string } | null = null
const current = computed(() => profiles.value.find(item => item.id === selected.value))
const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== saved))
watch(dirty, value => emit('dirty', value), { immediate: true })

function apply(profile: AiChatProfileView | null) {
  importingCard.value = false
  selected.value = profile?.id ?? crypto.randomUUID()
  draft.value = profile ? {
    name: profile.name, description: profile.description, persona: profile.persona,
    adapter_kind: profile.adapter_kind, model_id: profile.model_id, base_url: profile.base_url,
    supports_vision: profile.supports_vision, is_default: profile.is_default, network_mode: profile.network_mode ?? 'direct',
    secret_input: null, clear_secret: false,
  } : {
    name: '', description: '', persona: '', adapter_kind: 'openai_chat_completion', model_id: '',
    base_url: '', supports_vision: false, is_default: profiles.value.length === 0, network_mode: 'direct',
    secret_input: null, clear_secret: false,
  }
  saved = profile ? JSON.stringify(draft.value) : ''
  pending = null; error.value = ''; notice.value = ''
}

async function load(serviceId: string) {
  const request = ++generation
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const rows = await fetchAiChatProfiles(serviceId)
    if (request !== generation) return
    profiles.value = rows
    const initial = rows.find(item => item.id === selected.value) ?? rows.find(item => item.is_default) ?? rows[0]
    if (initial) apply(initial)
    else { selected.value = null; draft.value = null; saved = '' }
  } catch {
    if (request === generation) error.value = '读取已保存的对话模型失败。'
  } finally {
    if (request === generation) loading.value = false
  }
}
watch(() => props.serviceId, id => { profiles.value = []; selected.value = null; draft.value = null; void load(id) }, { immediate: true })

function choose(profile: AiChatProfileView | null) {
  if (dirty.value && !window.confirm('当前人格有未保存的修改，放弃这些修改并切换吗？')) return
  apply(profile)
}

function applyCharacterCard(value: { name: string; persona: string }) {
  if (!draft.value || loading.value || busy.value || props.blocked) return
  if ((draft.value.name || draft.value.persona) && !window.confirm('将角色卡名称和设定应用到当前草稿？模型与密钥保持，保存后才生效。')) return
  draft.value.name = value.name
  draft.value.persona = value.persona
  importingCard.value = false
  notice.value = '角色卡已应用到草稿，请检查名称和设定后保存。'
}

async function save() {
  if (!selected.value || !draft.value || props.blocked || busy.value) return
  if (!draft.value.name.trim() || !draft.value.model_id.trim()) {
    error.value = '请填写人格名称和模型 ID。'
    return
  }
  if (personaLength(draft.value.persona) > 12000) { error.value = '人格设定不能超过 12,000 字符。'; return }
  const serviceId = props.serviceId, request = generation, profileId = selected.value
  const value = { ...draft.value, name: draft.value.name.trim(), model_id: draft.value.model_id.trim(),
    base_url: draft.value.base_url.trim(), secret_input: draft.value.secret_input || null }
  const fingerprint = JSON.stringify({ serviceId, profileId, version: props.version, value })
  if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await saveAiChatProfile(serviceId, profileId, value, props.version, pending.key)
    if (request === generation) { saved = JSON.stringify(draft.value); pending = null; emit('changed') }
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : '保存人格失败。'
  } finally { if (request === generation) busy.value = false }
}

async function remove() {
  const profile = current.value
  if (!profile || props.blocked || busy.value) return
  if (profile.is_default && profiles.value.length > 1) { error.value = '请先将其他人格设为默认。'; return }
  if (profile.is_default && props.enabled) { error.value = '请先关闭 AI 对话，再删除最后一个人格。'; return }
  if (!window.confirm(`删除“${profile.name}”？正在使用它的会话会回到默认人格。`)) return
  const serviceId = props.serviceId, request = generation
  const fingerprint = JSON.stringify({ serviceId, profileId: profile.id, version: props.version, action: 'delete' })
  if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await deleteAiChatProfile(serviceId, profile.id, props.version, pending.key)
    if (request === generation) { saved = JSON.stringify(draft.value); pending = null; emit('changed') }
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : '删除人格失败。'
  } finally { if (request === generation) busy.value = false }
}

async function test() {
  if (!current.value || props.blocked || busy.value) return
  if (dirty.value) { notice.value = '请先保存当前人格再测试。'; return }
  if (!props.enabled || !props.synchronized) { notice.value = '请先启用 AI 对话并等待配置同步。'; return }
  if (!current.value.secret_configured && !current.value.is_default) { notice.value = '请先为该人格配置密钥。'; return }
  const serviceId = props.serviceId, request = generation, profileId = current.value.id
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await testAiChatProfile(serviceId, profileId)
    if (request === generation) notice.value = result.message || result.state
  } catch { if (request === generation) error.value = '模型测试失败，请核对配置和网络。' }
  finally { if (request === generation) busy.value = false }
}
</script>

<template>
  <fieldset class="chat-profiles" data-section="ai-chat-profiles" :disabled="loading || busy || blocked">
    <div class="profile-layout">
    <aside class="profile-sidebar">
      <div class="profile-sidebar-heading"><h3>人格 <small>{{ profiles.length }}</small></h3><button type="button" class="profile-add" data-action="add-profile" @click="choose(null)">＋ 新增人格</button></div>
      <div class="profile-list" aria-label="已保存的对话模型">
      <button v-for="item in profiles" :key="item.id" type="button" class="profile-item"
        :class="{ active: selected === item.id }" :aria-pressed="selected === item.id" :data-profile="item.id" @click="choose(item)">
        <strong>{{ item.name }}</strong><span>{{ item.model_id }} · {{ item.adapter_kind === 'googlegenai_chat_completion' ? 'Gemini' : 'OpenAI 兼容' }}</span>
        <span v-if="item.description">{{ item.description }}</span><small>{{ item.is_default ? '默认' : '可切换' }} · {{ item.supports_vision ? '支持图片' : '不支持图片' }} · {{ item.secret_configured ? '密钥已保存' : '未配置密钥' }} · {{ item.network_mode === 'proxy' ? '现有代理' : '直连' }}</small>
      </button>
      </div>
      <p class="profile-help">QQ 指令：切换人格 名称<br>同一群共享选择，私聊各自独立。</p>
    </aside>
    <section class="profile-detail">
    <header class="profile-detail-heading"><div><h3>{{ current?.name || '新人格' }} <small v-if="current?.is_default">默认人格</small></h3><p class="profile-help">编辑当前人格的模型与设定</p></div>
      <button type="button" data-action="test-profile" :disabled="!current" @click="test">测试模型</button></header>
    <p v-if="blocked" class="profile-help">请先保存未完成的 AI 常规设置。</p>
    <p v-if="error" role="alert" class="profile-error">{{ error }}</p>
    <p v-if="notice" role="status" class="profile-help">{{ notice }}</p>
    <div v-if="draft" class="profile-fields">
      <label>人格名称<input v-model="draft.name" data-field="profile-name" maxlength="32" placeholder="例如：大肥鱼"></label>
      <label>特点说明<input v-model="draft.description" data-field="profile-description" maxlength="500" placeholder="例如：擅长日常对话"></label>
      <label>接口类型<select v-model="draft.adapter_kind" data-field="profile-adapter"><option value="openai_chat_completion">OpenAI 兼容 / DeepSeek</option><option value="openai_responses">OpenAI Responses</option><option value="googlegenai_chat_completion">Google Gemini</option></select></label>
      <label>模型 ID<input v-model="draft.model_id" data-field="profile-model" placeholder="填写服务商提供的模型 ID"></label>
      <label>API 地址<input v-model="draft.base_url" data-field="profile-base-url" placeholder="留空使用服务商默认地址"></label>
      <label>网络环境<select v-model="draft.network_mode" data-field="profile-network"><option value="direct">直连</option><option value="proxy">使用现有代理</option></select></label>
      <label>API 密钥 <small>{{ current?.secret_configured ? '已保存' : '未保存' }}</small><input v-model="draft.secret_input" data-field="profile-secret" type="password" autocomplete="new-password" placeholder="留空保持原密钥"></label>
      <div class="profile-wide profile-persona-heading"><span>人格设定 <small>{{ personaLength(draft.persona).toLocaleString() }} / 12,000</small></span>
        <button type="button" data-action="open-card-import" @click="importingCard = !importingCard">导入角色卡</button></div>
      <CharacterCardImport v-if="importingCard" :key="`${serviceId}:${selected}`" class="profile-wide"
        :context-key="`${serviceId}:${selected}`" :disabled="loading || busy || blocked" @apply="applyCharacterCard" @cancel="importingCard = false" />
      <label class="profile-wide"><span class="profile-sr-only">人格设定</span><textarea v-model="draft.persona" data-field="profile-persona" rows="7" maxlength="12000" placeholder="描述这个人格的说话方式和特点" /></label>
      <div class="bot-switch-list profile-wide">
        <BotSwitchRow v-model="draft.supports_vision" title="支持图片输入" description="标记该模型支持图片输入。" data-field="profile-vision" />
        <BotSwitchRow v-model="draft.is_default" title="默认人格" description="将该人格作为默认使用的人格。" data-field="profile-default" :disabled="current?.is_default" />
      </div>
      <label v-if="current?.secret_configured" class="profile-toggle"><input v-model="draft.clear_secret" data-field="profile-clear-secret" type="checkbox"> 清除已保存的密钥</label>
      <div class="profile-actions profile-wide">
        <button type="button" data-action="delete-profile" :disabled="!current" @click="remove">删除此配置</button>
        <span>{{ dirty ? '当前人格有未保存更改' : '当前人格无未保存更改' }}</span>
        <button type="button" data-action="save-profile" @click="save">保存</button>
      </div>
    </div>
    </section>
    </div>
  </fieldset>
</template>

<style scoped>
.chat-profiles { min-width:0; margin:0; padding:0; border:0; }
.profile-layout { display:grid; grid-template-columns:250px minmax(0,1fr); gap:14px; align-items:stretch; }
.profile-sidebar,.profile-detail { min-width:0; padding:16px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
.profile-sidebar { display:flex; flex-direction:column; gap:12px; }
.profile-sidebar-heading,.profile-detail-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.profile-sidebar-heading h3,.profile-detail-heading h3 { margin:0; font-size:18px; }
.profile-sidebar-heading small,.profile-detail-heading small { color:var(--muted); font-size:12px; }
.profile-sidebar>.profile-help { margin-top:auto; padding:12px; border-radius:6px; background:var(--surface-soft); }
.profile-detail-heading { margin-bottom:16px; }
.profile-detail-heading .profile-help { margin:5px 0 0; }
.chat-profiles legend { padding:0 6px; font-weight:600; }
.profile-help { margin:0 0 12px; color:var(--muted); font-size:12px; }
.profile-error { color:var(--danger, #d33); font-size:13px; }
.chat-profiles button { border:1px solid var(--border-strong); border-radius:5px; padding:8px 11px; color:var(--accent); background:var(--surface); cursor:pointer; font:inherit; font-size:13px; }
.chat-profiles button:disabled { color:var(--muted); cursor:not-allowed; opacity:.55; }
.chat-profiles button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.profile-list { display:grid; gap:8px; }
.profile-list button { display:grid; gap:4px; text-align:left; white-space:normal; }
.profile-list .profile-item { flex:1 1 180px; min-width:0; padding:11px 12px; color:var(--text); }
.profile-item.active { border-color:var(--accent); background:var(--surface-soft); }
.profile-list .profile-add { display:flex; align-items:center; justify-content:center; min-height:50px; border-style:dashed; }
.profile-item span,.profile-item small { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.profile-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.profile-fields label { display:grid; align-content:start; gap:6px; min-width:0; font-size:13px; }
.profile-fields input:not([type=checkbox]),.profile-fields textarea,.profile-fields select { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--border-strong); border-radius:5px; background:var(--surface); color:var(--text); font:inherit; }
.profile-fields input:not([type=checkbox]),.profile-fields select { height:38px; }
.profile-fields small { color:var(--muted); }
.profile-fields .profile-toggle { display:flex; align-items:center; gap:8px; }
.profile-toggle input { accent-color:var(--accent); }
.profile-fields textarea { min-height:180px; resize:vertical; }
.profile-wide { grid-column:1 / -1; }
.profile-persona-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.profile-persona-heading small { margin-left:8px; color:var(--muted); font-size:12px; }
.profile-sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.profile-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding-top:12px; border-top:1px solid var(--border); }
.profile-actions span { margin-left:auto; color:var(--muted); font-size:12px; }
.profile-actions [data-action='save-profile'] { color:#fff; background:var(--accent); border-color:var(--accent); }
@container bot-workspace (max-width:850px) { .profile-layout { grid-template-columns:1fr; } .profile-sidebar>.profile-help { margin:0; } }
@container bot-workspace (max-width:650px) { .profile-fields { grid-template-columns:1fr; } .profile-wide { grid-column:auto; } }
@media (max-width:600px) { .profile-fields { grid-template-columns:1fr; } }
</style>
