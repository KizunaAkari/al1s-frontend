<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepRegionField from './StepRegionField.vue'
import { computed } from 'vue'
import { ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const DEFAULT_THRESHOLD = 0.85
const DEFAULT_TIMEOUT_SECONDS = 20
const DEFAULT_POLL_INTERVAL_SECONDS = 1
const DEFAULT_MAX_RETRIES = 1

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

const assertion = computed(() => asRecord(props.step.post_assertion))
const mode = computed(() => assertion.value.recognition_mode === 'text' ? 'text' : 'image')
const ready = computed(() => mode.value === 'text'
  ? typeof assertion.value.text === 'string' && !!assertion.value.text.trim() && assertion.value.text.length <= 200
  : hasTemplate.value)
const enabled = computed(() => assertion.value.enabled === true)
const hasTemplate = computed(() => {
  const template = assertion.value.template_base64
  if (typeof template === 'string') return template.trim().length > 0
  return asRecord(template).$blob !== undefined
})

function number(key: string, fallback: number): number {
  const value = assertion.value[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function update(patch: Record<string, unknown>) {
  emit('change', {
    ...props.step,
    post_assertion: {
      threshold: DEFAULT_THRESHOLD,
      timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
      poll_interval_seconds: DEFAULT_POLL_INTERVAL_SECONDS,
      max_retries: DEFAULT_MAX_RETRIES,
      ...assertion.value,
      ...patch,
    },
  })
}

function setEnabled(value: string | number | boolean) {
  const next = value === true
  if (next && !ready.value) return
  update({ enabled: next })
}

function setNumber(key: string, value: number | null | undefined, fallback: number) {
  update({ [key]: typeof value === 'number' && Number.isFinite(value) ? value : fallback })
}
</script>

<template>
  <section class="assertion-form" aria-label="步骤后断言">
    <header>
      <strong>步骤后断言 <HelpHint subject="步骤后断言">步骤完成后匹配图片或文字；失败时按次数重试当前步骤。</HelpHint></strong>
      <ElSwitch
        :model-value="enabled"
        :disabled="!ready && !enabled"
        aria-label="启用步骤后断言"
        @change="setEnabled"
      />
    </header>
    
    <label>匹配方式<ElSelect :model-value="mode" aria-label="断言匹配方式" @change="value => update({ recognition_mode: value, enabled: false })">
      <ElOption label="图片匹配" value="image" /><ElOption label="OCR 文字匹配" value="text" />
    </ElSelect></label>
    <StepRegionField v-if="mode === 'image'" use="assertion" title="断言图片" :bound="hasTemplate" />
    <template v-else>
      <label><HelpHint subject="断言匹配文字" label="匹配文字">按字面匹配文字；未设置区域时搜索全屏。</HelpHint><ElInput :model-value="String(assertion.text ?? '')" maxlength="200" placeholder="例如：开始游戏" aria-label="断言匹配文字" @update:model-value="value => update({ text: value })" /></label>
      <StepRegionField use="assertion_ocr" title="断言文字区域" :bound="assertion.search_region" />
      
    </template>
    <div v-if="enabled" class="assertion-fields">
      <label v-if="mode === 'image'">
        匹配阈值
        <ElInputNumber
          :model-value="number('threshold', DEFAULT_THRESHOLD)"
          :min="0.000001"
          :max="1"
          :step="0.01"
          aria-label="断言匹配阈值"
          @change="value => setNumber('threshold', value, DEFAULT_THRESHOLD)"
        />
      </label>
      <label>
        断言超时（秒）
        <ElInputNumber
          :model-value="number('timeout_seconds', DEFAULT_TIMEOUT_SECONDS)"
          :min="0.1"
          :max="300"
          aria-label="断言超时"
          @change="value => setNumber('timeout_seconds', value, DEFAULT_TIMEOUT_SECONDS)"
        />
      </label>
      <label>
        轮询间隔（秒）
        <ElInputNumber
          :model-value="number('poll_interval_seconds', DEFAULT_POLL_INTERVAL_SECONDS)"
          :min="0.05"
          :max="10"
          :step="0.05"
          aria-label="断言轮询间隔"
          @change="value => setNumber('poll_interval_seconds', value, DEFAULT_POLL_INTERVAL_SECONDS)"
        />
      </label>
      <label>
        最大重试次数
        <ElInputNumber
          :model-value="number('max_retries', DEFAULT_MAX_RETRIES)"
          :min="1"
          :max="20"
          :step="1"
          :precision="0"
          aria-label="断言最大重试次数"
          @change="value => setNumber('max_retries', value, DEFAULT_MAX_RETRIES)"
        />
      </label>
    </div>
  </section>
</template>

<style scoped>
.assertion-form { display: grid; gap: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
p { margin:0; color: var(--el-text-color-secondary); font-size: 13px; }
label { display:grid; gap:6px; min-width:0; }
.assertion-fields { display:grid; grid-template-columns:repeat(2,minmax(0,180px)); gap:12px; }
label :deep(.el-input-number) { width:100%; }
label :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
