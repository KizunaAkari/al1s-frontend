import { onBeforeUnmount, onMounted, watch } from 'vue'

type PollState = {
  sessionId: () => string | undefined
  finished: () => boolean
  pendingEvents: () => boolean
  failed: () => boolean
  refresh: () => Promise<void>
}

/** Completion is not an event watermark: briefly catch delayed terminal uploads. */
export function useQuickTestPolling(state: PollState) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let mounted = false
  let disposed = false
  let running = false
  let failures = 0
  let completedAt: number | undefined

  function needed() {
    return !!state.sessionId() && (!state.finished() || state.pendingEvents()
      || completedAt === undefined || Date.now() - completedAt <= 3000)
  }
  function schedule() {
    clearTimeout(timer)
    if (disposed || !mounted || !needed()) return
    const base = document.hidden ? 3000 : 500
    timer = setTimeout(() => { void tick() }, Math.min(10000, base * 2 ** failures))
  }
  async function tick() {
    if (running || disposed || !needed()) return
    running = true
    const sessionId = state.sessionId()
    try {
      await state.refresh()
      if (sessionId === state.sessionId()) failures = state.failed() ? Math.min(5, failures + 1) : 0
    } finally { running = false; schedule() }
  }
  function visible() {
    if (!document.hidden) {
      clearTimeout(timer)
      // A foreground retry bypasses backoff but cannot overlap the active refresh.
      if (running) return
      void tick()
    } else schedule()
  }
  watch(state.finished, finished => {
    completedAt = finished ? Date.now() : undefined
  }, { flush: 'sync' })
  watch(state.sessionId, () => {
    completedAt = undefined
    failures = 0
    clearTimeout(timer)
    if (mounted && !running) void tick()
  })
  onMounted(() => { mounted = true; document.addEventListener('visibilitychange', visible); void tick() })
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', visible)
  })
}
