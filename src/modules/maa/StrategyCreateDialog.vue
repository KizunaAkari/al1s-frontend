<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElAlert, ElButton, ElDialog, ElInput } from 'element-plus'
import { ApiError } from '../../shared/api/client'
import type { MaaApplication, MaaScript } from '../../shared/api/maa'
import { createStrategy, type NewStrategy } from '../../shared/api/maa-strategies'
import StrategyDefinitionForm from './StrategyDefinitionForm.vue'

const props = defineProps<{ application?: MaaApplication; scripts: MaaScript[]; more: boolean; loading: boolean }>()
const emit = defineEmits<{ created: []; more: [] }>()
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const body = ref<NewStrategy>({ application_id: '', name: '', start_script_id: '', process_modules: [],
  end_script_id: '', start_wait_after_ms: 0, default_parameters: {} })
const storageKey = 'al1s.strategy-create.pending'
type Pending = { body: NewStrategy; key: string }
function restore(): Pending | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Pending | null
    if (typeof value?.key === 'string' && typeof value.body?.application_id === 'string'
      && typeof value.body.name === 'string' && Array.isArray(value.body.process_modules)) return value
  } catch { /* Invalid browser state cannot be submitted. */ }
}
const pending = ref(restore())
const valid = computed(() => body.value.name.trim() && body.value.start_script_id && body.value.end_script_id
  && body.value.process_modules.every(m => m.script_id))
function open() { visible.value = true; error.value = '' }
async function submit() {
  if (busy.value) return
  if (!pending.value) {
    if (!props.application || !valid.value) return
    const snapshot = JSON.parse(JSON.stringify(body.value)) as NewStrategy
    const next = { body: { ...snapshot, application_id: props.application.application_id }, key: crypto.randomUUID() }
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) }
    catch { error.value = '无法保存请求标识，请允许浏览器会话存储。'; return }
    pending.value = next
  }
  busy.value = true; error.value = ''
  try {
    await createStrategy(pending.value.body, pending.value.key)
    sessionStorage.removeItem(storageKey); pending.value = undefined
    visible.value = false; emit('created')
    body.value = { application_id: '', name: '', start_script_id: '', process_modules: [], end_script_id: '', start_wait_after_ms: 0, default_parameters: {} }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建结果未知'
    if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) {
      sessionStorage.removeItem(storageKey); pending.value = undefined
    }
  } finally { busy.value = false }
}
</script>
<template>
  <ElButton :disabled="!application && !pending" @click="open">{{ pending ? '核对策略创建' : '新建组合策略' }}</ElButton>
  <ElDialog v-model="visible" title="新建组合策略" width="min(720px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="pending">正在核对原请求：{{ pending.body.name }}。不会因切换分类或再次点击而创建第二份策略。</p>
    <div v-else class="strategy-form" :inert="busy">
      
      <label>策略名称 <ElInput v-model="body.name" maxlength="255" /></label>
      <StrategyDefinitionForm :model-value="body" :scripts="scripts" :application-id="application?.application_id ?? ''"
        @update:model-value="body = { ...body, ...$event }" />
      <ElButton v-if="more" :loading="loading" @click="emit('more')">加载更多模块</ElButton>
    </div>
    <template #footer><ElButton :disabled="busy" @click="visible = false">关闭</ElButton>
      <ElButton type="primary" :loading="busy" :disabled="!pending && !valid" @click="submit">{{ pending ? '核对原请求' : '创建组合策略' }}</ElButton>
    </template>
  </ElDialog>
</template>
<style scoped>
.strategy-form, label { display: grid; gap: 8px; }
.strategy-form { gap: 16px; }
</style>
