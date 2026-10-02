import { shallowRef, ref } from 'vue'

import { type ApiError, normalizeApiError } from './client'

export type CursorPage<T, Cursor> = {
  items: T[]
  nextCursor: Cursor | null
}

export function mergeUnique<T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(current.map(keyOf))
  const uniqueIncoming = incoming.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return current.concat(uniqueIncoming)
}

export function useCursorPage<T, Cursor>(
  loader: (cursor: Cursor | null) => Promise<CursorPage<T, Cursor>>,
  keyOf: (item: T) => string,
) {
  const items = shallowRef<T[]>([])
  const nextCursor = shallowRef<Cursor | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = shallowRef<ApiError | null>(null)
  let generation = 0

  async function load(reset = false): Promise<void> {
    if (loading.value && !reset) return
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const page = await loader(reset ? null : nextCursor.value)
      if (current !== generation) return
      items.value = reset ? page.items : mergeUnique(items.value, page.items, keyOf)
      nextCursor.value = page.nextCursor
      loaded.value = true
    } catch (reason) {
      if (current !== generation) return
      error.value = normalizeApiError(reason)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function reset(): void {
    ++generation
    loading.value = false
    items.value = []
    nextCursor.value = null
    loaded.value = false
    error.value = null
  }

  return { items, nextCursor, loading, loaded, error, load, reset }
}
