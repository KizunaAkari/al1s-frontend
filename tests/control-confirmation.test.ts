import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import { ControlConfirmation, isTransientConfirmationFailure } from '../src/modules/maa/editor/control-confirmation'

afterEach(() => vi.useRealTimers())

it.each([408, 429, 500, 502, 503, 504])('allows only a bounded transient HTTP %i failure', status => {
  expect(isTransientConfirmationFailure(new ApiError('temporary', { status, code: 'temporary' }))).toBe(true)
})
it.each([400, 401, 403, 404, 409])('does not soften HTTP %i rejection', status => {
  expect(isTransientConfirmationFailure(new ApiError('rejected', { status, code: 'network_error' }))).toBe(false)
})
it('allows classified network failures, but does not guess that unknown errors are transient', () => {
  expect(isTransientConfirmationFailure(new ApiError('offline', { code: 'network_error' }))).toBe(true)
  expect(isTransientConfirmationFailure(new ApiError('timeout', { code: 'request_timeout' }))).toBe(true)
  expect(isTransientConfirmationFailure(new Error('bad response'))).toBe(false)
})
it('checks the deadline even if browser timers were suspended', () => {
  vi.useFakeTimers()
  const expired = vi.fn(), gate = new ControlConfirmation(expired)
  expect(gate.confirm(Date.now())).toBe(true)
  vi.setSystemTime(Date.now() + 10_001)
  expect(gate.valid()).toBe(false)
  expect(expired).toHaveBeenCalledOnce()
  expect(gate.valid()).toBe(false)
  expect(expired).toHaveBeenCalledOnce()
})
it('deducts request time and cannot renew with a stale response', async () => {
  vi.useFakeTimers()
  const expired = vi.fn(), gate = new ControlConfirmation(expired), started = Date.now()
  await vi.advanceTimersByTimeAsync(9000)
  expect(gate.confirm(started)).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(gate.valid()).toBe(false)
  expect(expired).toHaveBeenCalledOnce()
  expect(gate.confirm(started)).toBe(false)
})
it('cleans its deadline and timer when the owner leaves', async () => {
  vi.useFakeTimers()
  const expired = vi.fn(), gate = new ControlConfirmation(expired)
  expect(gate.confirm(Date.now())).toBe(true)
  gate.clear()
  await vi.advanceTimersByTimeAsync(20_000)
  expect(gate.valid()).toBe(false)
  expect(expired).not.toHaveBeenCalled()
})
