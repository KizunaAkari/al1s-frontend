<script setup lang="ts">
import { computed } from 'vue'
import { ElInputNumber } from 'element-plus'
import HelpHint from '../../../shared/ui/HelpHint.vue'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const seconds = computed(() => typeof props.step.wait_after_execution_seconds === 'number'
  ? props.step.wait_after_execution_seconds : 0)
function update(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  emit('change', { ...props.step, wait_after_execution_seconds: value })
}
</script>

<template>
  <label class="post-wait"><HelpHint label="执行后等待（秒）" subject="执行后等待" content="全部动作完成后等待；计入步骤超时。" />
    <ElInputNumber :model-value="seconds" :min="0" :max="14400" :step="0.1"
      aria-label="执行后等待秒数" @change="update" />
  </label>
</template>

<style scoped>
.post-wait { display:grid; gap:6px; min-width:0; align-content:start; }
.post-wait :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
