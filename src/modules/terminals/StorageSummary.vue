<script setup lang="ts">
import { computed } from 'vue'
import type { Terminal } from '../../shared/api/terminals'
import { formatGiB } from '../../shared/presentation/format'
defineEmits<{ details: [] }>()
const props = defineProps<{ terminal: Terminal }>()
const current = computed(() => props.terminal.service_status === 'online' && props.terminal.storage_probe_ok === true)
const percent = computed(() => {
  const s = props.terminal.storage
  if (!s || !Number.isFinite(s.total_bytes) || s.total_bytes <= 0 || !Number.isFinite(s.used_bytes) || s.used_bytes < 0) return null
  return Math.min(100, Math.max(0, s.used_bytes / s.total_bytes * 100))
})
</script>
<template>
  <section class="storage-summary" aria-label="存储摘要">
    <div class="storage-summary__heading"><strong>存储</strong><button class="storage-link" @click="$emit('details')">查看详情 →</button></div>
    <code>{{ terminal.storage?.directory || '目录未知' }}</code>
    <small v-if="terminal.storage && !current">历史观测，当前未知</small>
    <div class="usage-track" :aria-label="percent === null ? '用量未知' : '已用 ' + percent.toFixed(1) + '%'"
      :role="percent === null ? undefined : 'progressbar'" :aria-valuenow="percent ?? undefined" :aria-valuemin="0" :aria-valuemax="100">
      <span v-if="percent !== null" :style="{ width: percent + '%' }" />
    </div>
    <div class="storage-summary__stats"><span>已用 {{ terminal.storage ? formatGiB(terminal.storage.used_bytes) : '—' }}</span>
      <span>可用 {{ terminal.storage ? formatGiB(terminal.storage.available_bytes) : '—' }}</span></div>
  </section>
</template>
<style scoped>
.storage-summary { display:grid; gap:12px; padding:18px; border:1px solid var(--el-border-color-lighter); border-radius:10px; min-width:0; }
.storage-summary__heading,.storage-summary__stats { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.storage-summary__heading strong { font-size:18px; }
.storage-summary__stats { flex-wrap:wrap; color:var(--el-text-color-secondary); font-size:13px; }
code { overflow-wrap:anywhere; color:var(--el-text-color-secondary); } small { color:var(--el-text-color-secondary); }
.usage-track { height:10px; border-radius:8px; background:var(--el-fill-color-darker); overflow:hidden; }
.usage-track span { display:block; height:100%; background:var(--el-color-primary); border-radius:8px; }
.storage-link { color:var(--el-color-primary); background:none; border:0; cursor:pointer; font:inherit; }
</style>
