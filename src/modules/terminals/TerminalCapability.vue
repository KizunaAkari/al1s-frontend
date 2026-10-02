<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, ref } from 'vue'
import { ElButton, ElDrawer, ElAlert } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import { formatGiB } from '../../shared/presentation/format'
import type { StorageObservation, Terminal } from '../../shared/api/terminals'
import TerminalStorage from './TerminalStorage.vue'

const props = defineProps<{
  terminalId: string
  serviceStatus?: Terminal['service_status']
  storage?: StorageObservation | null
  storageObservedAt?: string | null
  storageProbeOk?: boolean
}>()
type Capability = {
  revision: number; observed_at: string; os_name: string; architecture: string
  cpu_cores: number; memory_bytes: number; storage_available_bytes: number
  storage?: StorageObservation | null; storage_observed_at?: string | null; storage_probe_ok?: boolean
  provider_keys: string[]; adb_online: number; adb_offline: number; adb_unauthorized: number
}
const opened = ref(false)
const busy = ref(false)
const error = ref('')
const capability = ref<Capability | null>(null)
const storageSnapshot = computed(() => {
  const detail = capability.value
  const hasDetailStorage = detail !== null && Object.prototype.hasOwnProperty.call(detail, 'storage')
  return {
    storage: hasDetailStorage ? detail!.storage ?? null : props.storage ?? null,
    observedAt: hasDetailStorage ? detail!.storage_observed_at ?? null : props.storageObservedAt ?? null,
    probeOk: hasDetailStorage ? detail!.storage_probe_ok === true : props.storageProbeOk === true,
  }
})
async function show() {
  opened.value = true; busy.value = true; error.value = ''; capability.value = null
  try {
    capability.value = (await apiClient.get<Capability | null>(
      `/terminals/${props.terminalId}/capability-profile`)).data
  } catch { error.value = '无法读取终端能力，请检查连接后重试。' }
  finally { busy.value = false }
}
</script>
<template>
  <ElButton size="small" :loading="busy" @click="show">环境与手机状态</ElButton>
  <ElDrawer v-model="opened" title="终端能力快照" size="min(620px, 95vw)"><template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">终端能力快照 <HelpHint subject="终端能力快照">这是最后一次能力快照，不代表设备此刻在线；在线状态请结合终端心跳。</HelpHint></span></template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="busy">读取中…</p>
    <TerminalStorage
      :storage="storageSnapshot.storage"
      :storage-observed-at="storageSnapshot.observedAt"
      :storage-probe-ok="storageSnapshot.probeOk"
      :service-status="props.serviceStatus"
    />
    <template v-if="capability">
      <p>最后上报：{{ capability.observed_at }}（版本 {{ capability.revision }}）</p>
      
      <p>{{ capability.os_name }} / {{ capability.architecture }} / {{ capability.cpu_cores }} 核</p>
      <p>内存：{{ formatGiB(capability.memory_bytes) }}；能力快照可用存储：{{ formatGiB(capability.storage_available_bytes) }}</p>
      <p>已验证能力：{{ capability.provider_keys.join('、') || '暂无' }}</p>
      <p>ADB在线：{{ capability.adb_online }}；离线：{{ capability.adb_offline }}；待授权：{{ capability.adb_unauthorized }}</p>
      <ElAlert v-if="capability.adb_unauthorized" title="请在手机上确认USB调试授权，平台无法替代确认。" type="warning" :closable="false" />
    </template>
    <p v-else-if="!error">终端尚未上报能力。</p>
    <ElButton :disabled="busy" @click="show">刷新</ElButton>
  </ElDrawer>
</template>
