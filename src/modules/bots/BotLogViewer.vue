<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import { apiClient } from '../../shared/api/client'

type Source = 'all' | 'bot' | 'backend' | 'gateway' | 'ops'
type Level = 'all' | 'important'
type LogEntry = { occurred_at: string; source: Exclude<Source, 'all'>; level: 'info' | 'warning' | 'error'; message: string }
type LogPage = { observed_at: string; items: LogEntry[]; scan_limited: boolean }

const props = defineProps<{ kind: 'qq' | 'discord'; active: boolean }>()
const source = ref<Source>('all')
const level = ref<Level>('important')
const page = ref<LogPage | null>(null)
const busy = ref(false)
const error = ref('')
let requestNo = 0
const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function formatTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : timestampFormatter.format(date)
}

function sourceLabel(value: Exclude<Source, 'all'>) {
  return { bot: props.kind === 'qq' ? 'QQ Bot' : 'Discord Bot', backend: '平台后端', gateway: '网关', ops: '运维服务' }[value]
}

async function refresh() {
  const request = ++requestNo
  busy.value = true
  error.value = ''
  page.value = null
  try {
    const response = await apiClient.get<LogPage>(`/bots/containers/${props.kind}/logs`, {
      params: { source: source.value, level: level.value }, timeout: 25_000,
    })
    if (request === requestNo) page.value = response.data
  } catch {
    if (request === requestNo) error.value = '日志暂不可用，请检查日志采集器和运维服务。'
  } finally {
    if (request === requestNo) busy.value = false
  }
}

watch(() => [props.kind, props.active, source.value, level.value] as const, ([, active]) => {
  requestNo++
  page.value = null
  error.value = ''
  busy.value = false
  if (active) void refresh()
}, { immediate: true })
onBeforeUnmount(() => { requestNo++ })
</script>

<template>
  <section class="log-viewer">
    <div class="log-toolbar">
      <label>来源
        <el-select v-model="source" aria-label="日志来源" class="log-select">
          <el-option label="全部来源" value="all" />
          <el-option :label="kind === 'qq' ? 'QQ Bot' : 'Discord Bot'" value="bot" />
          <el-option label="平台后端" value="backend" />
          <el-option label="网关" value="gateway" />
          <el-option label="运维服务" value="ops" />
        </el-select>
      </label>
      <label>范围
        <el-select v-model="level" aria-label="日志范围" class="log-select">
          <el-option label="重要日志" value="important" />
          <el-option label="全部日志" value="all" />
        </el-select>
      </label>
      <el-button :loading="busy" @click="refresh">刷新日志</el-button>
      <span v-if="page" class="log-observed">更新于 {{ formatTimestamp(page.observed_at) }}</span>
    </div>
    <p class="log-hint">重要日志包括警告、错误和连接事件。网络记录来自服务日志，每次最多显示 100 条。</p>
    <p v-if="page?.scan_limited" class="log-hint">日志较多，仅显示近期扫描范围内的结果。</p>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <div v-else class="log-table-wrap" :aria-busy="busy">
      <table class="log-table">
        <thead><tr><th title="按浏览器本地时区显示；日志正文可能保留来源的原始时区">时间（本地）</th><th>来源</th><th>级别</th><th>内容</th></tr></thead>
        <tbody>
          <tr v-for="(item, index) in page?.items ?? []" :key="index">
            <td><time :datetime="item.occurred_at">{{ formatTimestamp(item.occurred_at) }}</time></td>
            <td>{{ sourceLabel(item.source) }}</td>
            <td><span :class="['log-level', item.level]">{{ { info: '信息', warning: '警告', error: '错误' }[item.level] }}</span></td>
            <td class="log-message">{{ item.message }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!busy && page && !page.items.length" class="log-empty">当前范围内暂无日志</p>
      <p v-if="busy" class="log-empty">正在读取日志…</p>
    </div>
  </section>
</template>

<style scoped>
.log-viewer { box-sizing: border-box; min-width: 0; padding: 18px clamp(16px, 2vw, 26px) 26px; }
.log-toolbar, .log-toolbar label { display: flex; align-items: center; gap: 8px; }
.log-toolbar { flex-wrap: wrap; gap: 12px; }
.log-toolbar label { color: var(--muted); font-size: 13px; }
.log-select { width: 136px; }
.log-observed { margin-left: auto; color: var(--muted); font-size: 12px; }
.log-hint { margin: 10px 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.log-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; }
.log-table { width: 100%; min-width: 760px; border-collapse: collapse; text-align: left; font-size: 13px; }
.log-table th { background: var(--surface-soft); color: var(--muted); font-weight: 600; }
.log-table th, .log-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.log-table td:nth-child(-n+3) { white-space: nowrap; }
.log-table tbody tr:last-child td { border-bottom: 0; }
.log-level { color: var(--muted); }
.log-level.warning { color: #b47700; }
.log-level.error { color: #c34141; }
.log-message { white-space: pre-wrap; overflow-wrap: anywhere; }
.log-empty { margin: 0; padding: 32px; text-align: center; color: var(--muted); font-size: 13px; }
@media (max-width: 700px) { .log-observed { width: 100%; margin-left: 0; } }
</style>
