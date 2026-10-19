<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ElButton, ElRadioButton, ElRadioGroup } from 'element-plus'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useCursorPage } from '../../shared/api/pagination'
import {
  fetchScheduleOccurrences,
  type ActiveSchedule,
  type OccurrenceItem,
  type OccurrenceScope,
} from '../../shared/api/tasks'
import { formatDateTime } from '../../shared/presentation/format'
import DataState from '../../shared/ui/DataState.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import { statusTone } from '../../shared/presentation/status'

const props = defineProps<{
  schedule: ActiveSchedule
}>()
const emit = defineEmits<{ openExecution: [item: OccurrenceItem] }>()

const scheduleId = computed(() => props.schedule?.schedule_id ?? '')
const scope = ref<OccurrenceScope>('current')
const occurrences = useCursorPage<OccurrenceItem, string>(
  (cursor) => fetchScheduleOccurrences(scheduleId.value, cursor, scope.value),
  (item) => item.occurrence_id,
)

watch(
  () => [scheduleId.value, props.schedule.row_version] as const,
  ([id]) => {
    if (id) {
      if (scope.value === 'current') void occurrences.load(true)
      else scope.value = 'current'
    }
  },
  { immediate: true },
)

watch(scope, () => {
  if (scheduleId.value) void occurrences.load(true)
})
onBeforeUnmount(occurrences.reset)
const occurrenceLabels = { planned: '待执行', materialized: '已生成执行', skipped: '已跳过', cancelled: '已取消' }

const emptyTitle = computed(() => (
  scope.value === 'current' ? '暂无当前有效轮次' : '暂无历史修订轮次'
))

function resultValue(item: OccurrenceItem): string | null {
  return item.execution_status === 'ended' ? item.execution_result : null
}
</script>

<template>
  <section class="schedule-occurrences-list" :id="`schedule-occurrences-${schedule.schedule_id}`" :aria-label="`${schedule.name} · 轮次列表`">
    <div class="occurrences-toolbar">
      <ElRadioGroup v-model="scope" size="small" aria-label="轮次视图">
        <ElRadioButton value="current">当前计划</ElRadioButton>
        <ElRadioButton value="history">历史修订</ElRadioButton>
      </ElRadioGroup>
      <div class="occurrences-tools"><HelpHint subject="轮次视图">历史修订中的已取消轮次不计入当前计划总数</HelpHint><ElButton size="small" :loading="occurrences.loading.value" @click="occurrences.load(true)">刷新轮次</ElButton></div>
    </div>
    <DataState
      :loading="occurrences.loading.value"
      :loaded="occurrences.loaded.value"
      :empty="occurrences.items.value.length === 0"
      :error="occurrences.error.value"
      :empty-title="emptyTitle"
      @retry="occurrences.load(occurrences.items.value.length === 0)"
    >
      <div class="table-shell">
        <table class="data-table occurrences-table">
          <thead><tr><th>轮次</th><th>修订</th><th>计划时间</th><th>轮次状态</th><th>执行状态</th><th>结果</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in occurrences.items.value" :key="item.occurrence_id">
              <td data-label="轮次">
                <strong v-if="scope === 'current'">第 {{ item.display_ordinal }} / {{ schedule?.total_occurrences }}</strong>
                <strong v-else>历史 #{{ item.history_ordinal }}</strong>
              </td>
              <td data-label="修订">{{ item.schedule_revision ? `修订 ${item.schedule_revision}` : '---' }}</td>
              <td data-label="计划时间">{{ formatDateTime(item.scheduled_for) }}</td>
              <td data-label="轮次状态"><span class="status-badge" :class="`status-badge--${statusTone(item.status)}`">{{ occurrenceLabels[item.status] }}</span></td>
              <td data-label="执行状态"><StatusBadge :value="item.execution_status" /></td>
              <td data-label="结果"><StatusBadge v-if="resultValue(item)" :value="resultValue(item)" /><span v-else>---</span></td>
              <td data-label="操作"><ElButton v-if="item.execution_id" size="small" @click="emit('openExecution', item)">详情</ElButton><span v-else class="no-execution">尚未执行</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="occurrences.nextCursor.value || occurrences.error.value" class="list-footer">
        <span v-if="occurrences.error.value">{{ occurrences.error.value.message }}</span>
        <ElButton v-if="occurrences.nextCursor.value" :loading="occurrences.loading.value" @click="occurrences.load()">
          加载更多
        </ElButton>
      </div>
    </DataState>
  </section>
</template>

<style scoped>
.schedule-occurrences-list { margin-top:16px; padding-top:16px; border-top:1px solid var(--border); }
.occurrences-table { table-layout:fixed; min-width:0; }
.occurrences-table th:nth-child(2) { width:72px; }
.occurrences-table th:nth-child(3) { width:160px; }
.occurrences-table th:last-child { width:82px; }
.occurrences-table td { overflow-wrap:anywhere; }
.no-execution { color:var(--muted); font-size:12px; }
.occurrences-tools { display:flex; align-items:center; gap:12px; }
.occurrences-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.occurrences-toolbar > span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: right;
}

@media (max-width: 800px) {
  .occurrences-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .occurrences-toolbar > span {
    text-align: left;
  }
  .occurrences-table, .occurrences-table tbody { display:block; width:100%; }
  .occurrences-table thead { display:none; }
  .occurrences-table tr { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; padding:12px 0; border-bottom:1px solid var(--border); }
  .occurrences-table td { display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding:0; min-width:0; border:0; }
  .occurrences-table td::before { content:attr(data-label); font-size:11px; color:var(--muted); }
  .occurrences-table td:last-child { grid-column:1/-1; align-items:flex-end; }
}
</style>
