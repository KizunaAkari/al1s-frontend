import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useThemeStore } from '../src/app/theme'

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    setActivePinia(createPinia())
  })

  it('persists dark mode and applies it to the document', () => {
    const store = useThemeStore()
    store.setPreference('dark')

    expect(store.preference).toBe('dark')
    expect(localStorage.getItem('al1s-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the system subscription on store disposal and keeps new stores responsive', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    let matches = false
    const mediaQuery = {
      get matches() { return matches },
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    } as unknown as MediaQueryList & { emit: (matches: boolean) => void }
    mediaQuery.emit = value => {
      matches = value
      for (const listener of listeners) listener({ matches: value } as MediaQueryListEvent)
    }
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery)

    setActivePinia(createPinia())
    const disposed = useThemeStore()
    expect(mediaQuery.addEventListener).toHaveBeenCalledOnce()
    disposed.$dispose()
    expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce()
    mediaQuery.emit(true)
    expect(disposed.isDark).toBe(false)

    setActivePinia(createPinia())
    const fresh = useThemeStore()
    mediaQuery.emit(false)
    expect(fresh.isDark).toBe(false)
    mediaQuery.emit(true)
    expect(fresh.isDark).toBe(true)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
