<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDropdownItem, ElMessage } from 'element-plus'

import { normalizeApiError } from '../../shared/api/client'
import { exportStrategyArchive } from '../../shared/api/maa-strategies'
import type { MaaStrategy } from '../../shared/api/maa'

const props = withDefaults(defineProps<{ strategy: MaaStrategy; menu?: boolean }>(), { menu: false })
const busy = ref(false)
const error = ref('')
let generation = 0

watch(() => props.strategy.strategy_id, () => { generation++; error.value = '' })
onBeforeUnmount(() => { generation++ })

async function download(): Promise<void> {
  if (busy.value || !props.strategy.current_version_id) return
  const identity = props.strategy.strategy_id
  const current = generation
  busy.value = true
  error.value = ''
  try {
    const body = await exportStrategyArchive(identity)
    if (current !== generation) return
    const url = URL.createObjectURL(body)
    const link = document.createElement('a')
    link.href = url
    link.download = `maa-strategy-${identity}.zip`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    if (current === generation) {
      error.value = normalizeApiError(cause).message
      if (props.menu) ElMessage.error(error.value)
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
</script>

<template>
  <ElDropdownItem v-if="menu" :disabled="busy || !strategy.current_version_id" @click="download">导出策略</ElDropdownItem>
  <template v-else>
    <ElButton :loading="busy" :disabled="!strategy.current_version_id" @click="download">导出策略</ElButton>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
  </template>
</template>
