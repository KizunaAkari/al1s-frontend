import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import * as api from '../src/shared/api/task-details'
import { FailureReview } from '../src/modules/tasks/failure-review'

afterEach(() => vi.restoreAllMocks())
const attempt = { attempt_id: 'attempt', details: [{ screenshot_id: 'one' }, { screenshot_id: 'two' }, { screenshot_id: 'one' }] } as api.AttemptDetail
const required = () => new ApiError('Download first', { code: 'screenshot_download_required' })
it('requires a manual download when the server refuses confirmation', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockRejectedValue(required())
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  await expect(new FailureReview('task').complete(attempt, () => true)).rejects.toThrow('手动下载')
  expect(confirm).toHaveBeenCalledOnce()
  expect(download).not.toHaveBeenCalled()
})
it('requires the user to retry failed browser validation before confirming', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockRejectedValueOnce(new Error('截图校验失败')).mockResolvedValue()
  const review = new FailureReview('task')
  await expect(review.download('attempt', 'one')).rejects.toThrow('校验失败')
  await expect(review.complete(attempt, () => true)).rejects.toThrow('手动')
  expect(download).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  await review.download('attempt', 'one')
  expect(await review.complete(attempt, () => true)).toBe(true)
  expect(confirm).toHaveBeenCalledOnce()
})
it('keeps partial manual downloads and never downloads the remaining image on confirm', async () => {
  vi.spyOn(api, 'confirmFailure').mockRejectedValueOnce(required()).mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  const review = new FailureReview('task')
  await review.download('attempt', 'one')
  await expect(review.complete(attempt, () => true)).rejects.toThrow('手动下载')
  expect(download.mock.calls).toEqual([['task', 'attempt', 'one']])
  await review.download('attempt', 'two')
  expect(await review.complete(attempt, () => true)).toBe(true)
  expect(download.mock.calls).toEqual([['task', 'attempt', 'one'], ['task', 'attempt', 'two']])
})
