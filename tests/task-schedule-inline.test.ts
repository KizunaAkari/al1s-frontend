import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import TaskCenterView from '../src/modules/tasks/TaskCenterView.vue'
const route = reactive({ name: 'task-schedules', query: {} })
vi.mock('vue-router', () => ({ useRoute: () => route }))
const schedule = { task_id: 'task-1', schedule_id: 'schedule-1', name: '每日计划', schedule_type: 'timed', status: 'active',
  total_occurrences: 3, settled_occurrences: 1, planned_occurrences: 2, skipped_occurrences: 0, cancelled_occurrences: 0,
  current_occurrence_ordinal: null, next_occurrence_ordinal: 2, row_version: 1,
  start_date: '2026-10-19', end_date: '2026-10-21', daily_times: ['11:00:00'], timezone: 'Asia/Shanghai',
  pause: { allowed: true }, resume: { allowed: false }, revise: { allowed: true }, terminate: { allowed: true } }
const finished = { occurrence_id: 'round-1', schedule_revision: 1, display_ordinal: 1, history_ordinal: 1,
  scheduled_for: '2026-10-19T03:00:00Z', status: 'materialized', execution_id: 'execution-1', execution_status: 'ended', execution_result: 'failure' }
const planned = { ...finished, occurrence_id: 'round-2', display_ordinal: 2, status: 'planned', execution_id: null, execution_status: null, execution_result: null }
const stubs = {
  PageHeader: { template: '<header><slot /></header>' }, DataState: { template: '<div><slot /></div>' },
  RouterLink: { template: '<a><slot /></a>' }, TaskHistoryCleanup: true, TaskSubmissionDialog: true,
  TaskRecordingsDrawer: true, ScheduleRevisionDialog: true, ElDrawer: true,
  ElButton: { template: '<button><slot /></button>' }, ElTooltip: { template: '<span><slot /></span>' },
  TaskDetailsDrawer: { name: 'TaskDetailsDrawer', props: ['modelValue', 'task', 'executionId'],
    template: '<div v-if="modelValue" data-details>{{ task.task_id }} {{ executionId }}</div>' },
}
function setup() {
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path, options) => {
    if (path === '/task-schedules') return { data: { items: [schedule, { ...schedule, task_id: 'task-2', schedule_id: 'schedule-2', name: '另一计划' }], next_cursor: null } } as never
    const params = options?.params as { cursor?: string; scope?: string } | undefined
    return { data: { items: params?.cursor ? [{ ...finished, occurrence_id: 'older' }]
      : params?.scope === 'history' ? [{ ...finished, occurrence_id: 'historical', history_ordinal: 8 }]
        : [finished, planned], next_cursor: params?.cursor ? null : 'page-2' } } as never
  })
  return { get, wrapper: mount(TaskCenterView, { global: { stubs } }) }
}
afterEach(() => vi.restoreAllMocks())
it('loads rounds only after expanding the task card and collapses them in place', async () => {
  const { get, wrapper } = setup(); await flushPromises()
  expect(get).toHaveBeenCalledTimes(1)
  await wrapper.findAll('button').find(button => button.text() === '查看轮次')!.trigger('click'); await flushPromises()
  expect(wrapper.get('.schedule-card .schedule-occurrences-list').text()).toContain('失败')
  expect(wrapper.find('el-drawer-stub[title*="轮次"]').exists()).toBe(false)
  expect(wrapper.find('[data-details]').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '收起轮次')!.trigger('click'); await flushPromises()
  expect(wrapper.find('.schedule-occurrences-list').exists()).toBe(false)
  wrapper.unmount()
})
it('opens the selected execution in the single task drawer and keeps its round list', async () => {
  const { wrapper } = setup(); await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '查看轮次')!.trigger('click'); await flushPromises()
  const rows = wrapper.findAll('.schedule-occurrences-list tbody tr')
  expect(rows[1]!.find('button').exists()).toBe(false)
  await rows[0]!.get('button').trigger('click'); await flushPromises()
  expect(wrapper.get('[data-details]').text()).toBe('task-1 execution-1')
  expect(wrapper.findAll('.schedule-occurrences-list')).toHaveLength(1)
  wrapper.getComponent({ name: 'TaskDetailsDrawer' }).vm.$emit('update:modelValue', false); await flushPromises()
  expect(wrapper.findAll('.schedule-occurrences-list tbody tr')).toHaveLength(2)
  wrapper.unmount()
})
it('keeps scope switching and cursor pagination without per-row detail requests', async () => {
  const { get, wrapper } = setup(); await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '查看轮次')!.trigger('click'); await flushPromises()
  wrapper.get('[aria-label="轮次视图"]').getComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'history')
  await flushPromises()
  expect(get).toHaveBeenLastCalledWith('/task-schedules/schedule-1/occurrences', { params: { cursor: undefined, limit: 50, scope: 'history' } })
  expect(wrapper.get('.schedule-occurrences-list').text()).toContain('历史 #8')
  await wrapper.get('.schedule-occurrences-list .list-footer button').trigger('click'); await flushPromises()
  expect(get).toHaveBeenLastCalledWith('/task-schedules/schedule-1/occurrences', { params: { cursor: 'page-2', limit: 50, scope: 'history' } })
  expect(get.mock.calls.every(([path]) => !String(path).endsWith('/details'))).toBe(true)
  wrapper.unmount()
})
