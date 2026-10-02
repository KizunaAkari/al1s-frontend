<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ElButton, ElDrawer, ElRadioButton, ElRadioGroup } from 'element-plus'
import { computed, ref, watch } from 'vue'

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

const props = defineProps<{
  modelValue: boolean
  schedule: ActiveSchedule | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const scheduleId = computed(() => props.schedule?.schedule_id ?? '')
const scope = ref<OccurrenceScope>('current')
const occurrences = useCursorPage<OccurrenceItem, string>(
  (cursor) => fetchScheduleOccurrences(scheduleId.value, cursor, scope.value),
  (item) => item.occurrence_id,
)

watch(
  () => [props.modelValue, scheduleId.value] as const,
  ([visible, id], previous) => {
    if (visible && id && (!previous || !previous[0] || previous[1] !== id)) {
      if (scope.value === 'current') void occurrences.load(true)
      else scope.value = 'current'
    }
  },
  { immediate: true },
)

watch(scope, () => {
  if (props.modelValue && scheduleId.value) void occurrences.load(true)
})

const emptyTitle = computed(() => (
  scope.value === 'current' ? '暂无当前有效轮次' : '暂无历史修订轮次'
))

function resultValue(item: OccurrenceItem): string | null {
  return item.execution_status === 'ended' ? item.execution_result : null
}
</script>

<template>
  <ElDrawer
    :model-value="modelValue"
    :title="schedule ? `${schedule.name} · 轮次详情` : '轮次详情'"
    size="min(760px, 92vw)"
    @close="emit('update:modelValue', false)"
  >
    <div class="drawer-toolbar">
      <ElRadioGroup v-model="scope" size="small" aria-label="轮次视图">
        <ElRadioButton value="current">当前计划</ElRadioButton>
        <ElRadioButton value="history">历史修订</ElRadioButton>
      </ElRadioGroup>
      <HelpHint subject="轮次视图">历史修订中的已取消轮次不计入当前计划总数</HelpHint>
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
        <table class="data-table">
          <thead><tr><th>轮次</th><th>修订</th><th>计划时间</th><th>轮次状态</th><th>执行状态</th><th>结果</th></tr></thead>
          <tbody>
            <tr v-for="item in occurrences.items.value" :key="item.occurrence_id">
              <td>
                <strong v-if="scope === 'current'">第 {{ item.display_ordinal }} / {{ schedule?.total_occurrences }}</strong>
                <strong v-else>历史 #{{ item.history_ordinal }}</strong>
              </td>
              <td>{{ item.schedule_revision ? `修订 ${item.schedule_revision}` : '---' }}</td>
              <td>{{ formatDateTime(item.scheduled_for) }}</td>
              <td><StatusBadge :value="item.status" /></td>
              <td><StatusBadge :value="item.execution_status" /></td>
              <td><StatusBadge v-if="resultValue(item)" :value="resultValue(item)" /><span v-else>---</span></td>
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
  </ElDrawer>
</template>

<style scoped>
.drawer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.drawer-toolbar > span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: right;
}

@media (max-width: 640px) {
  .drawer-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .drawer-toolbar > span {
    text-align: left;
  }
}
</style>
