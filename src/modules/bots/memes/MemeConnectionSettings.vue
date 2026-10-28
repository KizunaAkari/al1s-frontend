<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createMemeApi, type MemeSettings, type MemeScope } from '../../../shared/api/memes'
const props = defineProps<{ serviceId: string; kind: 'qq' | 'discord'; expanded?: boolean; consoleMode?: boolean; connectionName?: string }>()
const open = ref(false), loading = ref(false), busy = ref(false), hasLoaded = ref(false), hasSaved = ref(false)
const enabled = ref(false), privateEnabled = ref(false), eventUrl = ref(''), cooldown = ref(5), scopeText = ref('')
const error = ref(''), notice = ref(''), savedEnabled = ref<boolean | null>(null)
const scopeEntry = ref(''), adding = ref(false), bulk = ref(false), loadedFingerprint = ref('')
let version = 0, generation = 0, destroyed = false
let pending: { fingerprint: string; key: string } | undefined
const entries = computed(() => scopeText.value.split(/[\n,，]+/).map(value => value.trim()).filter(Boolean))
function fingerprint() { return JSON.stringify([enabled.value, privateEnabled.value, eventUrl.value, cooldown.value, scopeText.value]) }
const dirty = computed(() => hasLoaded.value && (fingerprint() !== loadedFingerprint.value || Boolean(scopeEntry.value.trim())))
async function loadSettings() {
  const current = ++generation, identity = props.serviceId
  loading.value = true; hasLoaded.value = false; error.value = ''; notice.value = ''
  try {
    const value = await createMemeApi(props.kind).fetchMemeSettings(identity)
    if (destroyed || current !== generation || props.serviceId !== identity) return
    version = value.row_version
    enabled.value = value.enabled; privateEnabled.value = value.private_enabled
    eventUrl.value = value.qq_event_ws_url ?? ''; cooldown.value = value.cooldown_seconds
    scopeText.value = value.scopes.map(scope => props.kind === 'qq' ? scope.target_id : `${scope.guild_id ?? ''}/${scope.target_id}`).join('\n')
    scopeEntry.value = ''; loadedFingerprint.value = fingerprint(); pending = undefined
    savedEnabled.value = value.enabled; hasSaved.value = version > 0; hasLoaded.value = true
  } catch (cause) { if (!destroyed && current === generation) error.value = cause instanceof Error ? cause.message : '表情配置读取失败' }
  finally { if (!destroyed && current === generation) loading.value = false }
}
async function show() {
  if (busy.value) return
  open.value = !open.value
  if (!open.value) { ++generation; loading.value = false; return }
  await loadSettings()
}
function parseScope(value: string): MemeScope {
  if (props.kind === 'qq') {
    if (!/^[1-9]\d{0,19}$/.test(value)) throw new Error('请填写有效QQ群号，每行一个')
    return { kind: 'qq_group', target_id: value, guild_id: null }
  }
  if (!/^[1-9]\d{16,19}\/[1-9]\d{16,19}$/.test(value)) throw new Error('Discord范围请按“服务器ID/频道ID”填写，每行一组')
  const [guild, channel] = value.split('/')
  return { kind: 'discord_channel', target_id: channel!, guild_id: guild! }
}
function scopes() { return entries.value.map(parseScope) }
function addScope() {
  error.value = ''
  try {
    const value = scopeEntry.value.trim(); parseScope(value)
    if (entries.value.includes(value)) throw new Error('此范围已经添加。')
    if (entries.value.length >= 100) throw new Error('最多配置100个允许范围。')
    scopeText.value = [...entries.value, value].join('\n'); scopeEntry.value = ''; adding.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '范围格式无效' }
}
function removeScope(index: number) { scopeText.value = entries.value.filter((_, at) => at !== index).join('\n') }
async function save() {
  if (loading.value || busy.value || !hasLoaded.value) return
  const current = generation, identity = props.serviceId
  error.value = ''; notice.value = ''
  try {
    if (scopeEntry.value.trim()) throw new Error('请先点击添加范围，或清空尚未添加的输入。')
    if (props.kind === 'qq' && enabled.value && !eventUrl.value.trim()) throw new Error('启用QQ表情功能前，请填写OneBot事件WebSocket地址')
    const value: MemeSettings = { bot_service_id: identity, row_version: version, enabled: enabled.value,
      private_enabled: privateEnabled.value, qq_event_ws_url: props.kind === 'qq' ? eventUrl.value.trim() || null : null,
      cooldown_seconds: cooldown.value, scopes: scopes() }
    const digest = JSON.stringify(value)
    if (!pending || pending.fingerprint !== digest) pending = { fingerprint: digest, key: crypto.randomUUID() }
    busy.value = true
    const result = await createMemeApi(props.kind).saveMemeSettings(value, pending.key)
    if (!destroyed && current === generation && identity === props.serviceId) {
      version = result.row_version; pending = undefined; loadedFingerprint.value = fingerprint()
      hasSaved.value = true; savedEnabled.value = result.enabled
      notice.value = '表情配置已保存，接收端会在30秒内刷新。'
    }
  } catch (cause) { if (!destroyed && current === generation) error.value = cause instanceof Error ? cause.message : '保存失败，请核对后重试' }
  finally { if (!destroyed && current === generation) busy.value = false }
}
watch(dirty, value => { if (value) notice.value = '' })
watch([() => props.serviceId, () => props.expanded, () => props.kind], () => {
  ++generation; open.value = Boolean(props.expanded); loading.value = false; busy.value = false
  error.value = ''; notice.value = ''; pending = undefined; hasLoaded.value = false; savedEnabled.value = null
  scopeEntry.value = ''; adding.value = false
  if (props.expanded) void loadSettings()
}, { immediate: true })
onBeforeUnmount(() => { destroyed = true; ++generation })
defineExpose({ busy, loading, dirty, error, hasLoaded, hasSaved, savedEnabled })
</script>
<template>
  <section class="meme-connection" :class="{ 'meme-console': consoleMode }">
    <button v-if="!expanded" type="button" class="settings-toggle" data-action="open-meme-settings" :disabled="busy" @click="show">{{ open ? '收起表情功能设置' : '表情功能设置' }}</button>
    <div v-if="open" class="settings-body">
      <h3 v-if="consoleMode" class="bot-setting-section-title">当前连接 <span class="bot-pill">{{ connectionName || '所选连接' }}</span></h3>
      <p v-if="loading" role="status">正在读取…</p>
      <fieldset v-else :class="consoleMode ? 'bot-setting-rows' : 'settings-grid'" :disabled="busy || !hasLoaded">
        <label :class="consoleMode ? 'bot-setting-row' : 'check'"><span><strong>{{ consoleMode ? '启用互动表情' : '启用此连接的表情功能' }}</strong><small v-if="consoleMode">摸摸、配字及头像合成，仅对当前连接生效。</small></span>
          <input v-model="enabled" data-field="enabled" type="checkbox" :class="{ 'bot-setting-switch': consoleMode }"></label>
        <label :class="consoleMode ? 'bot-setting-row' : 'check'"><span><strong>允许私聊使用</strong><small v-if="consoleMode">是否允许在私聊中触发表情指令。</small></span>
          <input v-model="privateEnabled" type="checkbox" :class="{ 'bot-setting-switch': consoleMode }"></label>
        <label v-if="kind === 'qq'" :class="consoleMode ? 'bot-setting-row' : 'full'"><span><strong>OneBot 事件 WebSocket 地址</strong><small>沿用当前连接的访问令牌；与HTTP发送端口可以不同。</small></span>
          <input v-model="eventUrl" data-field="event-url" placeholder="ws://al1s-llbot:实际端口"></label>
        <div v-if="consoleMode" class="bot-setting-row bot-setting-scopes"><span><strong>{{ kind === 'qq' ? '允许的 QQ 群' : '允许的 Discord 频道' }}</strong><small>仅在这些范围中响应，移除后需保存生效。</small></span>
          <div class="bot-scope-controls"><div class="bot-scope-tags"><span v-for="(value, index) in entries" :key="index" class="bot-scope-tag">{{ value }}<button type="button" :aria-label="`移除 ${value}`" @click="removeScope(index)">×</button></span>
            <button type="button" data-action="add-scope" @click="adding = !adding">＋ 添加</button><button type="button" class="bot-scope-bulk" @click="bulk = !bulk">批量编辑</button></div>
            <div v-if="adding" class="bot-scope-add"><input v-model="scopeEntry" data-field="scope-entry" :aria-label="kind === 'qq' ? 'QQ群号' : '服务器ID/频道ID'" :placeholder="kind === 'qq' ? 'QQ群号' : '服务器ID/频道ID'" @keyup.enter="addScope"><button type="button" data-action="confirm-scope" @click="addScope">添加范围</button></div>
            <textarea v-if="bulk" v-model="scopeText" data-field="scopes" rows="3" :placeholder="kind === 'qq' ? '每行一个群号' : '每行：服务器ID/频道ID'" /></div></div>
        <label v-else class="full">{{ kind === 'qq' ? '允许的QQ群' : '允许的Discord频道' }}<textarea v-model="scopeText" data-field="scopes" rows="3" :placeholder="kind === 'qq' ? '每行一个群号' : '每行：服务器ID/频道ID'"></textarea></label>
        <label :class="{ 'bot-setting-row': consoleMode }"><span><strong>{{ consoleMode ? '每人冷却时间' : '每人冷却秒数' }}</strong><small v-if="consoleMode">同一用户连续触发的最短间隔。</small></span>
          <span :class="{ 'bot-number-with-unit': consoleMode }"><input v-model.number="cooldown" data-field="cooldown" type="number" min="1" max="60" step="1"><span v-if="consoleMode">秒</span></span></label>
      </fieldset>
      <p v-if="error" class="settings-error" role="alert">{{ error }}</p><p v-if="notice" class="settings-notice" role="status">{{ notice }}</p>
      <p v-if="error && dirty" class="settings-help">重新读取会恢复服务器设置并丢弃当前未保存的输入。</p>
      <div class="bot-setting-actions"><button v-if="error" type="button" :disabled="busy || loading" @click="loadSettings">重新读取</button>
        <button type="button" data-action="save-meme-settings" :disabled="loading || busy || !hasLoaded" @click="save">{{ busy ? '保存中…' : consoleMode ? '保存当前连接设置' : '保存表情配置' }}</button></div>
      <p v-if="!consoleMode" class="settings-help">表情外发的全局间隔在本Bot管理页配置，同平台所有用户和连接共用；此处的单用户冷却为额外限制。预览不发送消息。</p>
    </div>
  </section>
