<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect, ElTag } from 'element-plus'

import {
  fetchLineupCatalog,
  type LineupCatalogStudent,
  type LineupSide,
} from '../../shared/api/lineup'
import {
  fetchLineupTask,
  retryLineupTask,
  type LineupTask,
  type UsableResult,
  type WorkspaceDetail,
} from '../../shared/api/lineup-workspace'
import { workspaceCodes } from '../lineup/workspace-export'
import LineupResultCodes from './LineupResultCodes.vue'

const props = defineProps<{ taskId: string }>()

type Category = 'all' | 'usable' | 'attention' | 'failure'
type DisplayMember = { index: number; id: number | null; name: string }
const POLL_PAGE_SIZE = 20
const MAX_WORKSPACE_ITEMS = 200

const category = ref<Category>('all')
const task = ref<LineupTask | null>(null)
const items = ref<WorkspaceDetail[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const notice = ref('')
const copyNotice = ref('')
const catalog = ref<LineupCatalogStudent[]>([])
const catalogError = ref('')
const expandedRecordId = ref<string | null>(null)
const retryBusy = ref(false)
const retryKey = ref<string | null>(null)
const retriedTaskId = ref<string | null>(null)
const exportBusy = ref(false)

let generation = 0
let pageRequestBusy = false
let pendingReload = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let catalogRequested = false

const catalogNames = computed(() => new Map(catalog.value.map(student => [student.id, student.name])))
const summary = computed(() => task.value?.summary ?? {
  total: 0, finished: 0, usable: 0, needs_attention: 0, failure: 0, running: 0,
})
const active = computed(() => task.value?.lifecycle_status === 'active')
const canRetry = computed(() => Boolean(
  task.value
  && task.value.lifecycle_status !== 'active'
  && task.value.summary.needs_attention > 0
  && !retryBusy.value
  && !retriedTaskId.value,
))

function clearPolling(): void {
  if (pollTimer !== null) clearInterval(pollTimer)
  pollTimer = null
}

function startPolling(): void {
  clearPolling()
  if (!active.value) return
  pollTimer = setInterval(() => {
    if (!pageRequestBusy) void loadFirst('poll')
  }, 3000)
}

function invalidateView(clearRetry = false): void {
  generation += 1
  clearPolling()
  task.value = null
  items.value = []
  nextCursor.value = null
  expandedRecordId.value = null
  error.value = ''
  notice.value = ''
  copyNotice.value = ''
  if (clearRetry) {
    retryKey.value = null
    retriedTaskId.value = null
  }
}

function assertTaskPage(page: LineupTask): LineupTask {
  if (!page || !page.summary || !Array.isArray(page.items)) throw new Error('阵容任务响应格式无效')
  return page
}

function applyPage(page: LineupTask, mode: 'reset' | 'append'): void {
  task.value = page
  if (mode === 'append') items.value = [...items.value, ...page.items]
  else items.value = page.items
  nextCursor.value = items.value.length >= MAX_WORKSPACE_ITEMS ? null : page.next_cursor
  if (expandedRecordId.value && !items.value.some(item => item.id === expandedRecordId.value)) expandedRecordId.value = null
  startPolling()
}

async function refreshLoadedPages(
  current: number,
  taskId: string,
  selected: Category,
): Promise<{ page: LineupTask; items: WorkspaceDetail[]; nextCursor: number | null }> {
  const target = Math.min(MAX_WORKSPACE_ITEMS, Math.max(POLL_PAGE_SIZE, items.value.length))
  const seenCursors = new Set<number>()
  const seenItems = new Set<string>()
  const refreshed: WorkspaceDetail[] = []
  let after = 0
  let firstPage: LineupTask | null = null
  let lastPage: LineupTask | null = null
  while (!lastPage || (refreshed.length < target && lastPage.next_cursor !== null)) {
    if (seenCursors.has(after)) throw new Error('任务分页游标重复')
    seenCursors.add(after)
    const page = assertTaskPage(await fetchLineupTask(taskId, after, selected))
    if (current !== generation || props.taskId !== taskId || category.value !== selected) throw new Error('任务已切换')
    firstPage ??= page
    lastPage = page
    for (const item of page.items) {
      if (!seenItems.has(item.id)) {
        seenItems.add(item.id)
        refreshed.push(item)
      }
    }
    if (lastPage.next_cursor === null || refreshed.length >= target) break
    after = lastPage.next_cursor
  }
  return {
    page: firstPage!,
    items: refreshed.slice(0, target),
    nextCursor: lastPage?.next_cursor ?? null,
  }
}

async function loadFirst(mode: 'reset' | 'poll' = 'reset'): Promise<void> {
  if (pageRequestBusy) {
    if (mode === 'reset') pendingReload = true
    return
  }
  const current = generation
  const taskId = props.taskId
  const selected = category.value
  pageRequestBusy = true
  if (mode === 'reset') loading.value = true
  if (mode === 'reset') error.value = ''
  try {
    if (mode === 'poll') {
      const refreshed = await refreshLoadedPages(current, taskId, selected)
      if (current !== generation || props.taskId !== taskId || category.value !== selected) return
      task.value = refreshed.page
      items.value = refreshed.items
      nextCursor.value = refreshed.items.length >= MAX_WORKSPACE_ITEMS ? null : refreshed.nextCursor
      if (expandedRecordId.value && !items.value.some(item => item.id === expandedRecordId.value)) expandedRecordId.value = null
      startPolling()
    } else {
      const page = assertTaskPage(await fetchLineupTask(taskId, 0, selected))
      if (current !== generation || props.taskId !== taskId || category.value !== selected) return
      applyPage(page, mode)
    }
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '读取阵容任务失败'
  } finally {
    pageRequestBusy = false
    if (mode === 'reset') loading.value = false
    if (pendingReload) {
      pendingReload = false
      void loadFirst('reset')
    }
  }
}

async function loadMore(): Promise<void> {
  if (pageRequestBusy || nextCursor.value === null) return
  const current = generation
  const taskId = props.taskId
  const selected = category.value
  const after = nextCursor.value
  pageRequestBusy = true
  loadingMore.value = true
  try {
    const page = assertTaskPage(await fetchLineupTask(taskId, after, selected))
    if (current !== generation || props.taskId !== taskId || category.value !== selected) return
    applyPage(page, 'append')
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '读取更多阵容图片失败'
  } finally {
    pageRequestBusy = false
    loadingMore.value = false
  }
}

function refresh(): void {
  invalidateView(true)
  void loadFirst('reset')
}

function changeCategory(value: Category): void {
  if (value === category.value) return
  category.value = value
}

async function loadCatalog(): Promise<void> {
  if (catalogRequested) return
  catalogRequested = true
  try {
    catalog.value = (await fetchLineupCatalog()).students
  } catch (cause) {
    catalogError.value = cause instanceof Error ? cause.message : '读取学生资料库失败'
  }
}

function imageUrl(recordId: string): string {
  return `/api/v1/lineup/records/${encodeURIComponent(recordId)}/image`
}

function taskHistoryUrl(taskId: string): string {
  return `/tasks/history?task_id=${encodeURIComponent(taskId)}`
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    uploaded: '已上传', waiting: '等待派发', queued: '排队中', running: '识别中',
    success: '识别完成', failure: '识别失败', cancelled: '已取消', timed_out: '已超时',
  }
  return labels[value] ?? (value || '未知状态')
}

