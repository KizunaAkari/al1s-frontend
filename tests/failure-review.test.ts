import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import * as api from '../src/shared/api/task-details'
import { FailureReview } from '../src/modules/tasks/failure-review'

afterEach(() => vi.restoreAllMocks())
const attempt = {
  attempt_id: 'attempt', details: [{ screenshot_id: 'one' }, { screenshot_id: 'two' }, { screenshot_id: 'one' }],
  screenshots: [{ artifact_id: 'ordinary' }],
} as api.AttemptDetail
const required = () => new ApiError('Download all failure screenshots first', { code: 'screenshot_download_required' })

it('closes previously downloaded screenshots using server state without downloading again', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  expect(await new FailureReview('task').complete(attempt, () => true)).toBe(true)
  expect(confirm).toHaveBeenCalledOnce()
  expect(download).not.toHaveBeenCalled()
})

it('downloads each distinct failure original before confirming, excluding ordinary screenshots', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockRejectedValueOnce(required()).mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  expect(await new FailureReview('task').complete(attempt, () => true)).toBe(true)
  expect(download.mock.calls).toEqual([['task', 'attempt', 'one'], ['task', 'attempt', 'two']])
  expect(confirm.mock.invocationCallOrder[1]).toBeGreaterThan(download.mock.invocationCallOrder[1]!)
})

it('retains details on download failure and retries only the failed image before confirmation', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockRejectedValueOnce(required()).mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot')
    .mockResolvedValueOnce().mockRejectedValueOnce(new Error('截图校验失败')).mockResolvedValue()
  const review = new FailureReview('task')
  await expect(review.complete(attempt, () => true)).rejects.toThrow('截图校验失败')
  expect(confirm).toHaveBeenCalledOnce()
  expect(await review.complete(attempt, () => true)).toBe(true)
  expect(download.mock.calls.map(call => call[2])).toEqual(['one', 'two', 'two'])
  expect(confirm.mock.invocationCallOrder[1]).toBeGreaterThan(download.mock.invocationCallOrder[2]!)
})

it('does not bypass a failed manual browser verification using the server download flag', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot')
    .mockRejectedValueOnce(new Error('截图校验失败')).mockResolvedValue()
  const review = new FailureReview('task')
  await expect(review.download('attempt', 'one')).rejects.toThrow()
  expect(await review.complete(attempt, () => true)).toBe(true)
  expect(download).toHaveBeenCalledTimes(2)
  expect(confirm.mock.invocationCallOrder[0]).toBeGreaterThan(download.mock.invocationCallOrder[1]!)
})

it('does not confirm or download another image after the task changes', async () => {
  let active = true
  const confirm = vi.spyOn(api, 'confirmFailure').mockRejectedValueOnce(required())
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockImplementation(async () => { active = false })
  expect(await new FailureReview('task').complete(attempt, () => active)).toBe(false)
  expect(confirm).toHaveBeenCalledOnce()
  expect(download).toHaveBeenCalledOnce()
})

it('keeps non-download errors visible and does not download on an unrelated error', async () => {
  vi.spyOn(api, 'confirmFailure').mockRejectedValue(new ApiError('连接失败', { code: 'network_error' }))
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  await expect(new FailureReview('task').complete(attempt, () => true)).rejects.toThrow('连接失败')
  expect(download).not.toHaveBeenCalled()
})
