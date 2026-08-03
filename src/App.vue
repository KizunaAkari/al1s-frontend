<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Moon, Sunny } from '@element-plus/icons-vue'
import { api } from './api.ts'
import './deployment.css'
import UserGuideDrawer from './components/UserGuideDrawer.vue'
import VisualScriptEditor from './components/VisualScriptEditor.vue'
import { displayScriptName } from './script-editor'
import type { Agent, AgentLog, Command, FailureRecord, MaintenanceStatus, NotificationSettingsPayload, NotificationStatus, Overview, SavedScript, Task, TerminalArtifact, TerminalDeployment } from './types'

const overview = ref<Overview>({ agents_total: 0, agents_online: 0, tasks_running: 0, tasks_succeeded: 0, tasks_failed: 0, failure_records: 0 })
const agents = ref<Agent[]>([])
const tasks = ref<Task[]>([])
const failures = ref<FailureRecord[]>([])
const notification = ref<NotificationStatus>({
  smtp_configured: false,
  failure_email_enabled: false,
  failure_enabled: false,
  recipients: [],
  from: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  security: 'starttls',
  public_base_url: 'http://127.0.0.1:8000',
  password_configured: false,
  source: 'environment',
})
const notificationForm = ref<NotificationSettingsPayload>({
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  clear_password: false,
  smtp_from: '',
  security: 'starttls',
  failure_recipients: [],
  failure_enabled: false,
  public_base_url: 'http://127.0.0.1:8000',
})
const notificationRecipients = ref('')
const testEmailRecipient = ref('')
const notificationSaving = ref(false)
const notificationTesting = ref(false)
const logs = ref<AgentLog[]>([])
const deploymentDialog = ref(false)
const deploymentAgent = ref<Agent | null>(null)
const deploymentArtifacts = ref<TerminalArtifact[]>([])
const deploymentArtifactName = ref('')
const deploymentLoading = ref(false)
const deploymentUploading = ref(false)
const deploymentFileInput = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const editorPathMatch = window.location.pathname.match(/^\/editor\/([^/]+)$/)
const editorPathAgentId = editorPathMatch ? decodeURIComponent(editorPathMatch[1]) : ''
const activeTab = ref(editorPathAgentId ? 'editor' : 'terminals')
const selectedAgentId = ref(editorPathAgentId)
const commandDialog = ref(false)
const commandResult = ref<Command | null>(null)
const taskCreateDialog = ref(false)
const taskSubmitting = ref(false)
const retryingTaskId = ref('')
const deletingTaskId = ref('')
const taskScripts = ref<SavedScript[]>([])
const taskForm = ref({
  agent_id: '',
  name: '',
  dispatch_kind: 'standard' as 'standard' | 'composition',
  script_names: [] as string[],
  composition_modules: [] as Array<{ id: string; script_name: string; interval_after_seconds: number }>,
  mode: 'once' as 'once' | 'repeat' | 'scheduled',
  repeat_count: 2,
  schedule_dates: [] as string[],
  daily_start_time: '09:00:00',
  daily_end_time: '10:00:00',
  max_retries: 0,
  record_video: false,
})
const taskDetailDialog = ref(false)
const selectedTask = ref<Task | null>(null)
const maintenanceDialog = ref(false)
const maintenanceLoading = ref(false)
const maintenance = ref<MaintenanceStatus | null>(null)
const cleanupForm = ref({ target: 'recordings' as 'recordings' | 'task_history' | 'all', older_than_days: 30, include_failure_evidence: false })
const failureDialog = ref(false)
const selectedFailure = ref<FailureRecord | null>(null)
const confirmingFailureId = ref('')
const deletingFailureId = ref('')
const logDrawer = ref(false)
const guideDrawer = ref(false)
let timer: number | undefined

type ThemeMode = 'dark' | 'light'
const storedTheme = window.localStorage.getItem('maa-console-theme')
const theme = ref<ThemeMode>(storedTheme === 'dark' ? 'dark' : 'light')

function applyTheme(value: ThemeMode) {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'light' ? '#ffffff' : '#080d14')
  window.localStorage.setItem('maa-console-theme', value)
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
}

applyTheme(theme.value)

const standardTaskScripts = computed(() => taskScripts.value.filter((item) => item.valid !== false && item.script_type === 'standard'))
const startModuleScripts = computed(() => taskScripts.value.filter((item) => item.valid !== false && item.script_type === 'module_start'))
const processModuleScripts = computed(() => taskScripts.value.filter((item) => item.valid !== false && item.script_type === 'module_process'))
const selectedCompositionStart = computed(() => taskScripts.value.find((item) => item.name === taskForm.value.composition_modules[0]?.script_name))
const compositionCategoryPackage = computed(() => selectedCompositionStart.value?.category_package || '')
const compositionCategoryLabel = computed(() => selectedCompositionStart.value?.category_name || compositionCategoryPackage.value)
const compositionProcessScripts = computed(() => {
  if (!compositionCategoryPackage.value) return processModuleScripts.value
  return processModuleScripts.value.filter((item) => item.category_package === compositionCategoryPackage.value)
})
const displayTasks = computed(() => [...tasks.value].sort((left, right) => {
  const rank = (status: string) => ({ running: 0, queued: 1, scheduled: 2 }[status] ?? 3)
  const rankDifference = rank(left.status) - rank(right.status)
  if (rankDifference) return rankDifference
  const leftTime = new Date(left.created_at).getTime()
  const rightTime = new Date(right.created_at).getTime()
  return rank(left.status) < 3 ? leftTime - rightTime : rightTime - leftTime
}))
const pageMeta = computed(() => ({
  terminals: { eyebrow: '', title: '终端工作台', description: '查看开发板、Android 手机和任务服务状态。' },
  tasks: { eyebrow: '', title: '测试任务', description: '组合脚本、安排执行计划并跟踪运行结果。' },
  failures: { eyebrow: '', title: '失败记录', description: '查看失败步骤、现场截图和邮件发送状态。' },
  notifications: { eyebrow: '', title: '通知设置', description: '配置失败告警、SMTP 服务和收件人。' },
  editor: { eyebrow: '', title: '脚本编辑器', description: '' },
}[activeTab.value] || { eyebrow: 'MAA CONSOLE', title: '控制中心', description: '' }))
const plannedTaskCount = computed(() => {
  const scripts = taskForm.value.dispatch_kind === 'composition' ? 1 : taskForm.value.script_names.length
  if (taskForm.value.mode === 'repeat') return scripts * taskForm.value.repeat_count
  if (taskForm.value.mode === 'scheduled' && taskForm.value.schedule_dates.length === 2) {
    const start = new Date(`${taskForm.value.schedule_dates[0]}T00:00:00`)
    const end = new Date(`${taskForm.value.schedule_dates[1]}T00:00:00`)
    return scripts * (Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000)) + 1)
  }
  return scripts
})

