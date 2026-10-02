import { describe, expect, it } from 'vitest'

import { normalizeApiError } from '../src/shared/api/client'

describe('API errors', () => {
  it('keeps the backend code and request id', () => {
    const error = normalizeApiError({
      isAxiosError: true,
      response: {
        status: 409,
        data: { code: 'stale_version', message: 'Version changed', request_id: 'request-1' },
        headers: {},
      },
    })

    expect(error.code).toBe('stale_version')
    expect(error.message).toBe('Version changed')
    expect(error.requestId).toBe('request-1')
    expect(error.status).toBe(409)
  })

  it('uses a stable network error instead of leaking an implementation message', () => {
    const error = normalizeApiError({ isAxiosError: true, message: 'socket hang up' })
    expect(error.code).toBe('network_error')
    expect(error.message).toContain('无法连接平台后端')
  })
})
