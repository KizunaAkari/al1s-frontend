<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElCheckbox, ElDialog, ElDrawer, ElMessageBox, ElPopover } from 'element-plus'
import HelpHint from '../../../shared/ui/HelpHint.vue'
import { navigateBotTabs } from '../bot-console-model'
import AiDrawingPresetEditor from './AiDrawingPresetEditor.vue'
import AiDrawingOnlinePresetEditor from './AiDrawingOnlinePresetEditor.vue'
import {
  cancelDrawingTask, checkDrawingPreset, fetchDrawingGroups, fetchDrawingPresets, fetchDrawingResources,
  fetchDrawingSettings, fetchDrawingTasks, fetchDrawingTask, fetchDrawingTaskImage, fetchDrawingPromptModels,
  saveDrawingPromptModel, activateDrawingPromptModel, deleteDrawingPromptModel, testDrawingPromptModel, deleteDrawingTasks,
  previewDrawingPreset, releaseDrawingResources, retryDrawingSend, saveDrawingGroup, saveDrawingSettings,
  type DrawingGroup, type DrawingGroupWrite, type DrawingPreset, type DrawingResources, type DrawingSettings, type DrawingSettingsWrite,
  type DrawingTask, type GroupMode, type DrawingPromptModel, type DrawingPromptWrite, type DrawingPromptCatalog,
} from '../../../shared/api/bot-drawing'

const props = defineProps<{ serviceId: string; active: boolean }>()
type Section = 'general' | 'workflows' | 'groups' | 'tasks'
const section = ref<Section>('general')
const view = ref<DrawingSettings | null>(null), draft = ref<DrawingSettingsWrite | null>(null)
const groupsText = ref('')
const groupEntry = ref(''), groupAdding = ref(false), groupBulk = ref(false)
const promptDraft = ref<DrawingPromptWrite>({ name: '', adapter_kind: 'openai_chat_completion', model_id: '', base_url: '',
  network_mode: 'direct', voice: '', secret_input: null, clear_secret: false })
const promptConfigured = ref(false)
const promptCatalog = ref<DrawingPromptCatalog>({ items: [], active_id: null, selection_version: 0 })
const promptDialogOpen = ref(false), selectedPromptId = ref<string | null>(null)
const promptDialog = ref<HTMLElement | null>(null), promptButton = ref<HTMLButtonElement | null>(null)
const promptBusy = ref(false), promptError = ref(''), promptNotice = ref('')
const presets = ref<DrawingPreset[]>([]), groups = ref<DrawingGroup[]>([]), groupDraft = ref<Record<string, DrawingGroupWrite>>({})
const selectedGroup = ref('')
const resources = ref<DrawingResources | null>(null), tasks = ref<DrawingTask[]>([]), history = ref<DrawingTask[]>([])
const activeTasksKnown = ref(false)
const historyCursor = ref<string | null>(null), historyExpanded = ref(false), selectedTasks = ref<string[]>([])
const cleanupOpen = ref(false)
const taskDetail = ref<DrawingTask | null>(null)
const taskDetailOpen = ref(false), taskDetailLoading = ref(false), taskDetailError = ref('')
const taskDetailImageUrl = ref<string | null>(null), taskDetailImageLoading = ref(false), taskDetailImageError = ref('')
const openFlow = ref<string | null>(null)
let focusedFlow: string | null = null, pinnedFlow: string | null = null, flowTimer: ReturnType<typeof setTimeout> | null = null
const busy = ref(false), error = ref(''), notice = ref(''), resourceError = ref(''), tasksError = ref('')
const editorOpen = ref(false), editingId = ref<string | null>(null), editorDirty = ref(false)
const editorEngine = ref<'comfy' | 'openai'>('comfy')
const previewId = ref<string | null>(null), previewText = ref(''), previewMode = ref<GroupMode>('green')
const previewFile = ref<File | null>(null)
let generation = 0, detailRequest = 0, baseline = '', promptBaseline = '', timer: ReturnType<typeof setInterval> | null = null
let pending: { fingerprint: string; operation: string } | null = null
let pendingPreview: { fingerprint: string; file: File | null; operation: string } | null = null
let promptPending: { fingerprint: string; operation: string } | null = null
let promptActionPending: { fingerprint: string; operation: string } | null = null
const groupPending = new Map<string, { fingerprint: string; operation: string }>()
const checkPending = new Map<string, { version: number; operation: string }>()
const taskPending = new Map<string, string>()
const fingerprint = () => JSON.stringify({ draft: draft.value, groups: groupsText.value })
const promptFingerprint = () => JSON.stringify(promptDraft.value)
const groupValue = (group: DrawingGroup): DrawingGroupWrite => ({ mode: group.mode,
  restrict_workflows: group.restrict_workflows ?? false, allowed_preset_ids: [...(group.allowed_preset_ids ?? [])] })
const groupFingerprint = (value: DrawingGroupWrite) => JSON.stringify({ ...value, allowed_preset_ids: [...value.allowed_preset_ids].sort() })
const groupDirty = (group: DrawingGroup) => Boolean(groupDraft.value[group.group_id]
  && groupFingerprint(groupDraft.value[group.group_id]!) !== groupFingerprint(groupValue(group)))
const hasUnsaved = computed(() => Boolean(draft.value && fingerprint() !== baseline) || Boolean(groupEntry.value.trim()) || (promptDialogOpen.value && promptFingerprint() !== promptBaseline) || editorDirty.value
  || groups.value.some(groupDirty))
const currentGroup = computed(() => groups.value.find(group => group.group_id === selectedGroup.value))
const draftGroups = computed(() => [...new Set(groupsText.value.split(/\s+/).filter(Boolean))])
const currentGroupDraft = computed(() => groupDraft.value[selectedGroup.value])
const savedEnabled = computed(() => view.value?.enabled ?? false)
const textPresets = computed(() => presets.value.filter(item => item.kind === 'txt2img'))
const editPresets = computed(() => presets.value.filter(item => item.kind === 'image_edit'))
const onlinePresets = computed(() => presets.value.filter(item => item.engine === 'openai'))
const selectedPreview = computed(() => presets.value.find(item => item.id === previewId.value))
const currentPrompt = computed(() => promptCatalog.value.items.find(item => item.id === promptCatalog.value.active_id))
const selectedPrompt = computed(() => promptCatalog.value.items.find(item => item.id === selectedPromptId.value))
const sortedTasks = computed(() => {
  const ids = new Set(tasks.value.map(item => item.id))
  return [...tasks.value, ...history.value.filter(item => !ids.has(item.id) && isActiveTask(item))]
    .sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999))
})
const activeTaskIds = computed(() => new Set(sortedTasks.value.map(item => item.id)))
const displayedTasks = computed(() => [...sortedTasks.value, ...history.value.filter(item => !activeTaskIds.value.has(item.id))])
const cleanupCandidates = computed(() => activeTasksKnown.value ? history.value.filter(item => !activeTaskIds.value.has(item.id) && canDelete(item)) : [])
const mediaText = computed(() => resources.value?.media_used_bytes == null || !resources.value.media_limit_bytes ? '容量暂不可用'
  : `已用 ${(resources.value.media_used_bytes / 1024 ** 2).toFixed(1)} MiB / ${(resources.value.media_limit_bytes / 1024 ** 2).toFixed(0)} MiB`)
const syncText = computed(() => !view.value ? '尚未读取' : view.value.row_version === 0 ? '尚未配置'
  : view.value.applied_version === view.value.row_version ? '配置已同步' : '已保存，等待同步')
const resourceText = computed(() => {
  const value = resources.value
  if (!value) return '本地资源状态暂不可用'
  if (value.state === 'unavailable') return '本地 ComfyUI 未连接'
  if (value.state === 'unconfigured') return '本地共享资源服务未配置'
  if (value.gpu_busy ?? (value.active ?? 0) > 0) return '正在处理图片任务'
  if (value.release_status === 'deferred') return '回收等待中，正在保护其他任务'
  if (value.release_status === 'failed') return '资源回收失败，请检查服务状态'
  if ((value.drawing_resources ?? 0) === 0) return '服务已连接，当前未保留生图模型'
  if (value.effective_resident) return '生图模型保留中'
  if (value.idle_seconds_remaining != null) return `空闲保留中，${Math.ceil(value.idle_seconds_remaining)} 秒后尝试释放`
  return '生图资源状态待核对'
})
const validationLabels: Record<string, string> = { unchecked: '待检查', missing: '依赖不可用', needs_preview: '待试运行', ready: '已验证' }
const taskLabels: Record<string, string> = { queued: '排队中', submitting: '提交中', running: '生成中',
  succeeded: '已完成', failed: '失败', expired: '已过期', cancelled: '已取消', cancelling: '取消中', reconciling: '状态待核对' }
const taskErrors: Record<string, string> = {
  drawing_negative_unsupported: '绿色模式需要工作流配置负面提示词入口。',
  drawing_mode_changed_retry: '群已切换为绿色模式，请重新发送绘图请求。',
  drawing_audit_unknown: '审核无法确认，图片未发送或展示。',
  drawing_audit_blocked: '图片未通过绿色模式审核。',
  drawing_input_blocked: '参考图未通过绿色模式审核。',
  drawing_prompt_model_unconfigured: '请先在通用设置中选择许愿提示词模型。',
  drawing_llm_timeout: '许愿提示词模型响应超时。',
  drawing_llm_provider_error: '许愿提示词模型请求失败，请检查配置或网络。',
  drawing_wish_invalid: '整理绘图描述失败。',
  drawing_media_full: '绘图存储空间已满，请删除历史任务后重试。',
  drawing_online_rejected: '服务商拒绝了请求，具体原因未记录。',
  drawing_online_moderation_blocked: '服务商内容审核未通过，请调整描述后重试。',
  drawing_online_auth_failed: 'API 认证失败，请检查线上预设的密钥和访问限制。',
  drawing_online_quota_exceeded: '服务商额度或预算不足，请检查 API 账单和项目限额。',
  drawing_online_rate_limited: '服务商请求频率超限，请稍后重试。',
  drawing_online_model_unavailable: '线上模型不可用，请检查模型名称、接口地址和项目权限。',
  drawing_online_access_denied: '服务商拒绝访问，请检查模型权限和地区限制。',
  drawing_online_org_verification: '服务商要求完成组织验证，请检查 OpenAI 组织设置。',
  drawing_online_unknown: '请求结果未知，系统不会自动重试。',
  drawing_online_output_invalid: '服务商返回的图片无法使用。',
  drawing_video_unavailable: '视频生成暂未接入；可以请求 GIF 动图。',
  drawing_online_unconfigured: '线上模型尚未配置密钥。',
  drawing_online_proxy_unavailable: '线上模型使用的代理不可用。',
}
function taskError(code: string | null): string {
  if (!code) return ''
  if (taskErrors[code]) return taskErrors[code]
  const status = /^drawing_online_http_([1-5]\d{2})$/.exec(code)?.[1]
  if (status === '400') return '服务商返回 HTTP 400，请检查请求内容及模型配置。'
  if (status === '402') return '服务商返回 HTTP 402，请检查账单和付款状态。'
  if (status === '429') return '服务商返回 HTTP 429，请检查额度或请求频率。'
  return status ? `服务商返回 HTTP ${status}，请检查请求或服务状态。` : ''
}
const moderationStages: Record<string, string> = { input: '请求输入', output: '生成结果', unknown: '未知' }
const moderationCategories: Record<string, string> = { harassment: '骚扰', 'harassment/threatening': '威胁骚扰',
  hate: '仇恨', 'hate/threatening': '仇恨威胁', illicit: '非法内容', 'illicit/violent': '暴力违法内容',
  'self-harm': '自伤', 'self-harm/intent': '自伤意图', 'self-harm/instructions': '自伤指导', sexual: '性内容',
  'sexual/minors': '未成年人性内容', violence: '暴力', 'violence/graphic': '血腥暴力', other: '其他',
  unrecognized: '未识别类别' }
