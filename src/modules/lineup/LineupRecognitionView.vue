<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElEmpty, ElOption, ElSelect, ElTag } from 'element-plus'
import { fetchLineupCatalog, fetchLineupTerminals, type LineupCatalogStudent, type LineupLayoutHint, type LineupRecognitionMode, type LineupTerminal } from '../../shared/api/lineup'
import { fetchAnnotationTasks, fetchLineupTask, type LineupTaskSummaryItem, type WorkspaceDetail } from '../../shared/api/lineup-workspace'
import LineupUploadPanel from './LineupUploadPanel.vue'
import LineupAnnotationEditor from './LineupAnnotationEditor.vue'
import { lineupSubmission } from './lineup-submission'
import { useLineupAnnotation } from './use-lineup-annotation'

const route = useRoute(), router = useRouter(), editor = useLineupAnnotation()
const { detail, document, imageUrl, dirty, busy, loading, error, notice } = editor
const submission = lineupSubmission.state
const terminals = ref<LineupTerminal[]>([]), catalog = ref<LineupCatalogStudent[]>([])
const terminalId = ref(''), layoutHint = ref<LineupLayoutHint>('auto'), recognitionMode = ref<LineupRecognitionMode>('auto')
const setupError = ref(''), selectorError = ref(''), taskLoading = ref(false)
const tasks = ref<LineupTaskSummaryItem[]>([]), taskCursor = ref<string | null>(null)
const selectedTask = ref(''), currentTask = ref<LineupTaskSummaryItem | null>(null)
const records = ref<WorkspaceDetail[]>([]), imageCursor = ref<number | null>(null)
let taskGeneration = 0, disposed = false
const taskOptions = computed(() => currentTask.value && !tasks.value.some(t => t.task_id === currentTask.value?.task_id)
  ? [currentTask.value, ...tasks.value] : tasks.value)
const imageOptions = computed(() => detail.value?.task_id === selectedTask.value && !records.value.some(r => r.id === detail.value?.id)
  ? [detail.value, ...records.value] : records.value)
const currentIndex = computed(() => imageOptions.value.findIndex(r => r.id === detail.value?.id))
const saveLabel = computed(() => dirty.value ? '未保存修改' : detail.value?.annotation?.state === 'confirmed' ? '人工标注已保存' : detail.value?.annotation ? '草稿已保存' : '尚未保存标注')

async function refreshTasks(more = false) {
  selectorError.value = ''
  try {
    const page = await fetchAnnotationTasks(more ? taskCursor.value : null)
    if (disposed) return
    tasks.value = more ? [...tasks.value, ...page.items] : page.items
    taskCursor.value = page.next_cursor
  } catch (cause) { if (!disposed) selectorError.value = cause instanceof Error ? cause.message : '读取任务失败' }
}
async function readTask(id: string, more = false) {
  const generation = ++taskGeneration
  taskLoading.value = true; selectorError.value = ''
  try {
    const task = await fetchLineupTask(id, more ? imageCursor.value ?? 0 : 0, 'attention')
    if (disposed || generation !== taskGeneration) return false
    currentTask.value = task; selectedTask.value = id
    records.value = more ? [...records.value, ...task.items] : task.items
    imageCursor.value = task.next_cursor
    return true
  } catch (cause) { if (!disposed && generation === taskGeneration) selectorError.value = cause instanceof Error ? cause.message : '读取图片列表失败'; return false }
  finally { if (!disposed && generation === taskGeneration) taskLoading.value = false }
}
async function openRecord(id: string) {
  if (!id) return
  if (await editor.open(id, selectedTask.value || undefined)) {
    await router.replace({ path: '/lineup', query: { task_id: detail.value?.task_id || undefined, record: id } })
  }
}
async function selectTask(id: string) {
  if (!await editor.canLeave()) return
  if (!await readTask(id)) return
  if (records.value[0]) await openRecord(records.value[0].id)
  else if (detail.value?.task_id !== id) editor.clear()
}
async function moveImage(delta: number) {
  let index = currentIndex.value + delta
  if (index >= imageOptions.value.length && imageCursor.value !== null) {
    const current = detail.value?.id
    if (!await readTask(selectedTask.value, true)) return
    index = imageOptions.value.findIndex(r => r.id === current) + delta
  }
  const target = imageOptions.value[index]
  if (target) await openRecord(target.id)
}
async function saveCurrent() {
  if (!await editor.save()) return
  records.value = records.value.map(r => r.id === detail.value?.id ? { ...detail.value, ordinal: r.ordinal } : r)
  await refreshTasks()
}
async function setup() {
  const values = await Promise.allSettled([fetchLineupTerminals(), fetchLineupCatalog()])
  if (disposed) return
  if (values[0].status === 'fulfilled') { terminals.value = values[0].value.items; terminalId.value = terminals.value.find(t => t.available)?.terminal_id || '' }
  if (values[1].status === 'fulfilled') catalog.value = values[1].value.students
  if (values.some(v => v.status === 'rejected')) setupError.value = '终端或学生资料读取失败，请刷新页面重试。'
  await refreshTasks()
}
watch(() => [route.query.record, route.query.task_id], async ([record, task]) => {
  if (typeof record !== 'string' || record === detail.value?.id) return
  if (await editor.open(record, typeof task === 'string' ? task : undefined)) {
    const parent = detail.value?.task_id
    if (parent) await readTask(parent)
  }
}, { immediate: true })
function protectUploadDraft(event: BeforeUnloadEvent) {
  if (submission.busy || submission.savingDraft || (submission.draftFailed && submission.files.length)) {
    event.preventDefault(); event.returnValue = ''
  }
}
onMounted(() => { void setup(); window.addEventListener('beforeunload', protectUploadDraft) })
onBeforeUnmount(() => { disposed = true; taskGeneration++; window.removeEventListener('beforeunload', protectUploadDraft) })
onBeforeRouteLeave(async () => { const okay = await editor.canLeave(); if (okay) { disposed = true; taskGeneration++ }; return okay })
onBeforeRouteUpdate(() => editor.canLeave())
</script>

