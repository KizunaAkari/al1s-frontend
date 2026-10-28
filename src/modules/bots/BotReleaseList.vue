<script setup lang="ts">
import { ElButton } from 'element-plus'
import type { ComponentRelease } from '../../shared/api/components'
import { formatDateTime } from '../../shared/presentation/format'
import { compareBotVersions } from './bot-version-order'

defineProps<{ versions: readonly ComponentRelease[]; alias: 'qq' | 'discord'; busy: boolean; currentVersion: string | null; architecture: string | null; ready: boolean }>()
defineEmits<{ prepare: [row: ComponentRelease]; select: [row: ComponentRelease] }>()
const labels = { draft: '待准备', queued: '等待准备', verifying: '正在准备完整镜像', published: '可安装', failed: '准备失败' }
function action(row: ComponentRelease, current: string | null) {
  const difference = compareBotVersions(row.native_version, current)
  return difference < 0 ? '降级到此版本' : difference > 0 ? '升级到此版本' : '应用此版本'
}
</script>
<template>
  <div class="bot-update-versions">
    <article v-for="row in versions" :key="row.release_id" :data-version="row.native_version">
      <strong>{{ row.native_version }}<small v-if="row.runtime_version"> · 表情 {{ row.runtime_version }}</small></strong>
      <span>{{ row.architecture }} · {{ labels[row.state] }}</span>
      <a v-if="alias === 'qq' && row.source_url" :href="row.source_url" target="_blank" rel="noopener noreferrer">官方说明 ↗</a>
      <span v-if="row.source_published_at">{{ formatDateTime(row.source_published_at) }}</span>
      <details v-if="row.source_notes"><summary>更新说明</summary><p class="release-notes">{{ row.source_notes }}</p></details>
      <ElButton v-if="alias === 'qq' && ['draft','failed'].includes(row.state)" :disabled="busy" @click="$emit('prepare', row)">准备此版本</ElButton>
      <ElButton v-if="row.state === 'published'" data-action="select-version" :disabled="busy || !ready || row.architecture !== architecture" @click="$emit('select', row)">{{ action(row, currentVersion) }}</ElButton>
      <span v-if="row.error_code" class="bot-inline-error">{{ row.error_code }}</span>
    </article>
  </div>
</template>
<style scoped>
.bot-update-versions{display:grid;gap:8px;min-width:0}.bot-update-versions article{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;min-width:0}.bot-update-versions small{font-weight:normal}.release-notes{white-space:pre-wrap;overflow-wrap:anywhere}p{margin:0}
</style>
