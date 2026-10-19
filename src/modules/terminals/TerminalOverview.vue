<script setup lang="ts">
import type { ApiError } from '../../shared/api/client'
import type { TargetDevice, Terminal } from '../../shared/api/terminals'
import { formatDateTime } from '../../shared/presentation/format'
import LogicalPhones from './LogicalPhones.vue'
import StorageSummary from './StorageSummary.vue'
import TerminalDiscoveries from './TerminalDiscoveries.vue'
import AndroidSetupCheck from './AndroidSetupCheck.vue'

defineProps<{
  terminal: Terminal
  terminals: Terminal[]
  devices: TargetDevice[]
  devicesLoading: boolean
  devicesLoaded: boolean
  devicesError: ApiError | null
  devicesHasMore: boolean
}>()
const scope = defineModel<'current' | 'unbound' | 'all'>('scope', { default: 'current' })
defineEmits<{
  binding: [device: TargetDevice]
  renamed: [device: TargetDevice]
  more: []
  retry: []
  connected: []
  storageDetails: []
}>()
</script>

<template>
  <div class="terminal-overview">
    <LogicalPhones
      v-model:scope="scope"
      :items="devices"
      :terminals="terminals"
      :terminal-id="terminal.terminal_id"
      :loading="devicesLoading"
      :loaded="devicesLoaded"
      :error="devicesError"
      :has-more="devicesHasMore"
      @binding="$emit('binding', $event)"
      @renamed="$emit('renamed', $event)"
      @more="$emit('more')"
      @retry="$emit('retry')"
    >
      <template v-if="terminal.terminal_type === 'linux'" #after>
        <TerminalDiscoveries :key="terminal.terminal_id" :terminal="terminal" @connected="$emit('connected')" />
      </template>
    </LogicalPhones>
    <div class="overview-panels">
      <AndroidSetupCheck v-if="terminal.terminal_type==='android'" :key="terminal.terminal_id" :terminal-id="terminal.terminal_id" />
      <StorageSummary :terminal="terminal" @details="$emit('storageDetails')" />
      <section class="terminal-info-card" aria-label="终端信息">
        <h3>终端信息</h3>
        <dl>
          <div><dt>系统</dt><dd>{{ terminal.terminal_type === 'linux' ? 'Linux' : terminal.terminal_type === 'android' ? 'Android' : '—' }}</dd></div>
          <div><dt>Agent 版本</dt><dd>{{ terminal.agent_version || '—' }}</dd></div>
        </dl>
      </section>
    </div>
    <details class="technical-details">
      <summary><span class="technical-chevron" aria-hidden="true">›</span><strong>更多技术信息 </strong></summary>
      <dl class="detail-grid">
        <div><dt>能力档案</dt><dd>{{ terminal.current_capability_profile_id || '—' }}</dd></div>
        <div><dt>记录版本</dt><dd>{{ terminal.row_version }}</dd></div>
        <div><dt>存储观测时间</dt><dd>{{ formatDateTime(terminal.storage_observed_at).replace('---', '—') }}</dd></div>
      </dl>
      
    </details>
  </div>
</template>
