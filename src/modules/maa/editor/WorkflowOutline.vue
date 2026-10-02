<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Back, CircleCheck, Clock, Close, Delete, Document, House, Menu, Monitor, Plus, Search, Setting, VideoPlay } from '@element-plus/icons-vue'
import type { ScriptDocument, WorkflowStep } from '../../../shared/api/maa-script-editor'
import { newWorkflowStep } from './workflow-defaults'
import { deleteWorkflowStep, insertWorkflowStep, isConfigurableWorkflowAction, moveWorkflowStep } from './workflow-structure'
import { globalPopupsEnabled } from './global-popup-rules'

const props = defineProps<{ document: ScriptDocument; selected: number; selectedGlobal?: boolean; disabled: boolean }>()
const emit = defineEmits<{ select: [index: number]; selectGlobal: []; toggleGlobal: [enabled: boolean]; change: [document: ScriptDocument, selected: number] }>()
const choices = [
  { action: 'wait', label: '等待', icon: Clock },
  { action: 'recognize_execute', label: '识别图形并执行', icon: Search },
  { action: 'back', label: '返回', icon: Back },
  { action: 'home', label: '主页', icon: House },
  { action: 'task_view', label: '任务视图', icon: Menu },
] as const
const names: Record<string, string> = {
  start: '开始', launch_app: '启动应用', cleanup: '结束应用并清理',
  stop_app: '关闭应用', wait: '等待', wait_random: '随机等待', wait_image: '等待图片',
  recognize_execute: '识别图形并执行', back: '返回', home: '主页', task_view: '任务视图',
  tap: '点击', swipe: '滑动', wait_click: '识别并点击', wait_text: '等待文字',
  click_text: '识别文字并点击', smart_swipe: '智能滑动', feedback: '反馈', screenshot: '截图',
}
const icons: Record<string, typeof Document> = {
  start: VideoPlay, launch_app: Monitor, cleanup: CircleCheck, stop_app: Close,
  wait: Clock, wait_random: Clock, wait_image: Clock, recognize_execute: Search,
  wait_click: Search, wait_text: Search, click_text: Search, smart_swipe: Search,
  back: Back, home: House, task_view: Menu,
}
const insertAt = ref<number | null>(null)
const dragging = ref<number | null>(null)
const dropAt = ref<number | null>(null)
const undo = ref<{ before: ScriptDocument; after: string; selected: number } | null>(null)
const error = ref('')
const canUndo = computed(() => !!undo.value && JSON.stringify(props.document) === undo.value.after)
watch(() => props.document, () => { if (undo.value && !canUndo.value) undo.value = null })

function title(step: WorkflowStep) {
  return String(step.name || step.title || names[step.action] || step.action)
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}
function detail(step: WorkflowStep) {
  if (typeof step.description === 'string') return step.description
  if (step.action === 'wait') return `${step.seconds ?? '—'} 秒`
  if (step.action === 'wait_random') return `${step.min_seconds ?? '—'}–${step.max_seconds ?? '—'} 秒`
  if (typeof step.text === 'string') return step.text
  return ''
}
function apply(operation: () => ScriptDocument, selected: number) {
  if (props.disabled) return
  error.value = ''
  try {
    const next = operation()
    undo.value = null
    insertAt.value = null
    emit('change', next, Math.max(0, Math.min(selected, next.steps.length - 1)))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '步骤修改失败' }
}
function add(action: string, at: number) {
  if (!choices.some(choice => choice.action === action)) return
  apply(() => insertWorkflowStep(props.document, at, newWorkflowStep(action)), at)
}
function remove(index: number) {
  if (props.disabled) return
  error.value = ''
  const before = props.document
  try {
    const next = deleteWorkflowStep(before, index)
    undo.value = { before, after: JSON.stringify(next), selected: props.selected }
    insertAt.value = null
    emit('change', next, Math.max(0, Math.min(index, next.steps.length - 1)))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '步骤不能删除' }
}
function restore() {
  if (props.disabled || !canUndo.value || !undo.value) return
  const previous = undo.value
  undo.value = null
  error.value = ''
  emit('change', previous.before, previous.selected)
}
function startDrag(event: DragEvent, index: number) {
  if (props.disabled || !isConfigurableWorkflowAction(props.document.steps[index]!.action)) {
    event.preventDefault(); return
  }
  dragging.value = index
  insertAt.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}
