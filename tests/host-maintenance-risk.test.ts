import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import HostMaintenance from '../src/modules/terminals/HostMaintenance.vue'
import { hostMaintenance } from '../src/shared/api/host-maintenance'
import { linuxReleases } from '../src/shared/api/linux-releases'

vi.mock('../src/shared/api/linux-releases', () => ({ linuxReleases: { list: vi.fn() } }))

vi.mock('../src/shared/api/host-maintenance', async (load) => ({
  ...await load<typeof import('../src/shared/api/host-maintenance')>(),
  hostMaintenance: {
    health: vi.fn(), latest: vi.fn(), impact: vi.fn(), submit: vi.fn(), command: vi.fn(),
    recover: vi.fn(),
  },
}))
let wrapper: VueWrapper
const accepted = 'confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>
beforeEach(() => {
  vi.mocked(linuxReleases.list).mockResolvedValue([])
  sessionStorage.clear()
  vi.mocked(hostMaintenance.health).mockResolvedValue({
    boot_id: 'boot', container_id: 'container', container_started_at: 'start', healthy: true,
    unresolved_upgrade_id: 'release-1', upgrade_in_progress: false,
  })
  vi.mocked(hostMaintenance.latest).mockResolvedValue(null)
  vi.mocked(hostMaintenance.impact).mockResolvedValue({ items: [], truncated: false })
  const outcome = {
    command_id: 'id', action: 'restart_host', state: 'succeeded', accepted_at: 0,
    started_at: 0, error_code: null, late_state: null,
  }
  vi.mocked(hostMaintenance.submit).mockResolvedValue(outcome)
  vi.mocked(hostMaintenance.command).mockResolvedValue(outcome)
  wrapper = mount(HostMaintenance, {
    props: { terminalId: 'terminal', name: 'test-host' },
    global: { stubs: {
      ElButton: { template: '<button><slot /></button>' },
      ElDialog: { template: '<div><slot /></div>' },
      ElAlert: true, ElTable: true, ElTableColumn: true,
    } },
  })
})
afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  sessionStorage.clear()
})
async function click(text: string) {
  await wrapper.findAll('button').find(button => button.text() === text)!.trigger('click')
  await flushPromises()
}
it('does not submit when the separate upgrade risk confirmation is declined', async () => {
  const confirm = vi.spyOn(ElMessageBox, 'confirm')
    .mockResolvedValueOnce(accepted).mockRejectedValueOnce('cancel')
  await click('宿主维护')
  await click('重启Linux主机')
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(hostMaintenance.submit).not.toHaveBeenCalled()
})
it('binds explicit risk confirmation to the unresolved upgrade identity', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(accepted)
  await click('宿主维护')
  await click('重启Linux主机')
  expect(hostMaintenance.submit).toHaveBeenCalledWith('terminal', expect.objectContaining({
    confirmed_upgrade_id: 'release-1', confirm_interrupt: true,
  }))
})
it('offers recovery without repeating an upgrade or restart command', async () => {
  vi.mocked(hostMaintenance.recover).mockResolvedValue({
    deployment_id: 'release-1', resolved: false,
    reason: 'database_or_cutover_requires_inspection',
  })
  await click('宿主维护')
  await click('检查并恢复升级状态')
  expect(hostMaintenance.recover).toHaveBeenCalledWith('terminal', 'release-1')
  expect(hostMaintenance.submit).not.toHaveBeenCalled()
})
