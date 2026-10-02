import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { ElButton } from 'element-plus'
const mocks = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn(), post: vi.fn(), replace: vi.fn() }))
vi.mock('../src/shared/api/client', () => ({
  apiClient: mocks, normalizeApiError: () => ({ message: '连接失败', code: 'network' }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => mocks, useRoute: () => ({ query: {} }),
}))
import Overview from '../src/modules/overview/OverviewView.vue'
import Health from '../src/shared/ui/PlatformHealth.vue'
import Login from '../src/modules/auth/LoginView.vue'
import Outline from '../src/modules/maa/editor/WorkflowOutline.vue'
const terminal = { terminal_id: 'linux-1', display_name: '真实终端', service_status: 'online',
  terminal_type: 'linux', agent_version: 'v1', last_seen_at: null }
const mounted: { unmount: () => void }[] = []
function view(component: Parameters<typeof mount>[0], options = {}) {
  const wrapper = mount(component, { global: { plugins: [createPinia()], stubs: { RegistrationGrantDialog: true } }, ...options })
  mounted.push(wrapper); return wrapper
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()) })
it('shows real terminal data and clearly scopes partial counts, without fabricated resource columns', async () => {
  mocks.get.mockResolvedValue({ data: { items: [terminal], next_cursor: 'next' } })
  const w = view(Overview); await flushPromises()
  expect(w.text()).toContain('真实终端')
  expect(w.text()).toContain('1 在线 · 0 离线')
  expect(w.text()).toContain('已加载范围')
  expect(w.text()).not.toContain('CPU')
  const open = w.findAllComponents(ElButton).find(b => b.text() === '打开终端')!
  await open.trigger('click')
  expect(mocks.push).toHaveBeenCalledWith({ path: '/terminals', query: { terminal_id: 'linux-1' } })
  await w.get('input').setValue('不存在')
  expect(w.text()).toContain('没有匹配项')
})
it('does not pretend a failed terminal request means zero terminals', async () => {
  mocks.get.mockRejectedValue(new Error('offline'))
  const w = view(Overview); await flushPromises()
  expect(w.text()).toContain('终端状态暂不可用')
  expect(w.text()).toContain('连接失败')
  expect(w.text()).not.toContain('0 在线')
})
it('shows a useful empty state with registration still available', async () => {
  mocks.get.mockResolvedValue({ data: { items: [], next_cursor: null } })
  const w = view(Overview); await flushPromises()
  expect(w.text()).toContain('暂无终端')
  expect(w.findAllComponents(ElButton).some(b => b.text() === '接入终端')).toBe(true)
})
it('never reports healthy when readiness cannot be read or a dependency is unready', async () => {
  mocks.get.mockRejectedValue(new Error('offline'))
  const w = view(Health); await flushPromises()
  expect(w.get('.health-summary').text()).toContain('状态未知')
  w.unmount()
  mocks.get.mockResolvedValue({ data: { status: 'not_ready', dependencies: { mqtt: { status: 'not_ready' } } } })
  const other = view(Health); await flushPromises()
  expect(other.get('.health-summary').text()).toContain('平台异常')
})
it('preserves password login while using a minimal independent layout', async () => {
  mocks.post.mockResolvedValue({ data: {} })
  const w = view(Login)
  expect(w.find('.app-sidebar').exists()).toBe(false)
  expect(w.get('input').attributes('placeholder')).toBe('输入密码')
  expect(w.get('input').attributes('type')).toBe('password')
  await w.get('input').setValue('test-only-password')
  await w.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.post).toHaveBeenCalledWith('/auth/login', { password: 'test-only-password' })
  expect(mocks.replace).toHaveBeenCalledWith('/')
})
it('projects the same steps into readable order, skip destinations and recovery paths', () => {
  const w = view(Outline, { props: { selected: 0, disabled: false, document: { steps: [
    { action: 'tap', name: '领取奖励', x: 1, y: 2, skip_condition: { enabled: true, skip_to_step_index: 2 } },
    { action: 'home', failure_retry: { enabled: true } },
  ] } } })
  expect(w.text()).toContain('领取奖励')
  expect(w.text()).toContain('条件满足 → 第 2 步')
  expect(w.text()).toContain('调用恢复脚本')
})
