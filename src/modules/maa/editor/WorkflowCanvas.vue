<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
import { defaultNodeLayout } from './canvas-layout'
import WorkflowRecognitionPreview from './WorkflowRecognitionPreview.vue'
import { recognitionActions, textRecognition } from './recognition-display'
import WorkflowMiniMap from './WorkflowMiniMap.vue'
import { useCanvasPointer } from './use-canvas-pointer'
import { isConfigurableWorkflowAction } from './workflow-structure'
import { regionPreviewsKey, useRegionPreviews } from './use-region-previews'
const props = defineProps<{
  steps: WorkflowStep[]
  selected: number
  disabled: boolean
  scriptId: string
  versionId?: string
  failedStep?: number | null
  activeStep?: number | null
  completedSteps?: number[]
  focusStep?: number | null
  sidePanelOpen?: boolean
  canDebug?: boolean
  footerTarget?: string
  active?: boolean
}>()
const emit = defineEmits<{
  select: [index: number]
  parameters: []
  add: [action: string]
  edit: [index: number, step: WorkflowStep]
  operation: [kind: 'copy' | 'delete' | 'debug', index: number]
  link: [from: number, to: number]
}>()
const previews = inject(regionPreviewsKey, undefined)
  ?? useRegionPreviews(() => props.scriptId, () => props.versionId)
