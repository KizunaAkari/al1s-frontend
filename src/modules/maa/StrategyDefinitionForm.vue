<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { MaaScript } from '../../shared/api/maa'
import type { StrategyDefinition } from '../../shared/api/maa-strategies'
const props = defineProps<{ modelValue: StrategyDefinition; scripts: MaaScript[]; applicationId: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: StrategyDefinition] }>()
const available = computed(() => props.scripts.filter(s => s.application_id === props.applicationId && s.status === 'active' && s.current_version_id))
function options(type: string) { return available.value.filter(s => s.script_type === type) }
function change(patch: Partial<StrategyDefinition>) { emit('update:modelValue', { ...props.modelValue, ...patch }) }
function process(index: number, field: 'script_id' | 'wait_after_ms', value: string | number) {
  change({ process_modules: props.modelValue.process_modules.map((m, i) => i === index ? { ...m, [field]: value } : m) })
}
function move(index: number, offset: number) {
  const modules = [...props.modelValue.process_modules]
  const target = index + offset
  if (target < 0 || target >= modules.length) return
  modules.splice(target, 0, modules.splice(index, 1)[0]!)
  change({ process_modules: modules })
}
</script>
<template>
  <div class="definition-form">
    <label>开始脚本<ElSelect :model-value="modelValue.start_script_id" filterable @update:model-value="v => change({ start_script_id: v })">
      <ElOption v-if="modelValue.start_script_id && !options('module_start').some(s => s.script_id === modelValue.start_script_id)" :value="modelValue.start_script_id" :label="`当前引用（未加载）：${modelValue.start_script_id}`" disabled />
      <ElOption v-for="s in options('module_start')" :key="s.script_id" :value="s.script_id" :label="s.name" /></ElSelect></label>
    <label>开始后等待（毫秒）<ElInputNumber :model-value="modelValue.start_wait_after_ms" :min="0" :max="14400000" :precision="0" @change="v => change({ start_wait_after_ms: v ?? 0 })" /></label>
    <section v-for="(module, i) in modelValue.process_modules" :key="i">
      <label>过程 {{ i + 1 }}<ElSelect :model-value="module.script_id" filterable @update:model-value="v => process(i, 'script_id', v)">
        <ElOption v-if="module.script_id && !options('module_process').some(s => s.script_id === module.script_id)" :value="module.script_id" :label="`当前引用（未加载）：${module.script_id}`" disabled />
        <ElOption v-for="s in options('module_process')" :key="s.script_id" :value="s.script_id" :label="s.name" /></ElSelect></label>
      <label>过程后等待（毫秒）<ElInputNumber :model-value="module.wait_after_ms" :min="0" :max="14400000" :precision="0" @change="v => process(i, 'wait_after_ms', v ?? 0)" /></label>
      <div class="process-actions">
      <ElButton :disabled="i === 0" @click="move(i, -1)">上移</ElButton>
      <ElButton :disabled="i === modelValue.process_modules.length - 1" @click="move(i, 1)">下移</ElButton>
      <ElButton @click="change({ process_modules: modelValue.process_modules.filter((_, index) => index !== i) })">移除过程</ElButton>
      </div>
    </section>
    <ElButton :disabled="modelValue.process_modules.length >= 1000" @click="change({ process_modules: [...modelValue.process_modules, { script_id: '', wait_after_ms: 0 }] })">添加过程</ElButton>
    <label>结束脚本<ElSelect :model-value="modelValue.end_script_id" filterable @update:model-value="v => change({ end_script_id: v })">
      <ElOption v-if="modelValue.end_script_id && !options('module_end').some(s => s.script_id === modelValue.end_script_id)" :value="modelValue.end_script_id" :label="`当前引用（未加载）：${modelValue.end_script_id}`" disabled />
      <ElOption v-for="s in options('module_end')" :key="s.script_id" :value="s.script_id" :label="s.name" /></ElSelect></label>
  </div>
</template>
<style scoped>
.definition-form, label { display: grid; gap: 8px; min-width: 0; }
.definition-form, section { grid-template-columns: minmax(0, 1fr) 180px; align-items: start; gap: 12px; }
label { font-size: 13px; }
section { display: grid; grid-column: 1 / -1; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; }
.process-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.process-actions :deep(.el-button) { margin: 0; }
.definition-form > :deep(.el-button) { grid-column: 1 / -1; justify-self: start; }
.definition-form > label:last-child { grid-column: 1 / -1; }
:deep(.el-input-number) { width: 160px; max-width: 100%; }
@media (max-width: 600px) { .definition-form, section { grid-template-columns: minmax(0, 1fr); } }
</style>
