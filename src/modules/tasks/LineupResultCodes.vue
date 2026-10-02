<script setup lang="ts">
import { computed } from 'vue'
import { ElButton } from 'element-plus'
import type { WorkspaceDetail } from '../../shared/api/lineup-workspace'
import { workspaceCodes } from '../lineup/workspace-export'

const props = defineProps<{ item: WorkspaceDetail }>()
const emit = defineEmits<{ copy: [code: string | null, label: string] }>()
const codes = computed(() => workspaceCodes(props.item))
</script>

<template>
  <div class="record-codes">
    <div class="code-side">
      <div class="code-heading"><span>进攻方 ID</span><ElButton size="small" text :disabled="!codes.attack" aria-label="复制攻击方阵容码" @click="emit('copy', codes.attack, '进攻方 ID')">复制</ElButton></div>
      <code aria-label="进攻方 ID" :class="{ unavailable: !codes.attack }">{{ codes.attack || '尚无可用阵容' }}</code>
    </div>
    <div class="code-side">
      <div class="code-heading"><span>防守方 ID</span><ElButton size="small" text :disabled="!codes.defense" aria-label="复制防守方阵容码" @click="emit('copy', codes.defense, '防守方 ID')">复制</ElButton></div>
      <code aria-label="防守方 ID" :class="{ unavailable: !codes.defense }">{{ codes.defense || '尚无可用阵容' }}</code>
    </div>
    <ElButton class="copy-pair" size="small" type="primary" plain :disabled="!codes.pair" aria-label="复制攻防对" @click="emit('copy', codes.pair, '攻防对')">复制攻防对</ElButton>
  </div>
</template>

<style scoped>
.record-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: 12px; align-items: end; padding: 10px 12px 14px; border-top: 1px solid var(--workspace-border); }
.code-side { min-width: 0; }
.code-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; color: var(--muted, var(--el-text-color-secondary)); font-size: 12px; }
.code-heading .el-button { height: 24px; padding: 2px 7px; }
.code-side code { display: block; padding: 9px 10px; border-radius: 6px; background: var(--el-fill-color-light); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; user-select: text; }
.code-side .unavailable { color: var(--muted, var(--el-text-color-secondary)); font-family: inherit; }
.copy-pair { height: 38px; margin: 0; }
@media (max-width: 1000px) { .record-codes { grid-template-columns: minmax(0, 1fr); } .copy-pair { justify-self: end; } }
</style>
