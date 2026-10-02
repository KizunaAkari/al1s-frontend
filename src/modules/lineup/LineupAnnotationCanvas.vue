<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  boxFromPoints,
  boxesEqual,
  clampBox,
  moveBox,
  nudgeBox,
  pointFromClient,
  type AnnotationBox,
  type AnnotationPoint,
} from './annotation-geometry'

type AnnotationSide = 'attack' | 'defense'
type AnnotationKind = 'portrait' | 'name'

type AnnotationRegion = {
  side: AnnotationSide
  index: number
  kind: AnnotationKind
  box: AnnotationBox
}

const props = withDefaults(defineProps<{
  imageUrl: string
  width: number
  height: number
  regions: AnnotationRegion[]
  activeKey: string | null
  drawing: boolean
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  select: [key: string]
  draw: [box: AnnotationBox]
  change: [key: string, box: AnnotationBox]
  remove: [key: string]
}>()

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

const root = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const zoom = ref(1)
const userAdjustedZoom = ref(false)
const fullscreen = ref(false)
let resizeObserver: ResizeObserver | null = null

type DrawSession = {
  pointerId: number
  start: AnnotationPoint
  current: AnnotationPoint
}

type MoveSession = {
  pointerId: number
  key: string
  start: AnnotationPoint
  current: AnnotationPoint
  box: AnnotationBox
}

const drawSession = ref<DrawSession | null>(null)
const moveSession = ref<MoveSession | null>(null)

const imageWidth = computed(() => dimension(props.width))
const imageHeight = computed(() => dimension(props.height))
const stageStyle = computed(() => ({
  width: `${imageWidth.value * zoom.value}px`,
  height: `${imageHeight.value * zoom.value}px`,
}))
const viewBox = computed(() => `0 0 ${imageWidth.value} ${imageHeight.value}`)
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const drawPreview = computed(() => {
  const current = drawSession.value
  return current ? boxFromPoints(current.start, current.current, imageWidth.value, imageHeight.value) : null
})
const movePreview = computed(() => {
  const current = moveSession.value
  if (!current) return null
  const next = moveBox(current.box, current.current.x - current.start.x, current.current.y - current.start.y, imageWidth.value, imageHeight.value)
  return boxesEqual(current.box, next) ? null : next
})

function dimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1
}

function regionKey(region: AnnotationRegion): string {
  return `${region.side}-${region.index}-${region.kind}`
}

function regionLabel(region: AnnotationRegion): string {
  return `${region.side === 'attack' ? '攻击方' : '防守方'}第${region.index + 1}格${region.kind === 'portrait' ? '头像' : '名字'}`
}

function regionBox(region: AnnotationRegion): AnnotationBox {
  return clampBox(region.box, imageWidth.value, imageHeight.value)
}

function pointForEvent(event: PointerEvent): AnnotationPoint | null {
  const bounds = stage.value?.getBoundingClientRect()
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  return pointFromClient(event.clientX, event.clientY, bounds, imageWidth.value, imageHeight.value)
}

function pointerIdFor(event: PointerEvent): number {
  return Number.isFinite(event.pointerId) ? event.pointerId : 0
}

function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget as SVGElement | null
  if (!target?.setPointerCapture) return
  try {
    target.setPointerCapture(pointerIdFor(event))
  } catch {
    // Pointer capture is optional in the happy-dom test environment.
  }
}

function releasePointer(event: PointerEvent): void {
  const target = event.currentTarget as SVGElement | null
  if (!target?.releasePointerCapture) return
  try {
    target.releasePointerCapture(pointerIdFor(event))
  } catch {
    // The browser may release capture before pointerup reaches this handler.
  }
}

function regionKeyFromTarget(event: PointerEvent): string | null {
  const target = event.target as Element | null
  return target?.closest('[data-region-key]')?.getAttribute('data-region-key') ?? null
}

