import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

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
})
