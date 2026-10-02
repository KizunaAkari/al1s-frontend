<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ElButton } from 'element-plus'
import type { ImageUse } from './image-binding'
import { regionPickerKey } from './region-picker-context'

const props = defineProps<{ use: ImageUse; title: string; bound?: unknown; branchIndex?: number }>()
const picker = inject(regionPickerKey, undefined)
const id = `region-${useId().replace(/[^a-z0-9-]/gi, '-')}`
const active = computed(() => picker?.active.value?.target === `#${id}`)
const area = computed(() => picker?.selection?.({ use: props.use, title: props.title, target: `#${id}`, branchIndex: props.branchIndex }))
const screenshot = computed(() => picker?.screenshot?.value)
const previewUrl = ref('')
const savedUrl = ref<string>()
const ocrBusy = ref(false), ocrError = ref(''), ocrTexts = ref<string[]>()
const isOcr = computed(() => ['assertion_ocr', 'ocr_region', 'region'].includes(props.use))
let ocrGeneration = 0
async function testOcr() {
  if (!picker?.testOcr || !resource.value || ocrBusy.value) return
  const generation = ++ocrGeneration
  ocrBusy.value = true; ocrError.value = ''; ocrTexts.value = undefined
  try {
    const texts = await picker.testOcr(resource.value)
    if (generation === ocrGeneration) ocrTexts.value = texts
  } catch (e) { if (generation === ocrGeneration) ocrError.value = e instanceof Error ? e.message : 'OCR 测试失败' }
  finally { if (generation === ocrGeneration) ocrBusy.value = false }
}
const resource = computed(() => picker?.image?.({ use: props.use, title: props.title, target: `#${id}`, branchIndex: props.branchIndex }))
let previewGeneration = 0
watch(resource, async value => {
  ocrGeneration++; ocrBusy.value = false; ocrTexts.value = undefined; ocrError.value = ''
  const generation = ++previewGeneration
  savedUrl.value = undefined
  const url = await picker?.loadPreview?.(value)
  if (generation === previewGeneration) savedUrl.value = url
}, { immediate: true })
onBeforeUnmount(() => { previewGeneration++; ocrGeneration++ })
const previewArea = computed(() => {
  const rect = area.value, size = screenshot.value
  return rect && size && rect.x + rect.width <= size.width && rect.y + rect.height <= size.height ? rect : undefined
})
watch(screenshot, value => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = value ? URL.createObjectURL(value.blob) : ''
}, { immediate: true })
watch(() => props.use, () => { if (active.value && picker) picker.active.value = undefined })
onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value) })
function select(fresh: boolean) {
  picker?.select({ use: props.use, title: props.title, target: `#${id}`, branchIndex: props.branchIndex }, fresh)
}
onBeforeUnmount(() => { if (active.value && picker) picker.active.value = undefined })
</script>

<template>
  <div v-if="picker" class="region-field" :class="{ active }" :aria-label="title">
    <div class="region-summary"><span>{{ title }}</span><small :class="{ bound: !!bound }">{{ bound ? '已设置' : '未设置' }}</small></div>
    <div v-if="area || savedUrl" class="region-preview">
      <img v-if="savedUrl" :src="savedUrl" :alt="`${title}已保存选区`" />
      <svg v-else-if="area && previewArea && previewUrl && screenshot" :viewBox="`${area.x} ${area.y} ${area.width} ${area.height}`" role="img" :aria-label="`${title}当前截图区域预览`">
        <defs><clipPath :id="`${id}-clip`"><rect :x="area.x" :y="area.y" :width="area.width" :height="area.height" /></clipPath></defs>
        <image :href="previewUrl" :width="screenshot.width" :height="screenshot.height" :clip-path="`url(#${id}-clip)`" />
      </svg>
    </div>
    <div class="region-buttons">
      <ElButton size="small" :disabled="picker.disabled.value" @click="select(true)">截图选区</ElButton>
      <ElButton v-if="isOcr" size="small" :loading="ocrBusy" :disabled="picker.disabled.value || !resource || !picker.testOcr" @click="testOcr">测试 OCR</ElButton>
    </div>
    <small v-if="active" class="region-guidance" role="status">{{ picker.disabled.value ? '正在更新选区…' : area ? '已选择此区域，可在左侧继续调整。' : '可以开始选区，请在左侧截图上拖动框选。' }}</small>
    <p v-if="ocrError" class="ocr-error" role="alert">{{ ocrError }}</p>
    <div v-if="ocrTexts" class="ocr-result" role="status"><strong>OCR 识别结果</strong><p>{{ ocrTexts.length ? ocrTexts.join('\n') : '未识别到文字，请调整选区后重试。' }}</p></div>
    <div :id="id" />
  </div>
</template>

<style scoped>
.region-field { display:grid; gap:9px; padding:12px; border:1px dashed var(--border-strong); border-radius:8px; background:var(--surface); min-width:0; grid-column:1/-1; }
.region-field.active { border-color:var(--accent); background:var(--accent-soft); }
.region-summary { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; }
.region-summary small { color:var(--muted); font-size:11px; }.region-summary small.bound { color:var(--el-color-success); }
.region-preview { display:grid; gap:6px; min-width:0; }.region-preview img { display:block; width:100%; height:72px; object-fit:contain; background:var(--surface-soft); border-radius:5px; }.region-preview svg { width:100%; height:72px; background:var(--surface-soft); border-radius:5px; }.region-preview small { color:var(--muted); font-size:11px; }
.region-buttons { display:flex; flex-wrap:wrap; gap:6px; }.region-buttons :deep(.el-button) { margin:0; }
.ocr-result { padding:10px; background:var(--surface-soft); border-radius:6px; font-size:13px; }.ocr-result p { white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0 0; }.ocr-error { color:var(--el-color-danger); font-size:12px; }
.region-guidance { color:var(--accent); font-size:12px; line-height:1.5; }
</style>
