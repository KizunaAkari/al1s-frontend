<script setup lang="ts">
import { computed } from 'vue'
import { ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()

const modes = ['until_image', 'after_image'] as const
type Mode = typeof modes[number]
type SwipeField = 'x1' | 'y1' | 'x2' | 'y2' | 'duration_ms'

const mode = computed(() => {
  const value = props.step.mode
  return typeof value === 'string' && value.length > 0 ? value : 'until_image'
})
const legacyMode = computed(() => !modes.includes(mode.value as Mode))
const swipe = computed<Record<string, unknown>>(() => {
  const value = props.step.swipe
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
})

function number(key: string) {
  const value = props.step[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function swipeNumber(key: SwipeField, fallback: number) {
  const value = swipe.value[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function updateField(key: string, value: unknown) {
  const next = { ...props.step }
  if (value === undefined || value === null) delete next[key]
  else next[key] = value
  emit('change', next)
}

function updateMode(value: unknown) {
  if (typeof value === 'string' && modes.includes(value as Mode)) updateField('mode', value)
}

function updateNumber(key: string, value: unknown, minimum: number, maximum: number) {
  if (value === undefined || value === null) {
    updateField(key, value)
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) return
  updateField(key, value)
}

function updateSwipe(key: SwipeField, value: unknown) {
  const minimum = key === 'duration_ms' ? 1 : 0
  const maximum = key === 'duration_ms' ? 60000 : 8191
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value < minimum || value > maximum) return
  const nextSwipe: Record<string, unknown> = {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    duration_ms: 350,
    ...swipe.value,
    [key]: value,
  }
  emit('change', { ...props.step, swipe: nextSwipe })
}
</script>

<template>
  <section v-if="step.action === 'smart_swipe'" class="smart-swipe-form" aria-label="智能滑动参数">
    <label>滑动模式
      <ElSelect :model-value="mode" aria-label="滑动模式" @change="updateMode">
        <ElOption label="持续滑动直到识别图片" value="until_image" />
        <ElOption label="识别图片后滑动" value="after_image" />
        <ElOption v-if="legacyMode" :label="`保留现有模式：${mode}`" :value="mode" disabled />
      </ElSelect>
    </label>

    <div class="swipe-fields">
      <label>起点 X
        <ElInputNumber :model-value="swipeNumber('x1', 0)" :min="0" :max="8191" :step="1" :precision="0"
          aria-label="x1" @change="value => updateSwipe('x1', value)" />
      </label>
      <label>起点 Y
        <ElInputNumber :model-value="swipeNumber('y1', 0)" :min="0" :max="8191" :step="1" :precision="0"
          aria-label="y1" @change="value => updateSwipe('y1', value)" />
      </label>
      <label>终点 X
        <ElInputNumber :model-value="swipeNumber('x2', 0)" :min="0" :max="8191" :step="1" :precision="0"
          aria-label="x2" @change="value => updateSwipe('x2', value)" />
      </label>
      <label>终点 Y
        <ElInputNumber :model-value="swipeNumber('y2', 0)" :min="0" :max="8191" :step="1" :precision="0"
          aria-label="y2" @change="value => updateSwipe('y2', value)" />
      </label>
      <label>滑动时长（毫秒）
        <ElInputNumber :model-value="swipeNumber('duration_ms', 350)" :min="1" :max="60000" :step="1" :precision="0"
          aria-label="滑动时长（毫秒）" @change="value => updateSwipe('duration_ms', value)" />
      </label>
    </div>

    <label>滑动后等待秒数
      <ElInputNumber :model-value="number('wait_after_swipe_seconds')" :min="0" :max="300" :step="0.1"
        aria-label="滑动后等待秒数" @change="value => updateNumber('wait_after_swipe_seconds', value, 0, 300)" />
    </label>
    <label v-if="mode === 'after_image'">识别后滑动秒数
      <ElInputNumber :model-value="number('swipe_for_seconds')" :min="0.1" :max="14400" :step="0.1"
        aria-label="识别后滑动秒数" @change="value => updateNumber('swipe_for_seconds', value, 0.1, 14400)" />
    </label>
  </section>
</template>

<style scoped>
.smart-swipe-form { display: grid; gap: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; }
.swipe-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
label { display: grid; gap: 6px; }
</style>
