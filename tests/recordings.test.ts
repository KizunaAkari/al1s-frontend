import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { apiClient } from '../src/shared/api/client'
import { fetchRecordings, recordingDownloadUrl } from '../src/shared/api/recordings'
import TaskRecordingsDrawer from '../src/modules/tasks/TaskRecordingsDrawer.vue'
import type { TaskHistoryItem } from '../src/shared/api/tasks'

afterEach(() => vi.restoreAllMocks())

describe('recording downloads', () => {
  it('loads an initially open drawer without requiring a close and reopen', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [], next_cursor: null } })
    const wrapper = mount(TaskRecordingsDrawer, {
      props: { modelValue: true, task: { task_id: 'initial', name: '测试' } as TaskHistoryItem },
      global: { stubs: { ElDrawer: { template: '<div><slot /></div>' }, ElButton: true } },
    })
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/tasks/initial/recordings', { params: { cursor: null, limit: 20 } })
    wrapper.unmount()
  })

  it('requests a bounded page and uses the configured API base for native downloads', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [], next_cursor: null } })
    await fetchRecordings('task', 'cursor')
    expect(get).toHaveBeenCalledWith('/tasks/task/recordings', { params: { cursor: 'cursor', limit: 20 } })
    expect(recordingDownloadUrl('task', 'file')).toBe('/api/v1/tasks/task/recordings/file/download')
  })

  it('shows only downloadable links and keeps pending uploads unavailable', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {
      items: [
        { artifact_id: 'a', attempt_id: 'attempt', file_name: 'ready.mp4', status: 'ready', downloadable: true },
        { artifact_id: 'b', attempt_id: 'attempt', file_name: 'pending.mp4', status: 'pending', downloadable: false },
      ], next_cursor: null,
    } })
    const wrapper = mount(TaskRecordingsDrawer, {
      props: { modelValue: false, task: { task_id: 'task', name: '测试' } as TaskHistoryItem },
      global: { stubs: { ElDrawer: { template: '<div><slot /></div>' }, ElButton: { template: '<button><slot /></button>' } } },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.get('a').attributes('href')).toContain('/a/download')
    expect(wrapper.text()).toContain('上传尚未完成')
    wrapper.unmount()
  })
})