<template>
  <div class="lineup-page page-stack">
    <header class="lineup-header"><div><h1>阵容识别</h1><span>上传战报，核对并保存阵容</span></div><RouterLink to="/tasks/history">前往任务中心 →</RouterLink></header>
    <ElAlert v-if="setupError" :title="setupError" type="error" :closable="false" />
    <LineupUploadPanel v-model:terminal-id="terminalId" v-model:layout-hint="layoutHint" v-model:recognition-mode="recognitionMode"
      :busy="submission.busy || submission.pending || submission.restoring" :files="submission.files" :terminals="terminals" :notice="submission.notice || (submission.restoring ? '正在恢复暂存图片…' : submission.draftNotice)" :error="submission.error" :progress="submission.progress"
      @files="lineupSubmission.addFiles" @remove="lineupSubmission.remove" @clear="lineupSubmission.clear"
      @submit="lineupSubmission.submit({ terminalId, options: { layout_hint: layoutHint, recognition_mode: recognitionMode } })" />
    <div v-if="submission.taskId || submission.pending" class="submission-handoff" role="status">
      <RouterLink v-if="submission.taskId" :to="{ path: '/tasks/history', query: { task_id: submission.taskId } }">打开刚下发的任务详情 →</RouterLink>
      <ElButton v-if="submission.pending" type="primary" :loading="submission.busy" @click="lineupSubmission.submit({ terminalId, options: { layout_hint: layoutHint, recognition_mode: recognitionMode } })">确认上次下发结果</ElButton>
    </div>
    <section class="annotation-workspace panel" aria-labelledby="annotation-title">
      <header class="workspace-heading"><div><h2 id="annotation-title">纠错与数据标注</h2><p v-if="detail">{{ detail.name }}</p></div><span v-if="detail" class="save-status">保存状态：<ElTag :type="dirty ? 'warning' : detail.annotation?.state === 'confirmed' ? 'success' : 'info'">{{ saveLabel }}</ElTag></span></header>
      <div class="annotation-selectors">
        <label>选择含待处理图片的任务<ElSelect :model-value="selectedTask" :disabled="busy || loading || taskLoading" filterable placeholder="选择任务" aria-label="标注任务" @update:model-value="id => selectTask(String(id))">
          <ElOption v-for="task in taskOptions" :key="task.task_id" :value="task.task_id" :label="`${new Date(task.created_at).toLocaleString('zh-CN')} · ${task.name} · 待处理 ${task.summary.needs_attention} 张`" />
        </ElSelect></label>
        <label>选择图片<ElSelect :model-value="detail?.id" :disabled="busy || loading || taskLoading || !selectedTask" filterable placeholder="选择失败或待核对图片" aria-label="标注图片" @update:model-value="id => openRecord(String(id))">
          <ElOption v-for="record in imageOptions" :key="record.id" :value="record.id" :label="`${record.ordinal ? record.ordinal + ' · ' : ''}${record.name}${record.annotation?.state === 'confirmed' ? ' · 已标注' : ''}`" />
        </ElSelect></label>
        <div class="selector-actions"><ElButton :disabled="busy || loading || currentIndex <= 0" @click="moveImage(-1)">上一张</ElButton><ElButton :disabled="busy || loading || taskLoading || (currentIndex >= imageOptions.length - 1 && imageCursor === null)" @click="moveImage(1)">下一张</ElButton><ElButton :disabled="busy || loading" @click="refreshTasks()">刷新任务</ElButton></div>
      </div>
      <div v-if="taskCursor || imageCursor !== null" class="selector-more"><ElButton v-if="taskCursor" link @click="refreshTasks(true)">更多任务</ElButton><ElButton v-if="imageCursor !== null" link :loading="taskLoading" @click="readTask(selectedTask, true)">更多图片</ElButton></div>
      <ElAlert v-if="selectorError || error" :title="selectorError || error" type="error" :closable="false" />
      <p v-if="notice" class="save-notice" role="status">{{ notice }}</p>
      <p v-if="loading" role="status">正在读取原图与标注…</p>
      <ElButton v-if="detail && !imageUrl && !loading" :disabled="busy" @click="editor.retryImage">重试读取原图</ElButton>
      <LineupAnnotationEditor v-if="detail" v-model="document" :detail="detail" :image-url="imageUrl" :catalog="catalog" :busy="busy || loading" :dirty="dirty" @save="saveCurrent" @reset="editor.reset" @export="editor.download" />
      <ElEmpty v-else-if="!loading" description="选择待处理任务与图片，或从任务详情打开图片开始标注" />
    </section>
  </div>
