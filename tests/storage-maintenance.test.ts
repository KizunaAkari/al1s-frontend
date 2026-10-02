import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElMessageBox } from 'element-plus'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { get, post } }))

import StorageMaintenance from '../src/modules/maintenance/StorageMaintenance.vue'

const snapshot = {
  pending_blobs: 1, quarantined_blobs: 0, pending_gc_jobs: 2,
  processing_gc_jobs: 0, dead_letter_gc_jobs: 1,
  reclaimable_blobs: 2, reclaimable_bytes: 2 * 1048576,
  automatic_interval_seconds: 30,
}

afterEach(() => { vi.restoreAllMocks(); get.mockReset(); post.mockReset() })

it('confirms and submits one bounded cleanup request, then shows persisted status', async () => {
  const request = {
    id: 'request-1', status: 'pending', requested_at: '2026-09-25T00:00:00Z',
    completed_at: null, attempt_count: 0, claimed: 0, deleted: 0,
    failed: 0, stale: 0, error_type: null,
  }
  let submitted = false
  get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('/cleanup') ? (submitted ? request : null) : snapshot,
  }))
  post.mockImplementation(() => { submitted = true; return Promise.resolve({ data: request }) })
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const wrapper = mount(StorageMaintenance)
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('2 项 · 2.00 MiB')
    const submit = wrapper.findAllComponents(ElButton).find(button => button.text().includes('发起一次清理'))
    expect(submit).toBeTruthy()
    await submit!.trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/system/maintenance/storage/cleanup')
    expect(post).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('等待执行')
    expect(submit!.attributes('disabled')).toBeDefined()
  } finally { wrapper.unmount() }
})
