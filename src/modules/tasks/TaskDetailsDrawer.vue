<script setup lang="ts">
import { Download, Document, Refresh } from '@element-plus/icons-vue'
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, ref, watch } from 'vue'
import { ElButton, ElDrawer, ElIcon } from 'element-plus'
import { fetchTaskDetails, type AttemptDetail } from '../../shared/api/task-details'
import type { TaskHistoryItem } from '../../shared/api/tasks'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import FailureImage from './FailureImage.vue'
import TaskLineupWorkspace from './TaskLineupWorkspace.vue'
import { FailureReview } from './failure-review'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ task: (Pick<TaskHistoryItem, 'task_id'> & Partial<Pick<TaskHistoryItem, 'name' | 'source_module' | 'task_type'>>) | null }>()
const items = ref<AttemptDetail[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const lineupRecordId = ref<string | null>(null)
const sourceModule = ref<string | null>(null)
const isLineup = computed(() => !!lineupRecordId.value || ['lineup', 'lineup_batch'].includes(sourceModule.value || props.task?.source_module || ''))
let generation = 0
let review: FailureReview | undefined
function isCurrent(task: string, currentGeneration: number) {
  return visible.value && props.task?.task_id === task && generation === currentGeneration
}
async function load(reset = false) {
  if (!props.task || busy.value) return
  const current = ++generation
  const task = props.task.task_id
  busy.value = true; error.value = ''
  if (reset) { items.value = []; cursor.value = null; lineupRecordId.value = null; sourceModule.value = null }
  try {
    const result = await fetchTaskDetails(task, reset ? null : cursor.value)
    if (!isCurrent(task, current)) return
    items.value = reset ? result.items : [...items.value, ...result.items]
    cursor.value = result.next_cursor
    lineupRecordId.value = result.lineup_record_id ?? null
    sourceModule.value = result.source_module ?? null
  } catch (e) { if (isCurrent(task, current)) error.value = e instanceof Error ? e.message : '读取失败' }
  finally { if (isCurrent(task, current)) busy.value = false }
}
async function download(attempt: string, artifact: string) {
  if (!props.task || busy.value || !review) return
  const task = props.task.task_id
  const current = generation
  busy.value = true; error.value = ''
  try { await review.download(attempt, artifact) }
  catch (e) { if (isCurrent(task, current)) error.value = e instanceof Error ? e.message : '下载失败' }
  finally { if (isCurrent(task, current)) busy.value = false }
}
function executionScreenshots(attempt: AttemptDetail) {
  const failureScreenshotIds = new Set(
    attempt.details.map(detail => detail.screenshot_id).filter((id): id is string => Boolean(id)),
  )
  return (attempt.screenshots ?? []).filter(item => !failureScreenshotIds.has(item.artifact_id))
}
async function confirm(attempt: AttemptDetail) {
  if (!props.task || busy.value || !review) return
  const task = props.task.task_id
  const current = generation
  busy.value = true; error.value = ''
  try {
    if (await review.complete(attempt, () => isCurrent(task, current))) visible.value = false
  }
  catch (e) { if (isCurrent(task, current)) error.value = e instanceof Error ? e.message : '确认失败' }
  finally { if (isCurrent(task, current)) busy.value = false }
}
async function closeDetails(done: () => void) {
  if (isLineup.value) { done(); return }
  if (busy.value) return
  if (!props.task || !review) { done(); return }
  const task = props.task.task_id
  const current = generation
  const session = review
  const active = () => isCurrent(task, current)
  busy.value = true; error.value = ''
  try {
    let page = { items: items.value, next_cursor: cursor.value }
    while (active()) {
      for (const attempt of page.items) {
        if (!active()) return
        if (attempt.result !== 'failure' || attempt.confirmed || attempt.expired || !attempt.details.length) continue
        if (!await session.complete(attempt, active)) return
        attempt.confirmed = true
      }
      if (!page.next_cursor) break
      page = await fetchTaskDetails(task, page.next_cursor)
    }
    if (active()) done()
  } catch (e) { if (active()) error.value = e instanceof Error ? e.message : '关闭失败' }
  finally { if (active()) busy.value = false }
}
watch(() => [visible.value, props.task?.task_id], () => {
  ++generation
  busy.value = false
  review = props.task ? new FailureReview(props.task.task_id) : undefined
  if (visible.value) void load(true)
}, { immediate: true })
</script>

<template>
  <ElDrawer v-model="visible" class="task-details-drawer" :size="isLineup ? 'min(1160px, 96vw)' : 'min(760px, 95vw)'" :before-close="closeDetails">
    <template #header="{ titleId, titleClass }">
      <div :id="titleId" :class="[titleClass, 'drawer-header']">
        <span class="drawer-title">任务执行详情</span>
        <span v-if="task?.name" class="drawer-task-name" data-task-name :title="task.name">{{ task.name }}</span>
      </div>
    </template>
    <TaskLineupWorkspace v-if="isLineup && task && visible" :task-id="task.task_id" />
    <template v-else>
    <div class="details-toolbar">
      <ElButton :icon="Refresh" :disabled="busy" @click="load(true)">刷新</ElButton>
      <span class="attempt-count" role="status">{{ cursor ? '已加载' : '共' }} {{ items.length }} 次尝试</span>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!items.length && !busy">暂无执行尝试</p>
    <article v-for="attempt in items" :key="attempt.attempt_id" class="attempt-detail">
      <div class="attempt-header">
        <h3>第 {{ attempt.attempt_no }} 次尝试</h3>
        <StatusBadge :value="attempt.result ?? attempt.status" />
      </div>
      <p v-if="attempt.error_code">{{ attempt.failure_phase }} · {{ attempt.error_code }}</p>
      <p v-if="attempt.confirmed">已确认处理</p>
      <p v-else-if="attempt.expired">详情已超过30天保留期</p>
      <template v-else>
        <p v-if="!lineupRecordId && !attempt.details.length && !executionScreenshots(attempt).length">当前没有可展示的截图或诊断。</p>
        <section v-if="executionScreenshots(attempt).length" class="execution-screenshots" aria-label="执行截图">
          <p class="execution-screenshot-title">执行截图 <span data-screenshot-count>{{ executionScreenshots(attempt).length }} 张</span></p>
          <div class="execution-screenshot-list">
            <div v-for="(screenshot, index) in executionScreenshots(attempt)" :key="screenshot.artifact_id" class="execution-screenshot-row" data-screenshot-row>
              <span class="execution-screenshot-index" aria-hidden="true">{{ index + 1 }}</span>
              <ElIcon class="execution-screenshot-icon" aria-hidden="true"><Document /></ElIcon>
              <span class="execution-screenshot-name" :title="screenshot.file_name">{{ screenshot.file_name }}</span>
              <ElButton class="execution-screenshot-download" size="small" :icon="Download" :aria-label="`下载执行截图：${screenshot.file_name}`" :disabled="busy" @click="download(attempt.attempt_id, screenshot.artifact_id)">下载</ElButton>
            </div>
          </div>
        </section>
        <section v-for="(detail, index) in attempt.details" :key="index">
          <p v-if="!lineupRecordId && (detail.module_number || detail.script_name || detail.step_number)">组合第 {{ detail.module_number ?? '未知' }} 步 · {{ detail.script_name ?? '脚本名称未提供' }} · 脚本第 {{ detail.step_number ?? '未知' }} 步</p>
          <p v-if="detail.title || detail.message">{{ detail.title }}<template v-if="detail.title && detail.message">：</template>{{ detail.message }}</p>
          <p v-if="detail.configured_threshold != null">匹配值/设定阈值：{{ detail.actual_score ?? '未取得' }} / {{ detail.configured_threshold }}</p>
          <p v-if="detail.click_x != null">点击位置：{{ detail.click_x }}, {{ detail.click_y }} <HelpHint subject="点击标记">标记不写入下载原图</HelpHint></p>
          <FailureImage v-if="detail.screenshot_id && task" :task="task.task_id" :attempt="attempt.attempt_id" :detail="detail" />
          <p v-if="detail.screenshot_error">截图失败：{{ detail.screenshot_error }}</p>
          <ElButton v-if="detail.screenshot_id" :disabled="busy" @click="download(attempt.attempt_id, detail.screenshot_id)">下载失败原图</ElButton>
        </section>
        <ElButton v-if="attempt.result === 'failure' && attempt.details.length" :disabled="busy" @click="confirm(attempt)">
          {{ busy ? '处理中…' : '确认并关闭' }}
        </ElButton>
        <p v-if="attempt.result === 'failure' && attempt.details.length" class="review-hint">确认后清除失败详情，任务历史和录屏保留。 <HelpHint subject="确认并关闭">未下载的失败原图会自动下载。</HelpHint></p>
      </template>
    </article>
    <ElButton v-if="cursor" :disabled="busy" @click="load()">加载更多</ElButton>
    </template>
  </ElDrawer>
</template>

<style scoped>
.drawer-header { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.drawer-title { flex: 0 0 auto; font-size: 16px; font-weight: 600; }
.drawer-task-name { min-width: 0; overflow: hidden; color: var(--el-text-color-secondary); text-overflow: ellipsis; white-space: nowrap; }
.details-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.attempt-count { color: var(--el-text-color-secondary); font-size: 12px; }
.attempt-detail { border: 1px solid var(--el-border-color); border-radius: 8px; margin-top: 12px; padding: 12px; overflow-wrap: anywhere; color: var(--el-text-color-primary); }
.attempt-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.attempt-header h3 { min-width: 0; margin: 0; font-size: 15px; }
.execution-screenshot-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 12px 0 6px; font-weight: 600; }
.execution-screenshot-title span { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
.execution-screenshot-list { display: grid; gap: 6px; }
.execution-screenshot-row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.execution-screenshot-index { flex: 0 0 1.5rem; color: var(--el-text-color-secondary); font-size: 12px; text-align: right; }
.execution-screenshot-icon { flex: 0 0 auto; color: var(--el-text-color-secondary); }
.execution-screenshot-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.execution-screenshot-download { flex: 0 0 auto; }
.review-hint { font-size: 12px; color: var(--el-text-color-secondary); }
[role='alert'] { color: var(--el-color-danger); }
@media (max-width: 520px) {
  .drawer-header { align-items: flex-start; flex-direction: column; gap: 2px; }
  .drawer-task-name { max-width: 100%; overflow-wrap: anywhere; white-space: normal; }
  .execution-screenshot-row { align-items: flex-start; }
  .execution-screenshot-name { overflow-wrap: anywhere; white-space: normal; }
}
</style>

<style>
.el-drawer.task-details-drawer .el-drawer__header { margin-bottom: 0; padding: 18px 20px; border-bottom: 1px solid var(--el-border-color-lighter); }
.el-drawer.task-details-drawer .el-drawer__body { padding: 14px 20px 20px; }
</style>
