<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CaretRight, InfoFilled, Loading, Plus } from '@element-plus/icons-vue'
import { api } from '../api.ts'
import ScriptManagerDrawer from './ScriptManagerDrawer.vue'
import {
  createEditorId,
  displayScriptName,
  displayStepSummary,
  eventDefinitions,
  labelFor,
  makeStep,
  migratedClickFields,
  migratedFailureRetry,
  migratedPostAssertion,
  migratedSkipCondition,
  scriptOptionLabel,
  startStep,
  storageScriptName,
} from '../script-editor'
import type {
  EditorScriptType,
  EditorStep,
  GlobalPopupRule,
  InteractionMode,
  PhoneMode,
  Point,
  Rect,
  ScreenOrigin,
} from '../script-editor'
import type { Agent, Command, SavedScript, ScriptCategory } from '../types'

const props = defineProps<{ agents: Agent[] }>()
const emit = defineEmits<{ executed: [command: Command] }>()

const stagedAgentId = ref('')
const lockedAgentId = ref('')
const lockedSerial = ref('')
const lockedModel = ref('')
const sessionActive = ref(false)
const sessionError = ref('')
const screenshotBusy = ref(false)
const remoteControlBusy = ref(false)
const interactiveStarting = ref(false)
const scrcpyActive = ref(false)
const scrcpyError = ref('')
const scrcpyFrames = ref(0)
const scrcpySkipped = ref(0)
const scrcpyWidth = ref(0)
const scrcpyHeight = ref(0)
const orientationMode = ref<'auto' | 'portrait' | 'landscape'>('auto')
const screenSource = ref('')
const screenUpdatedAt = ref('')
const screenCanvas = ref<HTMLCanvasElement | null>(null)
const scrcpyCanvas = ref<HTMLCanvasElement | null>(null)
const screenImage = ref<HTMLImageElement | null>(null)
const screenshotImportInput = ref<HTMLInputElement | null>(null)
const screenOrigin = ref<ScreenOrigin>('terminal')
const importedScreenshotName = ref('')
const deviceScreenSize = ref<{ width: number; height: number } | null>(null)
const interactionMode = ref<InteractionMode>('none')
const phoneMode = ref<PhoneMode>('control')
const pointerStart = ref<Point | null>(null)
const pointerCurrent = ref<Point | null>(null)
const pointerStartedAt = ref(0)
const scriptName = ref('visual-demo')
const scriptType = ref<EditorScriptType>('standard')
const cleanupOnFinish = ref(false)
const scriptOptions = ref<SavedScript[]>([])
const scriptCategories = ref<ScriptCategory[]>([])
const selectedScriptCategory = ref('')
const selectedScriptName = ref('')
const scriptManagerVisible = ref(false)
const saving = ref(false)
const quickTesting = ref(false)
const quickTestDialogVisible = ref(false)
const quickTestMode = ref<'once' | 'repeat'>('once')
const quickTestRepeatCount = ref(3)
const quickTestResult = ref<Command | null>(null)
const previewRunningId = ref('')
const conditionTestBusy = ref(false)
const conditionTestResult = ref<{ tone: 'success' | 'info' | 'warning' | 'error'; message: string } | null>(null)
const appDetectionBusy = ref(false)
const appDetectionHint = ref('')
const manualAppPackage = ref('')
const manualAppActivity = ref('')
const selectedStepIndex = ref(0)
const globalPopups = ref<GlobalPopupRule[]>([])
const selectedGlobalPopupId = ref('')
const eventDialogVisible = ref(false)
const insertStepAt = ref(1)
let scrcpySession: import('../scrcpy/session.ts').BrowserScrcpySession | undefined
let scrcpySessionToken = ''
let scrcpyStopping = false
let livePointerId: number | undefined
let appDetectionGeneration = 0
const UNCLASSIFIED_CATEGORY = '__unclassified__'
const editorPathMatch = window.location.pathname.match(/^\/editor\/([^/]+)$/)
const requestedAgentId = editorPathMatch ? decodeURIComponent(editorPathMatch[1]) : ''

const steps = ref<EditorStep[]>([startStep()])
const lockedAgent = computed(() => props.agents.find((agent) => agent.id === lockedAgentId.value))
const selectedGlobalPopup = computed(() => globalPopups.value.find((rule) => rule.id === selectedGlobalPopupId.value))
const selectedStep = computed(() => selectedGlobalPopupId.value ? undefined : steps.value[selectedStepIndex.value])
const activeAnnotationTarget = computed(() => selectedGlobalPopup.value || selectedStep.value)
const automationBusy = computed(() => Boolean(previewRunningId.value) || quickTesting.value)
const targetLabel = computed(() => {
  if (!sessionActive.value) return '尚未锁定手机'
  return `${lockedModel.value || 'Android'} · ${lockedSerial.value || 'default'}`
})
const landscapeDisplay = computed(() => {
  if (orientationMode.value === 'landscape') return true
  if (orientationMode.value === 'portrait') return false
  const width = scrcpyActive.value ? scrcpyWidth.value : (screenImage.value?.naturalWidth || 0)
  const height = scrcpyActive.value ? scrcpyHeight.value : (screenImage.value?.naturalHeight || 0)
  return width > 0 && height > 0 && width > height
})

const availableEventDefinitions = computed(() => (
  scriptType.value === 'module_process'
    ? eventDefinitions.filter((item) => item.action !== 'launch_app')
    : eventDefinitions
))
const scriptTypeHint = computed(() => {
  if (scriptType.value === 'module_start') return '开始脚本必须包含【开始】和【打开应用】，组合执行时不会在此模块结束后关闭应用。'
  if (scriptType.value === 'module_process') return '过程脚本用于组合任务；可选择在组合任务最后清理并关闭应用。'
  return '普通脚本保持原有独立执行逻辑，不能用于组合任务。'
})
const failureRetryProcessOptions = computed(() => {
  const currentName = storageScriptName(scriptName.value)
  return scriptOptions.value.filter((item) => (
    item.valid !== false
    && item.script_type === 'module_process'
    && item.cleanup_on_finish !== true
    && item.name !== currentName
  ))
})
const scriptLoadCategories = computed(() => {
  const unclassifiedCount = scriptOptions.value.filter((script) => !script.category_package).length
  return [
    ...(unclassifiedCount ? [{
      package_name: UNCLASSIFIED_CATEGORY,
      display_name: '未分类',
      script_count: unclassifiedCount,
    }] : []),
    ...scriptCategories.value.map((category) => ({
      package_name: category.package_name,
      display_name: category.display_name,
      script_count: category.script_count,
    })),
  ]
})
const filteredScriptOptions = computed(() => (
  selectedScriptCategory.value
    ? scriptOptions.value.filter((script) => (
      (script.category_package || UNCLASSIFIED_CATEGORY) === selectedScriptCategory.value
    ))
    : []
))

function stepTag(index: number) {
  return `#${String(index + 1).padStart(2, '0')}`
}

function globalPopupScopeSummary(rule: GlobalPopupRule) {
  const labels = steps.value
    .map((step, index) => rule.step_ids.includes(step.id) ? stepTag(index) : '')
    .filter(Boolean)
  return labels.length ? labels.join('、') : '未选择步骤'
}

function selectAllGlobalPopupSteps() {
  const rule = selectedGlobalPopup.value
  if (!rule) return
  rule.step_ids = steps.value.map((step) => step.id)
}

function clearGlobalPopupSteps() {
  const rule = selectedGlobalPopup.value
  if (!rule) return
  rule.step_ids = []
}

function pruneGlobalPopupStepScopes() {
  const availableIds = new Set(steps.value.map((step) => step.id))
  for (const rule of globalPopups.value) {
    rule.step_ids = rule.step_ids.filter((id) => availableIds.has(id))
  }
}

function migratedGlobalPopupStepIds(
  rule: Record<string, unknown>,
  loadedSteps: EditorStep[],
) {
  if (!Array.isArray(rule.step_indexes)) return loadedSteps.map((step) => step.id)
  const selectedIndexes = new Set(
    rule.step_indexes
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1),
  )
  return loadedSteps.flatMap((step, index) => (
    selectedIndexes.has(index + 1) ? [step.id] : []
  ))
}

function flowStepSummary(step: EditorStep, index: number) {
  const retry = step.failure_retry
  const recovery = retry?.enabled
    ? `失败后运行 ${displayScriptName(retry.process_script_name) || '未选择过程脚本'} · 重试 ${stepTag(index)} · 上限 ${retry.max_retries} 次`
    : ''
  return [recovery, displayStepSummary(step)].filter(Boolean).join(' · ')
}

function toggleFailureRetry(enabled: boolean | string | number) {
  const step = selectedStep.value
  if (!step || step.action === 'start') return
  const firstProcessScript = failureRetryProcessOptions.value[0]?.name || ''
  step.failure_retry = {
    ...(step.failure_retry || {
      max_retries: 2,
      process_script_name: firstProcessScript,
    }),
    enabled: enabled === true,
  }
  if (enabled === true && !step.failure_retry.process_script_name && !firstProcessScript) {
    ElMessage.warning('当前没有可用的“保留应用”过程脚本，请先创建并保存一个过程脚本')
  }
}

function toggleSkipCondition(enabled: boolean | string | number) {
  const step = selectedStep.value
  if (!step || step.action === 'start') return
  step.skip_condition = {
    ...(step.skip_condition || { mode: 'numeric', operator: 'gt', value: 0, threshold: 0.85 }),
    enabled: enabled === true,
  }
  conditionTestResult.value = null
  interactionMode.value = 'none'
  redrawCanvas()
}

function changeSkipConditionMode(value: string | number | boolean | undefined) {
  const condition = selectedStep.value?.skip_condition
  if (!condition) return
  condition.mode = value === 'image' ? 'image' : 'numeric'
  if (!Number.isFinite(Number(condition.threshold))) condition.threshold = 0.85
  conditionTestResult.value = null
  interactionMode.value = 'none'
  redrawCanvas()
}

function togglePostAssertion(enabled: boolean | string | number) {
  const step = selectedStep.value
  if (!step) return
  step.post_assertion = {
    ...(step.post_assertion || {
      threshold: 0.85,
      timeout_seconds: 3,
      poll_interval_seconds: 0.5,
      max_retries: 2,
    }),
    enabled: enabled === true,
  }
  interactionMode.value = 'none'
  redrawCanvas()
}

function openEventPicker(index = steps.value.length) {
  const minimum = scriptType.value === 'module_process' ? 0 : 1
  insertStepAt.value = Math.max(minimum, Math.min(index, steps.value.length))
  eventDialogVisible.value = true
}

function insertStep(action: string) {
  cancelAppDetection()
  const index = insertStepAt.value
  const step = makeStep(action)
  steps.value.splice(index, 0, step)
  selectedStepIndex.value = index
  selectedGlobalPopupId.value = ''
  interactionMode.value = 'none'
  eventDialogVisible.value = false
  redrawCanvas()
  if (action === 'launch_app') void nextTick().then(() => detectCurrentApp(step))
}

function removeStep(index: number) {
  if (index === 0 && scriptType.value !== 'module_process') return
  cancelAppDetection()
  steps.value.splice(index, 1)
  pruneGlobalPopupStepScopes()
  selectedStepIndex.value = Math.min(selectedStepIndex.value, steps.value.length - 1)
  interactionMode.value = 'none'
}

function selectStep(index: number) {
  cancelAppDetection()
  selectedGlobalPopupId.value = ''
  selectedStepIndex.value = index
  conditionTestResult.value = null
  interactionMode.value = 'none'
  redrawCanvas()
  const step = steps.value[index]
  syncManualAppDraft(step)
  if (step?.action === 'launch_app' && !step.package) void nextTick().then(() => detectCurrentApp(step))
}

function addGlobalPopup() {
  cancelAppDetection()
  const rule: GlobalPopupRule = {
    id: createEditorId('popup'),
    name: `独立规则 ${globalPopups.value.length + 1}`,
    enabled: true,
    step_ids: steps.value.map((step) => step.id),
    click_mode: 'image',
    click_threshold: 0.85,
    click_count: 1,
    click_interval_ms: 120,
    threshold: 0.85,
    cooldown_seconds: 2,
    wait_after_click_seconds: 0.4,
  }
  globalPopups.value.push(rule)
  selectedGlobalPopupId.value = rule.id
  interactionMode.value = 'none'
  redrawCanvas()
}

function removeGlobalPopup(id: string) {
  const index = globalPopups.value.findIndex((rule) => rule.id === id)
  if (index < 0) return
  globalPopups.value.splice(index, 1)
  selectedGlobalPopupId.value = ''
  interactionMode.value = 'none'
  redrawCanvas()
}

function moveStep(index: number, offset: number) {
  const target = index + offset
  const minimum = scriptType.value === 'module_process' ? 0 : 1
  if (index < minimum || target < minimum || target >= steps.value.length) return
  const [step] = steps.value.splice(index, 1)
  steps.value.splice(target, 0, step)
  selectedStepIndex.value = target
}

function changeScriptType(value: EditorScriptType) {
  cancelAppDetection()
  if (value === 'module_process') {
    steps.value = steps.value.filter((step) => !['start', 'launch_app'].includes(step.action))
  } else if (!steps.value.length || steps.value[0].action !== 'start') {
    steps.value.unshift(startStep())
  }
  if (value !== 'module_process') cleanupOnFinish.value = false
  pruneGlobalPopupStepScopes()
  selectedStepIndex.value = Math.max(0, Math.min(selectedStepIndex.value, steps.value.length - 1))
  selectedGlobalPopupId.value = ''
  interactionMode.value = 'none'
  redrawCanvas()
}

async function waitForCommand(commandId: string, attempts = 35) {
  const deadline = Date.now() + Math.max(1, attempts) * 500
  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(0.1, (deadline - Date.now()) / 1000)
    const command = await api.waitCommand(commandId, Math.min(15, remainingSeconds))
    if (['succeeded', 'failed'].includes(command.status)) return command
  }
  throw new Error('等待终端响应超时')
}

function cancelAppDetection(clearHint = true) {
  appDetectionGeneration += 1
  appDetectionBusy.value = false
  if (clearHint) appDetectionHint.value = ''
}

function syncManualAppDraft(step = selectedStep.value) {
  if (!step || step.action !== 'launch_app') {
    manualAppPackage.value = ''
    manualAppActivity.value = ''
    return
  }
  manualAppPackage.value = String(step.package || '')
  manualAppActivity.value = String(step.activity || '')
}

function applyManualAppCorrection(step = selectedStep.value) {
  if (!step || step.action !== 'launch_app') return
  let packageName = manualAppPackage.value.trim()
  let activity = manualAppActivity.value.trim()
  if (packageName.includes('/')) {
    const [detectedPackage, embeddedActivity = ''] = packageName.split('/', 2)
    packageName = detectedPackage.trim()
    activity = activity || embeddedActivity.trim()
  }
  if (!packageName || packageName.length > 255 || /[\s/\\]/.test(packageName)) {
    return ElMessage.error('请输入有效的 Android 包名')
  }
  if (activity.length > 500 || /\s/.test(activity)) {
    return ElMessage.error('Activity 不能包含空格')
  }
  cancelAppDetection(false)
  step.package = packageName
  step.activity = activity
  manualAppPackage.value = packageName
  manualAppActivity.value = activity
  appDetectionHint.value = `已手动保存 ${packageName}${activity ? `/${activity}` : ''}`
  ElMessage.success('应用识别结果已手动修正')
}

async function detectCurrentApp(step = selectedStep.value) {
  if (!step || step.action !== 'launch_app' || !sessionActive.value) return
  const generation = ++appDetectionGeneration
  step.package = ''
  step.activity = ''
  manualAppPackage.value = ''
  manualAppActivity.value = ''
  appDetectionBusy.value = true
  appDetectionHint.value = '正在识别手机当前打开的应用…'
  let prompted = false
  try {
    while (
      generation === appDetectionGeneration
      && sessionActive.value
      && selectedStep.value?.id === step.id
      && steps.value.includes(step)
    ) {
      const agent = ensureLockedDevice()
      const queued = await api.action(agent.id, 'device/detect-app')
      const command = await waitForCommand(queued.command_id)
      if (generation !== appDetectionGeneration) return
      if (command.status === 'failed') throw new Error(String(command.result?.error || '前台应用识别失败'))
      const detected = command.result?.detected === true
      const packageName = typeof command.result?.package === 'string' ? command.result.package : ''
      const activity = typeof command.result?.activity === 'string' ? command.result.activity : ''
      if (detected && packageName) {
        step.package = packageName
        step.activity = activity
        syncManualAppDraft(step)
        appDetectionHint.value = `已识别 ${packageName}${activity ? `/${activity}` : ''}`
        ElMessage.success(`已捕获当前应用：${packageName}`)
        return
      }
      appDetectionHint.value = typeof command.result?.message === 'string'
        ? command.result.message
        : '当前没有打开的应用，请在左侧手机画面中打开目标应用'
      if (!prompted) {
        ElMessage.warning(appDetectionHint.value)
        prompted = true
      }
      await new Promise((resolve) => window.setTimeout(resolve, 600))
    }
  } catch (error) {
    if (generation === appDetectionGeneration) {
      appDetectionHint.value = `识别失败：${String(error)}`
      ElMessage.error(appDetectionHint.value)
    }
  } finally {
    if (generation === appDetectionGeneration) appDetectionBusy.value = false
  }
}

