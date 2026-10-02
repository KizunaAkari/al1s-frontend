import { apiClient } from './client'

export type ReleaseInput = {
  release_id: string; version: string; architecture: 'arm64'; size_bytes: number
  sha256: string; candidate_image: string; expected_image_id: string
}
export type LinuxRelease = ReleaseInput & {
  state: 'draft' | 'queued' | 'verifying' | 'published' | 'failed'
  row_version: number; error_code: string | null; created_at: string
}
export const linuxReleases = {
  async list(offset = 0, limit = 25) {
    return (await apiClient.get<{ items: LinuxRelease[] }>('/releases/linux', { params: { offset, limit } })).data.items
  },
  async create(body: ReleaseInput) {
    return (await apiClient.post<LinuxRelease>('/releases/linux', body)).data
  },
  async publish(release: LinuxRelease) {
    return (await apiClient.post<LinuxRelease>(`/releases/linux/${release.release_id}/publish`, { row_version: release.row_version })).data
  },
  async upload(identity: string) {
    return (await apiClient.post<{ url: string; headers: Record<string, string>; method: 'PUT' }>(`/releases/linux/${identity}/upload`)).data
  },
}

// Separate from the platform Axios client: never attach admin headers/cookies to S3.
export function uploadRelease(url: string, headers: Record<string, string>, file: File,
  progress: (value: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('上传已取消')); return }
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    request.open('PUT', url)
    request.timeout = 3_600_000
    request.withCredentials = false
    for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.floor(event.loaded * 100 / event.total))
    }
    request.onloadend = () => signal.removeEventListener('abort', abort)
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve() : reject(new Error('文件上传未成功，请检查对象存储连接和CORS配置。'))
    request.onerror = () => reject(new Error('文件上传中断，版本尚未发布。'))
    request.ontimeout = () => reject(new Error('文件上传超时，版本尚未发布。'))
    request.onabort = () => reject(new Error('文件上传已取消，版本尚未发布。'))
    signal.addEventListener('abort', abort, { once: true })
    request.send(file)
  })
}
