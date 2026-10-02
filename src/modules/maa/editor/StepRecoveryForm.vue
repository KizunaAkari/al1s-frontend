<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
import type { MaaScript } from '../../../shared/api/maa'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'

const props = defineProps<{ step: WorkflowStep; scripts: MaaScript[]; scriptId: string }>()
const emit = defineEmits<{ change: [step: WorkflowStep] }>()
const retry = computed(() => (props.step.failure_retry ?? {}) as Record<string, unknown>)
const targets = computed(() => props.scripts.filter(s => s.script_type === 'module_process'
  && s.status === 'active' && s.current_version_id && s.script_id !== props.scriptId))
const target = computed(() => typeof retry.value.process_script_id === 'string'
  ? retry.value.process_script_id : undefined)
function update(patch: Record<string, unknown>) {
  emit('change', { ...props.step, failure_retry: { max_retries: 1, ...retry.value, ...patch } })
}
</script>

<template>
  <section class="recovery-form">
    <header><strong>失败重试调用脚本 </strong><ElSwitch :model-value="retry.enabled === true"
      :disabled="step.action === 'start'" aria-label="启用失败重试调用脚本"
      @change="value => update({ enabled: value })" /></header>
    
    <p v-if="step.action === 'start'">开始动作不支持失败重试调用。</p>
    <template v-if="retry.enabled === true">
      <label>调用脚本<ElSelect :model-value="target" placeholder="选择同应用的已保存过程脚本"
        filterable aria-label="失败恢复脚本" @change="value => update({ process_script_id: value })">
        <ElOption v-for="s in targets" :key="s.script_id" :value="s.script_id" :label="s.name" />
        <ElOption v-if="target && !targets.some(s => s.script_id === target)" :value="target"
          :label="`未加载或不可用：${target}`" disabled />
      </ElSelect></label>
      <label>最多重试次数<ElInputNumber :model-value="Number(retry.max_retries ?? 1)" :min="1" :max="20"
        :precision="0" aria-label="失败恢复重试次数" @change="value => update({ max_retries: value ?? 1 })" /></label>
      <ElAlert v-if="!target" type="warning" :closable="false" title="请选择恢复脚本后再保存。" />
    </template>
  </section>
</template>

<style scoped>
.recovery-form { border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; min-width: 0; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
p { margin:8px 0 0; color: var(--el-text-color-secondary); font-size: 13px; }
label { display: grid; gap: 8px; margin-top: 12px; }
</style>
