<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { componentApi, componentLabel, type ComponentOperation } from '../../shared/api/components'
import { formatDateTime } from '../../shared/presentation/format'
const rows = ref<ComponentOperation[]>([]), cursor = ref<string | null>(null), error = ref(''), busy = ref(false)
const labels = { accepted: '等待执行', preparing: '校验与备份', switching: '切换中', verifying: '验证中', succeeded: '成功', failed_safe: '未升级，原版本已核实', unknown: '结果未知，保留锁定' }
let disposed = false
async function load(more = false) {
  if (busy.value || disposed) return
  busy.value = true; error.value = ''
  try { const page = await componentApi.operations(more ? cursor.value ?? undefined : undefined); if (disposed) return; rows.value = more ? [...rows.value, ...page.items] : page.items; cursor.value = page.next_cursor }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '无法读取升级记录' }
  finally { if (!disposed) busy.value = false }
}
async function check(row: ComponentOperation) {
  if (busy.value || disposed) return
  busy.value = true
  try { const result = await componentApi.reconcile(row.operation_id); if (!disposed) rows.value = rows.value.map(item => item.operation_id === row.operation_id ? result : item) }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '恢复结果未确认，继续保留锁定' }
  finally { if (!disposed) busy.value = false }
}
onMounted(() => void load())
onBeforeUnmount(() => { disposed = true })
</script>
<template><section class="history"><header><h2>升级记录与恢复</h2><ElButton :loading="busy" @click="load()">刷新记录</ElButton></header><ElAlert v-if="error" :title="error" type="error" :closable="false" />
 <article v-for="row in rows" :key="row.operation_id"><header><strong>{{ componentLabel(row.component) }}</strong><span>{{ labels[row.state] }}</span></header><p>{{ formatDateTime(row.created_at) }} · {{ row.target.kind === 'platform' ? '平台宿主' : row.target.terminal_id }}</p><p>阶段：{{ row.stage }}<span v-if="row.error_code"> · {{ row.error_code }}</span></p><small>操作编号：{{ row.operation_id }}</small><ElButton v-if="!['succeeded','failed_safe'].includes(row.state)" :disabled="busy" @click="check(row)">检查实际部署并恢复</ElButton></article>
 <p v-if="!rows.length && !busy">暂无组件升级记录。</p><ElButton v-if="cursor" :disabled="busy" @click="load(true)">加载更多记录</ElButton></section></template>
<style scoped>.history{display:grid;gap:14px;min-width:0}header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h2{margin:0;font-size:18px}article{display:grid;gap:8px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}p{margin:0;font-size:13px;overflow-wrap:anywhere}small{color:var(--muted);overflow-wrap:anywhere}article .el-button{justify-self:start}</style>
