<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElAlert } from 'element-plus'
import { apiClient } from '../../../shared/api/client'
import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
import type { NativeScreenshot } from './screenshot-connection'
import { bindImage, type BlobResource, type ImageUse, type Rect } from './image-binding'
import { adjustRegion, type RegionHandle } from './region-adjustment'
const props = withDefaults(defineProps<{ scriptId: string; document: ScriptDocument; index: number; branchIndex?: number;
  ruleIndex?: number; screenshot?: NativeScreenshot; disabled?: boolean; mode?: 'recognition' | 'rules' | 'popup'; controlsTarget?: string; selectedUse?: ImageUse; selectionTitle?: string; savedRect?: Rect; showControls?: boolean }>(), { showControls: true })
const emit = defineEmits<{ change: [doc: ScriptDocument]; busy: [value: boolean]; complete: []; editing: []; preview: [resource: BlobResource, blob: Blob] }>()
const image = ref<HTMLImageElement>(), url = ref(''), error = ref(''), busy = ref(false)
const rect = ref<Rect>({ x: 0, y: 0, width: 1, height: 1 })
const selectionReady = ref(false)
const displayedRect = computed(() => selectionReady.value ? rect.value : props.savedRect)
const displayedStyle = computed(() => {
  const area = displayedRect.value, size = props.screenshot
  if (!area || !size || area.x + area.width > size.width || area.y + area.height > size.height) return undefined
  return { left: `${area.x / size.width * 100}%`, top: `${area.y / size.height * 100}%`,
    width: `${area.width / size.width * 100}%`, height: `${area.height / size.height * 100}%` }
})
const isPoint = computed(() => props.selectedUse === 'point')
const use = ref<ImageUse | undefined>(props.selectedUse)
let anchor: { x: number; y: number } | undefined
let adjustment: { handle: RegionHandle; rect: Rect } | undefined
const handles: RegionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
watch([() => props.selectedUse, () => props.controlsTarget, () => props.index, () => props.ruleIndex, () => props.branchIndex], () => {
  use.value = props.selectedUse
  rect.value = props.savedRect ? { ...props.savedRect } : { x: 0, y: 0, width: 1, height: 1 }
  selectionReady.value = !!props.savedRect && props.showControls
  anchor = undefined
  adjustment = undefined
  error.value = ''
}, { immediate: true })
watch(() => props.showControls, value => {
  if (value && !selectionReady.value && props.savedRect) {
    rect.value = { ...props.savedRect }
    selectionReady.value = true
  }
})
watch(() => props.screenshot, value => {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = value ? URL.createObjectURL(value.blob) : ''
  rect.value = props.savedRect ? { ...props.savedRect } : { x: 0, y: 0, width: 1, height: 1 }
  selectionReady.value = false
  anchor = undefined
}, { immediate: true })
onBeforeUnmount(() => { if (url.value) URL.revokeObjectURL(url.value) })
function point(e: PointerEvent) {
  const bounds = image.value!.getBoundingClientRect(), size = props.screenshot!
  return { x: Math.max(0, Math.min(size.width - 1, Math.floor((e.clientX - bounds.left) * size.width / bounds.width))),
    y: Math.max(0, Math.min(size.height - 1, Math.floor((e.clientY - bounds.top) * size.height / bounds.height))) }
}
function down(e: PointerEvent) {
  if (!use.value || busy.value || props.disabled || !image.value || !props.screenshot) return
  adjustment = undefined
  anchor = point(e); image.value.setPointerCapture(e.pointerId)
}
function adjust(e: PointerEvent, handle: RegionHandle) {
  if (!displayedRect.value || !use.value || busy.value || props.disabled || !props.screenshot) return
  anchor = point(e)
  adjustment = { handle, rect: { ...displayedRect.value } }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('editing')
}
function move(e: PointerEvent) {
  if (!anchor || !image.value || !props.screenshot) return
  const end = point(e)
  rect.value = isPoint.value ? { ...end, width: 1, height: 1 } : adjustment ? adjustRegion(adjustment.rect, adjustment.handle, end.x - anchor.x, end.y - anchor.y, props.screenshot) : { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y),
    width: Math.abs(anchor.x - end.x) + 1, height: Math.abs(anchor.y - end.y) + 1 }
  selectionReady.value = true
}
function finish(e: PointerEvent) {
  if (!anchor) return
  move(e); anchor = undefined; adjustment = undefined
  void apply()
}
function nudge(e: KeyboardEvent) {
  if (!displayedRect.value || !props.screenshot || busy.value || props.disabled) return
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
  if (!delta) return
  e.preventDefault()
  rect.value = adjustRegion(displayedRect.value, 'move', delta[0]! * (e.shiftKey ? 10 : 1), delta[1]! * (e.shiftKey ? 10 : 1), props.screenshot)
  selectionReady.value = true
  emit('editing')
  void apply()
}
async function apply() {
  if (!use.value || !props.screenshot || !selectionReady.value || !image.value?.complete || busy.value || props.disabled) return
  error.value = ''; busy.value = true; emit('busy', true)
  const original = JSON.stringify(props.document), index = props.index, capture = props.screenshot, branchIndex = props.branchIndex, ruleIndex = props.ruleIndex
  const selectedUse = use.value, selection = { ...rect.value }
  try {
    const dummy: BlobResource = { $blob: '', sha256: '', size_bytes: 0, media_type: 'image/png' }
    bindImage(props.document, index, capture, selection, selectedUse, dummy, branchIndex, ruleIndex) // Validate before upload.
    let resource: BlobResource | undefined
    if (selectedUse !== 'point') {
      const canvas = document.createElement('canvas')
      canvas.width = selection.width; canvas.height = selection.height
      const context = canvas.getContext('2d')
      if (!context || !image.value.naturalWidth) throw new Error('截图未成功解码')
      context.drawImage(image.value, selection.x, selection.y, selection.width, selection.height, 0, 0, selection.width, selection.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片裁剪失败')), 'image/png'))
      const response = await apiClient.post<{ resource: BlobResource }>(`/maa/scripts/${props.scriptId}/images`, blob,
        { headers: { 'Content-Type': 'image/png' } })
      resource = response.data.resource
      emit('preview', resource, blob)
    }
    if (use.value !== selectedUse || props.screenshot !== capture || props.index !== index || props.branchIndex !== branchIndex || props.ruleIndex !== ruleIndex || JSON.stringify(props.document) !== original) {
      throw new Error('截图或步骤已变化，请重新绑定；未保存的上传资源会自动清理')
    }
    emit('change', bindImage(props.document, index, capture, selection, selectedUse, resource, branchIndex, ruleIndex))
    selectionReady.value = false
    emit('complete')
  } catch (e) { error.value = e instanceof Error ? e.message : '绑定失败，请重新操作' }
  finally { busy.value = false; emit('busy', false) }
}
</script>
<template>
  <section class="binding-panel" aria-label="截图标注与资源绑定">
    <div class="binding-heading"><h3>{{ selectionTitle ? `${isPoint ? '选取' : '框选'}${selectionTitle}` : '截图预览' }} </h3><small>{{ ruleIndex !== undefined ? `全局弹窗规则 ${ruleIndex + 1}` : branchIndex === undefined ? '主步骤' : `图片分支 ${branchIndex + 1}` }}</small></div>
    <p v-if="!screenshot" class="binding-empty">从手机实时画面触发截图后，在此框选区域。</p>
    <template v-else>
      <p v-if="selectedUse" class="binding-hint" role="status">{{ isPoint ? '请点击截图上的目标位置，右侧 X、Y 坐标会自动更新。' : '可以开始选区；拖动框选或调整边角，右侧会同步显示所选区域。' }}</p>
      <div class="image-box"><img ref="image" :src="url" alt="用于框选的原始截图" draggable="false" @pointerdown.prevent="down" @pointermove="move"
        @pointerup="finish" @pointercancel="anchor = undefined; adjustment = undefined" @error="error = '原图解码失败，请重新截图'" />
        <div v-if="displayedStyle" class="selection" :class="{ confirmed: !selectionReady, 'point-selection': isPoint }" :style="displayedStyle" tabindex="0" :aria-label="isPoint ? '点击位置：拖动移动，方向键微调' : '选区：拖动移动，方向键微调'"
          @keydown="nudge" @pointerdown.stop.prevent="adjust($event, 'move')" @pointermove.stop="move" @pointerup.stop="finish" @pointercancel="anchor = undefined; adjustment = undefined">
          <span v-for="handle in (isPoint ? [] : handles)" :key="handle" class="region-handle" :class="handle" :data-handle="handle"
            @pointerdown.stop.prevent="adjust($event, handle)" />
        </div>
      </div>

    </template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
  </section>
</template>
<style scoped>
.binding-panel { display:grid; gap:10px; padding:14px 16px; border:1px solid var(--border); border-radius:10px; background:var(--surface); }
.binding-heading { display:flex; align-items:baseline; gap:10px; }
.binding-heading h3 { margin:0; color:var(--text); font-size:15px; }
.binding-heading small,.binding-hint,.binding-empty,.binding-actions small { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
.binding-empty { padding:8px 0; }
.binding-hint { color:var(--accent); }
.image-box { position: relative; width: fit-content; max-width: 100%; margin-inline:auto; }
img { display: block; max-width: 100%; max-height: min(62dvh, 720px); touch-action: none; cursor: crosshair; }
.selection { position:absolute; border:1px solid #1684ff; background:transparent; box-sizing:border-box; cursor:move; touch-action:none; outline:none; }
.point-selection { width:16px !important; height:16px !important; transform:translate(-50%,-50%); border-radius:50%; border-color:#ff3c9e; }
.point-selection::before,.point-selection::after { content:''; position:absolute; background:#ff3c9e; pointer-events:none; }
.point-selection::before { width:22px; height:1px; left:-4px; top:7px; }
.point-selection::after { height:22px; width:1px; top:-4px; left:7px; }
.selection:focus-visible { border-color:#e040b6; }
.region-handle { opacity:0; position:absolute; width:6px; height:6px; background:#1684ff; border-radius:1px; transform:translate(-50%,-50%); }
.selection:hover .region-handle,.selection:focus-within .region-handle { opacity:1; }
.region-handle::after { content:''; position:absolute; inset:-5px; }
.nw,.n,.ne { top:0; }.sw,.s,.se { top:100%; }.w,.e { top:50%; }
.nw,.w,.sw { left:0; }.n,.s { left:50%; }.ne,.e,.se { left:100%; }
.nw,.se { cursor:nwse-resize; }.ne,.sw { cursor:nesw-resize; }.n,.s { cursor:ns-resize; }.w,.e { cursor:ew-resize; }
</style>
