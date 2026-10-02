<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, ref } from 'vue'
import { ElButton, ElCheckbox, ElDialog, ElMessageBox } from 'element-plus'
import type { TaskHistoryItem } from '../../shared/api/tasks'
import { deleteHistoryBatch, MAX_HISTORY_BATCH, type HistoryDeletionResult } from '../../shared/api/task-history-batch'

const props = defineProps<{ tasks: TaskHistoryItem[]; disabled: boolean }>()
const emit = defineEmits<{ updated: [] }>()
const visible = ref(false)
const busy = ref(false)
const selected = ref<string[]>([])
const results = ref<HistoryDeletionResult[]>([])
const error = ref('')
const candidates = computed(() => props.tasks.filter((task) => task.delete.allowed))

function open(): void {
  selected.value = []
  results.value = []
  error.value = ''
  visible.value = true
}

function select(id: string, checked: boolean): void {
  selected.value = checked ? [...selected.value, id] : selected.value.filter((value) => value !== id)
}

async function remove(): Promise<void> {
  if (busy.value || !selected.value.length) return
  const snapshot = props.tasks.filter((task) => selected.value.includes(task.task_id))
  busy.value = true
  try {
    try {
      await ElMessageBox.confirm(
        `删除选中的${snapshot.length}条历史及按引用规则可回收的资源？不会取消活动任务，删除不可撤销。`,
        '确认批量清理', { type: 'warning', confirmButtonText: '删除历史', cancelButtonText: '返回' },
      )
    } catch { return }
    results.value = await deleteHistoryBatch(snapshot)
    selected.value = []
    emit('updated')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '批量清理失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ElButton type="danger" plain :disabled="disabled || busy || candidates.length === 0" @click="open">批量清理</ElButton>
  <ElDialog v-model="visible" title="清理任务历史" width="min(700px, 94vw)"
    :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy">
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">清理任务历史 <HelpHint subject="清理任务历史">仅列出当前已加载且允许删除的历史，每次最多50条；需要其他记录请返回列表加载更多。</HelpHint></span></template>
    <div class="cleanup-list">
      <div v-for="task in candidates" :key="task.task_id">
        <ElCheckbox :model-value="selected.includes(task.task_id)"
          :disabled="busy || (selected.length >= MAX_HISTORY_BATCH && !selected.includes(task.task_id))"
          @change="select(task.task_id, Boolean($event))">{{ task.name }} · {{ task.task_id }}</ElCheckbox>
      </div>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul v-if="results.length" aria-live="polite">
      <li v-for="result in results" :key="result.id">{{ result.name }}：{{ result.message }}</li>
    </ul>
    <template #footer>
      <ElButton :disabled="busy" @click="visible = false">关闭</ElButton>
      <ElButton type="danger" :loading="busy" :disabled="!selected.length || busy" @click="remove">
        删除选中（{{ selected.length }}）
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.cleanup-list { max-height: 45vh; overflow: auto; }
.cleanup-list :deep(.el-checkbox) { max-width: 100%; height: auto; min-height: 32px; }
.cleanup-list :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }
</style>
