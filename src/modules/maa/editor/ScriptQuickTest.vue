<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { debugProgress, type DebugProgress } from './quick-test-progress'
import { useQuickTestPolling } from './use-quick-test-polling'
import { ruleEventLabel } from './quick-test-rule-events'
import { failureSkipEvent, failureSkipLabel } from './quick-test-failure-skip'
import { quickTestFailureLines, quickTestFailureReason } from './quick-test-failure'
import { ApiError } from '../../../shared/api/client'
import type { MaaScript } from '../../../shared/api/maa'
import type { TargetDevice } from '../../../shared/api/terminals'
import {
  downloadQuickTestScreenshot, fetchQuickTestEvents, fetchQuickTestScreenshots,
  issueQuickTest, readQuickTest, stopQuickTest,
  type QuickTestCommand, type QuickTestDetail, type QuickTestEvent, type QuickTestScreenshot,
} from '../../../shared/api/maa-quick-test'

const props = defineProps<{ script: MaaScript; device?: TargetDevice; disabled: boolean; stepNumber?: number; compact?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean]; locate: [step: number]; result: [detail: QuickTestDetail | undefined]; progress: [value: DebugProgress] }>()
const busy = ref(false)
const error = ref('')
const detail = ref<QuickTestDetail>()
const storageKey = `al1s.quick-test.${props.script.script_id}`
type SavedTest = { command: QuickTestCommand; sessionId?: string }
function restore(): SavedTest | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as SavedTest | null
    const c = saved?.command
    if (c?.scriptId === props.script.script_id && [c.candidateId, c.terminalId, c.deviceId, c.key].every(v => typeof v === 'string')
      && (c.stepNumber === undefined || (Number.isInteger(c.stepNumber) && c.stepNumber >= 1))
      && (!saved?.sessionId || typeof saved.sessionId === 'string')) return saved ?? undefined
  } catch { /* No recoverable request. */ }
}
const saved = ref(restore())
const finished = computed(() => detail.value?.status === 'completed' || detail.value?.status === 'expired'
  || detail.value?.status === 'cancelled'
  || (detail.value?.status === 'issued' && Date.parse(detail.value.expires_at) <= Date.now()))
const canStart = computed(() => !props.disabled && props.script.current_version_id
  && props.device && props.device.mode !== 'unassigned' && props.device.managing_terminal_id && (!saved.value || finished.value))
const labels = { issued: '等待终端领取', claimed: '终端已领取（不代表已开始执行）', completed: '测试已结束', expired: '测试许可已过期', cancelled: '已在领取前取消' }
const eventLabels: Record<QuickTestEvent['kind'], string> = {
  started: '终端开始执行', step_started: '开始步骤', step_succeeded: '步骤完成',
  step_failed: '步骤失败', log: '诊断',
}
const events = ref<QuickTestEvent[]>([])
const eventsLoading = ref(false)
const eventsError = ref('')
const moreEvents = ref(false)
let eventGeneration = 0
const progress = computed(() => debugProgress(detail.value, events.value))
const activeStep = computed(() => progress.value.phase === 'running' && !progress.value.ruleName
  && !progress.value.completed.includes(progress.value.step ?? 0) ? progress.value.step : null)
