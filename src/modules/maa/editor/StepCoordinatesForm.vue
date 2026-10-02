<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepRegionField from './StepRegionField.vue'
import { computed } from 'vue'
import { ElInputNumber } from 'element-plus'
import { isCoreWorkflowStep, type WorkflowStep } from '../../../shared/api/maa-script-contract'
const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
type CoordinateKey = 'x' | 'y' | 'x1' | 'y1' | 'x2' | 'y2' | 'duration_ms'
const coordinateStep = computed(() => isCoreWorkflowStep(props.step) &&
  (props.step.action === 'tap' || props.step.action === 'swipe') ? props.step : undefined)
const keys = computed<CoordinateKey[]>(() => coordinateStep.value?.action === 'tap'
  ? ['x', 'y'] : ['x1', 'y1', 'x2', 'y2'])
function update(key: CoordinateKey, value: number | undefined | null) {
  if (coordinateStep.value && value != null) emit('change', { ...coordinateStep.value, [key]: value })
}
</script>
<template>
  <section v-if="coordinateStep" aria-label="原图坐标参数">
    
    <StepRegionField v-if="coordinateStep.action === 'swipe'" use="screen" title="坐标基准" />
    <label v-for="key in keys" :key="key">{{ key }} <HelpHint v-if="key === keys[0]" subject="原图坐标">坐标使用手机原图像素。</HelpHint>
      <ElInputNumber :model-value="Number(coordinateStep[key] ?? 0)" :min="0" :max="8191" :precision="0"
        :aria-label="key" @change="value => update(key, value)" />
    </label>
    <label v-if="coordinateStep.action === 'swipe'">滑动时长（毫秒）
      <ElInputNumber :model-value="Number(coordinateStep.duration_ms ?? 300)" :min="1" :max="60000" :precision="0"
        aria-label="滑动时长" @change="value => update('duration_ms', value)" />
    </label>
  </section>
</template>
<style scoped>
section { display: grid; gap: 12px; } label { display: flex; align-items: center; gap: 8px; }
</style>
