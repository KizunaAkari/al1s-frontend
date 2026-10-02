import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { linuxReleases, uploadRelease, type LinuxRelease } from '../src/shared/api/linux-releases'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses bounded listing and optimistic publication revision', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [] } })
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
  await linuxReleases.list(25, 25)
  expect(get).toHaveBeenCalledWith('/releases/linux', { params: { offset: 25, limit: 25 } })
  await linuxReleases.publish({ release_id: 'release', row_version: 3 } as LinuxRelease)
  expect(post).toHaveBeenCalledWith('/releases/linux/release/publish', { row_version: 3 })
})

function fakeUpload() {
  const request = {
    open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), abort: vi.fn(),
    upload: {}, withCredentials: true, timeout: 0, status: 200, onload: () => {},
  }
  vi.stubGlobal('XMLHttpRequest', class { constructor() { return request } })
  return request
}

it('uploads directly without platform credentials or buffering the whole file', async () => {
  const request = fakeUpload()
  const file = new File(['archive'], 'candidate.tar')
  const done = uploadRelease('https://objects.local/upload', { 'Content-Type': 'application/x-tar' },
    file, vi.fn(), new AbortController().signal)
  expect(request.withCredentials).toBe(false)
  expect(request.setRequestHeader.mock.calls).toEqual([['Content-Type', 'application/x-tar']])
  expect(request.send).toHaveBeenCalledWith(file)
  request.onload()
  await done
})

it('does not send an already cancelled upload', async () => {
  const request = fakeUpload()
  const abort = new AbortController()
  abort.abort()
  await expect(uploadRelease('https://objects.local/upload', {}, new File([], 'x'),
    vi.fn(), abort.signal)).rejects.toThrow('上传已取消')
  expect(request.send).not.toHaveBeenCalled()
})
