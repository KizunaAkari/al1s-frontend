<script setup lang="ts">
import { computed } from 'vue'

import type { StorageObservation, Terminal } from '../../shared/api/terminals'
import { formatDateTime as dateTime, formatGiB as gib } from '../../shared/presentation/format'
const formatDateTime = (value: string | null | undefined) => dateTime(value).replace('---', '—')
const formatGiB = (value: number | null | undefined) => gib(value).replace('---', '—')

const props = defineProps<{
  storage?: StorageObservation | null
  storageObservedAt?: string | null
  storageProbeOk?: boolean
  serviceStatus?: Terminal['service_status']
}>()

const isCurrent = computed(() => (
  props.storage !== null
  && props.storage !== undefined
  && props.storageProbeOk === true
  && props.serviceStatus === 'online'
))

const availablePercent = computed(() => {
  const storage = props.storage
  if (!storage || !Number.isFinite(storage.total_bytes) || storage.total_bytes <= 0
      || !Number.isFinite(storage.available_bytes) || storage.available_bytes < 0) return null
  return Math.max(0, Math.min(100, storage.available_bytes / storage.total_bytes * 100))
})
</script>

<template>
<section class="terminal-storage" aria-label="存储空间">
  <div class="terminal-storage__heading">
    <strong>存储空间</strong>
    <span>{{ isCurrent ? '当前观测' : '最后观测/当前未知' }}</span>
  </div>
  <template v-if="storage">
    <dl class="detail-grid">
      <div><dt>所在目录</dt><dd><code>{{ storage.directory }}</code></dd></div>
      <div><dt>总量</dt><dd>{{ formatGiB(storage.total_bytes) }}</dd></div>
      <div><dt>已用</dt><dd>{{ formatGiB(storage.used_bytes) }}</dd></div>
      <div><dt>可用</dt><dd>{{ formatGiB(storage.available_bytes) }}</dd></div>
      <div><dt>可用百分比</dt><dd>{{ availablePercent === null ? '—' : `${availablePercent.toFixed(1)}%` }}</dd></div>
      <div><dt>观测时间</dt><dd>{{ formatDateTime(storageObservedAt) }}</dd></div>
    </dl>
  </template>
  <p v-else>—（当前未知）</p>
</section>
</template>
