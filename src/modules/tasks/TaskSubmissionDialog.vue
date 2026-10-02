<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption,
  ElButton, ElCheckbox, ElAlert, ElDatePicker } from 'element-plus'
import { fetchScripts, fetchStrategies } from '../../shared/api/maa'
import { fetchApplicableApplications, type ApplicableApplication } from '../../shared/api/maa-applicability'
import { fetchTargetDevice, fetchTerminals, fetchTargetDevices, type Terminal, type TargetDevice } from '../../shared/api/terminals'
import { submitTask, restorePendingTask, preservePendingTask, type TaskSubmission } from '../../shared/api/task-submission'
import { useCursorPage } from '../../shared/api/pagination'
import { ApiError } from '../../shared/api/client'
import { phoneAvailability } from '../../shared/presentation/phone-availability'

const opened = defineModel<boolean>({ required: true })
const emit = defineEmits<{ submitted: [id: string] }>()
const apps = ref<ApplicableApplication[]>([])
const appsError = ref('')
const terminals = useCursorPage<Terminal, string>(fetchTerminals, x => x.terminal_id)
const devices = useCursorPage<TargetDevice, string>(fetchTargetDevices, x => x.device_id)
const application = ref('')
const terminal = ref('')
const device = ref('')
const content = ref('')
const name = ref('')
const taskType = ref<'single' | 'loop' | 'timed'>('single')
const repeatCount = ref(1)
const startDate = ref('')
const endDate = ref('')
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai')
const dailyTimes = ref('09:00')
const timeout = ref(1800)
const retries = ref(0)
const recording = ref(false)
const error = ref('')
const busy = ref(false)
const loadingContent = ref(false)
const contents = ref<Array<{ id: string; name: string }>>([])
const scriptCursor = ref<string | null>(null)
const strategyCursor = ref<string | null>(null)
const pending = ref<TaskSubmission | null>(null)
const recoveryError = ref('')
try { pending.value = restorePendingTask() }
catch { recoveryError.value = '无法恢复待确认请求，请先核对任务历史及浏览器存储，暂不允许新下发。' }
let generation = 0
let appGeneration = 0
const linux = computed(() => terminals.items.value.filter(x => x.terminal_type === 'linux'))
const mounted = computed(() => devices.items.value.filter(x => x.managing_terminal_id === terminal.value && x.mode === 'mounted'))
const selectedPhone = computed(() => mounted.value.find(x => x.device_id === device.value))
let phoneTimer: ReturnType<typeof setInterval> | undefined
async function refreshSelectedPhone() {
  const id = device.value
  if (!opened.value || !id) return
  try {
    const latest = await fetchTargetDevice(id)
    if (device.value === id) devices.items.value = devices.items.value.map(
      item => item.device_id === id ? latest : item,
    )
  } catch {
    if (device.value === id) devices.items.value = devices.items.value.map(item =>
      item.device_id === id ? { ...item, availability: 'unknown', availability_reason: 'status_refresh_failed' } : item,
    )
  }
}
onMounted(() => { phoneTimer = setInterval(() => {
  if (document.visibilityState === 'visible') void refreshSelectedPhone()
}, 10000) })
onBeforeUnmount(() => clearInterval(phoneTimer))
watch(terminal, () => { device.value = '' })
watch(device, () => { application.value = ''; void loadApplicable(); void refreshSelectedPhone() })
watch(application, () => { void loadContent() })
watch(opened, value => {
  if (value) void Promise.all([terminals.load(true), devices.load(true)])
})
async function loadApplicable() {
  const current = ++appGeneration
  apps.value = []
  appsError.value = ''
  if (!device.value) return
  try {
    const result = await fetchApplicableApplications(device.value)
    if (current === appGeneration) apps.value = result
  } catch (cause) {
    if (current === appGeneration) appsError.value = cause instanceof Error ? cause.message : '读取适用分类失败'
  }
}
async function loadContent(more = false) {
  const version = ++generation
  if (!more) { contents.value = []; content.value = ''; scriptCursor.value = null; strategyCursor.value = null }
  if (!application.value) return
  loadingContent.value = true; error.value = ''
  try {
    const [scripts, strategies] = await Promise.all([
      !more || scriptCursor.value ? fetchScripts(application.value, scriptCursor.value) : null,
      !more || strategyCursor.value ? fetchStrategies(application.value, strategyCursor.value) : null,
    ])
    if (version !== generation) return
    const incoming = [
      ...(scripts?.items ?? []).filter(x => x.current_version_id && x.script_type !== 'standard').map(x => ({ id: 'script:' + x.script_id, name: '脚本：' + x.name })),
      ...(strategies?.items ?? []).filter(x => x.current_version_id).map(x => ({ id: 'strategy:' + x.strategy_id, name: '策略：' + x.name })),
    ]
    contents.value = [...new Map([...contents.value, ...incoming].map(x => [x.id, x])).values()]
    scriptCursor.value = scripts?.nextCursor ?? null
    strategyCursor.value = strategies?.nextCursor ?? null
  } catch (cause) { if (version === generation) error.value = cause instanceof Error ? cause.message : '读取已保存内容失败' }
  finally { if (version === generation) loadingContent.value = false }
}
async function send() {
  if (busy.value || recoveryError.value) return
  if (!pending.value) {
    if (!name.value.trim() || !content.value || !terminal.value || !device.value) {
      error.value = '请填写任务名并选择适用的已保存内容、Linux终端和挂载手机。'; return
    }
    const times = [...new Set(dailyTimes.value.split(/[,，\n]/).map(x => x.trim()).filter(Boolean))].sort()
    if (taskType.value === 'timed' && (!startDate.value || !endDate.value
      || endDate.value < startDate.value || !timezone.value.trim() || !times.length
      || times.length > 48 || times.some(x => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))) {
      error.value = '请填写有效日期范围、时区及每日时间（HH:mm，用逗号分隔，最多48个）。'; return
    }
    pending.value = {
      idempotency_key: crypto.randomUUID(), name: name.value.trim(), task_type: taskType.value,
      source_module: 'maa', logical_content_id: content.value,
      requested_terminal_id: terminal.value, requested_target_device_id: device.value,
      timeout_seconds: timeout.value, max_retries: retries.value, record_video: recording.value,
      ...(taskType.value === 'loop' ? { loop: { repeat_count: repeatCount.value } } : {}),
      ...(taskType.value === 'timed' ? { timed: {
        timezone: timezone.value.trim(), start_date: startDate.value,
        end_date: endDate.value, daily_times: times,
      } } : {}),
    }
  }
  busy.value = true; error.value = ''
  try {
    preservePendingTask(pending.value)
    const result = await submitTask(pending.value)
    preservePendingTask(null)
    pending.value = null; opened.value = false; emit('submitted', result.task_id)
  } catch (cause) {
    if (cause instanceof ApiError && [400, 422].includes(cause.status ?? 0)) {
      preservePendingTask(null)
      pending.value = null
      error.value = cause.message + '。请修改参数后重新提交。'
      return
    }
    error.value = (cause instanceof Error ? cause.message : '提交未确认') + '。原请求已保留，可重试同一请求；不要重复新建。'
  } finally { busy.value = false }
}
</script>
<template>
  <ElDialog v-model="opened" title="下发Maa任务" width="min(660px, 95vw)" :close-on-click-modal="!busy" :show-close="!busy">
    <ElAlert v-if="error" type="error" :title="error" :closable="false" />
    <ElAlert v-if="recoveryError" type="error" :title="recoveryError" :closable="false" />
    <ElAlert v-if="pending" type="warning" title="提交结果尚未确认，表单锁定；重试使用原请求身份和参数。" :closable="false" />
    <ElForm class="task-submission-form form-grid" label-position="top" :disabled="busy || !!pending">
      <ElFormItem class="wide" label="任务名称"><ElInput v-model="name" :maxlength="160" /></ElFormItem>
      <ElFormItem :class="{ wide: taskType !== 'loop' }" label="执行方式">
        <ElSelect v-model="taskType"><ElOption label="单次" value="single" /><ElOption label="循环" value="loop" /><ElOption label="定时" value="timed" /></ElSelect>
      </ElFormItem>
      <ElFormItem v-if="taskType === 'loop'" label="循环次数"><ElInputNumber v-model="repeatCount" :min="1" :max="10000" :precision="0" /></ElFormItem>
      <template v-if="taskType === 'timed'">
        <ElFormItem label="开始日期"><ElDatePicker v-model="startDate" type="date" value-format="YYYY-MM-DD" /></ElFormItem>
        <ElFormItem label="结束日期"><ElDatePicker v-model="endDate" type="date" value-format="YYYY-MM-DD" /></ElFormItem>
        <ElFormItem label="时区"><ElInput v-model="timezone" placeholder="Asia/Shanghai" /></ElFormItem>
        <ElFormItem label="每日时间（逗号分隔）"><ElInput v-model="dailyTimes" placeholder="09:00,18:30" /></ElFormItem>
      </template>
      <ElFormItem label="Linux终端">
        <ElSelect v-model="terminal"><ElOption v-for="x in linux" :key="x.terminal_id" :value="x.terminal_id" :label="x.display_name + ' / ' + x.service_status" /></ElSelect>
        <ElButton v-if="terminals.nextCursor.value" @click="terminals.load()">更多终端</ElButton>
      </ElFormItem>
      <ElFormItem label="挂载手机">
        <ElSelect v-model="device"><ElOption v-for="x in mounted" :key="x.device_id" :value="x.device_id" :label="`${x.display_name}（${phoneAvailability(x).label}）`" /></ElSelect>
        <ElButton v-if="devices.nextCursor.value" @click="devices.load()">更多手机</ElButton>
        <span v-if="selectedPhone && selectedPhone.availability !== 'connected'">{{ phoneAvailability(selectedPhone).guidance }} 任务可创建，执行将等待手机可用。</span>
      </ElFormItem>
      <ElFormItem label="适用应用分类">
        <ElSelect v-model="application" :disabled="!device"><ElOption v-for="x in apps" :key="x.application_id" :label="x.display_name" :value="x.application_id" /></ElSelect>
        <span v-if="device && !apps.length">这台手机尚无适用分类，请先在脚本库授权。</span>
      </ElFormItem>
      <ElFormItem label="已保存脚本／策略">
        <ElSelect v-model="content" :loading="loadingContent"><ElOption v-for="x in contents" :key="x.id" :value="x.id" :label="x.name" /></ElSelect>
        <ElButton v-if="scriptCursor || strategyCursor" :disabled="loadingContent" @click="loadContent(true)">更多内容</ElButton>
      </ElFormItem>
      <ElFormItem label="执行超时（秒，最多4小时）"><ElInputNumber v-model="timeout" :min="1" :max="14400" :precision="0" /></ElFormItem>
      <ElFormItem label="失败重试次数"><ElInputNumber v-model="retries" :min="0" :max="100" :precision="0" /></ElFormItem>
      <ElCheckbox class="wide" v-model="recording">录制执行过程</ElCheckbox>
    </ElForm>
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">下发任务 </span></template>
    <ElAlert v-if="appsError" type="error" :title="appsError" />
    <ElAlert v-for="(cause, index) in [terminals.error.value, devices.error.value].filter(Boolean)" :key="index" type="error" :title="cause?.message" />
    <template #footer><ElButton type="primary" :disabled="!!recoveryError" :loading="busy" @click="send">{{ pending ? '重试原请求' : '下发任务' }}</ElButton></template>
  </ElDialog>
</template>
<style scoped>
.task-submission-form { margin-top: 12px; }
.wide { grid-column: 1 / -1; }
.task-submission-form :deep(.el-form-item) { margin-bottom: 14px; }
.task-submission-form :deep(.el-form-item__content) { gap: 6px; align-content: start; }
.task-submission-form :deep(.el-input-number) { width: 160px; max-width: 100%; }
.task-submission-form :deep(.el-date-editor) { width: 100%; }
.task-submission-form :deep(.el-form-item__content > span) { color: var(--muted); font-size: 12px; line-height: 1.5; }
</style>
