<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ElButton, ElDatePicker, ElDialog, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import {
  reviseTimedSchedule,
  type ActiveSchedule,
} from '../../shared/api/tasks'

const props = defineProps<{
  modelValue: boolean
  schedule: ActiveSchedule | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

const startDate = ref('')
const endDate = ref('')
const dailyTimesText = ref('')
const submitting = ref(false)

const parsedTimes = computed(() =>
    [...new Set(dailyTimesText.value.split(/[、，,\s]+/).map((value) => value.trim()).filter(Boolean))],
)
const validTimes = computed(
  () => parsedTimes.value.length > 0 && parsedTimes.value.every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)),
)
const canSubmit = computed(
  () => Boolean(startDate.value && endDate.value && startDate.value <= endDate.value && validTimes.value),
)

watch(
  () => [props.modelValue, props.schedule] as const,
  ([visible, schedule]) => {
    if (!visible || schedule === null) return
    startDate.value = schedule.start_date ?? ''
    endDate.value = schedule.end_date ?? ''
    dailyTimesText.value = schedule.daily_times.map((value) => value.slice(0, 5)).join('、')
  },
  { immediate: true },
)

function close(): void {
  if (!submitting.value) emit('update:modelValue', false)
}

async function submit(): Promise<void> {
  const schedule = props.schedule
  if (schedule === null || !canSubmit.value) return
  submitting.value = true
  try {
    const result = await reviseTimedSchedule(schedule, {
      start_date: startDate.value,
      end_date: endDate.value,
      daily_times: parsedTimes.value.map((value) => `${value}:00`),
    })
    ElMessage.success(
      result.changed
        ? `计划已更新为修订 ${result.revision}：新增 ${result.added_occurrences}，取消 ${result.cancelled_occurrences}`
        : '计划定义没有变化',
    )
    emit('updated')
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改计划失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="修改定时任务"
    width="min(560px, calc(100vw - 32px))"
    :close-on-click-modal="false"
    :before-close="close"
    @close="emit('update:modelValue', false)"
  >
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">修改定时任务 <HelpHint subject="修改定时任务">
      只修改尚未实例化的未来轮次。任务已经开始后，开始日期由服务端锁定；旧修订和旧轮次继续保留为历史。
    </HelpHint></span></template>
    <ElForm label-position="top">
      <div class="form-grid">
        <ElFormItem label="开始日期">
          <ElDatePicker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="选择开始日期" />
        </ElFormItem>
        <ElFormItem label="结束日期">
          <ElDatePicker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="选择结束日期" />
        </ElFormItem>
      </div>
      <ElFormItem label="每日执行时间"><template #label>每日执行时间 <HelpHint subject="每日执行时间">使用 24 小时制，多个时间用逗号或空格分隔。</HelpHint></template>
        <ElInput v-model="dailyTimesText" placeholder="例如：11:00，19:00" />
        
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton :disabled="submitting" @click="close">取消</ElButton>
      <ElButton type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">
        保存新修订
      </ElButton>
    </template>
  </ElDialog>
</template>
