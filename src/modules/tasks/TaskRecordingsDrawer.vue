<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ElButton, ElDrawer } from 'element-plus'
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchRecordings, recordingDownloadUrl, type Recording } from '../../shared/api/recordings'
import type { TaskHistoryItem } from '../../shared/api/tasks'

const props = defineProps<{ modelValue: boolean; task: TaskHistoryItem | null }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
const items = ref<Recording[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const error = ref('')
let generation = 0
onBeforeUnmount(() => { generation++ })

async function load(reset = false) {
  if (!props.task || (loading.value && !reset)) return
  const current = ++generation
  const taskId = props.task.task_id
  loading.value = true
  error.value = ''
  if (reset) { items.value = []; cursor.value = null }
  try {
    const page = await fetchRecordings(taskId, cursor.value)
    if (current !== generation) return
    const seen = new Set(items.value.map(item => item.artifact_id))
    items.value.push(...page.items.filter(item => !seen.has(item.artifact_id)))
    cursor.value = page.next_cursor
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (current === generation) loading.value = false
  }
}

watch(() => [props.modelValue, props.task?.task_id], () => {
  if (props.modelValue && props.task) void load(true)
  else { generation++; loading.value = false }
}, { immediate: true })
</script>

<template>
  <ElDrawer :model-value="modelValue" title="任务录屏" size="min(720px, 95vw)"
    @update:model-value="$emit('update:modelValue', $event)">
    <p>{{ task?.name }}</p>
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">任务录屏 <HelpHint subject="任务录屏">下载原始录屏，不添加点击标记。保留期从执行结束起算30天。</HelpHint></span></template>
    <ElButton :loading="loading" @click="load(true)">刷新</ElButton>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !items.length">暂无录屏记录；可能尚未生成或上传，请稍后刷新。</p>
    <article v-for="item in items" :key="item.artifact_id" class="recording-item">
      <strong>{{ item.file_name }}</strong>
      <small>执行尝试：{{ item.attempt_id }}</small>
      <a v-if="item.downloadable && task" :href="recordingDownloadUrl(task.task_id, item.artifact_id)">下载原件</a>
      <span v-else>{{ item.status === 'pending' ? '上传尚未完成' : item.status === 'expired' ? '上传会话已过期' : '当前不可下载（未结束、保留期已过或资源不可用）' }}</span>
    </article>
    <ElButton v-if="cursor" :loading="loading" @click="load()">加载更多</ElButton>
  </ElDrawer>
</template>

<style scoped>
.recording-item { display: grid; gap: 8px; padding: 16px 0; border-bottom: 1px solid var(--el-border-color); overflow-wrap: anywhere; }
.recording-item small { color: var(--el-text-color-secondary); }
.recording-item a { color: var(--el-color-primary); }
</style>
