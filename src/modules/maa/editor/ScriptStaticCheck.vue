<script setup lang="ts">
import { ref } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { apiClient } from '../../../shared/api/client'
import type { MaaScript } from '../../../shared/api/maa'

const props = defineProps<{ script: MaaScript; disabled: boolean; compact?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const busy = ref(false)
const message = ref('')
const passed = ref(false)
let pending: { version: string; key: string } | undefined
async function check() {
  const version = props.script.current_version_id
  if (!version || props.disabled || busy.value) return
  if (pending?.version !== version) pending = { version, key: crypto.randomUUID() }
  busy.value = true
  emit('busy', true)
  message.value = ''
  try {
    const { data } = await apiClient.post<{
      status: string; executor_version: string; issues: { pointer: string; message: string }[]
    }>(`/maa/scripts/${props.script.script_id}/static-check`, { candidate_version_id: version },
      { headers: { 'Idempotency-Key': pending.key } })
    passed.value = data.status === 'passed'
    message.value = passed.value ? `静态检查通过（${data.executor_version}）。`
      : data.issues.map(issue => `${issue.pointer}：${issue.message}`).join('；') || '静态检查未通过'
    pending = undefined
  } catch (error) {
    passed.value = false
    message.value = error instanceof Error ? error.message : '检查结果未知，请重试核对原请求'
  } finally { busy.value = false; emit('busy', false) }
}
defineExpose({ check, busy })
</script>
<template>
  <div>
    <ElButton v-if="!compact" :disabled="disabled || !script.current_version_id" :loading="busy" @click="check">重新静态检查</ElButton>
    <ElAlert v-if="message" :type="passed ? 'success' : 'error'" :title="message" :closable="false" />
  </div>
</template>
