<script setup lang="ts">
import StepRegionField from './StepRegionField.vue'
import { computed } from 'vue'
import { ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
const props = defineProps<{ step: WorkflowStep; index: number; count: number }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const skip = computed(() => (props.step.skip_condition ?? {}) as Record<string, unknown>)
const failureSkip = computed(() => ['recognition_failure', 'execution_failure'].includes(String(skip.value.mode)))
const destinations = computed(() => Array.from({ length: Math.max(0, props.count - props.index - 1) },
  (_, i) => props.index + i + 2))
function update(patch: Record<string, unknown>) {
  emit('change', { ...props.step, skip_condition: { mode: 'numeric', operator: 'gt', value: 0, ...skip.value, ...patch } })
}
</script>
<template>
  <section class="skip-form">
    <header><strong>条件跳过</strong><ElSwitch :model-value="skip.enabled === true"
      :disabled="step.action === 'start'" aria-label="启用条件跳过" @change="value => update({ enabled: value })" /></header>
    <template v-if="skip.enabled === true">
      <label>判断方式<ElSelect :model-value="String(skip.mode ?? 'numeric')" aria-label="跳过判断方式" @change="value => update({ mode: value })">
        <ElOption label="出现指定图片" value="image" /><ElOption label="OCR 数值比较" value="numeric" />
        <ElOption label="识别失败时跳过" value="recognition_failure" />
        <ElOption label="执行失败时跳过" value="execution_failure" />
      </ElSelect></label>
      <StepRegionField v-if="skip.mode === 'image'" use="skip" title="跳过条件图片" :bound="skip.preview_base64" />
      <StepRegionField v-else-if="!failureSkip" use="region" title="数值识别区域" :bound="skip.region" />
      <p v-if="failureSkip" class="failure-help">{{ skip.mode === 'recognition_failure' ? '识别不到目标或断言未通过时跳过。' : '点击、滑动等动作执行失败时跳过。' }}若启用失败重试，先重试，仍属于此类失败再跳过。</p>
      <div v-if="skip.mode !== 'image' && !failureSkip" class="numeric-condition">
        <span>识别数值</span><ElSelect :model-value="String(skip.operator ?? 'gt')"
          aria-label="跳过比较方式" @change="value => update({ operator: value })">
          <ElOption label="大于" value="gt" /><ElOption label="小于" value="lt" />
        </ElSelect><ElInputNumber :model-value="Number(skip.value ?? 0)" aria-label="跳过比较值"
          @change="value => update({ value: value ?? 0 })" />
      </div>
      <label>跳转到<ElSelect :model-value="Number(skip.skip_to_step_index ?? 0)"
        @change="value => update({ skip_to_step_index: value || undefined })">
        <ElOption label="下一步（末步则结束当前流程）" :value="0" />
        <ElOption v-for="n in destinations" :key="n" :label="`第 ${n} 步`" :value="n" />
      </ElSelect></label>
    </template>
  </section>
</template>
<style scoped>
.skip-form { display:grid; gap:12px; border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
label { display: grid; gap: 8px; margin-top:0; }
.numeric-condition { display: flex; gap: 8px; flex-wrap: wrap; margin-top:0; }
.numeric-condition .el-select { width: 100px; }
.failure-help { margin:0; color:var(--muted); font-size:12px; }
label :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