function compositionId() {
  return globalThis.crypto?.randomUUID?.() || `composition-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function savedScript(name: string) {
  return taskScripts.value.find((item) => item.name === name)
}

function processScriptsForStart(startName: string) {
  const categoryPackage = savedScript(startName)?.category_package
  if (!categoryPackage) return processModuleScripts.value
  return processModuleScripts.value.filter((item) => item.category_package === categoryPackage)
}

function initializeCompositionModules() {
  const current = taskForm.value.composition_modules
  const startNames = new Set(startModuleScripts.value.map((item) => item.name))
  const startName = current[0] && startNames.has(current[0].script_name)
    ? current[0].script_name
    : (startModuleScripts.value[0]?.name || '')
  const availableProcesses = processScriptsForStart(startName)
  const processNames = new Set(availableProcesses.map((item) => item.name))
  const processes = current.slice(1).filter((item) => processNames.has(item.script_name))
  if (!processes.length && availableProcesses.length) {
    const preferred = availableProcesses.find((item) => item.cleanup_on_finish) || availableProcesses[0]
    processes.push({ id: compositionId(), script_name: preferred.name, interval_after_seconds: 0 })
  }
  taskForm.value.composition_modules = [
    { id: current[0]?.id || compositionId(), script_name: startName, interval_after_seconds: current[0]?.interval_after_seconds || 0 },
    ...processes,
  ]
}

function changeDispatchKind() {
  if (taskForm.value.dispatch_kind === 'composition') initializeCompositionModules()
}

function changeCompositionStart() {
  initializeCompositionModules()
}

function addCompositionProcess() {
  const preferred = compositionProcessScripts.value.find((item) => !item.cleanup_on_finish) || compositionProcessScripts.value[0]
  if (!preferred) {
    return ElMessage.warning(compositionCategoryLabel.value
      ? `分类“${compositionCategoryLabel.value}”下没有可用的过程脚本`
      : '请先在脚本编辑器中创建过程脚本')
  }
  taskForm.value.composition_modules.push({
    id: compositionId(),
    script_name: preferred.name,
    interval_after_seconds: 0,
  })
}

function removeCompositionProcess(index: number) {
  if (index <= 0) return
  taskForm.value.composition_modules.splice(index, 1)
}

function moveCompositionProcess(index: number, offset: number) {
  const target = index + offset
  if (index <= 0 || target <= 0 || target >= taskForm.value.composition_modules.length) return
  const [item] = taskForm.value.composition_modules.splice(index, 1)
  taskForm.value.composition_modules.splice(target, 0, item)
}

function formatTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function statusType(status: string) {
  if (['online', 'succeeded'].includes(status)) return 'success'
  if (['running', 'claimed', 'queued', 'pending'].includes(status)) return 'warning'
  if (['failed', 'offline'].includes(status)) return 'danger'
  return 'info'
}

function formatBytes(value?: number) {
  if (value == null) return '—'
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  return `${(value / 1024 ** 3).toFixed(2)} GiB`
}

function recordingExtension(item: Task) {
  return item.recording_mime === 'application/zip' ? 'zip' : 'mp4'
}

function taskScriptUrl(item: Task) {
  return `/api/tasks/${encodeURIComponent(item.id)}/script`
}

function scheduleLabel(item: Task) {
  if (item.schedule_type === 'scheduled') return `定时 ${formatTime(item.scheduled_for)}`
  if (item.schedule_type === 'repeat') return `循环 ${item.run_index || 1}/${item.run_total || 1}`
  if (item.schedule_type === 'retry') {
    const retryNumber = Math.max(1, (item.attempt || 1) - 1)
    const retryLimit = Math.max(item.max_retries || 0, retryNumber)
    return `重试 ${retryNumber}/${retryLimit}`
  }
  return '单次'
}

function attemptTotal(item: Task) {
  return Math.max((item.max_retries || 0) + 1, item.attempt || 1)
}

function queueLabel(item: Task) {
  if (item.status === 'running') return '执行中'
  if (item.status === 'scheduled') return '未到时间'
  if (item.status !== 'queued') return '—'
  const queue = tasks.value
    .filter((candidate) => candidate.agent_id === item.agent_id && candidate.status === 'queued')
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
  const position = queue.findIndex((candidate) => candidate.id === item.id)
  return position < 0 ? '排队' : `#${position + 1}`
}

function serviceState(agent: Agent): 'offline' | 'legacy' | 'busy' | 'stopped' | 'running' {
  if (agent.status !== 'online') return 'offline'
  const service = agent.metadata?.metadata?.service
  if (!service && agent.capabilities?.task_service_control !== true) return 'legacy'
  if (service?.automation_active || service?.state === 'busy') return 'busy'
  if (service?.accepting_tasks === false || service?.state === 'stopped') return 'stopped'
  return 'running'
}

function serviceStateLabel(agent: Agent) {
  const labels = { offline: 'Agent 离线', legacy: '等待 Agent 升级', busy: '任务执行中', stopped: '已停止接单', running: '可接收任务' }
  return labels[serviceState(agent)]
}

function serviceStateType(agent: Agent) {
  const state = serviceState(agent)
  if (state === 'running') return 'success'
  if (state === 'busy') return 'warning'
  if (state === 'offline') return 'danger'
  return 'info'
}

function formatDuration(startedAt?: string, finishedAt?: string) {
  if (!startedAt) return '—'
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
}

function agentName(agentId: string) {
  return agents.value.find((item) => item.id === agentId)?.name || agentId
}

function agentServiceLabel(agentId: string) {
  const agent = agents.value.find((item) => item.id === agentId)
  return agent ? serviceStateLabel(agent) : '终端状态未知'
}

async function refresh(silent = false) {
  if (!silent) loading.value = true
  try {
    const [summary, agentList, taskList, failureList, notificationStatus] = await Promise.all([
      api.overview(), api.agents(), api.tasks(), api.failures(), api.notificationStatus(),
    ])
    overview.value = summary
    agents.value = agentList
    tasks.value = taskList
    failures.value = failureList
    notification.value = notificationStatus
    if (!selectedAgentId.value && agentList.length) selectedAgentId.value = agentList[0].id
  } catch (error) {
    if (!silent) ElMessage.error(`无法连接控制中心：${String(error)}`)
  } finally {
    loading.value = false
  }
}

async function pollCommand(commandId: string) {
  commandDialog.value = true
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(0.1, (deadline - Date.now()) / 1000)
    const value = await api.waitCommand(commandId, Math.min(15, remainingSeconds))
    commandResult.value = value
    if (['succeeded', 'failed', 'cancelled'].includes(value.status)) return value
  }
  return commandResult.value
}

async function runAction(agent: Agent, action: string, confirmText?: string) {
  try {
    if (confirmText) await ElMessageBox.confirm(confirmText, '设备操作确认', { type: 'warning' })
    const response = await api.action(agent.id, action)
    ElMessage.success(`命令已下发：${response.command_id.slice(0, 8)}`)
    await pollCommand(response.command_id)
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(String(error))
  }
}

async function openTaskCreateDialog() {
  const agentId = selectedAgentId.value || agents.value[0]?.id
  if (!agentId) return ElMessage.warning('请先连接一个测试终端')
  taskForm.value = {
    agent_id: agentId,
    name: `测试任务 ${new Date().toLocaleTimeString('zh-CN')}`,
    dispatch_kind: 'standard',
    script_names: [],
    composition_modules: [],
    mode: 'once',
    repeat_count: 2,
    schedule_dates: [],
    daily_start_time: '09:00:00',
    daily_end_time: '10:00:00',
    max_retries: 0,
    record_video: false,
  }
  await loadTaskScripts(agentId)
  taskCreateDialog.value = true
}

async function loadTaskScripts(agentId: string) {
  try {
    taskScripts.value = agentId ? await api.listScripts(agentId) : []
    const available = new Set(standardTaskScripts.value.map((item) => item.name))
    taskForm.value.script_names = taskForm.value.script_names.filter((name) => available.has(name))
    initializeCompositionModules()
  } catch (error) {
    taskScripts.value = []
    ElMessage.error(`读取终端脚本失败：${apiErrorMessage(error)}`)
  }
}

