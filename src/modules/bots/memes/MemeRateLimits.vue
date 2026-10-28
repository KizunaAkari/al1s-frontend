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
  if (busy.value || row.platform !== props.platform || !valid(row.platform)) return
  const platform = props.platform
  const request = generation, client = createMemeApi(platform)
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await client.saveRateLimit(row.platform, draft.value[row.platform], row.row_version)
    if (disposed || request !== generation) return
    rows.value = rows.value.map(item => item.platform === result.platform ? result : item)
    draft.value[result.platform] = result.interval_seconds
    notice.value = `${result.platform === 'discord' ? 'Discord' : 'QQ'}全局间隔已保存为 ${result.interval_seconds} 秒。`
  } catch (cause) {
    if (!disposed && request === generation) error.value = isAxiosError(cause) && cause.response?.status === 409
      ? '配置已被其他页面修改，请刷新核对后再保存。'
      : '保存未确认，请刷新核对当前值后再操作。'
  } finally { if (!disposed && request === generation) busy.value = false }
}
watch(() => props.platform, () => { generation++; busy.value = false; rows.value = []; void load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; generation++ })
defineExpose({ busy, error, dirty, hasLoaded })
</script>

<template>
  <section class="rate-limits" :class="{ 'rate-limits-console': consoleMode }" aria-label="表情全局发送间隔">
    <div class="rate-heading"><h3 :class="{ 'bot-setting-section-title': consoleMode }">{{ consoleMode ? '发送频率' : '全局发送间隔' }} <span v-if="consoleMode" class="bot-pill">{{ platform === 'qq' ? 'QQ' : 'Discord' }} 平台共用</span></h3><button type="button" :disabled="busy" data-action="refresh-global-rates" @click="load">刷新间隔</button></div>
    <p>所有用户、群聊、频道和连接共用本平台名额；结果、用法和错误回复均计入，预览不计入。</p>
    <div class="rate-fields">
      <div v-for="row in visibleRows" :key="row.platform" class="rate-field">
        <label>{{ consoleMode ? '平台发送间隔' : row.platform === 'discord' ? 'Discord（秒 / 次）' : 'QQ（秒 / 次）' }}<span class="bot-number-with-unit"><input v-model.number="draft[row.platform]" :data-field="`global-${row.platform}`" type="number" min="1" max="3600" step="1" :disabled="busy" /><span v-if="consoleMode">秒 / 次</span></span></label>
        <button type="button" :data-action="`save-global-${row.platform}`" :disabled="busy || !valid(row.platform)" @click="save(row)">{{ consoleMode ? '保存平台间隔' : '保存' }}</button>
        <small>已保存 {{ row.interval_seconds }} 秒</small>
      </div>
    </div>
    <p>可设置 1～3600 整数秒。保存后新发送采用新间隔，当前冷却会按原期限结束；重启保留。</p>
    <p v-if="busy" role="status">处理中…</p><p v-if="error" class="rate-error" role="alert">{{ error }}</p><p v-if="notice" class="rate-notice" role="status">{{ notice }}</p>
  </section>
</template>

<style scoped>
.rate-limits { padding: 12px 14px; margin-bottom: 16px; border: 1px solid var(--border,#dbe2eb); border-radius: 10px; background: var(--surface,white); }
.rate-heading,.rate-fields,.rate-field { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }.rate-heading { justify-content: space-between; }h3 { margin: 0; font-size: 15px; }.rate-fields { gap: 20px; }label { display: flex; align-items: center; gap: 8px; font-size: 13px; }input { box-sizing: border-box; width: 85px; padding: 6px 8px; border: 1px solid var(--border,#dbe2eb); border-radius: 6px; background: var(--surface,white); color: inherit; }
button { padding: 6px 10px; border: 1px solid var(--border,#dbe2eb); border-radius: 6px; background: var(--surface,white); color: inherit; cursor: pointer; }button:disabled { opacity: .5; }p,small { color: var(--text-secondary,#738095); font-size: 12px; line-height: 1.6; }.rate-error { color: #ba4343; }.rate-notice { color: #387c58; }
.rate-limits-console { padding: 24px 0 0; margin: 24px 0 0; border: 0; border-top: 1px solid var(--border); border-radius: 0; }.rate-limits-console .rate-fields { display: block; }.rate-limits-console .rate-field { justify-content: flex-end; gap: 14px; }.rate-limits-console label { flex: 1; justify-content: space-between; font-weight: 600; }.rate-limits-console input { width: 140px; }.rate-limits-console h3 { font-size: 18px; }
</style>
