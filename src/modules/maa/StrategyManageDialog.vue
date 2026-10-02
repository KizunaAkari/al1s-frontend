<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElAlert, ElButton, ElDialog, ElInput, ElMessageBox } from 'element-plus'
import { ApiError } from '../../shared/api/client'
import type { MaaScript, MaaStrategy } from '../../shared/api/maa'
import { executeStrategyCommand, readStrategyDefinition, type StrategyCommand, type StrategyDefinition } from '../../shared/api/maa-strategies'
import StrategyDefinitionForm from './StrategyDefinitionForm.vue'

const props = defineProps<{ strategy: MaaStrategy; scripts: MaaScript[]; more: boolean; loading: boolean }>()
const emit = defineEmits<{ changed: []; more: [] }>()
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const current = ref<MaaStrategy>()
const definition = ref<StrategyDefinition>()
const name = ref('')
const pending = ref<StrategyCommand>()
let original = ''
let renamed = false
const valid = computed(() => definition.value?.start_script_id && definition.value.end_script_id
  && definition.value.process_modules.every(m => m.script_id))
// Keep a possibly sensitive parameter snapshot in memory, not browser persistent storage.
async function open() { visible.value = true; if (!pending.value && !definition.value) await reload() }
async function reload() {
  if (busy.value || pending.value) return
  busy.value = true; error.value = ''
  try {
    const data = await readStrategyDefinition(props.strategy.strategy_id)
    current.value = data.strategy; definition.value = data.definition; name.value = data.strategy.name
    original = JSON.stringify(data.definition)
  } catch (e) { error.value = e instanceof Error ? e.message : '读取策略失败' }
  finally { busy.value = false }
}
function edit(value: StrategyDefinition) { definition.value = value }
async function execute(command: StrategyCommand) {
  if (busy.value) return
  pending.value = command; busy.value = true; error.value = ''
  try {
    const updated = await executeStrategyCommand(command)
    if (command.kind === 'rename' && updated) {
      current.value = updated; name.value = updated.name; pending.value = undefined
      renamed = true; return
    }
    pending.value = undefined; definition.value = undefined
    visible.value = false; emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '结果未知，请核对原请求'
    if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) {
      pending.value = undefined
    }
  } finally { busy.value = false }
}
function commandBase() {
  return { id: props.strategy.strategy_id, rowVersion: current.value!.row_version, key: crypto.randomUUID() }
}
function save() {
  if (!current.value || !definition.value || !valid.value || pending.value || busy.value) return
  if (name.value !== current.value.name) { error.value = '请先保存名称，再保存模块修改。'; return }
  void execute({ ...commandBase(), kind: 'save', definition: JSON.parse(JSON.stringify(definition.value)) as StrategyDefinition })
}
function rename() {
  if (!current.value || !name.value.trim() || pending.value || busy.value) return
  void execute({ ...commandBase(), kind: 'rename', name: name.value.trim() })
}
async function remove() {
  if (!current.value || pending.value || busy.value) return
  busy.value = true
  try {
    await ElMessageBox.confirm('删除策略身份？历史版本和任务记录保留；活动计划仍有未来轮次时后端会拒绝。', '删除组合策略', { type: 'warning' })
  } catch { busy.value = false; return }
  busy.value = false
  await execute({ ...commandBase(), kind: 'delete' })
}
async function close() {
  if (busy.value) return
  if (pending.value) { error.value = '请求结果未知，请先核对原请求；不要刷新或离开页面。'; return }
  if (definition.value && (JSON.stringify(definition.value) !== original || name.value !== current.value?.name)) {
    try { await ElMessageBox.confirm('放弃尚未提交的策略修改？', '关闭编辑', { type: 'warning' }) }
    catch { return }
  }
  definition.value = undefined; visible.value = false
  if (renamed) { renamed = false; emit('changed') }
}
async function refresh() {
  if (busy.value || pending.value) return
  if (definition.value) {
    try { await ElMessageBox.confirm('重新读取会放弃当前未提交修改，是否继续？', '重新读取策略', { type: 'warning' }) }
    catch { return }
  }
  await reload()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || pending.value || (visible.value && definition.value &&
    (JSON.stringify(definition.value) !== original || name.value !== current.value?.name))) {
    event.preventDefault(); event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(async () => {
  if (busy.value || pending.value) return false
  if (visible.value) await close()
  return !visible.value
})
</script>
<template>
  <ElButton @click="open">管理策略</ElButton>
  <ElDialog :model-value="visible" title="管理组合策略" width="min(720px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="false" :show-close="false">
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="pending">{{ pending.kind }} 请求结果未确认，请核对原请求，不要刷新页面。</p>
    <div v-else-if="current && definition" class="strategy-form" :inert="busy">
      <div class="strategy-name-row">
        <label :for="`strategy-name-${strategy.strategy_id}`">策略名称</label>
        <ElInput :id="`strategy-name-${strategy.strategy_id}`" v-model="name" maxlength="255" />
        <ElButton :disabled="!name.trim() || name === current.name" @click="rename">保存名称</ElButton>
      </div>
      
      <StrategyDefinitionForm :model-value="definition" :scripts="scripts" :application-id="current.application_id" @update:model-value="edit" />
      <ElButton v-if="more" :loading="loading" @click="emit('more')">加载更多模块</ElButton>
    </div>
    <template #footer>
      <ElButton :disabled="busy || !!pending" @click="close">关闭</ElButton>
      <ElButton v-if="pending" :loading="busy" @click="execute(pending)">核对原请求</ElButton>
      <template v-else>
        <ElButton :loading="busy" @click="refresh">重新读取</ElButton>
        <ElButton v-if="current && definition" type="danger" :disabled="busy" @click="remove">删除策略</ElButton>
        <ElButton type="primary" :disabled="busy || !valid || JSON.stringify(definition) === original" @click="save">保存策略</ElButton>
      </template>
    </template>
  </ElDialog>
</template>
<style scoped>
.strategy-form { display:grid; gap:16px; min-width:0; }
.strategy-name-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; min-width:0; }
.strategy-name-row :deep(.el-input) { min-width:0; }
.strategy-name-row :deep(.el-button) { margin:0; }
@media (max-width:600px) {
  .strategy-name-row { grid-template-columns:minmax(0,1fr) auto; }
  .strategy-name-row > label { grid-column:1 / -1; }
}
</style>
