import { apiClient } from './client'

export type DependencyState = {
  status: 'ready' | 'not_ready'
  reason?: string
}

export type ReadinessResponse = {
  status: 'ready' | 'not_ready'
  dependencies: Record<string, DependencyState>
  request_id: string
}

export async function fetchReadiness(): Promise<ReadinessResponse> {
  const response = await apiClient.get<ReadinessResponse>('/system/health/ready', {
    validateStatus: (status) => status === 200 || status === 503,
  })
  return response.data
}

export type PlatformModule = {
  id: string
  title: string
  routes: string[]
  data_owner: string
  ui_complete: boolean
}

export async function fetchModules(): Promise<PlatformModule[]> {
  const response = await apiClient.get<PlatformModule[]>('/system/modules')
  return response.data
}

export type StorageMaintenance = {
  pending_blobs: number
  quarantined_blobs: number
  pending_gc_jobs: number
  processing_gc_jobs: number
  dead_letter_gc_jobs: number
  reclaimable_blobs: number
  reclaimable_bytes: number
  automatic_interval_seconds: number
}

export type StorageCleanupRequest = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  requested_at: string
  completed_at: string | null
  attempt_count: number
  claimed: number
  deleted: number
  failed: number
  stale: number
  error_type: string | null
}

export async function fetchStorageMaintenance(): Promise<StorageMaintenance> {
  return (await apiClient.get<StorageMaintenance>('/system/maintenance/storage')).data
}

export async function fetchStorageCleanup(): Promise<StorageCleanupRequest | null> {
  return (await apiClient.get<StorageCleanupRequest | null>('/system/maintenance/storage/cleanup')).data
}

export async function submitStorageCleanup(): Promise<StorageCleanupRequest> {
  return (await apiClient.post<StorageCleanupRequest>('/system/maintenance/storage/cleanup')).data
}
