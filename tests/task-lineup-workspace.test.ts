import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import TaskLineupWorkspace from '../src/modules/tasks/TaskLineupWorkspace.vue'
import * as lineupApi from '../src/shared/api/lineup'
import * as workspaceApi from '../src/shared/api/lineup-workspace'
import type { LineupCatalog } from '../src/shared/api/lineup'
import type { LineupTask, WorkspaceDetail } from '../src/shared/api/lineup-workspace'

const stubs = {
  RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot /></button>' },
  ElTag: { template: '<span><slot /></span>' },
  ElSelect: { props: ['modelValue'], template: '<select :value="modelValue"><slot /></select>' },
  ElOption: { props: ['value'], template: '<option :value="value"><slot /></option>' },
}

const catalog: LineupCatalog = {
  version: 'catalog-1',
  students: [
    { id: 10001, name: '攻击学生', aliases: [] },
    { id: 20001, name: '支援学生', aliases: [] },
  ],
}

function detail(overrides: Partial<WorkspaceDetail> = {}): WorkspaceDetail {
  return {
    id: 'record-1', name: 'battle.png', width: 1200, height: 800,
    catalog_version: 'catalog-1', created_at: '2026-10-01T00:00:00Z', task_id: 'task-1',
    state: 'failure', error_code: 'runtime_failure', result: null, review: null, row_version: 1,
    annotation: null, needs_attention: true, attention_reason: 'runtime_failure', ordinal: 1,
    usable_result: null, ...overrides,
  }
}

