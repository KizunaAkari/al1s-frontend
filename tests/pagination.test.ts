import { describe, expect, it } from 'vitest'

import { mergeUnique, useCursorPage } from '../src/shared/api/pagination'

describe('cursor pagination', () => {
  it('discards a response from the previous application after reset', async () => {
    type Page = { items: { id: string }[]; nextCursor: string | null }
    const resolve: Array<(page: Page) => void> = []
    const pager = useCursorPage(() => new Promise<Page>(done => resolve.push(done)), item => item.id)
    const first = pager.load(true)
    pager.reset()
    const second = pager.load(true)
    resolve[1]!({ items: [{ id: 'new' }], nextCursor: null })
    await second
    resolve[0]!({ items: [{ id: 'old' }], nextCursor: 'old-next' })
    await first
    expect(pager.items.value).toEqual([{ id: 'new' }])
    expect(pager.nextCursor.value).toBeNull()
    expect(pager.loading.value).toBe(false)
  })

  it('preserves order while removing records repeated by a later page', () => {
    const merged = mergeUnique(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'c' }, { id: 'c' }],
      (item) => item.id,
    )
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps loaded data when the next page fails', async () => {
    let call = 0
    const pager = useCursorPage(
      async () => {
        call += 1
        if (call === 1) return { items: [{ id: 'a' }], nextCursor: 'next' }
        throw new Error('failed')
      },
      (item: { id: string }) => item.id,
    )

    await pager.load(true)
    await pager.load()

    expect(pager.items.value).toEqual([{ id: 'a' }])
    expect(pager.nextCursor.value).toBe('next')
    expect(pager.error.value?.code).toBe('unknown_error')
  })
})