function over(event: DragEvent, at: number) {
  if (dragging.value === null || props.disabled) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropAt.value = at
}
function drop(event: DragEvent, at: number) {
  if (dragging.value === null || props.disabled) return
  event.preventDefault()
  const from = dragging.value
  dragging.value = null
  dropAt.value = null
  const to = at > from ? at - 1 : at
  if (to !== from) apply(() => moveWorkflowStep(props.document, from, to), to)
}
function moveBy(index: number, offset: number) {
  const to = index + offset
  if (to < 0 || to >= props.document.steps.length) return
  apply(() => moveWorkflowStep(props.document, index, to), to)
}
function select(index: number) { insertAt.value = null; emit('select', index) }
function selectGlobal() { insertAt.value = null; emit('selectGlobal') }
</script>

<template>
  <nav class="workflow-outline" aria-label="脚本步骤">
    <header class="flow-heading"><h2>脚本步骤</h2><div class="flow-heading-actions"><span class="global-label">全局规则</span>
      <button type="button" class="global-switch" role="switch" aria-label="全局规则" :aria-checked="globalPopupsEnabled(document)"
        :disabled="disabled || (!document.steps.length && !globalPopupsEnabled(document))" :title="!document.steps.length ? '请先添加脚本步骤' : undefined"
        @click="emit('toggleGlobal', !globalPopupsEnabled(document))"><span /></button>
      <span class="flow-count">{{ document.steps.length }} 步</span></div></header>
    <p v-if="error" class="flow-error" role="alert">{{ error }}</p>
    <div v-if="globalPopupsEnabled(document)" class="flow-node global-node" :class="{ selected: selectedGlobal }">
      <button type="button" class="flow-row" :disabled="disabled" aria-label="00 全局规则" :aria-current="selectedGlobal ? 'step' : undefined"
        @click="selectGlobal"><span class="flow-number">00</span><span class="flow-icon"><Setting /></span>
        <span class="flow-label"><strong>全局规则</strong><small>弹窗识别与适用步骤</small></span></button>
    </div>
    <div class="flow-list" role="list">
      <template v-for="(step, index) in document.steps" :key="index">
        <div v-if="index > 0" class="flow-gap" :class="{ expanded: insertAt === index, dropping: dropAt === index }"
          @dragover="over($event, index)" @dragleave="dropAt = null" @drop="drop($event, index)">
          <button type="button" class="gap-add" :disabled="disabled || document.steps.length >= 1000"
            :aria-label="`在第 ${index} 步与第 ${index + 1} 步之间插入`" @click="insertAt = insertAt === index ? null : index"><Plus /></button>
          <div v-if="insertAt === index" class="flow-add-menu" role="menu" aria-label="选择插入步骤类型">
            <small>插入步骤</small>
            <button v-for="choice in choices" :key="choice.action" type="button" role="menuitem" :disabled="disabled"
              @click="add(choice.action, index)"><component :is="choice.icon" /><span>{{ choice.label }}</span></button>
          </div>
        </div>
        <div class="flow-node" :class="{ selected: !selectedGlobal && selected === index, dragging: dragging === index }" role="listitem">
          <button type="button" class="flow-row" :disabled="disabled" :draggable="!disabled && isConfigurableWorkflowAction(step.action)"
            :aria-label="`第 ${index + 1} 步，${title(step)}`" :aria-current="!selectedGlobal && selected === index ? 'step' : undefined"
            @click="select(index)" @dragstart="startDrag($event, index)" @dragend="dragging = null; dropAt = null"
            @keydown.alt.up.prevent="moveBy(index, -1)" @keydown.alt.down.prevent="moveBy(index, 1)">
            <span class="flow-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="flow-icon"><component :is="icons[step.action] || Document" /></span>
            <span class="flow-label"><strong>{{ title(step) }}</strong><small v-if="detail(step)">{{ detail(step) }}</small></span>
          </button>
          <button v-if="isConfigurableWorkflowAction(step.action)" type="button" class="flow-delete"
            :disabled="disabled" :aria-label="`删除第 ${index + 1} 步`" title="删除步骤" @click.stop="remove(index)"><Delete /></button>
          <p v-if="record(step.skip_condition).enabled === true" class="flow-meta">
            {{ record(step.skip_condition).mode === 'recognition_failure' ? '识别失败跳过' : record(step.skip_condition).mode === 'execution_failure' ? '执行失败跳过' : '条件满足' }} → {{ record(step.skip_condition).skip_to_step_index ? `第 ${record(step.skip_condition).skip_to_step_index} 步` : (index + 1 < document.steps.length ? '下一步' : '结束') }}
          </p>
          <p v-if="record(step.failure_retry).enabled === true" class="flow-meta">失败 → 调用恢复脚本 → 重试本步</p>
        </div>
      </template>
      <div v-if="document.steps.length" class="flow-gap flow-gap-end" :class="{ dropping: dropAt === document.steps.length }"
        @dragover="over($event, document.steps.length)" @dragleave="dropAt = null" @drop="drop($event, document.steps.length)" />
    </div>
    <button type="button" class="flow-append" :disabled="disabled || document.steps.length >= 1000"
      @click="insertAt = insertAt === document.steps.length ? null : document.steps.length"><Plus /><span>添加步骤</span></button>
    <div v-if="insertAt === document.steps.length" class="flow-add-menu append-menu" role="menu" aria-label="选择添加步骤类型">
      <small>添加步骤</small>
      <button v-for="choice in choices" :key="choice.action" type="button" role="menuitem" :disabled="disabled"
        @click="add(choice.action, document.steps.length)"><component :is="choice.icon" /><span>{{ choice.label }}</span></button>
    </div>
    <div v-if="canUndo" class="flow-undo" role="status"><CircleCheck /><span>已删除步骤</span>
      <button type="button" :disabled="disabled" @click="restore">撤销</button>
    </div>
    <p v-if="document.cleanup_on_finish === true" class="flow-cleanup">流程结束后自动清理应用</p>
  </nav>