async function dispatchTask() {
  if (!taskForm.value.agent_id) return ElMessage.warning('请选择终端')
  taskSubmitting.value = true
  try {
    if (taskForm.value.mode === 'scheduled' && taskForm.value.schedule_dates.length !== 2) throw new Error('请选择定时任务的开始和结束日期')
    const common = {
      agent_id: taskForm.value.agent_id,
      mode: taskForm.value.mode,
      repeat_count: taskForm.value.repeat_count,
      schedule_start_date: taskForm.value.schedule_dates[0] || undefined,
      schedule_end_date: taskForm.value.schedule_dates[1] || undefined,
      daily_start_time: taskForm.value.daily_start_time,
      daily_end_time: taskForm.value.daily_end_time,
      max_retries: taskForm.value.max_retries,
      record_video: taskForm.value.record_video,
    }
    let result
    if (taskForm.value.dispatch_kind === 'composition') {
      const modules = taskForm.value.composition_modules
      if (modules.length < 2 || !modules[0].script_name) throw new Error('组合任务需要一个开始脚本和至少一个过程脚本')
      const first = savedScript(modules[0].script_name)
      if (first?.script_type !== 'module_start') throw new Error('组合队列第一个脚本必须是开始脚本')
      for (const [index, module] of modules.slice(1).entries()) {
        const script = savedScript(module.script_name)
        if (script?.script_type !== 'module_process') throw new Error(`组合队列第 ${index + 2} 项必须是过程脚本`)
        const isLast = index === modules.length - 2
        if (!isLast && script.cleanup_on_finish) throw new Error(`过程脚本“${script.name}”会清理应用，只能放在最后`)
        if (isLast && !script.cleanup_on_finish) throw new Error('最后一个过程脚本必须启用清理和关闭应用')
      }
      modules[modules.length - 1].interval_after_seconds = 0
      result = await api.createTaskComposition({
        ...common,
        name: taskForm.value.name.trim() || '模块化组合任务',
        modules: modules.map((item) => ({
          script_name: item.script_name,
          interval_after_seconds: item.interval_after_seconds,
        })),
      })
    } else {
      if (!taskForm.value.script_names.length) throw new Error('至少选择一个普通脚本')
      const items = taskForm.value.script_names.map((scriptName) => {
        const saved = taskScripts.value.find((item) => item.name === scriptName)
        const script = saved?.content
        if (!script) throw new Error(`脚本不存在：${scriptName}`)
        if (saved && saved.script_type !== 'standard') throw new Error(`普通任务不能选择模块脚本：${scriptName}`)
        JSON.parse(script)
        return {
          name: taskForm.value.script_names.length === 1 && taskForm.value.name.trim() ? taskForm.value.name.trim() : displayScriptName(scriptName),
          script_name: scriptName,
          script,
        }
      })
      result = await api.createTaskBatch({ ...common, items })
    }
    ElMessage.success(`已创建 ${result.count} 条任务运行记录`)
    taskCreateDialog.value = false
    activeTab.value = 'tasks'
    await refresh(true)
  } catch (error) {
    ElMessage.error(`脚本或任务创建失败：${apiErrorMessage(error)}`)
  } finally {
    taskSubmitting.value = false
  }
}

async function cancelTask(item: Task) {
  try {
    await ElMessageBox.confirm(`确认取消排队任务“${item.name}”？`, '取消任务', { type: 'warning' })
    await api.cancelTask(item.id)
    ElMessage.success('任务已取消')
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  }
}

