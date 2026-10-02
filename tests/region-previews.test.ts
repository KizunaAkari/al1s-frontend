import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRegionPreviews } from '../src/modules/maa/editor/use-region-previews'
import { ApiError, apiClient } from '../src/shared/api/client'

const blob = new Blob(['png'])
let previews: ReturnType<typeof useRegionPreviews>
const script = ref('script'), version = ref<string | undefined>('version')
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  script.value = 'script'; version.value = 'version'
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  wrapper = mount(defineComponent({
    setup() { previews = useRegionPreviews(() => script.value, () => version.value) },
    template: '<div />',
  }))
})
afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); vi.useRealTimers() })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

it('merges concurrent reads and serves uploaded images before a version exists', async () => {
  const response = deferred<{ data: Blob }>()
  const get = vi.spyOn(apiClient, 'get').mockReturnValue(response.promise as never)
  const first = previews.load({ $blob: 'a' })
  expect(previews.load({ $blob: 'a' })).toBe(first)
  expect(previews.load({ $blob: 'a' })).toBe(first)
  response.resolve({ data: blob })
  expect(await first).toBe('blob:preview')
  expect(await previews.load({ $blob: 'a' })).toBe('blob:preview')
  expect(get).toHaveBeenCalledTimes(1)
  version.value = undefined
  previews.remember({ $blob: 'new', file_name: 'new.png' } as never, blob)
  expect(await previews.load({ $blob: 'new' })).toBe('blob:preview')
  expect(get).toHaveBeenCalledTimes(1)
})

it('queues distinct resources in FIFO order with only one active request', async () => {
  const first = deferred<{ data: Blob }>()
  const get = vi.spyOn(apiClient, 'get').mockReturnValueOnce(first.promise as never)
    .mockResolvedValue({ data: blob })
  const pending = ['a', 'b', 'c'].map(id => previews.load({ $blob: id }))
  expect(get).toHaveBeenCalledTimes(1)
  first.resolve({ data: blob })
  await Promise.all(pending)
  expect(get.mock.calls.map(call => call[0])).toEqual(['a', 'b', 'c'].map(id =>
    `/maa/scripts/script/versions/version/images/${id}`))
})

it('retries 429 twice with bounded backoff, then permits a fresh attempt', async () => {
  vi.useFakeTimers()
  const get = vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError('busy', { code: 'busy', status: 429 }))
  const pending = previews.load({ $blob: 'a' })
  await flushPromises()
  await vi.advanceTimersByTimeAsync(199)
  expect(get).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(get).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(500)
  expect(await pending).toBeUndefined()
  expect(get).toHaveBeenCalledTimes(3)
  get.mockResolvedValue({ data: blob })
  expect(await previews.load({ $blob: 'a' })).toBe('blob:preview')
})

it('does not retry authorization failures and does not cache failures', async () => {
  const get = vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new ApiError('denied', { code: 'denied', status: 403 }))
    .mockResolvedValue({ data: blob })
  expect(await previews.load({ $blob: 'a' })).toBeUndefined()
  expect(get).toHaveBeenCalledTimes(1)
  expect(await previews.load({ $blob: 'a' })).toBe('blob:preview')
})

it('cancels old scope and queued loads, ignores late replies and revokes URLs', async () => {
  const response = deferred<{ data: Blob }>()
  const get = vi.spyOn(apiClient, 'get').mockReturnValueOnce(response.promise as never)
    .mockResolvedValue({ data: blob })
  const old = previews.load({ $blob: 'a' }), queued = previews.load({ $blob: 'b' })
  version.value = 'next'
  expect(get.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  expect(await old).toBeUndefined()
  expect(await queued).toBeUndefined()
  const next = previews.load({ $blob: 'a' })
  response.resolve({ data: blob })
  expect(await next).toBe('blob:preview')
  expect(get).toHaveBeenCalledTimes(2)
  expect(get.mock.calls[1]?.[0]).toContain('/versions/next/')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
})

it('settles loads and cancels retry timers on unmount', async () => {
  vi.useFakeTimers()
  const get = vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError('busy', { code: 'busy', status: 429 }))
  const pending = previews.load({ $blob: 'a' })
  const queued = previews.load({ $blob: 'b' })
  await flushPromises()
  wrapper.unmount()
  expect(await pending).toBeUndefined()
  expect(await queued).toBeUndefined()
  await vi.advanceTimersByTimeAsync(10000)
  expect(get).toHaveBeenCalledTimes(1)
})