</template>

<style scoped>
.workflow-outline { --flow-blue:#176df2; --flow-ink:#10264b; --flow-muted:#6b80a5; --flow-soft:#eff6ff; --flow-tint:#e8f2ff; --flow-line:#dceafb; display:grid; align-content:start; gap:0; min-width:0; color:var(--flow-ink); }
:global(:root.dark) .workflow-outline { --flow-blue:#77adff; --flow-ink:#edf4ff; --flow-muted:#a7b8d2; --flow-soft:#1b2a41; --flow-tint:#203a60; --flow-line:#304762; }
.flow-heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding:2px 6px 15px; border-bottom:1px solid var(--flow-line); }
.flow-heading h2 { margin:0; white-space:nowrap; font-size:17px; font-weight:750; letter-spacing:.01em; }
.flow-heading .flow-count { flex:none; padding:5px 9px; border-radius:999px; color:var(--flow-muted); background:var(--flow-soft); font-size:12px; }
.flow-heading-actions { display:flex; align-items:center; gap:9px; }
.global-label { color:var(--flow-muted); font-size:11px; white-space:nowrap; }
.global-switch { position:relative; flex:none; width:35px; height:21px; padding:2px; border:0; border-radius:999px; background:#cbd7e7; cursor:pointer; }
.global-switch[aria-checked="true"] { background:var(--flow-blue); }
.global-switch span { display:block; width:17px; height:17px; padding:0; border-radius:50%; background:#fff; box-shadow:0 1px 3px #14305b33; transition:transform .18s ease; }
.global-switch[aria-checked="true"] span { transform:translateX(14px); }
.global-switch:focus-visible { outline:2px solid var(--flow-blue); outline-offset:2px; }
.global-switch:disabled { opacity:.5; cursor:default; }
.flow-list { margin-top:16px; min-width:0; }.flow-node { position:relative; border-radius:14px; }
.global-node { margin-top:14px; }.global-node .flow-row { cursor:pointer; padding-right:12px; }
.flow-row { display:flex; align-items:center; gap:10px; width:100%; min-height:68px; padding:9px 46px 9px 12px; border:0; border-radius:14px; background:transparent; text-align:left; cursor:grab; color:var(--flow-ink); }
.flow-row:active { cursor:grabbing; }.flow-row:disabled { cursor:default; opacity:.65; }
.flow-row:hover,.flow-row:focus-visible { background:var(--flow-soft); outline:none; }
.flow-node.selected .flow-row { background:var(--flow-tint); box-shadow:0 4px 14px #176df212; }
.flow-node.selected::before { content:''; position:absolute; z-index:1; left:0; top:5px; bottom:5px; width:4px; border-radius:4px; background:var(--flow-blue); }
.flow-node.dragging { opacity:.5; }.flow-number { flex:none; width:24px; color:var(--flow-muted); font-size:12px; font-variant-numeric:tabular-nums; text-align:center; }
.flow-icon { flex:none; display:grid; place-items:center; width:38px; height:38px; border-radius:11px; background:var(--flow-soft); color:var(--flow-blue); }.flow-icon svg { width:19px; height:19px; stroke-width:1.5; }
.flow-label { display:grid; gap:3px; min-width:0; }.flow-label strong { font-size:14px; line-height:1.25; overflow-wrap:anywhere; }.flow-label small { color:var(--flow-muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.flow-node.selected .flow-label strong { color:var(--flow-blue); }
.flow-delete { position:absolute; z-index:2; right:11px; top:19px; display:grid; place-items:center; width:30px; height:30px; padding:0; border:0; border-radius:9px; background:var(--surface); color:var(--flow-blue); box-shadow:0 3px 12px #176df219; opacity:0; cursor:pointer; }
.flow-delete svg { width:17px; height:17px; }.flow-node:hover .flow-delete,.flow-node:focus-within .flow-delete { opacity:1; }.flow-delete:disabled { opacity:.35; cursor:default; }
.flow-meta { margin:3px 10px 4px 48px; color:var(--flow-muted); font-size:11px; line-height:1.4; }
.flow-gap { position:relative; min-height:16px; display:grid; justify-items:center; align-content:center; }.flow-gap::before { content:''; width:100%; height:1px; background:transparent; }
.flow-gap:hover::before,.flow-gap:focus-within::before,.flow-gap.dropping::before { background:var(--flow-blue); }
.gap-add { position:absolute; z-index:2; top:-6px; display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:50%; background:var(--flow-blue); color:#fff; box-shadow:0 4px 10px #176df23d; opacity:0; cursor:pointer; }
.gap-add svg { width:16px; height:16px; }.flow-gap:hover .gap-add,.flow-gap:focus-within .gap-add,.flow-gap.expanded .gap-add { opacity:1; }.gap-add:disabled { cursor:default; }
.flow-gap.expanded { min-height:0; padding:23px 0 9px; }.flow-gap.expanded .gap-add { top:-5px; }.flow-gap-end { min-height:14px; }
.flow-add-menu { z-index:3; display:grid; gap:2px; width:100%; padding:9px; border:1px solid var(--flow-line); border-radius:13px; background:var(--surface); box-shadow:0 10px 25px #123f7b18; }
.flow-add-menu small { padding:4px 8px; color:var(--flow-muted); font-size:11px; }.flow-add-menu button { display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px; border:0; border-radius:8px; background:transparent; color:var(--flow-ink); text-align:left; cursor:pointer; font-size:13px; }
.flow-add-menu button:hover,.flow-add-menu button:focus-visible { background:var(--flow-soft); color:var(--flow-blue); outline:none; }.flow-add-menu button:disabled { opacity:.5; cursor:default; }.flow-add-menu svg { width:17px; height:17px; color:var(--flow-blue); }
.flow-append { display:flex; justify-content:center; align-items:center; gap:10px; min-height:46px; width:100%; border:0; border-radius:12px; background:var(--flow-soft); color:var(--flow-blue); cursor:pointer; font-size:13px; font-weight:650; }.flow-append:hover,.flow-append:focus-visible { background:var(--flow-tint); outline:2px solid var(--flow-line); }
.flow-append:disabled { opacity:.5; cursor:default; }.flow-append svg { width:19px; height:19px; }.append-menu { margin-top:10px; }
.flow-undo { display:flex; align-items:center; gap:8px; margin-top:16px; padding:11px 12px; border:1px solid var(--flow-line); border-radius:12px; background:var(--surface); box-shadow:0 5px 16px #123f7b0d; color:var(--flow-ink); font-size:12px; }
.flow-undo svg { width:19px; height:19px; color:var(--success); }.flow-undo span { flex:1; }.flow-undo button { border:0; background:none; color:var(--flow-blue); font-weight:650; cursor:pointer; }.flow-undo button:disabled { opacity:.5; cursor:default; }
.flow-error { margin:12px 0 0; padding:10px; border-radius:9px; background:var(--danger-soft); color:var(--danger); font-size:12px; line-height:1.4; }.flow-cleanup { margin:14px 4px 0; color:var(--flow-muted); font-size:11px; }
@media (hover:none) { .flow-node.selected .flow-delete { opacity:1; pointer-events:auto; } .gap-add { opacity:1; } }
</style>
