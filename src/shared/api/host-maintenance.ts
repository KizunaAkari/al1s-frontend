import { apiClient } from './client'

export type HostHealth = {
  boot_id: string; container_id: string; container_started_at: string; healthy: boolean
  unresolved_upgrade_id?: string | null
  upgrade_in_progress?: boolean
}
export type HostLogs = { observed_at: string; lines: string[] }
export type HostCommand = {
  command_id: string; action: string; state: string; accepted_at: number
  started_at: number | null; error_code: string | null; late_state: string | null
}
export type MaintenanceImpact = {
  items: { execution_id: string; name: string; status: string }[]; truncated: boolean
}
export const maintenanceActive = (state: string) =>
  ['pending', 'accepted', 'executing', 'recovering'].includes(state)
const base = (id: string) => `/terminals/${encodeURIComponent(id)}/maintenance`
export const hostMaintenance = {
  async upgrade(id: string, body: {
    command_id: string; action: 'upgrade_container'; release_id: string
    expires_at: number; confirm_interrupt: true; expected_boot_id: string
    expected_container_id: string; expected_container_started_at: string
  }) {
    return (await apiClient.post<HostCommand>(base(id) + '/upgrades', body, { timeout: 40000 })).data
  },
  async recover(id: string, deploymentId: string) {
    return (await apiClient.post<{
      deployment_id: string; resolved: boolean; status?: string | null; reason?: string | null
    }>(base(id) + '/recovery', { deployment_id: deploymentId }, { timeout: 85000 })).data
  },
  async health(id: string) {
    return (await apiClient.get<HostHealth>(base(id) + '/health', { timeout: 20000 })).data
  },
  async logs(id: string) {
    return (await apiClient.get<HostLogs>(base(id) + '/logs', { timeout: 20000 })).data
  },
  async impact(id: string) {
    return (await apiClient.get<MaintenanceImpact>(base(id) + '/impact')).data
  },
  async latest(id: string) {
    return (await apiClient.get<{ item: HostCommand | null }>(base(id) + '/commands')).data.item
  },
  async command(id: string, command: string) {
    return (await apiClient.get<HostCommand>(base(id) + '/commands/' + encodeURIComponent(command))).data
  },
  async submit(id: string, body: {
    command_id: string; action: 'restart_container' | 'restart_host'
    expires_at: number; confirm_interrupt: true; expected_boot_id: string
    expected_container_id: string; expected_container_started_at: string
    confirmed_upgrade_id?: string | null
  }) {
    return (await apiClient.post<HostCommand>(base(id) + '/commands', body, { timeout: 40000 })).data
  },
}