async function connectSession() {
  const agent = props.agents.find((item) => item.id === stagedAgentId.value)
  if (!agent) return ElMessage.warning('请先选择终端')
  if (agent.status !== 'online') return ElMessage.error('终端当前不在线')
  if (!agent.metadata?.device?.connected) return ElMessage.error('终端没有连接 Android 手机')
  lockedAgentId.value = agent.id
  lockedSerial.value = agent.metadata.device.serial || 'default'
  lockedModel.value = agent.metadata.device.model || 'Android'
  sessionActive.value = true
  sessionError.value = ''
  await loadScriptList()
  await nextTick()
  if (agent.capabilities?.scrcpy_relay) await startInteractiveSession()
  else {
    scrcpyError.value = '终端尚未启用 scrcpy 中继，已回退到截图控制'
    await refreshScreen()
  }
  ElMessage.success(`已锁定 ${lockedModel.value}`)
}

async function disconnectSession() {
  if (steps.value.length > 1 || globalPopups.value.length > 0) {
    try {
      await ElMessageBox.confirm('断开后画面标注会保留，但必须重新连接同一手机才能继续运行。', '断开编辑会话')
    } catch {
      return
    }
  }
  cancelAppDetection()
  await stopInteractiveSession()
  sessionActive.value = false
  sessionError.value = ''
  lockedAgentId.value = ''
  lockedSerial.value = ''
  lockedModel.value = ''
  scriptOptions.value = []
  scriptCategories.value = []
  selectedScriptCategory.value = ''
  selectedScriptName.value = ''
  scriptManagerVisible.value = false
  screenSource.value = ''
  screenImage.value = null
  interactionMode.value = 'none'
  phoneMode.value = 'control'
  clearCanvas()
}

async function startInteractiveSession() {
  if (!sessionActive.value || interactiveStarting.value || scrcpyActive.value) return
  const canvas = scrcpyCanvas.value
  if (!canvas) return
  interactiveStarting.value = true
  scrcpyError.value = ''
  try {
    const agent = ensureLockedDevice()
    const queued = await api.startInteractive(agent.id, lockedSerial.value)
    const command = await waitForCommand(queued.command_id, 60)
    if (command.status === 'failed') throw new Error(String(command.result?.error || '终端无法创建交互会话'))
    const wsUrl = command.result?.ws_url
    const token = command.result?.session_token
    if (typeof wsUrl !== 'string' || typeof token !== 'string') throw new Error('终端没有返回 scrcpy 会话地址')
    scrcpySessionToken = token
    const { BrowserScrcpySession } = await import('../scrcpy/session.ts')
    scrcpyStopping = false
    scrcpySession = await BrowserScrcpySession.start({
      wsUrl,
      serial: lockedSerial.value,
      canvas,
      onSize: (width, height) => {
        scrcpyWidth.value = width
        scrcpyHeight.value = height
      },
      onStats: (frames, skipped) => {
        scrcpyFrames.value = frames
        scrcpySkipped.value = skipped
      },
      onClosed: (error) => {
        if (scrcpyStopping) return
        scrcpyActive.value = false
        scrcpyError.value = error ? `scrcpy 视频流中断：${String(error)}` : 'scrcpy 视频流已结束'
        void refreshScreen()
      },
    })
    scrcpyActive.value = true
    phoneMode.value = 'control'
  } catch (error) {
    scrcpyError.value = `实时远控启动失败：${String(error)}`
    scrcpyActive.value = false
    await stopInteractiveSession()
    await refreshScreen()
  } finally {
    interactiveStarting.value = false
  }
}

async function stopInteractiveSession(notifyTerminal = true) {
  scrcpyStopping = true
  const session = scrcpySession
  scrcpySession = undefined
  if (session) await session.close().catch(() => {})
  scrcpyActive.value = false
  scrcpyFrames.value = 0
  scrcpySkipped.value = 0
  const token = scrcpySessionToken
  scrcpySessionToken = ''
  if (notifyTerminal && token && lockedAgentId.value) {
    await api.stopInteractive(lockedAgentId.value, token).catch(() => {})
  }
  scrcpyStopping = false
}

function ensureLockedDevice() {
  const agent = lockedAgent.value
  if (!agent || agent.status !== 'online') throw new Error('锁定的终端已离线')
  const device = agent.metadata?.device
  if (!device?.connected) throw new Error('锁定的手机已断开')
  const currentSerial = device.serial || 'default'
  if (currentSerial !== lockedSerial.value) throw new Error(`手机已变化：期望 ${lockedSerial.value}，当前 ${currentSerial}`)
  return agent
}

async function refreshScreen() {
  if (!sessionActive.value || screenshotBusy.value || remoteControlBusy.value || automationBusy.value) return
  screenshotBusy.value = true
  try {
    const agent = ensureLockedDevice()
    const queued = await api.action(agent.id, 'device/screenshot')
    const command = await waitForCommand(queued.command_id)
    if (command.status === 'failed') throw new Error(String(command.result?.error || '手机截图失败'))
    await applyScreenResult(command.result)
  } catch (error) {
    sessionError.value = String(error)
  } finally {
    screenshotBusy.value = false
  }
}

async function applyScreenResult(result: Record<string, unknown>) {
  const screenUrl = result?.screen_url
  const data = result?.data_base64
  if (typeof screenUrl === 'string' && screenUrl) {
    screenSource.value = `${screenUrl}?v=${Date.now()}`
  } else if (typeof data === 'string' && data) {
    screenSource.value = `data:${typeof result?.mime === 'string' ? result.mime : 'image/png'};base64,${data}`
  } else {
    throw new Error('终端没有返回截图数据')
  }
  screenUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  sessionError.value = ''
  await loadScreenImage(screenSource.value)
  screenOrigin.value = 'terminal'
  importedScreenshotName.value = ''
  if (screenImage.value) {
    deviceScreenSize.value = {
      width: screenImage.value.naturalWidth,
      height: screenImage.value.naturalHeight,
    }
  }
}

function openScreenshotImport() {
  if (!sessionActive.value) return ElMessage.warning('请先连接并锁定目标手机')
  screenshotImportInput.value?.click()
}

async function importScreenshot(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return ElMessage.error('只支持 PNG、JPEG 或 WebP 截图')
  }
  if (file.size > 20 * 1024 * 1024) return ElMessage.error('截图不能超过 20 MB')

  try {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取截图'))
      reader.onerror = () => reject(reader.error || new Error('无法读取截图'))
      reader.readAsDataURL(file)
    })
    await loadScreenImage(source)
    const imported = screenImage.value
    if (!imported) throw new Error('无法解析截图')

    screenSource.value = source
    screenOrigin.value = 'imported'
    importedScreenshotName.value = file.name
    screenUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    phoneMode.value = 'annotate'
    interactionMode.value = 'none'
    redrawCanvas()

    const expected = deviceScreenSize.value
    if (expected && (expected.width !== imported.naturalWidth || expected.height !== imported.naturalHeight)) {
      ElMessage.warning(`截图尺寸 ${imported.naturalWidth}×${imported.naturalHeight} 与手机 ${expected.width}×${expected.height} 不同，固定坐标和滑动轨迹可能偏移`)
    } else {
      ElMessage.success(`已导入截图：${file.name}`)
    }
  } catch (error) {
    ElMessage.error(`导入截图失败：${String(error)}`)
  }
}

async function loadScreenImage(source: string) {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('无法解析手机截图'))
    image.src = source
  })
  screenImage.value = image
  await nextTick()
  const canvas = screenCanvas.value
  if (!canvas) return
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  redrawCanvas()
}

function clearCanvas() {
  const canvas = screenCanvas.value
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

function redrawCanvas() {
  const canvas = screenCanvas.value
  const image = screenImage.value
  if (!canvas || !image) return
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const target = activeAnnotationTarget.value
  if (phoneMode.value === 'annotate' && target?.template_rect) {
    const rect = target.template_rect
    context.strokeStyle = '#ffb454'
    context.lineWidth = Math.max(3, canvas.width / 360)
    context.setLineDash([12, 8])
    context.strokeRect(rect.x, rect.y, rect.width, rect.height)
    context.setLineDash([])
  }
  if (phoneMode.value === 'annotate' && target?.click_template_rect) {
    const rect = target.click_template_rect
    context.strokeStyle = '#4de1b8'
    context.lineWidth = Math.max(3, canvas.width / 360)
    context.setLineDash([8, 6])
    context.strokeRect(rect.x, rect.y, rect.width, rect.height)
    context.setLineDash([])
  }
  const ocrRegion = selectedStep.value?.skip_condition?.enabled
    ? selectedStep.value.skip_condition.region
    : undefined
  if (phoneMode.value === 'annotate' && ocrRegion) {
    context.strokeStyle = '#c987ff'
    context.lineWidth = Math.max(3, canvas.width / 360)
    context.setLineDash([6, 5])
    context.strokeRect(ocrRegion.x, ocrRegion.y, ocrRegion.width, ocrRegion.height)
    context.setLineDash([])
  }
  const assertionRect = selectedStep.value?.post_assertion?.enabled
    ? selectedStep.value.post_assertion.template_rect
    : undefined
  if (phoneMode.value === 'annotate' && assertionRect) {
    context.strokeStyle = '#ff718e'
    context.lineWidth = Math.max(3, canvas.width / 360)
    context.setLineDash([10, 6])
    context.strokeRect(
      assertionRect.x,
      assertionRect.y,
      assertionRect.width,
      assertionRect.height,
    )
    context.setLineDash([])
  }
  if (phoneMode.value === 'annotate' && target?.click && target.click_mode !== 'image') drawPoint(context, target.click, '#4de1b8')
  const selectedSwipe = selectedStep.value?.swipe
  if (phoneMode.value === 'annotate' && selectedSwipe) {
    drawLine(context, { x: selectedSwipe.x1, y: selectedSwipe.y1 }, { x: selectedSwipe.x2, y: selectedSwipe.y2 }, '#67a8ff')
  }
  if (pointerStart.value && pointerCurrent.value) {
    if (phoneMode.value === 'control' || interactionMode.value === 'swipe') {
      drawLine(context, pointerStart.value, pointerCurrent.value, phoneMode.value === 'control' ? '#4de1b8' : '#67a8ff')
    }
    if (['template', 'click_template', 'ocr_region', 'assertion_template'].includes(interactionMode.value)) {
      const rect = normalizedRect(pointerStart.value, pointerCurrent.value)
      const color = interactionMode.value === 'click_template'
        ? '#4de1b8'
        : (interactionMode.value === 'ocr_region'
            ? '#c987ff'
            : (interactionMode.value === 'assertion_template' ? '#ff718e' : '#ffb454'))
      context.fillStyle = `${color}26`
      context.fillRect(rect.x, rect.y, rect.width, rect.height)
      context.strokeStyle = color
      context.lineWidth = Math.max(3, canvas.width / 360)
      context.strokeRect(rect.x, rect.y, rect.width, rect.height)
    }
  }
}

function drawPoint(context: CanvasRenderingContext2D, point: Point, color: string) {
  const radius = Math.max(12, context.canvas.width / 55)
  context.strokeStyle = color
  context.fillStyle = `${color}33`
  context.lineWidth = Math.max(3, context.canvas.width / 360)
  context.beginPath()
  context.arc(point.x, point.y, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.beginPath()
  context.moveTo(point.x - radius * 1.4, point.y)
  context.lineTo(point.x + radius * 1.4, point.y)
  context.moveTo(point.x, point.y - radius * 1.4)
  context.lineTo(point.x, point.y + radius * 1.4)
  context.stroke()
}

function drawLine(context: CanvasRenderingContext2D, start: Point, end: Point, color: string) {
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = Math.max(5, context.canvas.width / 220)
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
  drawPoint(context, start, color)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const size = Math.max(24, context.canvas.width / 28)
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6))
  context.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
}

function canvasPoint(event: PointerEvent): Point {
  const canvas = screenCanvas.value!
  const bounds = canvas.getBoundingClientRect()
  return {
    x: Math.round(Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width))),
    y: Math.round(Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height))),
  }
}

function normalizedRect(first: Point, second: Point): Rect {
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y),
  }
}

function pointerDown(event: PointerEvent) {
  if (!screenImage.value || remoteControlBusy.value || automationBusy.value) return
  if (phoneMode.value === 'annotate' && interactionMode.value === 'none') return
  screenCanvas.value?.setPointerCapture(event.pointerId)
  const point = canvasPoint(event)
  pointerStart.value = point
  pointerCurrent.value = point
  pointerStartedAt.value = performance.now()
  redrawCanvas()
}

function pointerMove(event: PointerEvent) {
  if (!pointerStart.value || (phoneMode.value === 'annotate' && interactionMode.value === 'click')) return
  pointerCurrent.value = canvasPoint(event)
  redrawCanvas()
}

async function pointerUp(event: PointerEvent) {
  const start = pointerStart.value
  const target = activeAnnotationTarget.value
  if (!start) return
  const end = canvasPoint(event)
  if (phoneMode.value === 'control') {
    const distance = Math.hypot(end.x - start.x, end.y - start.y)
    const elapsed = Math.max(80, Math.min(1500, Math.round(performance.now() - pointerStartedAt.value)))
    resetPointer()
    if (distance < Math.max(18, screenCanvas.value!.width / 90)) {
      await sendRemoteControl({ action: 'tap', x: end.x, y: end.y })
    } else {
      await sendRemoteControl({ action: 'swipe', x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration_ms: elapsed })
    }
    return
  }
  if (!target || interactionMode.value === 'none') return resetPointer()
  if (interactionMode.value === 'click') {
    target.click = end
    ElMessage.success(`点击点已设置：${end.x}, ${end.y}`)
  } else if (interactionMode.value === 'swipe') {
    const step = selectedStep.value
    if (!step) return resetPointer()
    if (Math.hypot(end.x - start.x, end.y - start.y) < 20) {
      resetPointer()
      return ElMessage.warning('滑动轨迹太短')
    }
    step.swipe = { x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration_ms: Number(step.swipe_duration_ms || 350) }
    ElMessage.success('滑动轨迹已设置')
  } else if (['template', 'click_template', 'ocr_region', 'assertion_template'].includes(interactionMode.value)) {
    const rect = normalizedRect(start, end)
    if (rect.width < 12 || rect.height < 12) {
      resetPointer()
      return ElMessage.warning('截图区域太小，请重新拖框')
    }
    const source = screenImage.value
    if (!source) return
    const crop = document.createElement('canvas')
    crop.width = rect.width
    crop.height = rect.height
    crop.getContext('2d')?.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    if (interactionMode.value === 'ocr_region') {
      const step = selectedStep.value
      if (!step?.skip_condition?.enabled) return resetPointer()
      step.skip_condition.region = rect
      step.skip_condition.preview_base64 = crop.toDataURL('image/png')
      conditionTestResult.value = null
      const mode = step.skip_condition.mode === 'image' ? '图片模板' : '数字识别区域'
      ElMessage.success(`${mode}已设置：${rect.width} × ${rect.height}`)
    } else if (interactionMode.value === 'assertion_template') {
      const step = selectedStep.value
      if (!step?.post_assertion?.enabled) return resetPointer()
      step.post_assertion.template_base64 = crop.toDataURL('image/png')
      step.post_assertion.template_rect = rect
      ElMessage.success(`执行后断言图片已截取：${rect.width} × ${rect.height}`)
    } else if (interactionMode.value === 'click_template') {
      target.click_template_base64 = crop.toDataURL('image/png')
      target.click_template_rect = rect
      ElMessage.success(`点击图片已单独截取：${rect.width} × ${rect.height}`)
    } else {
      target.template_base64 = crop.toDataURL('image/png')
      target.template_rect = rect
      ElMessage.success(`识别目标已截取：${rect.width} × ${rect.height}`)
    }
  }
  resetPointer()
  interactionMode.value = 'none'
  redrawCanvas()
}

function resetPointer() {
  pointerStart.value = null
  pointerCurrent.value = null
  pointerStartedAt.value = 0
  redrawCanvas()
}

async function sendRemoteControl(payload: Record<string, unknown>, captureAfter = true) {
  if (!sessionActive.value || remoteControlBusy.value || automationBusy.value) return
  try {
    const agent = ensureLockedDevice()
    remoteControlBusy.value = true
    const queued = await api.control(agent.id, { ...payload, capture_after: captureAfter })
    const command = await waitForCommand(queued.command_id)
    if (command.status === 'failed') throw new Error(String(command.result?.error || '远程控制失败'))
    if (captureAfter) await applyScreenResult(command.result)
  } catch (error) {
    ElMessage.error(`远程控制失败：${String(error)}`)
  } finally {
    remoteControlBusy.value = false
  }
}

function switchPhoneMode(mode: PhoneMode) {
  phoneMode.value = mode
  interactionMode.value = 'none'
  resetPointer()
}

async function changeOrientation(value: string | number | boolean | undefined) {
  const orientation = String(value)
  if (!['auto', 'portrait', 'landscape'].includes(orientation)) return
  await sendRemoteControl({ action: 'orientation', orientation }, false)
}