function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (value === 'success') return 'success'
  if (value === 'failure' || value === 'timed_out') return 'danger'
  if (value === 'running' || value === 'queued' || value === 'waiting') return 'warning'
  return 'info'
}

function sourceFor(item: WorkspaceDetail): UsableResult | null {
  return item.usable_result ?? item.result
}

function countFor(item: WorkspaceDetail, side: LineupSide): number {
  if (item.annotation?.state === 'confirmed') return item.annotation.teams[side] ?? 0
  const source = sourceFor(item)
  if (source?.teams && !source.teams.includes(side)) return 0
  return source?.team_sizes?.[side] ?? 6
}

function studentName(id: number | null): string {
  if (id === null) return '未确认学生'
  return catalogNames.value.get(id) ?? `学生 #${id}`
}

function memberId(item: WorkspaceDetail, side: LineupSide, index: number): number | null {
  if (item.annotation?.state === 'confirmed') {
    return item.annotation.slots.find(slot => slot.side === side && slot.index === index)?.student_id ?? null
  }
  const offset = side === 'attack' ? 0 : 6
  if (item.review?.length === 12) {
    const reviewId = item.review[offset + index]
    return typeof reviewId === 'number' ? reviewId : null
  }
  const slot = sourceFor(item)?.slots.find(candidate => candidate.side === side && candidate.index === index)
  if (!slot) return null
  if (slot.accepted === true) return slot.selected_id ?? slot.student_id ?? null
  if (slot.agreed === true) return slot.image_id ?? slot.student_id ?? slot.selected_id ?? null
  return null
}

