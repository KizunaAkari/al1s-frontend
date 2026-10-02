<script setup lang="ts">
import StepRegionField from './StepRegionField.vue'
import StepPostWaitField from './StepPostWaitField.vue'
import HelpHint from '../../../shared/ui/HelpHint.vue'
import { computed } from 'vue'
import { ElAlert, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
import { newWorkflowStep } from './workflow-defaults'

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const mode = computed(() => props.step.action === 'wait_random' ? 'random'
  : props.step.action === 'wait_image' ? 'image' : 'fixed')
const hasTemplate = computed(() => Boolean(props.step.template_base64))
function number(key: string, fallback: number) {
  const value = props.step[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function selectMode(value: unknown) {
  if (!['fixed', 'random', 'image'].includes(String(value))) return
  const action = value === 'random' ? 'wait_random' : value === 'image' ? 'wait_image' : 'wait'
  if (action === props.step.action) return
  const next = newWorkflowStep(action)
  for (const key of ['failure_retry', 'post_assertion', 'skip_condition', 'timeout_seconds']) {
    if (props.step[key] !== undefined) next[key] = props.step[key]
  }
  emit('change', next)
}
function update(key: string, value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  if (key === 'consecutive_match_count' && (!Number.isInteger(value) || value < 1)) return
  const next = { ...props.step, [key]: value }
  if (key === 'seconds' || key === 'max_seconds') {
    const current = number('timeout_seconds', props.step.action === 'wait' ? 30 : 20)
    next.timeout_seconds = Math.min(14400, Math.max(current, value + 1))
  }
  emit('change', next)
}
</script>

<template>
  <section class="wait-form" aria-label="等待设置">
    <h3>等待</h3>
    <label>等待方式
      <ElSelect :model-value="mode" aria-label="等待方式" @change="selectMode">
        <ElOption label="固定时间" value="fixed" />
        <ElOption label="随机时间范围" value="random" />
        <ElOption label="直到图片出现" value="image" />
      </ElSelect>
    </label>
    <label v-if="mode === 'fixed'">等待秒数
      <ElInputNumber :model-value="number('seconds', 1)" :min="0" :max="14400" aria-label="等待秒数"
        @change="value => update('seconds', value)" />
    </label>
    <template v-else-if="mode === 'random'">
      <div class="pair">
        <label>最短秒数<ElInputNumber :model-value="number('min_seconds', 1)" :min="0" :max="14400"
          aria-label="最短秒数" @change="value => update('min_seconds', value)" /></label>
        <label>最长秒数<ElInputNumber :model-value="number('max_seconds', 2)" :min="0" :max="14400"
          aria-label="最长秒数" @change="value => update('max_seconds', value)" /></label>
      </div>
      <ElAlert v-if="number('min_seconds', 1) > number('max_seconds', 2)" type="warning" :closable="false"
        title="最短时间不能大于最长时间。" />
    </template>
    <template v-else>
      <StepRegionField use="template" title="等待图片" :bound="hasTemplate" />
      <div class="pair">
        <label>匹配阈值<ElInputNumber :model-value="number('threshold', 0.85)" :min="0.000001" :max="1"
          :step="0.01" aria-label="等待图片阈值" @change="value => update('threshold', value)" /></label>
        <label>识别间隔（秒）<ElInputNumber :model-value="number('poll_interval_seconds', 1)" :min="0.05" :max="10"
          :step="0.05" aria-label="等待图片识别间隔" @change="value => update('poll_interval_seconds', value)" /></label>
      </div>
      <label><HelpHint label="连续命中轮数" subject="连续命中轮数"
        content="按识别间隔连续命中达到此轮数才通过；未命中或处理弹窗后重新计数。1 表示首次命中即通过。" />
        <ElInputNumber :model-value="number('consecutive_match_count', 1)" :min="1" :step="1"
          :precision="0" step-strictly aria-label="等待图片连续命中轮数"
          @change="value => update('consecutive_match_count', value)" />
      </label>
    </template>
    <label>步骤超时（秒）<ElInputNumber :model-value="number('timeout_seconds', mode === 'fixed' ? 30 : 20)"
      :min="0.1" :max="14400" aria-label="等待步骤超时" @change="value => update('timeout_seconds', value)" /></label>
    <StepPostWaitField v-if="mode === 'image'" :step="step" @change="value => emit('change', value)" />
    <ElAlert v-if="mode !== 'image' && number(mode === 'fixed' ? 'seconds' : 'max_seconds', mode === 'fixed' ? 1 : 2) > number('timeout_seconds', mode === 'fixed' ? 30 : 20)"
      type="warning" :closable="false" title="等待时间不能超过步骤超时。" />
  </section>
</template>

<style scoped>
.wait-form { display:grid; gap:12px; }
h3 { margin:0; font-size:15px; }
label { display:grid; gap:6px; min-width:0; }
.pair { display:grid; grid-template-columns:repeat(2,minmax(0,180px)); gap:12px; }
label :deep(.el-input-number),label :deep(.el-select) { width:100%; }
@media (max-width:680px) { .pair { grid-template-columns:1fr; } }
label :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