</template>
<style scoped>
.meme-connection { border-top: 1px solid var(--border-strong,#dbe1e8); margin-top: 16px; padding-top: 12px; min-width: 0; }
fieldset { border: 0; padding: 0; min-width: 0; }
button { border: 1px solid var(--border-strong,#d4dce7); border-radius: 6px; padding: 7px 10px; background: var(--surface,white); color: inherit; cursor: pointer; }.settings-toggle { font-weight: 600; }.settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 12px; }
label { display: grid; gap: 6px; font-size: 13px; min-width: 0; }.full { grid-column: 1/-1; }.check { display: flex; align-items: center; }input,textarea { box-sizing: border-box; min-width: 0; width: 100%; padding: 7px 8px; border: 1px solid var(--border-strong,#d4dce7); border-radius: 6px; color: inherit; background: var(--surface,white); }input[type=checkbox] { width: auto; }.settings-help,small { font-size: 12px; line-height: 1.5; color: var(--muted,#728092); }.settings-error { color: #ba4343; overflow-wrap: anywhere; }.settings-notice { color: #387c58; }

.meme-console { margin: 0; border: 0; padding: 0; }.meme-console label { display: grid; }.meme-console input[type=checkbox] { width: 48px; }.meme-console .bot-setting-actions button[data-action=save-meme-settings] { color: white; background: var(--accent,#1689ff); border-color: var(--accent,#1689ff); padding: 10px 16px; }
</style>
