<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { componentApi, componentLabel, targetKey, type InventoryEntry } from '../../shared/api/components'
import { formatDateTime } from '../../shared/presentation/format'
const emit = defineEmits<{ upgrade: [row: InventoryEntry] }>()
const rows = ref<InventoryEntry[]>([]), busy = ref(false), error = ref(''), cursor = ref<string | null>(null)
const status = { healthy: '正常', unhealthy: '异常', offline: '离线', unknown: '未知' }
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false, generation = 0
let controller: AbortController | undefined
async function load(more = false) {
  if (busy.value || disposed) return
  clearTimeout(timer); const request = ++generation; busy.value = true; error.value = ''
  controller = new AbortController()
  try {
    const page = await componentApi.inventory(more ? cursor.value ?? undefined : undefined, controller.signal)
    if (disposed || request !== generation) return
    const merged = new Map((more ? rows.value : []).map(row => [targetKey(row.target) + ':' + row.component, row]))
    page.items.forEach(row => merged.set(targetKey(row.target) + ':' + row.component, row))
    rows.value = [...merged.values()]; cursor.value = page.next_cursor
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '无法读取组件版本' }
  finally { if (!disposed && request === generation) { busy.value = false; timer = setTimeout(() => void load(), 60000) } }
}
onMounted(() => void load())
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timer); controller?.abort() })
</script>
<template>
  <section class="inventory">
    <header><h2>运行版本</h2><ElButton :loading="busy" @click="load()">刷新版本</ElButton></header>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="component-grid">
      <article v-for="row in rows" :key="targetKey(row.target) + row.component" :data-component="row.component">
        <header><strong>{{ componentLabel(row.component) }}</strong><span :class="row.status">{{ status[row.status] }}</span></header>
        <div class="version">{{ row.version ?? '版本未知' }}</div>
        <p>{{ row.target.kind === 'terminal' ? row.display_name : '平台宿主' }} <small>{{ row.architecture ?? '架构未知' }}</small></p>
        <p class="time">{{ row.observed_at ? '最近观测：' + formatDateTime(row.observed_at) : '尚无可用观测' }}</p>
        <p v-if="row.component === 'maa'" class="note">随Linux终端版本包升级，每次升级会先校验兼容性。</p>
        <details v-if="row.image"><summary>部署信息</summary><p>{{ row.image }}</p><small>{{ row.image_id }}</small></details>
        <ElButton :disabled="row.status !== 'healthy' || !row.source_identity" @click="emit('upgrade', row)">选择升级版本</ElButton>
      </article>
    </div>
    <ElButton v-if="cursor" :loading="busy" @click="load(true)">加载更多终端</ElButton>
  </section>
</template>
<style scoped>
header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:18px;margin:0}.inventory{display:grid;gap:16px;min-width:0}
.component-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px}article{padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--surface);min-width:0}
.version{font-size:24px;font-weight:700;margin:12px 0}p{font-size:13px;overflow-wrap:anywhere}.note,.time,small{color:var(--muted)}.healthy{color:var(--success)}.offline,.unknown{color:var(--muted)}.unhealthy{color:var(--danger)}details{font-size:12px;margin-bottom:12px;overflow-wrap:anywhere}article .el-button{margin-top:8px;max-width:100%}
</style>