const moderationStage = (item: DrawingTask) => moderationStages[item.online_moderation_details?.stage ?? ''] ?? '未提供或未记录'
const moderationReasons = (item: DrawingTask) => item.online_moderation_details?.categories
  .map(category => moderationCategories[category] ?? '未识别类别').join('、') || '未提供或未记录'
const onlineRequestLabels: Record<string, string> = { not_started: '尚未提交', submitting: '正在提交，接收状态待确认',
  sent: '请求已发送，等待图片', received: '已收到图片', unknown: '请求状态未知', failed: '请求失败' }
const onlineRequestText = (item: DrawingTask) => {
  if (item.online_image_received) return '请求已发送 · 已收到图片'
  if (item.online_request_sent) return `请求已发送 · 未收到图片${item.online_request_state === 'unknown' ? '（结果未知）' : ''}`
  return `${onlineRequestLabels[item.online_request_state ?? ''] ?? '请求状态未知'} · 未收到图片`
}
const auditLabels: Record<string, string> = { pending: '待审核', allow: '通过', block: '未通过', unknown: '无法确认', not_required: '未启用' }
const auditText = (item: DrawingTask) => {
  const status = item.operation === 'tag' ? item.input_audit_status ?? item.audit_status : item.audit_status
  return status === 'pending' && ['failed', 'cancelled', 'expired'].includes(item.generation_status)
    ? '未进行' : auditLabels[status] || status
}
const stageLabels: Record<string, string> = { queued: '排队中', prompting: '整理许愿提示词', preparing_resources: '准备资源',
  input_audit: '审核参考图', submitting: '提交工作流', waiting_native: '等待 ComfyUI', executing: '执行工作流',
  output_audit: '审核生成图片', sending: '发送结果', cleaning: '清理任务资源', cancelling: '正在结束',
  preparing_online: '准备线上生成', online_submitting: '提交线上请求', online_waiting: '等待线上生成', online_received: '已收到图片',
  waiting_audit_stop: '等待审核结束', reconciling: '核对原生状态', delivery_unknown: '发送结果待核对', finished: '已结束', deleting: '清理历史文件' }
defineExpose({ hasUnsaved, savedEnabled })

