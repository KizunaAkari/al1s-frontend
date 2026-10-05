<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { previewFailureScreenshot, type FailureDetail } from '../../shared/api/task-details'
import { rectangleStyle, sameImageSize } from './failure-image-geometry'
const props = defineProps<{ task: string; attempt: string; detail: FailureDetail }>()
const url = ref(''), error = ref('')
const width = ref(0), height = ref(0)
const showMarkers = ref(true)
const geometry = computed(() => props.detail.recognition_geometry)
const template = computed(() => rectangleStyle(geometry.value?.template_rect, geometry.value?.basis_size, width.value, height.value))
const search = computed(() => rectangleStyle(geometry.value?.search_region, geometry.value?.basis_size, width.value, height.value))
const match = computed(() => rectangleStyle(geometry.value?.match_rect, geometry.value?.match_size, width.value, height.value))
const mismatch = computed(() => width.value > 0 && !!geometry.value && (
  (geometry.value.template_rect && !sameImageSize(geometry.value.basis_size, width.value, height.value)) ||
  (geometry.value.match_rect && !sameImageSize(geometry.value.match_size, width.value, height.value))
))
const offset = computed(() => {
  const configured = geometry.value?.template_rect, actual = geometry.value?.match_rect
  return template.value && match.value && configured && actual
    ? `候选相对选区偏移：X ${actual.x - configured.x} px，Y ${actual.y - configured.y} px` : ''
})
let generation = 0
function clear() { if (url.value) URL.revokeObjectURL(url.value); url.value = '' }
watch(() => [props.task, props.attempt, props.detail.screenshot_id], async () => {
  const current = ++generation
  clear(); error.value = ''; width.value = 0; height.value = 0
  if (!props.detail.screenshot_id) return
  try {
    const body = await previewFailureScreenshot(props.task, props.attempt, props.detail.screenshot_id)
    if (current === generation) url.value = URL.createObjectURL(new Blob([body], { type: 'image/png' }))
  } catch { if (current === generation) error.value = '截图尚未就绪或不可用，可稍后刷新。' }
}, { immediate: true })
function loaded(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.getAttribute('src') !== url.value) return
  width.value = image.naturalWidth; height.value = image.naturalHeight
}
const marker = computed(() => {
  const { click_x: x, click_y: y } = props.detail
  if (x == null || y == null || !width.value || x < 0 || y < 0 || x > width.value || y > height.value) return null
  return { left: `${100 * x / width.value}%`, top: `${100 * y / height.value}%` }
})
onBeforeUnmount(() => { ++generation; clear() })
</script>
<template>
  <p v-if="error">{{ error }}</p>
  <section v-if="url" class="failure-preview">
    <div v-if="geometry" class="geometry-legend">
      <label><input v-model="showMarkers" type="checkbox" />显示标记</label>
      <span v-if="geometry.template_rect" class="template-label">配置选区</span>
      <span class="search-label">{{ geometry.search_region ? '搜索范围' : '全图搜索' }}</span>
      <span v-if="geometry.match_rect" class="match-label">失败截图复核候选</span>
    </div>
    <div class="failure-image">
      <img :src="url" alt="失败现场原图预览" @load="loaded" />
      <template v-if="showMarkers">
        <span v-if="template" data-template-rect class="geometry-box template-box" :style="template" aria-label="配置选区" />
        <span v-if="search" data-search-rect class="geometry-box search-box" :style="search" aria-label="搜索范围" />
        <span v-if="match" data-match-rect class="geometry-box match-box" :style="match" aria-label="失败截图复核候选位置" />
        <span v-if="marker" class="click-marker" :style="marker" aria-label="点击位置">＋</span>
      </template>
    </div>
    <template v-if="geometry">
      <p v-if="mismatch" class="geometry-note">截图与坐标基准尺寸不一致，相关标记未叠加。</p>
      <p v-if="!geometry.match_rect" class="geometry-note">未取得失败截图的候选位置，无法确认是否偏移。</p>
      <p v-if="geometry.match_score != null" class="geometry-note">失败截图复核分数 {{ geometry.match_score }}<template v-if="geometry.match_threshold != null"> / 阈值 {{ geometry.match_threshold }}</template> · {{ geometry.match_passed ? '通过阈值' : '未通过阈值' }}</p>
      <p v-if="offset" class="geometry-note">{{ offset }}</p>
    </template>
  </section>
</template>
<style scoped>
.failure-image { position: relative; display: inline-block; max-width: 100%; }
img { display: block; max-width: 100%; height: auto; }
.click-marker { position: absolute; transform: translate(-50%, -50%); color: #ff1717; background: #fff; border: 2px solid #ff1717; border-radius: 50%; line-height: 20px; pointer-events: none; }
.geometry-box { position:absolute; box-sizing:border-box; pointer-events:none; border:2px solid; }
.template-box { border-color:var(--el-color-primary); background:var(--el-color-primary-light-9); opacity:.6; }
.search-box { border:2px dashed #8c5fc9; }.match-box { border-color:#e69116; background:rgba(230,145,22,.12); }
.geometry-legend { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:8px 0; font-size:12px; }
.geometry-legend label { display:flex; align-items:center; gap:4px; }.template-label { color:var(--el-color-primary); }
.search-label { color:#8c5fc9; }.match-label { color:#a36a13; }.geometry-note { font-size:12px; color:var(--el-text-color-secondary); margin:6px 0; overflow-wrap:anywhere; }
</style>
