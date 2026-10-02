<script setup lang="ts">
import { Refresh, Sort } from '@element-plus/icons-vue'
import {
  ElButton,
  ElMessage,
  ElMessageBox,
  ElRadioButton,
  ElRadioGroup,
  ElTooltip,
} from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useCursorPage } from '../../shared/api/pagination'
import {
  cancelSingleTask,
  controlSchedule,
  deleteTaskHistory,
  fetchActiveSchedules,
  fetchTaskHistory,
  type ActiveSchedule,
  type TaskHistoryItem,
} from '../../shared/api/tasks'
import { formatDailyTimes, formatDateTime } from '../../shared/presentation/format'
import DataState from '../../shared/ui/DataState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import ScheduleOccurrencesDrawer from './ScheduleOccurrencesDrawer.vue'
import ScheduleRevisionDialog from './ScheduleRevisionDialog.vue'
import TaskRecordingsDrawer from './TaskRecordingsDrawer.vue'
import TaskDetailsDrawer from './TaskDetailsDrawer.vue'
import TaskSubmissionDialog from './TaskSubmissionDialog.vue'
import TaskHistoryCleanup from './TaskHistoryCleanup.vue'

const route = useRoute()
const submissionVisible = ref(false)
const sort = ref<'asc' | 'desc'>('asc')
const isSchedules = computed(() => route.name === 'task-schedules')
const history = useCursorPage<TaskHistoryItem, string>(fetchTaskHistory, (item) => item.task_id)
const schedules = useCursorPage<ActiveSchedule, string>(
  (cursor) => fetchActiveSchedules(cursor, sort.value),
  (item) => item.schedule_id,
)
const mutatingKey = ref<string | null>(null)
const revisionDialogVisible = ref(false)
const revisionSchedule = ref<ActiveSchedule | null>(null)
const occurrencesDrawerVisible = ref(false)
const occurrencesSchedule = ref<ActiveSchedule | null>(null)
const recordingTask = ref<TaskHistoryItem | null>(null)
const recordingsVisible = ref(false)
const detailTask = ref<Pick<TaskHistoryItem, 'task_id'> | null>(null)
const detailsVisible = ref(false)

const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function taskIdFromQuery(value: unknown): string | null {
  return typeof value === 'string' && taskIdPattern.test(value) ? value : null
}

function openTaskFromQuery(value: unknown): void {
  const taskId = taskIdFromQuery(value)
  if (!taskId) return
  detailTask.value = { task_id: taskId }
  detailsVisible.value = true
}

function displayedResult(task: TaskHistoryItem): string | null {
  if (task.task_type === 'batch') return task.batch_summary?.execution_status === 'ended' ? task.batch_summary.result : null
  return task.latest_execution_status === 'ended' ? task.latest_result : null
}

function progressText(schedule: ActiveSchedule): string {
  return `${schedule.settled_occurrences}/${schedule.total_occurrences}`
}

function occurrencePositionText(schedule: ActiveSchedule): string {
  if (schedule.current_occurrence_ordinal !== null) {
    return `当前第 ${schedule.current_occurrence_ordinal}/${schedule.total_occurrences}`
  }
  if (schedule.next_occurrence_ordinal !== null) {
    return `下一轮第 ${schedule.next_occurrence_ordinal}/${schedule.total_occurrences}`
  }
  return '暂无待执行轮次'
}

async function confirmAction(message: string, title: string, confirmButtonText: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText,
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

async function cancelTask(task: TaskHistoryItem): Promise<void> {
  if (!(await confirmAction(
    `取消“${task.name}”后，排队任务会直接结算；运行中任务将进入受控取消。`,
    '确认取消单次任务',
    '取消任务',
  ))) return
  mutatingKey.value = `task:${task.task_id}`
  try {
    await cancelSingleTask(task)
    ElMessage.success('取消请求已提交')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '取消任务失败')
  } finally {
    mutatingKey.value = null
    await history.load(true)
  }
}

async function removeTask(task: TaskHistoryItem): Promise<void> {
  if (!(await confirmAction(
    `删除“${task.name}”的历史记录，并按引用关系清理可回收的录屏与诊断资源。此操作不用于取消活动任务。`,
    '确认删除任务历史',
    '删除历史',
  ))) return
  mutatingKey.value = `task:${task.task_id}`
  try {
    await deleteTaskHistory(task)
    ElMessage.success('任务历史已删除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除任务历史失败')
  } finally {
    mutatingKey.value = null
    await history.load(true)
  }
}

async function changeSchedule(
  schedule: ActiveSchedule,
  action: 'pause' | 'resume' | 'terminate',
): Promise<void> {
  const labels = { pause: '暂停', resume: '继续', terminate: '中止' } as const
  if (action !== 'resume') {
    const message = action === 'pause'
      ? '暂停不抢占当前执行；循环任务保留剩余轮次，定时任务暂停期间到期的轮次将跳过且不补发。'
      : '中止后不再生成后续轮次；正在执行的任务会完成当前尝试和受控收尾，随后进入任务历史。'
    if (!(await confirmAction(message, `确认${labels[action]}任务`, labels[action]))) return
  }
  mutatingKey.value = `schedule:${schedule.schedule_id}`
  try {
    await controlSchedule(schedule, action)
    ElMessage.success(`${labels[action]}请求已提交`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : `${labels[action]}任务失败`)
  } finally {
    mutatingKey.value = null
    await schedules.load(true)
  }
}