function beginPointer(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  const point = pointForEvent(event)
  if (!point) return
  const pointerId = pointerIdFor(event)

  if (props.drawing) {
    moveSession.value = null
    drawSession.value = { pointerId, start: point, current: point }
    capturePointer(event)
    event.preventDefault()
    return
  }

  const key = regionKeyFromTarget(event)
  if (!key) return
  const region = props.regions.find(item => regionKey(item) === key)
  if (!region) return
  emit('select', key)
  moveSession.value = {
    pointerId,
    key,
    start: point,
    current: point,
    box: regionBox(region),
  }
  drawSession.value = null
  capturePointer(event)
  event.preventDefault()
}

function updatePointer(event: PointerEvent): void {
  const point = pointForEvent(event)
  if (!point) return
  const pointerId = pointerIdFor(event)
  if (drawSession.value?.pointerId === pointerId) {
    drawSession.value.current = point
    event.preventDefault()
  } else if (moveSession.value?.pointerId === pointerId) {
    moveSession.value.current = point
    event.preventDefault()
  }
}

function finishPointer(event: PointerEvent): void {
  const pointerId = pointerIdFor(event)
  if (drawSession.value?.pointerId === pointerId) {
    const current = drawSession.value
    const point = pointForEvent(event)
    if (point) current.current = point
    const box = boxFromPoints(current.start, current.current, imageWidth.value, imageHeight.value)
    drawSession.value = null
    releasePointer(event)
    if (box) emit('draw', box)
    return
  }

  if (moveSession.value?.pointerId === pointerId) {
    const current = moveSession.value
    const point = pointForEvent(event)
    if (point) current.current = point
    const next = moveBox(
      current.box,
      current.current.x - current.start.x,
      current.current.y - current.start.y,
      imageWidth.value,
      imageHeight.value,
    )
    moveSession.value = null
    releasePointer(event)
    if (!boxesEqual(current.box, next)) emit('change', current.key, next)
  }
}

function cancelPointer(event: PointerEvent): void {
  if (drawSession.value?.pointerId === pointerIdFor(event)) drawSession.value = null
  if (moveSession.value?.pointerId === pointerIdFor(event)) moveSession.value = null
  releasePointer(event)
}

function cancelPointerDrafts(): void {
  drawSession.value = null
  moveSession.value = null
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select, [contenteditable="true"]')
    || target.isContentEditable
  )
}

function isToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button') !== null
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled || isTextEntryTarget(event.target) || isToolbarTarget(event.target)) return

  const target = event.target as Element | null
  const targetKey = target?.closest('[data-region-key]')?.getAttribute('data-region-key')
  if ((event.key === 'Enter' || event.key === ' ') && targetKey) {
    event.preventDefault()
    emit('select', targetKey)
    return
  }

  const key = props.activeKey
  if (!key) return
  const region = props.regions.find(item => regionKey(item) === key)
  if (!region) return

  const delta = event.key === 'ArrowLeft' ? [-1, 0]
    : event.key === 'ArrowRight' ? [1, 0]
      : event.key === 'ArrowUp' ? [0, -1]
        : event.key === 'ArrowDown' ? [0, 1]
          : null
  if (delta) {
    event.preventDefault()
    const next = nudgeBox(regionBox(region), delta[0], delta[1], imageWidth.value, imageHeight.value)
    if (!boxesEqual(regionBox(region), next)) emit('change', key, next)
  } else if (event.key === 'Delete') {
    event.preventDefault()
    emit('remove', key)
  }
}

function setZoom(value: number): void {
  zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))))
}

function zoomOut(): void {
  userAdjustedZoom.value = true
  setZoom(zoom.value - 0.1)
}

function zoomIn(): void {
  userAdjustedZoom.value = true
  setZoom(zoom.value + 0.1)
}

