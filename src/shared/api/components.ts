import { apiClient } from './client'

export type UpgradeUnit = 'platform' | 'postgresql' | 's3' | 'mqtt' | 'linux-terminal'
export type ComponentKey = UpgradeUnit | 'maa'
export type ComponentTarget = { kind: 'platform'; terminal_id?: null } | { kind: 'terminal'; terminal_id: string }
export type InventoryEntry = {
  component: ComponentKey; upgrade_unit: UpgradeUnit; target: ComponentTarget; display_name: string
  version: string | null; architecture: string | null; status: 'healthy' | 'offline' | 'unhealthy' | 'unknown'
  observed_at: string | null; image: string | null; image_id: string | null; source_identity: string | null
  reason: string | null
}
export type ComponentReleaseInput = {
  release_id: string; component: UpgradeUnit; version: string; architecture: 'amd64' | 'arm64'
  size_bytes: number; sha256: string; candidate_image: string; expected_image_id: string
  native_version: string; compatible_from: string; data_policy: 'same-format' | 'alembic'
  schema_from?: string | null; schema_to?: string | null; maa_version?: string | null
}
export type ComponentRelease = ComponentReleaseInput & {
  state: 'draft' | 'queued' | 'verifying' | 'published' | 'failed'; row_version: number
  blob_id: string | null; created_at: string; published_at: string | null; error_code: string | null
}
export type ComponentPreflight = {
  component: UpgradeUnit; target: ComponentTarget; release_id: string; expected_source: string
  current_version: string | null; target_version: string; allowed: boolean; reasons: string[]
  affected_services: string[]; backup_required: boolean
}
export type UpgradeRequest = {
  component: UpgradeUnit; target: ComponentTarget; release_id: string; expected_source: string; idempotency_key: string
}
export type ComponentOperation = {
  operation_id: string; component: UpgradeUnit; target: ComponentTarget; release_id: string
  expected_source: string; state: 'accepted' | 'preparing' | 'switching' | 'verifying' | 'succeeded' | 'failed_safe' | 'unknown'
  stage: string; created_at: string; updated_at: string; row_version: number
  error_code: string | null; recovery_point: string | null; status_token: string | null
}
export type Page<T> = { items: T[]; next_cursor: string | null }

export function componentLabel(component: ComponentKey) {
  return ({ platform: '平台应用', postgresql: 'PostgreSQL', s3: 'SeaweedFS / S3', mqtt: 'MQTT',
    'linux-terminal': 'Linux 终端', maa: 'MaaFramework' })[component]
}
export function targetKey(target: ComponentTarget) {
  if (target.kind === 'terminal') {
    if (!target.terminal_id?.trim()) throw new Error('请先选择有效终端')
    return 'terminal:' + target.terminal_id
  }
  return 'platform'
}
export const componentApi = {
  async inventory(cursor?: string, signal?: AbortSignal) {
    return (await apiClient.get<Page<InventoryEntry>>('/components/inventory', { params: { cursor, limit: 20 }, signal })).data
  },
  async releases(component: UpgradeUnit, cursor?: string) {
    return (await apiClient.get<Page<ComponentRelease>>('/components/releases', { params: { component, cursor, limit: 25 } })).data
  },
  async createRelease(body: ComponentReleaseInput) {
    return (await apiClient.post<ComponentRelease>('/components/releases', body)).data
  },
  async uploadRelease(id: string) {
    return (await apiClient.post<{ url: string; headers: Record<string, string> }>(`/components/releases/${id}/upload`)).data
  },
  async publishRelease(row: ComponentRelease) {
    return (await apiClient.post<ComponentRelease>(`/components/releases/${row.release_id}/publish`, { row_version: row.row_version })).data
  },
  async preflight(target: ComponentTarget, release_id: string) {
    targetKey(target)
    if (!release_id) throw new Error('请选择已发布版本')
    return (await apiClient.post<ComponentPreflight>('/components/preflight', { target, release_id })).data
  },
  async start(body: UpgradeRequest) {
    targetKey(body.target)
    return (await apiClient.post<ComponentOperation>('/components/upgrades', body)).data
  },
  async operations(cursor?: string) {
    return (await apiClient.get<Page<ComponentOperation>>('/components/operations', { params: { cursor, limit: 25 } })).data
  },
  async operation(id: string) {
    return (await apiClient.get<ComponentOperation>(`/components/operations/${id}`)).data
  },
  async reconcile(id: string) {
    return (await apiClient.post<ComponentOperation>(`/components/operations/${id}/reconcile`, {})).data
  },
  async standaloneStatus(id: string, token: string) {
    // One operation-scoped capability, held only in the current page; no admin cookie sent upstream.
    const response = await fetch(`/component-maintenance/status/${id}`, {
      headers: { Authorization: 'Bearer ' + token }, credentials: 'omit', cache: 'no-store',
    })
    if (!response.ok) throw new Error('暂时无法获取独立升级进度')
    return await response.json() as Pick<ComponentOperation, 'state' | 'stage' | 'error_code'>
  },
}
