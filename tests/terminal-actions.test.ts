import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../src/shared/api/client'
import {
  createRegistrationGrant,
  deleteTerminal,
  type RegistrationGrant,
} from '../src/shared/api/terminals'

afterEach(() => vi.restoreAllMocks())

describe('terminal management API', () => {
  it('creates a typed one-time registration grant', async () => {
    const grant: RegistrationGrant = {
      grant_id: 'grant-1',
      registration_code: 'one-time-code',
      expires_at: '2026-09-04T12:00:00Z',
      target_device_id: null,
    }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: grant })

    await expect(createRegistrationGrant('linux', 900)).resolves.toEqual(grant)
    expect(post).toHaveBeenCalledWith('/terminals/registration-grants', {
      allowed_terminal_type: 'linux',
      target_device_id: null,
      ttl_seconds: 900,
    })
  })

  it('creates an Android grant bound to an existing logical phone', async () => {
    const grant: RegistrationGrant = {
      grant_id: 'grant-2',
      registration_code: 'android-one-time-code',
      expires_at: '2026-09-05T12:00:00Z',
      target_device_id: 'device-1',
    }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: grant })

    await expect(createRegistrationGrant('android', 3600, 'device-1')).resolves.toEqual(grant)
    expect(post).toHaveBeenCalledWith('/terminals/registration-grants', {
      allowed_terminal_type: 'android',
      target_device_id: 'device-1',
      ttl_seconds: 3600,
    })
  })

  it('passes the current row version when deleting a terminal', async () => {
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: undefined })

    await deleteTerminal({ terminal_id: 'terminal-1', row_version: 7 })

    expect(remove).toHaveBeenCalledWith('/terminals/terminal-1', {
      data: { expected_version: 7 },
    })
  })
})