function applySettings(value: DrawingSettings) {
  view.value = value
  draft.value = { enabled: value.enabled, keep_drawing_warm: false,
    default_text_preset_id: value.default_text_preset_id, default_edit_preset_id: value.default_edit_preset_id,
    default_online_preset_id: value.default_online_preset_id ?? null,
    allow_private: value.allow_private ?? false, event_ws_url: value.event_ws_url ?? '',
    comfy_base_url: value.comfy_base_url ?? 'http://host.docker.internal:8188', groups: value.groups ?? [] }
  groupsText.value = (value.groups ?? []).join('\n')
  baseline = fingerprint()
}
function applyPrompt(value: DrawingPromptModel | null) {
  selectedPromptId.value = value?.id ?? null
  promptDraft.value = { name: value?.name ?? '', adapter_kind: value?.adapter_kind ?? 'openai_chat_completion', model_id: value?.model_id ?? '',
    base_url: value?.base_url ?? '', network_mode: value?.network_mode ?? 'direct', voice: '', secret_input: null, clear_secret: false }
  promptConfigured.value = value?.secret_configured ?? false
  promptBaseline = promptFingerprint()
}
function selectPrompt(value: DrawingPromptModel | null) {
  if (promptFingerprint() !== promptBaseline && !window.confirm('当前模型有未保存的修改，是否放弃？')) return
  promptError.value = ''; promptNotice.value = ''; promptPending = null
  applyPrompt(value)
}
function openPromptDialog() {
  promptDialogOpen.value = true; promptError.value = ''; promptNotice.value = ''
  applyPrompt(currentPrompt.value ?? promptCatalog.value.items[0] ?? null)
  setTimeout(() => promptDialog.value?.focus(), 0)
}
function closePromptDialog() {
  if (promptBusy.value) return
  if (promptFingerprint() !== promptBaseline && !window.confirm('当前模型有未保存的修改，是否放弃？')) return
  promptDialogOpen.value = false
  setTimeout(() => promptButton.value?.focus(), 0)
}
function promptDialogKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); closePromptDialog(); return }
  if (event.key !== 'Tab' || !promptDialog.value) return
  const items = [...promptDialog.value.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')]
  if (!items.length) { event.preventDefault(); return }
  const first = items[0]!, last = items[items.length - 1]!
  if (event.shiftKey && (document.activeElement === first || document.activeElement === promptDialog.value)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
async function load() {
  const current = ++generation, id = props.serviceId
  view.value = null; draft.value = null; presets.value = []; groups.value = []; groupDraft.value = {}; selectedGroup.value = ''
  resources.value = null; tasks.value = []; history.value = []; activeTasksKnown.value = false; historyCursor.value = null; historyExpanded.value = false; selectedTasks.value = []; cleanupOpen.value = false
  promptDialogOpen.value = false; closeTaskDetails(); pending = null; pendingPreview = null; promptActionPending = null
  groupEntry.value = ''; groupAdding.value = false; groupBulk.value = false
  promptCatalog.value = { items: [], active_id: null, selection_version: 0 }; promptPending = null; promptBusy.value = false
  promptError.value = ''; promptNotice.value = ''; applyPrompt(null)
  groupPending.clear(); checkPending.clear(); taskPending.clear()
  editorOpen.value = false; editorDirty.value = false; previewId.value = null
  error.value = ''; notice.value = ''; resourceError.value = ''; tasksError.value = ''; busy.value = true
  const results = await Promise.allSettled([fetchDrawingSettings(id), fetchDrawingPresets(id), fetchDrawingGroups(id),
    fetchDrawingResources(id), fetchDrawingTasks(id, 'active'), fetchDrawingTasks(id, 'history'), fetchDrawingPromptModels(id)])
  if (current !== generation) return
  const [settingsResult, presetResult, groupResult, resourceResult, taskResult, historyResult, promptResult] = results
  if (settingsResult.status === 'fulfilled') applySettings(settingsResult.value)
  else error.value = '读取绘图配置失败，请检查 QQ 后台。'
  if (presetResult.status === 'fulfilled') presets.value = presetResult.value
  else error.value ||= '读取工作流列表失败。'
  if (groupResult.status === 'fulfilled') {
    groups.value = groupResult.value
    groupDraft.value = Object.fromEntries(groupResult.value.map(group => [group.group_id, groupValue(group)]))
    selectedGroup.value = groupResult.value[0]?.group_id ?? ''
  } else error.value ||= '读取授权群失败。'
  if (resourceResult.status === 'fulfilled') resources.value = resourceResult.value
  else resourceError.value = '无法读取共享资源状态。'
  if (taskResult.status === 'fulfilled') { tasks.value = taskResult.value.items; activeTasksKnown.value = true }
  else tasksError.value = '无法读取绘图任务。'
  if (historyResult.status === 'fulfilled') { history.value = historyResult.value.items; historyCursor.value = historyResult.value.next_after_id }
  else tasksError.value ||= '无法读取绘图历史。'
  if (promptResult.status === 'fulfilled') { promptCatalog.value = promptResult.value; applyPrompt(null) }
  else error.value ||= '读取绘图提示词模型失败。'
  busy.value = false
}
async function refreshRuntime() {
  if (!props.active || !view.value) return
  const id = props.serviceId, current = generation
  const [resourceResult, taskResult, historyResult, settingsResult] = await Promise.allSettled([
    fetchDrawingResources(id), fetchDrawingTasks(id, 'active'), fetchDrawingTasks(id, 'history'), fetchDrawingSettings(id)])
  if (current !== generation) return
  if (resourceResult.status === 'fulfilled') { resources.value = resourceResult.value; resourceError.value = '' }
  else resourceError.value = '无法读取共享资源状态。'
  if (taskResult.status === 'fulfilled') { tasks.value = taskResult.value.items; activeTasksKnown.value = true; tasksError.value = '' }
  else { activeTasksKnown.value = false; tasksError.value = '无法读取绘图任务。' }
  if (historyResult.status === 'fulfilled') {
    const fresh = historyResult.value.items, ids = new Set(fresh.map(item => item.id))
    history.value = historyExpanded.value ? [...fresh, ...history.value.filter(item => !ids.has(item.id))] : fresh
    if (!historyExpanded.value) historyCursor.value = historyResult.value.next_after_id
  } else tasksError.value ||= '无法读取绘图历史。'
  if (settingsResult.status === 'fulfilled' && view.value?.row_version === settingsResult.value.row_version)
    view.value = { ...view.value, applied_version: settingsResult.value.applied_version }
}
watch(() => props.serviceId, () => { void load() }, { immediate: true })
watch(() => props.active, async active => {
  if (!active || !view.value || groups.value.some(groupDirty)) return
  const current = generation
  try {
    const fresh = await fetchDrawingGroups(props.serviceId)
    if (current !== generation || !props.active || groups.value.some(groupDirty)) return
    groups.value = fresh
    groupDraft.value = Object.fromEntries(fresh.map(group => [group.group_id, groupValue(group)]))
    if (!fresh.some(group => group.group_id === selectedGroup.value)) selectedGroup.value = fresh[0]?.group_id ?? ''
  } catch { if (current === generation) error.value = '刷新授权群失败，请稍后重试。' }
})
onMounted(() => { timer = setInterval(() => { void refreshRuntime() }, 5000) })
onBeforeUnmount(() => { generation++; closeTaskDetails(); if (timer) clearInterval(timer); if (flowTimer) clearTimeout(flowTimer) })

async function saveSettings() {
  if (!view.value || !draft.value || busy.value) return
  if (groupEntry.value.trim()) { error.value = '请先添加或清空待输入的群号。'; return }
  const selectedGroups = groupsText.value.split(/\s+/).filter(Boolean)
  if (selectedGroups.length > 100 || selectedGroups.some(group => !/^[1-9][0-9]{0,19}$/.test(group)) || new Set(selectedGroups).size !== selectedGroups.length) {
    error.value = '请输入有效且不重复的群号，每行一个，最多 100 个。'; return
  }
  const id = props.serviceId, current = generation, value = { ...draft.value, groups: selectedGroups }, version = view.value.row_version
  const mark = JSON.stringify({ value, version })
  if (!pending || pending.fingerprint !== mark) pending = { fingerprint: mark, operation: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await saveDrawingSettings(id, value, version, pending.operation)
    const updated = await fetchDrawingSettings(id)
    const updatedGroups = await fetchDrawingGroups(id)
    if (current === generation) {
      const previousDrafts = groupDraft.value
      groups.value = updatedGroups
      groupDraft.value = Object.fromEntries(updatedGroups.map(group => [group.group_id, previousDrafts[group.group_id] ?? groupValue(group)]))
      if (!updatedGroups.some(group => group.group_id === selectedGroup.value)) selectedGroup.value = updatedGroups[0]?.group_id ?? ''
      applySettings(updated); pending = null; notice.value = '配置已保存，资源策略正在同步。'
    }
  } catch { if (current === generation) error.value = '保存失败，请检查连接或刷新后重试。' }
  finally { if (current === generation) busy.value = false }
}
function addDrawingGroup() {
  const value = groupEntry.value.trim()
  if (!/^[1-9][0-9]{0,19}$/.test(value)) { error.value = '请输入有效的 QQ 群号。'; return }
  if (!draftGroups.value.includes(value)) groupsText.value = [...draftGroups.value, value].join('\n')
  groupEntry.value = ''; groupAdding.value = false; error.value = ''
}
function removeDrawingGroup(value: string) { groupsText.value = draftGroups.value.filter(group => group !== value).join('\n') }
function configureDrawingGroup(value: string) {
  if (!groups.value.some(group => group.group_id === value)) { error.value = '请先保存新授权的群号。'; return }
  openGroup(value)
}
async function savePrompt() {
  if (!view.value || promptBusy.value) return
  if (!view.value.row_version) { promptError.value = '请先保存绘图通用设置。'; return }
  if (!promptDraft.value.name.trim() || !promptDraft.value.model_id.trim()) { promptError.value = '请填写模型名称和模型 ID。'; return }
  const id = props.serviceId, current = generation, version = selectedPrompt.value?.row_version ?? 0
  const value = { ...promptDraft.value, name: promptDraft.value.name.trim(), model_id: promptDraft.value.model_id.trim(), base_url: promptDraft.value.base_url.trim(),
    secret_input: promptDraft.value.secret_input || null }
  const mark = JSON.stringify({ value, version, profile: selectedPromptId.value })
  if (!promptPending || promptPending.fingerprint !== mark) promptPending = { fingerprint: mark, operation: crypto.randomUUID() }
  promptBusy.value = true; promptError.value = ''; promptNotice.value = ''
  try {
    const saved = await saveDrawingPromptModel(id, selectedPromptId.value, value, version, promptPending.operation)
    const catalog = await fetchDrawingPromptModels(id)
    if (current === generation) {
      promptCatalog.value = catalog; applyPrompt(saved); promptPending = null; promptNotice.value = '模型已保存。'
    }
  } catch { if (current === generation) promptError.value = '模型保存失败，请检查配置或刷新后重试。' }
  finally { if (current === generation) promptBusy.value = false }
}
async function promptAction(action: 'activate' | 'delete' | 'test') {
  const item = selectedPrompt.value
  if (!item || promptBusy.value) return
  if (action === 'delete' && !window.confirm(`删除模型“${item.name}”？正在处理的任务会继续使用原配置。`)) return
  const id = props.serviceId, current = generation
  const mark = JSON.stringify({ action, profile: item.id, version: action === 'activate' ? promptCatalog.value.selection_version : item.row_version })
  if (!promptActionPending || promptActionPending.fingerprint !== mark) promptActionPending = { fingerprint: mark, operation: crypto.randomUUID() }
  promptBusy.value = true; promptError.value = ''; promptNotice.value = ''
  try {
    if (action === 'activate') await activateDrawingPromptModel(id, item.id, promptCatalog.value.selection_version, promptActionPending.operation)
    else if (action === 'delete') await deleteDrawingPromptModel(id, item.id, item.row_version, promptActionPending.operation)
    else { const result = await testDrawingPromptModel(id, item.id); if (current === generation) {
      if (result.state === 'success') promptNotice.value = result.message
      else promptError.value = result.message
    } }
    if (current !== generation) return
    if (action !== 'test') {
      const catalog = await fetchDrawingPromptModels(id)
      if (current !== generation) return
      promptCatalog.value = catalog
      if (action === 'delete') applyPrompt(promptCatalog.value.items[0] ?? null)
      promptNotice.value = action === 'activate' ? '已切换生效模型，等待中的任务开始时使用新模型。' : '模型已删除。'
    }
    promptActionPending = null
  } catch { if (current === generation) promptError.value = '操作失败，请检查配置、网络或刷新后重试。' }
  finally { if (current === generation) promptBusy.value = false }
}
async function saveGroup(group: DrawingGroup) {
  const value = groupDraft.value[group.group_id]
  if (!value || !groupDirty(group) || busy.value) return
  const payload = { ...value, allowed_preset_ids: [...value.allowed_preset_ids] }
  const current = generation, mark = `${groupFingerprint(payload)}:${group.row_version}`, id = props.serviceId
  const saved = groupPending.get(group.group_id)
  const operation = saved?.fingerprint === mark ? saved.operation : crypto.randomUUID()
  groupPending.set(group.group_id, { fingerprint: mark, operation }); busy.value = true; error.value = ''
  try {
    const result = await saveDrawingGroup(id, group.group_id, payload, group.row_version, operation)
    if (current === generation) { groups.value = groups.value.map(item => item.group_id === group.group_id ? result : item)
      groupDraft.value[group.group_id] = groupValue(result); groupPending.delete(group.group_id); notice.value = '群聊配置已保存。' }
  } catch { if (current === generation) error.value = '群模式保存失败，请刷新后重试。' }
  finally { if (current === generation) busy.value = false }
}
function openGroup(group: string) { selectedGroup.value = group; section.value = 'groups' }
function setR18Detection(event: Event) {
  if (currentGroupDraft.value) currentGroupDraft.value.mode = (event.target as HTMLInputElement).checked ? 'green' : 'r18'
}
function openEditor(id: string | null, engine: 'comfy' | 'openai' = 'comfy') {
  if (editorDirty.value && !window.confirm('预设有未保存的修改，关闭后将丢失，是否继续？')) return
  editingId.value = id; editorEngine.value = engine; editorOpen.value = true; editorDirty.value = false
}
function closeEditor() {
  if (editorDirty.value && !window.confirm('工作流有未保存的修改，关闭后将丢失，是否继续？')) return
  editorOpen.value = false; editorDirty.value = false
}
async function presetSaved() {
  editorOpen.value = false; editorDirty.value = false
  try { presets.value = await fetchDrawingPresets(props.serviceId); notice.value = editorEngine.value === 'openai' ? '线上预设已保存。' : '工作流已保存，请检查依赖并试运行。' }
  catch { error.value = '工作流已保存，但列表刷新失败。' }
}
async function checkPreset(item: DrawingPreset) {
  if (busy.value) return
  const current = generation, id = props.serviceId, existing = checkPending.get(item.id)
  const operation = existing?.version === item.row_version ? existing.operation : crypto.randomUUID()
  checkPending.set(item.id, { version: item.row_version, operation }); busy.value = true; error.value = ''
  try {
    await checkDrawingPreset(id, item.id, item.row_version, operation)
    const list = await fetchDrawingPresets(id)
    if (current === generation) { presets.value = list; checkPending.delete(item.id); notice.value = '依赖检查完成，请继续试运行。' }
  } catch { if (current === generation) error.value = '依赖检查失败，请确认 ComfyUI、节点和模型文件。' }
  finally { if (current === generation) busy.value = false }
}
function openPreview(item: DrawingPreset) { previewId.value = item.id; previewText.value = ''; previewMode.value = 'green'; previewFile.value = null; pendingPreview = null }
function selectPreviewFile(event: Event) { previewFile.value = (event.target as HTMLInputElement).files?.[0] ?? null }
async function preview() {
  if (!previewId.value || busy.value || !previewText.value.trim()) { error.value = '请输入试运行的绘图描述。'; return }
  if (selectedPreview.value?.kind === 'image_edit' && !previewFile.value) { error.value = '图生图试运行需要选择参考图。'; return }
  if (previewFile.value && previewFile.value.size > 8 * 1024 * 1024) { error.value = '参考图不能超过 8 MiB。'; return }
  const current = generation, id = props.serviceId, body = new FormData()
  body.append('positive', previewText.value); body.append('negative', ''); body.append('mode', previewMode.value)
  if (previewFile.value) body.append('image', previewFile.value)
  const mark = JSON.stringify({ preset: previewId.value, version: selectedPreview.value?.row_version,
    positive: previewText.value, mode: previewMode.value })
  if (!pendingPreview || pendingPreview.fingerprint !== mark || pendingPreview.file !== previewFile.value)
    pendingPreview = { fingerprint: mark, file: previewFile.value, operation: crypto.randomUUID() }
  busy.value = true; error.value = ''
  try {
    await previewDrawingPreset(id, previewId.value, body, selectedPreview.value?.row_version ?? 0, pendingPreview.operation)
    if (current === generation) { pendingPreview = null; previewId.value = null; section.value = 'tasks'; notice.value = '试运行已排队，不会发送到 QQ。'; void refreshRuntime() }
  } catch { if (current === generation) error.value = '试运行未能受理，请先完成依赖检查。' }
  finally { if (current === generation) busy.value = false }
}
async function taskAction(item: DrawingTask, action: 'cancel' | 'retry') {
  if (busy.value) return
  if (action === 'cancel' && !window.confirm('结束这个任务？已经开始发送的消息无法撤回。')) return
  const current = generation
  const key = `${item.id}:${action}`, operation = taskPending.get(key) ?? crypto.randomUUID()
  taskPending.set(key, operation)
  busy.value = true; error.value = ''
  try {
    if (action === 'cancel') {
      const result = await cancelDrawingTask(props.serviceId, item.id, operation)
      if (current === generation) notice.value = result.status === 'transport_started' ? '结果已开始发送，无法撤回。' : '已请求结束任务。'
    }
    else await retryDrawingSend(props.serviceId, item.id, operation)
    taskPending.delete(key)
    if (current === generation) await refreshRuntime()
  } catch { if (current === generation) error.value = '操作失败，请刷新任务状态后重试。' }
  finally { if (current === generation) busy.value = false }
}
function isActiveTask(item: DrawingTask) {
  return ['queued', 'submitting', 'running', 'cancelling', 'reconciling'].includes(item.generation_status)
    || ['cleaning', 'input_audit', 'output_audit', 'waiting_audit_stop'].includes(item.processing_stage)
    || ['ready', 'sending'].includes(item.send_status) || ['pending', 'deferred', 'failed'].includes(item.cleanup_status)
}
function canDelete(item: DrawingTask) {
  return ['succeeded', 'failed', 'cancelled', 'expired'].includes(item.generation_status)
    && item.cleanup_status === 'done' && item.send_status !== 'sending' && item.deletion_state === 'visible'
}
function taskName(item: DrawingTask) {
  return item.operation === 'tag' ? '图片标签' : item.origin === 'admin_preview' ? '管理试运行' : 'QQ 绘图'
}
function openHistoryCleanup() {
  selectedTasks.value = []; tasksError.value = ''; cleanupOpen.value = true
}
function selectHistoryTask(id: string, checked: boolean) {
  selectedTasks.value = checked ? [...selectedTasks.value, id] : selectedTasks.value.filter(value => value !== id)
}
function canCancel(item: DrawingTask) {
  return !item.cancel_requested && (['queued', 'submitting', 'running', 'reconciling'].includes(item.generation_status)
    || item.generation_status === 'succeeded' && ['none', 'ready', 'sending'].includes(item.send_status))
}
function taskLabel(item: DrawingTask) {
  if (item.cancel_requested && item.generation_status === 'succeeded') return '已取消后续处理'
  if (item.send_status === 'failed') return '发送失败'
  if (item.error_code === 'drawing_audit_blocked' || item.error_code === 'drawing_input_blocked') return '审核未通过'
  if (item.error_code === 'drawing_audit_unknown') return '审核无法确认'
  if (!['finished', 'delivery_unknown'].includes(item.processing_stage) &&
      !['failed', 'cancelled', 'expired'].includes(item.generation_status))
    return stageLabels[item.processing_stage] || taskLabels[item.generation_status] || item.generation_status
  if (item.processing_stage === 'delivery_unknown') return '发送结果待核对'
  return taskLabels[item.generation_status] || item.generation_status
}
type FlowTone = 'success' | 'warning' | 'danger' | 'neutral'
type FlowStep = { name: string; status: string; tone: FlowTone }
function enterFlow(key: string) {
  if (flowTimer) clearTimeout(flowTimer)
  if (pinnedFlow !== key) pinnedFlow = null
  openFlow.value = key
}
function leaveFlow(key: string) {
  if (flowTimer) clearTimeout(flowTimer)
  flowTimer = setTimeout(() => {
    if (openFlow.value === key && focusedFlow !== key && pinnedFlow !== key) openFlow.value = null
  }, 120)
}
function focusFlow(key: string) { focusedFlow = key; enterFlow(key) }
function closeFlow(key: string) {
  if (openFlow.value === key) openFlow.value = null
  if (focusedFlow === key) focusedFlow = null
  if (pinnedFlow === key) pinnedFlow = null
}
function toggleFlow(key: string) {
  if (pinnedFlow === key) closeFlow(key)
  else { pinnedFlow = key; openFlow.value = key }
}
function taskTone(item: DrawingTask): FlowTone {
  if (item.cancel_requested || ['failed', 'cancelled', 'expired'].includes(item.generation_status)
      || item.send_status === 'failed' || Boolean(item.error_code)) return 'danger'
  if (item.processing_stage === 'delivery_unknown' || item.send_status === 'unknown') return 'neutral'
  return item.processing_stage === 'finished' && item.generation_status === 'succeeded' ? 'success' : 'warning'
}
function taskFlow(item: DrawingTask): FlowStep[] {
  const steps: FlowStep[] = []
  const add = (name: string, status: string, tone: FlowTone) => steps.push({ name, status, tone })
  const stage = item.processing_stage
  const ended = ['failed', 'cancelled', 'expired'].includes(item.generation_status) || ['finished', 'delivery_unknown'].includes(stage)
  const cancelled = item.cancel_requested || item.generation_status === 'cancelled'
  const waiting = ended ? '未记录' : '未开始'
  const online = Boolean(item.online_request_state)
  const transport = item.prompt_transport_started || item.online_request_sent || item.online_image_received
  const hasStarted = item.has_started || transport || item.generation_status === 'succeeded'
    || (stage && !['queued', 'finished', 'delivery_unknown', 'sending', 'deleting'].includes(stage))
  if (stage === 'queued' && !ended) add('排队', '排队中', 'warning')
  else if (hasStarted) add('排队', '已完成', 'success')
  else if (item.generation_status === 'expired') add('排队', '已过期', 'danger')
  else add('排队', '未记录', 'neutral')

  if (item.operation !== 'tag') {
    if (item.prompt_model_used === false) add('许愿提示词整理', '已跳过', 'neutral')
    else if (item.prompt_model_used && item.prompt_status === 'ready') add('许愿提示词整理', '已完成', 'success')
    else if (item.prompt_model_used && item.prompt_status === 'working') add('许愿提示词整理', '执行中', 'warning')
    else if (item.prompt_model_used && item.prompt_status === 'failed' && !cancelled &&
      ['drawing_prompt_model_unconfigured', 'drawing_llm_timeout', 'drawing_llm_provider_error', 'drawing_wish_invalid'].includes(item.error_code || ''))
      add('许愿提示词整理', '失败', 'danger')
    else add('许愿提示词整理', waiting, 'neutral')
  }

  const inputStatus = item.input_audit_status
  if (inputStatus === 'allow') add('参考图审核', '已通过', 'success')
  else if (inputStatus === 'block') add('参考图审核', '未通过', item.error_code === 'drawing_input_blocked' ? 'danger' : 'success')
  else if (inputStatus === 'unknown') add('参考图审核', '无法确认', item.generation_status === 'failed' && item.error_code === 'drawing_audit_unknown' ? 'danger' : 'neutral')
  else if (stage === 'input_audit') add('参考图审核', '执行中', 'warning')
  else if (item.has_input_image === false) add('参考图审核', '已跳过', 'neutral')
  else add('参考图审核', waiting, 'neutral')

  if (online) {
    if (transport) add('准备线上请求', '已完成', 'success')
    else if (stage === 'preparing_online') add('准备线上请求', '执行中', 'warning')
    else if (['drawing_online_unconfigured', 'drawing_online_proxy_unavailable'].includes(item.error_code || '')) add('准备线上请求', '失败', 'danger')
    else add('准备线上请求', waiting, 'neutral')
    if (item.online_image_received) add('服务商生成', '已收到图片', 'success')
    else if (item.online_request_state === 'unknown') add('服务商生成', '结果未知', 'neutral')
    else if (transport && cancelled) add('服务商生成', '已结束', 'danger')
    else if (transport && item.online_request_state === 'failed') add('服务商生成', '失败', 'danger')
    else if (['online_submitting', 'online_waiting'].includes(stage)) add('服务商生成', item.online_request_sent ? '等待图片' : '提交中', 'warning')
    else add('服务商生成', waiting, 'neutral')
  } else {
    if (item.resource_registration_state === 'confirmed' || transport) add('准备本地资源', '已完成', 'success')
    else if (stage === 'preparing_resources') add('准备本地资源', '执行中', 'warning')
    else if (item.resource_registration_state === 'unknown') add('准备本地资源', '状态未知', 'neutral')
    else add('准备本地资源', waiting, 'neutral')
    const name = item.operation === 'tag' ? '图片标签处理' : 'ComfyUI 生成'
    if (item.generation_status === 'succeeded') add(name, '已完成', 'success')
    else if (transport && cancelled && item.generation_status === 'cancelled') add(name, '已结束', 'danger')
    else if (transport && item.generation_status === 'failed') add(name, '失败', 'danger')
    else if (item.generation_status === 'reconciling') add(name, '状态待核对', 'neutral')
    else if (['submitting', 'waiting_native', 'executing', 'cancelling'].includes(stage)) add(name, stageLabels[stage] || '执行中', 'warning')
    else add(name, waiting, 'neutral')
  }

  if (item.operation !== 'tag') {
    if (item.audit_status === 'allow') add('生成图审核', '已通过', 'success')
    else if (item.audit_status === 'block') add('生成图审核', '未通过', item.error_code === 'drawing_audit_blocked' ? 'danger' : 'success')
    else if (item.audit_status === 'unknown') add('生成图审核', '无法确认', item.error_code === 'drawing_audit_unknown' ? 'danger' : 'neutral')
    else if (item.audit_status === 'not_required') add('生成图审核', '未启用', 'neutral')
    else if (stage === 'output_audit') add('生成图审核', '执行中', 'warning')
    else add('生成图审核', ended ? '未进行' : '未开始', 'neutral')
  }
  if (item.origin !== 'qq') add('发送结果', '不适用', 'neutral')
  else if (item.send_status === 'sent') add('发送结果', item.reply_kind === 'failure_notice' ? '失败通知已发送' : '已发送', 'success')
  else if (item.send_status === 'failed') add('发送结果', '失败', 'danger')
  else if (item.send_status === 'unknown') add('发送结果', '结果未知', 'neutral')
  else if (item.send_status === 'sending') add('发送结果', '执行中', 'warning')
  else add('发送结果', ended ? '未记录' : '未开始', 'neutral')
  if (item.cleanup_status === 'done') add('清理任务资源', '已完成', 'success')
  else if (item.cleanup_status === 'failed') add('清理任务资源', '失败', 'danger')
  else if (['pending', 'deferred'].includes(item.cleanup_status)) add('清理任务资源', '等待中', 'warning')
  else add('清理任务资源', ended ? '未记录' : '未开始', 'neutral')
  return steps
}
function progressTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour12: false })
}
function taskTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
async function loadMoreHistory() {
  if (!historyCursor.value || busy.value) return
  const current = generation, cursor = historyCursor.value
  busy.value = true
  try {
    const result = await fetchDrawingTasks(props.serviceId, 'history', cursor)
    if (current !== generation) return
    const ids = new Set(history.value.map(item => item.id))
    history.value.push(...result.items.filter(item => !ids.has(item.id)))
    historyCursor.value = result.next_after_id; historyExpanded.value = true
  } catch { if (current === generation) tasksError.value = '加载更多历史失败。' }
  finally { if (current === generation) busy.value = false }
}
async function showTaskDetails(item: DrawingTask) {
  const current = generation, request = ++detailRequest
  if (taskDetailImageUrl.value) URL.revokeObjectURL(taskDetailImageUrl.value)
  taskDetailImageUrl.value = null; taskDetailImageLoading.value = false; taskDetailImageError.value = ''
  taskDetail.value = null; taskDetailError.value = ''; taskDetailLoading.value = true; taskDetailOpen.value = true
  try {
    const result = await fetchDrawingTask(props.serviceId, item.id)
    if (current === generation && request === detailRequest && taskDetailOpen.value) {
      taskDetail.value = result
      if (result.has_image) void loadTaskDetailImage(result, current, request)
    }
  } catch {
    if (current === generation && request === detailRequest && taskDetailOpen.value) taskDetailError.value = '无法读取任务详情，请稍后重试。'
  } finally {
    if (current === generation && request === detailRequest) taskDetailLoading.value = false
  }
}
async function loadTaskDetailImage(item: DrawingTask, current: number, request: number) {
  taskDetailImageLoading.value = true
  try {
    const image = await fetchDrawingTaskImage(props.serviceId, item.id)
    if (current === generation && request === detailRequest && taskDetailOpen.value && taskDetail.value?.id === item.id)
      taskDetailImageUrl.value = URL.createObjectURL(image)
  } catch {
    if (current === generation && request === detailRequest && taskDetailOpen.value) taskDetailImageError.value = '图片暂不可查看，可能已被删除。'
  } finally {
    if (current === generation && request === detailRequest) taskDetailImageLoading.value = false
  }
}
function closeTaskDetails() {
  if (taskDetailImageUrl.value) URL.revokeObjectURL(taskDetailImageUrl.value)
  taskDetailImageUrl.value = null; taskDetailImageLoading.value = false; taskDetailImageError.value = ''
  detailRequest++; taskDetailOpen.value = false; taskDetailLoading.value = false; taskDetailError.value = ''; taskDetail.value = null
}
async function downloadTaskImage(item: DrawingTask) {
  const current = generation
  try {
    const body = await fetchDrawingTaskImage(props.serviceId, item.id)
    if (current !== generation) return
    const url = URL.createObjectURL(body), link = document.createElement('a')
    link.href = url; link.download = `绘图-${item.id.slice(0, 8)}.${body.type === 'image/gif' ? 'gif' : 'png'}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch {
    if (current === generation) {
      if (taskDetailOpen.value && taskDetail.value?.id === item.id) {
        if (taskDetailImageUrl.value) URL.revokeObjectURL(taskDetailImageUrl.value)
        taskDetailImageUrl.value = null; taskDetailImageError.value = '图片已清理或暂不可下载。'
      }
      else tasksError.value = '图片已清理或暂不可下载。'
    }
  }
}
async function deleteSelectedHistory() {
  const selected = [...selectedTasks.value]
  if (!selected.length || busy.value) return
  const current = generation
  busy.value = true; tasksError.value = ''
  try {
    try {
      await ElMessageBox.confirm(`删除选中的 ${selected.length} 条历史及其图片缓存？此操作无法撤销。`, '确认批量清理',
        { type: 'warning', confirmButtonText: '删除历史', cancelButtonText: '返回' })
    } catch { return }
    if (current !== generation) return
    if (!activeTasksKnown.value) { tasksError.value = '无法确认活动任务，请刷新后再清理。'; return }
    const eligible = new Set(cleanupCandidates.value.map(item => item.id))
    if (selected.some(id => !eligible.has(id))) {
      selectedTasks.value = selected.filter(id => eligible.has(id))
      tasksError.value = '部分任务状态已变化，请重新选择。'
      return
    }
    const key = `delete:${selected.slice().sort().join(',')}`
    const operation = taskPending.get(key) ?? crypto.randomUUID()
    taskPending.set(key, operation)
    const result = await deleteDrawingTasks(props.serviceId, selected, operation)
    if (current !== generation) return
    const removed = new Set(result.deleted), pendingIds = new Set(result.pending)
    history.value = history.value.filter(item => !removed.has(item.id))
      .map(item => pendingIds.has(item.id) ? { ...item, deletion_state: 'deleting' } : item)
    selectedTasks.value = []; historyExpanded.value = false; cleanupOpen.value = false
    notice.value = result.pending.length ? `已删除 ${result.deleted.length} 条，${result.pending.length} 条等待清理。` : `已删除 ${result.deleted.length} 条历史。`
    taskPending.delete(key)
    await refreshRuntime()
  } catch { if (current === generation) tasksError.value = '删除未完成，请检查任务状态后重试。' }
  finally { if (current === generation) busy.value = false }
}
async function releaseResources() {
  if (busy.value) return
  const current = generation, id = props.serviceId
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await releaseDrawingResources(id)
    if (current === generation) {
      notice.value = result.status === 'queued' ? '已请求释放当前连接的空闲生图模型。' : '共享服务正忙，请稍后再试。'
      await refreshRuntime()
    }
  } catch { if (current === generation) error.value = '资源释放请求未完成，请检查共享服务。' }
  finally { if (current === generation) busy.value = false }
}
</script>

<template>
  <section class="drawing-settings">
    <div class="drawing-tabs" role="tablist" aria-label="AI 绘图设置" @keydown="navigateBotTabs">
      <button v-for="tab in [{id:'general',label:'通用设置'},{id:'workflows',label:'工作流'}, {id:'groups',label:'群聊配置'}, {id:'tasks',label:'任务与资源'}]"
        :id="`drawing-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :data-drawing-tab="tab.id"
        :aria-selected="section === tab.id" :aria-controls="`drawing-panel-${tab.id}`" :tabindex="section === tab.id ? 0 : -1"
        @click="section = tab.id as Section">{{ tab.label }}</button>
    </div>
    <p v-if="error" class="drawing-error" role="alert">{{ error }}</p><p v-if="notice" class="drawing-notice" role="status">{{ notice }}</p>
    <div id="drawing-panel-general" v-show="section === 'general'" role="tabpanel" aria-labelledby="drawing-tab-general">
      <div class="drawing-summary"><div><strong>{{ resourceText }}</strong><p>{{ resourceError || syncText }}<template v-if="resources?.queued != null"> · 本地排队 {{ resources.queued }} 个任务</template></p><p v-if="resources?.state === 'available'">WD14 节点已就绪，模型文件将在标签请求时核验。</p></div><button type="button" @click="refreshRuntime">刷新状态</button></div>
      <p v-if="resources?.qq_connection === 'conflict'" class="drawing-error" role="alert">绘图的 QQ 事件地址与当前连接不一致，请检查并保存一致的地址。</p>
      <p v-else-if="resources?.qq_connection === 'unconfigured'" class="drawing-hint">请配置绘图的 QQ 事件地址。</p>
      <section v-if="draft" class="drawing-card drawing-general-settings">
        <label class="drawing-setting-row drawing-setting-switch"><span><strong>启用 AI 绘图</strong></span><input v-model="draft.enabled" data-drawing-field="enabled" type="checkbox"></label>
        <label class="drawing-setting-row drawing-setting-switch"><span><strong>允许私聊绘图</strong></span><input v-model="draft.allow_private" data-drawing-field="allow-private" type="checkbox"></label>
        <label class="drawing-setting-row"><span><strong>QQ 事件 WebSocket 地址</strong></span><input v-model="draft.event_ws_url" data-drawing-field="event-url" placeholder="ws://llbot:3001"></label>
        <label class="drawing-setting-row"><span><strong>绘图 ComfyUI 地址</strong><small>绘图空闲 60 秒后释放模型，服务继续运行。</small></span><input v-model="draft.comfy_base_url" data-drawing-field="comfy-url" placeholder="http://host.docker.internal:8188"></label>
        <div class="drawing-setting-row"><span><strong>绘图授权群号</strong><small>保存后生效，点击已授权群可配置规则。</small></span><div class="drawing-scope-controls">
          <div class="drawing-group-links"><span v-for="group in draftGroups" :key="group" class="drawing-group-tag"><button type="button" :data-drawing-configure-group="group" @click="configureDrawingGroup(group)">{{ group }}</button><button type="button" :aria-label="`移除 ${group}`" @click="removeDrawingGroup(group)">×</button></span><button type="button" @click="groupAdding = !groupAdding">＋ 添加</button><button type="button" @click="groupBulk = !groupBulk">批量编辑</button></div>
          <div v-if="groupAdding" class="drawing-group-add"><input v-model="groupEntry" aria-label="QQ群号" placeholder="输入群号" @keyup.enter="addDrawingGroup"><button type="button" @click="addDrawingGroup">添加群号</button></div>
          <textarea v-if="groupBulk" v-model="groupsText" data-drawing-field="groups" rows="3" placeholder="每行一个 QQ 群号" />
        </div></div>
        <label class="drawing-setting-row"><span><strong>默认文生图</strong><small>选择通过检查的文生图工作流。</small></span><select v-model="draft.default_text_preset_id" data-drawing-field="default-text"><option :value="null">请选择</option><option v-for="item in textPresets" :key="item.id" :value="item.id">#{{ item.number }} {{ item.name }} · {{ validationLabels[item.validation_state] }}</option></select></label>
        <label class="drawing-setting-row"><span><strong>默认图生图</strong><small>/p2p 使用此工作流。</small></span><select v-model="draft.default_edit_preset_id" data-drawing-field="default-edit"><option :value="null">请选择</option><option v-for="item in editPresets" :key="item.id" :value="item.id">#{{ item.number }} {{ item.name }} · {{ validationLabels[item.validation_state] }}</option></select></label>
        <label class="drawing-setting-row"><span><strong>默认线上绘图</strong><small>/gpt 使用此预设。</small></span><select v-model="draft.default_online_preset_id" data-drawing-field="default-online"><option :value="null">请选择</option><option v-for="item in onlinePresets" :key="item.id" :value="item.id">#{{ item.number }} {{ item.name }}</option></select></label>
        <div class="drawing-setting-row"><span><strong>许愿提示词模型</strong><small>{{ currentPrompt ? `当前生效：${currentPrompt.name}` : '尚未选择生效模型；明确的正负面提示词仍可使用。' }}</small></span><button ref="promptButton" type="button" data-drawing-action="open-models" @click="openPromptDialog">配置模型</button></div>
      </section>
      <div v-if="promptDialogOpen" class="drawing-modal-backdrop" @click.self="closePromptDialog">
        <section ref="promptDialog" class="drawing-modal" role="dialog" aria-modal="true" aria-labelledby="drawing-model-title" tabindex="-1" @keydown="promptDialogKey">
          <header class="drawing-modal-header"><div><h3 id="drawing-model-title">配置许愿提示词模型</h3><p>当前任务使用已选版本，等待中的任务开始时使用新的生效模型。</p></div><button type="button" aria-label="关闭" @click="closePromptDialog">×</button></header>
          <div class="drawing-model-list"><button v-for="item in promptCatalog.items" :key="item.id" type="button" :class="{ selected: selectedPromptId === item.id }" :data-drawing-model-select="item.id" @click="selectPrompt(item)">{{ item.name }}<small v-if="promptCatalog.active_id === item.id">生效中</small></button><button type="button" data-drawing-action="new-model" @click="selectPrompt(null)">＋ 新建模型</button></div>
          <p v-if="promptError" class="drawing-error" role="alert">{{ promptError }}</p><p v-if="promptNotice" class="drawing-notice" role="status">{{ promptNotice }}</p>
          <form class="drawing-model-form" @submit.prevent="savePrompt">
            <label class="drawing-setting-row"><span><strong>模型名称</strong></span><input v-model="promptDraft.name" data-drawing-model="name" placeholder="例如：绘图许愿"></label>
            <label class="drawing-setting-row"><span><strong>接口类型</strong></span><select v-model="promptDraft.adapter_kind" data-drawing-model="adapter"><option value="openai_chat_completion">OpenAI 兼容 Chat Completions</option><option value="openai_responses">OpenAI Responses</option><option value="googlegenai_chat_completion">Google Gemini</option></select></label>
            <label class="drawing-setting-row"><span><strong>模型 ID</strong></span><input v-model="promptDraft.model_id" data-drawing-model="id" placeholder="填写模型 ID"></label>
            <label class="drawing-setting-row"><span><strong>API 地址</strong><small>留空使用服务商默认地址。</small></span><input v-model="promptDraft.base_url" data-drawing-model="url" placeholder="https://..."></label>
            <label class="drawing-setting-row"><span><strong>网络环境</strong></span><select v-model="promptDraft.network_mode" data-drawing-model="network"><option value="direct">直连</option><option value="proxy">使用现有代理</option></select></label>
            <label class="drawing-setting-row"><span><strong>API 密钥</strong><small>{{ promptConfigured ? '已保存，留空保持不变。' : '尚未保存。' }}</small></span><input v-model="promptDraft.secret_input" data-drawing-model="secret" type="password" autocomplete="new-password" placeholder="输入密钥"></label>
            <label v-if="promptConfigured" class="drawing-clear-secret"><input v-model="promptDraft.clear_secret" type="checkbox"> 清除已保存的密钥</label>
            <footer class="drawing-model-actions"><button v-if="selectedPrompt" type="button" :disabled="promptBusy" @click="promptAction('delete')">删除</button><button v-if="selectedPrompt" type="button" :disabled="promptBusy || promptFingerprint() !== promptBaseline" @click="promptAction('test')">测试连接</button><button v-if="selectedPrompt && promptCatalog.active_id !== selectedPrompt.id" type="button" :disabled="promptBusy || promptFingerprint() !== promptBaseline" @click="promptAction('activate')">设为当前</button><button type="submit" class="primary" data-drawing-action="save-model" :disabled="promptBusy || promptFingerprint() === promptBaseline">保存模型</button></footer>
          </form>
        </section>
      </div>
      <section class="drawing-card drawing-commands"><h3>群聊怎么用</h3><div><p><b>/wfN 画面描述</b> 在同一条消息指定编号和内容；回复单张图片可使用图生图工作流。普通聊天不会触发绘图。</p><p><b>/wf</b> 查看工作流；单独发送 /wfN 可保留个人选择，<b>/wf0</b> 重置选择；实际绘图仍需带描述。</p><p><b>/p2p 修改要求</b> 回复当前会话中的单张图片，使用默认图生图工作流。</p><p><b>/gpt 描述</b> 使用默认线上模型；<b>/gptN 描述</b> 指定线上预设，回复单图可编辑。</p><p><b>/tag</b> 回复一张图片并 @机器人，获取 WD14 推测的画面标签。</p></div></section>
      <footer v-if="draft" class="drawing-save"><span>{{ hasUnsaved ? '有未保存的修改' : syncText }}</span><button type="button" class="primary" data-drawing-action="save-settings" :disabled="busy || (fingerprint() === baseline && !groupEntry.trim())" @click="saveSettings">保存当前连接设置</button></footer>
    </div>
    <div id="drawing-panel-workflows" v-show="section === 'workflows'" role="tabpanel" aria-labelledby="drawing-tab-workflows">
      <div class="drawing-section-head"><h3>工作流预设</h3><div class="drawing-actions"><button type="button" @click="openEditor(null, 'openai')">新增线上预设</button><button type="button" class="primary" @click="openEditor(null)">导入工作流</button></div></div>
      <AiDrawingPresetEditor v-if="editorEngine === 'comfy'" :service-id="serviceId" :preset-id="editingId" :open="editorOpen" @close="closeEditor" @saved="presetSaved" @dirty="editorDirty = $event" />
      <AiDrawingOnlinePresetEditor v-else :service-id="serviceId" :preset-id="editingId" :open="editorOpen" @close="closeEditor" @saved="presetSaved" @dirty="editorDirty = $event" />
      <div v-if="!presets.length && !editorOpen" class="drawing-empty">还没有工作流。导入 ComfyUI API JSON 后，先检查依赖并试运行。</div>
      <article v-for="item in presets" :key="item.id" class="drawing-preset">
        <div><span class="drawing-number">#{{ item.number }}</span><strong>{{ item.name }}</strong><span class="drawing-pill">{{ item.engine === 'openai' ? '线上绘图' : item.kind === 'txt2img' ? '文生图' : '图生图' }}</span><span :class="['drawing-pill', item.validation_state === 'ready' ? 'success' : '']">{{ item.engine === 'openai' ? item.validation_state === 'ready' ? '已配置' : '缺少密钥' : validationLabels[item.validation_state] }}</span><small>{{ item.enabled ? '已启用' : '已停用' }}<template v-if="item.engine !== 'openai'"> · LoRA 别名：{{ item.lora_keys.length ? item.lora_keys.join('、') : '无' }}</template></small></div>
        <div class="drawing-actions"><button type="button" @click="openEditor(item.id, item.engine === 'openai' ? 'openai' : 'comfy')">编辑</button><button v-if="item.engine !== 'openai'" type="button" :disabled="busy" @click="checkPreset(item)">检查依赖</button><button type="button" :disabled="busy || item.validation_state === 'unchecked' || item.validation_state === 'missing'" @click="openPreview(item)">{{ item.engine === 'openai' ? '试运行（计费）' : '试运行' }}</button></div>
      </article>
      <section v-if="previewId" class="drawing-card drawing-preview"><h3>试运行 #{{ selectedPreview?.number }} {{ selectedPreview?.name }}</h3><p>仅在管理页查看结果，不会发到 QQ。</p>
        <label>提示词<textarea v-model="previewText" rows="4" /></label><p class="drawing-hint">负向条件可用【负面】、【负向】或【NP】标记。</p>
        <label v-if="selectedPreview?.kind === 'image_edit' || selectedPreview?.engine === 'openai'">参考图<template v-if="selectedPreview?.engine === 'openai'">（可选）</template><input type="file" accept="image/png,image/jpeg,image/webp" @change="selectPreviewFile"></label>
        <label>预览模式<select v-model="previewMode"><option value="green">绿色模式</option><option value="r18">R18 模式</option></select></label>
        <div class="drawing-actions"><button type="button" @click="previewId = null">取消</button><button type="button" class="primary" :disabled="busy" @click="preview">提交试运行</button></div>
      </section>
    </div>
    <div id="drawing-panel-groups" v-show="section === 'groups'" role="tabpanel" aria-labelledby="drawing-tab-groups">
      <div v-if="!groups.length" class="drawing-empty">暂无绘图授权群，请先在绘图通用设置中添加群号。</div>
      <fieldset v-else class="drawing-group-page" :disabled="busy">
        <section class="drawing-card">
          <h3>群聊配置</h3><p class="drawing-hint">选择授权群，设置该群可使用的工作流和图片检测。</p>
          <label>选择群聊<select v-model="selectedGroup" data-drawing-group-select><option v-for="group in groups" :key="group.group_id" :value="group.group_id">{{ group.group_id }}</option></select></label>
          <template v-if="currentGroup && currentGroupDraft">
            <div class="drawing-group-options"><strong>工作流范围</strong>
              <label><input type="radio" name="drawing-workflow-scope" data-drawing-scope="all" :checked="!currentGroupDraft.restrict_workflows" @change="currentGroupDraft.restrict_workflows = false">开放全部工作流</label>
              <small>新导入的工作流自动开放。</small>
              <label><input type="radio" name="drawing-workflow-scope" data-drawing-scope="restricted" :checked="currentGroupDraft.restrict_workflows" @change="currentGroupDraft.restrict_workflows = true">仅开放指定工作流</label>
              <small>新导入的工作流需要在此群手动允许。</small>
              <div v-if="currentGroupDraft.restrict_workflows" class="drawing-workflow-options">
                <label v-for="item in presets" :key="item.id"><input v-model="currentGroupDraft.allowed_preset_ids" type="checkbox" :value="item.id" :data-drawing-allowed="item.id">#{{ item.number }} {{ item.name }} · {{ item.engine === 'openai' ? '线上绘图' : item.kind === 'txt2img' ? '文生图' : '图生图' }}</label>
                <small v-if="!presets.length">暂无工作流，请先导入。</small>
              </div>
            </div>
            <label class="drawing-switch-row"><span><strong>开启 R18 检测</strong><small>开启后正面加入 sfw、负面加入 nsfw，并审核参考图和生成结果。</small></span><input type="checkbox" data-drawing-r18-check :checked="currentGroupDraft.mode === 'green'" @change="setR18Detection"></label>
            <p class="drawing-hint">普通及轻度敏感类放行，可疑、明确类及审核异常时不发送；关闭后使用 R18 模式。</p>
          </template>
        </section>
        <footer v-if="currentGroup" class="drawing-save"><span>{{ groupDirty(currentGroup) ? '当前群有未保存的修改' : '当前群配置已保存' }}</span><button type="button" class="primary" :data-drawing-save-group="currentGroup.group_id" :disabled="!groupDirty(currentGroup)" @click="saveGroup(currentGroup)">保存当前群配置</button></footer>
      </fieldset>
    </div>
    <div id="drawing-panel-tasks" v-show="section === 'tasks'" role="tabpanel" aria-labelledby="drawing-tab-tasks">
      <div class="drawing-section-head"><div><h3>任务与共享资源</h3><p>{{ resourceText }}</p></div><div class="drawing-actions"><button type="button" :disabled="busy || resources?.state !== 'available'" title="只释放当前连接的空闲生图资源，保留图片理解和其他连接使用的模型。" aria-label="释放当前连接的空闲生图资源" @click="releaseResources">释放资源</button><button type="button" @click="refreshRuntime">刷新</button></div></div>
      <p v-if="tasksError" class="drawing-error">{{ tasksError }}</p>
      <section class="panel drawing-history-panel">
        <div class="section-heading"><div><h3>任务记录</h3><small>图片保留至手动删除 · {{ mediaText }}</small></div><ElButton class="drawing-cleanup-trigger" type="danger" plain :disabled="busy || !cleanupCandidates.length" @click="openHistoryCleanup">批量清理</ElButton></div>
        <div v-if="!displayedTasks.length" class="drawing-history-empty">暂无任务记录</div>
        <div v-else class="table-shell"><table class="data-table drawing-history-table">
          <thead><tr><th scope="col">任务</th><th scope="col">执行状态</th><th scope="col">审核</th><th scope="col">线上请求</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead>
          <tbody><tr v-for="item in displayedTasks" :key="item.id" class="drawing-history-row">
            <td class="drawing-history-name"><strong>{{ taskName(item) }}</strong><small>{{ item.id }}</small><small v-if="activeTaskIds.has(item.id) && item.target_id">{{ item.scope_kind === 'qq_group' ? '群' : '私聊' }} {{ item.target_id }}</small><small v-if="activeTaskIds.has(item.id) && item.queue_position != null">{{ item.queue_position === 0 ? item.generation_status === 'queued' ? '队首等待' : '当前执行' : `前方 ${item.queue_position} 项${item.online_request_state ? '线上' : '共享'}任务` }}</small><small v-if="taskError(item.error_code)" class="drawing-task-error">{{ taskError(item.error_code) }}</small><small v-if="item.deletion_state === 'deleting'">文件清理中，可稍后刷新。</small></td>
            <td><ElPopover :visible="openFlow === `history:${item.id}`" placement="bottom-start" :width="320" :popper-style="{ maxWidth: 'calc(100vw - 24px)' }" :show-after="0" :hide-after="0">
              <template #reference><button type="button" class="drawing-flow-trigger status-badge" :class="`status-badge--${taskTone(item)}`" :aria-label="`${taskLabel(item)}，查看执行流程`" :aria-expanded="openFlow === `history:${item.id}`" @mouseenter="enterFlow(`history:${item.id}`)" @mouseleave="leaveFlow(`history:${item.id}`)" @focus="focusFlow(`history:${item.id}`)" @blur="closeFlow(`history:${item.id}`)" @click="toggleFlow(`history:${item.id}`)" @keydown.esc.stop.prevent="closeFlow(`history:${item.id}`)">{{ taskLabel(item) }}</button></template>
              <div class="drawing-flow" :aria-label="`任务 ${item.id.slice(0, 8)} 执行流程`" @mouseenter="enterFlow(`history:${item.id}`)" @mouseleave="leaveFlow(`history:${item.id}`)"><strong>执行流程</strong><div v-for="step in taskFlow(item)" :key="step.name" class="drawing-flow-step" :data-flow-stage="step.name" :data-flow-tone="step.tone"><span class="drawing-flow-dot" :class="`drawing-flow-dot--${step.tone}`" aria-hidden="true"></span><span>{{ step.name }}</span><span class="drawing-flow-result">{{ step.status }}</span></div><div v-if="item.progress" class="drawing-flow-progress">节点 #{{ item.progress.node_id }} · {{ item.progress.node_name }}<template v-if="item.progress.value != null && item.progress.max != null"> · {{ item.progress.value }} / {{ item.progress.max }}</template><template v-if="progressTime(item.progress.updated_at)"> · 更新于 {{ progressTime(item.progress.updated_at) }}</template><progress v-if="item.progress.value != null && item.progress.max" :value="item.progress.value" :max="item.progress.max" aria-label="当前节点进度" /></div><div v-else-if="item.processing_stage === 'executing'" class="drawing-flow-progress">当前节点进度暂不可用</div></div>
            </ElPopover></td>
            <td>{{ auditText(item) }}</td><td class="drawing-history-online">{{ item.online_request_state ? onlineRequestText(item) : '—' }}</td><td>{{ taskTime(item.created_at) }}</td>
            <td><div class="drawing-actions"><button v-if="activeTaskIds.has(item.id) && canCancel(item)" type="button" @click="taskAction(item, 'cancel')">强制结束</button><button type="button" @click="showTaskDetails(item)">详情</button><button v-if="item.has_image" type="button" @click="downloadTaskImage(item)">下载</button><button v-if="item.send_status === 'failed'" type="button" @click="taskAction(item, 'retry')">重试发送</button></div></td>
          </tr></tbody>
        </table></div>
        <button v-if="historyCursor" type="button" :disabled="busy" @click="loadMoreHistory">加载更多</button>
      </section>
      <ElDialog v-model="cleanupOpen" title="清理任务历史" width="min(700px, 94vw)" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy">
        <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">清理任务历史 <HelpHint subject="清理任务历史">仅列出当前已加载且允许删除的历史，每次最多 50 条；需要其他记录请返回列表加载更多。</HelpHint></span></template>
        <div class="drawing-cleanup-list"><div v-for="item in cleanupCandidates" :key="item.id"><ElCheckbox :model-value="selectedTasks.includes(item.id)" :disabled="busy || (selectedTasks.length >= 50 && !selectedTasks.includes(item.id))" @change="selectHistoryTask(item.id, Boolean($event))">{{ taskName(item) }} · {{ taskTime(item.created_at) }} · {{ item.id }}</ElCheckbox></div></div>
        <p v-if="tasksError" class="drawing-error" role="alert">{{ tasksError }}</p>
        <template #footer><ElButton :disabled="busy" @click="cleanupOpen = false">关闭</ElButton><ElButton type="danger" :loading="busy" :disabled="busy || !selectedTasks.length" @click="deleteSelectedHistory">删除选中（{{ selectedTasks.length }}）</ElButton></template>
      </ElDialog>
      <ElDrawer :model-value="taskDetailOpen" title="任务详情" size="min(720px, 95vw)" @update:model-value="value => { if (!value) closeTaskDetails() }">
        <p v-if="taskDetailLoading" role="status">正在读取任务详情…</p><p v-else-if="taskDetailError" class="drawing-error" role="alert">{{ taskDetailError }}</p>
        <div v-else-if="taskDetail" class="drawing-task-detail"><section v-if="taskDetail.error_code === 'drawing_online_moderation_blocked'"><h4>服务商审核</h4><p>审核阶段：{{ moderationStage(taskDetail) }}<br>原因类别：{{ moderationReasons(taskDetail) }}</p></section><section v-if="taskDetail.wish_text"><h4>原始描述</h4><p>{{ taskDetail.wish_text }}</p></section><section><h4>提示词</h4><p>{{ taskDetail.positive || '暂无' }}</p></section><section v-if="taskDetail.negative"><h4>负向提示词</h4><p>{{ taskDetail.negative }}</p></section><section v-if="taskDetail.has_image" class="drawing-detail-image"><div class="drawing-detail-image-header"><h4>生成图片</h4><ElButton size="small" @click="downloadTaskImage(taskDetail)">下载</ElButton></div><p v-if="taskDetailImageLoading" role="status">正在读取图片…</p><p v-else-if="taskDetailImageError" class="drawing-error" role="alert">{{ taskDetailImageError }}</p><img v-else-if="taskDetailImageUrl" :src="taskDetailImageUrl" alt="绘图任务生成图片预览"></section></div>
      </ElDrawer>
    </div>
  </section>
</template>

<style scoped>
.drawing-settings{color:#18385e}.drawing-tabs{display:flex;gap:6px;border-bottom:1px solid #dfebf8;margin-bottom:18px;overflow:auto}.drawing-tabs button{white-space:nowrap;border:0;border-bottom:2px solid transparent;background:none;padding:10px 18px;color:#7389a7;cursor:pointer}.drawing-tabs button[aria-selected=true]{color:#147ef6;border-color:#147ef6;font-weight:700}.drawing-summary,.drawing-card,.drawing-preset,.drawing-group,.drawing-task{background:#fff;border:1px solid #dfebf8;border-radius:10px;padding:20px}.drawing-summary,.drawing-section-head,.drawing-preset,.drawing-group,.drawing-task,.drawing-save{display:flex;align-items:center;justify-content:space-between;gap:16px}.drawing-summary p,.drawing-card header p,.drawing-section-head p,.drawing-preview p{margin:7px 0 0;color:#7b90ad;font-size:13px}.drawing-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0}.drawing-card h3,.drawing-section-head h3{font-size:17px;margin:0}.drawing-card label:not(.drawing-switch-row){display:grid;gap:8px;margin:16px 0;font-size:14px;font-weight:600}.drawing-switch-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:1px solid #edf3fa}.drawing-switch-row span,.drawing-group div,.drawing-task div:first-child{display:grid;gap:5px}.drawing-switch-row small,.drawing-group small,.drawing-task small,.drawing-preset small{color:#8297b3;font-size:12px;font-weight:400}.drawing-switch-row input{appearance:none;width:44px;height:24px;flex:none;border-radius:20px;background:#cfdded;cursor:pointer;position:relative}.drawing-switch-row input:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff}.drawing-switch-row input:checked{background:#1680f8}.drawing-switch-row input:checked:before{left:23px}.drawing-card select,.drawing-card textarea,.drawing-group select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d3e2f3;border-radius:6px;color:#18385e;background:#fff;font:inherit}.drawing-hint{font-size:13px;color:#7b90ad;line-height:1.6}.drawing-commands{margin-top:16px}.drawing-commands div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 20px}.drawing-commands p{font-size:13px;line-height:1.6;color:#647e9e}.drawing-save{padding:18px 0;font-size:13px;color:#7b90ad}.drawing-settings button{border:1px solid #d4e2f2;border-radius:6px;background:#fff;color:#28527d;padding:9px 14px;cursor:pointer}.drawing-settings button:disabled{opacity:.5;cursor:not-allowed}.drawing-settings button.primary{background:#1680f8;border-color:#1680f8;color:#fff}.drawing-section-head{margin:4px 0 16px}.drawing-preset,.drawing-group,.drawing-task{margin:10px 0}.drawing-preset>div:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.drawing-preset small{flex-basis:100%}.drawing-number,.drawing-pill{padding:4px 8px;border-radius:5px;background:#edf5ff;color:#1878e5;font-size:12px}.drawing-pill.success{background:#e8f8ef;color:#15945c}.drawing-actions{display:flex;gap:8px;flex-wrap:wrap}.drawing-group select{width:160px}.drawing-group>div,.drawing-task>div:first-child{flex:1}.drawing-preview{margin-top:16px}.drawing-empty{padding:42px 20px;text-align:center;background:#f6faff;border:1px dashed #d6e6f7;border-radius:10px;color:#8398b2}.drawing-error{color:#bd3434}.drawing-notice{color:#169461}@media(max-width:760px){.drawing-cards,.drawing-commands div{grid-template-columns:1fr}.drawing-section-head,.drawing-preset,.drawing-group,.drawing-task{align-items:stretch;flex-direction:column}.drawing-group select{width:100%}.drawing-save{align-items:stretch;flex-direction:column}}
.drawing-authorized-groups{margin:16px 0}.drawing-group-links{display:flex;gap:8px;flex-wrap:wrap}.drawing-group-page{border:0;margin:0;padding:0;min-width:0}.drawing-group-options{display:grid;gap:8px;margin:18px 0}.drawing-card .drawing-group-options label,.drawing-card .drawing-workflow-options label{display:flex;align-items:center;gap:8px;margin:4px 0;font-weight:400}.drawing-group-options small{color:#7b90ad;font-size:12px}.drawing-workflow-options{display:grid;gap:6px;padding:8px 12px;background:#f6faff;border-radius:6px}
.drawing-card input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:10px;border:1px solid #d3e2f3;border-radius:6px;color:#18385e;background:#fff;font:inherit}.drawing-authorized-groups textarea{margin:8px 0 12px}.drawing-prompt-model .drawing-cards{gap:0 16px}.drawing-card .drawing-clear-secret{display:flex;align-items:center;gap:8px;font-weight:400}
.drawing-general-settings { margin-top:16px; }
.drawing-commands div { grid-template-columns:1fr; }
.drawing-settings .drawing-setting-row { display:flex; align-items:center; justify-content:space-between; gap:24px; min-width:0; margin:0; padding:8px 0; border-bottom:1px solid #edf3fa; font-size:14px; }
.drawing-settings .drawing-general-settings .drawing-setting-row { display:flex; gap:24px; margin:0; }
.drawing-settings .drawing-setting-row:last-child { border-bottom:0; }
.drawing-setting-row>span { display:grid; gap:4px; min-width:0; flex:1 1 auto; }
.drawing-setting-row strong { font-size:14px; font-weight:600; }
.drawing-setting-row small { color:#8297b3; font-size:12px; font-weight:400; line-height:1.5; }
.drawing-settings .drawing-setting-row>input:not([type=checkbox]),.drawing-settings .drawing-setting-row>select { box-sizing:border-box; flex:0 1 460px; width:min(50%,460px); min-width:0; padding:10px; border:1px solid #d3e2f3; border-radius:6px; color:#18385e; background:#fff; font:inherit; }
.drawing-setting-row>input[type=checkbox] { appearance:none; position:relative; flex:none; width:44px; height:24px; margin:0; border-radius:20px; background:#cfdded; cursor:pointer; }
.drawing-setting-row>input[type=checkbox]::before { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:#fff; }
.drawing-setting-row>input[type=checkbox]:checked { background:#1680f8; }.drawing-setting-row>input[type=checkbox]:checked::before { left:23px; }
.drawing-scope-controls { flex:0 1 460px; min-width:0; display:grid; gap:8px; }.drawing-group-links,.drawing-group-add { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.drawing-group-tag { display:inline-flex; align-items:center; background:#edf5ff; border-radius:5px; }.drawing-settings .drawing-group-tag button { border:0; background:transparent; padding:7px; }.drawing-scope-controls textarea { min-height:70px; resize:vertical; }
.drawing-modal-backdrop { position:fixed; inset:0; z-index:2000; display:grid; place-items:center; padding:20px; background:rgba(18,38,62,.42); }
.drawing-modal { box-sizing:border-box; width:min(760px,100%); max-height:min(85vh,900px); overflow:auto; padding:24px; border:1px solid #d3e2f3; border-radius:10px; background:#fff; color:#18385e; box-shadow:0 12px 36px rgba(18,38,62,.18); }
.drawing-modal:focus { outline:none; }.drawing-modal-header { display:flex; justify-content:space-between; gap:20px; }.drawing-modal-header h3 { margin:0; font-size:18px; }.drawing-modal-header p { margin:7px 0 0; color:#7b90ad; font-size:13px; }.drawing-model-list { display:flex; flex-wrap:wrap; gap:8px; margin:20px 0 4px; }.drawing-model-list button.selected { border-color:#1680f8; background:#edf5ff; }.drawing-model-list small { margin-left:8px; color:#1680f8; }.drawing-model-form { margin-top:8px; }.drawing-model-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; padding-top:20px; }.drawing-clear-secret { display:flex; gap:8px; align-items:center; padding-top:12px; font-size:13px; }
.drawing-settings button:focus-visible,.drawing-settings input:focus-visible,.drawing-settings select:focus-visible,.drawing-settings textarea:focus-visible { outline:2px solid #1680f8; outline-offset:2px; }
.drawing-history-heading { margin-top:24px; }.drawing-task-row,.drawing-history-row { align-items:flex-start; }.drawing-task .drawing-task-info { display:grid; gap:5px; min-width:0; flex:1; }.drawing-task .drawing-task-info .drawing-task-error { color:#b42318; font-size:13px; font-weight:500; line-height:1.4; overflow-wrap:anywhere; }.drawing-task-state { display:grid; gap:5px; min-width:180px; }.drawing-task-state small { color:#8297b3; }.drawing-task-state progress { width:100%; accent-color:#1680f8; }.drawing-history-row>input { flex:none; margin-top:4px; }.drawing-task-detail { margin-top:16px; }.drawing-task-detail p { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; }
.drawing-history-panel { margin-top:24px; }.drawing-history-panel h3 { margin:0; }.drawing-history-panel .section-heading small { display:block; margin-top:5px; color:var(--muted); font-size:12px; }.drawing-history-empty { padding:30px 12px; text-align:center; color:var(--muted); }.drawing-history-table { min-width:1160px; table-layout:fixed; }.drawing-history-table .drawing-history-name small { max-width:none; }.drawing-history-table .drawing-history-name .drawing-task-error { color:var(--danger); white-space:normal; overflow:visible; overflow-wrap:anywhere; line-height:1.45; }.drawing-history-online { line-height:1.5; }.drawing-history-table .drawing-actions { gap:6px; }.drawing-settings .drawing-history-table .drawing-actions button { padding:4px 9px; font-size:12px; white-space:nowrap; }.drawing-settings button.drawing-flow-trigger { justify-content:center; width:max-content; max-width:100%; min-height:23px; padding:4px 9px; border:0; border-radius:999px; font-size:12px; font-weight:700; line-height:1.2; cursor:pointer; }.drawing-settings button.drawing-flow-trigger:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }.drawing-flow { width:min(300px, calc(100vw - 60px)); color:var(--text); }.drawing-flow>strong { display:block; margin-bottom:8px; }.drawing-flow-step { display:grid; grid-template-columns:9px minmax(0,1fr) auto; align-items:center; gap:8px; padding:5px 0; font-size:13px; }.drawing-flow-dot { width:8px; height:8px; border-radius:50%; background:var(--muted); }.drawing-flow-dot--success { background:var(--success); }.drawing-flow-dot--warning { background:var(--warning); }.drawing-flow-dot--danger { background:var(--danger); }.drawing-flow-result { color:var(--muted); font-size:12px; }.drawing-visually-hidden { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.drawing-settings button.drawing-flow-trigger.status-badge--success { color:var(--success); background:var(--success-soft); }.drawing-settings button.drawing-flow-trigger.status-badge--warning { color:var(--warning); background:var(--warning-soft); }.drawing-settings button.drawing-flow-trigger.status-badge--danger { color:var(--danger); background:var(--danger-soft); }.drawing-settings button.drawing-flow-trigger.status-badge--neutral { color:var(--muted); background:color-mix(in srgb, var(--muted) 12%, transparent); }
.drawing-history-table th:first-child { width:31%; }.drawing-history-table th:nth-child(2) { width:130px; }.drawing-history-table th:nth-child(3) { width:80px; }.drawing-history-table th:nth-child(4) { width:190px; }.drawing-history-table th:nth-child(5) { width:160px; }.drawing-history-table th:nth-child(6) { width:240px; }.drawing-settings .drawing-cleanup-trigger.el-button--danger.is-plain { color:var(--danger); border-color:color-mix(in srgb, var(--danger) 30%, transparent); background:var(--danger-soft); }.drawing-cleanup-list { max-height:45vh; overflow:auto; }.drawing-cleanup-list :deep(.el-checkbox) { max-width:100%; height:auto; min-height:32px; }.drawing-cleanup-list :deep(.el-checkbox__label) { white-space:normal; overflow-wrap:anywhere; }
.drawing-history-panel { margin-top:16px; }.drawing-flow-progress { margin-top:8px; padding-top:8px; border-top:1px solid var(--border); color:var(--muted); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }.drawing-flow-progress progress { display:block; width:100%; margin-top:6px; accent-color:var(--accent); }
.drawing-cleanup-list :deep(.el-checkbox) { align-items:flex-start; padding:4px 0; }.drawing-cleanup-list :deep(.el-checkbox__input) { margin-top:3px; }.drawing-cleanup-list :deep(.el-checkbox__label) { line-height:1.45; }
.drawing-task-detail section + section { margin-top:24px; }.drawing-task-detail h4 { margin:0 0 8px; font-size:14px; }.drawing-task-detail p { margin:0; }
.drawing-detail-image-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }.drawing-detail-image-header h4 { margin:0; }.drawing-detail-image img { display:block; max-width:100%; max-height:55vh; object-fit:contain; border-radius:6px; }
@media(max-width:700px) { .drawing-settings .drawing-setting-row { align-items:stretch; flex-direction:column; gap:10px; }.drawing-settings .drawing-general-settings .drawing-setting-row { gap:10px; }.drawing-settings .drawing-general-settings .drawing-setting-switch { align-items:center; flex-direction:row; }.drawing-settings .drawing-general-settings .drawing-setting-switch>input[type=checkbox] { align-self:center; }.drawing-settings .drawing-setting-row>input:not([type=checkbox]),.drawing-settings .drawing-setting-row>select { flex:auto; width:100%; }.drawing-setting-row>input[type=checkbox] { align-self:flex-end; }.drawing-scope-controls { flex:auto; width:100%; }.drawing-modal { padding:18px; }.drawing-history-row>input { align-self:flex-start; } }
</style>
