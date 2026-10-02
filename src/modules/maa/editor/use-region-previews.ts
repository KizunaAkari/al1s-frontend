import { onBeforeUnmount, watch, type InjectionKey } from 'vue'
import { ApiError, apiClient } from '../../../shared/api/client'
import type { BlobResource } from './image-binding'

export const regionPreviewsKey: InjectionKey<ReturnType<typeof useRegionPreviews>> = Symbol('region-previews')

type PreviewJob = {
  key: string
  path: string
  generation: number
  resolve: (url: string | undefined) => void
}

function pause(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, delay)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}

export function useRegionPreviews(scriptId: () => string, versionId: () => string | undefined) {
  const urls = new Map<string, string>()
  const inFlight = new Map<string, Promise<string | undefined>>()
  const queue: PreviewJob[] = []
  let generation = 0
  let scope = identity()
  let disposed = false
  let active: { job: PreviewJob; controller: AbortController } | undefined

  function identity() { return JSON.stringify([scriptId(), versionId()]) }
  function resourceKey(resource: BlobResource) { return JSON.stringify([scope, resource.$blob]) }
  function reset() {
    generation++
    active?.controller.abort()
    active?.job.resolve(undefined)
    for (const job of queue.splice(0)) job.resolve(undefined)
    inFlight.clear()
    for (const url of urls.values()) URL.revokeObjectURL(url)
    urls.clear()
    scope = identity()
  }
  function syncScope() { if (scope !== identity()) reset() }
  watch(() => [scriptId(), versionId()], reset, { flush: 'sync' })

  function remember(resource: BlobResource, blob: Blob) {
    syncScope()
    const key = resourceKey(resource)
    if (!disposed && !urls.has(key)) urls.set(key, URL.createObjectURL(blob))
  }

  async function read(job: PreviewJob, signal: AbortSignal): Promise<Blob | undefined> {
    for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
      try {
        const response = await apiClient.get<Blob>(job.path, { responseType: 'blob', signal })
        return signal.aborted ? undefined : response.data
      } catch (cause) {
        if (signal.aborted || !(cause instanceof ApiError) || cause.status !== 429 || attempt === 2) return
        await pause(attempt === 0 ? 200 : 500, signal)
      }
    }
  }

  async function run(job: PreviewJob) {
    const controller = new AbortController()
    active = { job, controller }
    try {
      const blob = await read(job, controller.signal)
      if (disposed || job.generation !== generation || !blob) return
      if (!urls.has(job.key)) urls.set(job.key, URL.createObjectURL(blob))
      job.resolve(urls.get(job.key))
    } finally {
      job.resolve(undefined)
      if (job.generation === generation) inFlight.delete(job.key)
      active = undefined
      pump()
    }
  }
  function pump() {
    if (active || disposed) return
    const job = queue.shift()
    if (job) void run(job)
  }
  function load(value: unknown): Promise<string | undefined> {
    syncScope()
    const resource = value as BlobResource | undefined
    if (disposed || !resource?.$blob) return Promise.resolve(undefined)
    const key = resourceKey(resource)
    const cached = urls.get(key)
    if (cached) return Promise.resolve(cached)
    const existing = inFlight.get(key)
    if (existing) return existing
    const version = versionId()
    if (!version) return Promise.resolve(undefined)
    const promise = new Promise<string | undefined>(resolve => {
      queue.push({ key, generation, resolve,
        path: `/maa/scripts/${encodeURIComponent(scriptId())}/versions/${encodeURIComponent(version)}/images/${encodeURIComponent(resource.$blob)}` })
    })
    inFlight.set(key, promise)
    pump()
    return promise
  }
  onBeforeUnmount(() => { disposed = true; reset() })
  return { remember, load }
}