provide(regionPreviewsKey, previews)
const zoom = ref(1)
const viewport = ref<HTMLElement>()
const offset = ref({ x: 24, y: 32 })
const viewportMetrics = ref({ width: 1, height: 1, left: 0, top: 0 })
let resizeObserver: ResizeObserver | undefined
let nodeObserver: ResizeObserver | undefined
const heights = ref<Record<number, number>>({})
const layoutWidth = computed(() => {
  const width = viewportMetrics.value.width
  if (width <= 1) return undefined
  return Math.max(1, width - 24 - (props.sidePanelOpen ? 360 : 0))
})
const defaults = computed(() => defaultNodeLayout(props.steps, heights.value, layoutWidth.value))
const positions = ref<Record<number, { x: number; y: number }>>({})
const names: Record<string, string> = {
  wait: '等待', tap: '点击', wait_click: '识别并点击', wait_image: '等待图片',
  wait_random: '随机等待', recognize_execute: '识别图形并执行', task_view: '任务视图',
  wait_text: '等待文字', click_text: '识别文字并点击', start: '开始',
  launch_app: '启动应用', stop_app: '关闭应用', swipe: '滑动',
  smart_swipe: '智能滑动', home: '主页', back: '返回',
  screenshot: '截图', feedback: '反馈', cleanup: '结束应用并清理',
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}
function pos(index: number) {
  return positions.value[index] ?? defaults.value[index] ?? { x: 0, y: 0 }
}
const {
  drag, linking, down, move, finishLink, beginLink, longPress, blankHold, cancelHold, dispose,
} = useCanvasPointer({
  zoom, positions, position: pos, disabled: () => props.disabled,
  select: index => emit('select', index),
  link: (from, to) => emit('link', from, to),
  contextMenu: (event, index) => context(event, index),
})
const nodes = computed(() => props.steps.map((step, index) => ({
  s: step, i: index, ...defaults.value[index]!, ...pos(index),
})))
function imageAction(action: string) {
  return recognitionActions.includes(action)
}
const extent = computed(() => ({
  width: Math.max(300, ...nodes.value.map(node => node.x + node.width)),
  height: Math.max(200, ...nodes.value.map(node => node.y + node.height)),
}))
const space = computed(() => {
  const width = (extent.value.width + offset.value.x) * zoom.value
  const height = (extent.value.height + offset.value.y) * zoom.value
  const visible = viewportMetrics.value
  return {
    width: width > visible.width ? width + visible.width / 2 : visible.width,
    height: height > visible.height ? height + visible.height / 2 : visible.height,
  }
})
const visibleWorld = computed(() => ({
  x: (viewportMetrics.value.left - offset.value.x) / zoom.value,
  y: (viewportMetrics.value.top - offset.value.y) / zoom.value,
  width: viewportMetrics.value.width / zoom.value,
  height: viewportMetrics.value.height / zoom.value,
}))
const edges = computed(() => nodes.value.flatMap(node => {
  const out: { from: number; to: number; label: string; skip: boolean }[] = []
  if (node.i + 1 < props.steps.length) {
    out.push({ from: node.i, to: node.i + 1, label: '正常继续', skip: false })
  }
  const skip = obj(node.s.skip_condition)
  if (skip.enabled === true) {
    const to = Number(skip.skip_to_step_index ?? node.i + 2) - 1
    if (to < props.steps.length) {
      out.push({ from: node.i, to, label: skip.mode === 'recognition_failure' ? '识别失败跳过' : skip.mode === 'execution_failure' ? '执行失败跳过' : '条件满足', skip: true })
    }
  }
  return out
}))
function path(from: number, to: number) {
  const a = nodes.value[from]!, b = nodes.value[to]!
  if (b.y > a.y + a.height && b.x <= a.x) {
    return `M${a.x+a.width},${a.y+26} H${a.x+a.width+18} V${b.y-22} H${b.x-18} V${b.y+26} H${b.x}`
  }
  return `M${a.x+a.width},${a.y+26} C${a.x+a.width+22},${a.y+26} ${b.x-22},${b.y+26} ${b.x},${b.y+26}`
}
function skipPath(from: number, to: number) {
  const a = nodes.value[from]!, b = nodes.value[to]!, y = Math.max(a.y+a.height, b.y+b.height) + 22
  return `M${a.x+a.width/2},${a.y+a.height} C${a.x+a.width/2},${y} ${b.x+b.width/2},${y} ${b.x+b.width/2},${b.y+b.height}`
}
function fit() {
  const bounds = viewport.value?.getBoundingClientRect()
  if (!bounds) return
  const width = extent.value.width, height = extent.value.height
  zoom.value = Math.max(.2, Math.min(1, (bounds.width-50)/width, (bounds.height-60)/height))
  offset.value = { x: 25, y: 30 }
  viewport.value!.scrollTo(0, 0)
}
function scale(delta: number) { zoom.value = Math.max(.2, Math.min(2, zoom.value + delta)) }
function measureViewport() {
  if (!viewport.value) return
  viewportMetrics.value = {
    width: viewport.value.clientWidth, height: viewport.value.clientHeight,
    left: viewport.value.scrollLeft, top: viewport.value.scrollTop,
  }
}
function navigate(x: number, y: number) {
  if (!viewport.value) return
  viewport.value.scrollLeft = x * zoom.value + offset.value.x - viewport.value.clientWidth / 2
  viewport.value.scrollTop = y * zoom.value + offset.value.y - viewport.value.clientHeight / 2
  measureViewport()
}
function summary(step: WorkflowStep) {
  if (step.action === 'wait') return String(step.seconds ?? '—') + ' 秒'
  if (step.action === 'tap') return `(${step.x ?? '—'}, ${step.y ?? '—'})`
  return String(step.text ?? step.description ?? names[step.action] ?? step.action)
}
watch(() => props.steps.length, () => { linking.value = undefined })

const menu = ref<{ x: number; y: number; index?: number; point: { x: number; y: number } }>()
const search = ref('')
const category = ref('全部')
function group(action: string) {
  if (['wait_image', 'wait_click', 'wait_text', 'click_text', 'smart_swipe', 'recognize_execute'].includes(action))
    return '识别'
  return ['tap', 'swipe', 'back', 'home', 'task_view'].includes(action) ? '操作' : '其他'
}
const actions = {
  wait: '等待', recognize_execute: '识别图形并执行', back: '返回',
  home: '主页', task_view: '任务视图',
}
const choices = computed(() => Object.entries(actions).filter(([key, label]) =>
  (category.value === '全部' || group(key) === category.value) &&
  (key + label).toLowerCase().includes(search.value.toLowerCase())))
