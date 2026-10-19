import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import QqDeviceIdentity from '../src/modules/bots/QqDeviceIdentity.vue'
import { qqDeviceIdentityApi, type QqIdentityState } from '../src/shared/api/qq-device-identity'
import { ApiError } from '../src/shared/api/client'

const guid = '12'.repeat(16)
const accepted = 'confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>
function state(pending = false): QqIdentityState {
  return { revision: 'a'.repeat(64), configured: true, current_guid: guid,
    desired: { device_name: '', guid }, applied: { settings: { device_name: '', guid },
      reported_device_name: 'DESKTOP-ORIGINAL', applied_at: '2026-10-14T01:00:00Z' },
    pending, phase: pending ? 'pending' : 'applied', error_code: null,
    observed_at: '2026-10-14T01:00:00Z' }
}
afterEach(() => vi.restoreAllMocks())

it('marks PMHQ direct settings inapplicable and disables all editing', async () => {
  vi.spyOn(qqDeviceIdentityApi, 'read').mockResolvedValue({ ...state(), mode: 'pmhq',
    available: false, unavailable_reason: 'qq_device_settings_direct_only' })
  const save = vi.spyOn(qqDeviceIdentityApi, 'save')
  const page = mount(QqDeviceIdentity)
  try {
    await flushPromises()
    expect(page.text()).toContain('不适用')
    expect(page.text()).toContain('Direct')
    expect(page.get('[data-action="save-identity"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-action="random-guid"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-test="device-name"]').attributes('disabled')).toBeDefined()
    expect(save).not.toHaveBeenCalled()
  } finally { page.unmount() }
})

it('shows applied values and random generation only changes draft', async () => {
  vi.spyOn(qqDeviceIdentityApi, 'read').mockResolvedValue(state())
  const save = vi.spyOn(qqDeviceIdentityApi, 'save').mockResolvedValue(state(true))
  const page = mount(QqDeviceIdentity)
  try {
    await flushPromises()
    expect(page.text()).toContain('DESKTOP-ORIGINAL')
    await page.get('[data-action="random-guid"]').trigger('click')
    expect((page.get('[data-test="device-guid"]').element as HTMLInputElement).value).not.toBe(guid)
    expect(save).not.toHaveBeenCalled()
    await page.get('[data-test="device-guid"]').setValue('0'.repeat(32))
    await page.get('[data-action="save-identity"]').trigger('click')
    expect(page.text()).toContain('GUID')
    expect(save).not.toHaveBeenCalled()
  } finally { page.unmount() }
})

it('saves name only without session confirmation or restart', async () => {
  vi.spyOn(qqDeviceIdentityApi, 'read').mockResolvedValue(state())
  const save = vi.spyOn(qqDeviceIdentityApi, 'save').mockResolvedValue(state(true))
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(accepted)
  const page = mount(QqDeviceIdentity)
  try {
    await flushPromises()
    await page.get('[data-test="device-name"]').setValue('My device')
    await page.get('[data-action="save-identity"]').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith({ device_name: 'My device', guid }, 'a'.repeat(64), expect.any(String), false)
    expect(confirm).not.toHaveBeenCalled()
    expect(page.text()).toContain('待重启')
  } finally { page.unmount() }
})

it('confirms GUID change and drops delayed confirmation after leaving', async () => {
  vi.spyOn(qqDeviceIdentityApi, 'read').mockResolvedValue(state())
  const save = vi.spyOn(qqDeviceIdentityApi, 'save').mockResolvedValue(state(true))
  let finish!: (value: Awaited<ReturnType<typeof ElMessageBox.confirm>>) => void
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const page = mount(QqDeviceIdentity)
  await flushPromises()
  await page.get('[data-test="device-guid"]').setValue('34'.repeat(16))
  await page.get('[data-action="save-identity"]').trigger('click'); await flushPromises()
  expect(confirm.mock.calls[0]?.[0]).toContain('全部旧登录会话')
  page.unmount(); finish(accepted); await flushPromises()
  expect(save).not.toHaveBeenCalled()
})

it('keeps draft on conflict and requires refresh after unknown write result', async () => {
  vi.spyOn(qqDeviceIdentityApi, 'read').mockResolvedValue(state())
  const save = vi.spyOn(qqDeviceIdentityApi, 'save').mockRejectedValue(new ApiError('conflict', { code: 'qq_identity_revision_changed' }))
  const page = mount(QqDeviceIdentity)
  try {
    await flushPromises()
    await page.get('[data-test="device-name"]').setValue('My draft')
    await page.get('[data-action="save-identity"]').trigger('click'); await flushPromises()
    expect((page.get('[data-test="device-name"]').element as HTMLInputElement).value).toBe('My draft')
    save.mockRejectedValue(new ApiError('timeout', { code: 'request_timeout' }))
    await page.get('[data-action="save-identity"]').trigger('click'); await flushPromises()
    expect(page.text()).toContain('结果未知')
    expect(page.get('[data-action="save-identity"]').attributes('disabled')).toBeDefined()
    await page.get('[data-action="refresh-identity"]').trigger('click'); await flushPromises()
    expect(page.get('[data-action="save-identity"]').attributes('disabled')).toBeUndefined()
  } finally { page.unmount() }
})