</template>

<style scoped>
.lineup-page { min-width:0; gap:18px; --lineup-accent:var(--accent); --lineup-accent-strong:var(--accent-strong); --lineup-accent-soft:var(--accent-soft); --lineup-border:var(--border); --lineup-card:var(--surface); }
.lineup-header,.lineup-header>div,.workspace-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.lineup-header>div { flex-direction:column; align-items:flex-start; gap:4px; }
.lineup-header h1 { font-size:28px; margin:0; letter-spacing:-.5px; }
.lineup-header span { color:var(--muted); font-size:14px; }
.lineup-header a,.submission-handoff a { text-decoration:none; color:var(--el-color-primary); font-size:14px; }
.annotation-workspace { display:grid; gap:14px; min-width:0; }
.workspace-heading { align-items:flex-start; flex-wrap:wrap; }
.workspace-heading>div { min-width:0; }
.workspace-heading h2 { margin:0; font-size:20px; }
.workspace-heading p { color:var(--muted); font-size:13px; margin:7px 0 0; overflow-wrap:anywhere; }
.save-status { color:var(--muted); display:flex; align-items:center; gap:6px; font-size:12px; }
.annotation-selectors { display:grid; grid-template-columns:minmax(210px,1fr) minmax(210px,1fr) auto; gap:12px; align-items:end; }
.annotation-selectors label { display:grid; gap:6px; font-size:12px; color:var(--muted); min-width:0; }
.selector-actions { display:flex; flex-wrap:wrap; gap:6px; }
.selector-actions :deep(.el-button + .el-button) { margin-left:0; }
.selector-more { display:flex; gap:12px; }
.save-notice { margin:0; color:var(--success); font-size:13px; }
.submission-handoff { display:flex; justify-content:flex-end; }
@media(max-width:1150px) { .annotation-selectors { grid-template-columns:repeat(2,minmax(0,1fr)); } .selector-actions { grid-column:1/-1; } }
@media(max-width:650px) { .lineup-header { align-items:flex-start; flex-direction:column; } .lineup-header h1 { font-size:24px; } .annotation-selectors { grid-template-columns:1fr; } .selector-actions { grid-column:auto; } }
</style>