let pendingPoint: { x: number; y: number } | undefined
function context(event: MouseEvent, index?: number) {
  event.preventDefault()
  event.stopPropagation()
  search.value = ''
  category.value = '全部'
  const rect = viewport.value!.getBoundingClientRect()
  menu.value = {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 340)), index,
    point: {
      x: Math.max(0, (event.clientX - rect.left + viewport.value!.scrollLeft - offset.value.x) / zoom.value),
      y: Math.max(0, (event.clientY - rect.top + viewport.value!.scrollTop - offset.value.y) / zoom.value),
    },
  }
  if (index !== undefined) emit('select', index)
  void nextTick(() => document.querySelector<HTMLElement>('.graph-menu input,.graph-menu button')?.focus())
}
function create(action: string) {
  if (props.disabled || !menu.value) return
  pendingPoint = menu.value.point
  menu.value = undefined
  emit('add', action)
}
function details(index: number) {
  emit('select', index)
  emit('parameters')
  menu.value = undefined
}
function operation(kind: 'copy' | 'delete' | 'debug') {
  const index = menu.value?.index
  if (index === undefined || props.disabled) return
  menu.value = undefined
  emit('operation', kind, index)
}
function inline(index: number, key: string, event: Event, numeric = false) {
  if (props.disabled) return
  const input = event.target as HTMLInputElement
  const raw = input.value
  const value = numeric ? Number(raw) : raw
  const limits: Record<string, [number, number]> = {
    x: [0, 8191], y: [0, 8191], seconds: [0, 14400],
    timeout_seconds: [.1, 14400], poll_interval_seconds: [.05, 10],
    threshold: [.000001, 1], wait_seconds: [0, 300], click_count: [1, 999],
  }
  const [min, max] = limits[key] ?? [0, Number.MAX_SAFE_INTEGER]
  const invalidNumber = numeric && (!raw || !Number.isFinite(value) || Number(value) < min ||
    Number(value) > max || (['x', 'y', 'click_count'].includes(key) && !Number.isInteger(value)))
  if (invalidNumber) {
    input.value = String(props.steps[index]?.[key] ?? '')
    return
  }
  emit('edit', index, { ...props.steps[index]!, [key]: value })
}
function dismiss(event: Event) {
  if (!(event.target as HTMLElement)?.closest?.('.graph-menu')) menu.value = undefined
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape') menu.value = undefined
}
onMounted(() => {
  window.addEventListener('pointerdown', dismiss)
  window.addEventListener('keydown', escape)
  window.addEventListener('resize', dismiss)
  resizeObserver = new ResizeObserver(measureViewport)
  if (viewport.value) resizeObserver.observe(viewport.value)
  nodeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const node = entry.target as HTMLElement, index = Number(node.dataset.node)
      const height = node.offsetHeight
      if (height > 0 && heights.value[index] !== height) heights.value[index] = height
    }
  })
  observeNodes()
  measureViewport()
})
async function observeNodes() {
  await nextTick()
  nodeObserver?.disconnect()
  viewport.value?.querySelectorAll('[data-node]').forEach(node => nodeObserver?.observe(node))
}
watch(() => props.steps, observeNodes)
function focusNode(step: number | null | undefined) {
  if (!step || props.active === false || !viewport.value) return
  const node = nodes.value[step - 1]
  if (!node) return
  const usable = Math.max(160, viewport.value.clientWidth - (props.sidePanelOpen ? 360 : 0))
  viewport.value.scrollLeft = Math.max(0, (node.x + node.width / 2) * zoom.value + offset.value.x - usable / 2)
  viewport.value.scrollTop = Math.max(0, (node.y + node.height / 2) * zoom.value + offset.value.y - viewport.value.clientHeight / 2)
  measureViewport()
}
watch([() => props.focusStep, () => props.active, () => props.sidePanelOpen], async () => { await nextTick(); focusNode(props.focusStep) })
onBeforeUnmount(() => {
  dispose()
  resizeObserver?.disconnect()
  nodeObserver?.disconnect()
  window.removeEventListener('pointerdown', dismiss)
  window.removeEventListener('keydown', escape)
  window.removeEventListener('resize', dismiss)
})
watch(() => props.steps.length, (count, previous) => {
  if (count > previous && pendingPoint) {
    positions.value[count - 1] = pendingPoint
    pendingPoint = undefined
  }
})

