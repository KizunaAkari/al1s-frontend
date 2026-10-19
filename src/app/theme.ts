import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'

const storageKey = 'al1s-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(storageKey) as ThemePreference | null
  const preference = ref<ThemePreference>(stored ?? 'system')
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  const systemDark = ref(mediaQuery?.matches ?? systemPrefersDark())
  const isDark = computed(() => preference.value === 'dark' || (
    preference.value === 'system' && systemDark.value
  ))

  function setPreference(value: ThemePreference): void {
    preference.value = value
  }

  watch(preference, (value) => localStorage.setItem(storageKey, value), {
    immediate: true,
    flush: 'sync',
  })
  watch(isDark, (value) => document.documentElement.classList.toggle('dark', value), {
    immediate: true,
    flush: 'sync',
  })
  const onSystemChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches
  }
  mediaQuery?.addEventListener?.('change', onSystemChange)
  onScopeDispose(() => mediaQuery?.removeEventListener?.('change', onSystemChange))

  return { preference, isDark, setPreference }
})
