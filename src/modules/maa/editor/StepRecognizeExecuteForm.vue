<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepPointPicker from './StepPointPicker.vue'
import StepRegionField from './StepRegionField.vue'
import StepPostWaitField from './StepPostWaitField.vue'
import { computed } from 'vue'
import { ElAlert, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const recognition = computed(() => props.step.recognition_mode === 'text' ? 'text' : 'image')
const execution = computed(() => String(props.step.execution_mode ?? 'fixed_tap'))
const click = computed(() => props.step.click as Record<string, unknown> | undefined ?? {})
const swipe = computed(() => props.step.swipe as Record<string, unknown> | undefined ?? {})
const hasRecognitionImage = computed(() => Boolean(props.step.template_base64))
const hasClickImage = computed(() => Boolean(props.step.click_template_base64))

function number(key: string, fallback: number) {
  const value = props.step[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function subNumber(field: 'click' | 'swipe', key: string, fallback: number) {
  const value = field === 'click' ? click.value[key] : swipe.value[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function update(key: string, value: unknown) {
  if (value === null || value === undefined) return
  emit('change', { ...props.step, [key]: value })
}
function updateMode(key: 'recognition_mode' | 'execution_mode', value: unknown) {
  const allowed = key === 'recognition_mode' ? ['image', 'text']
    : ['fixed_tap', 'fixed_swipe', 'image_center', 'match_center']
  if (key === 'execution_mode' && value === 'match_center' && recognition.value !== 'image') return
  if (allowed.includes(String(value))) update(key, value)
}
function updateSub(field: 'click' | 'swipe', key: string, value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const current = field === 'click' ? click.value : swipe.value
  const defaults = field === 'click' ? { x: 0, y: 0 }
    : { x1: 0, y1: 0, x2: 0, y2: 0, duration_ms: 300 }
  update(field, { ...defaults, ...current, [key]: value })
}
</script>

<template>
  <section class="recognize-form" aria-label="识别图形并执行设置">
    <h3>识别条件</h3>
    <label>识别方式
      <ElSelect :model-value="recognition" aria-label="识别方式" @change="value => updateMode('recognition_mode', value)">
        <ElOption label="截图区域中的图片" value="image" />
        <ElOption label="OCR 文字" value="text" />
      </ElSelect>
    </label>
    <template v-if="recognition === 'image'">
      <StepRegionField use="template" title="识别图片" :bound="hasRecognitionImage" />
      <label>匹配阈值<ElInputNumber :model-value="number('threshold', 0.85)" :min="0.000001" :max="1"
        :step="0.01" aria-label="识别图片阈值" @change="value => update('threshold', value)" /></label>
    </template>
    <template v-else>
      <label>识别文字<ElInput :model-value="String(step.text ?? '')" maxlength="200" aria-label="识别文字"
        @input="value => update('text', value)" /></label>
      <StepRegionField use="ocr_region" title="文字搜索区域" :bound="step.search_region" />
    </template>
    <div class="pair">
      <label>识别间隔（秒）<ElInputNumber :model-value="number('poll_interval_seconds', 1)" :min="0.05" :max="10"
        :step="0.05" aria-label="识别间隔" @change="value => update('poll_interval_seconds', value)" /></label>
      <label>步骤超时（秒）<ElInputNumber :model-value="number('timeout_seconds', 20)" :min="0.1" :max="14400"
        aria-label="识别执行超时" @change="value => update('timeout_seconds', value)" /></label>
      <StepPostWaitField :step="step" @change="value => emit('change', value)" />
    </div>
    <h3>识别成功后执行</h3>
    <label>执行方式
      <ElSelect :model-value="execution" aria-label="执行方式" @change="value => updateMode('execution_mode', value)">
        <ElOption label="固定坐标点击" value="fixed_tap" />
        <ElOption label="固定坐标滑动" value="fixed_swipe" />
        <ElOption label="点击识别图片中心（复用识别选区）" value="match_center" :disabled="recognition !== 'image'" />
        <ElOption label="点击目标图片中心" value="image_center" />
      </ElSelect>
    </label>
    <StepPointPicker v-if="execution === 'fixed_tap'" />
    <div v-if="execution === 'fixed_tap'" class="pair">
      <label>点击 X<ElInputNumber :model-value="subNumber('click', 'x', 0)" :min="0" :max="8191" :precision="0"
        aria-label="点击 X" @change="value => updateSub('click', 'x', value)" /></label>
      <label>点击 Y<ElInputNumber :model-value="subNumber('click', 'y', 0)" :min="0" :max="8191" :precision="0"
        aria-label="点击 Y" @change="value => updateSub('click', 'y', value)" /></label>
    </div>
    <div v-else-if="execution === 'fixed_swipe'" class="pair">
      <StepRegionField use="swipe_start" title="滑动起点" :bound="swipe.x1 !== undefined" />
      <StepRegionField use="swipe_end" title="滑动终点" :bound="swipe.x2 !== undefined" />
      <label v-for="key in (['x1', 'y1', 'x2', 'y2'] as const)" :key="key">滑动 {{ key }}
        <ElInputNumber :model-value="subNumber('swipe', key, 0)" :min="0" :max="8191" :precision="0"
          :aria-label="`滑动 ${key}`" @change="value => updateSub('swipe', key, value)" /></label>
      <label>滑动时长（毫秒）<ElInputNumber :model-value="subNumber('swipe', 'duration_ms', 300)"
        :min="1" :max="60000" :precision="0" aria-label="滑动时长" @change="value => updateSub('swipe', 'duration_ms', value)" /></label>
    </div>
    <template v-else-if="execution === 'match_center'">
      <ElAlert v-if="recognition !== 'image'" type="warning" :closable="false"
        title="复用识别选区需要图片识别，请切换识别方式或改选执行方式。" />
    </template>
    <template v-else>
      <StepRegionField use="click" title="点击图片" :bound="hasClickImage" />
      <label>点击图片匹配阈值<ElInputNumber :model-value="number('click_threshold', 0.85)" :min="0.000001" :max="1"
        :step="0.01" aria-label="点击图片阈值" @change="value => update('click_threshold', value)" /></label>
    </template>
    <div class="pair">
      <label><HelpHint subject="执行次数" label="执行次数">{{ execution === 'match_center' ? '每次重新识别目标图片，命中后点击当次位置；暂未命中会继续等待，直到完成次数或步骤超时。' : '先识别一次，再连续执行设定次数；超时或取消会停止后续动作。' }}</HelpHint><ElInputNumber :model-value="number('execution_count', 1)" :min="1" :precision="0"
        aria-label="执行次数" @change="value => update('execution_count', value)" /></label>
      <label>每次间隔（毫秒）<ElInputNumber :model-value="number('execution_interval_ms', 120)" :min="0" :max="3600000" :precision="0"
        aria-label="执行间隔" @change="value => update('execution_interval_ms', value)" /></label>
    </div>
    
  </section>
</template>

<style scoped>
.recognize-form { display:grid; gap:12px; }
h3 { margin:6px 0 0; font-size:15px; }
label { display:grid; gap:6px; min-width:0; }
p { margin:0; color:var(--muted); font-size:12px; }
.pair { display:grid; grid-template-columns:repeat(2,minmax(0,180px)); gap:12px; }
label :deep(.el-input-number),label :deep(.el-select) { width:100%; }
@media (max-width:680px) { .pair { grid-template-columns:1fr; } }
label :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
