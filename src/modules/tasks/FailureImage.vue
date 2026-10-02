<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { previewFailureScreenshot, type FailureDetail } from '../../shared/api/task-details'
const props = defineProps<{ task: string; attempt: string; detail: FailureDetail }>()
const url = ref(''), error = ref('')
const width = ref(0), height = ref(0)
let generation = 0
function clear() { if (url.value) URL.revokeObjectURL(url.value); url.value = '' }
watch(() => [props.task, props.attempt, props.detail.screenshot_id], async () => {
  const current = ++generation
  clear(); error.value = ''; width.value = 0
  if (!props.detail.screenshot_id) return
  try {
    const body = await previewFailureScreenshot(props.task, props.attempt, props.detail.screenshot_id)
    if (current === generation) url.value = URL.createObjectURL(new Blob([body], { type: 'image/png' }))
  } catch { if (current === generation) error.value = '截图尚未就绪或不可用，可稍后刷新。' }
}, { immediate: true })
function loaded(event: Event) {
  const image = event.target as HTMLImageElement
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
  <div v-if="url" class="failure-image">
    <img :src="url" alt="失败现场原图预览" @load="loaded" />
    <span v-if="marker" class="click-marker" :style="marker" aria-label="点击位置">＋</span>
  </div>
</template>
<style scoped>
.failure-image { position: relative; display: inline-block; max-width: 100%; }
img { display: block; max-width: 100%; height: auto; }
.click-marker { position: absolute; transform: translate(-50%, -50%); color: #ff1717; background: #fff; border: 2px solid #ff1717; border-radius: 50%; line-height: 20px; pointer-events: none; }
</style>
