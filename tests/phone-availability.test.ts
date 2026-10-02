import { expect, it } from 'vitest'
import type { TargetDevice } from '../src/shared/api/terminals'
import { phoneAvailability } from '../src/shared/presentation/phone-availability'

const phone = { mode: 'mounted', availability: 'connected' } as TargetDevice

it('distinguishes ADB connection from offline, unauthorized and unknown observations', () => {
  expect(phoneAvailability(phone).label).toBe('已连接')
  expect(phoneAvailability({ ...phone, availability: 'disconnected',
    availability_reason: 'adb_observation_stale' }).label).toBe('未连接')
  expect(phoneAvailability({ ...phone, availability: 'unauthorized' }).guidance).toContain('USB 调试授权')
  expect(phoneAvailability({ ...phone, availability: 'unknown',
    availability_reason: 'terminal_offline' }).label).toBe('终端离线')
  expect(phoneAvailability({ ...phone, availability: 'unknown',
    availability_reason: 'status_refresh_failed' }).guidance).toContain('查询失败')
})