function openRevision(schedule: ActiveSchedule): void {
  revisionSchedule.value = schedule
  revisionDialogVisible.value = true
}

function openOccurrences(schedule: ActiveSchedule): void {
  occurrencesSchedule.value = schedule
  occurrencesDrawerVisible.value = true
}

async function refreshCurrent(): Promise<void> {
  if (isSchedules.value) await schedules.load(true)
  else await history.load(true)
}

watch(isSchedules, refreshCurrent)
watch(sort, async () => {
  if (isSchedules.value) await schedules.load(true)
})
watch(() => route.query.task_id, openTaskFromQuery, { immediate: true })
onMounted(refreshCurrent)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="EXECUTION CENTER"
      title="任务中心"
    >
      <ElButton :icon="Refresh" :loading="history.loading.value || schedules.loading.value" @click="refreshCurrent">刷新</ElButton>
      <ElButton type="primary" @click="submissionVisible = true">下发任务</ElButton>
      <TaskSubmissionDialog v-model="submissionVisible" @submitted="history.load(true)" />
    </PageHeader>

    <nav class="subnav" aria-label="任务中心页面">
      <RouterLink to="/tasks/history">任务历史</RouterLink>
      <RouterLink to="/tasks/schedules">循环/定时任务</RouterLink>
    </nav>

    <section v-if="!isSchedules" class="panel data-panel">
      <div class="section-heading">
        <div><h3>任务历史 </h3></div>
        <TaskHistoryCleanup :tasks="history.items.value" :disabled="history.loading.value || mutatingKey !== null"
          @updated="history.load(true)" />
      </div>
      <DataState
        :loading="history.loading.value"
        :loaded="history.loaded.value"
        :empty="history.items.value.length === 0"
        :error="history.error.value"
        empty-title="暂无任务历史"
        @retry="history.load(history.items.value.length === 0)"
      >
        <div class="table-shell">
          <table class="data-table task-history-table">
            <thead><tr><th>任务</th><th>目标类型</th><th>生命周期</th><th>执行状态</th><th>结果</th><th>创建时间</th><th>资源</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="task in history.items.value" :key="task.task_id">
                <td><strong class="task-name" :title="task.name">{{ task.name }}</strong><small>{{ task.task_id }}</small>
                  <RouterLink v-if="task.source_module === 'lineup' && task.logical_content_id" :to="{ path: '/lineup', query: { record: task.logical_content_id } }">纠错与标注</RouterLink>
                </td>
                <td><StatusBadge :value="task.task_type" /></td>
                <td><StatusBadge :value="task.lifecycle_status" /></td>
                <td><StatusBadge :value="task.task_type === 'batch' ? task.batch_summary?.execution_status : task.latest_execution_status" /></td>
                <td><StatusBadge v-if="displayedResult(task)" :value="displayedResult(task)" /><span v-else>---</span></td>
                <td>{{ formatDateTime(task.created_at) }}</td>
                <td><span v-if="task.record_video" class="resource-chip">已勾选录屏</span><span v-else>---</span></td>
                <td>
                  <div class="table-actions">
                    <ElButton size="small" @click="detailTask = task; detailsVisible = true">详情</ElButton>
                    <ElButton v-if="task.record_video" size="small" @click="recordingTask = task; recordingsVisible = true">录屏</ElButton>
                    <ElTooltip :content="task.cancel.refusal_message ?? '当前状态不允许取消'" :disabled="task.cancel.allowed">
                      <span><ElButton size="small" :disabled="!task.cancel.allowed" :loading="mutatingKey === `task:${task.task_id}`" @click="cancelTask(task)">取消</ElButton></span>
                    </ElTooltip>
                    <ElTooltip :content="task.delete.refusal_message ?? '当前状态不允许删除'" :disabled="task.delete.allowed">
                      <span><ElButton size="small" type="danger" plain :disabled="!task.delete.allowed" :loading="mutatingKey === `task:${task.task_id}`" @click="removeTask(task)">删除</ElButton></span>
                    </ElTooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="history.nextCursor.value || history.error.value" class="list-footer">
          <span v-if="history.error.value">{{ history.error.value.message }}</span>
          <ElButton v-if="history.nextCursor.value" :loading="history.loading.value" @click="history.load()">加载更多</ElButton>
        </div>
      </DataState>
    </section>

    <section v-else class="panel data-panel">
      <div class="section-heading">
        <div><h3>循环/定时任务 </h3></div>
        <ElRadioGroup v-model="sort" size="small" aria-label="计划排序">
          <ElRadioButton value="asc"><span class="button-with-icon"><Sort />正序</span></ElRadioButton>
          <ElRadioButton value="desc">反序</ElRadioButton>
        </ElRadioGroup>
      </div>
      <DataState
        :loading="schedules.loading.value"
        :loaded="schedules.loaded.value"
        :empty="schedules.items.value.length === 0"
        :error="schedules.error.value"
        empty-title="暂无活动循环或定时任务"
        @retry="schedules.load(schedules.items.value.length === 0)"
      >
        <div class="schedule-list">
          <article v-for="schedule in schedules.items.value" :key="schedule.schedule_id" class="schedule-card">
            <div class="schedule-card__main">
              <div>
                <div class="entity-title"><strong>{{ schedule.name }}</strong><StatusBadge :value="schedule.schedule_type" /><StatusBadge :value="schedule.status" /></div>
                <p v-if="schedule.schedule_type === 'timed'">
                  {{ schedule.start_date }} ～ {{ schedule.end_date }} · {{ formatDailyTimes(schedule.daily_times) }}
                  <span v-if="schedule.timezone">（{{ schedule.timezone }}）</span>
                </p>
                <p v-else>按指定次数执行 · 结束时间 ---</p>
              </div>
              <div class="progress-number"><strong>{{ progressText(schedule) }}</strong><span>已结算/总轮次</span></div>
            </div>
            <div class="schedule-card__meta">
              <span>{{ occurrencePositionText(schedule) }}</span>
              <span>待生成 {{ schedule.planned_occurrences }}</span>
              <span>已跳过 {{ schedule.skipped_occurrences }}</span>
              <span>已取消 {{ schedule.cancelled_occurrences }}</span>
              <span>更新 {{ formatDateTime(schedule.updated_at) }}</span>
            </div>
            <div class="schedule-card__actions">
              <ElButton size="small" @click="openOccurrences(schedule)">查看轮次</ElButton>
              <ElTooltip :content="schedule.pause.refusal_message ?? '当前状态不允许暂停'" :disabled="schedule.pause.allowed">
                <span><ElButton size="small" :disabled="!schedule.pause.allowed" :loading="mutatingKey === `schedule:${schedule.schedule_id}`" @click="changeSchedule(schedule, 'pause')">暂停</ElButton></span>
              </ElTooltip>
              <ElTooltip :content="schedule.resume.refusal_message ?? '当前状态不允许继续'" :disabled="schedule.resume.allowed">
                <span><ElButton size="small" :disabled="!schedule.resume.allowed" :loading="mutatingKey === `schedule:${schedule.schedule_id}`" @click="changeSchedule(schedule, 'resume')">继续</ElButton></span>
              </ElTooltip>
              <ElTooltip :content="schedule.revise.refusal_message ?? '当前状态不允许修改'" :disabled="schedule.revise.allowed">
                <span><ElButton size="small" :disabled="!schedule.revise.allowed" @click="openRevision(schedule)">修改</ElButton></span>
              </ElTooltip>
              <ElTooltip :content="schedule.terminate.refusal_message ?? '当前状态不允许中止'" :disabled="schedule.terminate.allowed">
                <span><ElButton size="small" type="danger" plain :disabled="!schedule.terminate.allowed" :loading="mutatingKey === `schedule:${schedule.schedule_id}`" @click="changeSchedule(schedule, 'terminate')">中止</ElButton></span>
              </ElTooltip>
            </div>
          </article>
        </div>
        <div v-if="schedules.nextCursor.value || schedules.error.value" class="list-footer">
          <span v-if="schedules.error.value">{{ schedules.error.value.message }}</span>
          <ElButton v-if="schedules.nextCursor.value" :loading="schedules.loading.value" @click="schedules.load()">加载更多</ElButton>
        </div>
      </DataState>
    </section>
    <TaskRecordingsDrawer v-model="recordingsVisible" :task="recordingTask" />
    <TaskDetailsDrawer v-model="detailsVisible" :task="detailTask" />
    <ScheduleRevisionDialog
      v-model="revisionDialogVisible"
      :schedule="revisionSchedule"
      @updated="schedules.load(true)"
    />
    <ScheduleOccurrencesDrawer
      v-model="occurrencesDrawerVisible"
      :schedule="occurrencesSchedule"
    />
  </div>
</template>
<style scoped>
.task-history-table { table-layout: fixed; min-width: 1040px; }
.task-history-table th { white-space: nowrap; }
.task-history-table th:nth-child(2) { width: 78px; }
.task-history-table th:nth-child(3), .task-history-table th:nth-child(4) { width: 88px; }
.task-history-table th:nth-child(5) { width: 68px; }
.task-history-table th:nth-child(6) { width: 150px; }
.task-history-table th:nth-child(7) { width: 116px; }
.task-history-table th:last-child { width: 200px; }
.task-history-table .task-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.task-history-table .table-actions { gap: 6px; }
.task-history-table .resource-chip { white-space: nowrap; }
</style>
