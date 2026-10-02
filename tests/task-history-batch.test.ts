import { describe, expect, it, vi } from 'vitest'
import { deleteHistoryBatch } from '../src/shared/api/task-history-batch'
import type { TaskHistoryItem } from '../src/shared/api/tasks'

const task = (id: string, allowed = true) => ({
  task_id: id, name: id, row_version: 7,
  delete: { allowed, refusal_message: '活动任务不可删除' },
}) as TaskHistoryItem

describe('bounded history cleanup', () => {
  it('deduplicates identities, skips active tasks, preserves version and continues partial failures', async () => {
    const remove = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unknown'))
    const results = await deleteHistoryBatch([task('a'), task('a'), task('active', false), task('b')], remove)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove.mock.calls[0][0].row_version).toBe(7)
    expect(results.map((result) => result.deleted)).toEqual([true, false, false])
  })
  it('rejects oversized or empty batches before sending', async () => {
    const remove = vi.fn()
    await expect(deleteHistoryBatch([], remove)).rejects.toThrow()
    await expect(deleteHistoryBatch(Array.from({ length: 51 }, (_, id) => task(String(id))), remove)).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
})
