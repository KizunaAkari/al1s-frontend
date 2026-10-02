<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElMessageBox } from 'element-plus'
import {
  fetchStorageCleanup, fetchStorageMaintenance, submitStorageCleanup,
  type StorageCleanupRequest, type StorageMaintenance,
} from '../../shared/api/system'
import { formatDateTime } from '../../shared/presentation/format'

const snapshot = ref<StorageMaintenance | null>(null)
const last = ref<StorageCleanupRequest | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const active = computed(() => last.value?.status === 'pending' || last.value?.status === 'processing')
const megabytes = computed(() => snapshot.value ? (snapshot.value.reclaimable_bytes / 1048576).toFixed(2) : '0.00')

async function refresh() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const [state, request] = await Promise.all([fetchStorageMaintenance(), fetchStorageCleanup()])
    snapshot.value = state
    last.value = request
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '存储状态读取失败。'
  } finally { loading.value = false }
}

async function cleanup() {
  if (submitting.value || active.value) return
  try {
    await ElMessageBox.confirm('仅处理已到期且无有效引用的资源，每次最多处理 20 项。是否发起一次手动清理？', '确认存储清理', { type: 'warning' })
  } catch { return }
  submitting.value = true
  error.value = ''
  try {
    last.value = await submitStorageCleanup()
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '清理请求失败，请刷新核对。'
  } finally { submitting.value = false }
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="storage-maintenance">
    <header><div><h1>平台存储维护 <HelpHint subject="平台存储维护">配置的自动清理周期为 {{ snapshot?.automatic_interval_seconds ?? 30 }} 秒；手动请求由同一后台清理器执行。</HelpHint></h1></div><ElButton :loading="loading" @click="refresh">刷新状态</ElButton></header>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="loading && !snapshot">正在读取存储状态…</p>
    <template v-if="snapshot">
      <div class="storage-stats">
        <div><span>当前可回收估算 <HelpHint subject="可回收估算">估算依据数据库记录；实际释放量取决于对象存储。手动清理不会跳过保留期、失败退避或共享引用保护。</HelpHint></span><strong>{{ snapshot.reclaimable_blobs }} 项 · {{ megabytes }} MiB</strong></div>
        <div><span>待处理 / 执行中</span><strong>{{ snapshot.pending_gc_jobs }} / {{ snapshot.processing_gc_jobs }}</strong></div>
        <div><span>失败待处理</span><strong>{{ snapshot.dead_letter_gc_jobs }}</strong></div>
        <div><span>待确认 / 隔离资源</span><strong>{{ snapshot.pending_blobs }} / {{ snapshot.quarantined_blobs }}</strong></div>
      </div>
      
      <ElButton type="primary" :loading="submitting" :disabled="active" @click="cleanup">发起一次清理</ElButton>
    </template>
    <div v-if="last" class="last-request">
      <h2>最近一次手动请求</h2>
      <p>状态：{{ { pending: '等待执行', processing: '执行中', completed: '已完成', failed: '失败' }[last.status] }} · 提交于 {{ formatDateTime(last.requested_at) }}</p>
      <p v-if="last.completed_at">完成于 {{ formatDateTime(last.completed_at) }} · 领取 {{ last.claimed }} · 删除 {{ last.deleted }} · 失败 {{ last.failed }} · 状态变化 {{ last.stale }}</p>
      <p v-if="last.error_type">失败类别：{{ last.error_type }}</p>
    </div>
  </section>
</template>

<style scoped>
.storage-maintenance { display: grid; gap: 16px; max-width: 1050px; min-width: 0; }
.storage-maintenance > :deep(.el-button) { justify-self: start; }
header { display: flex; justify-content: space-between; align-items: start; gap: 20px; }
h1 { margin: 0 0 8px; font-size: 30px; } h2 { font-size: 20px; }
p { margin: 0; color: var(--muted); }
.storage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.storage-stats > div, .last-request { border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.storage-stats span { display: block; color: var(--muted); margin-bottom: 10px; }
.storage-stats strong { font-size: 23px; }
.last-request { display: grid; gap: 10px; }
.last-request h2 { margin: 0; }
@media (max-width: 700px) { .storage-stats { grid-template-columns: 1fr; } header { flex-direction: column; } }
</style>
