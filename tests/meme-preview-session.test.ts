import { afterEach, expect, it, vi } from 'vitest'
import { PreviewSession } from '../src/modules/bots/memes/preview-session'

afterEach(() => vi.useRealTimers())

it('debounces preview for 300ms and discards late responses after a new draft or close', async () => {
  vi.useFakeTimers()
  let finishFirst!: (value: string) => void
  const first = new Promise<string>(resolve => { finishFirst = resolve })
  const render = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce('new')
  const apply = vi.fn()
  const session = new PreviewSession(render, apply)
  session.schedule('old')
  await vi.advanceTimersByTimeAsync(299)
  expect(render).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  session.schedule('new')
  finishFirst('old')
  await Promise.resolve()
  expect(apply).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(300)
  expect(apply).toHaveBeenCalledWith('new')
  session.schedule('closed')
  session.close()
  await vi.advanceTimersByTimeAsync(300)
  expect(render).toHaveBeenCalledTimes(2)
})
