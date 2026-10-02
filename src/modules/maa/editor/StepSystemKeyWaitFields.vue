<script setup lang="ts">
import { ElInputNumber } from 'element-plus'
import StepPostWaitField from './StepPostWaitField.vue'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
function before(value: number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value))
    emit('change', { ...props.step, wait_before_execution_seconds: value })
}
</script>

<template>
  <div class="pair">
    <label class="pre-wait"><span>执行前等待（秒）</span><ElInputNumber :model-value="Number(step.wait_before_execution_seconds ?? 0)"
      :min="0" :max="14400" :step="0.1" aria-label="执行前等待秒数" @change="before" /></label>
    <StepPostWaitField :step="step" @change="value => emit('change', value)" />
  </div>
</template>

<style scoped>
.pre-wait { display: grid; gap: 6px; min-width: 0; align-content: start; }
.pre-wait > span { display: flex; align-items: center; min-height: 18px; }
.pre-wait :deep(.el-input-number) { width: 160px; max-width: 100%; }
</style>