function liveCanvasPoint(event: PointerEvent): Point {
  const canvas = scrcpyCanvas.value!
  const bounds = canvas.getBoundingClientRect()
  const width = scrcpySession?.width || canvas.width
  const height = scrcpySession?.height || canvas.height
  return {
    x: Math.round(Math.max(0, Math.min(width - 1, (event.clientX - bounds.left) * width / bounds.width))),
    y: Math.round(Math.max(0, Math.min(height - 1, (event.clientY - bounds.top) * height / bounds.height))),
  }
}

function livePointerDown(event: PointerEvent) {
  if (!scrcpySession || phoneMode.value !== 'control' || automationBusy.value) return
  scrcpyCanvas.value?.setPointerCapture(event.pointerId)
  livePointerId = event.pointerId
  const point = liveCanvasPoint(event)
  void scrcpySession.touch(0, point.x, point.y)
}

function livePointerMove(event: PointerEvent) {
  if (!scrcpySession || livePointerId !== event.pointerId || automationBusy.value) return
  const point = liveCanvasPoint(event)
  void scrcpySession.touch(2, point.x, point.y)
}

function livePointerUp(event: PointerEvent) {
  if (!scrcpySession || livePointerId !== event.pointerId || automationBusy.value) return
  const point = liveCanvasPoint(event)
  livePointerId = undefined
  void scrcpySession.touch(1, point.x, point.y)
}

function livePointerCancel(event: PointerEvent) {
  if (!scrcpySession || livePointerId !== event.pointerId || automationBusy.value) return
  const point = liveCanvasPoint(event)
  livePointerId = undefined
  void scrcpySession.touch(3, point.x, point.y)
}

async function remoteKey(action: 'back' | 'home' | 'wake' | 'sleep') {
  if (automationBusy.value) return
  try {
    if (scrcpySession) {
      if (action === 'back') await scrcpySession.back()
      else if (action === 'home') await scrcpySession.home()
      else await scrcpySession.setScreenPower(action === 'wake')
      return
    }
    await sendRemoteControl({ action })
  } catch (error) {
    ElMessage.error(`远程按键失败：${String(error)}`)
  }
}

function beginInteraction(mode: InteractionMode) {
  if (!sessionActive.value || !screenImage.value) return ElMessage.warning('请先连接终端并获取手机画面')
  const action = selectedStep.value?.action
  const isGlobalPopup = Boolean(selectedGlobalPopup.value)
  if (mode === 'template' && !isGlobalPopup && !['wait_click', 'smart_swipe', 'wait_image'].includes(action || '')) return ElMessage.warning('当前步骤不使用图片识别')
  if (mode === 'click_template' && !isGlobalPopup && action !== 'wait_click') return ElMessage.warning('请先选择点击事件或步骤弹窗规则')
  if (mode === 'click_template' && activeAnnotationTarget.value?.click_mode !== 'image') return ElMessage.warning('请先切换到“点击图片”模式')
  if (mode === 'click' && !isGlobalPopup && action !== 'wait_click') return ElMessage.warning('请先选择点击事件或步骤弹窗规则')
  if (mode === 'click' && activeAnnotationTarget.value?.click_mode !== 'fixed') return ElMessage.warning('当前不是固定坐标模式；如需手动标注，请先切换到固定坐标')
  if (mode === 'swipe' && action !== 'smart_swipe') return ElMessage.warning('请先选择滑动事件')
  if (mode === 'ocr_region' && (!selectedStep.value || selectedStep.value.action === 'start' || !selectedStep.value.skip_condition?.enabled)) {
    return ElMessage.warning('请先勾选当前事件的“开启条件跳过”')
  }
  if (mode === 'assertion_template' && (!selectedStep.value || !selectedStep.value.post_assertion?.enabled)) {
    return ElMessage.warning('请先勾选当前事件的“执行后断言”')
  }
  phoneMode.value = 'annotate'
  interactionMode.value = mode
  pointerStart.value = null
  pointerCurrent.value = null
}

function validateClickTarget(target: EditorStep | GlobalPopupRule, prefix: string) {
  const mode = target.click_mode || 'fixed'
  if (mode === 'image' && !target.click_template_base64) throw new Error(`${prefix}没有单独截取点击图片`)
  if (mode === 'fixed' && !target.click) throw new Error(`${prefix}没有设置固定点击位置`)
  if (mode === 'match_offset') {
    const step = target as EditorStep
    if (!step.template_base64 || !step.template_rect) throw new Error(`${prefix}没有截取用于多目标识别的条件图片`)
    if (!['Horizontal', 'Vertical', 'Score'].includes(String(step.match_order))) {
      throw new Error(`${prefix}的多目标排序方式无效`)
    }
    if (!Number.isInteger(Number(step.match_index)) || Number(step.match_index) < 1 || Number(step.match_index) > 100) {
      throw new Error(`${prefix}的匹配序号必须是 1 到 100 的整数`)
    }
    if (!['center', 'top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(String(step.match_anchor))) {
      throw new Error(`${prefix}的点击锚点无效`)
    }
    if (![step.match_offset_x, step.match_offset_y].every((value) => Number.isInteger(Number(value)) && Math.abs(Number(value)) <= 4096)) {
      throw new Error(`${prefix}的锚点偏移必须是 -4096 到 4096 的整数`)
    }
    if (!Number.isInteger(Number(step.match_max_clicks)) || Number(step.match_max_clicks) < 1 || Number(step.match_max_clicks) > 200) {
      throw new Error(`${prefix}的最大点击次数必须是 1 到 200 的整数`)
    }
    const wait = Number(step.wait_after_click_seconds)
    if (!Number.isFinite(wait) || wait < 0.1 || wait > 10) {
      throw new Error(`${prefix}的点击后等待必须在 0.1 到 10 秒之间`)
    }
  }
  if (mode === 'template_center' && !target.click && !target.template_rect) throw new Error(`${prefix}缺少旧版截图中心位置`)
}

function validateSkipCondition(step: EditorStep, prefix: string) {
  const condition = step.skip_condition
  if (!condition?.enabled) return
  if (condition.mode === 'image') {
    if (!condition.preview_base64) throw new Error(`${prefix}开启了图片条件跳过，但没有截取匹配图片`)
    const threshold = Number(condition.threshold)
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      throw new Error(`${prefix}的图片匹配阈值必须在 0 到 1 之间`)
    }
    return
  }
  if (!condition.region) throw new Error(`${prefix}开启了条件跳过，但没有设置数字识别区域`)
  if (!['gt', 'lt'].includes(condition.operator)) throw new Error(`${prefix}的条件比较方式无效`)
  if (!Number.isFinite(Number(condition.value))) throw new Error(`${prefix}的条件设定值必须是数字`)
}

function validatePostAssertion(step: EditorStep, prefix: string) {
  const assertion = step.post_assertion
  if (!assertion?.enabled) return
  if (!assertion.template_base64) throw new Error(`${prefix}开启了执行后断言，但没有截取断言图片`)
  const threshold = Number(assertion.threshold)
  const timeout = Number(assertion.timeout_seconds)
  const interval = Number(assertion.poll_interval_seconds)
  const retries = Number(assertion.max_retries)
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`${prefix}的断言匹配阈值必须在 0 到 1 之间`)
  }
  if (!Number.isFinite(timeout) || timeout < 0.1 || timeout > 300) {
    throw new Error(`${prefix}的单次断言等待必须在 0.1 到 300 秒之间`)
  }
  if (!Number.isFinite(interval) || interval < 0.05 || interval > 10) {
    throw new Error(`${prefix}的断言轮询间隔必须在 0.05 到 10 秒之间`)
  }
  if (!Number.isInteger(retries) || retries < 1 || retries > 20) {
    throw new Error(`${prefix}的断言重试次数必须是 1 到 20 的整数`)
  }
}

function validateFailureRetry(step: EditorStep, prefix: string) {
  const retry = step.failure_retry
  if (!retry?.enabled) return
  if (step.action === 'start') throw new Error(`${prefix}不能配置失败重试过程脚本`)
  if (!retry.process_script_name?.trim()) throw new Error(`${prefix}开启了失败重试，但没有选择过程脚本`)
  const processScript = scriptOptions.value.find((item) => item.name === retry.process_script_name)
  if (!processScript) throw new Error(`${prefix}引用的过程脚本不存在，请刷新脚本列表后重新选择`)
  if (processScript.script_type !== 'module_process' || processScript.valid === false) {
    throw new Error(`${prefix}的失败重试只能选择有效的过程脚本`)
  }
  if (processScript.cleanup_on_finish) {
    throw new Error(`${prefix}的恢复过程脚本不能启用结束清理，请改为保留应用`)
  }
  const maxRetries = Number(retry.max_retries)
  if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 20) {
    throw new Error(`${prefix}的失败重试次数必须是 1 到 20 的整数`)
  }
}

