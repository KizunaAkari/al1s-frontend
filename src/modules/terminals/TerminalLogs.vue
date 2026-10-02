<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { hostMaintenance, type HostLogs } from '../../shared/api/host-maintenance'
import { formatDateTime } from '../../shared/presentation/format'

const props = defineProps<{ terminalId: string; active: boolean }>()
const logs = ref<HostLogs | null>(null)
const loading = ref(false)
const error = ref('')
let generation = 0

async function refresh() {
  if (loading.value) return
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const page = await hostMaintenance.logs(props.terminalId)
    if (current === generation) logs.value = page
  } catch {
    if (current === generation) error.value = '日志暂不可用，请稍后刷新。'
  } finally {
    if (current === generation) loading.value = false
  }
}

watch(() => [props.terminalId, props.active], () => {
  generation += 1
  logs.value = null
  loading.value = false
  if (props.active) void refresh()
}, { immediate: true })
</script>

<template>
  <section aria-label="终端运行日志">
    <div class="terminal-log-heading">
      <strong>终端运行日志 <HelpHint subject="终端运行日志">最近 7 天、最多 100 条终端容器日志。仅供维护诊断。</HelpHint></strong>
      <ElButton :loading="loading" @click="refresh">刷新日志</ElButton>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="logs">读取时间：{{ formatDateTime(logs.observed_at) }}</p>
    <p v-if="logs && !logs.lines.length">当前范围内没有日志。</p>
    <pre v-if="logs?.lines.length" class="terminal-log-lines">{{ logs.lines.join('\n') }}</pre>
  </section>
</template>

<style scoped>
.terminal-log-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.terminal-log-heading p { margin: 0; }
.terminal-log-lines { max-height: 440px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--el-fill-color-light); border-radius: 8px; padding: 12px; }
</style>
