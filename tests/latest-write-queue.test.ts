import { expect, it, vi } from 'vitest'
import { createLatestWriteQueue } from '../src/modules/maa/editor/latest-write-queue'

it('writes the newest waiting snapshot after an in-flight write', async () => {
  let finishFirst: (() => void) | undefined
  const write = vi.fn((value: number) => value === 1
    ? new Promise<void>(resolve => { finishFirst = resolve })
    : Promise.resolve())
  const failed = vi.fn()
  const queue = createLatestWriteQueue(write, failed)

  const first = queue.enqueue(1)
  await Promise.resolve()
  queue.enqueue(2)
  queue.enqueue(3)
  finishFirst!()
  await queue.wait()

  expect(write.mock.calls.map(([value]) => value)).toEqual([1, 3])
  expect(failed).not.toHaveBeenCalled()
  await first
})

it('continues with the latest snapshot after a failed write', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValue(undefined)
  const failed = vi.fn()
  const queue = createLatestWriteQueue<number>(write, failed)

  await queue.enqueue(1)
  await queue.enqueue(2)

  expect(write.mock.calls.map(([value]) => value)).toEqual([1, 2])
  expect(failed).toHaveBeenCalledTimes(1)
})
