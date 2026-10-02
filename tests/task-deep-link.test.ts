import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { apiClient } from '../src/shared/api/client'
import { router } from '../src/app/router'
import TaskCenterView from '../src/modules/tasks/TaskCenterView.vue'

const routeState = vi.hoisted(() => ({
  name: 'task-history',
  query: {} as Record<string, unknown>,
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRoute: () => routeState }
})

const taskId = '123e4567-e89b-12d3-a456-426614174000'

const stubs = {
  PageHeader: { template: '<header><slot /></header>' },
  DataState: { template: '<div><slot /></div>' },
  StatusBadge: { template: '<span />' },
  ScheduleOccurrencesDrawer: true,
  ScheduleRevisionDialog: true,
  TaskRecordingsDrawer: true,
  TaskSubmissionDialog: true,
  TaskHistoryCleanup: true,
  RouterLink: { template: '<a><slot /></a>' },
  ElButton: { template: '<button><slot /></button>' },
  ElTooltip: { template: '<span><slot /></span>' },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { template: '<button><slot /></button>' },
  TaskDetailsDrawer: {
    props: ['modelValue', 'task'],
    template: '<div v-if="modelValue" data-testid="task-details">{{ task && task.task_id }}</div>',
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  routeState.name = 'task-history'
  routeState.query = {}
})

describe('task deep links', () => {
  it('uses normal badges for the whole batch rather than the last image result', async () => {
    const batch = { task_id: taskId, name: '阵容识别 · 2 张', task_type: 'batch', lifecycle_status: 'completed',
      latest_execution_status: 'ended', latest_result: 'success', source_module: 'lineup_batch',
      batch_summary: { image_count: 2, execution_status: 'ended', result: 'failure' },
      cancel: { allowed: false }, delete: { allowed: true }, created_at: '2026-10-01T12:00:00Z' }
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [batch], next_cursor: null } })
    const wrapper = mount(TaskCenterView, { global: { stubs: { ...stubs,
      StatusBadge: { props: ['value'], template: '<span class="status-badge">{{ value }}</span>' },
    } } })
    await flushPromises()
    expect(wrapper.text()).toContain('阵容识别 · 2 张')
    expect(wrapper.text()).not.toContain('查看图片明细')
    expect(wrapper.text()).not.toContain('处理结束')
    const badges = wrapper.findAll('.status-badge').map(badge => badge.text())
    expect(badges).toContain('ended')
    expect(badges).toContain('failure')
    expect(badges).not.toContain('success')
    wrapper.unmount()
  })
  it('uses the history page as the real task URL behind the /tasks redirect', () => {
    const resolved = router.resolve('/tasks/history?task_id=' + taskId)
    const redirect = router.getRoutes().find((route) => route.path === '/tasks')?.redirect

    expect(resolved.path).toBe('/tasks/history')
    expect(resolved.query.task_id).toBe(taskId)
    expect(redirect).toBe('/tasks/history')
  })

  it('opens a valid task directly without waiting for the history page', async () => {
    routeState.query = { task_id: taskId }
    let resolveHistory!: (value: unknown) => void
    const historyPending = new Promise((resolve) => { resolveHistory = resolve })
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(historyPending as never)

    const wrapper = mount(TaskCenterView, { global: { stubs } })
    await nextTick()

    expect(wrapper.get('[data-testid="task-details"]').text()).toBe(taskId)
    expect(get).toHaveBeenCalledWith('/tasks', {
      params: { cursor: undefined, limit: 30 },
    })

    resolveHistory({ data: { items: [], next_cursor: null } })
    await flushPromises()
    wrapper.unmount()
  })

  it('does not open or request task details for an invalid task_id', async () => {
    routeState.query = { task_id: 'not-a-uuid' }
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { items: [], next_cursor: null },
    } as never)

    const wrapper = mount(TaskCenterView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="task-details"]').exists()).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/tasks', {
      params: { cursor: undefined, limit: 30 },
    })
    expect(get.mock.calls.some(([url]) => String(url).includes('/details'))).toBe(false)
    wrapper.unmount()
  })
})