defineExpose({ zoom, positions, fit, focusNode })
</script>
<template>
<section class="workflow-canvas">
 <header><strong>工作流编辑 <HelpHint subject="工作流编辑">右键添加节点 · 节点右键或双击编辑 · Ctrl＋滚轮缩放</HelpHint></strong></header>
 <div ref="viewport" class="graph-viewport" aria-label="工作流画布"
  @scroll="measureViewport" @contextmenu="context($event)" @pointerdown="blankHold"
  @pointermove="cancelHold" @pointerup="cancelHold();finishLink($event)"
  @pointercancel="cancelHold();linking=undefined" @wheel.ctrl.prevent="scale($event.deltaY>0?-.1:.1)">
  <div class="graph-space" :style="{width:space.width+'px',height:space.height+'px'}">
  <div class="graph-world" :style="{width:extent.width+'px',height:extent.height+'px',transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}">
   <svg class="graph-edges" :width="extent.width" :height="extent.height" aria-hidden="true">
    <defs><marker id="workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
    <g v-for="(edge,i) in edges" :key="i">
     <path :d="edge.skip?skipPath(edge.from,edge.to):path(edge.from,edge.to)" fill="none"
      :stroke="edge.skip?'var(--el-color-warning)':'var(--accent)'" stroke-width="2"
      :stroke-dasharray="edge.skip?'5 4':undefined" marker-end="url(#workflow-arrow)" />
     <text v-if="edge.skip" :x="pos(edge.from).x + (edge.skip ? nodes[edge.from]!.width / 2 : nodes[edge.from]!.width + 4)"
      :y="pos(edge.from).y + (edge.skip ? nodes[edge.from]!.height + 18 : 16)">{{ edge.label }}</text>
    </g>
   </svg>
   <article v-for="node in nodes" :key="node.i" :data-node="node.i" class="graph-node" :class="{selected:node.i===selected,failed:failedStep===node.i+1,running:activeStep===node.i+1,passed:completedSteps?.includes(node.i+1),'node-start':node.s.action==='start'}" :style="{left:node.x+'px',top:node.y+'px',width:node.width+'px'}"
    @pointerdown="down($event,node.i);longPress($event,node.i)" @pointermove="move"
    @pointerup="cancelHold();drag=undefined" @pointercancel="drag=undefined"
    @click="emit('select',node.i)" tabindex="0" @contextmenu="context($event,node.i)"
    @keydown.enter.self.prevent="details(node.i)" @dblclick="details(node.i)">
    <button class="node-title" data-node-drag-handle @click="emit('select',node.i)">{{ String(node.i+1).padStart(2, '0') }} · {{ node.s.name || node.s.title || names[node.s.action] || node.s.action }}</button>
    <small v-if="activeStep===node.i+1" class="node-running">执行中</small>
    <div v-if="node.s.action !== 'start'" class="inline-fields" @dblclick.stop @keydown.stop>
     <label v-if="node.s.action==='wait'">秒 <input type="number" min="0" :value="node.s.seconds" :disabled="disabled" aria-label="等待秒数" @change="inline(node.i,'seconds',$event,true)" /></label>
     <template v-else-if="node.s.action==='tap'">
      <label v-for="key in ['x','y']" :key="key">{{ key }}
       <input type="number" min="0" step="1" :value="node.s[key]" :disabled="disabled"
        :aria-label="'点击'+key" @change="inline(node.i,key,$event,true)" />
      </label>
     </template>
     <label v-if="['wait_text','click_text'].includes(node.s.action)">文字 <input :value="node.s.text" :disabled="disabled" aria-label="识别文字" @change="inline(node.i,'text',$event)" /></label>
     <template v-if="imageAction(node.s.action)">
      <button type="button" class="node-image-action" @click="details(node.i)"><WorkflowRecognitionPreview
        :step="node.s" :script-id="scriptId" :version-id="versionId" :show-text="!['wait_text','click_text'].includes(node.s.action)" /></button>
      <label v-if="!textRecognition(node.s)">图片阈值 <input type="number" min="0.000001" max="1" step="0.01" :value="node.s.threshold ?? 0.85" :disabled="disabled" aria-label="图片匹配阈值" @change="inline(node.i,'threshold',$event,true)" /></label>
     </template>
     <label v-if="imageAction(node.s.action) || ['wait_text','click_text'].includes(node.s.action)">识别间隔
      <input type="number" min="0.05" max="10" step="0.05" :value="node.s.poll_interval_seconds ?? 1"
       :disabled="disabled" aria-label="识别间隔秒数" @change="inline(node.i,'poll_interval_seconds',$event,true)" /><span>秒</span>
     </label>
     <label v-if="imageAction(node.s.action) || ['wait_text','click_text'].includes(node.s.action)">步骤超时
      <input type="number" min="0.1" max="14400" step="0.1" :value="node.s.timeout_seconds ?? 20"
       :disabled="disabled" aria-label="步骤超时秒数" @change="inline(node.i,'timeout_seconds',$event,true)" /><span>秒</span>
     </label>
     <label v-if="node.s.action==='launch_app'">启动后等待
      <input type="number" min="0" max="300" step="0.1" :value="node.s.wait_seconds ?? 0"
       :disabled="disabled" aria-label="启动后等待秒数" @change="inline(node.i,'wait_seconds',$event,true)" /><span>秒</span>
     </label>
     <small v-if="!['wait','tap','launch_app','wait_text','click_text'].includes(node.s.action) && !imageAction(node.s.action)">{{ summary(node.s) }}</small>
    </div>
    <small v-if="Array.isArray(node.s.image_branches)">图片匹配分支 {{ node.s.image_branches.length }}（参数内编辑）</small>
    <small v-if="obj(node.s.failure_retry).enabled">失败恢复：最多 {{ obj(node.s.failure_retry).max_retries ?? '未设置' }} 次</small>
    <small v-if="failedStep===node.i+1" class="node-error">实际失败步骤</small>
    <button v-if="obj(node.s.skip_condition).enabled===true" class="skip-port" :disabled="disabled" :aria-label="'拖动第'+(node.i+1)+'步条件出口'" @pointerdown.stop="beginLink($event,node.i)" @pointerup.stop="finishLink">{{ obj(node.s.skip_condition).mode === 'recognition_failure' ? '识别失败跳过' : obj(node.s.skip_condition).mode === 'execution_failure' ? '执行失败跳过' : '条件满足' }} ◉</button>
    <small v-else-if="node.s.action !== 'start'">{{ node.i+1===steps.length?'正常 → 流程结束':'正常 → 下一步' }}</small>
   </article>
  </div>
  </div>
  <p v-if="!steps.length" class="empty-graph">还没有步骤，请添加节点。</p>
 </div>
 <WorkflowMiniMap v-if="steps.length" v-show="active !== false" :nodes="nodes" :selected="selected" :world-width="extent.width" :world-height="extent.height" :viewport="visibleWorld" @navigate="navigate" />
 <Teleport to="body"><div v-if="menu" class="graph-menu" role="menu" :style="{left:menu.x+'px',top:menu.y+'px'}" @contextmenu.prevent>
  <template v-if="menu.index===undefined">
   <strong>创建节点（追加到流程末尾）</strong>
   <input v-model="search" placeholder="搜索节点" aria-label="搜索节点" />
   <select v-model="category" aria-label="节点分类">
    <option v-for="c in ['全部','识别','操作','其他']" :key="c">{{c}}</option>
   </select>
   <button v-for="[action,label] in choices" :key="action" :disabled="disabled"
    @click="create(action)">{{label}}</button>
   <small v-if="!choices.length">无匹配节点</small>
  </template>
  <template v-else>
   <button @click="details(menu.index)">编辑详细参数</button>
   <button v-if="isConfigurableWorkflowAction(steps[menu.index]?.action ?? '')" :disabled="disabled" @click="operation('copy')">复制节点到末尾</button>
   <button :disabled="disabled || !canDebug" :title="canDebug?'':'需保存脚本并满足调试条件'"
    @click="operation('debug')">单步调试</button>
   <button v-if="isConfigurableWorkflowAction(steps[menu.index]?.action ?? '')" :disabled="disabled" @click="operation('delete')">删除节点</button>
  </template>
 </div></Teleport>
 <Teleport defer :to="footerTarget || 'body'" :disabled="!footerTarget">
  <footer v-show="active !== false" class="workflow-footer"><small v-if="linking!==undefined" role="status">拖到后续节点以修改条件跳转</small>
    <ElButton size="small" aria-label="缩小画布" @click="scale(-.1)">−</ElButton><span>{{ Math.round(zoom*100) }}%</span><ElButton size="small" aria-label="放大画布" @click="scale(.1)">＋</ElButton><ElButton size="small" @click="fit">适应画布</ElButton>
  </footer>
 </Teleport>
