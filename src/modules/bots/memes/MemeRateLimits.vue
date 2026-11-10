<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import { createMemeApi } from '../../../shared/api/memes'
import type { MemePlatform, MemeRateLimit } from '../../../shared/api/memes'

const props = defineProps<{ platform: MemePlatform; consoleMode?: boolean }>()
const rows = ref<MemeRateLimit[]>([])
const visibleRows = computed(() => rows.value.filter(row => row.platform === props.platform))
const dirty = computed(() => visibleRows.value.some(row => draft.value[row.platform] !== row.interval_seconds))
const hasLoaded = computed(() => visibleRows.value.length > 0)
const draft = ref<Record<MemePlatform, number>>({ discord: 5, qq: 10 })
const busy = ref(false), error = ref(''), notice = ref('')
let disposed = false, generation = 0
const valid = (platform: MemePlatform) => Number.isInteger(draft.value[platform]) && draft.value[platform] >= 1 && draft.value[platform] <= 3600
function validate() {
  if (!hasLoaded.value || !valid(props.platform)) {
    error.value = hasLoaded.value ? '平台发送间隔须为 1～3600 的整数秒。' : '请先读取平台发送间隔。'
    return false
  }
  return true
}
async function load() {
  if (busy.value) return
  const request = ++generation, client = createMemeApi(props.platform)
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await client.fetchRateLimits()
    if (disposed || request !== generation) return
    rows.value = result
    for (const row of result) draft.value[row.platform] = row.interval_seconds
  } catch { if (!disposed && request === generation) error.value = '读取全局间隔失败，请刷新重试。' }
  finally { if (!disposed && request === generation) busy.value = false }
}
async function save(row: MemeRateLimit) {
  if (busy.value || row.platform !== props.platform || !valid(row.platform)) return false
  const platform = props.platform
  const request = generation, client = createMemeApi(platform)
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await client.saveRateLimit(row.platform, draft.value[row.platform], row.row_version)
    if (disposed || request !== generation) return false
    rows.value = rows.value.map(item => item.platform === result.platform ? result : item)
    draft.value[result.platform] = result.interval_seconds
    const message = `${result.platform === 'discord' ? 'Discord' : 'QQ'}全局间隔已保存为 ${result.interval_seconds} 秒。`
    if (!props.consoleMode) notice.value = message
    return true
  } catch (cause) {
    if (!disposed && request === generation) error.value = isAxiosError(cause) && cause.response?.status === 409
      ? '配置已被其他页面修改，请刷新核对后再保存。'
      : '保存未确认，请刷新核对当前值后再操作。'
    return false
  } finally { if (!disposed && request === generation) busy.value = false }
}
async function saveCurrent() {
  const row = visibleRows.value[0]
  if (!row || !validate()) return false
  return save(row)
}
watch(() => props.platform, () => { generation++; busy.value = false; rows.value = []; void load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; generation++ })
defineExpose({ busy, error, dirty, hasLoaded, validate, saveCurrent })
</script>

<template>
  <section class="rate-limits" :class="{ 'rate-limits-console': consoleMode }" aria-label="表情全局发送间隔">
    <div v-if="!consoleMode" class="rate-heading"><h3>全局发送间隔</h3><button type="button" :disabled="busy" data-action="refresh-global-rates" @click="load">刷新间隔</button></div>
    <p v-if="!consoleMode">所有用户、群聊、频道和连接共用本平台名额；结果、用法和错误回复均计入，预览不计入。</p>
    <div class="rate-fields">
      <div v-for="row in visibleRows" :key="row.platform" class="rate-field">
        <template v-if="consoleMode">
          <label :for="`global-rate-${row.platform}`"><strong>平台发送间隔</strong><small>{{ platform === 'qq' ? 'QQ' : 'Discord' }} 平台共享，范围为 1～3600 秒；结果、用法和错误回复计入，预览不计入。</small></label>
          <span class="bot-number-with-unit"><input :id="`global-rate-${row.platform}`" v-model.number="draft[row.platform]" :data-field="`global-${row.platform}`" type="number" min="1" max="3600" step="1" :disabled="busy" /><span>秒 / 次</span></span>
          <button v-if="platform === 'discord'" type="button" :disabled="busy" data-action="refresh-global-rates" @click="load">刷新间隔</button>
        </template>
        <template v-else>
          <label>{{ row.platform === 'discord' ? 'Discord（秒 / 次）' : 'QQ（秒 / 次）' }}<span class="bot-number-with-unit"><input v-model.number="draft[row.platform]" :data-field="`global-${row.platform}`" type="number" min="1" max="3600" step="1" :disabled="busy" /></span></label>
          <button type="button" :data-action="`save-global-${row.platform}`" :disabled="busy || !valid(row.platform)" @click="save(row)">保存</button>
          <small>已保存 {{ row.interval_seconds }} 秒</small>
        </template>
      </div>
    </div>
    <p v-if="!consoleMode">可设置 1～3600 整数秒。保存后新发送采用新间隔，当前冷却会按原期限结束；重启保留。</p>
    <p v-if="busy" role="status">处理中…</p><p v-if="error" class="rate-error" role="alert">{{ error }}</p><p v-if="notice" class="rate-notice" role="status">{{ notice }}</p>
    <button v-if="consoleMode && (!hasLoaded || (platform === 'qq' && error))" type="button" :disabled="busy" @click="load">重新读取间隔</button>
  </section>
</template>

<style scoped>
.rate-limits { padding: 12px 14px; margin-bottom: 16px; border: 1px solid var(--border,#dbe2eb); border-radius: 10px; background: var(--surface,white); }
.rate-heading,.rate-fields,.rate-field { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }.rate-heading { justify-content: space-between; }h3 { margin: 0; font-size: 15px; }.rate-fields { gap: 20px; }label { display: flex; align-items: center; gap: 8px; font-size: 13px; }input { box-sizing: border-box; width: 85px; padding: 6px 8px; border: 1px solid var(--border,#dbe2eb); border-radius: 6px; background: var(--surface,white); color: inherit; }
button { padding: 6px 10px; border: 1px solid var(--border,#dbe2eb); border-radius: 6px; background: var(--surface,white); color: inherit; cursor: pointer; }button:disabled { opacity: .5; }p,small { color: var(--text-secondary,#738095); font-size: 12px; line-height: 1.6; }.rate-error { color: #ba4343; }.rate-notice { color: #387c58; }
.rate-limits-console { min-width:0; margin:0; padding:14px 0; border:0; border-bottom:1px solid var(--border); border-radius:0; background:transparent; }
.rate-limits-console:last-child { border-bottom:0; }
.rate-limits-console .rate-fields { display:block; }
.rate-limits-console .rate-field { flex-wrap:nowrap; justify-content:space-between; gap:12px; }
.rate-limits-console label { display:grid; flex:1 1 auto; min-width:0; gap:4px; }
.rate-limits-console .bot-number-with-unit { flex:0 0 170px; width:170px; max-width:100%; }
.rate-limits-console .bot-number-with-unit input { flex:1; width:100%!important; }
.rate-limits-console small { color:var(--muted); }
@container interaction-settings (max-width:620px) { .rate-limits-console .rate-field { flex-wrap:wrap; }.rate-limits-console label { flex-basis:100%; } }
</style>