function fitToViewport(manual = false): void {
  if (manual) userAdjustedZoom.value = true
  const availableWidth = viewport.value?.clientWidth || root.value?.clientWidth || imageWidth.value
  const availableHeight = viewport.value?.clientHeight || imageHeight.value
  const widthScale = availableWidth / imageWidth.value
  const heightScale = availableHeight / imageHeight.value
  const fit = Math.min(widthScale, heightScale)
  setZoom(Number.isFinite(fit) && fit > 0 ? fit : 1)
}

function manualFit(): void {
  fitToViewport(true)
}

function onImageLoad(): void {
  if (!userAdjustedZoom.value) fitToViewport()
}

function scrollActiveRegionIntoView(): void {
  if (!props.activeKey || !root.value) return
  const regions = root.value.querySelectorAll<SVGRectElement>('[data-region-key]')
  const region = Array.from(regions).find(item => item.getAttribute('data-region-key') === props.activeKey)
  if (region && typeof region.scrollIntoView === 'function') {
    region.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

function removeSelected(): void {
  if (!props.disabled && props.activeKey) emit('remove', props.activeKey)
}

function syncFullscreen(): void {
  fullscreen.value = document.fullscreenElement === root.value
}

async function toggleFullscreen(): Promise<void> {
  if (props.disabled) return
  if (document.fullscreenElement) {
    if (typeof document.exitFullscreen === 'function') await document.exitFullscreen()
    return
  }
  const element = root.value
  if (element && typeof element.requestFullscreen === 'function') {
    try {
      await element.requestFullscreen()
    } catch {
      // Fullscreen can be denied by browser policy; the editor remains usable.
    }
  }
}

onMounted(() => document.addEventListener('fullscreenchange', syncFullscreen))
onMounted(() => {
  fitToViewport()
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    resizeObserver = new ResizeObserver(() => {
      if (!userAdjustedZoom.value) fitToViewport()
    })
    resizeObserver.observe(viewport.value)
  }
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(() => [props.imageUrl, props.width, props.height, props.disabled], () => {
  cancelPointerDrafts()
  if (!props.disabled && !userAdjustedZoom.value) fitToViewport()
})

watch(() => props.activeKey, () => {
  void nextTick().then(scrollActiveRegionIntoView)
}, { immediate: true })
</script>

<template>
  <section
    ref="root"
    class="lineup-annotation-editor"
    :class="{ 'is-disabled': disabled, 'is-drawing': drawing }"
    :aria-disabled="disabled"
    aria-label="原图区域编辑器"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <div class="annotation-toolbar" role="toolbar" aria-label="原图工具">
      <span class="annotation-zoom" aria-live="polite">缩放 {{ zoomLabel }}</span>
      <div class="annotation-tools">
        <button type="button" class="annotation-tool" :disabled="disabled" aria-label="缩小" title="缩小" @click="zoomOut">−</button>
        <button type="button" class="annotation-tool" :disabled="disabled" aria-label="放大" title="放大" @click="zoomIn">＋</button>
        <button type="button" class="annotation-tool annotation-tool--text" :disabled="disabled" aria-label="适应视图" title="适应视图" @click="manualFit">适应</button>
        <button type="button" class="annotation-tool annotation-tool--text" :disabled="disabled" :aria-label="fullscreen ? '退出全屏' : '全屏'" :title="fullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</button>
        <button type="button" class="annotation-tool annotation-tool--delete" :disabled="disabled || !activeKey" aria-label="删除选中区域" title="删除选中区域" @click="removeSelected">删除选中</button>
      </div>
    </div>
    <p class="annotation-hint" role="status" aria-live="polite">
      {{ disabled ? '当前不可编辑' : drawing ? '绘制模式：在原图上拖动框选区域' : '选择模式：点击区域选中，拖动区域移动；方向键可微调' }}
    </p>
    <div ref="viewport" class="annotation-viewport">
      <div ref="stage" data-annotation-stage class="annotation-stage" :style="stageStyle">
        <img :src="imageUrl" alt="原图" class="annotation-image" draggable="false" @load="onImageLoad" />
        <svg
          class="annotation-overlay"
          :viewBox="viewBox"
          preserveAspectRatio="none"
          role="group"
          aria-label="原图标注区域"
          @pointerdown="beginPointer"
          @pointermove="updatePointer"
          @pointerup="finishPointer"
          @pointercancel="cancelPointer"
        >
          <rect
            v-for="region in regions"
            :key="regionKey(region)"
            :data-region-key="regionKey(region)"
            class="annotation-region"
            :class="{ selected: activeKey === regionKey(region) }"
            :x="regionBox(region)[0]"
            :y="regionBox(region)[1]"
            :width="regionBox(region)[2]"
            :height="regionBox(region)[3]"
            :aria-label="regionLabel(region)"
            :aria-selected="activeKey === regionKey(region)"
            role="button"
            tabindex="0"
          />
          <rect
            v-if="drawPreview"
            class="annotation-region preview"
            :x="drawPreview[0]"
            :y="drawPreview[1]"
            :width="drawPreview[2]"
            :height="drawPreview[3]"
          />
          <rect
            v-if="movePreview"
            class="annotation-region preview moving"
            :x="movePreview[0]"
            :y="movePreview[1]"
            :width="movePreview[2]"
            :height="movePreview[3]"
          />
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lineup-annotation-editor {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--lineup-border, var(--border, #d9e1ee));
  border-radius: 12px;
  background: var(--lineup-card, var(--surface, #fff));
  color: var(--text, #172139);
  outline: none;
}

.lineup-annotation-editor:focus-visible {
  outline: 2px solid var(--lineup-accent, var(--accent, #2f76da));
  outline-offset: 2px;
}

.annotation-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.annotation-zoom,
.annotation-hint {
  color: var(--muted, #667085);
  font-size: 12px;
  line-height: 1.45;
}

.annotation-hint {
  margin: 0;
}

.annotation-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.annotation-tool {
  min-width: 30px;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--lineup-border, var(--border, #d9e1ee));
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text, #172139);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.annotation-tool--text {
  min-width: 46px;
}

.annotation-tool--delete {
  color: var(--danger, #c43d50);
}

.annotation-tool:hover:not(:disabled),
.annotation-tool:focus-visible:not(:disabled) {
  border-color: var(--lineup-accent, var(--accent, #2f76da));
}

.annotation-tool:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.annotation-viewport {
  width: 100%;
  max-height: min(72vh, 720px);
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--lineup-border, var(--border, #d9e1ee));
  border-radius: 8px;
  background: var(--surface-soft, #e8edf4);
}

.annotation-stage {
  position: relative;
  flex: 0 0 auto;
}

.annotation-image,
.annotation-overlay {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.annotation-image {
  object-fit: fill;
  user-select: none;
  pointer-events: none;
}

.annotation-overlay {
  overflow: visible;
  touch-action: none;
  user-select: none;
}

.annotation-region {
  fill: #2f76da2e;
  stroke: #2f76da;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  cursor: grab;
}

.annotation-region.selected {
  fill: #2f76da55;
  stroke: #1754aa;
  stroke-width: 3;
  outline: none;
}

.annotation-region.preview {
  fill: #20a4792b;
  stroke: #20a479;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.annotation-region.preview.moving {
  fill: #2f76da2e;
  stroke: #2f76da;
}

.lineup-annotation-editor.is-drawing .annotation-region {
  cursor: crosshair;
}

.lineup-annotation-editor.is-disabled .annotation-overlay {
  cursor: not-allowed;
}

.lineup-annotation-editor:fullscreen {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  padding: 16px;
  border: 0;
  border-radius: 0;
  background: var(--surface, #fff);
}

.lineup-annotation-editor:fullscreen .annotation-viewport {
  max-height: none;
  min-height: 0;
  height: 100%;
}

@media (max-width: 620px) {
  .annotation-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .annotation-tools {
    justify-content: flex-start;
  }
}
</style>
