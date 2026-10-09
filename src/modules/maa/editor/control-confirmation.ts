import { ApiError } from '../../../shared/api/client'

export const CONTROL_CONFIRMATION_MS = 10_000

export function isTransientConfirmationFailure(error: unknown): boolean {
  return error instanceof ApiError && (
    [408, 429, 500, 502, 503, 504].includes(error.status ?? -1)
    || ['network_error', 'request_timeout'].includes(error.code) && error.status === undefined
  )
}

/** A failed or hanging request cannot renew the last confirmed input window. */
export class ControlConfirmation {
  private deadline: number | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly expired: () => void, private readonly now = Date.now) {}

  confirm(requestStarted: number): boolean {
    this.valid()
    this.clear()
    this.deadline = requestStarted + CONTROL_CONFIRMATION_MS
    if (!this.valid()) return false
    this.timer = setTimeout(() => { this.valid() }, this.deadline - this.now())
    return true
  }

  valid(): boolean {
    if (this.deadline === undefined) return false
    if (this.now() < this.deadline) return true
    this.clear()
    this.expired()
    return false
  }

  clear(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.deadline = undefined
  }
}
