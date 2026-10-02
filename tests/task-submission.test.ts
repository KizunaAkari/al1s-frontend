import { beforeEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { submitTask, preservePendingTask, restorePendingTask, type TaskSubmission } from '../src/shared/api/task-submission'

vi.mock('../src/shared/api/client', () => ({ apiClient: { post: vi.fn() } }))
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear() })
const request: TaskSubmission = {
  idempotency_key: 'same-request', name: '任务', task_type: 'single', source_module: 'maa',
  logical_content_id: 'script:published-id', requested_terminal_id: 'linux',
  requested_target_device_id: 'phone', timeout_seconds: 1800, max_retries: 0, record_video: true,
}
it('preserves request identity and targets on retry after lost response', async () => {
  vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce({ data: { task_id: 'task' } })
  await expect(submitTask(request)).rejects.toThrow('timeout')
  expect(await submitTask(request)).toEqual({ task_id: 'task' })
  expect(apiClient.post).toHaveBeenNthCalledWith(1, '/tasks', request)
  expect(apiClient.post).toHaveBeenNthCalledWith(2, '/tasks', request)
})
it('restores the same pending request after page reload and clears after acknowledgement', () => {
  preservePendingTask(request)
  expect(restorePendingTask()).toEqual(request)
  preservePendingTask(null)
  expect(restorePendingTask()).toBeNull()
})
