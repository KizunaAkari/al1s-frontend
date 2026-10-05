<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepPointPicker from './StepPointPicker.vue'
import StepRegionField from './StepRegionField.vue'
import StepPostWaitField from './StepPostWaitField.vue'
import StepSystemKeyWaitFields from './StepSystemKeyWaitFields.vue'
import ColorMarkerSummary from './ColorMarkerSummary.vue'
import { colorMarkerRecognition } from './recognition-display'
import { computed } from 'vue'
import { ElAlert, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

type NumberField = 'timeout_seconds' | 'seconds' | 'wait_seconds' | 'poll_interval_seconds' |
  'threshold' | 'click_count' | 'click_interval_ms' | 'wait_after_click_seconds' | 'click_threshold'
type TextField = 'package' | 'activity' | 'subject' | 'message' | 'text'
type ClickMode = 'color_marker' | 'fixed' | 'image' | 'match_center' | 'match_offset' | 'template_center'
type EditableFields = Record<NumberField, number> & Record<TextField, string> & {
  force_stop_before_launch: boolean
  click_mode: ClickMode
}
const clickModes: readonly string[] = [
  'color_marker', 'fixed', 'image', 'match_center', 'match_offset', 'template_center',
]

const props = defineProps<{ step: WorkflowStep }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const isTextAction = computed(() => ['wait_text', 'click_text'].includes(props.step.action))
const recognition = computed(() => ['wait_image', 'wait_click', 'smart_swipe'].includes(props.step.action))
const marker = computed(() => colorMarkerRecognition(props.step))
const textValue = computed(() => typeof props.step.text === 'string' ? props.step.text : '')
const searchRegion = computed(() => {
  const value = props.step.search_region
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
})
const hasSearchRegion = computed(() => {
  const value = props.step.search_region
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
})
const OCR_REGION_DEFAULTS = { x: 0, y: 0, width: 1, height: 1 } as const
type OcrRegionKey = keyof typeof OCR_REGION_DEFAULTS
const textTimeout = computed(() => number('timeout_seconds') ?? (isTextAction.value ? 30 : undefined))
const clickMode = computed(() => typeof props.step.click_mode === 'string' && props.step.click_mode
  ? props.step.click_mode : 'fixed')
const click = computed(() => {
  const value = props.step.click
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
})
const legacyClickMode = computed(() => !['match_center', 'fixed', 'image'].includes(clickMode.value))
const hasClickTemplate = computed(() => {
  const value = props.step.click_template_base64
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
})
function number(key: NumberField): number | undefined {
  return typeof props.step[key] === 'number' ? props.step[key] : undefined
}
function clickNumber(key: 'x' | 'y'): number | undefined {
  return typeof click.value[key] === 'number' ? click.value[key] as number : undefined
}
function regionNumber(key: OcrRegionKey): number {
  const value = searchRegion.value[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : OCR_REGION_DEFAULTS[key]
}
function update<K extends keyof EditableFields>(key: K, value: EditableFields[K] | null | undefined) {
  const next = { ...props.step }
  if (value === undefined || value === null) delete next[key]
  else next[key] = value
  emit('change', next)
}
function updateClickMode(value: unknown) {
  if (typeof value === 'string' && clickModes.includes(value)) update('click_mode', value as ClickMode)
}
function updateForceStop(value: string | number | boolean) {
  if (typeof value === 'boolean') update('force_stop_before_launch', value)
}
function updateClick(key: 'x' | 'y', value: number | null | undefined) {
  const nextClick = { ...click.value }
  if (value === undefined || value === null) delete nextClick[key]
  else nextClick[key] = value
  emit('change', { ...props.step, click: nextClick })
}
function setSearchRegionEnabled(value: string | number | boolean) {
  if (value === true) {
    emit('change', { ...props.step, search_region: { ...OCR_REGION_DEFAULTS, ...searchRegion.value } })
    return
  }
  const next = { ...props.step }
  delete next.search_region
  emit('change', next)
}
function updateSearchRegion(key: OcrRegionKey, value: number | null | undefined) {
  emit('change', {
    ...props.step,
    search_region: {
      ...OCR_REGION_DEFAULTS,
      ...searchRegion.value,
      [key]: typeof value === 'number' && Number.isFinite(value) ? value : OCR_REGION_DEFAULTS[key],
    },
  })
}
</script>
<template>
  <section class="action-form" aria-label="动作参数">
    <header class="action-heading"><h3>{{ recognition ? '识别设置' : '动作参数' }}</h3></header>
    <label v-if="!recognition">步骤超时（秒，最多4小时）<ElInputNumber :model-value="textTimeout" :min="0.1" :max="14400"
      aria-label="步骤超时" @change="v => update('timeout_seconds', v)" /></label>
    <StepSystemKeyWaitFields v-if="['back', 'home', 'task_view'].includes(step.action)" :step="step"
      @change="value => emit('change', value)" />
    <label v-if="step.action === 'wait'">等待秒数
      <ElInputNumber :model-value="number('seconds')" :min="0" :max="14400" aria-label="等待秒数" @change="v => update('seconds', v)" />
    </label>
    <template v-else-if="step.action === 'launch_app'">
      <label>应用包名<ElInput :model-value="String(step.package ?? '')" maxlength="255" @input="v => update('package', v)" /></label>
      <label>启动 Activity（可选）<ElInput :model-value="String(step.activity ?? '')" maxlength="255" @input="v => update('activity', v || undefined)" /></label>
      <label>启动前停止应用<ElSwitch :model-value="step.force_stop_before_launch !== false" @change="updateForceStop" /></label>
      <label>启动后等待秒数<ElInputNumber :model-value="number('wait_seconds')" :min="0" :max="300" @change="v => update('wait_seconds', v)" /></label>
    </template>
    <template v-else-if="step.action === 'feedback'">
      <label>反馈标题<ElInput :model-value="String(step.subject ?? '')" maxlength="200" @input="v => update('subject', v)" /></label>
      <label>反馈内容<ElInput :model-value="String(step.message ?? '')" type="textarea" maxlength="2000" @input="v => update('message', v)" /></label>
    </template>
    <template v-else-if="isTextAction">
      <label><HelpHint subject="文字识别" label="识别文字（按字面匹配）">{{ step.action === 'click_text' ? '识别成功后点击第一个文字框中心；此动作不支持多次点击参数。' : '等待识别到指定文字后继续；文字按字面匹配，不作为正则表达式处理。' }}</HelpHint>
        <ElInput :model-value="textValue" minlength="1" maxlength="200" required show-word-limit aria-label="识别文字"
          @input="value => update('text', value)" />
      </label>
      <ElAlert v-if="!textValue" type="warning" :closable="false"
        title="请填写要识别的文字（1-200个字符，不使用正则表达式）。" />
      
      <label>限定搜索区域（可选）
        <ElSwitch :model-value="hasSearchRegion" aria-label="启用文字搜索区域" @change="setSearchRegionEnabled" />
      </label>
      <template v-if="hasSearchRegion">
        <label>搜索区域 X
          <ElInputNumber :model-value="regionNumber('x')" :min="0" :max="8192" :step="1" :precision="0"
            aria-label="搜索区域 X" @change="value => updateSearchRegion('x', value)" />
        </label>
        <label>搜索区域 Y
          <ElInputNumber :model-value="regionNumber('y')" :min="0" :max="8192" :step="1" :precision="0"
            aria-label="搜索区域 Y" @change="value => updateSearchRegion('y', value)" />
        </label>
        <label>搜索区域宽度
          <ElInputNumber :model-value="regionNumber('width')" :min="1" :max="8192" :step="1" :precision="0"
            aria-label="搜索区域宽度" @change="value => updateSearchRegion('width', value)" />
        </label>
        <label>搜索区域高度
          <ElInputNumber :model-value="regionNumber('height')" :min="1" :max="8192" :step="1" :precision="0"
            aria-label="搜索区域高度" @change="value => updateSearchRegion('height', value)" />
        </label>
      </template>
      <label>文字识别间隔（秒）
        <ElInputNumber :model-value="number('poll_interval_seconds') ?? 1" :min="0.05" :max="10" :step="0.05"
          aria-label="文字识别间隔" @change="value => update('poll_interval_seconds', value)" />
      </label>
      <StepPostWaitField :step="step" @change="value => emit('change', value)" />
    </template>
    <template v-else-if="recognition">
      <ColorMarkerSummary v-if="marker" :step="step" />
      <StepRegionField v-else use="template" title="识别图片" :bound="step.template_base64" />
      <div class="setting-group">
        <div class="field-grid">
          <label v-if="!marker">图片匹配阈值<ElInputNumber :model-value="number('threshold') ?? 0.85" :min="0.000001" :max="1" :step="0.01"
            aria-label="图片匹配阈值" @change="v => update('threshold', v)" /></label>
          <label>识别间隔（秒）<ElInputNumber :model-value="number('poll_interval_seconds')" :min="0.05" :max="10" :step="0.05"
            aria-label="识别间隔" @change="v => update('poll_interval_seconds', v)" /></label>
          <label>步骤超时（秒）<ElInputNumber :model-value="textTimeout" :min="0.1" :max="14400"
            aria-label="步骤超时" @change="v => update('timeout_seconds', v)" /></label>
          <StepPostWaitField :step="step" @change="value => emit('change', value)" />
        </div>
      </div>
      <label v-if="marker">点击后等待（秒）
        <ElInputNumber :model-value="number('wait_after_click_seconds')" :min="0" :max="300"
          aria-label="点击后等待秒数" @change="value => update('wait_after_click_seconds', value)" />
      </label>
      <template v-else-if="step.action === 'wait_click'">
        <div class="setting-group"><h3>点击设置 <HelpHint subject="点击设置">连击受步骤剩余时间限制；独立规则处理期间暂停该步骤计时，遇到失败或取消停止。</HelpHint></h3><div class="field-grid">
        <label class="wide-field"><span>点击模式 <HelpHint v-if="legacyClickMode" subject="点击模式">当前点击模式 {{ clickMode }} 保留原配置；本表单不覆盖其专用参数。</HelpHint></span>
          <ElSelect :model-value="clickMode" aria-label="点击模式" @change="updateClickMode">
            <ElOption label="匹配中心" value="match_center" />
            <ElOption label="固定坐标" value="fixed" />
            <ElOption label="图片点击" value="image" />
            <ElOption v-if="legacyClickMode" :label="`保留现有模式：${clickMode}`" :value="clickMode" disabled />
          </ElSelect>
        </label>
        
        <label>点击次数
          <ElInputNumber :model-value="number('click_count') ?? 1" :min="1" :step="1" :precision="0"
            aria-label="点击次数" @change="value => update('click_count', value)" />
        </label>
        <label>点击间隔（毫秒）
          <ElInputNumber :model-value="number('click_interval_ms') ?? 120" :min="0" :max="3600000" :step="1" :precision="0"
            aria-label="点击间隔（毫秒）" @change="value => update('click_interval_ms', value)" />
        </label>
        
        <template v-if="clickMode === 'fixed'">
          <label>固定点击 X 坐标
            <ElInputNumber :model-value="clickNumber('x')" :min="0" :max="8191" :precision="0"
              aria-label="固定点击 X 坐标" @change="value => updateClick('x', value)" />
          </label>
          <label>固定点击 Y 坐标
            <ElInputNumber :model-value="clickNumber('y')" :min="0" :max="8191" :precision="0"
              aria-label="固定点击 Y 坐标" @change="value => updateClick('y', value)" />
          </label>
        </template>
        <label>点击后等待（秒）
          <ElInputNumber :model-value="number('wait_after_click_seconds')" :min="0" :max="300"
            aria-label="点击后等待秒数" @change="value => update('wait_after_click_seconds', value)" />
        </label>
        <label v-if="clickMode === 'image'">图片点击阈值
          <ElInputNumber :model-value="number('click_threshold')" :min="0.000001" :max="1" :step="0.01"
            aria-label="图片点击阈值" @change="value => update('click_threshold', value)" />
        </label>
        <StepPointPicker v-if="clickMode === 'fixed'" />
        <StepRegionField v-if="clickMode === 'image'" use="click" title="点击图片" :bound="hasClickTemplate" />
        </div></div>
      </template>
    </template>
    <p v-else-if="['start', 'cleanup', 'home', 'back', 'task_view'].includes(step.action)">此动作没有额外参数。</p>
    <span v-else-if="['tap', 'swipe'].includes(step.action)">坐标配置</span>
    <HelpHint v-else-if="step.action === 'screenshot'" label="截图" content="执行时保存原图到当前任务，不自动向外发送。" />
    <HelpHint v-else label="自定义动作" content="自定义动作保留原参数，不加入通用动作选择器。" />
  </section>
</template>
<style scoped>
.action-form { display:grid; gap:14px; min-width:0; container-type:inline-size; }
.action-heading { display:flex; align-items:baseline; gap:10px; }
.action-heading h3,.setting-group h3 { margin:0; color:var(--text); font-size:14px; }
.action-heading small { color:var(--muted); font-size:12px; }
.setting-group { display:grid; gap:10px; min-width:0; }
.setting-group + .setting-group { padding-top:14px; border-top:1px solid var(--border); }
.field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,180px)); gap:12px 14px; min-width:0; }
.field-grid > .wide-field,.field-grid > .el-alert { grid-column:1/-1; }
label { display:grid; gap:6px; min-width:0; align-content:start; }
label :deep(.el-input-number),label :deep(.el-select) { width:100%; }
.field-grid p { margin:0; }
@container (max-width: 310px) { .field-grid { grid-template-columns:1fr; } }
label :deep(.el-input-number) { width:160px; max-width:100%; }
</style>
