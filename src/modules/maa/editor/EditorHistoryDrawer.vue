<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElDrawer } from 'element-plus'

type HistoryEntry = {
  id: string
  source: 'local' | 'saved'
  label: string
  time: number | null
  steps?: number
  current?: boolean
}

const props = defineProps<{
  modelValue: boolean
  entries: HistoryEntry[]
  selectedId?: string
  loading: boolean
  error?: string
  more: boolean
  restoringDisabled: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [id: string]
  more: []
  restore: []
  retry: []
}>()

const selectedEntry = computed(() => props.entries.find(entry => entry.id === props.selectedId))

const sourceGroups = computed(() => {
  const groups: Array<{ source: HistoryEntry['source']; entries: HistoryEntry[] }> = []
  for (const entry of props.entries) {
    const last = groups.at(-1)
    if (last?.source === entry.source) last.entries.push(entry)
    else groups.push({ source: entry.source, entries: [entry] })
  }
  return groups
})

function sourceLabel(source: HistoryEntry['source']): string {
  return source === 'local' ? '本地修改' : '已保存版本'
}

function formatTime(time: number | null): string {
  if (time === null || !Number.isFinite(time)) return '时间未记录'
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString()
}

function timeAttribute(time: number | null): string | undefined {
  if (time === null || !Number.isFinite(time)) return undefined
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
</script>

<template>
  <ElDrawer
    class="editor-history-drawer"
    :model-value="modelValue"
    title="编辑历史"
    size="min(980px,100vw)"
    :destroy-on-close="true"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="history-workspace">
      <aside class="history-list-panel" aria-label="编辑历史列表">
        <div class="history-list" aria-live="polite">
          <p v-if="loading" class="history-feedback" role="status">正在加载编辑历史…</p>
          <p v-if="error" class="history-feedback history-error" role="alert">{{ error }}</p>

          <section v-for="group in sourceGroups" :key="`${group.source}-${group.entries[0]?.id ?? ''}`" class="history-source-group">
            <h2 class="history-source-label">{{ sourceLabel(group.source) }}</h2>
            <button
              v-for="entry in group.entries"
              :key="entry.id"
              type="button"
              class="history-entry"
              :class="{ selected: entry.id === selectedId }"
              :data-history-entry="entry.id"
              :aria-current="entry.id === selectedId ? 'true' : undefined"
              @click="emit('select', entry.id)"
            >
              <span class="history-entry-main">
                <span class="history-entry-label">{{ entry.label }}</span>
                <span class="history-entry-meta">
                  <time :datetime="timeAttribute(entry.time)">{{ formatTime(entry.time) }}</time>
                  <span v-if="entry.current" class="history-badge">当前状态</span>
                  <span v-if="entry.steps !== undefined" class="history-badge">{{ entry.steps }} 步</span>
                </span>
              </span>
            </button>
          </section>

          <p v-if="!loading && !error && !entries.length" class="history-feedback">暂无编辑历史</p>
        </div>

        <div class="history-list-actions">
          <ElButton v-if="error" data-history-retry :disabled="loading" @click="emit('retry')">重试</ElButton>
          <ElButton v-if="more" data-history-more :loading="loading" :disabled="loading" @click="emit('more')">加载更多</ElButton>
        </div>
      </aside>

      <section class="history-detail-panel" aria-label="历史记录详情">
        <header class="history-detail-heading">
          <h2>{{ selectedEntry?.label ?? '选择历史记录' }}</h2>
          <span v-if="selectedEntry" class="history-detail-source">{{ sourceLabel(selectedEntry.source) }}</span>
        </header>
        <div class="history-detail-content">
          <p v-if="loading" class="history-feedback" role="status">正在加载详情…</p>
          <p v-if="error" class="history-feedback history-error" role="alert">{{ error }}</p>
          <section class="history-summary" aria-label="变更摘要">
            <slot name="summary" />
          </section>
          <section class="history-preview" aria-label="文档预览">
            <slot name="preview" />
          </section>
        </div>
        <footer class="history-detail-actions">
          <ElButton
            data-history-restore
            type="primary"
            :disabled="restoringDisabled || loading || !selectedEntry"
            @click="emit('restore')"
          >恢复为草稿</ElButton>
        </footer>
      </section>
    </div>
  </ElDrawer>
</template>

<style scoped>
.editor-history-drawer :deep(.el-drawer__body) {
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.history-workspace {
  display: grid;
  grid-template-columns: minmax(250px, 36%) minmax(0, 1fr);
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
}

.history-list-panel,
.history-detail-panel {
  min-width: 0;
  min-height: 0;
}

.history-list-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface-soft);
}

.history-list {
  flex: 1;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
  overflow-x: hidden;
}

.history-source-group + .history-source-group { margin-top: 18px; }

.history-source-label {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.history-entry {
  display: flex;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 10px 11px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.history-entry:hover { background: var(--surface); }
.history-entry.selected { border-color: var(--el-color-primary); background: var(--surface); }

.history-entry-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.history-entry-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.history-entry-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  color: var(--muted);
  font-size: 12px;
}

.history-badge {
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  white-space: nowrap;
}

.history-list-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--border);
}

.history-feedback {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.history-error { color: var(--el-color-danger); }

.history-detail-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
}

.history-detail-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
  flex: none;
  min-width: 0;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}

.history-detail-heading h2 {
  min-width: 0;
  margin: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.history-detail-source { color: var(--muted); font-size: 12px; }

.history-detail-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 18px 22px;
  overflow-y: auto;
  overflow-x: hidden;
  overflow-wrap: anywhere;
}

.history-summary,
.history-preview { min-width: 0; }
.history-preview { margin-top: 18px; }

.history-detail-actions {
  display: flex;
  justify-content: flex-end;
  flex: none;
  min-width: 0;
  padding: 12px 22px 18px;
  border-top: 1px solid var(--border);
}

@media (max-width: 680px) {
  .editor-history-drawer :deep(.el-drawer__body) { overflow: auto; }
  .history-workspace {
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .history-list-panel {
    flex: 0 1 45vh;
    max-height: 45vh;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .history-detail-panel { flex: 1 1 auto; min-height: 320px; }
  .history-detail-heading,
  .history-detail-content,
  .history-detail-actions { padding-left: 16px; padding-right: 16px; }
}
</style>
