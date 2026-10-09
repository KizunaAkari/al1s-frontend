<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import { debugProgress, type DebugProgress } from './quick-test-progress'
import StepPointPicker from './StepPointPicker.vue'
import { apiClient } from '../../../shared/api/client'
import { computed, nextTick, provide, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElAlert, ElButton, ElMessageBox, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus'
import { fetchScripts, type MaaScript } from '../../../shared/api/maa'
import { fetchApplicationDevices } from '../../../shared/api/maa-applicability'
import { openScript, type ScriptDocument, type WorkflowStep } from '../../../shared/api/maa-script-editor'
import { useCursorPage } from '../../../shared/api/pagination'
import StepRecoveryForm from './StepRecoveryForm.vue'
import StepSkipForm from './StepSkipForm.vue'
import ScriptStaticCheck from './ScriptStaticCheck.vue'
import ScriptQuickTest from './ScriptQuickTest.vue'
import StepActionForm from './StepActionForm.vue'
import StepWaitForm from './StepWaitForm.vue'
import StepRecognizeExecuteForm from './StepRecognizeExecuteForm.vue'
import StepSmartSwipeForm from './StepSmartSwipeForm.vue'
import StepAssertionForm from './StepAssertionForm.vue'
import StepCoordinatesForm from './StepCoordinatesForm.vue'
import StepImageBindings from './StepImageBindings.vue'
import ScreenshotImportControls from './ScreenshotImportControls.vue'
import StepRegionField from './StepRegionField.vue'
import { regionPreviewsKey, useRegionPreviews } from './use-region-previews'
import { savedRegion, savedRegionImage } from './region-selection'
import { regionPickerKey, type RegionRequest } from './region-picker-context'
import StepImageBranches from './StepImageBranches.vue'
import GlobalPopupRuleForm from './GlobalPopupRuleForm.vue'
import { globalPopupsEnabled, popupRules, toggleGlobalPopups } from './global-popup-rules'
import { useEditorScreenshot } from './use-editor-screenshot'
import WorkflowCanvas from './WorkflowCanvas.vue'
import { recognitionTitle } from './recognition-display'
import WorkflowOutline from './WorkflowOutline.vue'
import { newWorkflowStep } from './workflow-defaults'
import { insertWorkflowStep, deleteWorkflowStep, isConfigurableWorkflowAction } from './workflow-structure'
import { connectSkip } from './workflow-links'
import { bindImage } from './image-binding'
import { nativePoint, type PickedPoint } from './video-coordinates'
import { sameDocument } from './document-equality'
import { useEditorDrafts, cloneJson } from './use-editor-drafts'
import type { EditorDraft } from './editor-draft'
import { useEditorConfig } from './use-editor-config'
import { useEditorSave } from './use-editor-save'
import type { TargetDevice } from '../../../shared/api/terminals'
import { readEditorResume, writeEditorResume } from './editor-resume'
import EditorHistoryDrawer from './EditorHistoryDrawer.vue'
import HistoryDocumentPreview from './HistoryDocumentPreview.vue'
import { useEditorHistory } from './use-editor-history'

const props = defineProps<{
  scriptId: string
  initialStep?: number
  device?: TargetDevice
  screenshotUrl?: string
  screenLandscape?: boolean
  identityTarget?: string
  toolbarTarget?: string
  footerTarget?: string
  picked?: PickedPoint
}>()
const emit = defineEmits<{ saved: []; phoneDock: [docked: boolean]; phoneHidden: [hidden: boolean] }>()
const script = ref<MaaScript>()
const document = ref<ScriptDocument>()
const selected = ref(0)
const selectedGlobal = ref(false)
const selectedPopupRuleIndex = ref(0)
const selectedBranch = ref<number>()
const dirty = ref(false)
const busy = ref(false)
const uploading = ref(false)
const error = ref('')
const saved = ref(false)
const testing = ref(false)
const {
  view, mediaView, configGroup, configDocument, configChanged, configStep,
  openParameters, setMedia, cancelConfig, applyConfig,
  changeConfigStep, changeConfigDocument, changeConfigStructure,
} = useEditorConfig({
  document, selected, busy, testing, uploading,
  apply: value => {
    document.value = value
    dirty.value = true
    saved.value = false
    checkpoint()
  },
  phoneDock: docked => emit('phoneDock', docked),
  phoneHidden: hidden => emit('phoneHidden', hidden),
})
const {
  screenshot: activeScreenshot, captureBusy, captureError, importedName, discardScreenshot, openScreenshot, importScreenshot,
} = useEditorScreenshot({
  url: () => props.screenshotUrl, landscape: () => props.screenLandscape,
  focus: () => `${props.scriptId}:${props.device?.device_id}:${selected.value}:${selectedGlobal.value}:${selectedPopupRuleIndex.value}`,
  configurable: () => view.value === 'config',
  blocked: () => busy.value || testing.value || uploading.value,
  screenSize: () => (configDocument.value?.target as { screen_size?: { width: number; height: number } } | undefined)?.screen_size,
  showLive: () => { if (mediaView.value !== 'live') setMedia('live') },
  showScreenshot: () => setMedia('screenshot'),
})
const activeRegion = ref<RegionRequest>()
const regionEditing = ref(false)
function showScreenshotTab() {
  if (importedName.value || !props.screenshotUrl) setMedia('screenshot')
  else void openScreenshot()
}
async function importImage(file: File) {
  if (await importScreenshot(file)) {
    activeRegion.value = undefined
    regionEditing.value = false
  }
}
const previewVersion = ref<string>()
const imageVersion = computed(() => previewVersion.value ?? script.value?.current_version_id ?? undefined)
watch(() => script.value?.current_version_id, () => { previewVersion.value = undefined }, { flush: 'sync' })
const previews = useRegionPreviews(() => props.scriptId, () => imageVersion.value)
provide(regionPreviewsKey, previews)
function regionTarget(request: RegionRequest) {
  let target = selectedGlobal.value ? popupRules(configDocument.value ?? { steps: [] })[selectedPopupRuleIndex.value] : configStep.value
  if (request.branchIndex !== undefined) target = (configStep.value?.image_branches as Record<string, unknown>[] | undefined)?.[request.branchIndex] as typeof target
  return target
}
function selectedRect(request: RegionRequest) { return savedRegion(regionTarget(request), request.use) }
provide(regionPickerKey, {
  active: activeRegion,
  screenshot: activeScreenshot,
  selection: selectedRect,
  image: request => savedRegionImage(regionTarget(request), request.use),
  loadPreview: previews.load,
  testOcr: async resource => {
    const path = props.screenshotUrl ? new URL(props.screenshotUrl, location.href).pathname : ''
    if (!/^\/api\/v1\/editor-sessions\/[^/]+\/channels\/screenshot$/.test(path)) throw new Error('请先连接手机以测试 OCR')
    const url = await previews.load(resource)
    if (!url) throw new Error('请先选取 OCR 区域')
    const blob = await (await fetch(url)).blob()
    const response = await apiClient.post<{ texts: string[] }>(path.replace('/api/v1', '').replace('/channels/screenshot', '/ocr'), blob,
      { headers: { 'Content-Type': 'image/png' }, timeout: 40000 })
    return response.data.texts
  },
  hasScreenshot: computed(() => !!activeScreenshot.value),
  disabled: computed(() => busy.value || testing.value || uploading.value || captureBusy.value),
  select: (request, fresh) => {
    if (busy.value || testing.value || uploading.value || captureBusy.value) return
    activeRegion.value = request
    regionEditing.value = true
    if ((fresh || !activeScreenshot.value) && !importedName.value) void openScreenshot()
    else setMedia('screenshot')
  },
})
watch([selected, selectedGlobal, selectedPopupRuleIndex, selectedBranch, configGroup, view], () => { activeRegion.value = undefined })
const actionNames: Record<string, string> = {
  start: '开始', launch_app: '启动应用', stop_app: '关闭应用', wait_click: '识别并点击',
  wait_image: '等待图片', wait_text: '等待文字', click_text: '识别文字并点击',
  wait: '等待', tap: '点击', swipe: '滑动', smart_swipe: '智能滑动',
  home: '主页', back: '返回', screenshot: '截图', feedback: '反馈', cleanup: '结束应用并清理',
  wait_random: '随机等待', recognize_execute: '识别图形并执行', task_view: '任务视图',
}
const configTitle = computed(() => {
  if (selectedGlobal.value) return '00 · 全局规则'
  const item = configStep.value
  return item ? `${String(selected.value + 1).padStart(2, '0')} · ${recognitionTitle(item, actionNames[item.action] || item.action)}` : '节点配置'
})
const logOpen = ref(false)
const validationOpen = ref(false)
const canvas = ref<InstanceType<typeof WorkflowCanvas>>()
const debug = ref<DebugProgress>(debugProgress(undefined, []))
const canvasLogHost = ref<HTMLElement>()
const configLogHost = ref<HTMLElement>()
const logHost = computed(() => view.value === 'config' ? configLogHost.value : canvasLogHost.value)
const matchingDebug = computed(() => !dirty.value && !configChanged.value && debug.value.versionId === script.value?.current_version_id)
const failedStep = computed(() => matchingDebug.value && !debug.value.ruleName && debug.value.phase === 'failed' ? debug.value.step : null)
const activeStep = computed(() => matchingDebug.value && !debug.value.ruleName && debug.value.phase === 'running'
  && !debug.value.completed.includes(debug.value.step ?? 0) ? debug.value.step : null)
const debugLabel = computed(() => debug.value.ruleName
  ? debug.value.phase === 'failed' ? '全局规则失败' : '处理全局规则'
  : ({ idle:'尚未调试', waiting:'等待执行', running:'执行中', passed:'调试通过', failed:'调试失败', finished:'调试结束', cancelled:'已取消', expired:'已过期' })[debug.value.phase])
const debugStepTitle = computed(() => {
  if (debug.value.ruleName) return `00 · 全局规则 · ${debug.value.ruleName}`
  if (!matchingDebug.value || !debug.value.step) return ''
  if (debug.value.phase === 'running' && debug.value.completed.includes(debug.value.step)) return ''
  const item = document.value?.steps[debug.value.step - 1]
  return item ? `${String(debug.value.step).padStart(2, '0')} · ${recognitionTitle(item, actionNames[item.action] || item.action)}` : ''
})
function locateDebug(step: number) {
  if (!matchingDebug.value || step < 1 || step > (document.value?.steps.length ?? 0)) return
  selectedGlobal.value = false
  selected.value = step - 1
  canvas.value?.focusNode(step)
}
watch(() => `${debug.value.sessionId}:${debug.value.phase}:${debug.value.step}:${matchingDebug.value}`, () => {
  if (debug.value.ruleName) { if (debug.value.phase === 'failed') logOpen.value = true; return }
  if (!matchingDebug.value || !debug.value.step) return
  if (debug.value.phase === 'running' || debug.value.phase === 'failed') locateDebug(debug.value.step)
  if (debug.value.phase === 'failed') logOpen.value = true
})
const quick = ref<InstanceType<typeof ScriptQuickTest>>()
const checker = ref<InstanceType<typeof ScriptStaticCheck>>()
function addNode(action: string) {
  if (!document.value || busy.value || testing.value || uploading.value) return
  try {
    const at = document.value.steps.length
    changeStepStructure(insertWorkflowStep(document.value, at, newWorkflowStep(action)), at)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  }
}
function inlineEdit(index: number, value: WorkflowStep) {
  selected.value = index
  change(value)
}
async function nodeOperation(kind: 'copy' | 'delete' | 'debug', index: number) {
  if (!document.value || busy.value || testing.value || uploading.value) return
  selected.value = index
  if (kind === 'debug') {
    if (quick.value?.canStart) {
      logOpen.value = true
      await quick.value.start(index + 1)
    }
    return
  }
  const original = document.value
  const snapshot = JSON.stringify(original)
  try {
    if (kind === 'copy') {
      if (!isConfigurableWorkflowAction(original.steps[index]?.action ?? '')) {
        throw new Error('此步骤由脚本类型或旧版本管理，不能在这里复制。')
      }
      const at = original.steps.length
      changeStepStructure(insertWorkflowStep(original, at, cloneJson(original.steps[index])), at)
      return
    }
    const next = deleteWorkflowStep(original, index)
    await ElMessageBox.confirm('删除此节点？修改保存后才生效。', '删除节点', {
      type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消',
    })
    if (snapshot !== JSON.stringify(document.value) || busy.value || testing.value || uploading.value) return
    changeStepStructure(next, Math.max(0, index - 1))
  } catch (e) {
    if (e instanceof Error) error.value = e.message
  }
}
function link(from: number, to: number) {
  if (!document.value || busy.value || testing.value || uploading.value) return
  try { changeStructure(connectSkip(document.value, from, to), selected.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '连线失败' }
}
async function applyPoint() {
  if (!props.picked || !activeScreenshot.value || !configDocument.value || busy.value || testing.value || uploading.value) return
  const index = selected.value
  const snapshot = JSON.stringify(configDocument.value)
  const pick = props.picked
  const capture = activeScreenshot.value
  try {
    const point = nativePoint(pick, capture)
    await ElMessageBox.confirm('将拾取坐标写入当前步骤？现有点击参数可能被替换。', '确认坐标写入', {
      confirmButtonText: '写入', cancelButtonText: '取消',
    })
    if (selected.value !== index || JSON.stringify(configDocument.value) !== snapshot ||
      props.picked !== pick || activeScreenshot.value !== capture) {
      throw new Error('步骤或画面已变化，请重新拾取')
    }
    changeConfigDocument(bindImage(configDocument.value, index, capture, {
      x: point.x, y: point.y, width: 1, height: 1,
    }, 'point'))
  } catch (e) {
    if (e instanceof Error) error.value = e.message
  }
}
watch(selected, () => { selectedBranch.value = undefined })
watch(() => configDocument.value && popupRules(configDocument.value).length, count => {
  if (count === 0) { selectedGlobal.value = false; selectedPopupRuleIndex.value = 0 }
  else if (count !== undefined && selectedPopupRuleIndex.value >= count) selectedPopupRuleIndex.value = count - 1
})
watch(view, value => { if (value === 'canvas') selectedGlobal.value = false })
watch(selected, value => {
  const resume = readEditorResume()
  if (resume?.scriptId === props.scriptId) writeEditorResume({ ...resume, step: value + 1 })
  if (view.value === 'config') scheduleDraft()
})
watch(configDocument, () => { if (view.value === 'config') scheduleDraft() }, { deep: true })
const historyOpen = ref(false)
const drafts = useEditorDrafts({
  scriptId: () => props.scriptId, script, document,
  previewVersionId: () => imageVersion.value,
  selectPreviewVersion: value => { previewVersion.value = value },
  config: () => view.value === 'config' && configChanged.value && configDocument.value
    ? { document: configDocument.value, step: selectedGlobal.value ? -1 : selected.value }
    : undefined,
  unsaved: () => dirty.value || configChanged.value, uploading: () => uploading.value,
  edited: () => { dirty.value = true; saved.value = false },
})
const { history, historyCursor, draftError, checkpoint, scheduleDraft, persistDraft } = drafts
const draftProtected = computed(() => ['invalid', 'conflict'].includes(drafts.recoveryState.value))
const historyView = useEditorHistory({
  scriptId: () => props.scriptId, versionId: () => script.value?.current_version_id ?? undefined,
  document, history, metadata: drafts.historyMetadata, cursor: historyCursor, protectedDraft: drafts.protectedDraft,
})
watch(historyOpen, open => { if (open && script.value) void historyView.load(); else if (!open) historyView.cancel() })
async function restoreSelectedHistory() {
  if (!historyView.selectedDocument.value || !historyView.difference.value?.changed ||
    historyView.loading.value || busy.value || testing.value || uploading.value || configChanged.value) return
  await cancelConfig()
  drafts.restoreSnapshot(historyView.selectedDocument.value, historyView.selectedVersion.value)
  selected.value = Math.max(0, Math.min(selected.value, document.value!.steps.length - 1))
  selectedGlobal.value = false
  historyOpen.value = false
}
async function discardLocalDraft() {
  try {
    await ElMessageBox.confirm('永久舍弃保留在本机的旧草稿？当前页面的修改仍保留。', '舍弃旧草稿', {
      confirmButtonText: '舍弃旧草稿', cancelButtonText: '保留', type: 'warning',
    })
    await drafts.discardOriginal()
    scheduleDraft()
  } catch (cause) {
    if (cause instanceof Error) draftError.value = cause.message
  }
}
const { save: saveDocument } = useEditorSave({
  script, document, device: () => props.device, busy, testing, uploading, dirty, saved, error,
  clearDraftTimer: drafts.clearDraftTimer, persistDraft,
  prepareDraft: () => { previewVersion.value = undefined; drafts.markSaved() },
  onSaved: () => emit('saved'),
})
function openStepParameters() { selectedGlobal.value = false; openParameters() }
function selectConfigStep(index: number) { selectedGlobal.value = false; selected.value = index }
function selectGlobal() { selectedGlobal.value = true; configGroup.value = 'recognition'; selectedPopupRuleIndex.value = 0 }
function toggleGlobal(enabled: boolean) {
  if (!configDocument.value || busy.value || testing.value || uploading.value) return
  changeConfigDocument(toggleGlobalPopups(configDocument.value, enabled))
  if (enabled) selectGlobal()
  else { selectedGlobal.value = false; selectedPopupRuleIndex.value = 0 }
}
async function save() {
  if (busy.value || testing.value || uploading.value) return
  if (view.value === 'config') applyConfig()
  await saveDocument()
}
function selectPopupRule(index: number) { selectedPopupRuleIndex.value = index }
function travel(index: number) {
  if (busy.value || uploading.value || testing.value) return
  drafts.travel(index)
}
function auxiliaryCommand(command: string) {
  if (command === 'stop') { void quick.value?.stop(); logOpen.value = true }
  else if (command === 'undo') travel(historyCursor.value - 1)
  else if (command === 'redo') travel(historyCursor.value + 1)
  else if (command === 'history') historyOpen.value = true
  else if (command === 'parameters') openStepParameters()
  else if (command === 'verify') {
    logOpen.value = true; validationOpen.value = true
    void nextTick(() => checker.value?.check())
  }
}
const targets = useCursorPage<MaaScript, string>(
  cursor => fetchScripts(script.value!.application_id, cursor), s => s.script_id,
)
function restoreConfiguration(draft: EditorDraft) {
  if (!draft.configDocument) return
  configDocument.value = cloneJson(draft.configDocument)
  selectedGlobal.value = draft.configStep === -1 && globalPopupsEnabled(configDocument.value)
  const requested = draft.configStep === -1 ? selected.value : draft.configStep ?? selected.value
  selected.value = Math.max(0, Math.min(requested, configDocument.value.steps.length - 1))
  mediaView.value = 'live'
  view.value = 'config'
  emit('phoneDock', true)
  emit('phoneHidden', false)
}
async function recoverLocalDraft(serverDocument: ScriptDocument) {
  const draft = await drafts.read()
  const resume = readEditorResume()
  const resumeDraft = resume?.scriptId === props.scriptId && resume.restoreDraft === true
  if (draft) {
    const recovered = draft.history[draft.cursor]!
    let restore = true
    if (!sameDocument(recovered, serverDocument) && !resumeDraft) {
      try {
        await ElMessageBox.confirm('发现未保存草稿，是否恢复？恢复后需重新保存。', '恢复编辑', {
          confirmButtonText: '恢复', cancelButtonText: '舍弃', type: 'warning',
        })
      } catch {
        restore = false
        try { await drafts.discardOriginal() }
        catch { draftError.value = '未能清理旧草稿，原记录仍受保护' }
      }
    }
    if (restore) {
      drafts.restore(draft)
      if (!sameDocument(recovered, serverDocument)) {
        document.value = cloneJson(recovered)
        dirty.value = true
      }
      if (resumeDraft) restoreConfiguration(draft)
    }
  }
  if (resume?.scriptId === props.scriptId && resumeDraft)
    writeEditorResume({ ...resume, restoreDraft: false })
}
async function load() {
  drafts.beginLoad()
  busy.value = true
  error.value = ''
  try {
    const result = await openScript(props.scriptId)
    if (!props.device) throw new Error('请先选择手机')
    const bindings = await fetchApplicationDevices(result.script.application_id)
    if (!bindings.some(item => item.device_id === props.device?.device_id))
      throw new Error('当前手机未获此脚本分类授权，请在脚本库配置适用手机')
    script.value = result.script
    document.value = result.document
    drafts.initialize(result.document)
    selectedBranch.value = undefined
    selected.value = Math.max(0, Math.min((props.initialStep ?? 1) - 1, result.document.steps.length - 1))
    dirty.value = !result.script.current_version_id
    await recoverLocalDraft(result.document)
    await targets.load(true)
  } catch (e) { error.value = e instanceof Error ? e.message : '读取脚本失败' }
  finally { busy.value = false }
}
function change(value: WorkflowStep) {
  if (!document.value || busy.value || testing.value) return
  document.value.steps[selected.value] = value
  dirty.value = true
  saved.value = false
  checkpoint()
}
function changeStructure(value: ScriptDocument, index: number) {
  if (busy.value || testing.value) return
  document.value = value
  selected.value = index
  dirty.value = true
  saved.value = false
  checkpoint()
}
function changeStepStructure(value: ScriptDocument, index: number) {
  selectedBranch.value = undefined
  selectedGlobal.value = false
  changeStructure(value, index)
}
async function allowLeave(to: { path: string }) {
  if (busy.value || testing.value || uploading.value) return false
  if (to.path !== '/editor' && to.path !== '/login') {
    if (!await drafts.preserveBeforeLeave()) return false
    writeEditorResume({ scriptId: props.scriptId, deviceId: props.device?.device_id, step: selected.value + 1, restoreDraft: true })
    return true
  }
  if (!dirty.value && !configChanged.value) return true
  try { await ElMessageBox.confirm('尚有未保存修改，确定离开？', '保留编辑内容',
    { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' });
    await drafts.discardForLeave()
    return true }
  catch { return false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate((to, from) => to.query.script_id === from.query.script_id ? true : allowLeave(to))
watch(() => props.initialStep, value => {
  if (document.value) selected.value = Math.max(0, Math.min((value ?? 1) - 1, document.value.steps.length - 1))
})
onMounted(load)
</script>
<template>
  <section class="panel workflow-panel" aria-label="脚本步骤配置">
    <Teleport defer :to="identityTarget || 'body'" :disabled="!identityTarget">
      <div class="document-identity"><strong :title="script?.name ?? '读取脚本'">{{ script?.name ?? '读取脚本' }}</strong>
        <span :class="{ dirty }">{{ dirty ? '未保存' : saved ? '刚刚保存' : document ? '已保存' : '读取中' }}</span>
      </div>
    </Teleport>
    <Teleport defer :to="toolbarTarget || 'body'" :disabled="!toolbarTarget">
      <div class="document-tools">
        <ElButton :disabled="!document || !device || !dirty || configChanged || testing || uploading" :loading="busy" :title="configChanged ? '请先应用节点配置' : undefined" @click="save">保存</ElButton>
        <ElButton type="primary" :disabled="!quick?.canStart || quick?.busy" @click="logOpen = true; quick?.start()">调试运行</ElButton>
        <ElButton :type="logOpen ? 'primary' : 'default'" plain @click="logOpen = !logOpen">调试日志</ElButton>
        <ElDropdown trigger="click" @command="auxiliaryCommand"><ElButton aria-label="更多编辑操作">更多</ElButton>
          <template #dropdown><ElDropdownMenu>
            <ElDropdownItem command="undo" :disabled="historyCursor === 0 || busy || testing || uploading">撤销</ElDropdownItem>
            <ElDropdownItem command="redo" :disabled="historyCursor >= history.length - 1 || busy || testing || uploading">重做</ElDropdownItem>
            <ElDropdownItem command="history">编辑历史</ElDropdownItem>
            <ElDropdownItem command="parameters" :disabled="!document">截图与识别区域</ElDropdownItem>
            <ElDropdownItem command="verify" :disabled="!script?.current_version_id || dirty || busy || testing || uploading">验证</ElDropdownItem>
            <ElDropdownItem v-if="quick?.active" command="stop">停止调试</ElDropdownItem>
          </ElDropdownMenu></template>
        </ElDropdown>
      </div>
    </Teleport>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div v-if="draftError" class="draft-notice" role="status">
      <span>{{ draftError }}</span>
      <div v-if="draftProtected" class="draft-notice-actions">
        <ElButton text size="small" @click="historyOpen = true">查看历史</ElButton>
        <ElButton text size="small" type="warning" :disabled="busy || testing || uploading" @click="discardLocalDraft">舍弃旧草稿</ElButton>
      </div>
    </div>
    <ElButton v-if="!document && !busy" @click="load">重新加载</ElButton>
    <ElAlert v-if="saved" type="success" :closable="false"><template #title>已保存。 </template></ElAlert>
    <div v-if="document" class="workflow-layout">
      <div v-show="view === 'canvas'" class="canvas-view">
      <WorkflowCanvas ref="canvas" :steps="document.steps" :selected="selected" :script-id="scriptId" :version-id="imageVersion" :failed-step="failedStep" :active-step="activeStep" :completed-steps="matchingDebug ? debug.completed : []" :focus-step="matchingDebug ? debug.step : null" :side-panel-open="logOpen" :disabled="busy || testing || uploading" :active="view === 'canvas'"
        :footer-target="footerTarget"
        :can-debug="!!quick?.canStart && !quick?.busy" @select="selected = $event" @parameters="openStepParameters" @add="addNode" @edit="inlineEdit" @operation="nodeOperation" @link="link" />
        <aside v-show="logOpen" ref="canvasLogHost" class="canvas-debug-host" aria-label="画布调试面板" />
      </div>
      <div v-show="view === 'config'" class="config-view">
        <header class="config-heading">
          <ElButton text @click="cancelConfig">← 返回画布</ElButton><span class="config-divider" />
          <strong>{{ configTitle }}</strong><small>{{ selectedGlobal ? '弹窗处理' : configStep ? (actionNames[configStep.action] || configStep.action) : '' }}</small>
          <span class="config-heading-label">节点配置</span>
        </header>
        <div class="config-columns">
          <aside class="config-steps">
            <WorkflowOutline v-if="configDocument" :document="configDocument" :selected="selected" :selected-global="selectedGlobal"
              :disabled="busy || testing || uploading" @select="selectConfigStep" @select-global="selectGlobal"
              @toggle-global="toggleGlobal" @change="changeConfigStructure" />
          </aside>
          <main class="config-media"><div class="media-tabs" role="tablist" aria-label="手机画面模式">
            <button type="button" role="tab" :aria-selected="mediaView === 'live'" :class="{ active: mediaView === 'live' }" @click="setMedia('live')">手机实时画面</button>
            <button type="button" role="tab" :aria-selected="mediaView === 'screenshot'" :class="{ active: mediaView === 'screenshot' }"
              :disabled="captureBusy || busy || testing || uploading"
              @click="showScreenshotTab">{{ captureBusy ? '正在读取截图…' : '截图标注' }}</button>
           </div>
          <ElAlert v-if="captureError" :title="captureError" type="warning" :closable="false" />
          <div v-if="mediaView === 'screenshot'" class="media-scroll">
            <ScreenshotImportControls :disabled="captureBusy || busy || testing || uploading" :can-capture="!!screenshotUrl" :screenshot="activeScreenshot" :imported-name="importedName" @import="importImage" @capture="openScreenshot" />
            <StepImageBindings v-if="configDocument && activeScreenshot" :script-id="scriptId" :document="configDocument" :index="selected" :screenshot="activeScreenshot" :branch-index="activeRegion?.branchIndex"
              :rule-index="selectedGlobal ? selectedPopupRuleIndex : undefined" :mode="selectedGlobal ? 'popup' : configGroup"
              :controls-target="activeRegion?.target" :selected-use="activeRegion?.use" :selection-title="activeRegion?.title" :saved-rect="activeRegion ? selectedRect(activeRegion) : undefined" :show-controls="regionEditing"
              :disabled="busy || testing || captureBusy" @busy="uploading = $event" @change="changeConfigDocument" @complete="regionEditing = true" @editing="regionEditing = true" @preview="previews.remember" />
          </div>
          <div v-show="mediaView === 'live'" id="editor-config-live-host" class="media-live" aria-label="实时手机控制" />
          </main>
          <aside class="config-settings"><nav class="config-tabs" aria-label="参数分组">
            <template v-for="tab in ([['recognition','识别与执行'],['rules','独立规则']] as const)" :key="tab[0]">
              <button v-if="!selectedGlobal || tab[0] === 'recognition'" type="button" :class="{ active:!logOpen && configGroup === tab[0] }"
                @click="logOpen = false; configGroup = tab[0]">{{ tab[1] }}</button>
            </template>
          <button type="button" :class="{ active:logOpen }" @click="logOpen = true">调试日志</button>
          </nav><div v-show="logOpen" ref="configLogHost" class="config-debug-host" />
          <div v-show="!logOpen" class="config-form-scroll" :inert="busy || testing || uploading">
            <GlobalPopupRuleForm v-if="configDocument && selectedGlobal" :document="configDocument" :active-index="selectedPopupRuleIndex"
              @change="changeConfigDocument" @select="selectPopupRule" />
            <template v-else-if="configDocument && configStep">
              <div v-show="configGroup === 'recognition'" class="step-form">
                <StepWaitForm v-if="['wait', 'wait_random', 'wait_image'].includes(configStep.action)"
                  :step="configStep" @change="changeConfigStep" />
                <StepRecognizeExecuteForm v-else-if="configStep.action === 'recognize_execute'"
                  :step="configStep" @change="changeConfigStep" />
                <StepActionForm v-else :step="configStep" @change="changeConfigStep" />
                <StepSmartSwipeForm :step="configStep" @change="changeConfigStep" />
                <StepPointPicker v-if="configStep.action === 'tap'" />
                <StepCoordinatesForm :step="configStep" @change="changeConfigStep" />
                <StepImageBranches v-if="configStep.action === 'wait_click'" :document="configDocument"
                  :index="selected" :selected="selectedBranch" :disabled="busy || testing || uploading"
                  @select="selectedBranch = $event" @change="changeConfigDocument" />
                <ElButton v-if="picked" :disabled="!activeScreenshot" @click="applyPoint">确认写入拾取坐标（{{ picked.x }}, {{ picked.y }}）</ElButton><p v-if="picked && !activeScreenshot">请先获取当前方向的原始截图。</p></div>
              <div v-show="configGroup === 'rules'" class="step-form">
                <StepAssertionForm :step="configStep" @change="changeConfigStep" />
                <StepSkipForm :step="configStep" :index="selected" :count="configDocument.steps.length"
                  @change="changeConfigStep" />
                <StepRecoveryForm :step="configStep" :scripts="targets.items.value"
                  :script-id="scriptId" @change="changeConfigStep" />
                <p v-if="targets.error.value">恢复脚本列表加载失败：{{ targets.error.value.message }}</p>
                <ElButton v-if="targets.nextCursor.value || targets.error.value" :loading="targets.loading.value"
                  @click="targets.load()">加载更多恢复脚本</ElButton>
              </div>
            </template>
          </div>
          <footer v-show="!logOpen" class="config-actions">
            <small>{{ configChanged ? '选区已同步，保存后写入脚本' : '当前配置未修改' }}</small>
            <ElButton @click="cancelConfig">取消</ElButton>
            <ElButton type="primary" :disabled="busy || testing || uploading" @click="save">保存</ElButton>
          </footer>
          </aside>
        </div>
      </div>
      <EditorHistoryDrawer v-model="historyOpen" :entries="historyView.entries.value"
        :selected-id="historyView.selectedId.value" :loading="historyView.loading.value" :error="historyView.error.value"
        :more="historyView.more.value" :restoring-disabled="busy || testing || uploading || configChanged || !historyView.difference.value?.changed"
        @select="historyView.select" @more="historyView.load(false)" @retry="historyView.load()" @restore="restoreSelectedHistory">
        <template #summary><div v-if="historyView.difference.value" class="history-difference">
          <strong>与当前内容相比：{{ historyView.difference.value.summary }}</strong>
          <ul><li v-for="line in historyView.difference.value.lines" :key="line">{{ line }}</li></ul>
          <small v-if="historyView.difference.value.more">还有 {{ historyView.difference.value.more }} 项变化，可在下方预览查看。</small>
        </div></template>
        <template #preview><HistoryDocumentPreview v-if="historyView.selectedDocument.value"
          :key="historyView.selectedId.value + ':' + (historyView.selectedVersion.value ?? '')"
          :document="historyView.selectedDocument.value" :script-id="scriptId"
          :version-id="historyView.selectedVersion.value ?? imageVersion"
          :use-editor-cache="!historyView.selectedId.value.startsWith('saved:') && (!historyView.selectedVersion.value || historyView.selectedVersion.value === imageVersion)" /></template>
      </EditorHistoryDrawer>
    </div>
    <Teleport defer :to="logHost || 'body'" :disabled="!logHost">
    <section v-show="logOpen" class="runtime-log" aria-label="调试日志面板">
      <header class="debug-heading"><strong>调试与日志</strong><ElButton text aria-label="收起调试日志" @click="logOpen = false">收起</ElButton></header>
      <div class="debug-progress" :class="debug.phase" role="status" aria-live="polite">
        <strong>{{ debugLabel }}</strong><span v-if="debugStepTitle">{{ debugStepTitle }}</span>
        <small v-if="failedStep">已停在失败步骤，可修改参数后重新调试。</small>
        <ElButton v-if="matchingDebug && debug.step && !debug.ruleName" size="small" @click="locateDebug(debug.step)">定位当前步骤</ElButton>
      </div>
      <div class="debug-scroll">
        <ScriptQuickTest v-if="script" ref="quick" compact :script="script" :device="device" :step-number="selected + 1" :disabled="dirty || configChanged || busy || uploading"
          @busy="testing = $event" @locate="locateDebug" @progress="debug = $event" />
        <ElButton :disabled="selectedGlobal || !quick?.canStart || quick?.busy" @click="quick?.start(selected + 1)">调试当前步骤</ElButton>
        <details v-show="validationOpen" class="debug-validation" open><summary>脚本验证结果</summary>
          <ScriptStaticCheck v-if="script" ref="checker" compact :key="script.current_version_id ?? script.script_id" :script="script"
            :disabled="dirty || configChanged || busy || testing || uploading" @busy="busy = $event" />
        </details>
      </div>
    </section>
    </Teleport>
  </section>
</template>
<style scoped>
.workflow-panel { padding:0; min-width:0; display:flex; flex-direction:column; height:100%; }
.workflow-panel { border:0; border-radius:0; box-shadow:none; background:transparent; }
.draft-notice { display:flex; align-items:center; gap:12px; padding:9px 16px; background:var(--el-color-warning-light-9); color:var(--el-color-warning); font-size:12px; }
.draft-notice > span { flex:1; min-width:0; }.draft-notice-actions { display:flex; flex:none; gap:6px; }
.history-difference { font-size:12px; line-height:1.6; }.history-difference ul { margin:8px 0; padding-left:20px; }.history-difference small { color:var(--muted); }
@media (max-width:680px) { .draft-notice { flex-wrap:wrap; }.draft-notice-actions { margin-left:auto; } }
.document-identity { display:flex; align-items:center; gap:12px; min-width:0; }
.document-identity strong { display:block; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
.document-identity span { flex:none; color:var(--muted); font-size:12px; }
.document-identity span.dirty { color:var(--el-color-warning); }
.document-identity span::before { content:''; display:inline-block; width:8px; height:8px; margin-right:8px; border-radius:50%; background:currentColor; }
.document-tools { display:flex; gap:8px; align-items:center; flex:none; }
.document-tools :deep(.el-button + .el-button) { margin-left:0; }
.workflow-layout { flex:1; min-height:0; position:relative; }
.canvas-view { position:relative; height:100%; min-height:0; }
.canvas-debug-host { position:absolute; top:0; right:0; bottom:0; width:min(360px,100%); z-index:20; border-left:1px solid var(--border); background:var(--surface); box-shadow:-4px 0 16px #12345612; }
.config-debug-host { flex:1; min-height:0; overflow:hidden; }
.config-view { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--surface); }
.config-heading { display:flex; align-items:center; gap:18px; min-height:62px; flex:none; padding:0 22px; border-bottom:1px solid var(--border); background:var(--surface-soft); }
.config-heading strong { color:var(--text); font-size:17px; }.config-heading small { color:var(--muted); font-size:13px; }
.config-heading-label { margin-left:auto; color:var(--muted); font-size:13px; }.config-divider { height:24px; border-left:1px solid var(--border); }
.config-columns { display:grid; grid-template-columns:minmax(270px,300px) minmax(310px,1fr) minmax(360px,440px); flex:1; min-height:0; }
.config-steps,.config-media,.config-settings { min-height:0; min-width:0; }
.config-steps { overflow-y:auto; padding:20px 16px; border-right:1px solid var(--border); background:var(--surface); }
.config-media { display:flex; flex-direction:column; border-right:1px solid var(--border); background:var(--surface-soft); }
.media-tabs,.config-tabs { display:flex; flex:none; gap:4px; padding:8px 12px 0; border-bottom:1px solid var(--border); background:var(--surface); overflow-x:auto; }
.media-tabs button,.config-tabs button { flex:none; border:0; border-bottom:2px solid transparent; background:none; color:var(--text); padding:10px 12px; cursor:pointer; white-space:nowrap; }
.media-tabs button.active,.config-tabs button.active { color:var(--accent); border-color:var(--accent); font-weight:600; }
.media-scroll { flex:1; min-height:0; overflow:auto; padding:14px 18px 24px; display:flex; flex-direction:column; gap:12px; }
 .media-live { display:flex; flex:1; min-height:0; min-width:0; overflow:hidden; padding:12px; box-sizing:border-box; contain:layout paint; }
.config-settings { display:flex; flex-direction:column; }.config-tabs { padding-inline:12px; }
.config-form-scroll { flex:1; min-height:0; overflow-y:auto; padding:16px; background:var(--surface-soft); }
.config-form-scroll :deep(.step-form > section) { padding:16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }.config-form-scroll :deep(p:not(.scope-warning)) { color:var(--muted); font-size:12px; line-height:1.5; }
.config-form-scroll :deep(label) { font-size:13px; font-weight:600; color:var(--text); }
.config-form-scroll :deep(.el-input-number),.config-form-scroll :deep(.el-select) { max-width:100%; }
.config-actions { display:flex; align-items:center; gap:8px; padding:12px 18px; border-top:1px solid var(--border); flex:none; }.config-actions small { margin-right:auto; color:var(--muted); }
@media (max-width:1100px) { .config-columns { grid-template-columns:230px minmax(280px,1fr) minmax(320px,1fr); } }
@media (max-width:850px) {
  .config-heading { gap:10px; padding:0 12px; overflow-x:auto; white-space:nowrap; }
  .config-heading-label { display:none; }
  .config-columns { display:block; overflow-y:auto; overflow-x:hidden; }
  .config-steps { max-height:240px; border-right:0; border-bottom:1px solid var(--border); }
  .config-media { height:min(65dvh,580px); min-height:360px; border-right:0; border-bottom:1px solid var(--border); }
  .config-settings { min-height:500px; overflow:visible; }
  .config-form-scroll { min-height:360px; overflow:visible; }
  .config-actions { position:sticky; bottom:0; z-index:1; background:var(--surface); }
}
.step-form { display:flex; flex-direction:column; gap:14px; min-width:0; }
 .runtime-log { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--surface); }
.debug-heading { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--border); }
.debug-progress { display:grid; gap:5px; padding:12px; margin:12px; border-radius:8px; background:var(--surface-soft); font-size:13px; }
.debug-progress.failed { background:var(--el-color-danger-light-9); color:var(--el-color-danger); }
.debug-progress.running { color:var(--accent); background:var(--accent-soft); }
.debug-progress .el-button { justify-self:start; margin:3px 0 0; }
.debug-scroll { flex:1; min-height:0; overflow:auto; padding:0 12px 14px; }
.debug-scroll > .el-button { margin-top:10px; }
.debug-validation { margin-top:16px; border-top:1px solid var(--border); padding-top:10px; }
.debug-validation summary { cursor:pointer; font-size:13px; }
</style>
<style scoped src="./editor-compact.css"></style>