function task(overrides: Partial<LineupTask> = {}): LineupTask {
  return {
    task_id: 'task-1', name: '阵容批次', lifecycle_status: 'completed', created_at: '2026-10-01T00:00:00Z',
    row_version: 1, retry_source_task_id: null, terminal_id: 'terminal-1',
    options: { layout_hint: 'auto', recognition_mode: 'auto' },
    summary: { total: 1, finished: 1, usable: 0, needs_attention: 1, failure: 1, running: 0 },
    items: [detail()], next_cursor: null, ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mountWorkspace(props: { taskId: string }) {
  vi.spyOn(lineupApi, 'fetchLineupCatalog').mockResolvedValue(catalog)
  return mount(TaskLineupWorkspace, { props, global: { stubs } })
}

describe('TaskLineupWorkspace', () => {
  it('shows both IDs and copies the pair without expanding the image', async () => {
    const item = detail({ state: 'success', error_code: null, needs_attention: false, attention_reason: 'none',
      usable_result: { layout_valid: true, teams: ['attack', 'defense'], team_sizes: { attack: 1, defense: 1 },
        slots: [{ side: 'attack', index: 0, selected_id: 10001, accepted: true }, { side: 'defense', index: 0, selected_id: 10002, accepted: true }] } })
    vi.spyOn(workspaceApi, 'fetchLineupTask').mockResolvedValue(task({ items: [item] }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mountWorkspace({ taskId: 'task-1' }); await flushPromises()
    expect(wrapper.find('.record-expanded').exists()).toBe(false)
    expect(wrapper.get('[aria-label="进攻方 ID"]').text()).toBe('10001,0,0,0,0,0')
    expect(wrapper.get('[aria-label="防守方 ID"]').text()).toBe('10002,0,0,0,0,0')
    await wrapper.get('[aria-label="复制攻击方阵容码"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('10001,0,0,0,0,0')
    await wrapper.get('[aria-label="复制防守方阵容码"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('10002,0,0,0,0,0')
    await wrapper.get('[aria-label="复制攻防对"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('10001,0,0,0,0,0\t10002,0,0,0,0,0')
  })

  it('keeps unresolved IDs explicit and disables copying unavailable results', async () => {
    vi.spyOn(workspaceApi, 'fetchLineupTask').mockResolvedValue(task())
    const wrapper = mountWorkspace({ taskId: 'task-1' }); await flushPromises()
    expect(wrapper.get('[aria-label="进攻方 ID"]').text()).toBe('尚无可用阵容')
    expect(wrapper.get('[aria-label="复制攻防对"]').attributes('disabled')).toBeDefined()
  })
  it('ignores a stale task response after switching task IDs', async () => {
    let resolveFirst!: (value: LineupTask) => void
    let resolveSecond!: (value: LineupTask) => void
    const first = new Promise<LineupTask>(resolve => { resolveFirst = resolve })
    const second = new Promise<LineupTask>(resolve => { resolveSecond = resolve })
    const fetch = vi.spyOn(workspaceApi, 'fetchLineupTask').mockImplementation((taskId) => (
      taskId === 'task-a' ? first : second
    ))
    const wrapper = mountWorkspace({ taskId: 'task-a' })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith('task-a', 0, 'all')

    await wrapper.setProps({ taskId: 'task-b' })
    resolveFirst(task({ task_id: 'task-a', name: '旧任务', items: [detail({ id: 'old-record', task_id: 'task-a' })] }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧任务')

    resolveSecond(task({ task_id: 'task-b', name: '新任务', items: [detail({ id: 'new-record', task_id: 'task-b' })] }))
    await flushPromises()
    expect(wrapper.text()).toContain('新任务')
    expect(wrapper.find('[data-record-id="new-record"]').exists()).toBe(true)
  })

  it('reuses one retry idempotency key after a failure and links the new task after success', async () => {
    vi.spyOn(workspaceApi, 'fetchLineupTask').mockResolvedValue(task())
    const retry = vi.spyOn(workspaceApi, 'retryLineupTask')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ task_id: 'retry-task-1' })
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'retry-key-1') })
    const wrapper = mountWorkspace({ taskId: 'task-1' })
    await flushPromises()
    const button = wrapper.get('[aria-label="重试失败/待核对图片"]')

    await button.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('offline')
    await button.trigger('click')
    await flushPromises()
    expect(retry).toHaveBeenNthCalledWith(1, 'task-1', 'retry-key-1')
    expect(retry).toHaveBeenNthCalledWith(2, 'task-1', 'retry-key-1')
    expect(wrapper.get('a[href="/tasks/history?task_id=retry-task-1"]').text()).toContain('打开新任务')
  })

  it('fetches every all-category page before exporting filtered results', async () => {
    const first = task({ items: [detail({ id: 'record-1', ordinal: 1 })], next_cursor: 2 })
    const second = task({ items: [detail({ id: 'record-2', ordinal: 2 })], next_cursor: null })
    const fetch = vi.spyOn(workspaceApi, 'fetchLineupTask').mockImplementation(async (_taskId, after, category) => {
      if (category === 'all' && after === 2) return second
      return first
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export')
    const wrapper = mountWorkspace({ taskId: 'task-1' })
    await flushPromises()
    expect(wrapper.findAll('.workspace-export-actions button')).toHaveLength(1)
    await wrapper.get('[aria-label="导出攻防对 TXT"]').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenNthCalledWith(2, 'task-1', 0, 'all')
    expect(fetch).toHaveBeenNthCalledWith(3, 'task-1', 2, 'all')
    expect(wrapper.text()).toContain('跳过')
  })

  it('honors an explicit review null when displaying members', async () => {
    const item = detail({
      state: 'success', error_code: null, needs_attention: true, attention_reason: 'unresolved',
      review: Array(12).fill(null),
      usable_result: {
        layout_valid: true, teams: ['attack'], team_sizes: { attack: 1 },
        slots: [{ side: 'attack', index: 0, selected_id: 10001, accepted: true }],
      },
    })
    vi.spyOn(workspaceApi, 'fetchLineupTask').mockResolvedValue(task({
      summary: { total: 1, finished: 1, usable: 0, needs_attention: 1, failure: 0, running: 0 },
      items: [item],
    }))
    const wrapper = mountWorkspace({ taskId: 'task-1' })
    await flushPromises()
    await wrapper.get('.record-toggle').trigger('click')
    expect(wrapper.text()).toContain('未确认学生')
    expect(wrapper.text()).not.toContain('攻击学生')
  })

  it('refreshes all loaded pages during polling before allowing the next page', async () => {
    vi.useFakeTimers()
    const page = (start: number, end: number, prefix: string, next: number | null): LineupTask => task({
      lifecycle_status: 'active',
      summary: { total: 60, finished: 60, usable: 60, needs_attention: 0, failure: 0, running: 0 },
      items: Array.from({ length: end - start + 1 }, (_, offset) => {
        const ordinal = start + offset
        return detail({
          id: `record-${ordinal}`, name: `${prefix}-${ordinal}`, task_id: 'task-1', state: 'success',
          error_code: null, needs_attention: false, attention_reason: 'none', ordinal,
        })
      }),
      next_cursor: next,
    })
    const responses = [
      page(1, 20, 'initial', 20), page(21, 40, 'initial', 40),
      page(1, 20, 'refreshed', 20), page(21, 40, 'refreshed', 40), page(41, 60, 'loaded', null),
    ]
    let responseIndex = 0
    const fetch = vi.spyOn(workspaceApi, 'fetchLineupTask').mockImplementation(async () => responses[responseIndex++]!)
    const wrapper = mountWorkspace({ taskId: 'task-1' })
    await flushPromises()
    await wrapper.get('[aria-label="加载更多图片"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-record-id]')).toHaveLength(40)

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(wrapper.find('[data-record-id="record-21"] .record-toggle').text()).toBe('refreshed-21')
    expect(fetch).toHaveBeenCalledTimes(4)

    await wrapper.get('[aria-label="加载更多图片"]').trigger('click')
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith('task-1', 40, 'all')
    const rows = wrapper.findAll('[data-record-id]')
    expect(rows).toHaveLength(60)
    expect(new Set(rows.map(row => row.attributes('data-record-id'))).size).toBe(60)
    wrapper.unmount()
  })
})
