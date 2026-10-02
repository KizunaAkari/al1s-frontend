<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  nodes: { i: number; x: number; y: number; width?: number; height?: number }[]
  selected: number
  worldWidth: number
  worldHeight: number
  viewport: { x: number; y: number; width: number; height: number }
}>()
const emit = defineEmits<{ navigate: [x: number, y: number] }>()
const map = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const position = ref<{ left: number; top: number }>()
let drag: { pointer: number; x: number; y: number; left: number; top: number } | undefined
let observer: ResizeObserver | undefined
const width = 208, height = 130
const sx = computed(() => width / Math.max(1, props.worldWidth))
const sy = computed(() => height / Math.max(1, props.worldHeight))
const frame = computed(() => ({
  left: Math.max(0, props.viewport.x * sx.value),
  top: Math.max(0, props.viewport.y * sy.value),
  width: Math.min(width, props.viewport.width * sx.value),
  height: Math.min(height, props.viewport.height * sy.value),
}))
function navigate(event: PointerEvent) {
  const rect = map.value?.getBoundingClientRect()
  if (!rect) return
  emit('navigate', Math.max(0, Math.min(props.worldWidth, (event.clientX - rect.left) / sx.value)),
    Math.max(0, Math.min(props.worldHeight, (event.clientY - rect.top) / sy.value)))
}
function start(event: PointerEvent) {
  if (event.button !== 0) return
  map.value?.setPointerCapture(event.pointerId)
  navigate(event)
}
function clamp(left: number, top: number) {
  const container = panel.value?.parentElement
  const element = panel.value
  if (!container || !element || !container.clientWidth || !container.clientHeight) return undefined
  return {
    left: Math.max(0, Math.min(left, container.clientWidth - element.offsetWidth)),
    top: Math.max(0, Math.min(top, container.clientHeight - element.offsetHeight)),
  }
}
function currentPosition() {
  const container = panel.value?.parentElement?.getBoundingClientRect()
  const element = panel.value?.getBoundingClientRect()
  return container && element ? { left: element.left - container.left, top: element.top - container.top } : undefined
}
function startDrag(event: PointerEvent) {
  if (event.button !== 0) return
  const origin = currentPosition()
  if (!origin) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, ...origin }
}
function moveDrag(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId) return
  const next = clamp(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
  if (next) position.value = next
}
function stopDrag() { drag = undefined }
function nudge(event: KeyboardEvent) {
  const dx = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0
  const dy = event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0
  if (!dx && !dy) return
  const origin = currentPosition()
  if (!origin) return
  event.preventDefault()
  const next = clamp(origin.left + dx, origin.top + dy)
  if (next) position.value = next
}
onMounted(() => {
  const container = panel.value?.parentElement
  if (!container) return
  observer = new ResizeObserver(() => {
    if (position.value) position.value = clamp(position.value.left, position.value.top) ?? position.value
  })
  observer.observe(container)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section ref="panel" class="workflow-minimap" aria-label="画布布局图"
    :style="position ? { left: `${position.left}px`, top: `${position.top}px`, right: 'auto', bottom: 'auto' } : undefined">
    <div class="map-drag-handle" role="button" tabindex="0" aria-label="拖动布局图"
      @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag"
      @lostpointercapture="stopDrag" @keydown="nudge"><strong>布局图</strong></div>
    <div ref="map" class="map-surface" role="button" tabindex="0" aria-label="点击布局图定位画布"
      @pointerdown="start" @pointermove="event => { if (event.buttons === 1) navigate(event) }"
      @keydown.enter.prevent="emit('navigate', worldWidth / 2, worldHeight / 2)">
      <div v-for="node in nodes" :key="node.i" class="map-node" :class="{ selected: node.i === selected }"
        :style="{ left: `${node.x * sx}px`, top: `${node.y * sy}px`, width: `${Math.max(5, (node.width ?? 216) * sx)}px`, height: `${Math.max(4, (node.height ?? 110) * sy)}px` }" />
      <div class="map-frame" :style="{ left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` }" />
    </div>
  </section>
</template>

<style scoped>
.workflow-minimap { position:absolute; right:14px; bottom:14px; z-index:16; width:224px; box-sizing:border-box; padding:7px; border:1px solid var(--border); border-radius:9px; background:var(--surface); box-shadow:0 5px 20px #12345624; }
.map-drag-handle { margin-bottom:5px; cursor:grab; touch-action:none; user-select:none; }
.map-drag-handle:active { cursor:grabbing; }
.map-drag-handle:focus-visible { outline:2px solid var(--accent); border-radius:3px; }
.workflow-minimap strong { display:block; color:var(--text); font-size:11px; }
.map-surface { position:relative; width:208px; height:130px; overflow:hidden; border:1px solid var(--border); border-radius:4px; background:var(--surface-soft); cursor:crosshair; touch-action:none; }
.map-node { position:absolute; box-sizing:border-box; border:1px solid var(--border-strong); border-radius:2px; background:var(--surface); pointer-events:none; }
.map-node.selected { background:var(--accent-soft); border-color:var(--accent); }
.map-frame { position:absolute; box-sizing:border-box; border:2px solid var(--accent); background:#2485ff16; pointer-events:none; }
</style>
