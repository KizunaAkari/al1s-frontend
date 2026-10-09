<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchMemeSettings, saveMemeSettings, type MemeSettings, type MemeScope } from '../../../shared/api/memes'

const props = defineProps<{ serviceId: string; kind: 'qq' | 'discord' }>()
const open = ref(false), loading = ref(false), busy = ref(false)
const enabled = ref(false), privateEnabled = ref(false), eventUrl = ref(''), cooldown = ref(5), scopeText = ref('')
const error = ref(''), notice = ref('')
let version = 0, generation = 0, destroyed = false
let pending: { fingerprint: string; key: string } | undefined
async function show() {
  if (busy.value) return
  open.value = !open.value
  if (!open.value) { ++generation; loading.value = false; return }
  const current = ++generation, identity = props.serviceId
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const value = await fetchMemeSettings(identity)
    if (destroyed || current !== generation || props.serviceId !== identity) return
    version = value.row_version
    enabled.value = value.enabled; privateEnabled.value = value.private_enabled
    eventUrl.value = value.qq_event_ws_url ?? ''; cooldown.value = value.cooldown_seconds
    scopeText.value = value.scopes.map(scope => props.kind === 'qq' ? scope.target_id : `${scope.guild_id ?? ''}/${scope.target_id}`).join('\n')
    pending = undefined
  } catch (cause) { if (!destroyed && current === generation) error.value = cause instanceof Error ? cause.message : '表情配置读取失败' }
  finally { if (!destroyed && current === generation) loading.value = false }
}
function scopes(): MemeScope[] {
  return scopeText.value.split(/[\n,，]+/).map(value => value.trim()).filter(Boolean).map(value => {
    if (props.kind === 'qq') {
      if (!/^[1-9]\d{0,19}$/.test(value)) throw new Error('请填写有效QQ群号，每行一个')
      return { kind: 'qq_group' as const, target_id: value, guild_id: null }
    }
    const [guild, channel] = value.split('/')
    if (!guild || !channel || !/^[1-9]\d{16,19}$/.test(guild) || !/^[1-9]\d{16,19}$/.test(channel)) throw new Error('Discord范围请按“服务器ID/频道ID”填写，每行一组')
    return { kind: 'discord_channel' as const, target_id: channel, guild_id: guild }
  })
}
async function save() {
  if (loading.value || busy.value) return
  const current = generation, identity = props.serviceId
  error.value = ''; notice.value = ''
  try {
    if (props.kind === 'qq' && enabled.value && !eventUrl.value.trim()) throw new Error('启用QQ表情功能前，请填写OneBot事件WebSocket地址')
    const value: MemeSettings = { bot_service_id: identity, row_version: version, enabled: enabled.value,
      private_enabled: privateEnabled.value, qq_event_ws_url: props.kind === 'qq' ? eventUrl.value.trim() || null : null,
      cooldown_seconds: cooldown.value, scopes: scopes() }
    const fingerprint = JSON.stringify(value)
    if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() }
    busy.value = true
    const result = await saveMemeSettings(value, pending.key)
    if (!destroyed && current === generation && identity === props.serviceId) {
      version = result.row_version; pending = undefined; notice.value = '表情配置已保存，接收端会在30秒内刷新。'
    }
  } catch (cause) { if (!destroyed && current === generation) error.value = cause instanceof Error ? cause.message : '保存失败，请核对后重试' }
  finally { if (!destroyed && current === generation) busy.value = false }
}
watch(() => props.serviceId, () => { ++generation; open.value = false; loading.value = false; busy.value = false; error.value = ''; notice.value = ''; pending = undefined })
onBeforeUnmount(() => { destroyed = true; ++generation })
</script>

<template>
  <section class="meme-connection">
    <button type="button" class="settings-toggle" data-action="open-meme-settings" :disabled="busy" @click="show">{{ open ? '收起表情功能设置' : '表情功能设置' }}</button>
    <div v-if="open" class="settings-body">
      <p v-if="loading">正在读取…</p>
      <fieldset v-else class="settings-grid" :disabled="busy">
        <label class="check"><input v-model="enabled" data-field="enabled" type="checkbox">启用此连接的表情功能</label>
        <label class="check"><input v-model="privateEnabled" type="checkbox">允许私聊使用</label>
        <label v-if="kind === 'qq'" class="full">OneBot 事件 WebSocket 地址<input v-model="eventUrl" data-field="event-url" placeholder="ws://al1s-llbot:实际端口"><small>使用原生OneBot配置中的事件服务地址；与HTTP发送端口可以不同，访问令牌沿用此连接。</small></label>
        <label class="full">{{ kind === 'qq' ? '允许的QQ群' : '允许的Discord频道' }}<textarea v-model="scopeText" data-field="scopes" rows="3" :placeholder="kind === 'qq' ? '每行一个群号' : '每行：服务器ID/频道ID'"></textarea></label>
        <label>每人冷却秒数<input v-model.number="cooldown" type="number" min="1" max="60"></label>
      </fieldset>
      <p v-if="error" class="settings-error">{{ error }}</p><p v-if="notice" class="settings-notice">{{ notice }}</p>
      <button type="button" data-action="save-meme-settings" :disabled="loading || busy" @click="save">{{ busy ? '保存中…' : '保存表情配置' }}</button>
      <p class="settings-help">表情外发另有全局间隔：{{ kind === 'qq' ? 'QQ 30秒' : 'Discord 10秒' }}一次；操作与素材在“表情包工坊”管理，预览不发送消息。</p>
    </div>
  </section>
</template>

<style scoped>
.meme-connection { border-top: 1px solid var(--border-strong,#dbe1e8); margin-top: 16px; padding-top: 12px; min-width: 0; }
fieldset { border: 0; padding: 0; min-width: 0; }
button { border: 1px solid var(--border-strong,#d4dce7); border-radius: 6px; padding: 7px 10px; background: var(--surface,white); color: inherit; cursor: pointer; }.settings-toggle { font-weight: 600; }.settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 12px; }
label { display: grid; gap: 6px; font-size: 13px; min-width: 0; }.full { grid-column: 1/-1; }.check { display: flex; align-items: center; }input,textarea { box-sizing: border-box; min-width: 0; width: 100%; padding: 7px 8px; border: 1px solid var(--border-strong,#d4dce7); border-radius: 6px; color: inherit; background: var(--surface,white); }input[type=checkbox] { width: auto; }.settings-help,small { font-size: 12px; line-height: 1.5; color: var(--muted,#728092); }.settings-error { color: #ba4343; overflow-wrap: anywhere; }.settings-notice { color: #387c58; }
</style>
