<script setup lang="ts">
import { ElAlert, ElButton, ElDialog, ElInput } from 'element-plus'
import { ref, watch } from 'vue'
import { normalizeApiError } from '../../shared/api/client'
import { fetchScriptMetadataActions, renameScript } from '../../shared/api/maa-script-metadata'
import type { MaaScript } from '../../shared/api/maa'

const props = defineProps<{ script: MaaScript | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const name = ref('')
const allowed = ref(false)
const busy = ref(false)
const attempted = ref(false)
const error = ref('')
let key = ''
let generation = 0

watch(() => props.script, async script => {
  const current = ++generation
  name.value = script?.name ?? ''
  allowed.value = false
  attempted.value = false
  error.value = ''
  key = crypto.randomUUID()
  if (!script) return
  try {
    const data = await fetchScriptMetadataActions(script.script_id)
    if (current !== generation) return
    allowed.value = data.rename === null && data.row_version === script.row_version
    if (!allowed.value) error.value = '脚本已变化或当前不允许重命名，请关闭并刷新脚本库。'
  } catch (cause) {
    if (current === generation) error.value = normalizeApiError(cause).message
  }
}, { immediate: true })

async function save(): Promise<void> {
  if (!props.script || !allowed.value || busy.value || !name.value.trim()) return
  busy.value = true
  attempted.value = true
  error.value = ''
  try {
    await renameScript(props.script, name.value.trim(), key)
    emit('changed')
    emit('close')
  } catch (cause) {
    const failure = normalizeApiError(cause)
    error.value = `${failure.message}（${failure.code}）${failure.requestId ? ` 请求：${failure.requestId}` : ''}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ElDialog :model-value="!!script" title="重命名脚本" width="min(480px, 94vw)"
    :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy"
    @update:model-value="value => { if (!value && !busy) emit('close') }">
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">重命名脚本 </span></template>
    <ElInput v-model="name" aria-label="脚本名称" maxlength="255" :disabled="attempted || !allowed" />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="attempted && error">可重试原请求；如需修改内容，请关闭后刷新列表，再重新打开。</p>
    <template #footer>
      <ElButton :disabled="busy" @click="emit('close')">关闭</ElButton>
      <ElButton type="primary" :disabled="!allowed || !name.trim()" :loading="busy" @click="save">{{ attempted && error ? '重试原请求' : '保存' }}</ElButton>
    </template>
  </ElDialog>
</template>
