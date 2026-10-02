<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElButton } from 'element-plus'
import { fetchReadiness, type ReadinessResponse } from '../api/system'
const result = ref<ReadinessResponse | null>(null)
const busy = ref(false)
const failed = ref(false)
const dependencyNames: Record<string, string> = { postgresql: 'PostgreSQL 数据库', s3: '对象存储（S3）', mqtt: '消息通信（MQTT）' }
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const label = computed(() => {
  if (busy.value) return '检查中'
  if (failed.value || !result.value || !Object.keys(result.value.dependencies).length) return '状态未知'
  return result.value.status === 'ready' && Object.values(result.value.dependencies).every(s => s.status === 'ready') ? '平台正常' : '平台异常'
})
async function refresh() {
  if (busy.value) return
  clearTimeout(timer)
  busy.value = true
  failed.value = false
  try { const value = await fetchReadiness(); if (!disposed) result.value = value }
  catch { if (!disposed) { result.value = null; failed.value = true } }
  finally { if (!disposed) { busy.value = false; timer = setTimeout(refresh, 60000) } }
}
onMounted(refresh)
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>
<template>
  <section class="platform-health" aria-label="平台组件状态">
    <header class="health-heading">
      <strong class="health-summary" :class="{ healthy: label === '平台正常', unhealthy: label === '平台异常' }" role="status">{{ label }}</strong>
      <ElButton :loading="busy" size="small" @click="refresh">刷新状态</ElButton>
    </header>
    <p v-if="(failed || !result) && !busy" role="alert">无法获取平台状态，请重试。</p>
    <dl v-if="result" class="health-details"><div v-for="(state, name) in result.dependencies" :key="name" :data-dependency="name">
      <dt>{{ dependencyNames[name] ?? name }}</dt><dd :class="{ ready: state.status === 'ready' }">{{ state.status === 'ready' ? '正常' : '异常' }}<small v-if="state.reason">{{ state.reason }}</small></dd>
    </div></dl>
  </section>
</template>

<style scoped>
.platform-health { max-width: 900px; min-width: 0; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.health-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.health-summary { color: var(--muted); font-size: 16px; }
.healthy,.ready { color: var(--success, #129b6a); }
.unhealthy,dd:not(.ready),[role='alert'] { color: var(--danger, #bd3838); }
.health-details { margin: 16px 0 0; }
.health-details > div { display: flex; align-items: start; justify-content: space-between; gap: 20px; border-top: 1px solid var(--border); padding: 14px 0; }
dt { font-weight: 600; } dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
small { display: block; margin-top: 4px; color: var(--muted); }
@media (max-width: 600px) { .platform-health { padding: 14px; } .health-details > div { gap: 12px; flex-wrap: wrap; } }
</style>