function members(item: WorkspaceDetail, side: LineupSide): DisplayMember[] {
  const count = countFor(item, side)
  if (!Number.isInteger(count) || count < 1 || count > 6) return []
  return Array.from({ length: count }, (_, index) => {
    const id = memberId(item, side, index)
    return { index, id, name: studentName(id) }
  })
}

function sourceLabel(item: WorkspaceDetail): string {
  if (item.annotation?.state === 'confirmed') return '人工已确认'
  if (item.annotation?.state === 'draft') return '标注草稿'
  if (item.review?.length === 12) return '已保存人工确认'
  if (item.result) return '机器结果'
  return '待处理'
}

function toggleExpanded(recordId: string): void {
  expandedRecordId.value = expandedRecordId.value === recordId ? null : recordId
  copyNotice.value = ''
}

async function copyCode(code: string | null, label: string): Promise<void> {
  if (!code) return
  copyNotice.value = ''
  try {
    await navigator.clipboard.writeText(code)
    copyNotice.value = `${label}已复制`
  } catch {
    copyNotice.value = '复制失败，请手动选择阵容码。'
  }
}

function newRetryKey(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  return typeof randomUUID === 'function'
    ? randomUUID()
    : `retry-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function retryAttention(): Promise<void> {
  if (!task.value || !canRetry.value) return
  const current = generation
  const taskId = props.taskId
  retryBusy.value = true
  error.value = ''
  const key = retryKey.value ?? newRetryKey()
  retryKey.value = key
  try {
    const result = await retryLineupTask(taskId, key)
    if (current !== generation || props.taskId !== taskId) return
    retriedTaskId.value = result.task_id
    notice.value = `已创建重试任务，仅重新处理失败或待核对图片。`
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '重试任务创建失败'
  } finally {
    if (current === generation) retryBusy.value = false
  }
}

async function fetchAllPages(): Promise<{ task: LineupTask; items: WorkspaceDetail[] }> {
  const current = generation
  const taskId = props.taskId
  const collected: WorkspaceDetail[] = []
  let after = 0
  let first: LineupTask | null = null
  const cursors = new Set<number>()
  while (true) {
    if (cursors.has(after)) throw new Error('任务分页游标重复')
    cursors.add(after)
    const page = assertTaskPage(await fetchLineupTask(taskId, after, 'all'))
    if (current !== generation || props.taskId !== taskId) throw new Error('任务已切换')
    first ??= page
    collected.push(...page.items)
    if (page.next_cursor === null) return { task: first, items: collected }
    after = page.next_cursor
  }
}

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type })
  if (typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportPairs(): Promise<void> {
  if (exportBusy.value) return
  exportBusy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await fetchAllPages()
    let skipped = 0
    const lines = result.items.flatMap(record => {
      const codes = workspaceCodes(record)
      const line = codes.pair
      if (!line) skipped += 1
      return line ? [line] : []
    })
    downloadText('lineup-pair.txt', lines.join('\n'), 'text/plain;charset=utf-8')
    notice.value = `已导出 ${lines.length} 行，跳过 ${skipped} 张未确认图片。`
  } catch (cause) {
    if (cause instanceof Error && cause.message === '任务已切换') return
    error.value = cause instanceof Error ? cause.message : '导出失败'
  } finally {
    exportBusy.value = false
  }
}

watch(() => props.taskId, () => {
  invalidateView(true)
  void loadFirst('reset')
}, { immediate: true })

watch(category, (value, previous) => {
  if (value === previous) return
  invalidateView(false)
  void loadFirst('reset')
})

onMounted(() => { void loadCatalog() })
onBeforeUnmount(() => {
  generation += 1
  clearPolling()
})
</script>

<template>
  <section class="task-lineup-workspace" aria-labelledby="task-lineup-workspace-title">
    <header class="workspace-heading">
      <div>
        <h2 id="task-lineup-workspace-title">阵容任务详情</h2>
        <p v-if="task">{{ task.name }}</p>
      </div>
      <div class="workspace-actions">
        <ElButton size="small" aria-label="刷新任务" :loading="loading || loadingMore" @click="refresh">刷新</ElButton>
        <ElButton
          size="small"
          type="warning"
          aria-label="重试失败/待核对图片"
          :disabled="!canRetry"
          :loading="retryBusy"
          @click="retryAttention"
        >
          重试失败/待核对图片
        </ElButton>
        <a v-if="retriedTaskId" class="retry-task-link" :href="taskHistoryUrl(retriedTaskId)">打开新任务</a>
      </div>
    </header>

    <p v-if="loading" class="workspace-status" role="status">正在读取阵容任务…</p>
    <p v-else-if="error" class="workspace-error" role="alert">{{ error }}</p>
    <template v-if="task">
      <div class="workspace-summary" aria-label="任务汇总">
        <span>总数 <strong>{{ summary.total }}</strong></span>
        <span>执行完成 <strong>{{ summary.finished }}</strong></span>
        <span>可用 <strong>{{ summary.usable }}</strong></span>
        <span>待核对 <strong>{{ summary.needs_attention }}</strong></span>
        <span>执行失败 <strong>{{ summary.failure }}</strong></span>
        <span>运行中 <strong>{{ summary.running }}</strong></span>
      </div>

      <div class="workspace-toolbar">
        <label class="workspace-filter">
          <span>图片筛选</span>
          <ElSelect :model-value="category" aria-label="图片结果筛选" size="small" @update:model-value="changeCategory">
            <ElOption label="全部" value="all" />
            <ElOption label="可用" value="usable" />
            <ElOption label="待核对" value="attention" />
            <ElOption label="执行失败" value="failure" />
          </ElSelect>
        </label>
        <span v-if="active" class="workspace-polling" role="status">任务进行中，约每 3 秒刷新</span>
      </div>

      <p v-if="catalogError" class="workspace-warning" role="alert">学生资料库读取失败：{{ catalogError }}</p>
      <p v-if="notice" class="workspace-notice" role="status">{{ notice }}</p>
      <p v-if="copyNotice" class="workspace-notice" role="status">{{ copyNotice }}</p>

      <div v-if="!items.length && !loading" class="workspace-empty">当前筛选没有图片。</div>
      <div v-else class="workspace-record-list" aria-label="阵容图片列表">
        <article v-for="item in items" :key="item.id" class="workspace-record" :data-record-id="item.id">
          <div class="record-row">
            <img :src="imageUrl(item.id)" :alt="item.name" class="record-thumbnail" loading="lazy" />
            <div class="record-main">
              <div class="record-title-line">
                <button type="button" class="record-toggle" :aria-expanded="expandedRecordId === item.id" @click="toggleExpanded(item.id)">{{ item.name }}</button>
                <ElTag size="small" :type="statusType(item.state)">{{ statusLabel(item.state) }}</ElTag>
                <ElTag v-if="item.annotation?.state === 'confirmed'" size="small" type="success">人工已确认</ElTag>
                <ElTag v-else-if="item.annotation?.state === 'draft'" size="small" type="warning">标注草稿</ElTag>
              </div>
              <div class="record-meta"><span v-if="item.ordinal != null">第 {{ item.ordinal }} 张</span><span>{{ sourceLabel(item) }}</span><span>{{ item.width }}×{{ item.height }}</span></div>
              <p v-if="item.error_code" class="record-error">原始执行原因：{{ item.error_code }}</p>
              <p v-if="item.needs_attention" class="record-attention">待核对：{{ ({ runtime_failure: '执行失败', layout_invalid: '攻防布局待确认', conflict: '角色候选冲突', unresolved: '仍有位置未确认' } as Record<string, string>)[item.attention_reason] || '需要人工确认' }}</p>
            </div>
            <RouterLink class="record-annotate-link" :to="{ path: '/lineup', query: { task_id: taskId, record: item.id } }" @click.stop>纠错与标注</RouterLink>
          </div>

          <LineupResultCodes :item="item" @copy="copyCode" />
          <div v-if="expandedRecordId === item.id" class="record-expanded">
            <div class="expanded-image-column">
              <img :src="imageUrl(item.id)" :alt="`${item.name} 原图`" class="expanded-image" loading="lazy" />
              <p v-if="item.error_code" class="record-error">原始失败原因仍保留：{{ item.error_code }}</p>
            </div>
            <div class="expanded-details">
              <div class="expanded-heading"><strong>攻防阵容</strong><span>{{ sourceLabel(item) }}</span></div>
              <div class="expanded-teams">
                <section v-for="side in ['attack', 'defense'] as LineupSide[]" :key="side" class="expanded-team">
                  <h4>{{ side === 'attack' ? '攻击方' : '防守方' }}</h4>
                  <p v-if="!members(item, side).length" class="team-empty">未提供或未确认该侧阵容</p>
                  <ol v-else>
                    <li v-for="member in members(item, side)" :key="`${side}-${member.index}`">
                      <span>{{ member.name }}</span><code v-if="member.id !== null">#{{ member.id }}</code>
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-if="nextCursor !== null" class="workspace-more">
        <ElButton size="small" aria-label="加载更多图片" :loading="loadingMore" @click="loadMore">加载更多图片</ElButton>
      </div>

      <div class="workspace-export-actions" aria-label="任务结果导出">
        <ElButton size="small" :loading="exportBusy" aria-label="导出攻防对 TXT" @click="exportPairs">导出攻防对 TXT</ElButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.task-lineup-workspace {
  --workspace-accent: var(--lineup-accent, var(--el-color-primary, #2f76da));
  --workspace-border: var(--lineup-border, var(--el-border-color-lighter, #d7e3f1));
  --workspace-card: var(--lineup-card, var(--el-bg-color, #fff));
  display: grid;
  gap: 13px;
  min-width: 0;
  padding: 15px;
  border: 1px solid var(--workspace-border);
  border-radius: 12px;
  background: var(--workspace-card);
  color: var(--text, var(--el-text-color-primary, #172139));
}

.workspace-heading,
.workspace-actions,
.workspace-toolbar,
.workspace-summary,
.record-row,
.record-title-line,
.record-meta,
.expanded-heading,
.workspace-export-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.workspace-heading {
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}

.workspace-heading h2 { margin: 0; font-size: 18px; }
.workspace-heading p { margin: 4px 0 0; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 12px; }
.workspace-actions { flex-wrap: wrap; justify-content: flex-end; }
.retry-task-link, .record-annotate-link { color: var(--workspace-accent); font-size: 12px; text-decoration: none; white-space: nowrap; }
.retry-task-link:hover, .record-annotate-link:hover { text-decoration: underline; }
.workspace-summary { flex-wrap: wrap; gap: 7px 18px; padding: 10px 12px; border: 1px solid var(--workspace-border); border-radius: 8px; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 12px; }
.workspace-summary strong { color: var(--text, var(--el-text-color-primary, #172139)); font-size: 15px; }
.workspace-toolbar { justify-content: space-between; flex-wrap: wrap; }
.workspace-filter > span { flex: none; white-space: nowrap; }
.workspace-filter :deep(.el-select) { width: 170px; }
.workspace-filter { display: inline-flex; align-items: center; gap: 8px; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 12px; }
.workspace-polling, .workspace-status, .workspace-notice, .workspace-warning { color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 12px; }
.workspace-status, .workspace-notice, .workspace-warning, .workspace-error { margin: 0; line-height: 1.5; }
.workspace-error, .record-error { color: var(--el-color-danger, #c43d50); }
.workspace-warning, .record-attention { color: var(--el-color-warning, #b7791f); }
.workspace-empty { padding: 28px 12px; border: 1px dashed var(--workspace-border); border-radius: 8px; color: var(--muted, var(--el-text-color-secondary, #667085)); text-align: center; font-size: 13px; }
.workspace-record-list { display: grid; gap: 8px; min-width: 0; }
.workspace-record { min-width: 0; border: 1px solid var(--workspace-border); border-radius: 9px; background: var(--workspace-card); }
.record-row { align-items: center; min-width: 0; padding: 9px 10px; }
.record-thumbnail { flex: 0 0 76px; width: 76px; height: 52px; object-fit: cover; border-radius: 5px; background: var(--el-fill-color-light, #edf2f7); }
.record-main { display: grid; flex: 1 1 auto; gap: 4px; min-width: 0; }
.record-title-line { flex-wrap: wrap; min-width: 0; }
.record-toggle { max-width: min(45vw, 460px); overflow: hidden; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; font-size: 13px; font-weight: 650; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.record-toggle:hover { color: var(--workspace-accent); }
.record-meta { flex-wrap: wrap; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 10px; }
.record-error, .record-attention { margin: 0; overflow-wrap: anywhere; font-size: 11px; }
.record-annotate-link { flex: 0 0 auto; margin-left: auto; }
.record-expanded { display: grid; grid-template-columns: minmax(190px, .85fr) minmax(0, 1.4fr); gap: 14px; padding: 12px; border-top: 1px solid var(--workspace-border); }
.expanded-image-column { min-width: 0; }
.expanded-image { display: block; width: 100%; max-height: 420px; object-fit: contain; border-radius: 6px; background: var(--el-fill-color-light, #edf2f7); }
.expanded-details { display: grid; gap: 10px; min-width: 0; }
.expanded-heading { justify-content: space-between; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 12px; }
.expanded-heading strong { color: var(--text, var(--el-text-color-primary, #172139)); }
.expanded-teams { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.expanded-team { min-width: 0; padding: 9px; border: 1px solid var(--workspace-border); border-radius: 7px; background: color-mix(in srgb, var(--workspace-card) 85%, var(--workspace-accent) 5%); }
.expanded-team h4 { margin: 0 0 6px; font-size: 12px; }
.expanded-team ol { display: grid; gap: 4px; margin: 0; padding-left: 20px; font-size: 11px; }
.expanded-team li { display: flex; justify-content: space-between; gap: 6px; min-width: 0; }
.expanded-team li span { overflow-wrap: anywhere; }
.expanded-team code { flex: 0 0 auto; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 10px; }
.team-empty { margin: 0; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 11px; }
.workspace-more { display: flex; justify-content: center; }
.workspace-export-actions { flex-wrap: wrap; padding-top: 3px; color: var(--muted, var(--el-text-color-secondary, #667085)); font-size: 11px; }
@media (max-width: 760px) {
  .workspace-heading, .workspace-toolbar { align-items: stretch; flex-direction: column; }
  .workspace-actions { justify-content: flex-start; }
  .record-row { align-items: flex-start; flex-wrap: wrap; }
  .record-annotate-link { margin-left: 85px; }
  .record-expanded { grid-template-columns: 1fr; }
  .expanded-teams { grid-template-columns: 1fr; }
}
</style>