watch(progress, value => emit('progress', value), { immediate: true, deep: true })
function clearEvents() {
  eventGeneration++
  events.value = []
  moreEvents.value = false
  eventsError.value = ''
  eventsLoading.value = false
}
async function loadEvents() {
  const sessionId = saved.value?.sessionId
  if (!sessionId || eventsLoading.value) return
  const generation = eventGeneration
  eventsLoading.value = true
  try {
    for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
      const after = events.value.at(-1)?.sequence ?? 0
      const page = await fetchQuickTestEvents(props.script.script_id, sessionId, after)
      if (disposed || generation !== eventGeneration || saved.value?.sessionId !== sessionId) return
      const fresh = page.items.filter(item => item.sequence > after).sort((a, b) => a.sequence - b.sequence)
      const seen = new Set(events.value.map(item => item.sequence))
      events.value.push(...fresh.filter(item => { if (seen.has(item.sequence)) return false; seen.add(item.sequence); return true }))
      moreEvents.value = page.next_after !== null
      if (!moreEvents.value || !fresh.length) break
    }
    eventsError.value = ''
  } catch (cause) {
    if (generation === eventGeneration) eventsError.value = cause instanceof Error ? cause.message : '读取调试日志失败'
  } finally {
    if (generation === eventGeneration) eventsLoading.value = false
  }
}
const screenshots = ref<QuickTestScreenshot[]>([])
const screenshotCursor = ref<string | null>(null)
const screenshotsLoaded = ref(false)
const screenshotsLoading = ref(false)
const screenshotError = ref('')
const downloadingArtifact = ref('')
let screenshotGeneration = 0
function setBusy(value: boolean) { busy.value = value }
function clearScreenshots() {
  screenshotGeneration++
  screenshots.value = []
  screenshotCursor.value = null
  screenshotsLoaded.value = false
  screenshotsLoading.value = false
  screenshotError.value = ''
  downloadingArtifact.value = ''
}
let refreshing = false
let disposed = false
let detailGeneration = 0
async function refresh(silent = false) {
  if (!saved.value?.sessionId || busy.value || refreshing || disposed) return
  const sessionId = saved.value.sessionId
  const generation = eventGeneration
  const detailRequest = detailGeneration
  const current = () => !disposed && generation === eventGeneration && saved.value?.sessionId === sessionId
  refreshing = true
  if (!silent) setBusy(true)
  if (!silent) error.value = ''
  try {
    await Promise.all([
      readQuickTest(props.script.script_id, sessionId).then(result => {
        if (current() && detailRequest === detailGeneration) {
          detail.value = result
          error.value = ''
        }
      }).catch(cause => {
        if (current() && detailRequest === detailGeneration) error.value = cause instanceof Error ? cause.message : '读取测试结果失败'
      }),
      loadEvents(),
    ])
  }
  finally { refreshing = false; if (!silent) setBusy(false) }
}
async function loadScreenshots(reset = false) {
  const sessionId = saved.value?.sessionId
  if (!sessionId || screenshotsLoading.value) return
  if (reset) clearScreenshots()
  const current = screenshotGeneration
  screenshotsLoading.value = true
  screenshotError.value = ''
  try {
    const page = await fetchQuickTestScreenshots(props.script.script_id, sessionId, screenshotCursor.value)
    if (current !== screenshotGeneration || saved.value?.sessionId !== sessionId) return
    const seen = new Set(screenshots.value.map(item => item.artifact_id))
    screenshots.value.push(...page.items.filter(item => !seen.has(item.artifact_id)))
    screenshotCursor.value = page.next_cursor
    screenshotsLoaded.value = true
  } catch (cause) {
    if (current === screenshotGeneration && saved.value?.sessionId === sessionId) {
      screenshotError.value = cause instanceof Error ? cause.message : '加载调试截图失败'
    }
  } finally {
    if (current === screenshotGeneration && saved.value?.sessionId === sessionId) screenshotsLoading.value = false
  }
}
async function downloadScreenshot(item: QuickTestScreenshot) {
  const sessionId = saved.value?.sessionId
  if (!sessionId || !item.downloadable || downloadingArtifact.value) return
  const current = screenshotGeneration
  downloadingArtifact.value = item.artifact_id
  screenshotError.value = ''
  try {
    await downloadQuickTestScreenshot(props.script.script_id, sessionId, item.artifact_id, item.file_name)
  } catch (cause) {
    if (current === screenshotGeneration && saved.value?.sessionId === sessionId) {
      screenshotError.value = cause instanceof Error ? cause.message : '下载调试截图失败'
    }
  } finally {
    if (current === screenshotGeneration && saved.value?.sessionId === sessionId) downloadingArtifact.value = ''
  }
}
async function start(stepNumber?: number) {
  if (busy.value || props.disabled) return
  if (!saved.value || finished.value) {
    if (!canStart.value) return
    const next: SavedTest = { command: { scriptId: props.script.script_id, candidateId: props.script.current_version_id!,
      terminalId: props.device!.managing_terminal_id!, deviceId: props.device!.device_id, key: crypto.randomUUID(),
      ...(stepNumber === undefined ? {} : { stepNumber }) } }
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) }
    catch { error.value = '无法保存请求标识，请允许浏览器会话存储。'; return }
    saved.value = next; detail.value = undefined; clearScreenshots(); clearEvents()
  }
  setBusy(true); error.value = ''
  try {
    const result = await issueQuickTest(saved.value.command)
    saved.value.sessionId = result.session_id
    sessionStorage.setItem(storageKey, JSON.stringify(saved.value))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '测试下发结果未知'
    if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) {
      sessionStorage.removeItem(storageKey); saved.value = undefined
    }
  } finally { setBusy(false) }
  if (!error.value) await refresh()
}
async function stop() {
  const sessionId = saved.value?.sessionId
  if (!sessionId || finished.value || busy.value) return
  detailGeneration++
  setBusy(true); error.value = ''
  try {
    detail.value = await stopQuickTest(props.script.script_id, sessionId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '停止请求结果未知，请刷新核对'
  } finally { setBusy(false) }
}
useQuickTestPolling({
  sessionId: () => saved.value?.sessionId,
  finished: () => finished.value,
  pendingEvents: () => moreEvents.value || !!eventsError.value || !!error.value,
  failed: () => !!error.value || !!eventsError.value,
  refresh: () => refresh(true),
})
onBeforeUnmount(() => { disposed = true; clearEvents() })
watch(detail, value => emit('result', value))
const active = computed(() => !!saved.value && !finished.value)
watch([busy, active], () => emit('busy', busy.value || active.value), { immediate: true })
defineExpose({ start, refresh, stop, canStart, busy, active })
onBeforeUnmount(clearScreenshots)
</script>
<template>
  <section class="quick-test" :class="{ compact }" aria-label="脚本临时测试">
    <HelpHint v-if="!compact" subject="临时测试" label="临时测试">测试当前已保存版本，不产生正式任务统计或失败通知。请选择上方 Linux 挂载手机。</HelpHint>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="(!saved || finished) && !compact">
      <ElButton :disabled="!canStart || busy" @click="start()">运行临时测试</ElButton>
      <ElButton v-if="stepNumber !== undefined" :disabled="!canStart || busy" @click="start(stepNumber)">调试当前步骤</ElButton>
    </template>
    <ElButton v-else-if="saved && !saved.sessionId" :disabled="disabled || busy" @click="start()">核对原测试请求</ElButton>
    <ElButton v-if="saved?.sessionId" :loading="busy" @click="refresh()">刷新测试结果</ElButton>
    <ElButton v-if="saved?.sessionId && detail && !finished && !detail.cancel_requested_at"
      :disabled="busy" @click="stop()">停止测试</ElButton>
    <template v-if="detail">
      <p v-if="!compact" class="test-status">{{ labels[detail.status] }}</p>
      <details v-if="compact" class="test-technical" aria-label="技术详情">
        <summary>技术详情</summary>
        <small>会话：{{ detail.session_id }}</small>
        <p>保存版本：{{ detail.candidate_version_id }}</p>
        <p v-if="detail.started_at">终端开始时间：<time :datetime="detail.started_at">{{ detail.started_at }}</time></p>
        <p v-if="detail.error_code">原始错误码：<code>{{ detail.error_code }}</code></p>
      </details>
      <details v-else class="test-identity"><summary>调试详情</summary><small>{{ detail.session_id }}</small><p>保存版本：{{ detail.candidate_version_id }}</p></details>
      <p v-if="detail.cancel_requested_at && !finished" class="test-warning">停止请求已发送，等待终端确认；当前结果仍未确定。</p>
      <p v-if="detail.started_at && !compact">终端开始时间：{{ new Date(detail.started_at).toLocaleString() }}</p>
      <p v-if="activeStep && !compact">当前执行步骤：{{ String(activeStep).padStart(2, '0') }}</p>
      <p v-if="detail.step_number != null && !compact">单步调试第 {{ detail.step_number }} 步。</p>
      <p v-if="detail.candidate_version_id !== script.current_version_id" class="test-warning">这是旧保存版本的测试。</p>
      <p v-if="detail.qualification_status && !compact">结果：{{ detail.qualification_status === 'passed' ? '通过' : '失败' }}</p>
      <p v-if="detail.error_code" class="test-cause">原因：{{ quickTestFailureReason(detail.error_code) }}<template v-if="!compact"> <code>{{ detail.error_code }}</code></template></p>
      <ElButton v-if="detail.failed_step_number && detail.candidate_version_id === script.current_version_id"
        :disabled="disabled" @click="emit('locate', detail.failed_step_number)">{{ detail.failure_detail?.rule_name ? '查看关联主步骤' : '定位第' }} {{ detail.failed_step_number }} {{ detail.failure_detail?.rule_name ? '' : '步' }}</ElButton>
    </template>
    <section v-if="saved?.sessionId && detail" aria-label="调试步骤日志">
      <strong>调试步骤日志</strong>
      <p v-if="eventsError" role="alert">{{ eventsError }}</p>
      <p v-if="!events.length">暂无终端执行事件。</p>
      <ol v-if="events.length">
        <li v-for="event in events" :key="event.sequence">
          {{ new Date(event.created_at).toLocaleTimeString() }} · {{ ruleEventLabel(event) || failureSkipLabel(event) || eventLabels[event.kind] }}
          <template v-if="(event.step_number || failureSkipEvent(event)?.step) && !ruleEventLabel(event)"> · 第 {{ event.step_number || failureSkipEvent(event)?.step }} 步</template>
          <template v-if="event.code && !ruleEventLabel(event) && !compact"> · {{ event.code }}</template>
          <details v-if="compact && event.code && !ruleEventLabel(event)" class="event-technical">
            <summary>详情</summary><code>{{ event.code }}</code>
          </details>
          <ElButton v-if="event.step_number && event.kind === 'step_failed' && detail.candidate_version_id === script.current_version_id"
            size="small" :disabled="disabled" @click="emit('locate', event.step_number)">定位</ElButton>
        </li>
      </ol>
      <article v-if="detail.qualification_status === 'failed' && detail.error_code" class="failure-summary" role="status">
        <strong>失败详情</strong>
        <template v-if="detail.failure_detail">
          <p v-for="(line, index) in quickTestFailureLines(detail.failure_detail)" :key="index">{{ line }}</p>
        </template>
        <p v-else>本次回执未包含匹配详情；{{ quickTestFailureReason(detail.error_code) }}。</p>
      </article>
      <ElButton v-if="moreEvents" :loading="eventsLoading" @click="loadEvents()">加载更多日志</ElButton>
    </section>
    <details v-if="saved?.sessionId && detail" aria-label="调试截图">
      <summary>调试截图 <HelpHint subject="调试截图">按需加载；调试截图完成后保留24小时，过期后列表可能为空。</HelpHint></summary>
      
      <ElButton :loading="screenshotsLoading" :disabled="screenshotsLoading" @click="loadScreenshots(true)">加载调试截图</ElButton>
      <p v-if="screenshotError" role="alert">{{ screenshotError }}</p>
      <p v-if="screenshotsLoaded && !screenshots.length && !screenshotError">暂无调试截图，可能尚未生成或已过期。</p>
      <article v-for="item in screenshots" :key="item.artifact_id" class="quick-test-screenshot">
        <strong>{{ item.file_name }}</strong>
        <small>{{ item.status }}</small>
        <ElButton v-if="item.downloadable" size="small" :loading="downloadingArtifact === item.artifact_id"
          :disabled="!!downloadingArtifact" @click="downloadScreenshot(item)">下载原件</ElButton>
        <span v-else>当前不可下载（可能尚未完成或已过期）</span>
      </article>
      <ElButton v-if="screenshotCursor" :loading="screenshotsLoading" :disabled="screenshotsLoading" @click="loadScreenshots()">加载更多截图</ElButton>
    </details>
  </section>
</template>

<style scoped>
.quick-test { display:flex; flex-wrap:wrap; align-items:start; gap:8px; min-width:0; }
.quick-test > p,.quick-test > section,.quick-test > details,.quick-test > .el-alert { flex:0 0 100%; box-sizing:border-box; margin:0; }
.quick-test :deep(.el-button + .el-button) { margin-left:0; }
.quick-test p,.quick-test small { font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.quick-test ol { padding:0; margin:10px 0; list-style:none; display:grid; gap:6px; }
.quick-test li { font-size:12px; padding:7px 8px; border-left:2px solid var(--border); background:var(--surface-soft); overflow-wrap:anywhere; }
.quick-test summary { cursor:pointer; font-size:12px; color:var(--muted); }
.quick-test > section,.quick-test > details { border-top:1px solid var(--border); padding-top:10px; }

.quick-test-screenshot { display: grid; gap: 6px; margin-top: 12px; overflow-wrap: anywhere; }
.quick-test-screenshot small { color: var(--el-text-color-secondary); }
.failure-summary { padding:8px; border-left:2px solid var(--el-color-danger); background:var(--el-color-danger-light-9); overflow-wrap:anywhere; }
.failure-summary p { margin:4px 0 0; }
.quick-test.compact > section[aria-label="调试步骤日志"] { display:flex; flex-direction:column; }
.quick-test.compact .failure-summary { order:-1; margin-bottom:10px; }
.event-technical { display:inline-block; margin-left:6px; }.event-technical code { display:block; overflow-wrap:anywhere; }
.quick-test.compact { gap:6px; }
.quick-test.compact .test-warning { color:var(--el-color-warning); font-weight:600; }
.quick-test.compact .test-cause { color:var(--el-color-danger); font-weight:600; }
.quick-test.compact .test-technical p { margin:4px 0 0; }
</style>
