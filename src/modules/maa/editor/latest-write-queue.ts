/** Keep at most one pending snapshot while an IndexedDB write is in flight. */
export function createLatestWriteQueue<T>(write: (value: T) => Promise<unknown>, onError: () => void) {
  let pending: T | undefined
  let queue: Promise<void> = Promise.resolve()

  return {
    enqueue(value: T): Promise<void> {
      pending = value
      queue = queue.then(async () => {
        const next = pending
        pending = undefined
        if (next === undefined) return
        try {
          await write(next)
        } catch {
          onError()
        }
      })
      return queue
    },
    wait(): Promise<void> { return queue },
  }
}
