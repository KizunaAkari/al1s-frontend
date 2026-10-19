import { expect, it } from 'vitest'
import type { TargetDevice } from '../src/shared/api/terminals'
import { phoneAvailability } from '../src/shared/presentation/phone-availability'

const phone = { mode: 'mounted', availability: 'connected' } as TargetDevice

it('distinguishes ADB connection from offline, unauthorized and unknown observations', () => {
  expect(phoneAvailability(phone).label).toBe('已连接')
  expect(phoneAvailability({ ...phone, availability: 'disconnected',
    availability_reason: 'adb_observation_stale' }).label).toBe('状态未确定')
  expect(phoneAvailability({ ...phone, availability: 'unauthorized' }).guidance).toContain('USB 调试授权')
  expect(phoneAvailability({ ...phone, availability: 'unknown',
    availability_reason: 'terminal_offline' }).label).toBe('终端离线')
  expect(phoneAvailability({ ...phone, availability: 'unknown',
    availability_reason: 'status_refresh_failed' }).guidance).toContain('查询失败')
})
it('does not blame APK network or auxiliary service for an expired observation', () => {
  const result=phoneAvailability({...phone,mode:'standalone',availability:'unknown',availability_reason:'adb_observation_stale'})
  expect(result.label).toBe('状态未确定')
  expect(result.guidance).toContain('观测已过期')
  expect(result.guidance).not.toContain('检查 APK 网络')
})

it('uses APK guidance for standalone phones without suggesting a Linux mount', () => {
  expect(phoneAvailability({ ...phone, mode: 'standalone' }).guidance).toContain('APK')
  expect(phoneAvailability({ ...phone, mode: 'standalone', availability: 'disconnected' }).guidance).toContain('辅助服务')
  expect(phoneAvailability({ ...phone, mode: 'unassigned' }).label).toBe('未绑定')
})