</section>
</template>
<style scoped>
.workflow-canvas { position:relative; min-width:0; display:flex; flex-direction:column; height:100%; }
.workflow-canvas>header { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); }
.workflow-footer { display:flex; align-items:center; gap:8px; min-height:42px; width:100%; padding:0; flex-shrink:0; }
.graph-viewport { position:relative; overflow:auto; min-height:0; flex:1; background-color:var(--surface-soft); background-image:radial-gradient(var(--border-strong) 1px,transparent 1px); background-size:22px 22px; }
.graph-space { position:relative; min-width:100%; min-height:100%; }
.graph-world { position:absolute; transform-origin:0 0; }
.graph-edges { position:absolute; pointer-events:none; overflow:visible; color:var(--accent); }
.graph-edges text { fill:var(--muted); font-size:10px; }
.graph-node {
 position:absolute; box-sizing:border-box; min-height:52px; padding:10px 12px;
 border:1px solid var(--border-strong); border-radius:10px; background:var(--surface);
 display:grid; align-content:start; gap:6px; touch-action:none; user-select:none; cursor:grab;
 box-shadow:0 3px 12px #12345608;
}
.graph-node.selected { border-color:var(--accent); background:var(--accent-soft); }
.graph-node.node-start { justify-content:center; align-content:center; border-radius:18px; }
.graph-node.running { box-shadow:0 0 0 2px var(--accent); }.node-running { color:var(--accent); }
.graph-node.passed { border-color:var(--el-color-success); }
.graph-node.failed { box-shadow:0 0 0 2px var(--el-color-danger); }
.node-title { border:0; padding:0; background:none; color:var(--text); font-weight:600; text-align:left; cursor:grab; overflow-wrap:anywhere; align-self:start; }
small { color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
.skip-port { border:0; color:var(--accent); background:none; text-align:left; cursor:crosshair; touch-action:none; }
.node-error { color:var(--el-color-danger); }.empty-graph{padding:25px}
.workflow-footer small { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.inline-fields{display:grid;gap:4px}
.inline-fields label{display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}
.inline-fields input{
 width:0; flex:1; min-width:0; box-sizing:border-box; background:var(--surface); color:var(--text);
 border:1px solid var(--border); border-radius:4px; padding:4px; touch-action:auto;
}
.inline-fields label span { flex:none; color:var(--muted); }.node-image-action { width:100%; border:0; padding:0; background:none; cursor:pointer; }.node-image-action:focus-visible { outline:2px solid var(--accent); border-radius:6px; }
.graph-menu{
 position:fixed; z-index:3000; width:220px; max-height:320px; overflow:auto; display:grid;
 gap:5px; padding:10px; background:var(--surface); color:var(--text);
 border:1px solid var(--border); border-radius:8px; box-shadow:0 8px 24px #12345630;
}
.graph-menu button,.graph-menu input{
 padding:7px; text-align:left; background:var(--surface); color:var(--text);
 border:1px solid var(--border); border-radius:4px;
}
.graph-menu button:hover{background:var(--accent-soft)}
.graph-menu strong{font-size:12px}
</style>
