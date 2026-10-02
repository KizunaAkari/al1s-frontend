<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepPointPicker from './StepPointPicker.vue'
import StepRegionField from './StepRegionField.vue'
import { computed } from 'vue'
import { ElButton, ElCheckbox, ElCheckboxGroup, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { ScriptDocument, WorkflowStep } from '../../../shared/api/maa-script-editor'
import { addPopupRule, popupRules, removePopupRule, ruleStepIndexes, setRuleStepIndexes, updatePopupRule,
  type PopupRule } from './global-popup-rules'

const props = defineProps<{ document: ScriptDocument; activeIndex: number }>()
const emit = defineEmits<{ change: [document: ScriptDocument]; select: [index: number] }>()
const rules = computed(() => popupRules(props.document))
const rule = computed(() => rules.value[props.activeIndex])
const scope = computed(() => rule.value ? ruleStepIndexes(rule.value, props.document.steps.length) : [])
const names: Record<string, string> = {
  start: '开始', launch_app: '启动应用', cleanup: '结束应用并清理', wait: '等待',
  wait_random: '随机等待', wait_image: '等待图片', recognize_execute: '识别图形并执行',
  back: '返回', home: '主页', task_view: '任务视图', wait_click: '识别并点击',
}
function stepName(step: WorkflowStep, index: number): string {
  return `${String(index + 1).padStart(2, '0')} ${String(step.name || step.title || names[step.action] || step.action)}`
}
function edit(value: PopupRule) {
  if (rule.value) emit('change', updatePopupRule(props.document, props.activeIndex, value))
}
function update(key: string, value: unknown) { if (rule.value) edit({ ...rule.value, [key]: value }) }
function updateNumber(key: string, value: number | null | undefined) { if (value != null) update(key, value) }
function updatePoint(axis: 'x' | 'y', value: number | null | undefined) {
  if (value == null || !rule.value) return
  const click = rule.value.click && typeof rule.value.click === 'object' && !Array.isArray(rule.value.click)
    ? rule.value.click as Record<string, unknown> : {}
  edit({ ...rule.value, click: { ...click, [axis]: value } })
}
function updateScope(value: Array<string | number | boolean>) {
  if (!rule.value) return
  const indexes = value.map(Number).filter(index => Number.isInteger(index) && index >= 1 && index <= props.document.steps.length)
  if (indexes.length) edit(setRuleStepIndexes(rule.value, indexes, props.document.steps.length))
}
function add() {
  const next = addPopupRule(props.document)
  emit('change', next)
  emit('select', popupRules(next).length - 1)
}
function remove() {
  if (!rule.value) return
  emit('change', removePopupRule(props.document, props.activeIndex))
  emit('select', Math.max(0, props.activeIndex - 1))
}
function point(axis: 'x' | 'y'): number | undefined {
  const click = rule.value?.click
  if (!click || typeof click !== 'object' || Array.isArray(click)) return undefined
  const value = (click as Record<string, unknown>)[axis]
  return typeof value === 'number' ? value : undefined
}
</script>

<template>
  <section class="popup-form" aria-label="全局弹窗规则配置">
    <div class="form-heading"><div><h3>全局规则 <HelpHint subject="全局规则">在所选步骤的安全检查点识别并处理弹窗。</HelpHint></h3></div>
      <ElButton :disabled="rules.length >= 50 || !document.steps.length" @click="add">添加弹窗规则</ElButton></div>
    <div class="rule-choices" role="tablist" aria-label="弹窗规则">
      <button v-for="(item, index) in rules" :key="index" type="button" role="tab"
        :aria-selected="activeIndex === index" :class="{ active: activeIndex === index }"
        @click="emit('select', index)">{{ String(index + 1).padStart(2, '0') }} {{ item.name || `弹窗规则 ${index + 1}` }}</button>
    </div>
    <template v-if="rule">
      <label>规则名称<ElInput :model-value="String(rule.name || '')" maxlength="200" aria-label="规则名称"
        @update:model-value="value => update('name', value)" /></label>
      <ElCheckbox :model-value="rule.enabled !== false" @change="value => update('enabled', value)">启用此弹窗规则</ElCheckbox>
      <StepRegionField use="template" title="弹窗识别图片" :bound="rule.template_base64" />
      <label>匹配阈值<ElInputNumber :model-value="Number(rule.threshold ?? 0.85)" :min="0.01" :max="1" :step="0.01" :precision="2"
        aria-label="匹配阈值" @change="value => updateNumber('threshold', value)" /></label>
      <label>点击方式<ElSelect :model-value="String(rule.click_mode || 'fixed')" aria-label="点击方式"
        @change="value => update('click_mode', value)">
        <ElOption label="点击识别图片中心" value="match_center" />
        <ElOption label="点击识别图片中心（旧配置）" value="template_center" />
        <ElOption label="固定坐标点击" value="fixed" />
        <ElOption label="点击另选图片中心" value="image" />
      </ElSelect></label>
      <StepPointPicker v-if="rule.click_mode === 'fixed'" />
      <template v-if="rule.click_mode === 'fixed'">
        <div class="numeric-pair"><label>X<ElInputNumber :model-value="point('x')" :min="0" :max="8191" :precision="0"
          aria-label="点击 X 坐标" @change="value => updatePoint('x', value)" /></label>
          <label>Y<ElInputNumber :model-value="point('y')" :min="0" :max="8191" :precision="0"
            aria-label="点击 Y 坐标" @change="value => updatePoint('y', value)" /></label></div>
      </template>
      <StepRegionField v-if="rule.click_mode === 'image'" use="click" title="点击图片" :bound="rule.click_template_base64" />
      <label v-if="rule.click_mode === 'image'">点击图片匹配阈值<ElInputNumber :model-value="Number(rule.click_threshold ?? rule.threshold ?? 0.85)" :min="0.01" :max="1" :step="0.01" :precision="2"
        aria-label="点击图片匹配阈值" @change="value => updateNumber('click_threshold', value)" /></label>
      <div class="numeric-pair">
        <label>单次规则超时（秒）<ElInputNumber :model-value="Number(rule.timeout_seconds ?? 30)" :min="0.1" :max="14400" :step="1"
          aria-label="单次规则超时" @change="value => updateNumber('timeout_seconds', value)" /></label>
        <label>命中冷却（秒）<ElInputNumber :model-value="Number(rule.cooldown_seconds ?? 0)" :min="0" :max="300" :step="0.1"
          aria-label="命中冷却" @change="value => updateNumber('cooldown_seconds', value)" /></label>
        <label>点击次数<ElInputNumber :model-value="Number(rule.click_count ?? 1)" :min="1" :max="10" :precision="0"
          aria-label="弹窗点击次数" @change="value => updateNumber('click_count', value)" /></label>
        <label>点击间隔（毫秒）<ElInputNumber :model-value="Number(rule.click_interval_ms ?? 0)" :min="0" :max="60000" :precision="0"
          aria-label="弹窗点击间隔" @change="value => updateNumber('click_interval_ms', value)" /></label>
        <label>点击后等待（秒）<ElInputNumber :model-value="Number(rule.wait_after_click_seconds ?? 0.3)" :min="0" :max="300" :step="0.1"
          aria-label="点击后等待" @change="value => updateNumber('wait_after_click_seconds', value)" /></label>
      </div>
      <fieldset class="scope"><legend>适用步骤 <HelpHint subject="适用步骤">至少选择一项；手动全选后取消范围限制，也覆盖以后追加的步骤。</HelpHint></legend>
        <ElCheckboxGroup :model-value="scope" @change="updateScope">
          <ElCheckbox v-for="(step, index) in document.steps" :key="index" :value="index + 1">
            {{ stepName(step, index) }}</ElCheckbox>
        </ElCheckboxGroup></fieldset>
      <ElButton type="danger" text @click="remove">移除这条弹窗规则</ElButton>
    </template>
  </section>
</template>

<style scoped>
.popup-form { display:grid; gap:15px; min-width:0; }.form-heading { display:flex; align-items:start; justify-content:space-between; gap:8px; }
h3 { margin:0; font-size:16px; }.form-heading p,.scope p { margin:5px 0 0; font-size:12px; color:var(--muted); }
.rule-choices { display:flex; gap:5px; overflow-x:auto; padding-bottom:4px; }.rule-choices button { flex:none; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:7px 9px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); cursor:pointer; }
.rule-choices button.active { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
label { display:grid; gap:5px; min-width:0; }.numeric-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.status { padding:9px 11px; border-radius:8px; background:var(--surface-soft); color:var(--muted); font-size:12px; }
.scope { display:grid; gap:7px; margin:0; padding:12px; border:1px solid var(--border); border-radius:9px; }.scope legend { font-weight:600; }.scope :deep(.el-checkbox-group) { display:grid; gap:5px; max-height:230px; overflow:auto; }.scope :deep(.el-checkbox) { margin-right:0; height:auto; min-height:25px; white-space:normal; }
@media (max-width:430px) { .numeric-pair { grid-template-columns:1fr; } }
</style>
