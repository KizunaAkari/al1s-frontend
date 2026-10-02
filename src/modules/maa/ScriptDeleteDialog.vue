<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElAlert, ElButton, ElDialog } from 'element-plus'
import { ApiError } from '../../shared/api/client'
import type { MaaScript } from '../../shared/api/maa'
import { deleteScript, fetchScriptReferrers, type ScriptReferrer } from '../../shared/api/maa-script-deletion'
import { useCursorPage } from '../../shared/api/pagination'
const props = defineProps<{ script: MaaScript | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const router = useRouter()
const busy = ref(false)
const error = ref('')
const blocked = ref(false)
let key = ''
const refs = useCursorPage<ScriptReferrer, string>(cursor => fetchScriptReferrers(props.script!.script_id, cursor), r => r.script_id)
watch(() => props.script, () => { key = crypto.randomUUID(); error.value = ''; blocked.value = false; refs.reset() })
async function remove() {
  if (!props.script || busy.value) return
  busy.value = true
  error.value = ''
  try { await deleteScript(props.script, key); emit('changed'); emit('close') }
  catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
    if (e instanceof ApiError && e.code === 'script_in_use') {
      blocked.value = true
      await refs.load(true)
    }
  } finally { busy.value = false }
}
async function edit(r: ScriptReferrer) {
  await router.push({ path: '/editor', query: { script_id: r.script_id, step: r.step_indices[0] ?? 1 } })
  emit('close')
}
</script>
<template>
  <ElDialog :model-value="!!script" title="删除脚本" width="min(600px, 94vw)"
    :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy"
    @update:model-value="value => { if (!value && !busy) emit('close') }">
    <p>删除“{{ script?.name }}”？历史执行版本和结果会保留，结束脚本不会被联删。</p>
    <ElAlert v-if="error" :title="error" type="warning" :closable="false" />
    <template v-if="blocked">
      <p>请先编辑并保存以下引用脚本，移除对当前脚本的调用后再删除。</p>
      <ul><li v-for="r in refs.items.value" :key="r.script_id">
        <span>{{ r.name }} · 第 {{ r.step_indices.join('、') }} 步</span>
        <ElButton link type="primary" @click="edit(r)">编辑引用脚本</ElButton>
      </li></ul>
      <p v-if="refs.error.value">{{ refs.error.value.message }}</p>
      <ElButton v-if="refs.nextCursor.value || refs.error.value" :loading="refs.loading.value" @click="refs.load()">加载引用列表</ElButton>
    </template>
    <template #footer><ElButton :disabled="busy" @click="emit('close')">关闭</ElButton>
      <ElButton type="danger" :loading="busy" @click="remove">{{ blocked ? '重新检查并删除' : '确认删除' }}</ElButton></template>
  </ElDialog>
</template>
<style scoped>li { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 10px 0; } ul { padding: 0; }</style>