async function retryTask(item: Task) {
  try {
    await ElMessageBox.confirm(
      item.task_kind === 'composition'
        ? `将重新排队组合任务“${item.name}”。如果已有失败模块定位信息，会从断点继续。确认重试？`
        : `将重新排队任务“${item.name}”。确认重试？`,
      '重试任务',
      { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' },
    )
    retryingTaskId.value = item.id
    const retry = await api.retryTask(item.id)
    ElMessage.success(`已加入队尾：${retry.name}`)
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  } finally {
    retryingTaskId.value = ''
  }
}

function isFinishedTask(item: Task) {
  return ['succeeded', 'failed', 'cancelled'].includes(item.status)
}

async function deleteTask(item: Task) {
  if (!isFinishedTask(item)) return
  try {
    await ElMessageBox.confirm(
      `确认删除已执行任务“${item.name}”？任务记录将不可恢复，失败记录需在失败记录中单独删除。`,
      '删除任务记录',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    deletingTaskId.value = item.id
    await api.deleteTask(item.id)
    if (selectedTask.value?.id === item.id) {
      selectedTask.value = null
      taskDetailDialog.value = false
    }
    ElMessage.success('任务记录已删除')
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  } finally {
    deletingTaskId.value = ''
  }
}

function openTask(item: Task) {
  selectedTask.value = item
  taskDetailDialog.value = true
}

async function openMaintenance() {
  maintenanceDialog.value = true
  maintenanceLoading.value = true
  try {
    maintenance.value = await api.maintenanceStatus()
  } catch (error) {
    ElMessage.error(`读取存储状态失败：${apiErrorMessage(error)}`)
  } finally {
    maintenanceLoading.value = false
  }
}

async function runCleanup() {
  const targetLabel = cleanupForm.value.target === 'recordings' ? '录屏缓存' : '已完成任务历史'
  try {
    await ElMessageBox.confirm(
      `将清理 ${cleanupForm.value.older_than_days === 0 ? '全部' : `${cleanupForm.value.older_than_days} 天前的`}${targetLabel}，正在执行和排队的任务不受影响。是否继续？`,
      '清理确认',
      { type: 'warning' },
    )
    maintenanceLoading.value = true
    const result = await api.cleanup(cleanupForm.value)
    ElMessage.success(`清理完成，释放 ${formatBytes(Number(result.removed_bytes || 0))}`)
    await refresh(true)
    maintenance.value = await api.maintenanceStatus()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  } finally {
    maintenanceLoading.value = false
  }
}

function showCommandResult(command: Command) {
  commandResult.value = command
  commandDialog.value = true
  refresh(true)
}

function navigateFromGuide(tab: string) {
  activeTab.value = tab
  guideDrawer.value = false
}

function emailStatusType(status: string) {
  if (status === 'sent') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'failed') return 'danger'
  return 'info'
}

function failedStepLabel(item: FailureRecord) {
  type FailedModule = { position?: number; index?: number; name?: string; step_number?: number; step_index?: number; interval?: boolean }
  const failedStep = item.result?.failed_step as { module?: FailedModule } | undefined
  const module = (item.result?.failed_module as FailedModule | undefined) || failedStep?.module
  if (module?.name) {
    const modulePosition = module.position ?? (module.index == null ? undefined : module.index + 1)
    const stepNumber = module.step_number ?? (module.step_index == null ? undefined : module.step_index + 1)
    const position = modulePosition == null ? '?' : `#${String(modulePosition).padStart(2, '0')}`
    const moduleName = displayScriptName(module.name)
    return `组合脚本 ${position} · ${moduleName} · ${module.interval ? '执行间隔' : `第 ${String(stepNumber ?? '?').padStart(2, '0')} 步`}`
  }
  if (item.failed_step_index == null) return '初始化/未知'
  return `第 ${item.failed_step_index + 1} 步 · ${item.failed_step_action || 'unknown'}`
}

function openFailure(item: FailureRecord) {
  selectedFailure.value = item
  failureDialog.value = true
}

async function confirmFailure(item: FailureRecord) {
  if (item.confirmed) return
  try {
    await ElMessageBox.confirm(
      `确认已处理失败步骤“${failedStepLabel(item)}”？确认后不会再计入左侧失败统计，但记录和截图仍会保留。`,
      '确认失败记录',
      { type: 'warning', confirmButtonText: '确认已处理', cancelButtonText: '取消' },
    )
    confirmingFailureId.value = item.id
    const updated = await api.confirmFailure(item.id)
    const index = failures.value.findIndex((failureItem) => failureItem.id === item.id)
    if (index >= 0) failures.value[index] = updated
    if (selectedFailure.value?.id === item.id) selectedFailure.value = updated
    ElMessage.success('失败记录已确认')
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  } finally {
    confirmingFailureId.value = ''
  }
}

async function deleteFailure(item: FailureRecord) {
  try {
    await ElMessageBox.confirm(
      `确认永久删除失败记录“${displayScriptName(item.script_name)}”？现场截图也会删除。`,
      '删除失败记录',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    deletingFailureId.value = item.id
    await api.deleteFailure(item.id)
    if (selectedFailure.value?.id === item.id) {
      selectedFailure.value = null
      failureDialog.value = false
    }
    ElMessage.success('失败记录已删除')
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(apiErrorMessage(error))
  } finally {
    deletingFailureId.value = ''
  }
}

function isTronlongNpu(agent: Agent) {
  const metadata = (agent.metadata || {}) as Record<string, unknown>
  const machine = String(metadata.machine || metadata.architecture || '').toLowerCase()
  const yolo = agent.capabilities?.yolo === true
  const marker = [agent.id, agent.name, metadata.kernel, (metadata.yolo as Record<string, unknown> | undefined)?.provider]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return yolo && (machine === 'arm64' || machine === 'aarch64' || marker.includes('rk3576')) && (
    marker.includes('rk3576') || marker.includes('tronlong') || marker.includes('创龙')
  )
}

function terminalArtifactLabel(item: TerminalArtifact) {
  return `${item.name} · ${formatBytes(item.size_bytes)} · ${item.sha256.slice(0, 12)}`
}

async function openDeployment(agent: Agent) {
  deploymentAgent.value = agent
  deploymentArtifactName.value = ''
  deploymentDialog.value = true
  deploymentLoading.value = true
  try {
    deploymentArtifacts.value = await api.terminalArtifacts()
    deploymentArtifactName.value = deploymentArtifacts.value[0]?.name || ''
    if (!deploymentArtifacts.value.length) ElMessage.warning('平台缓存中还没有终端镜像，请先上传 .tar 或 .tar.gz')
  } catch (error) {
    ElMessage.error(`读取平台缓存失败：${apiErrorMessage(error)}`)
  } finally {
    deploymentLoading.value = false
  }
}

async function uploadDeploymentArtifact(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  deploymentUploading.value = true
  try {
    const artifact = await api.uploadTerminalArtifact(file)
    deploymentArtifacts.value = [artifact, ...deploymentArtifacts.value.filter((item) => item.name !== artifact.name)]
    deploymentArtifactName.value = artifact.name
    ElMessage.success(`已缓存 ${artifact.name}`)
  } catch (error) {
    ElMessage.error(`上传终端镜像失败：${apiErrorMessage(error)}`)
  } finally {
    deploymentUploading.value = false
  }
}

async function deploySelectedTerminal() {
  const agent = deploymentAgent.value
  if (!agent || !deploymentArtifactName.value) return ElMessage.warning('请先选择平台缓存镜像')
  try {
    await ElMessageBox.confirm(
      `将把 ${deploymentArtifactName.value} 部署到“${agent.name}”。部署期间会重建终端容器，当前任务需要先停止。是否继续？`,
      '部署创龙 NPU 容器',
      { type: 'warning', confirmButtonText: '开始部署', cancelButtonText: '取消' },
    )
    deploymentLoading.value = true
    let result: TerminalDeployment = await api.deployTerminal(agent.id, deploymentArtifactName.value)
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline && !['succeeded', 'failed', 'rolled_back'].includes(result.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      result = await api.terminalDeploymentStatus(agent.id, result.deployment_id)
    }
    if (result.status === 'succeeded') {
      ElMessage.success('终端 NPU 容器部署成功')
    } else if (result.status === 'rolled_back') {
      ElMessage.warning(`部署失败，已回滚：${result.message || '请查看终端部署日志'}`)
    } else if (result.status === 'failed') {
      ElMessage.error(`终端部署失败：${result.message || '请查看终端部署日志'}`)
    } else {
      ElMessage.warning('部署仍在后台执行，可稍后重新打开查看状态')
    }
    await refresh(true)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(`终端部署失败：${apiErrorMessage(error)}`)
  } finally {
    deploymentLoading.value = false
  }
}

function apiErrorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : String(error)
}

async function loadNotificationSettings() {
  try {
    const value = await api.notificationSettings()
    notification.value = value
    notificationForm.value = {
      smtp_host: value.smtp_host,
      smtp_port: value.smtp_port,
      smtp_user: value.smtp_user,
      smtp_password: '',
      clear_password: false,
      smtp_from: value.from,
      security: value.security,
      failure_recipients: [...value.recipients],
      failure_enabled: value.failure_enabled,
      public_base_url: value.public_base_url,
    }
    notificationRecipients.value = value.recipients.join(', ')
    if (!testEmailRecipient.value) testEmailRecipient.value = value.recipients[0] || ''
  } catch (error) {
    ElMessage.error(`读取通知设置失败：${apiErrorMessage(error)}`)
  }
}

async function saveNotificationSettings() {
  notificationSaving.value = true
  try {
    const recipients = notificationRecipients.value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const value = await api.saveNotificationSettings({
      ...notificationForm.value,
      smtp_password: notificationForm.value.smtp_password || undefined,
      failure_recipients: recipients,
    })
    notification.value = value
    notificationForm.value.smtp_password = ''
    notificationForm.value.clear_password = false
    notificationForm.value.failure_recipients = [...value.recipients]
    notificationRecipients.value = value.recipients.join(', ')
    if (!testEmailRecipient.value) testEmailRecipient.value = value.recipients[0] || ''
    ElMessage.success('通知设置已保存')
  } catch (error) {
    ElMessage.error(`保存通知设置失败：${apiErrorMessage(error)}`)
  } finally {
    notificationSaving.value = false
  }
}

async function sendTestNotification() {
  notificationTesting.value = true
  try {
    const result = await api.testNotification(testEmailRecipient.value.trim())
    ElMessage.success(`测试邮件已发送至 ${result.to.join(', ')}`)
  } catch (error) {
    ElMessage.error(apiErrorMessage(error))
  } finally {
    notificationTesting.value = false
  }
}

async function loadLogs(agent: Agent) {
  try {
    logs.value = await api.logs(agent.id)
    selectedAgentId.value = agent.id
    logDrawer.value = true
  } catch (error) {
    ElMessage.error(String(error))
  }
}

onMounted(async () => {
  await refresh()
  await loadNotificationSettings()
  const requestedFailureId = new URLSearchParams(window.location.search).get('failure')
  if (requestedFailureId) {
    try {
      openFailure(await api.failure(requestedFailureId))
      activeTab.value = 'failures'
    } catch (error) {
      ElMessage.error(`无法打开失败记录：${String(error)}`)
    }
  }
  timer = window.setInterval(() => refresh(true), 5000)
})
onBeforeUnmount(() => timer && window.clearInterval(timer))
</script>

<template>
  <div class="shell">
    <aside class="app-sidebar">
      <div class="sidebar-brand">
        <img class="brand-mark" src="/maa-studio-logo.png" alt="AL-1S 脚本站图标" />
        <div><strong>AL-1S 脚本站</strong><small>基于 maa framework</small></div>
      </div>
      <nav class="sidebar-nav" aria-label="控制台导航">
        <button type="button" :class="{ active: activeTab === 'terminals' }" @click="activeTab = 'terminals'"><span>◉</span><div><strong>终端工作台</strong><small>设备与服务</small></div></button>
        <button type="button" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'"><span>▣</span><div><strong>任务中心</strong><small>队列与计划</small></div><em v-if="overview.tasks_running">{{ overview.tasks_running }}</em></button>
        <button type="button" :class="{ active: activeTab === 'failures' }" @click="activeTab = 'failures'"><span>!</span><div><strong>失败记录</strong><small>截图与诊断</small></div><em v-if="overview.failure_records" class="danger failure-count-badge">{{ overview.failure_records }}</em></button>
        <button type="button" :class="{ active: activeTab === 'editor' }" @click="activeTab = 'editor'"><span>◇</span><div><strong>脚本编辑器</strong><small>流程与画面</small></div></button>
        <button type="button" :class="{ active: activeTab === 'notifications' }" @click="activeTab = 'notifications'"><span>✉</span><div><strong>通知设置</strong><small>邮件告警</small></div></button>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-service"><i :class="overview.agents_online ? 'online' : ''"></i><span>{{ overview.agents_online }} 个终端在线</span></div>
        <small>平台 v0.16 · Docker</small>
      </div>
    </aside>

    <div class="app-frame">
    <header :class="['topbar', { 'editor-topbar': activeTab === 'editor' }]">
      <div class="page-heading">
        <span v-if="pageMeta.eyebrow">{{ pageMeta.eyebrow }}</span>
        <div><h1>{{ pageMeta.title }}</h1><p v-if="pageMeta.description">{{ pageMeta.description }}</p></div>
      </div>
      <div class="top-actions">
        <el-button plain @click="guideDrawer = true">使用说明</el-button>
        <button
          type="button"
          class="theme-toggle"
          :aria-label="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          :title="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="toggleTheme"
        ><el-icon aria-hidden="true"><Moon v-if="theme === 'dark'" /><Sunny v-else /></el-icon></button>
      </div>
    </header>

    <main :class="{ 'editor-main': activeTab === 'editor' }">
      <section v-if="activeTab !== 'editor'" class="overview-row">
        <div class="hero">
          <div><span class="eyebrow">CONTROL PLANE</span><h2>一处查看终端、手机与任务状态</h2><p>平台运行于 PC Docker，终端 Agent 运行于创龙 RK3576 开发板。</p></div>
        </div>

        <nav class="metrics" aria-label="平台运行概览">
          <button type="button" title="查看测试终端" @click="activeTab = 'terminals'">
            <span class="metric-copy"><span>终端</span><small><i :class="overview.agents_online ? 'pulse online' : 'pulse'"></i>{{ overview.agents_online }} 在线</small></span>
            <strong>{{ overview.agents_total }}</strong>
          </button>
          <button type="button" :class="{ attention: overview.tasks_running > 0 }" title="查看执行中的任务" @click="activeTab = 'tasks'">
            <span class="metric-copy"><span>执行中</span><small>实时任务</small></span>
            <strong>{{ overview.tasks_running }}</strong>
          </button>
          <button type="button" title="查看任务历史" @click="activeTab = 'tasks'">
            <span class="metric-copy"><span>已成功</span><small>累计完成</small></span>
            <strong>{{ overview.tasks_succeeded }}</strong>
          </button>
          <button type="button" :class="{ danger: overview.failure_records > 0 }" title="查看失败记录" @click="activeTab = 'failures'">
            <span class="metric-copy"><span>失败</span><small>含现场截图</small></span>
            <strong class="failure-count">{{ overview.failure_records }}</strong>
          </button>
        </nav>
      </section>

      <section :class="['workspace', { 'editor-workspace': activeTab === 'editor' }]">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="测试终端" name="terminals">
            <div v-if="!agents.length" class="empty-state"><div class="empty-icon">⌁</div><h3>暂无终端连接</h3><p>在创龙开发板启动 Agent 后，这里会自动出现终端与手机状态。</p></div>
            <div v-else class="terminal-grid">
              <article v-for="agent in agents" :key="agent.id" class="terminal-card">
                <div class="terminal-head">
                  <div><div class="terminal-title"><span :class="['status-dot', agent.status]"></span><h3>{{ agent.name }}</h3></div><p>{{ agent.id }} · {{ agent.os }}</p></div>
                  <div class="terminal-status-tags">
                    <el-tag :type="statusType(agent.status)" effect="dark">{{ agent.status }}</el-tag>
                    <el-tag :type="serviceStateType(agent)" effect="plain">{{ serviceStateLabel(agent) }}</el-tag>
                  </div>
                </div>
                <div class="device-panel">
                  <div><span>Android 设备</span><strong>{{ agent.metadata?.device?.model || '未识别' }}</strong></div>
                  <div><span>连接</span><strong>{{ agent.metadata?.device?.connected ? 'ADB 在线' : '断开' }}</strong></div>
                  <div><span>电量</span><strong>{{ agent.metadata?.device?.battery_level ?? '—' }}<small v-if="agent.metadata?.device?.battery_level != null">%</small></strong></div>
                  <div><span>Root</span><strong>{{ agent.metadata?.device?.root ? '已授权' : '否' }}</strong></div>
                </div>
                <div class="terminal-meta">
                  <span>最近心跳：{{ formatTime(agent.last_seen) }}</span>
                  <span v-if="agent.metadata?.metadata?.service?.pid">Agent PID：{{ agent.metadata.metadata.service.pid }}</span>
                  <span v-if="agent.metadata?.metadata?.service?.uptime_seconds != null">运行：{{ formatDuration(agent.metadata.metadata.service.started_at) }}</span>
                  <span v-if="agent.metadata?.metadata?.storage?.free_bytes != null">终端可用：{{ formatBytes(agent.metadata.metadata.storage.free_bytes) }}</span>
                  <span v-if="agent.metadata?.device?.storage?.free_bytes != null">手机可用：{{ formatBytes(agent.metadata.device.storage.free_bytes) }}</span>
                </div>
                <div class="terminal-control-groups">
                  <section>
                    <div><strong>任务接收</strong><small>只控制是否领取新任务，不会关闭 Agent。</small></div>
                    <el-button
                      v-if="serviceState(agent) === 'stopped'"
                      size="small"
                      type="primary"
                      title="恢复领取队列中的自动化任务"
                      @click="runAction(agent, 'service/start')"
                    >恢复接收任务</el-button>
                    <el-button
                      v-else-if="['running', 'busy'].includes(serviceState(agent))"
                      size="small"
                      type="warning"
                      plain
                      title="暂停领取新任务；当前任务不会被中断"
                      :disabled="agent.status !== 'online'"
                      @click="runAction(agent, 'service/stop', serviceState(agent) === 'busy' ? '终端正在执行任务。暂停接收将在当前任务结束后生效，当前任务不会中断。是否继续？' : '暂停后 Agent 仍保持心跳和设备管理能力，但不会领取新任务。是否继续？')"
                    >暂停接收任务</el-button>
                    <el-button v-else size="small" disabled>{{ serviceState(agent) === 'offline' ? 'Agent 已离线' : 'Agent 版本不支持' }}</el-button>
                  </section>
                  <section>
                    <div><strong>手机与诊断</strong><small>命令通过在线 Agent 立即执行。</small></div>
                    <div class="terminal-device-actions">
                      <el-button
                        v-if="isTronlongNpu(agent)"
                        size="small"
                        type="primary"
                        plain
                        :disabled="agent.status !== 'online'"
                        title="从平台缓存部署创龙 RK3576 NPU 容器"
                        @click="openDeployment(agent)"
                      >部署 NPU 容器</el-button>
                      <el-button size="small" title="唤醒手机屏幕" @click="runAction(agent, 'device/wake')">唤醒屏幕</el-button>
                      <el-button size="small" title="关闭手机屏幕并锁屏" @click="runAction(agent, 'device/sleep')">手机锁屏</el-button>
                      <el-button size="small" title="抓取一次当前手机无损画面并显示命令结果" @click="runAction(agent, 'device/screenshot')">抓取画面</el-button>
                      <el-button size="small" title="查看平台已回收的 Agent 运行日志" @click="loadLogs(agent)">Agent 日志</el-button>
                      <el-button size="small" type="danger" plain title="通过开发板执行 adb reboot 重启连接的手机" @click="runAction(agent, 'restart', '确认通过开发板执行 adb reboot 重启连接的 Android 手机？')">重启手机</el-button>
                    </div>
                  </section>
                </div>
              </article>
            </div>
          </el-tab-pane>

          <el-tab-pane label="测试任务" name="tasks">
            <div class="toolbar task-toolbar">
              <div><strong>任务队列</strong><small>任务由终端依次领取；暂停接收后，已排队任务会保留且当前任务不会中断。</small></div>
              <div class="task-toolbar-actions">
                <el-button @click="openMaintenance">存储与清理</el-button>
                <el-button type="primary" :disabled="!agents.length" title="从脚本库选择普通脚本或模块组合并创建任务" @click="openTaskCreateDialog">下发测试任务</el-button>
              </div>
            </div>
            <el-table :data="displayTasks" empty-text="暂无任务">
              <el-table-column label="任务" min-width="240"><template #default="scope"><div class="task-name-cell"><span>{{ scope.row.name }}</span><el-tag v-if="scope.row.task_kind === 'composition'" size="small" type="success" effect="plain">组合</el-tag></div></template></el-table-column>
              <el-table-column label="终端" min-width="180"><template #default="scope">{{ agentName(scope.row.agent_id) }}</template></el-table-column>
              <el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="statusType(scope.row.status)">{{ scope.row.status }}</el-tag></template></el-table-column>
              <el-table-column label="队列" width="90"><template #default="scope">{{ queueLabel(scope.row) }}</template></el-table-column>
              <el-table-column label="计划" min-width="175"><template #default="scope">{{ scheduleLabel(scope.row) }}</template></el-table-column>
              <el-table-column label="尝试" width="90"><template #default="scope">{{ scope.row.attempt || 1 }}/{{ attemptTotal(scope.row) }}</template></el-table-column>
              <el-table-column label="耗时" width="110"><template #default="scope">{{ formatDuration(scope.row.started_at, scope.row.finished_at) }}</template></el-table-column>
              <el-table-column label="操作" width="370" fixed="right"><template #default="scope">
                <el-button size="small" @click="openTask(scope.row)">详情</el-button>
                <a v-if="scope.row.recording_url" :href="scope.row.recording_url" :download="`${scope.row.name}.${recordingExtension(scope.row)}`"><el-button size="small" type="primary" plain>下载录屏</el-button></a>
                <el-button v-if="scope.row.status === 'failed'" size="small" type="warning" plain :loading="retryingTaskId === scope.row.id" @click="retryTask(scope.row)">重试</el-button>
                <el-button v-if="['queued', 'scheduled'].includes(scope.row.status)" size="small" type="danger" plain @click="cancelTask(scope.row)">取消</el-button>
                <el-button v-if="isFinishedTask(scope.row)" size="small" type="danger" plain :loading="deletingTaskId === scope.row.id" @click="deleteTask(scope.row)">删除</el-button>
              </template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="失败记录" name="failures">
            <div class="failure-notice">
              <div><strong>脚本失败取证</strong><span>异常发生后立即截图，再清理应用并返回桌面。</span></div>
              <el-tag :type="notification.failure_email_enabled ? 'success' : 'warning'">
                {{ notification.failure_email_enabled ? `邮件接收：${notification.recipients.join(', ')}` : 'SMTP 尚未配置' }}
              </el-tag>
            </div>
            <el-table :data="failures" empty-text="暂无失败记录">
              <el-table-column label="脚本" min-width="180"><template #default="scope">{{ displayScriptName(scope.row.script_name) }}</template></el-table-column>
              <el-table-column prop="agent_id" label="终端" min-width="170" />
              <el-table-column label="失败位置" min-width="180"><template #default="scope">{{ failedStepLabel(scope.row) }}</template></el-table-column>
              <el-table-column prop="error" label="错误" min-width="280" show-overflow-tooltip />
              <el-table-column label="邮件" width="105"><template #default="scope"><el-tag :type="emailStatusType(scope.row.email_status)" size="small">{{ scope.row.email_status }}</el-tag></template></el-table-column>
              <el-table-column label="状态" width="90"><template #default="scope"><el-tag :type="scope.row.confirmed ? 'success' : 'danger'" size="small">{{ scope.row.confirmed ? '已确认' : '待处理' }}</el-tag></template></el-table-column>
              <el-table-column label="发生时间" min-width="180"><template #default="scope">{{ formatTime(scope.row.created_at) }}</template></el-table-column>
              <el-table-column label="操作" width="225" fixed="right"><template #default="scope">
                <el-button size="small" type="primary" plain @click="openFailure(scope.row)">查看</el-button>
                <el-button v-if="!scope.row.confirmed" size="small" type="success" plain :loading="confirmingFailureId === scope.row.id" @click="confirmFailure(scope.row)">确认</el-button>
                <el-button size="small" type="danger" plain :loading="deletingFailureId === scope.row.id" @click="deleteFailure(scope.row)">删除</el-button>
              </template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="通知设置" name="notifications">
            <div class="notification-header">
              <div><strong>邮件发送器</strong><small>页面保存后立即生效，无需重启 Docker。</small></div>
              <el-tag
                :class="['notification-status-tag', notification.failure_email_enabled ? 'is-enabled' : 'is-disabled']"
                :type="notification.failure_email_enabled ? 'success' : 'info'"
                effect="plain"
              >
                {{ notification.failure_email_enabled ? '失败邮件已启用' : '当前未启用' }}
              </el-tag>
            </div>
            <el-alert title="SMTP 密码会使用 Docker 数据卷中的独立密钥加密保存，页面和 API 不会回显。远程部署时仍应为控制台增加登录认证和 HTTPS。" type="info" :closable="false" show-icon />
            <div class="notification-layout">
              <section class="notification-card">
                <h3>SMTP 服务器</h3>
                <div class="notification-grid">
                  <label class="wide">服务器地址<el-input v-model="notificationForm.smtp_host" placeholder="smtp.example.com" /></label>
                  <label>端口<el-input-number v-model="notificationForm.smtp_port" :min="1" :max="65535" controls-position="right" /></label>
                  <label>连接加密<el-select v-model="notificationForm.security"><el-option label="STARTTLS（常用 587）" value="starttls" /><el-option label="SSL/TLS（常用 465）" value="ssl" /><el-option label="无加密" value="none" /></el-select></label>
                  <label class="wide">登录账号<el-input v-model="notificationForm.smtp_user" autocomplete="username" placeholder="automation@example.com" /></label>
                  <label class="wide">应用专用密码<el-input v-model="notificationForm.smtp_password" type="password" show-password autocomplete="new-password" :disabled="notificationForm.clear_password" :placeholder="notification.password_configured ? '已保存；留空保持不变' : '填写邮箱应用专用密码'" /></label>
                  <div class="password-state wide">
                    <span>{{ notification.password_configured ? '已保存加密密码' : '尚未保存密码' }}</span>
                    <el-checkbox v-model="notificationForm.clear_password">清除已保存密码</el-checkbox>
                  </div>
                  <label class="wide">发件地址<el-input v-model="notificationForm.smtp_from" placeholder="automation@example.com" /></label>
                </div>
              </section>

              <section class="notification-card">
                <div class="notification-enable">
                  <div><h3>脚本失败告警</h3><p>失败记录创建后在后台发送，不阻塞终端继续心跳。</p></div>
                  <el-switch v-model="notificationForm.failure_enabled" inline-prompt active-text="启用" inactive-text="停用" />
                </div>
                <label>失败通知收件人<el-input v-model="notificationRecipients" type="textarea" :rows="3" placeholder="owner@example.com，多人使用逗号或换行分隔" /></label>
                <label>平台访问地址<el-input v-model="notificationForm.public_base_url" placeholder="http://127.0.0.1:8000" /></label>
                <small>邮件中的失败记录链接使用这个地址；跨机器查看时请填写收件人能访问的平台地址。</small>
                <div class="notification-actions">
                  <el-button type="primary" :loading="notificationSaving" @click="saveNotificationSettings">保存配置</el-button>
                  <el-tag effect="plain">来源：{{ notification.source === 'control_center' ? '页面配置' : '环境变量' }}</el-tag>
                </div>
                <div class="test-email-box">
                  <label>测试收件人<el-input v-model="testEmailRecipient" placeholder="test@example.com" /></label>
                  <el-button :loading="notificationTesting" :disabled="!notification.smtp_configured" @click="sendTestNotification">发送测试邮件</el-button>
                </div>
              </section>
            </div>
          </el-tab-pane>

          <el-tab-pane label="脚本编辑器" name="editor">
            <VisualScriptEditor :agents="agents" @executed="showCommandResult" />
          </el-tab-pane>
        </el-tabs>
      </section>
    </main>
    </div>

    <UserGuideDrawer v-model="guideDrawer" @navigate="navigateFromGuide" />

    <el-dialog v-model="deploymentDialog" title="创龙 RK3576 NPU 容器部署" width="min(760px, 92vw)">
      <div v-if="deploymentAgent" class="deployment-dialog">
        <el-alert
          title="仅支持创龙 RK3576 ARM64 NPU 终端"
          description="部署会由终端主机上的部署器下载平台缓存镜像，校验 SHA-256 后重建 terminal-agent 容器。首次使用需要先安装一次终端部署器。"
          type="info"
          :closable="false"
        />
        <div class="deployment-upload-row">
          <input ref="deploymentFileInput" type="file" accept=".tar,.tar.gz" hidden @change="uploadDeploymentArtifact" />
          <el-button :loading="deploymentUploading" @click="deploymentFileInput?.click()">上传平台缓存镜像</el-button>
          <span>镜像包会保存在平台数据卷，随平台导出包一起备份。</span>
        </div>
        <el-empty v-if="!deploymentArtifacts.length && !deploymentLoading" description="暂无平台缓存镜像" />
        <el-radio-group v-else v-model="deploymentArtifactName" class="deployment-artifacts">
          <el-radio v-for="item in deploymentArtifacts" :key="item.name" :value="item.name" border>
            {{ terminalArtifactLabel(item) }}
          </el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="deploymentDialog = false">取消</el-button>
        <el-button type="primary" :loading="deploymentLoading" :disabled="!deploymentArtifactName" @click="deploySelectedTerminal">开始部署</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskCreateDialog" title="下发测试任务" width="min(980px, 92vw)">
      <div class="task-create-form">
        <label>目标终端
          <el-select v-model="taskForm.agent_id" @change="loadTaskScripts">
            <el-option
              v-for="agent in agents"
              :key="agent.id"
              :label="`${agent.name} · ${serviceStateLabel(agent)}`"
              :value="agent.id"
            />
          </el-select>
        </label>
        <div class="dispatch-kind-card">
          <strong>下发内容</strong>
          <el-radio-group v-model="taskForm.dispatch_kind" @change="changeDispatchKind">
            <el-radio-button value="standard">普通任务</el-radio-button>
            <el-radio-button value="composition">脚本组合任务</el-radio-button>
          </el-radio-group>
          <small>{{ taskForm.dispatch_kind === 'composition' ? '整条组合视为一个任务；开始脚本每轮固定执行，只跳过失败模块之前已完成的过程脚本。' : '普通脚本按选择顺序分别创建任务记录；模块脚本不会显示。' }}</small>
        </div>
        <label>任务名称<el-input v-model="taskForm.name" maxlength="120" /></label>
        <label v-if="taskForm.dispatch_kind === 'standard'">执行普通脚本（可多选，按选择顺序进入队列）
          <el-select class="task-script-select" v-model="taskForm.script_names" multiple collapse-tags :max-collapse-tags="3" placeholder="从脚本编辑器保存的普通脚本中选择">
            <el-option v-for="item in standardTaskScripts" :key="item.name" :label="displayScriptName(item.name)" :value="item.name" />
          </el-select>
        </label>
        <el-alert
          v-if="taskForm.dispatch_kind === 'standard' && !standardTaskScripts.length"
          title="当前终端没有可下发的普通脚本，请先到脚本编辑器创建并保存"
          type="warning"
          :closable="false"
          show-icon
        />
        <section v-else class="composition-builder">
          <div class="composition-head">
            <div>
              <strong>模块执行队列</strong>
              <small>第一项固定为开始脚本；最后一项必须是启用了结束清理的过程脚本。<template v-if="compositionCategoryLabel">当前分类：{{ compositionCategoryLabel }}，仅显示同分类过程脚本。</template></small>
            </div>
            <el-button size="small" :disabled="!compositionProcessScripts.length" @click="addCompositionProcess">＋ 添加过程脚本</el-button>
          </div>
          <el-alert v-if="!startModuleScripts.length || !processModuleScripts.length" title="请先在脚本编辑器中分别保存开始脚本和过程脚本" type="warning" :closable="false" show-icon />
          <el-alert v-else-if="!compositionProcessScripts.length" :title="compositionCategoryLabel ? `分类“${compositionCategoryLabel}”下没有可用的过程脚本，请先创建同分类过程脚本` : '当前没有可用的过程脚本'" type="warning" :closable="false" show-icon />
          <article v-if="taskForm.composition_modules[0]" class="composition-module start-module">
            <span class="composition-index">01</span>
            <div class="composition-main">
              <label>开始脚本
                <el-select class="task-script-select" v-model="taskForm.composition_modules[0].script_name" placeholder="选择开始脚本" @change="changeCompositionStart">
                  <el-option v-for="item in startModuleScripts" :key="item.name" :label="displayScriptName(item.name)" :value="item.name" />
                </el-select>
              </label>
              <small>必须包含【开始】和【打开应用】；执行成功后保留应用给下一模块。</small>
            </div>
            <label v-if="taskForm.composition_modules.length > 1" class="composition-interval">执行后等待
              <el-input-number v-model="taskForm.composition_modules[0].interval_after_seconds" :min="0" :max="3600" :step="0.5" controls-position="right" />
              <small>秒</small>
            </label>
            <el-tag type="success" effect="plain">固定起点</el-tag>
          </article>
          <article
            v-for="(module, processIndex) in taskForm.composition_modules.slice(1)"
            :key="module.id"
            :class="['composition-module', { 'cleanup-module': savedScript(module.script_name)?.cleanup_on_finish }]"
          >
            <span class="composition-index">{{ String(processIndex + 2).padStart(2, '0') }}</span>
            <div class="composition-main">
              <label>过程脚本
                <el-select class="task-script-select" v-model="module.script_name" placeholder="选择过程脚本">
                  <el-option
                    v-for="item in compositionProcessScripts"
                    :key="item.name"
                    :label="`${displayScriptName(item.name)}${item.cleanup_on_finish ? ' · 结束清理' : ' · 保留应用'}`"
                    :value="item.name"
                  />
                </el-select>
              </label>
              <small>{{ savedScript(module.script_name)?.cleanup_on_finish ? '执行后强制关闭应用并返回主页，只能作为最后一项。' : '执行后保留应用，可继续插入其他过程脚本。' }}</small>
            </div>
            <label v-if="processIndex + 2 < taskForm.composition_modules.length" class="composition-interval">执行后等待
              <el-input-number v-model="module.interval_after_seconds" :min="0" :max="3600" :step="0.5" controls-position="right" />
              <small>秒</small>
            </label>
            <div class="composition-actions">
              <el-button size="small" :disabled="processIndex === 0" @click="moveCompositionProcess(processIndex + 1, -1)">↑</el-button>
              <el-button size="small" :disabled="processIndex + 2 === taskForm.composition_modules.length" @click="moveCompositionProcess(processIndex + 1, 1)">↓</el-button>
              <el-button size="small" type="danger" plain @click="removeCompositionProcess(processIndex + 1)">删除</el-button>
            </div>
          </article>
        </section>
        <div class="task-mode-card">
          <strong>执行方式</strong>
          <el-radio-group v-model="taskForm.mode">
            <el-radio-button value="once">单次任务</el-radio-button>
            <el-radio-button value="repeat">循环任务</el-radio-button>
            <el-radio-button value="scheduled">定时任务</el-radio-button>
          </el-radio-group>
          <label v-if="taskForm.mode === 'repeat'">循环次数
            <el-input-number v-model="taskForm.repeat_count" :min="1" :max="100" />
          </label>
          <div v-if="taskForm.mode === 'scheduled'" class="schedule-fields">
            <label>开始和结束日期
              <el-date-picker
                v-model="taskForm.schedule_dates"
                type="daterange"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
              />
            </label>
            <label>每日执行时间段
              <div class="time-window">
                <el-time-picker v-model="taskForm.daily_start_time" value-format="HH:mm:ss" format="HH:mm" placeholder="开始时间" />
                <span>至</span>
                <el-time-picker v-model="taskForm.daily_end_time" value-format="HH:mm:ss" format="HH:mm" placeholder="结束时间" />
              </div>
            </label>
            <small>每天在时间段开始时进入队列；若前一任务仍在执行，则保持排队且不会中断前一任务。</small>
          </div>
        </div>
        <div class="task-options-grid">
          <label>{{ taskForm.dispatch_kind === 'composition' ? '组合失败重试次数' : '失败重试次数' }}
            <el-input-number v-model="taskForm.max_retries" :min="0" :max="20" />
          </label>
          <div class="recording-option">
            <div><strong>任务录屏</strong><small>短任务下载为 MP4；超过约 3 分钟会自动分段并下载为 ZIP。</small></div>
            <el-switch v-model="taskForm.record_video" inline-prompt active-text="开启" inactive-text="关闭" />
          </div>
        </div>
        <div class="task-dispatch-note">
          <strong>{{ agentServiceLabel(taskForm.agent_id) }} · 将创建 {{ plannedTaskCount }} 条运行记录</strong>
          <span>{{ taskForm.dispatch_kind === 'composition' ? '组合失败重试仍会创建新记录并排到队尾；能定位断点时固定先执行开始脚本，再从失败模块继续。无法定位断点或最终失败时会强制清理应用。' : '终端离线或停止接单时任务仍可入队。失败重试会新建运行记录并排到当前队列末尾，原失败截图继续保留。' }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="taskCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="taskSubmitting" @click="dispatchTask">创建任务并加入队列</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDetailDialog" title="任务详情" width="760px">
      <div v-if="selectedTask" class="task-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务">{{ selectedTask.name }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="statusType(selectedTask.status)">{{ selectedTask.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="终端">{{ agentName(selectedTask.agent_id) }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(selectedTask.started_at, selectedTask.finished_at) }}</el-descriptions-item>
          <el-descriptions-item label="计划">{{ scheduleLabel(selectedTask) }}</el-descriptions-item>
          <el-descriptions-item label="任务类型">{{ selectedTask.task_kind === 'composition' ? '模块化脚本组合' : '普通任务' }}</el-descriptions-item>
          <el-descriptions-item label="失败重试">第 {{ selectedTask.attempt || 1 }} 次尝试，共 {{ attemptTotal(selectedTask) }} 次机会</el-descriptions-item>
          <el-descriptions-item label="创建">{{ formatTime(selectedTask.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="完成">{{ formatTime(selectedTask.finished_at) }}</el-descriptions-item>
          <el-descriptions-item label="录屏">{{ selectedTask.recording_url ? formatBytes(selectedTask.recording_size) : (selectedTask.record_video ? '已开启，等待生成' : '未开启') }}</el-descriptions-item>
        </el-descriptions>
        <section v-if="selectedTask.composition?.length" class="task-composition-detail">
          <h4>组合执行顺序</h4>
          <ol>
            <li v-for="module in selectedTask.composition" :key="module.position" :class="{ 'retry-skipped': module.retry_skipped, 'retry-replayed': module.retry_replayed, 'retry-resume': module.retry_resume }">
              <span>{{ module.position }}</span>
              <div><strong>{{ displayScriptName(module.script_name) }}</strong><small>{{ module.script_type === 'module_start' ? '开始脚本' : (module.cleanup_on_finish ? '过程脚本 · 结束清理' : '过程脚本 · 保留应用') }}</small></div>
              <div class="composition-module-state">
                <em v-if="module.retry_skipped">重试已跳过</em>
                <em v-else-if="module.retry_replayed">重试固定执行</em>
                <em v-else-if="module.retry_resume">断点继续位置</em>
                <em v-if="module.interval_after_seconds && !module.retry_skipped">等待 {{ module.interval_after_seconds }} 秒</em>
              </div>
            </li>
          </ol>
        </section>
        <a v-if="selectedTask.recording_url" :href="selectedTask.recording_url" :download="`${selectedTask.name}.${recordingExtension(selectedTask)}`"><el-button class="task-recording-download" type="primary">下载任务录屏</el-button></a>
        <a :href="taskScriptUrl(selectedTask)" :download="`${selectedTask.name}-script.json`"><el-button plain>下载脚本镜像</el-button></a>
        <el-button v-if="selectedTask.status === 'failed'" type="warning" plain :loading="retryingTaskId === selectedTask.id" @click="retryTask(selectedTask)">重试此任务</el-button>
        <el-button v-if="isFinishedTask(selectedTask)" type="danger" plain :loading="deletingTaskId === selectedTask.id" @click="deleteTask(selectedTask)">删除任务记录</el-button>
        <h4>执行结果</h4>
        <pre>{{ JSON.stringify(selectedTask.result, null, 2) }}</pre>
      </div>
    </el-dialog>

    <el-dialog v-model="maintenanceDialog" title="存储空间与历史清理" width="780px">
      <div v-loading="maintenanceLoading" class="maintenance-panel">
        <div v-if="maintenance" class="storage-grid">
          <article v-for="item in maintenance.storage" :key="item.scope" :class="{ danger: item.active }">
            <span>{{ item.label }}</span>
            <strong>{{ formatBytes(item.free_bytes) }}</strong>
            <small>可用 / {{ formatBytes(item.total_bytes) }}<template v-if="item.active"> · 低于 5 GiB</template></small>
          </article>
        </div>
        <div v-if="maintenance" class="cache-summary">
          <div><span>任务历史</span><strong>{{ maintenance.cache.finished_tasks }}</strong></div>
          <div><span>任务录屏</span><strong>{{ maintenance.cache.recordings }}</strong><small>{{ formatBytes(maintenance.cache.recording_bytes) }}</small></div>
          <div><span>失败截图</span><strong>{{ maintenance.cache.failure_records }}</strong><small>{{ formatBytes(maintenance.cache.failure_screenshot_bytes) }}</small></div>
          <div><span>数据库</span><strong>{{ formatBytes(maintenance.cache.database_bytes) }}</strong></div>
        </div>
        <section class="cleanup-card">
          <label>清理内容
            <el-select v-model="cleanupForm.target">
              <el-option label="只清理录屏缓存，保留任务历史" value="recordings" />
              <el-option label="清理已完成任务历史" value="task_history" />
              <el-option label="清理历史和相关缓存" value="all" />
            </el-select>
          </label>
          <label>保留最近天数
            <el-input-number v-model="cleanupForm.older_than_days" :min="0" :max="3650" />
            <small>填写 0 表示清理全部符合条件的记录；运行中、排队和未来定时任务不会删除。</small>
          </label>
          <el-checkbox v-if="cleanupForm.target !== 'recordings'" v-model="cleanupForm.include_failure_evidence">同时删除关联的失败记录和现场截图</el-checkbox>
          <el-alert title="历史清理不可恢复。仅清理录屏时会保留任务结果和失败截图。" type="warning" :closable="false" show-icon />
          <el-button type="danger" plain :loading="maintenanceLoading" @click="runCleanup">执行清理</el-button>
        </section>
      </div>
    </el-dialog>

    <el-dialog v-model="commandDialog" title="命令执行结果" width="680px">
      <div v-if="commandResult" class="command-result">
        <el-descriptions :column="2" border><el-descriptions-item label="命令">{{ commandResult.kind }}</el-descriptions-item><el-descriptions-item label="状态"><el-tag :type="statusType(commandResult.status)">{{ commandResult.status }}</el-tag></el-descriptions-item></el-descriptions>
        <img v-if="commandResult.result?.data_base64" class="screenshot" :src="`data:${commandResult.result.mime || 'image/png'};base64,${commandResult.result.data_base64}`" alt="Android screenshot" />
        <img v-else-if="commandResult.result?.screen_url" class="screenshot" :src="`${commandResult.result.screen_url}?v=${Date.now()}`" alt="Android screenshot" />
        <img v-else-if="commandResult.result?.failure_screenshot_url" class="screenshot" :src="`${commandResult.result.failure_screenshot_url}?v=${Date.now()}`" alt="Failure screenshot" />
        <pre>{{ JSON.stringify(commandResult.result, null, 2) }}</pre>
      </div>
    </el-dialog>

    <el-dialog v-model="failureDialog" title="脚本失败记录" width="900px">
      <div v-if="selectedFailure" class="failure-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="脚本">{{ displayScriptName(selectedFailure.script_name) }}</el-descriptions-item>
          <el-descriptions-item label="终端">{{ selectedFailure.agent_id }}</el-descriptions-item>
          <el-descriptions-item label="失败位置">{{ failedStepLabel(selectedFailure) }}</el-descriptions-item>
          <el-descriptions-item label="邮件"><el-tag :type="emailStatusType(selectedFailure.email_status)">{{ selectedFailure.email_status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="selectedFailure.confirmed ? 'success' : 'danger'">{{ selectedFailure.confirmed ? '已确认' : '待处理' }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTime(selectedFailure.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="截图">{{ selectedFailure.screenshot_url ? '已保留' : '截图失败' }}</el-descriptions-item>
        </el-descriptions>
        <div class="failure-evidence">
          <img v-if="selectedFailure.screenshot_url" :src="`${selectedFailure.screenshot_url}?v=${Date.now()}`" alt="脚本失败现场截图" />
          <el-empty v-else description="没有可用的失败现场截图" />
          <div>
            <strong>错误信息</strong>
            <p>{{ selectedFailure.error }}</p>
            <small v-if="selectedFailure.email_error">邮件错误：{{ selectedFailure.email_error }}</small>
            <a v-if="selectedFailure.screenshot_url" :href="selectedFailure.screenshot_url" :download="`${displayScriptName(selectedFailure.script_name)}-failure.png`"><el-button size="small">下载现场截图</el-button></a>
            <div class="failure-detail-actions">
              <el-button v-if="!selectedFailure.confirmed" type="success" plain :loading="confirmingFailureId === selectedFailure.id" @click="confirmFailure(selectedFailure)">确认已处理</el-button>
              <el-button type="danger" plain :loading="deletingFailureId === selectedFailure.id" @click="deleteFailure(selectedFailure)">删除失败记录</el-button>
            </div>
          </div>
        </div>
        <details><summary>查看完整执行数据</summary><pre>{{ JSON.stringify(selectedFailure.result, null, 2) }}</pre></details>
      </div>
    </el-dialog>

    <el-drawer v-model="logDrawer" title="终端日志" size="55%">
      <div class="log-list"><div v-for="item in logs" :key="item.id" class="log-line"><time>{{ formatTime(item.created_at) }}</time><el-tag size="small">{{ item.level }}</el-tag><span>{{ item.message }}</span></div><el-empty v-if="!logs.length" description="暂无平台日志；可先执行任务" /></div>
    </el-drawer>
  </div>
</template>