function validateScript(options: { requireName?: boolean; requireStructure?: boolean } = {}) {
  const requireName = options.requireName !== false
  const requireStructure = options.requireStructure !== false
  ensureLockedDevice()
  if (requireName) {
    const visibleName = displayScriptName(scriptName.value)
    if (!visibleName) throw new Error('请填写脚本名称')
    if ([...visibleName].length > 80) throw new Error('脚本名称不能超过 80 个字符')
    if (/[<>:"\/\\|?*%\u0000-\u001F\u007F]/u.test(visibleName)) {
      throw new Error('脚本名称不能包含 < > : " / \\ | ? * % 等特殊字符')
    }
  }
  const actions = steps.value.map((step) => step.action)
  if (!actions.length) throw new Error('脚本至少需要一个步骤')
  if (requireStructure) {
    if (scriptType.value === 'module_start') {
      if (actions[0] !== 'start' || actions.filter((action) => action === 'start').length !== 1) {
        throw new Error('开始脚本必须且只能以一个【开始】步骤开头')
      }
      if (!actions.includes('launch_app')) throw new Error('开始脚本必须包含【打开应用】步骤')
    } else if (scriptType.value === 'module_process') {
      if (actions.some((action) => ['start', 'launch_app'].includes(action))) {
        throw new Error('过程脚本不能包含【开始】或【打开应用】步骤')
      }
    } else if (actions[0] !== 'start') {
      throw new Error('普通脚本必须以【开始】步骤开头')
    }
  }
  for (const [index, rule] of globalPopups.value.entries()) {
    if (!rule.enabled) continue
    const prefix = `步骤弹窗【${rule.name.trim() || index + 1}】`
    const availableStepIds = new Set(steps.value.map((step) => step.id))
    if (!rule.step_ids.some((id) => availableStepIds.has(id))) {
      throw new Error(`${prefix}至少需要选择一个生效步骤`)
    }
    if (!rule.template_base64) throw new Error(`${prefix}没有截取识别目标`)
    validateClickTarget(rule, prefix)
  }
  for (const [index, step] of steps.value.entries()) {
    const prefix = `第 ${index + 1} 步【${labelFor(step.action)}】`
    validateFailureRetry(step, prefix)
    validateSkipCondition(step, prefix)
    validatePostAssertion(step, prefix)
    if (['wait_click', 'smart_swipe', 'wait_image'].includes(step.action) && !step.template_base64) throw new Error(`${prefix}没有截取识别目标`)
    if (step.action === 'wait_click') validateClickTarget(step, prefix)
    if (step.action === 'smart_swipe' && !step.swipe) throw new Error(`${prefix}没有设置滑动轨迹`)
    if (step.action === 'launch_app' && !step.package?.trim()) throw new Error(`${prefix}尚未识别目标应用，请先在左侧手机画面中打开应用`)
  }
}

function validateAutomationStep(step: EditorStep, prefix = `【${labelFor(step.action)}】`) {
  ensureLockedDevice()
  validateFailureRetry(step, prefix)
  validateSkipCondition(step, prefix)
  validatePostAssertion(step, prefix)
  if (['wait_click', 'smart_swipe', 'wait_image'].includes(step.action) && !step.template_base64) {
    throw new Error(`${prefix}没有截取识别目标`)
  }
  if (step.action === 'wait_click') validateClickTarget(step, prefix)
  if (step.action === 'smart_swipe' && !step.swipe) throw new Error(`${prefix}没有设置滑动轨迹`)
  if (step.action === 'launch_app' && !step.package?.trim()) {
    throw new Error(`${prefix}尚未识别目标应用，请先在左侧手机画面中打开应用`)
  }
}

function singleStepContent(step: EditorStep) {
  const { id: _id, ...serializableStep } = step
  return JSON.stringify({
    version: 2,
    execution_mode: 'single_step',
    target: {
      agent_id: lockedAgentId.value,
      device_serial: lockedSerial.value,
      device_model: lockedModel.value,
    },
    global_popups: [],
    steps: [serializableStep],
  })
}

function conditionAttemptFrom(command: Command) {
  const result = command.result
  const steps = Array.isArray(result.steps) ? result.steps : []
  const firstStep = steps[0]
  if (firstStep && typeof firstStep === 'object') {
    const condition = (firstStep as Record<string, unknown>).condition
    if (condition && typeof condition === 'object') return condition as Record<string, unknown>
  }
  const attempts = Array.isArray(result.numeric_conditions) ? result.numeric_conditions : []
  const latest = attempts.at(-1)
  return latest && typeof latest === 'object' ? latest as Record<string, unknown> : undefined
}

function stepResultFrom(command: Command) {
  const steps = Array.isArray(command.result.steps) ? command.result.steps : []
  const firstStep = steps[0]
  return firstStep && typeof firstStep === 'object'
    ? firstStep as Record<string, unknown>
    : undefined
}

async function testSkipCondition() {
  const sourceStep = selectedStep.value
  if (!sourceStep || conditionTestBusy.value || automationBusy.value) return
  const restoreInteractive = scrcpyActive.value
  try {
    ensureLockedDevice()
    validateSkipCondition(sourceStep, `【${labelFor(sourceStep.action)}】`)
    conditionTestBusy.value = true
    previewRunningId.value = `condition-${sourceStep.id}`
    conditionTestResult.value = null
    const testStep: EditorStep = {
      id: createEditorId('condition-test'),
      action: 'wait',
      seconds: 0,
      skip_condition: { ...sourceStep.skip_condition! },
    }
    const queued = await api.runStep(lockedAgentId.value, singleStepContent(testStep), restoreInteractive)
    const command = await waitForCommand(queued.command_id, 120)
    if (command.status === 'failed') {
      throw new Error(String(command.result?.error || '条件识别测试失败'))
    }
    if (sourceStep.skip_condition?.mode === 'image') {
      const stepResult = stepResultFrom(command)
      if (!stepResult) throw new Error('终端没有返回图片条件诊断')
      const hit = stepResult.skipped === true
      const condition = stepResult.condition
      const conditionRecord = condition && typeof condition === 'object'
        ? condition as Record<string, unknown>
        : undefined
      const rawScore = conditionRecord?.score
      const score = typeof rawScore === 'number' && Number.isFinite(rawScore)
        ? rawScore
        : undefined
      const threshold = Number(sourceStep.skip_condition.threshold ?? 0.85)
      const scoreText = score === undefined ? '' : `，最高相似度 ${score.toFixed(3)}`
      const message = hit
        ? `图片匹配成功（阈值 ${threshold}${scoreText}），将跳过当前事件。`
        : `图片未达到匹配阈值 ${threshold}${scoreText}；实际运行时会继续执行当前事件。`
      conditionTestResult.value = { tone: hit ? 'success' : 'info', message }
      if (hit) ElMessage.success(message)
      else ElMessage.info(message)
      return
    }
    const attempt = conditionAttemptFrom(command)
    if (!attempt) throw new Error('终端没有返回 OCR 条件诊断')
    if (attempt.error) throw new Error(String(attempt.error))

    const texts = Array.isArray(attempt.texts)
      ? attempt.texts.map((value) => String(value)).filter(Boolean)
      : []
    const rawValue = attempt.recognized_value
    const recognized = typeof rawValue === 'number'
      ? rawValue
      : (rawValue === null || rawValue === undefined ? undefined : Number(rawValue))

    if (recognized === undefined || !Number.isFinite(recognized)) {
      const ocrText = texts.length ? `“${texts.join(' / ')}”` : '空内容'
      const message = `未识别到数字（OCR：${ocrText}）；实际运行时不会跳过，会继续执行当前事件。`
      conditionTestResult.value = { tone: 'warning', message }
      ElMessage.warning(message)
      return
    }

    const hit = attempt.hit === true
    const operator = sourceStep.skip_condition?.operator === 'lt' ? '小于' : '大于'
    const threshold = sourceStep.skip_condition?.value
    const message = `识别到 ${recognized}，${operator} ${threshold}：条件${hit ? '成立，将跳过当前事件' : '不成立，将执行当前事件'}。`
    conditionTestResult.value = { tone: hit ? 'success' : 'info', message }
    if (hit) ElMessage.success(message)
    else ElMessage.info(message)
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    conditionTestResult.value = { tone: 'error', message }
    ElMessage.error(`条件识别测试失败：${message}`)
  } finally {
    conditionTestBusy.value = false
    previewRunningId.value = ''
    if (!restoreInteractive && sessionActive.value) await refreshScreen()
  }
}

async function runStepOnce(step: EditorStep, previewId = step.id) {
  if (previewRunningId.value) return
  cancelAppDetection()
  const restoreInteractive = scrcpyActive.value
  const restorePhoneMode = phoneMode.value
  try {
    validateAutomationStep(step)
    livePointerId = undefined
    previewRunningId.value = previewId
    const queued = await api.runStep(lockedAgentId.value, singleStepContent(step), restoreInteractive)
    const result = await waitForCommand(queued.command_id, 600)
    if (result.status === 'failed') throw new Error(String(result.result?.error || '单步执行失败'))
    ElMessage.success(`【${labelFor(step.action)}】执行成功`)
  } catch (error) {
    ElMessage.error(`单步执行失败：${String(error)}`)
  } finally {
    previewRunningId.value = ''
    if (restoreInteractive) {
      phoneMode.value = restorePhoneMode
      if (restorePhoneMode === 'annotate') await refreshScreen()
    } else if (sessionActive.value) {
      await refreshScreen()
    }
  }
}

function runGlobalPopupOnce(rule: GlobalPopupRule) {
  const step: EditorStep = {
    id: rule.id,
    action: 'wait_click',
    template_base64: rule.template_base64,
    template_rect: rule.template_rect,
    click_template_base64: rule.click_template_base64,
    click_template_rect: rule.click_template_rect,
    click_threshold: rule.click_threshold,
    click: rule.click,
    click_mode: rule.click_mode,
    click_count: rule.click_count,
    click_interval_ms: rule.click_interval_ms,
    threshold: rule.threshold,
    timeout_seconds: 10,
    poll_interval_seconds: 0.5,
  }
  return runStepOnce(step, rule.id)
}

function scriptContent() {
  return JSON.stringify({
    version: 2,
    script_type: scriptType.value,
    cleanup_on_finish: scriptType.value === 'module_process' ? cleanupOnFinish.value : false,
    target: {
      agent_id: lockedAgentId.value,
      device_serial: lockedSerial.value,
      device_model: lockedModel.value,
    },
    global_popups: globalPopups.value.map(({ id: _id, step_ids, ...rule }) => ({
      ...rule,
      step_indexes: steps.value.flatMap((step, index) => (
        step_ids.includes(step.id) ? [index + 1] : []
      )),
    })),
    steps: steps.value.map(({ id: _id, ...step }) => step),
  }, null, 2)
}

async function saveScript() {
  try {
    validateScript()
    saving.value = true
    const visibleName = displayScriptName(scriptName.value)
    const name = storageScriptName(visibleName)
    scriptName.value = visibleName
    const saved = await api.saveScript(lockedAgentId.value, name, scriptContent())
    await loadScriptList()
    selectedScriptCategory.value = saved.category_package || UNCLASSIFIED_CATEGORY
    selectedScriptName.value = name
    ElMessage.success('可视化脚本已保存')
  } catch (error) {
    ElMessage.error(`保存失败：${String(error)}`)
  } finally {
    saving.value = false
  }
}

function openQuickTestDialog() {
  try {
    validateScript({ requireName: false, requireStructure: false })
    quickTestResult.value = null
    quickTestDialogVisible.value = true
  } catch (error) {
    ElMessage.error(`无法开始临时测试：${String(error)}`)
  }
}

async function dispatchQuickTest() {
  const restoreInteractive = scrcpyActive.value
  try {
    validateScript({ requireName: false, requireStructure: false })
    quickTesting.value = true
    quickTestResult.value = null
    if (restoreInteractive) await stopInteractiveSession()
    const repeatCount = quickTestMode.value === 'repeat' ? quickTestRepeatCount.value : 1
    const queued = await api.runQuickTest(
      lockedAgentId.value,
      scriptContent(),
      quickTestMode.value,
      repeatCount,
    )
    const command = await waitForCommand(queued.command_id, 7200)
    quickTestResult.value = command
    emit('executed', command)
    if (command.status === 'succeeded') {
      ElMessage.success(`临时测试已完成，共执行 ${Number(command.result?.run_count || repeatCount)} 次`)
    } else {
      const runIndex = Number(command.result?.run_index || 1)
      throw new Error(`第 ${runIndex}/${repeatCount} 次执行失败：${String(command.result?.error || '未知错误')}`)
    }
  } catch (error) {
    ElMessage.error(`临时测试失败：${String(error)}`)
  } finally {
    quickTesting.value = false
    if (restoreInteractive && lockedAgent.value?.capabilities?.scrcpy_relay) {
      await startInteractiveSession()
    } else {
      await refreshScreen()
    }
  }
}

async function loadScriptList() {
  if (!lockedAgentId.value) return
  const [scripts, categories] = await Promise.all([
    api.listScripts(lockedAgentId.value),
    api.listScriptCategories(lockedAgentId.value),
  ])
  scriptOptions.value = scripts
  scriptCategories.value = categories
  if (
    selectedScriptCategory.value
    && !scriptLoadCategories.value.some((category) => (
      category.package_name === selectedScriptCategory.value
    ))
  ) {
    selectedScriptCategory.value = ''
    selectedScriptName.value = ''
  }
}

async function refreshScriptLibrary() {
  try {
    await loadScriptList()
  } catch (error) {
    ElMessage.error(`刷新脚本库失败：${String(error)}`)
  }
}

async function loadScriptFromManager(name: string) {
  const item = scriptOptions.value.find((script) => script.name === name)
  selectedScriptCategory.value = item?.category_package || UNCLASSIFIED_CATEGORY
  selectedScriptName.value = name
  await loadSelectedScript()
}

async function loadSelectedScript() {
  if (!selectedScriptName.value) return
  try {
    cancelAppDetection()
    const item = await api.getScript(lockedAgentId.value, selectedScriptName.value)
    const parsed = JSON.parse(item.content) as {
      steps?: Array<Record<string, unknown>>
      global_popups?: Array<Record<string, unknown>>
      script_type?: EditorScriptType
      cleanup_on_finish?: boolean
    }
    const loadedScriptType = ['standard', 'module_start', 'module_process'].includes(String(parsed.script_type))
      ? parsed.script_type as EditorScriptType
      : 'standard'
    const loaded = (parsed.steps || []).map((step) => ({
      ...step,
      id: createEditorId(),
      failure_retry: migratedFailureRetry(step.failure_retry),
      skip_condition: migratedSkipCondition(step.skip_condition),
      post_assertion: migratedPostAssertion(step.post_assertion),
      ...(step.action === 'wait_click' ? {
        ...migratedClickFields(step),
        click_count: Number(step.click_count || 1),
        click_interval_ms: Number(step.click_interval_ms ?? 120),
      } : {}),
      ...(step.action === 'launch_app' ? {
        force_stop_before_launch: step.force_stop_before_launch !== false,
      } : {}),
    } as EditorStep))
    if (loadedScriptType === 'module_process') {
      if (loaded.some((step) => ['start', 'launch_app'].includes(step.action))) {
        throw new Error('过程脚本包含了不允许的【开始】或【打开应用】步骤')
      }
    } else if (!loaded.length || loaded[0].action !== 'start') {
      loaded.unshift(startStep())
    }
    globalPopups.value = (parsed.global_popups || []).map((rule, index) => ({
      ...rule,
      id: createEditorId('popup'),
      name: String(rule.name || `弹窗规则 ${index + 1}`),
      enabled: rule.enabled !== false,
      step_ids: migratedGlobalPopupStepIds(rule, loaded),
      ...migratedClickFields(rule),
      click_count: Number(rule.click_count || 1),
      click_interval_ms: Number(rule.click_interval_ms ?? 120),
      threshold: Number(rule.threshold ?? 0.85),
      cooldown_seconds: Number(rule.cooldown_seconds ?? 2),
      wait_after_click_seconds: Number(rule.wait_after_click_seconds ?? 0.4),
    } as GlobalPopupRule))
    scriptType.value = loadedScriptType
    cleanupOnFinish.value = loadedScriptType === 'module_process' && parsed.cleanup_on_finish === true
    steps.value = loaded
    scriptName.value = displayScriptName(item.name)
    selectedScriptCategory.value = item.category_package || UNCLASSIFIED_CATEGORY
    selectedStepIndex.value = 0
    selectedGlobalPopupId.value = ''
    interactionMode.value = 'none'
    redrawCanvas()
    ElMessage.success('脚本已载入')
  } catch (error) {
    ElMessage.error(`载入失败：${String(error)}`)
  }
}

watch(selectedStepIndex, () => {
  interactionMode.value = 'none'
  redrawCanvas()
})
watch(selectedGlobalPopupId, () => {
  interactionMode.value = 'none'
  redrawCanvas()
})
watch(steps, redrawCanvas, { deep: true })
watch(globalPopups, redrawCanvas, { deep: true })
watch(() => props.agents, () => {
  if (!sessionActive.value) {
    if (!stagedAgentId.value && props.agents.length) {
      stagedAgentId.value = props.agents.some((agent) => agent.id === requestedAgentId) ? requestedAgentId : props.agents[0].id
    }
    return
  }
  try {
    ensureLockedDevice()
    sessionError.value = ''
  } catch (error) {
    sessionError.value = String(error)
  }
}, { deep: true, immediate: true })

onBeforeUnmount(() => {
  cancelAppDetection()
  void stopInteractiveSession()
})
</script>

<template>
  <div class="visual-editor">
    <div class="session-bar">
      <div class="session-select">
        <span>编辑会话</span>
        <el-select v-model="stagedAgentId" :disabled="sessionActive" placeholder="选择测试终端" style="width: 270px">
          <el-option v-for="agent in agents" :key="agent.id" :label="`${agent.name} · ${agent.metadata?.device?.model || '无手机'}`" :value="agent.id" />
        </el-select>
        <el-button v-if="!sessionActive" type="primary" @click="connectSession">连接并锁定手机</el-button>
        <el-button v-else @click="disconnectSession">断开会话</el-button>
      </div>
      <div :class="['session-target', sessionActive ? 'locked' : '']">
        <span class="lock-dot"></span>
        <div><strong>{{ targetLabel }}</strong><small>{{ sessionActive ? `终端 ${lockedAgentId}` : '连接后终端和手机在本次编辑期间不会自动切换' }}</small></div>
      </div>
    </div>

    <el-alert v-if="sessionError" :title="sessionError" type="error" :closable="false" show-icon class="session-alert" />
    <el-alert v-if="scrcpyError" :title="scrcpyError" type="warning" :closable="false" show-icon class="session-alert">
      <template #default><el-button size="small" :loading="interactiveStarting" @click="startInteractiveSession">重试实时远控</el-button></template>
    </el-alert>

    <div :class="['visual-workspace', { 'landscape-layout': landscapeDisplay }]">
      <section :class="['phone-panel', { landscape: landscapeDisplay }]">
        <div class="panel-title">
          <div><strong>手机画面</strong></div>
          <div class="screen-controls">
            <span v-if="scrcpyActive" class="scrcpy-badge">SCRCPY · {{ scrcpyFrames }} FPS</span>
            <span v-else class="manual-capture-badge">无损截图 · 手动刷新</span>
            <input ref="screenshotImportInput" class="screen-import-input" type="file" accept="image/png,image/jpeg,image/webp" @change="importScreenshot" />
          </div>
        </div>
        <div class="phone-work-area">
        <div class="phone-mode-bar">
          <div class="phone-mode-actions">
            <div class="mode-tabs">
              <button :class="{ active: phoneMode === 'control' }" @click="switchPhoneMode('control')">远程控制</button>
              <button :class="{ active: phoneMode === 'annotate' }" @click="switchPhoneMode('annotate')">脚本标注</button>
            </div>
            <div class="orientation-control">
              <span>方向</span>
              <el-select v-model="orientationMode" size="small" :disabled="!sessionActive || remoteControlBusy || automationBusy" @change="changeOrientation">
                <el-option label="自动" value="auto" />
                <el-option label="竖屏" value="portrait" />
                <el-option label="横屏" value="landscape" />
              </el-select>
            </div>
          </div>
          <span v-if="phoneMode === 'control' && !scrcpyActive" class="mode-hint">截图控制回退模式</span>
          <span v-else-if="phoneMode === 'annotate'" class="mode-hint">{{ screenOrigin === 'imported' ? `离线截图：${importedScreenshotName}` : '点击“刷新无损截图”，再选择工具进行标注' }}</span>
        </div>
        <div class="phone-stage">
          <div v-if="!screenSource && !scrcpyActive" class="phone-placeholder">
            <div class="phone-outline"><span></span></div>
            <strong>{{ interactiveStarting ? '正在启动 scrcpy' : '等待连接手机' }}</strong>
            <p>{{ interactiveStarting ? '浏览器正在建立视频与控制通道。' : '连接终端后，这里会显示 Android 画面。' }}</p>
          </div>
          <canvas
            v-show="scrcpyActive && (phoneMode === 'control' || !screenSource)"
            ref="scrcpyCanvas"
            class="screen-canvas live-canvas"
            @pointerdown="livePointerDown"
            @pointermove="livePointerMove"
            @pointerup="livePointerUp"
            @pointercancel="livePointerCancel"
            @contextmenu.prevent="remoteKey('back')"
          />
          <canvas
            v-show="screenSource && (!scrcpyActive || phoneMode === 'annotate')"
            ref="screenCanvas"
            :class="['screen-canvas', interactionMode !== 'none' ? 'is-marking' : '', phoneMode === 'control' ? 'is-controlling' : '']"
            @pointerdown="pointerDown"
            @pointermove="pointerMove"
            @pointerup="pointerUp"
            @pointercancel="resetPointer"
          />
          <div v-if="interactiveStarting" class="remote-busy">正在启动 scrcpy 实时会话…</div>
          <div v-else-if="automationBusy" class="remote-busy">正在执行脚本，实时画面继续更新…</div>
          <div v-else-if="remoteControlBusy" class="remote-busy">正在操作手机并获取新画面…</div>
        </div>
        <div class="screen-status">
          <span>{{ screenOrigin === 'imported' && screenImage ? `${screenImage.naturalWidth} × ${screenImage.naturalHeight}` : (scrcpyActive ? `${scrcpyWidth} × ${scrcpyHeight}` : (screenImage ? `${screenImage.naturalWidth} × ${screenImage.naturalHeight}` : '—')) }}</span>
          <span>{{ screenOrigin === 'imported' ? `已导入 · ${importedScreenshotName}` : (scrcpyActive ? `实时流 · 丢帧 ${scrcpySkipped}` : (screenUpdatedAt ? `更新于 ${screenUpdatedAt}` : '尚未获取画面')) }}</span>
        </div>
        <div v-if="phoneMode === 'control'" class="remote-tools">
          <el-button :disabled="!sessionActive || remoteControlBusy || interactiveStarting || automationBusy" @click="remoteKey('back')">返回</el-button>
          <el-button :disabled="!sessionActive || remoteControlBusy || interactiveStarting || automationBusy" @click="remoteKey('home')">主页</el-button>
          <el-button :disabled="!sessionActive || remoteControlBusy || interactiveStarting || automationBusy" @click="remoteKey('wake')">唤醒</el-button>
          <el-button :disabled="!sessionActive || remoteControlBusy || interactiveStarting || automationBusy" @click="remoteKey('sleep')">锁屏</el-button>
          <p>{{ scrcpyActive ? '输入事件通过 scrcpy 控制通道直达手机，不经过任务队列。' : '当前为截图回退模式；操作完成后获取新画面。' }}</p>
        </div>
        <div v-else class="annotation-panel">
          <div class="capture-source-bar">
            <div>
              <strong>标注画面来源</strong>
              <small>无损画面只在点击刷新时更新；也可导入历史截图离线编写。</small>
            </div>
            <div>
              <el-button size="small" :loading="screenshotBusy" :disabled="!sessionActive" title="从当前手机抓取一张新的无损截图" @click="refreshScreen">刷新无损截图</el-button>
              <el-button size="small" :disabled="!sessionActive" title="导入本地 PNG、JPEG 或 WebP 截图作为标注画面" @click="openScreenshotImport">导入截图</el-button>
            </div>
          </div>
          <div class="mark-tools">
            <button :class="{ active: interactionMode === 'template' }" @click="beginInteraction('template')"><b>1</b><span>拖框截取条件识别图<small>橙色区域</small></span></button>
            <button v-if="activeAnnotationTarget?.click_mode === 'image'" :class="{ active: interactionMode === 'click_template' }" @click="beginInteraction('click_template')"><b>2</b><span>单独截取点击图片<small>绿色区域</small></span></button>
            <button v-if="activeAnnotationTarget?.click_mode === 'fixed'" :class="{ active: interactionMode === 'click' }" @click="beginInteraction('click')"><b>2</b><span>单击设置点击位置<small>绿色坐标</small></span></button>
            <button v-if="selectedStep?.action === 'smart_swipe'" :class="{ active: interactionMode === 'swipe' }" @click="beginInteraction('swipe')"><b>2</b><span>拖动设置滑动轨迹<small>蓝色箭头</small></span></button>
            <button v-if="selectedStep?.action !== 'start' && selectedStep?.skip_condition?.enabled" :class="{ active: interactionMode === 'ocr_region' }" @click="beginInteraction('ocr_region')"><b>IF</b><span>拖框选择{{ selectedStep.skip_condition.mode === 'image' ? '匹配图片' : '数字区域' }}<small>紫色区域</small></span></button>
            <button v-if="selectedStep?.post_assertion?.enabled" :class="{ active: interactionMode === 'assertion_template' }" @click="beginInteraction('assertion_template')"><b>✓</b><span>拖框截取断言图片<small>红色区域</small></span></button>
          </div>
        </div>
        </div>
      </section>

      <section class="flow-panel">
        <div class="panel-title flow-header">
          <div><strong>脚本流程</strong></div>
          <div class="flow-summary">
            <span>{{ globalPopups.length }} 条独立规则</span>
            <span>{{ steps.length }} 个步骤</span>
          </div>
        </div>

        <div class="script-library-row">
          <div class="library-heading setup-title">
            <strong>脚本库</strong>
            <el-tooltip content="先选应用分类，再载入对应脚本。" placement="top">
              <el-icon class="setup-info" aria-label="脚本库提示"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-select
            v-model="selectedScriptCategory"
            class="load-category-select"
            size="small"
            placeholder="选择应用分类"
            @change="selectedScriptName = ''"
          >
            <el-option
              v-for="category in scriptLoadCategories"
              :key="category.package_name"
              :label="`${category.display_name}（${category.script_count}）`"
              :value="category.package_name"
            />
          </el-select>
          <el-select
            v-model="selectedScriptName"
            class="load-script-select"
            size="small"
            placeholder="选择对应脚本"
            :disabled="!selectedScriptCategory"
          >
            <el-option v-for="script in filteredScriptOptions" :key="script.name" :label="scriptOptionLabel(script)" :value="script.name" />
          </el-select>
          <el-button size="small" type="primary" plain title="用所选脚本替换当前编辑内容" :disabled="!selectedScriptName" @click="loadSelectedScript">载入编辑</el-button>
          <el-button size="small" title="管理分类、上传、下载、移动或删除脚本" :disabled="!sessionActive" @click="scriptManagerVisible = true">管理脚本库</el-button>
        </div>

        <div class="script-document-bar">
          <label class="script-name-field">
            <span class="setup-title">当前脚本</span>
            <el-input v-model="scriptName" class="script-name-input" size="small" placeholder="脚本名称（支持中文）" @blur="scriptName = displayScriptName(scriptName)" />
          </label>
          <div class="script-type-control">
            <label>
              <span class="setup-title">脚本类型</span>
              <el-tooltip :content="scriptTypeHint" placement="top">
                <el-icon class="setup-info" aria-label="脚本类型提示"><InfoFilled /></el-icon>
              </el-tooltip>
              <el-select v-model="scriptType" size="small" @change="changeScriptType">
                <el-option label="普通脚本" value="standard" />
                <el-option label="开始脚本（开始 + 打开应用）" value="module_start" />
                <el-option label="过程脚本（不含开始/打开应用）" value="module_process" />
              </el-select>
            </label>
            <div class="script-type-description">
              <div v-if="scriptType === 'module_process'" class="module-cleanup-policy">
                <div><strong>结束时清理并关闭应用</strong></div>
                <el-switch v-model="cleanupOnFinish" inline-prompt active-text="清理" inactive-text="保留" />
              </div>
            </div>
          </div>
          <div class="script-document-actions">
            <el-button size="small" title="仅保存当前脚本，不执行" :loading="saving" :disabled="!sessionActive" @click="saveScript()">保存脚本</el-button>
            <el-button class="quick-test-button" size="small" type="warning" plain title="直接执行当前未保存内容；不计任务统计，也不生成失败记录、截图或邮件" :loading="quickTesting" :disabled="!sessionActive || automationBusy" @click="openQuickTestDialog">临时测试</el-button>
          </div>
        </div>

        <div class="flow-work-area">
        <section class="independent-rule-settings">
          <div class="independent-rule-head">
            <div class="setup-title">
              <strong>独立规则</strong>
              <el-button size="small" class="add-rule-button" title="添加独立规则" aria-label="添加独立规则" @click="addGlobalPopup"><el-icon><Plus /></el-icon>添加规则</el-button>
              <el-tooltip content="独立添加的规则，可对指定或全部事件生效。用于脚本执行过程中，关闭独立事件触发的弹窗" placement="top">
                <el-icon class="setup-info" aria-label="独立规则提示"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
          </div>
          <div v-if="globalPopups.length" class="independent-rule-controls">
            <el-select v-model="selectedGlobalPopupId" class="independent-rule-select" size="small" placeholder="选择独立规则">
              <el-option v-for="rule in globalPopups" :key="rule.id" :label="rule.name" :value="rule.id" />
            </el-select>
            <el-button size="small" plain :disabled="!selectedGlobalPopup || automationBusy" @click="selectedGlobalPopup && runGlobalPopupOnce(selectedGlobalPopup)">试运行</el-button>
            <el-button size="small" type="danger" plain :disabled="!selectedGlobalPopup" @click="selectedGlobalPopup && removeGlobalPopup(selectedGlobalPopup.id)">删除</el-button>
          </div>
        </section>

        <div class="flow-body">
          <div class="step-list">
            <template v-for="(step, index) in steps" :key="step.id">
              <article :class="['flow-step', { selected: !selectedGlobalPopupId && selectedStepIndex === index, required: scriptType !== 'module_process' && index === 0, retry: step.failure_retry?.enabled }]" @click="selectStep(index)">
                <div class="step-index">{{ stepTag(index) }}</div>
                <div class="step-copy"><strong>{{ labelFor(step.action) }}<em v-if="step.failure_retry?.enabled">失败重试</em></strong><small>{{ flowStepSummary(step, index) }}</small></div>
                <div class="step-buttons" @click.stop>
                  <button class="run-step-button" title="单步试运行；不执行整条流程，也不触发流程结束清理" :disabled="automationBusy" @click="runStepOnce(step)">
                    <el-icon v-if="previewRunningId === step.id" class="is-loading"><Loading /></el-icon>
                    <el-icon v-else><CaretRight /></el-icon>
                  </button>
                  <template v-if="scriptType === 'module_process' || index > 0">
                    <button class="secondary-step-action" title="将此步骤上移一位" :disabled="index === (scriptType === 'module_process' ? 0 : 1)" @click="moveStep(index, -1)">↑</button>
                    <button class="secondary-step-action" title="将此步骤下移一位" :disabled="index === steps.length - 1" @click="moveStep(index, 1)">↓</button>
                    <button class="secondary-step-action" title="从流程中删除此步骤" @click="removeStep(index)">×</button>
                  </template>
                </div>
              </article>
              <div class="flow-insert">
                <span></span>
                <button class="flow-add-button" :title="`在第 ${index + 1} 步后添加事件`" @click="openEventPicker(index + 1)"><i aria-hidden="true"></i></button>
                <span></span>
              </div>
            </template>
            <div v-if="!steps.length && scriptType === 'module_process'" class="flow-empty-insert">
              <button class="flow-add-button" title="添加第一个事件" @click="openEventPicker(0)"><i aria-hidden="true"></i><span>添加第一个步骤</span></button>
            </div>
            <div class="flow-end"><span></span>{{ scriptType === 'module_start' || (scriptType === 'module_process' && !cleanupOnFinish) ? '模块结束：保留应用现场，继续下一模块' : '结束：强制停止应用并返回主页' }}</div>
          </div>

          <aside class="step-config">
            <div class="config-head">
              <span>{{ selectedGlobalPopup ? 'SCOPED POPUP' : stepTag(selectedStepIndex) }}</span>
              <strong>{{ selectedGlobalPopup ? selectedGlobalPopup.name : labelFor(selectedStep?.action || '') }}</strong>
            </div>

            <template v-if="selectedGlobalPopup">
              <div class="global-enable-row">
                <div><strong>指定步骤弹窗守卫</strong><small>只在所选步骤执行期间参与识别</small></div>
                <el-switch v-model="selectedGlobalPopup.enabled" inline-prompt active-text="启用" inactive-text="停用" />
              </div>
              <div class="popup-scope-toolbar">
                <span>生效步骤</span>
                <div>
                  <el-button size="small" text type="primary" @click="selectAllGlobalPopupSteps">全选（全部步骤）</el-button>
                  <el-button size="small" text @click="clearGlobalPopupSteps">清空</el-button>
                </div>
              </div>
              <el-select
                v-model="selectedGlobalPopup.step_ids"
                multiple
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="4"
                placeholder="至少选择一个步骤"
                class="popup-step-selector"
              >
                <el-option
                  v-for="(step, index) in steps"
                  :key="step.id"
                  :label="`${stepTag(index)} · ${labelFor(step.action)}`"
                  :value="step.id"
                />
              </el-select>
              <div class="config-note success"><p>当前作用于 {{ globalPopupScopeSummary(selectedGlobalPopup) }}。进入未选择的步骤后，不再检测此弹窗。</p></div>
              <label>规则名称</label>
              <el-input v-model="selectedGlobalPopup.name" maxlength="50" />
              <label>弹窗识别目标</label>
              <div class="template-box">
                <img v-if="selectedGlobalPopup.template_base64" :src="selectedGlobalPopup.template_base64" alt="步骤弹窗模板" />
                <span v-else>尚未截取弹窗特征</span>
                <el-button size="small" @click="beginInteraction('template')">在左侧拖框截取</el-button>
              </div>
              <label>关闭位置</label>
              <el-radio-group v-model="selectedGlobalPopup.click_mode" class="click-position-modes">
                <el-radio-button value="image">点击图片</el-radio-button>
                <el-radio-button value="fixed">固定坐标</el-radio-button>
              </el-radio-group>
              <div v-if="selectedGlobalPopup.click_mode === 'fixed'" class="coordinate-row"><code>{{ selectedGlobalPopup.click ? `${selectedGlobalPopup.click.x}, ${selectedGlobalPopup.click.y}` : '未设置' }}</code><el-button size="small" @click="beginInteraction('click')">在左侧单击选择</el-button></div>
              <div v-else class="template-box click-template-box">
                <img v-if="selectedGlobalPopup.click_template_base64" :src="selectedGlobalPopup.click_template_base64" alt="步骤弹窗关闭图片" />
                <span v-else>尚未单独截取关闭按钮图片</span>
                <el-button size="small" @click="beginInteraction('click_template')">在左侧单独截取</el-button>
              </div>
              <label>关闭点击模式</label>
              <el-radio-group v-model="selectedGlobalPopup.click_count" size="small">
                <el-radio-button :value="1">单击</el-radio-button>
                <el-radio-button :value="2">双击</el-radio-button>
                <el-radio-button :value="3">三连击</el-radio-button>
              </el-radio-group>
              <div class="config-grid">
                <label>连点次数<el-input-number v-model="selectedGlobalPopup.click_count" :min="1" :max="20" /></label>
                <label>点击间隔 ms<el-input-number v-model="selectedGlobalPopup.click_interval_ms" :min="0" :max="2000" :step="20" /></label>
                <label>匹配阈值<el-input-number v-model="selectedGlobalPopup.threshold" :min="0.1" :max="1" :step="0.01" :precision="2" /></label>
                <label v-if="selectedGlobalPopup.click_mode === 'image'">点击图片阈值<el-input-number v-model="selectedGlobalPopup.click_threshold" :min="0.1" :max="1" :step="0.01" :precision="2" /></label>
                <label>重复触发冷却秒<el-input-number v-model="selectedGlobalPopup.cooldown_seconds" :min="0" :max="60" :step="0.5" /></label>
                <label>点击后等待秒<el-input-number v-model="selectedGlobalPopup.wait_after_click_seconds" :min="0" :max="5" :step="0.1" /></label>
              </div>
              <div class="config-note"><p>弹窗识别图只负责判断弹窗是否出现；关闭图片需要单独截取，执行时会再次匹配关闭图片并点击它的中心。也可以改用固定坐标。</p></div>
            </template>

            <template v-if="selectedStep">
            <div v-if="selectedStep.action === 'start'" class="config-note success">
              <strong>固定起点</strong>
              <p>检查 ADB 连接，强制唤醒屏幕，尝试解除无密码锁屏并回到 Android 主界面。任意检查失败都会终止脚本并回传失败。</p>
            </div>

            <section v-if="selectedStep.action !== 'start'" :class="['failure-retry-card', { enabled: selectedStep.failure_retry?.enabled }]">
              <div class="failure-retry-head">
                <div>
                  <strong>失败重试过程脚本</strong>
                  <small>当前 {{ stepTag(selectedStepIndex) }} 失败时先运行过程脚本，成功后重试当前步骤</small>
                </div>
                <el-checkbox
                  :model-value="selectedStep.failure_retry?.enabled === true"
                  @change="toggleFailureRetry"
                >启用</el-checkbox>
              </div>
              <div v-if="selectedStep.failure_retry?.enabled" class="failure-retry-body">
                <div class="failure-retry-route">
                  <span>{{ stepTag(selectedStepIndex) }} 失败</span>
                  <b>→</b>
                  <span>运行过程脚本</span>
                  <b>→</b>
                  <span>重试 {{ stepTag(selectedStepIndex) }}</span>
                </div>
                <label>恢复过程脚本
                  <el-select
                    v-model="selectedStep.failure_retry.process_script_name"
                    filterable
                    placeholder="选择一个过程脚本"
                  >
                    <el-option
                      v-for="script in failureRetryProcessOptions"
                      :key="script.name"
                      :label="scriptOptionLabel(script)"
                      :value="script.name"
                    />
                  </el-select>
                </label>
                <p v-if="!failureRetryProcessOptions.length" class="failure-retry-empty">没有可用的过程脚本。请先创建“过程脚本”，并将结束策略设为“保留应用”。</p>
                <label>最大重试次数
                  <el-input-number
                    v-model="selectedStep.failure_retry.max_retries"
                    :min="1"
                    :max="20"
                    controls-position="right"
                  />
                </label>
                <p>当前步骤正常成功时不会调用过程脚本。每次失败只完整运行一次过程脚本；过程脚本成功后重跑当前步骤并计数，过程脚本自身失败会立即终止整个脚本。</p>
              </div>
            </section>

            <section v-if="selectedStep.action !== 'start'" :class="['conditional-skip-card', { enabled: selectedStep.skip_condition?.enabled }]">
              <div class="conditional-skip-head">
                <div><strong>开启条件跳过</strong><small>满足条件时跳过当前事件，可选是否连同后续所有事件一起跳过</small></div>
                <el-checkbox
                  :model-value="selectedStep.skip_condition?.enabled === true"
                  @change="toggleSkipCondition"
                >启用</el-checkbox>
              </div>
              <div v-if="selectedStep.skip_condition?.enabled" class="conditional-skip-body">
                <div class="condition-type-row">
                  <span>判断类型</span>
                  <el-radio-group
                    :model-value="selectedStep.skip_condition.mode || 'numeric'"
                    size="small"
                    @change="changeSkipConditionMode"
                  >
                    <el-radio-button value="numeric">OCR 数值</el-radio-button>
                    <el-radio-button value="image">图片匹配</el-radio-button>
                  </el-radio-group>
                </div>
                <label class="condition-following-toggle">
                  <el-checkbox v-model="selectedStep.skip_condition.skip_remaining_steps">
                    条件满足时同时跳过后续所有事件
                  </el-checkbox>
                </label>
                <label>{{ selectedStep.skip_condition.mode === 'image' ? '匹配图片模板' : '数字识别区域' }}</label>
                <div class="template-box ocr-region-box">
                  <img
                    v-if="selectedStep.skip_condition.preview_base64"
                    :src="selectedStep.skip_condition.preview_base64"
                    :alt="selectedStep.skip_condition.mode === 'image' ? '匹配图片模板' : '数字识别区域'"
                  />
                  <span v-else>{{ selectedStep.skip_condition.mode === 'image' ? '尚未截取用于匹配的图片' : '尚未选择数值所在区域' }}</span>
                  <el-button size="small" @click="beginInteraction('ocr_region')">在左侧拖框选择</el-button>
                </div>
                <div v-if="selectedStep.skip_condition.mode !== 'image'" class="condition-expression">
                  <span>OCR 数字</span>
                  <el-select v-model="selectedStep.skip_condition.operator" style="width: 105px" @change="conditionTestResult = null">
                    <el-option label="大于 >" value="gt" />
                    <el-option label="小于 <" value="lt" />
                  </el-select>
                  <el-input-number v-model="selectedStep.skip_condition.value" :step="1" @change="conditionTestResult = null" />
                  <strong>则跳过</strong>
                </div>
                <div v-else class="condition-expression image-condition-expression">
                  <span>图片相似度</span>
                  <el-input-number
                    v-model="selectedStep.skip_condition.threshold"
                    :min="0.1"
                    :max="1"
                    :step="0.01"
                    :precision="2"
                    controls-position="right"
                    @change="conditionTestResult = null"
                  />
                  <strong>达到则跳过</strong>
                </div>
                <div class="condition-test-row">
                  <el-button
                    size="small"
                    :loading="conditionTestBusy"
                    :disabled="automationBusy || !sessionActive || (selectedStep.skip_condition.mode === 'image' ? !selectedStep.skip_condition.preview_base64 : !selectedStep.skip_condition.region)"
                    @click="testSkipCondition"
                  >{{ selectedStep.skip_condition.mode === 'image' ? '测试当前画面的图片匹配条件' : '测试当前画面的 OCR 条件' }}</el-button>
                  <span v-if="conditionTestResult" :class="conditionTestResult.tone">{{ conditionTestResult.message }}</span>
                </div>
                <p v-if="selectedStep.skip_condition.mode === 'image'">拖框截图作为 MaaFramework 模板图片，匹配成功时跳过当前事件；勾选后会一并跳过后续所有步骤。</p>
                <p v-else>OCR 会读取选区中的第一个数字并与目标值比较。没有识别到有效数字时不会跳过；勾选后，命中条件会一并跳过后续所有步骤。</p>
              </div>
            </section>

            <section :class="['post-assertion-card', { enabled: selectedStep.post_assertion?.enabled }]">
              <div class="post-assertion-head">
                <div><strong>执行后断言</strong><small>识别到断言图片才进入下一步，否则重新执行当前事件</small></div>
                <el-checkbox
                  :model-value="selectedStep.post_assertion?.enabled === true"
                  @change="togglePostAssertion"
                >启用</el-checkbox>
              </div>
              <div v-if="selectedStep.post_assertion?.enabled" class="post-assertion-body">
                <label>断言图片</label>
                <div class="template-box assertion-template-box">
                  <img v-if="selectedStep.post_assertion.template_base64" :src="selectedStep.post_assertion.template_base64" alt="执行后断言图片" />
                  <span v-else>尚未截取执行成功后应出现的图片</span>
                  <el-button size="small" @click="beginInteraction('assertion_template')">在左侧拖框截取</el-button>
                </div>
                <div class="config-grid">
                  <label>匹配阈值<el-input-number v-model="selectedStep.post_assertion.threshold" :min="0.1" :max="1" :step="0.01" :precision="2" /></label>
                  <label>单次等待秒数<el-input-number v-model="selectedStep.post_assertion.timeout_seconds" :min="0.1" :max="300" :step="0.5" /></label>
                  <label>轮询间隔秒<el-input-number v-model="selectedStep.post_assertion.poll_interval_seconds" :min="0.05" :max="10" :step="0.1" /></label>
                  <label>失败后重试次数<el-input-number v-model="selectedStep.post_assertion.max_retries" :min="1" :max="20" :step="1" /></label>
                </div>
                <p>每次事件执行后等待断言图片。等待超时会从当前事件开头重新执行；超过重试次数后，任务失败并保留现场截图。</p>
              </div>
            </section>

            <template v-if="['wait_click', 'smart_swipe', 'wait_image'].includes(selectedStep.action)">
              <label>{{ selectedStep.action === 'wait_click' ? '条件识别图' : '识别目标' }}</label>
              <div class="template-box">
                <img v-if="selectedStep.template_base64" :src="selectedStep.template_base64" alt="目标模板" />
                <span v-else>{{ selectedStep.action === 'wait_click' ? '尚未截取条件识别图' : '尚未截取目标图片' }}</span>
                <el-button size="small" @click="beginInteraction('template')">在左侧拖框截取</el-button>
              </div>
              <div class="config-grid">
                <label>匹配阈值<el-input-number v-model="selectedStep.threshold" :min="0.1" :max="1" :step="0.01" :precision="2" /></label>
                <label>超时秒数<el-input-number v-model="selectedStep.timeout_seconds" :min="1" :max="300" /></label>
                <label>轮询间隔<el-input-number v-model="selectedStep.poll_interval_seconds" :min="0.2" :max="10" :step="0.2" /></label>
              </div>
            </template>

            <template v-if="selectedStep.action === 'wait_click'">
              <label>点击位置</label>
              <el-radio-group v-model="selectedStep.click_mode" class="click-position-modes">
                <el-radio-button value="image">点击图片</el-radio-button>
                <el-radio-button value="fixed">固定坐标</el-radio-button>
                <el-radio-button value="match_offset">关联识别图</el-radio-button>
              </el-radio-group>
              <div v-if="selectedStep.click_mode === 'fixed'" class="coordinate-row"><code>{{ selectedStep.click ? `${selectedStep.click.x}, ${selectedStep.click.y}` : '未设置' }}</code><el-button size="small" @click="beginInteraction('click')">在左侧单击选择</el-button></div>
              <div v-else-if="selectedStep.click_mode === 'image'" class="template-box click-template-box">
                <img v-if="selectedStep.click_template_base64" :src="selectedStep.click_template_base64" alt="点击目标图片" />
                <span v-else>尚未单独截取点击图片</span>
                <el-button size="small" @click="beginInteraction('click_template')">在左侧单独截取</el-button>
              </div>
              <section v-else class="match-offset-card">
                <div><strong>循环清除重复目标</strong><small>每次重新识别页面，选择一个匹配框并按锚点偏移点击，直到页面中不存在该图片。</small></div>
                <div class="config-grid">
                  <label>匹配结果排序
                    <el-select v-model="selectedStep.match_order">
                      <el-option label="从上到下、同行从左到右" value="Vertical" />
                      <el-option label="从左到右、同列从上到下" value="Horizontal" />
                      <el-option label="相似度从高到低" value="Score" />
                    </el-select>
                  </label>
                  <label>优先选择第几个<el-input-number v-model="selectedStep.match_index" :min="1" :max="100" :step="1" controls-position="right" /></label>
                  <label>点击锚点
                    <el-select v-model="selectedStep.match_anchor">
                      <el-option label="中心" value="center" />
                      <el-option label="左上角" value="top_left" />
                      <el-option label="右上角" value="top_right" />
                      <el-option label="左下角" value="bottom_left" />
                      <el-option label="右下角" value="bottom_right" />
                    </el-select>
                  </label>
                  <label>X 偏移 px<el-input-number v-model="selectedStep.match_offset_x" :min="-4096" :max="4096" :step="1" /></label>
                  <label>Y 偏移 px<el-input-number v-model="selectedStep.match_offset_y" :min="-4096" :max="4096" :step="1" /></label>
                  <label>点击后等待秒<el-input-number v-model="selectedStep.wait_after_click_seconds" :min="0.1" :max="10" :step="0.1" /></label>
                  <label>最大点击次数<el-input-number v-model="selectedStep.match_max_clicks" :min="1" :max="200" :step="1" controls-position="right" /></label>
                </div>
                <p>例如选择第 2 个、右下角、X=8、Y=4：有至少两个结果时点击第 2 个框右下角偏移点；不足两个时点击最后一个剩余结果，全部消失后完成。达到最大点击次数仍有目标会使任务失败并保留现场截图。</p>
              </section>
              <label>点击模式</label>
              <el-radio-group v-model="selectedStep.click_count" size="small">
                <el-radio-button :value="1">单击</el-radio-button>
                <el-radio-button :value="2">双击</el-radio-button>
                <el-radio-button :value="3">三连击</el-radio-button>
              </el-radio-group>
              <div class="config-grid">
                <label>连点次数<el-input-number v-model="selectedStep.click_count" :min="1" :max="20" /></label>
                <label>点击间隔 ms<el-input-number v-model="selectedStep.click_interval_ms" :min="0" :max="2000" :step="20" /></label>
                <label v-if="selectedStep.click_mode === 'image'">点击图片阈值<el-input-number v-model="selectedStep.click_threshold" :min="0.1" :max="1" :step="0.01" :precision="2" /></label>
              </div>
              <div v-if="selectedStep.click_mode !== 'match_offset'" class="config-note"><p>条件识别图和点击图片互相独立：先等待条件图出现，再匹配单独截取的点击图片并点击它当次匹配位置的中心。也支持改用固定坐标。</p></div>
            </template>

            <template v-if="selectedStep.action === 'smart_swipe'">
              <label>滑动逻辑</label>
              <el-radio-group v-model="selectedStep.mode" class="swipe-modes">
                <el-radio-button value="until_image">滑动直到图片出现</el-radio-button>
                <el-radio-button value="after_image">图片出现后滑动 N 秒</el-radio-button>
              </el-radio-group>
              <label>滑动轨迹</label>
              <div class="coordinate-row"><code>{{ selectedStep.swipe ? `${selectedStep.swipe.x1},${selectedStep.swipe.y1} → ${selectedStep.swipe.x2},${selectedStep.swipe.y2}` : '未设置' }}</code><el-button size="small" @click="beginInteraction('swipe')">在左侧拖动选择</el-button></div>
              <div class="config-grid">
                <label>单次滑动 ms<el-input-number v-model="selectedStep.swipe_duration_ms" :min="100" :max="3000" :step="50" /></label>
                <label>滑后等待秒<el-input-number v-model="selectedStep.wait_after_swipe_seconds" :min="0.2" :max="10" :step="0.2" /></label>
                <label v-if="selectedStep.mode === 'after_image'">持续滑动秒<el-input-number v-model="selectedStep.swipe_for_seconds" :min="0.5" :max="120" :step="0.5" /></label>
              </div>
            </template>

            <template v-if="selectedStep.action === 'launch_app'">
              <div :class="['app-detection-card', { detected: selectedStep.package, polling: appDetectionBusy }]">
                <div class="app-detection-title">
                  <span class="detection-dot"></span>
                  <div>
                    <strong>{{ selectedStep.package ? '已捕获当前应用' : (appDetectionBusy ? '等待打开目标应用' : '尚未识别应用') }}</strong>
                    <small>{{ appDetectionHint || '系统会自动读取手机前台应用，无需手动查询包名。' }}</small>
                  </div>
                </div>
                <code v-if="selectedStep.package">{{ selectedStep.package }}<template v-if="selectedStep.activity">/{{ selectedStep.activity }}</template></code>
                <p v-else>请直接在左侧“远程控制”画面中打开需要自动化的应用，识别器会持续轮询。</p>
                <el-button size="small" :loading="appDetectionBusy" @click="detectCurrentApp(selectedStep)">{{ selectedStep.package ? '重新识别' : '开始识别' }}</el-button>
              </div>
              <div class="launch-policy-row">
                <div><strong>冷启动应用</strong><small>启动前先强制停止残留后台进程</small></div>
                <el-switch v-model="selectedStep.force_stop_before_launch" inline-prompt active-text="开启" inactive-text="关闭" />
              </div>
              <label>启动后等待秒数</label>
              <el-input-number v-model="selectedStep.wait_seconds" :min="0" :max="60" :step="0.5" />
              <details class="advanced-app-config">
                <summary>高级：手动修正识别结果</summary>
                <label>Android 包名</label>
                <el-input
                  v-model="manualAppPackage"
                  placeholder="例如 com.example.app，也可粘贴 包名/Activity"
                  @keyup.enter="applyManualAppCorrection(selectedStep)"
                />
                <label>Activity</label>
                <el-input
                  v-model="manualAppActivity"
                  placeholder="例如 .MainActivity"
                  @keyup.enter="applyManualAppCorrection(selectedStep)"
                />
                <div class="manual-app-actions">
                  <small>保存时会停止自动轮询，并以这里的结果作为脚本分类与启动目标。</small>
                  <el-button size="small" type="primary" @click="applyManualAppCorrection(selectedStep)">保存修正</el-button>
                </div>
              </details>
              <div class="config-note"><p>运行脚本时会使用捕获到的 Activity 精确启动应用。无论脚本成功还是失败，结束阶段都会再次强制停止所有启动过的应用并返回主页。</p></div>
            </template>

            <template v-if="selectedStep.action === 'wait'">
              <label>等待秒数</label>
              <el-input-number v-model="selectedStep.seconds" :min="0" :max="300" :step="0.5" />
            </template>

            <template v-if="selectedStep.action === 'feedback'">
              <label>邮件标题（可选）</label>
              <el-input v-model="selectedStep.subject" maxlength="120" placeholder="默认使用脚本名称" />
              <label>反馈说明</label>
              <el-input v-model="selectedStep.message" type="textarea" :rows="3" maxlength="1000" show-word-limit />
              <div class="config-note success">
                <strong>截图并发送成功反馈</strong>
                <p>执行到这里时截取当前手机画面。整条任务成功回传后，平台使用“通知设置”中的收件人发送截图附件；不会使用终端上的 SMTP。</p>
              </div>
            </template>

            <div v-if="['back', 'home'].includes(selectedStep.action)" class="config-note">
              <p>{{ selectedStep.action === 'back' ? '调用 Android KEYCODE_BACK，不依赖页面提供返回按钮。' : '调用 Android KEYCODE_HOME，强制返回系统主界面。' }}</p>
            </div>
            </template>
          </aside>
        </div>
        </div>

      </section>
    </div>

    <ScriptManagerDrawer
      v-model="scriptManagerVisible"
      :agent-id="lockedAgentId"
      :scripts="scriptOptions"
      :categories="scriptCategories"
      @load="loadScriptFromManager"
      @changed="refreshScriptLibrary"
    />

    <el-dialog
      v-model="quickTestDialogVisible"
      title="临时测试（不保存）"
      width="min(540px, 92vw)"
      append-to-body
      :close-on-click-modal="!quickTesting"
      :close-on-press-escape="!quickTesting"
      :show-close="!quickTesting"
    >
      <div class="quick-test-form">
        <div class="quick-test-note">
          <strong>直接验证当前编辑内容</strong>
          <span>不要求【开始】或完整结束结构，也不会保存当前脚本。</span>
          <span>本次运行不计入任务成功/失败统计，不生成失败记录、失败截图或失败邮件。</span>
        </div>
        <label>执行方式
          <el-radio-group v-model="quickTestMode" :disabled="quickTesting">
            <el-radio-button value="once">单次执行</el-radio-button>
            <el-radio-button value="repeat">循环执行</el-radio-button>
          </el-radio-group>
        </label>
        <label v-if="quickTestMode === 'repeat'">循环次数
          <el-input-number
            v-model="quickTestRepeatCount"
            :min="2"
            :max="100"
            controls-position="right"
            :disabled="quickTesting"
          />
        </label>
        <p class="quick-test-policy">临时测试结束后保留当前应用状态；循环过程中任意一次失败都会停止后续循环，并返回失败轮次与步骤。</p>
        <el-alert
          v-if="quickTestResult"
          :type="quickTestResult.status === 'succeeded' ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="quickTestResult.status === 'succeeded'
            ? `临时测试完成：${Number(quickTestResult.result?.run_count || 1)} 次全部通过`
            : `临时测试失败：第 ${Number(quickTestResult.result?.run_index || 1)} 次执行未通过`"
          :description="quickTestResult.status === 'failed' ? String(quickTestResult.result?.error || '未知错误') : '结果仅保留在本次临时测试命令中。'"
        />
      </div>
      <template #footer>
        <el-button :disabled="quickTesting" @click="quickTestDialogVisible = false">关闭</el-button>
        <el-button type="warning" :loading="quickTesting" @click="dispatchQuickTest">
          {{ quickTesting ? '终端执行中' : '开始临时测试' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="eventDialogVisible" title="选择要插入的事件" width="620px" append-to-body>
      <p class="event-dialog-tip">事件将插入到第 {{ insertStepAt }} 步之后，后续步骤会自动顺延。</p>
      <div class="event-picker">
        <button
          v-for="event in availableEventDefinitions"
          :key="event.action"
          :class="{ featured: event.action === 'wait' }"
          @click="insertStep(event.action)"
        >
          <span class="event-icon">{{ event.action === 'wait' ? '⏱' : '＋' }}</span>
          <strong>{{ event.label }}</strong>
          <small>{{ event.hint }}</small>
        </button>
      </div>
      <template #footer><el-button @click="eventDialogVisible = false">取消</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.screen-import-input{display:none}
.visual-editor{padding-top:12px}.session-bar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 15px;border:1px solid #24364a;border-radius:10px;background:#0a121c}.session-select{display:flex;align-items:center;gap:10px}.session-select>span{font-size:12px;color:#8295aa}.session-target{display:flex;align-items:center;gap:10px;min-width:340px;padding-left:16px;border-left:1px solid #26384b;color:#74869a}.session-target.locked{color:#dce8f3}.lock-dot{width:9px;height:9px;border-radius:50%;background:#637387}.locked .lock-dot{background:#43d6a5;box-shadow:0 0 0 6px #43d6a51b}.session-target div{display:grid;gap:3px}.session-target strong{font-size:13px}.session-target small{font-size:10px;color:#718399}.session-alert{margin-top:10px}.visual-workspace{display:grid;grid-template-columns:minmax(340px,430px) minmax(680px,1fr);gap:14px;margin-top:14px}.phone-panel,.flow-panel{border:1px solid #24364a;border-radius:12px;background:#0a121c;overflow:hidden}.panel-title{min-height:62px;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #223347;background:#101b28}.panel-title>div:first-child{display:grid;gap:4px}.panel-title span,.config-head span{font:10px ui-monospace,monospace;letter-spacing:.14em;color:#4dcfb4}.panel-title strong{font-size:15px}.screen-controls{display:flex;align-items:center;gap:8px}.phone-stage{min-height:580px;display:grid;place-items:center;padding:14px;background:radial-gradient(circle at center,#192b3d,#070d14 68%);overflow:hidden}.screen-canvas{display:block;max-width:100%;max-height:650px;width:auto;height:auto;border:1px solid #344b62;border-radius:10px;box-shadow:0 18px 50px #0009;touch-action:none}.screen-canvas.is-marking{cursor:crosshair;outline:2px solid #4ccfb37a}.phone-placeholder{text-align:center;color:#718398}.phone-placeholder strong{display:block;margin:18px 0 5px;color:#a9b9c9}.phone-placeholder p{font-size:12px}.phone-outline{width:126px;height:242px;border:2px solid #30475c;border-radius:20px;margin:auto;padding:9px}.phone-outline span{display:block;width:40px;height:4px;border-radius:3px;background:#30475c;margin:auto}.screen-status{height:34px;display:flex;justify-content:space-between;align-items:center;padding:0 14px;border-top:1px solid #1d2d3e;color:#667b91;font:10px ui-monospace,monospace}.mark-tools{display:grid;gap:7px;padding:12px}.mark-tools button{display:flex;align-items:center;gap:10px;border:1px solid #263a4e;background:#101b27;color:#c8d6e4;border-radius:8px;padding:9px;text-align:left;cursor:pointer}.mark-tools button:hover,.mark-tools button.active{border-color:#4bcdb1;background:#132a2d}.mark-tools b{display:grid;place-items:center;width:23px;height:23px;border:1px solid #426079;border-radius:50%;font-size:11px;color:#56d1b8}.mark-tools span{display:grid;font-size:12px}.mark-tools small{color:#71859a;font-size:10px;margin-top:2px}.flow-panel{min-width:0}.flow-header{gap:15px}.script-actions{display:flex;align-items:center;gap:7px}.load-row{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #1d2d3e}.load-row>span{margin-left:auto;font-size:11px;color:#718499}.module-script-settings{display:grid;grid-template-columns:220px minmax(0,1fr);align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #26433f;background:#0d1d20}.module-script-settings>label{display:grid;grid-template-columns:65px 1fr;align-items:center;gap:7px;color:#7f948f;font-size:10px}.module-script-settings>p{margin:0;color:#77908b;font-size:10px;line-height:1.5}.module-cleanup-policy{display:flex;align-items:center;justify-content:space-between;gap:12px}.module-cleanup-policy>div{display:grid;gap:2px}.module-cleanup-policy strong{font-size:11px;color:#61d4bc}.module-cleanup-policy small{font-size:9px;color:#78928d}.flow-body{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(330px,1.05fr);min-height:570px}.step-list{padding:15px;border-right:1px solid #1f3042;max-height:660px;overflow:auto}.flow-step{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:9px;min-height:66px;border:1px solid #273b50;border-radius:9px;background:#101b28;padding:9px 10px;cursor:pointer;transition:.15s}.flow-step:hover{border-color:#3a5873}.flow-step.selected{border-color:#4fd1b6;background:linear-gradient(110deg,#11302f,#122333);box-shadow:0 0 0 1px #4fd1b633}.flow-step.required{border-left:3px solid #4fd1b6}.step-index{font:12px ui-monospace,monospace;color:#5cd4bd}.step-copy{min-width:0;display:grid;gap:5px}.step-copy strong{font-size:13px}.step-copy small{font-size:10px;color:#75899f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.step-buttons{display:flex;gap:3px}.step-buttons button{width:23px;height:23px;border:1px solid #30465c;background:#0c151f;color:#8799ab;border-radius:5px;cursor:pointer}.step-buttons button:disabled{opacity:.25}.required-badge{font-size:9px;color:#50d0b6;border:1px solid #347d70;border-radius:4px;padding:3px 5px}.flow-line{height:16px;width:1px;background:#315067;margin:auto}.flow-end{display:flex;align-items:center;justify-content:center;gap:8px;color:#687c91;font-size:11px}.flow-end span{width:9px;height:9px;border:2px solid #4a647c;border-radius:50%}.step-config{padding:16px;max-height:660px;overflow:auto}.config-head{display:grid;gap:5px;margin-bottom:18px}.config-head strong{font-size:18px}.step-config>label,.config-grid label{display:grid;gap:7px;margin:13px 0 7px;color:#8295aa;font-size:11px}.config-note{border:1px solid #2b4055;border-radius:8px;background:#101c29;padding:11px;margin:12px 0;color:#8da0b3}.config-note.success{border-color:#285f56;background:#0f2526}.config-note strong{font-size:12px;color:#5ad2b9}.config-note p{font-size:11px;line-height:1.65;margin:4px 0}.template-box{min-height:94px;display:grid;grid-template-columns:100px 1fr;align-items:center;gap:10px;border:1px dashed #38516a;border-radius:8px;padding:9px}.template-box img{grid-row:1/3;width:100px;height:76px;object-fit:contain;background:#05090e;border-radius:5px}.template-box>span{font-size:11px;color:#708398}.template-box .el-button{justify-self:start}.config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px}.config-grid label{margin-top:10px}.coordinate-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #283d52;border-radius:7px;padding:8px}.coordinate-row code{color:#68d7c0;font-size:11px}.swipe-modes{display:flex}.event-palette{display:grid;grid-template-columns:180px repeat(4,minmax(120px,1fr));gap:7px;padding:12px;border-top:1px solid #213245;background:#0c1621}.event-palette>div{display:grid;align-content:center}.event-palette>div span{font-size:12px}.event-palette>div small{font-size:9px;color:#687d92;margin-top:3px}.event-palette button{display:grid;gap:3px;border:1px solid #2a4055;border-radius:7px;background:#111e2b;color:#c8d6e4;padding:8px;text-align:left;cursor:pointer}.event-palette button:hover{border-color:#4bcdb2;background:#13302f}.event-palette button strong{font-size:11px}.event-palette button small{font-size:8px;color:#71869a}@media(max-width:1250px){.visual-workspace{grid-template-columns:360px minmax(650px,1fr)}.event-palette{grid-template-columns:repeat(4,1fr)}.event-palette>div{grid-column:1/-1}}
.phone-mode-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid #1d2d3e;background:#0c1621}.phone-mode-bar>span{font-size:10px;color:#71869a}.mode-tabs{display:flex;padding:3px;border:1px solid #2b4054;border-radius:8px;background:#071019}.mode-tabs button{border:0;border-radius:5px;background:transparent;color:#7f93a7;padding:6px 11px;font-size:11px;cursor:pointer}.mode-tabs button.active{background:#18413d;color:#63ddc5;box-shadow:0 0 0 1px #3a8f80}.phone-stage{position:relative}.screen-canvas.is-controlling,.live-canvas{cursor:crosshair;outline:1px solid #4ccfb34f}.live-canvas{background:#000;touch-action:none}.scrcpy-badge{padding:4px 8px;border:1px solid #347d70;border-radius:12px;background:#102c2a;color:#61d9c1!important;font-size:9px!important;letter-spacing:.08em!important}.remote-busy{position:absolute;left:50%;bottom:25px;transform:translateX(-50%);padding:7px 12px;border:1px solid #3d776d;border-radius:20px;background:#081512e8;color:#67d8c2;font-size:10px;box-shadow:0 5px 20px #0008;pointer-events:none}.remote-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:12px}.remote-tools .el-button{margin:0}.remote-tools p{grid-column:1/-1;margin:3px 0 0;color:#6e8296;font-size:10px;line-height:1.5}.flow-step{max-width:430px;margin:0 auto}.flow-insert{display:grid;grid-template-rows:10px 26px 10px;justify-items:center}.flow-insert span{width:1px;height:100%;background:#315067}.flow-insert button{display:grid;place-items:center;width:26px;height:26px;padding:0;border:1px solid #3a786e;border-radius:50%;background:#0c1b20;color:#5fd7bf;font-size:17px;line-height:1;cursor:pointer;transition:.15s}.flow-insert button:hover{border-color:#67e1c9;background:#17433d;transform:scale(1.1);box-shadow:0 0 0 5px #4fd1b612}.event-dialog-tip{margin:0 0 14px;color:#8194a8;font-size:12px}.event-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.event-picker button{display:grid;grid-template-columns:36px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;min-height:74px;border:1px solid #31475d;border-radius:9px;background:#101c29;color:#d2deea;padding:11px;text-align:left;cursor:pointer}.event-picker button:hover{border-color:#4fd1b6;background:#15302f}.event-picker button.featured{border-color:#7c6a36;background:#292414}.event-picker button.featured:hover{border-color:#e0ba55}.event-icon{grid-row:1/3;display:grid;place-items:center;width:34px;height:34px;border:1px solid #3d5b73;border-radius:50%;color:#5bd5bd}.event-picker strong{font-size:13px}.event-picker small{color:#75899d;font-size:10px}.event-picker .featured .event-icon{border-color:#927b3e;color:#e8c564}@media(max-width:1250px){.phone-mode-bar{align-items:flex-start;flex-direction:column}.remote-tools{grid-template-columns:repeat(2,1fr)}}
.quick-test-form{display:grid;gap:15px}.quick-test-form>label{display:grid;grid-template-columns:90px minmax(0,1fr);align-items:center;gap:10px;color:#8194a8;font-size:12px}.quick-test-note{display:grid;gap:5px;padding:13px 14px;border:1px solid #765e2d;border-radius:9px;background:#271f11}.quick-test-note strong{color:#e7bd58;font-size:13px}.quick-test-note span{color:#a49779;font-size:10px;line-height:1.55}.quick-test-policy{margin:0;color:#8294a6;font-size:10px;line-height:1.65}.quick-test-form .el-input-number{width:140px}
.global-guard{max-width:430px;margin:0 auto 16px;padding:10px;border:1px solid #705f32;border-radius:10px;background:linear-gradient(145deg,#282313,#151b21)}.guard-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.guard-head>div{display:grid;gap:2px}.guard-head span{font:9px ui-monospace,monospace;letter-spacing:.14em;color:#d7b85a}.guard-head strong{font-size:13px}.guard-head small,.guard-empty{font-size:9px;color:#8e8468}.guard-head>button{width:27px;height:27px;border:1px solid #8f7838;border-radius:50%;background:#302915;color:#e2c363;cursor:pointer}.guard-empty{margin:10px 2px 2px;line-height:1.5}.global-rule{display:grid;grid-template-columns:25px 1fr auto 23px;align-items:center;gap:7px;margin-top:8px;padding:8px;border:1px solid #51492f;border-radius:7px;background:#171b20;cursor:pointer}.global-rule.selected{border-color:#d4b252;background:#2d2818;box-shadow:0 0 0 1px #d4b25233}.global-rule.disabled{opacity:.55}.global-rule>div{display:grid;gap:3px;min-width:0}.global-rule strong{font-size:11px}.global-rule small{font-size:8px;color:#8d8a78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.guard-icon{display:grid;place-items:center;width:22px;height:22px;border:1px solid #88723a;border-radius:50%;color:#e3c35e}.guard-state{font-size:8px;color:#c3a94f}.global-rule>button{width:21px;height:21px;border:1px solid #5a4d37;border-radius:4px;background:#211b18;color:#a89076;cursor:pointer}.global-enable-row{display:flex;align-items:center;justify-content:space-between;padding:11px;border:1px solid #68582f;border-radius:8px;background:#252113;margin-bottom:14px}.global-enable-row>div{display:grid;gap:3px}.global-enable-row strong{font-size:12px;color:#dfc267}.global-enable-row small{font-size:9px;color:#8c8369}
.popup-step-selector{width:100%}.popup-scope-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 4px;color:#8295aa;font-size:11px}.popup-scope-toolbar>div{display:flex;gap:2px}.popup-scope-toolbar .el-button{margin:0;padding-inline:4px}.step-index{font-weight:700;letter-spacing:.02em}
.app-detection-card{display:grid;gap:10px;padding:13px;border:1px solid #36506a;border-radius:9px;background:#101b28}.app-detection-card.polling{border-color:#b4913e;background:#262213}.app-detection-card.detected{border-color:#347b6d;background:#102725}.app-detection-title{display:flex;align-items:center;gap:9px}.app-detection-title>div{display:grid;gap:3px}.app-detection-title strong{font-size:12px}.app-detection-title small{font-size:9px;color:#7f92a5;line-height:1.45}.detection-dot{width:9px;height:9px;border-radius:50%;background:#718296}.polling .detection-dot{background:#dfb84d;box-shadow:0 0 0 5px #dfb84d1a;animation:detection-pulse 1s infinite}.detected .detection-dot{background:#4dd3b5;box-shadow:0 0 0 5px #4dd3b51a}.app-detection-card code{padding:8px;border:1px solid #2d655c;border-radius:6px;background:#071411;color:#69dbc4;font-size:10px;word-break:break-all}.app-detection-card p{margin:0;color:#8c9daf;font-size:10px;line-height:1.6}.app-detection-card .el-button{justify-self:start}.advanced-app-config{margin-top:13px;border:1px solid #293e52;border-radius:8px;padding:10px}.advanced-app-config summary{cursor:pointer;color:#7e92a6;font-size:10px}.advanced-app-config label{display:grid;gap:6px;margin-top:10px;color:#8194a8;font-size:10px}.manual-app-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}.manual-app-actions small{color:#71869a;font-size:9px;line-height:1.45}@keyframes detection-pulse{50%{opacity:.45}}
.click-position-modes{display:flex;flex-wrap:wrap;margin-bottom:10px}.launch-policy-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:11px;border:1px solid #2d4d4a;border-radius:8px;background:#102321}.launch-policy-row>div{display:grid;gap:3px}.launch-policy-row strong{font-size:11px;color:#62d4bc}.launch-policy-row small{font-size:9px;color:#7d918f}.match-offset-card{display:grid;gap:10px;padding:12px;border:1px solid #38645e;border-radius:9px;background:#0e2222}.match-offset-card>div:first-child{display:grid;gap:3px}.match-offset-card strong{font-size:12px;color:#67d8c1}.match-offset-card small{font-size:9px;color:#7e9994;line-height:1.5}.match-offset-card>p{margin:0;color:#78928d;font-size:9px;line-height:1.65}
.manual-capture-badge{padding:4px 8px;border:1px solid #40566b;border-radius:12px;background:#111d29;color:#8da1b5!important;font-size:9px!important;letter-spacing:.04em!important}.orientation-control{display:flex;align-items:center;gap:7px}.orientation-control>span{font-size:10px;color:#71869a}.visual-workspace.landscape-layout{grid-template-columns:minmax(520px,680px) minmax(620px,1fr)}.phone-panel.landscape .phone-stage{min-height:390px}.step-buttons{align-items:center}.step-buttons .run-step-button{border-color:#347d70;background:#102c2a;color:#61d9c1}.global-rule{grid-template-columns:25px 1fr auto 23px 23px}.global-rule>button:disabled{opacity:.35;cursor:not-allowed}
.click-template-box{border-color:#32786d;background:#0e2222}.click-template-box img{outline:1px solid #3b8f80}.click-template-box>span{color:#75a99f}
.flow-step.retry{border-color:#9a7435;background:linear-gradient(110deg,#2c2111,#17212a)}.flow-step.retry.selected{border-color:#e0ad4e;background:linear-gradient(110deg,#3a2a11,#172633);box-shadow:0 0 0 1px #e0ad4e33}.step-copy strong{display:flex;align-items:center;gap:7px}.step-copy em{padding:2px 5px;border:1px solid #9b7434;border-radius:4px;color:#e0b457;font-size:8px;font-style:normal;font-weight:500}
.failure-retry-card{margin:0 0 15px;padding:11px;border:1px solid #4d4431;border-radius:9px;background:#1a1814}.failure-retry-card.enabled{border-color:#9a7130;background:#2a2113}.failure-retry-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.failure-retry-head>div{display:grid;gap:3px}.failure-retry-head strong{font-size:12px;color:#e1b35b}.failure-retry-head small{font-size:9px;color:#9b8968}.failure-retry-body{display:grid;gap:11px;margin-top:12px;padding-top:11px;border-top:1px solid #614c27}.failure-retry-route{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:6px}.failure-retry-route span{padding:7px 5px;border:1px solid #6a5631;border-radius:6px;background:#17130d;color:#cfad6c;text-align:center;font-size:9px}.failure-retry-route b{color:#d4a64e;font-size:12px}.failure-retry-body>label{display:grid;grid-template-columns:110px minmax(0,1fr);align-items:center;gap:8px;color:#a99775;font-size:10px}.failure-retry-body .el-input-number{width:130px}.failure-retry-body .el-select{width:100%}.failure-retry-body>p{margin:0;color:#a39272;font-size:9px;line-height:1.65}.failure-retry-body>p.failure-retry-empty{color:#e3a75a}
.conditional-skip-card{margin:0 0 15px;padding:11px;border:1px solid #344052;border-radius:9px;background:#101823}.conditional-skip-card.enabled{border-color:#76549a;background:#21162d}.conditional-skip-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.conditional-skip-head>div{display:grid;gap:3px}.conditional-skip-head strong{font-size:12px;color:#d0b0ed}.conditional-skip-head small{font-size:9px;color:#8e7d9e}.conditional-skip-body{display:grid;gap:9px;margin-top:12px;padding-top:11px;border-top:1px solid #503b67}.conditional-skip-body>label{color:#9f8caf;font-size:10px}.conditional-skip-body>p{margin:0;color:#9a88a8;font-size:9px;line-height:1.55}.condition-type-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.condition-type-row>span{color:#9f8caf;font-size:10px}.ocr-region-box{border-color:#78539b;background:#1b1225}.ocr-region-box img{outline:1px solid #9f6acb}.condition-expression{display:grid;grid-template-columns:auto 105px minmax(100px,1fr) auto;align-items:center;gap:7px;color:#a891b8;font-size:10px}.condition-expression strong{color:#d0a8ef;font-size:10px}.image-condition-expression{grid-template-columns:auto minmax(120px,1fr) auto}.condition-test-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:9px}.condition-test-row .el-button{margin:0}.condition-test-row span{padding:6px 8px;border:1px solid #4c405a;border-radius:6px;background:#17121e;color:#ad9ab9;font-size:9px;line-height:1.5}.condition-test-row span.success{border-color:#347b6d;color:#64d8c1}.condition-test-row span.info{border-color:#426379;color:#8cb4cb}.condition-test-row span.warning{border-color:#8d7137;color:#d7b65d}.condition-test-row span.error{border-color:#8e4658;color:#e491a4}
.post-assertion-card{margin:0 0 15px;padding:11px;border:1px solid #3f414d;border-radius:9px;background:#17171d}.post-assertion-card.enabled{border-color:#925064;background:#2a171e}.post-assertion-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.post-assertion-head>div{display:grid;gap:3px}.post-assertion-head strong{font-size:12px;color:#f2a0b0}.post-assertion-head small{font-size:9px;color:#a37e87}.post-assertion-body{display:grid;gap:9px;margin-top:12px;padding-top:11px;border-top:1px solid #6f3948}.post-assertion-body>label{color:#c18b97;font-size:10px}.post-assertion-body>p{margin:0;color:#aa818a;font-size:9px;line-height:1.55}.assertion-template-box{border-color:#9a5365;background:#24141a}.assertion-template-box img{outline:1px solid #c8667d}.assertion-template-box>span{color:#b88a95}

/* Responsive editor layout: preserve the pipeline while adapting the phone preview. */
.visual-workspace{grid-template-columns:minmax(340px,410px) minmax(0,1fr);align-items:start}.visual-workspace.landscape-layout{grid-template-columns:minmax(430px,500px) minmax(0,1fr)}.phone-panel,.flow-panel{min-width:0}.flow-panel{container-type:inline-size}.panel-title{gap:12px;flex-wrap:wrap}.screen-controls{display:flex;flex:1 1 230px;justify-content:flex-end;flex-wrap:wrap;gap:6px}.phone-mode-bar{display:grid;grid-template-columns:1fr;gap:7px;padding:8px 12px}.phone-mode-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}.mode-tabs{flex:0 0 auto}.mode-tabs button{padding:6px 9px}.orientation-control{flex:0 0 auto}.orientation-control>span{white-space:nowrap}.orientation-control .el-select{width:86px}.mode-hint{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.phone-panel.landscape .phone-stage{min-height:300px}.phone-panel.landscape .screen-canvas{max-height:460px}.flow-header{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center}.script-actions{display:flex;min-width:0;justify-content:flex-end;flex-wrap:wrap}.script-name-input{flex:1 1 165px;max-width:220px;min-width:150px}.load-row{flex-wrap:wrap}.load-row>span{white-space:nowrap}.flow-body{grid-template-columns:minmax(280px,.92fr) minmax(300px,1.08fr)}.mark-tools{grid-template-columns:repeat(2,minmax(0,1fr))}.mark-tools button{min-width:0}.mark-tools span{min-width:0}.mark-tools small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.step-buttons{flex:0 0 auto}.step-buttons .secondary-step-action{width:0!important;padding:0!important;border-width:0!important;opacity:0!important;overflow:hidden;pointer-events:none;transition:width .15s,opacity .15s}.flow-step:hover .secondary-step-action,.flow-step.selected .secondary-step-action,.secondary-step-action:focus-visible{width:23px!important;border-width:1px!important;opacity:.8!important;pointer-events:auto}.flow-step:hover .secondary-step-action:disabled,.flow-step.selected .secondary-step-action:disabled{opacity:.25!important}.global-rule .rule-delete-button{opacity:0;transition:opacity .15s}.global-rule:hover .rule-delete-button,.global-rule.selected .rule-delete-button,.rule-delete-button:focus-visible{opacity:1}.template-box{grid-template-columns:minmax(76px,100px) minmax(0,1fr)}

@container (max-width:760px){.flow-header{grid-template-columns:1fr;align-items:start}.script-actions{justify-content:flex-start;width:100%}.script-name-input{max-width:none;flex-basis:100%}.flow-body{grid-template-columns:1fr}.step-list{max-height:460px;border-right:0;border-bottom:1px solid #1f3042}.step-config{max-height:620px}.global-guard,.flow-step{max-width:540px}.load-row>span{margin-left:0;width:100%}}
@container (max-width:480px){.script-actions .el-button{padding-left:8px;padding-right:8px}.config-grid{grid-template-columns:1fr}.template-box{grid-template-columns:78px minmax(0,1fr)}.template-box img{width:78px;height:64px}}
@media(max-width:1250px){.visual-workspace,.visual-workspace.landscape-layout{grid-template-columns:minmax(340px,410px) minmax(0,1fr)}.session-bar{align-items:flex-start;flex-direction:column}.session-target{width:100%;min-width:0;padding:10px 0 0;border-left:0;border-top:1px solid #26384b}}

/* Action layout follows the platform API: capture, document actions and library actions are separate. */
.annotation-panel{border-top:1px solid #1d2d3e}
.capture-source-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#0c1621}
.capture-source-bar>div:first-child{display:grid;gap:3px;min-width:0}
.capture-source-bar strong{font-size:11px;color:#b8c8d7}
.capture-source-bar small{color:#71869a;font-size:9px;line-height:1.45}
.capture-source-bar>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.capture-source-bar .el-button{margin:0}
.mark-tools{grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid #1d2d3e}
.flow-header{display:flex;align-items:center;justify-content:space-between}
.flow-summary{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.flow-summary span{padding:4px 8px;border:1px solid #2e4659;border-radius:12px;background:#0b151f;color:#7f94a7!important;font:9px/1.2 ui-monospace,monospace!important;letter-spacing:0!important}
.script-document-bar{display:grid;grid-template-columns:minmax(180px,1fr) auto;align-items:end;gap:8px 12px;padding:11px 14px;border-bottom:1px solid #23384a;background:#0c1621}
.script-name-field{display:grid;grid-template-columns:auto minmax(150px,1fr);align-items:center;gap:9px;min-width:0;color:#8194a8;font-size:10px}
.script-name-input{width:100%;max-width:none;min-width:0}
.script-document-actions{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}
.script-document-actions .el-button{margin:0}
.script-library-row{display:grid;grid-template-columns:auto minmax(150px,.8fr) minmax(180px,1.15fr) auto auto;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #1d2d3e}
.library-heading{min-width:0;padding-right:0}
.load-category-select,.load-script-select{width:100%;min-width:0}
.script-library-row .el-button{margin:0}

@container (max-width:760px){
  .flow-header{align-items:flex-start}
  .script-document-bar{grid-template-columns:1fr}
  .script-document-actions{justify-content:flex-start}
  .script-library-row{grid-template-columns:minmax(140px,.8fr) minmax(170px,1.2fr) auto}
  .library-heading{grid-column:1/-1}
  .script-library-row>.el-button:last-child{grid-column:1/-1;justify-self:start}
}
@container (max-width:480px){
  .flow-header{display:grid;gap:9px}
  .flow-summary{justify-content:flex-start}
  .script-name-field{grid-template-columns:1fr}
  .script-document-actions{display:grid;grid-template-columns:1fr 1fr}
  .script-document-actions .el-button{width:100%}
  .script-document-actions .quick-test-button{grid-column:1/-1}
  .script-library-row{grid-template-columns:1fr 1fr}
  .library-heading,.load-category-select,.load-script-select{grid-column:1/-1}
  .script-library-row>.el-button:last-child{grid-column:auto}
  .capture-source-bar{align-items:flex-start;flex-direction:column}
  .capture-source-bar>div:last-child{justify-content:flex-start}
}

/* Viewport workbench: phone, pipeline and active configuration never move as one page. */
.visual-editor{height:100%;min-height:0;padding:0;display:flex;flex-direction:column;overflow:hidden}
.session-bar{flex:0 0 auto;min-height:52px;padding:8px 12px;border-radius:9px}.session-alert{flex:0 0 auto;margin-top:7px}.visual-workspace,.visual-workspace.landscape-layout{flex:1 1 0;min-height:0;height:auto;margin-top:8px;align-items:stretch;grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:9px;overflow:hidden}.visual-workspace.landscape-layout{grid-template-columns:minmax(410px,500px) minmax(0,1fr)}
.phone-panel,.flow-panel{height:100%;min-height:0;border-radius:9px}.phone-panel{display:flex;flex-direction:column;overflow:hidden}.flow-panel{display:flex;flex-direction:column;overflow:hidden}.panel-title{flex:0 0 auto;min-height:48px;padding:7px 11px}.panel-title strong{font-size:13px}.phone-mode-bar{flex:0 0 auto;padding:6px 9px}.phone-stage,.phone-panel.landscape .phone-stage{position:relative;flex:1 1 0;min-height:0!important;padding:9px;overflow:hidden}.screen-canvas,.phone-panel.landscape .screen-canvas{position:absolute;left:50%;top:50%;width:auto;height:auto;max-width:calc(100% - 18px)!important;max-height:calc(100% - 18px)!important;transform:translate(-50%,-50%);object-fit:contain}.screen-status{flex:0 0 28px;height:28px;padding-inline:10px}.remote-tools,.annotation-panel{flex:0 0 auto}.remote-tools{padding:7px 9px}.remote-tools p{display:none}.capture-source-bar{padding:7px 9px}.capture-source-bar small{display:none}.mark-tools{gap:5px;padding:7px 9px}.mark-tools button{min-height:38px;padding:6px 7px}.mark-tools b{width:20px;height:20px}.mark-tools span{font-size:10px}.mark-tools small{font-size:8px}
.script-document-bar{flex:0 0 auto;padding:7px 10px;gap:5px 8px}.script-library-row{flex:0 0 auto;padding:7px 10px}.module-script-settings{flex:0 0 auto;padding:7px 10px}.flow-body{flex:1 1 0;min-height:0;height:auto;overflow:hidden;grid-template-columns:minmax(270px,.84fr) minmax(320px,1.16fr)}.step-list,.step-config{height:100%;min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.step-list{padding:10px}.step-config{padding:12px}.global-guard,.flow-step{max-width:none}.global-guard{margin-bottom:10px}.flow-step{min-height:58px;padding:7px 8px}.flow-insert{grid-template-rows:6px 23px 6px}.flow-insert button{width:23px;height:23px;font-size:15px}.config-head{position:sticky;top:-12px;z-index:3;margin:-12px -12px 12px;padding:12px;border-bottom:1px solid #223347;background:#0a121cf2;backdrop-filter:blur(8px)}.config-head strong{font-size:16px}
@media(max-height:820px){.session-bar{min-height:46px;padding-block:6px}.panel-title{min-height:43px}.script-library-row{padding-block:5px}.module-script-settings{padding-block:5px}.mark-tools{grid-template-columns:repeat(3,minmax(0,1fr))}.mark-tools small{display:none}}

/* Scroll past setup once, then keep the phone and active flow work surface in one viewport. */
.visual-editor{height:auto;overflow:visible}
.visual-workspace,.visual-workspace.landscape-layout{height:auto;padding-bottom:10px;overflow:visible;align-items:stretch}
.phone-panel,.flow-panel{align-self:stretch;height:auto;min-height:calc(100vh + 260px);overflow:visible}
.phone-work-area,.flow-work-area{position:sticky;top:10px;height:calc(100vh - 20px);min-height:0;overflow:hidden}
.phone-work-area{flex:0 0 auto;display:flex;flex-direction:column;background:#0a121c;border-radius:0 0 9px 9px}
.flow-work-area{flex:0 0 auto;display:flex;flex-direction:column;background:#0a121c;border-radius:0 0 9px 9px}
.flow-body{position:static;flex:1 1 0;min-height:0;height:auto;overflow:hidden}
.flow-empty-insert{display:flex;justify-content:center;padding:18px 12px;color:#7c8fa2;font-size:11px}
.flow-add-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:18px;height:24px;padding:0 8px;border:1px solid #4a8b7d;border-radius:5px;background:#102c2a;color:#67d8c1;font:inherit;font-size:10px;line-height:1;cursor:pointer;transition:.15s}
.flow-add-button>span{color:inherit;font-size:10px;letter-spacing:0;white-space:nowrap}
.flow-add-button>i{position:relative;display:block;width:10px;height:10px;background:transparent;font-style:normal}
.flow-add-button>i::before,.flow-add-button>i::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:1px;border-radius:1px;background:currentColor;transform:translate(-50%,-50%)}
.flow-add-button>i::after{transform:translate(-50%,-50%) rotate(90deg)}
.flow-add-button:hover,.flow-add-button:focus-visible{border-color:#7be8d2;background:#17433d;transform:none;box-shadow:0 0 0 4px #4fd1b612;outline:none}
.flow-add-button:active{transform:none}
.guard-head>.flow-add-button{width:18px;height:18px;padding:0;border-radius:5px}
.flow-insert>.flow-add-button{width:18px;height:18px;padding:0;border-radius:5px}
.flow-empty-insert>.flow-add-button{height:28px;padding:0 11px;border-radius:6px}
.guard-head>.flow-add-button>span{font-size:10px;letter-spacing:0}
.module-script-settings{grid-template-columns:minmax(360px,.8fr) minmax(0,1.2fr);align-items:stretch;gap:16px}
.script-type-control{display:grid;grid-template-columns:280px minmax(0,1fr);align-items:center;gap:12px;min-width:0}
.script-type-control>label{display:grid;grid-template-columns:auto 18px minmax(0,1fr);align-items:center;gap:7px;color:#7f948f;font-size:10px}
.script-type-description{min-width:0;display:flex;align-items:center}
.independent-rule-settings{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 14px;min-width:0;padding:10px 14px;border-bottom:1px solid #26433f;background:#0d1d20}
.independent-rule-head{display:flex;align-items:center;gap:12px;min-width:0}
.independent-rule-head>div{min-width:0}
.independent-rule-head strong{font-size:12px;color:#61d4bc}
.independent-rule-controls{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0}
.independent-rule-select{flex:0 1 280px;min-width:180px}
.independent-rule-controls .el-button{margin:0}
.script-library-row,.script-document-bar,.module-script-settings{box-sizing:border-box;padding:10px 14px}
.script-library-row{grid-template-columns:100px minmax(180px,240px) minmax(220px,360px) auto auto;gap:8px}
.script-document-bar{grid-template-columns:minmax(360px,1fr) minmax(380px,1.25fr) auto;align-items:center;gap:8px 16px;height:66px;min-height:66px}
.script-name-field{grid-template-columns:100px minmax(180px,280px);width:100%}
.script-name-input{max-width:280px}
.module-script-settings{align-items:center}
.setup-title,.setup-label{display:flex;align-items:center;gap:7px;min-width:0;color:#b5c6d5;font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap}
.setup-title strong{color:inherit;font-size:inherit}
.setup-info{display:inline-flex;align-items:center;justify-content:center;flex:0 0 15px;width:15px;height:15px;color:#92979b;font-size:15px;line-height:1;cursor:help}
.setup-info:hover,.setup-info:focus-visible{color:#747b80;outline:none;filter:brightness(.92)}
.setup-info svg{width:15px;height:15px}
.independent-rule-head .setup-title{gap:7px}
.independent-rule-head .el-button{margin:0}
.add-rule-button .el-icon{margin-right:4px}
.panel-title{min-height:42px;padding:6px 11px}
.panel-title>div:first-child{gap:0}
.step-buttons .run-step-button{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;padding:0;border:1px solid #30465c;border-radius:5px;background:#0c151f;color:#8799ab;line-height:1}
.step-buttons .run-step-button .el-icon{font-size:12px;line-height:1}
.step-buttons .run-step-button .el-icon svg{width:12px;height:12px}
.step-buttons .run-step-button:hover,.step-buttons .run-step-button:focus-visible{border-color:#48637d;background:#132233;color:#bed0df;outline:none}
html[data-theme="light"] .visual-editor .step-buttons .run-step-button{border-color:#bdcad6;background:#f4f7fa;color:#53687b}
html[data-theme="light"] .visual-editor .step-buttons .run-step-button:hover,
html[data-theme="light"] .visual-editor .step-buttons .run-step-button:focus-visible{border-color:#8ca8bd;background:#eaf0f4;color:#405b70}
@container (max-width:760px){
  .script-library-row{grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr) auto}
  .library-heading{grid-column:1/-1}
  .script-library-row>.el-button:last-child{grid-column:1/-1;justify-self:start}
}
@container (max-width:480px){
  .script-library-row{grid-template-columns:1fr 1fr}
  .library-heading,.load-category-select,.load-script-select{grid-column:1/-1}
  .script-library-row>.el-button:last-child{grid-column:auto}
}
@container (max-width:760px){
  .script-document-bar{grid-template-columns:1fr auto}
  .script-type-control{grid-column:1/-1}
  .independent-rule-settings{grid-template-columns:1fr}
  .independent-rule-controls{grid-column:1;justify-content:flex-start}
}
@media(max-width:1100px){.script-document-bar{grid-template-columns:minmax(280px,1fr) auto}.script-type-control{grid-column:1/-1;grid-template-columns:280px minmax(0,1fr)}}
</style>
