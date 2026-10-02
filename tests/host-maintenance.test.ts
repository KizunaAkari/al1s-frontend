import { expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { hostMaintenance, maintenanceActive } from '../src/shared/api/host-maintenance'
vi.mock('../src/shared/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }))
it('keeps pending commands active but terminal outcomes settled', () => {
  expect(maintenanceActive('pending')).toBe(true)
  expect(maintenanceActive('recovering')).toBe(true)
  expect(maintenanceActive('response_timeout')).toBe(false)
})
it('does not retry restart POST after a network error', async () => {
  vi.mocked(apiClient.post).mockRejectedValue(new Error('timeout'))
  await expect(hostMaintenance.submit('terminal', {
    command_id: 'same-id', action: 'restart_host', expires_at: 2000,
    expected_boot_id: 'boot', confirm_interrupt: true,
    expected_container_id: 'container', expected_container_started_at: 'start',
  })).rejects.toThrow('timeout')
  expect(apiClient.post).toHaveBeenCalledTimes(1)
})
