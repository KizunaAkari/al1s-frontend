import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import * as api from '../src/shared/api/task-details'
import { FailureReview } from '../src/modules/tasks/failure-review'

afterEach(() => vi.restoreAllMocks())
const attempt = {
  attempt_id: 'attempt', details: [{ screenshot_id: 'one' }, { screenshot_id: 'two' }, { screenshot_id: 'one' }],
  screenshots: [{ artifact_id: 'ordinary' }],
} as api.AttemptDetail

it('closes previously downloaded screenshots using server state without downloading again', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  expect(await new FailureReview('task').complete(attempt, () => true)).toBe(true)
  expect(confirm).toHaveBeenCalledOnce()
  expect(download).not.toHaveBeenCalled()
})

it('never starts confirmation or downloads after the task has already changed', async () => {
  const confirm = vi.spyOn(api, 'confirmFailure').mockResolvedValue()
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  expect(await new FailureReview('task').complete(attempt, () => false)).toBe(false)
  expect(confirm).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()
})

it('does not close another task when an explicit confirmation settles late', async () => {
  let active = true
  const confirm = vi.spyOn(api, 'confirmFailure').mockImplementation(async () => { active = false })
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  expect(await new FailureReview('task').complete(attempt, () => active)).toBe(false)
  expect(confirm).toHaveBeenCalledOnce()
  expect(download).not.toHaveBeenCalled()
})

it('keeps non-download errors visible and does not download on an unrelated error', async () => {
  vi.spyOn(api, 'confirmFailure').mockRejectedValue(new ApiError('连接失败', { code: 'network_error' }))
  const download = vi.spyOn(api, 'downloadFailureScreenshot').mockResolvedValue()
  await expect(new FailureReview('task').complete(attempt, () => true)).rejects.toThrow('连接失败')
  expect(download).not.toHaveBeenCalled()
})
