import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LocalVisionControl from '../src/modules/bots/ai/LocalVisionControl.vue'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../src/shared/api/client', () => ({ apiClient: api }))
beforeEach(() => { vi.useFakeTimers(); api.get.mockReset() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('offers start when stopped and defers busy state until after the native link click', async () => {
  api.get.mockResolvedValue({ data: { state: 'stopped' } })
  const view = mount(LocalVisionControl)
  await flushPromises()
  expect(view.get('a').attributes('href')).toBe('al1s-vision://start')
  await view.get('a').trigger('click')
  expect(view.text()).not.toContain('正在启动')
  await vi.advanceTimersByTimeAsync(1)
  expect(view.get('a').attributes('aria-disabled')).toBe('true')
  view.unmount()
})

it('offers stop when running and respects cancellation', async () => {
  api.get.mockResolvedValue({ data: { state: 'running' } })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  const view = mount(LocalVisionControl)
  await flushPromises()
  expect(view.get('a').attributes('href')).toBe('al1s-vision://stop')
  expect(view.get('a').text()).toBe('停止共享服务')
  expect(view.text()).toContain('共享服务用于图片理解和绘图')
  const click = new MouseEvent('click', { cancelable: true })
  view.get('a').element.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(view.get('a').attributes('aria-disabled')).toBe('false')
  view.unmount()
})

it('waits for stopped status and blocks duplicate stop requests', async () => {
  api.get.mockResolvedValue({ data: { state: 'running' } })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const view = mount(LocalVisionControl)
  await flushPromises()
  await view.get('a').trigger('click')
  await vi.advanceTimersByTimeAsync(1)
  expect(view.text()).toContain('正在停止')
  await view.get('a').trigger('click')
  expect(confirm).toHaveBeenCalledTimes(1)
  api.get.mockResolvedValue({ data: { state: 'stopped' } })
  await vi.advanceTimersByTimeAsync(5000)
  expect(view.get('a').attributes('href')).toBe('al1s-vision://start')
  expect(view.get('a').attributes('aria-disabled')).toBe('false')
  view.unmount()
})

it('reports a stop timeout without claiming success', async () => {
  api.get.mockResolvedValue({ data: { state: 'running' } })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const view = mount(LocalVisionControl)
  await flushPromises()
  await view.get('a').trigger('click')
  await vi.advanceTimersByTimeAsync(65_001)
  expect(view.get('[role="alert"]').text()).toContain('尚未确认服务已停止')
  view.unmount()
})

it('continues waiting when a ComfyUI startup takes over one minute', async () => {
  api.get.mockResolvedValue({ data: { state: 'stopped' } })
  const view = mount(LocalVisionControl)
  await flushPromises()
  await view.get('a').trigger('click')
  await vi.advanceTimersByTimeAsync(70_001)
  expect(view.text()).toContain('正在启动')
  expect(view.find('[role="alert"]').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(115_000)
  expect(view.get('[role="alert"]').text()).toContain('启动超时')
  view.unmount()
})

it('clears a startup timeout when the service becomes ready later', async () => {
  api.get.mockResolvedValue({ data: { state: 'stopped' } })
  const view = mount(LocalVisionControl)
  await flushPromises()
  await view.get('a').trigger('click')
  await vi.advanceTimersByTimeAsync(185_001)
  expect(view.get('[role="alert"]').text()).toContain('启动超时')
  api.get.mockResolvedValue({ data: { state: 'running' } })
  await vi.advanceTimersByTimeAsync(5000)
  expect(view.text()).toContain('运行中')
  expect(view.find('[role="alert"]').exists()).toBe(false)
  view.unmount()
})

it('distinguishes service online from a loaded or temporarily suspended vision model', async () => {
  let phase = 'cold'
  api.get.mockImplementation((path: string) => Promise.resolve({ data: path.includes('/resources')
    ? { state: 'available', vision_state: phase } : { state: 'running' } }))
  const view = mount(LocalVisionControl, { props: { serviceId: 'qq', visionEnabled: true } })
  await flushPromises()
  expect(view.text()).toContain('等待预热')
  phase = 'suspended'
  await vi.advanceTimersByTimeAsync(5000)
  expect(view.text()).toContain('绘图期间暂让显存')
  phase = 'warm'
  await vi.advanceTimersByTimeAsync(5000)
  expect(view.text()).toContain('已预热')
  view.unmount()
})
