import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ScriptQuickTest from '../src/modules/maa/editor/ScriptQuickTest.vue'
import * as api from '../src/shared/api/maa-quick-test'

const detail: api.QuickTestDetail = {
  session_id: 'session', candidate_version_id: 'v', status: 'claimed',
  expires_at: '2099-01-01T00:00:00Z', qualification_status: null,
  error_code: null, step_number: null, failed_step_number: null,
}
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(api, 'readQuickTest').mockResolvedValue(detail)
  vi.spyOn(api, 'fetchQuickTestEvents').mockResolvedValue({ items: [], next_after: null })
  sessionStorage.setItem('al1s.quick-test.s', JSON.stringify({
    command: { scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'k' }, sessionId: 'session',
  }))
})
afterEach(() => { wrapper?.unmount(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })
function editor() {
  wrapper = mount(ScriptQuickTest, { props: { script: { script_id: 's', current_version_id: 'v' } as never, disabled: false } })
  return wrapper
}
const event = { sequence: 1, kind: 'step_started' as const, step_number: 2, code: null, created_at: '2026-09-30T00:00:00Z' }

it('keeps the same empty log caption mounted while background polling is in flight', async () => {
  vi.mocked(api.readQuickTest).mockResolvedValue({ ...detail, status: 'issued' })
  editor(); await flushPromises()
  const log = wrapper.get('[aria-label="调试步骤日志"]')
  const caption = log.findAll('p').find(node => node.text() === '暂无终端执行事件。')!.element
  for (let round = 0; round < 3; round++) {
    let resolve!: (value: { items: api.QuickTestEvent[]; next_after: number | null }) => void
    vi.mocked(api.fetchQuickTestEvents).mockReturnValueOnce(new Promise(done => { resolve = done }))
    await vi.advanceTimersByTimeAsync(500)
    expect(log.text()).toContain('暂无终端执行事件。')
    expect(log.element.contains(caption)).toBe(true)
    expect(wrapper.emitted('progress')?.at(-1)?.[0]).toMatchObject({ phase: 'waiting', step: null })
    resolve({ items: [], next_after: null }); await flushPromises()
    expect(log.findAll('p').find(node => node.text() === '暂无终端执行事件。')!.element).toBe(caption)
  }
})

it('keeps a detail error visible while retrying and clears it only on success', async () => {
  vi.mocked(api.readQuickTest).mockResolvedValueOnce(detail).mockRejectedValueOnce(new Error('暂时无法读取'))
  editor(); await flushPromises()
  await vi.advanceTimersByTimeAsync(500)
  expect(wrapper.text()).toContain('暂时无法读取')
  let resolve!: (value: api.QuickTestDetail) => void
  vi.mocked(api.readQuickTest).mockReturnValueOnce(new Promise(done => { resolve = done }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(wrapper.text()).toContain('暂时无法读取')
  resolve(detail); await flushPromises()
  expect(wrapper.text()).not.toContain('暂时无法读取')
})

it('retains known terminal progress when a later event page is empty or unavailable', async () => {
  vi.mocked(api.fetchQuickTestEvents).mockResolvedValueOnce({ items: [event], next_after: null })
  editor(); await flushPromises()
  const log = wrapper.get('[aria-label="调试步骤日志"]')
  const row = log.get('li').element
  await vi.advanceTimersByTimeAsync(500)
  expect(log.get('li').element).toBe(row)
  vi.mocked(api.fetchQuickTestEvents).mockRejectedValueOnce(new Error('日志暂时不可用'))
  await vi.advanceTimersByTimeAsync(500)
  expect(log.text()).toContain('日志暂时不可用')
  expect(log.get('li').element).toBe(row)
  expect(wrapper.emitted('progress')?.at(-1)?.[0]).toMatchObject({ phase: 'running', step: 2 })
})

it('shows events every 500ms while active and does not poll without a session', async () => {
  editor(); await flushPromises()
  vi.mocked(api.fetchQuickTestEvents).mockResolvedValue({ items: [event], next_after: null })
  await vi.advanceTimersByTimeAsync(499)
  expect(wrapper.text()).not.toContain('当前执行步骤：02')
  await vi.advanceTimersByTimeAsync(1)
  expect(wrapper.text()).toContain('当前执行步骤：02')
  expect(api.readQuickTest).toHaveBeenCalledTimes(2)
  wrapper.unmount(); sessionStorage.clear(); vi.mocked(api.readQuickTest).mockClear()
  editor(); await vi.advanceTimersByTimeAsync(60000)
  expect(api.readQuickTest).not.toHaveBeenCalled()
})

it('reads events independently of slow detail and never overlaps refreshes', async () => {
  let resolve!: (value: api.QuickTestDetail) => void
  vi.mocked(api.readQuickTest).mockResolvedValueOnce(detail)
    .mockReturnValueOnce(new Promise(done => { resolve = done }))
  editor(); await flushPromises()
  vi.mocked(api.fetchQuickTestEvents).mockResolvedValue({ items: [event], next_after: null })
  await vi.advanceTimersByTimeAsync(500)
  expect(wrapper.emitted('progress')?.at(-1)?.[0]).toMatchObject({ phase: 'running', step: 2 })
  await vi.advanceTimersByTimeAsync(5000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(2)
  expect(api.fetchQuickTestEvents).toHaveBeenCalledTimes(2)
  resolve(detail); await flushPromises()
  await vi.advanceTimersByTimeAsync(500)
  expect(api.readQuickTest).toHaveBeenCalledTimes(3)
})

it('backs off in hidden tabs and refreshes immediately on return', async () => {
  editor(); await flushPromises()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(2999)
  expect(api.readQuickTest).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(api.readQuickTest).toHaveBeenCalledTimes(2)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(api.readQuickTest).toHaveBeenCalledTimes(3)
})

it('catches late completion events, then releases timers', async () => {
  vi.mocked(api.readQuickTest).mockResolvedValue({ ...detail, status: 'completed' })
  editor(); await flushPromises()
  await vi.advanceTimersByTimeAsync(2000)
  vi.mocked(api.fetchQuickTestEvents).mockResolvedValue({ items: [event], next_after: null })
  await vi.advanceTimersByTimeAsync(500)
  expect(wrapper.text()).toContain('开始步骤')
  await vi.advanceTimersByTimeAsync(1000)
  const calls = vi.mocked(api.readQuickTest).mock.calls.length
  await vi.advanceTimersByTimeAsync(60000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(calls)
})

it('backs off offline failures and recovers with existing session identity', async () => {
  vi.mocked(api.readQuickTest).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
  editor(); await flushPromises()
  await vi.advanceTimersByTimeAsync(999)
  expect(api.readQuickTest).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(api.readQuickTest).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(2000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(3)
  expect(wrapper.text()).not.toContain('offline')
  expect(api.readQuickTest).toHaveBeenLastCalledWith('s', 'session')
})

it('limits a steady foreground minute to 120 refreshes and stops on unmount', async () => {
  editor(); await flushPromises()
  await vi.advanceTimersByTimeAsync(60000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(121)
  expect(api.fetchQuickTestEvents).toHaveBeenCalledTimes(121)
  wrapper.unmount()
  await vi.advanceTimersByTimeAsync(60000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(121)
})

it('does not let a slow read overwrite the result of a concurrent stop', async () => {
  let resolve!: (value: api.QuickTestDetail) => void
  vi.mocked(api.readQuickTest).mockResolvedValueOnce(detail)
    .mockReturnValueOnce(new Promise(done => { resolve = done }))
  vi.spyOn(api, 'stopQuickTest').mockResolvedValue({ ...detail, status: 'completed', qualification_status: 'passed' })
  editor(); await flushPromises()
  await vi.advanceTimersByTimeAsync(500)
  await (wrapper.vm as unknown as { stop: () => Promise<void> }).stop()
  expect(wrapper.text()).toContain('测试已结束')
  resolve(detail); await flushPromises()
  expect(wrapper.text()).toContain('测试已结束')
  expect(wrapper.text()).not.toContain('终端已领取')
})

it('ignores detail and event replies after unmount', async () => {
  let resolveDetail!: (value: api.QuickTestDetail) => void
  let resolveEvents!: (value: { items: api.QuickTestEvent[]; next_after: number | null }) => void
  vi.mocked(api.readQuickTest).mockReturnValueOnce(new Promise(done => { resolveDetail = done }))
  vi.mocked(api.fetchQuickTestEvents).mockReturnValueOnce(new Promise(done => { resolveEvents = done }))
  editor(); wrapper.unmount()
  const results = wrapper.emitted('result')?.length ?? 0
  resolveDetail(detail); resolveEvents({ items: [event], next_after: null }); await flushPromises()
  expect(wrapper.emitted('result')?.length ?? 0).toBe(results)
  await vi.advanceTimersByTimeAsync(10000)
  expect(api.readQuickTest).toHaveBeenCalledTimes(1)
})

it('measures event-to-display latency over 50 polling phases with immediate mock transport', async () => {
  const delays: number[] = []
  for (let phase = 0; phase < 500; phase += 10) {
    vi.setSystemTime(0)
    vi.mocked(api.fetchQuickTestEvents).mockResolvedValue({ items: [], next_after: null })
    editor(); await flushPromises()
    await vi.advanceTimersByTimeAsync(phase)
    vi.mocked(api.fetchQuickTestEvents).mockResolvedValue({ items: [event], next_after: null })
    await vi.advanceTimersByTimeAsync(500 - phase)
    expect(wrapper.text()).toContain('当前执行步骤：02')
    delays.push(Date.now() - phase)
    wrapper.unmount()
  }
  delays.sort((a, b) => a - b)
  expect(delays[24]).toBe(250) // P50, nearest rank.
  expect(delays[47]).toBe(480) // P95, excludes terminal/network latency.
  expect(delays[49]).toBe(500)
})
