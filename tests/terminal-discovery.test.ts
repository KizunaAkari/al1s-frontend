import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElDialog, ElInput } from 'element-plus'
import { helpText } from './help-test-utils'
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/client', () => ({ apiClient: { get, post, delete: remove }, normalizeApiError: (e: Error) => ({ message: e.message, code: 'network', name: 'ApiError' }) }))

import TerminalWorkbenchView from '../src/modules/terminals/TerminalWorkbenchView.vue'
import type { TargetDevice, TargetDeviceDiscovery, Terminal } from '../src/shared/api/terminals'

const linux: Terminal = {
  terminal_id: 'linux-1', installation_id: 'installation', terminal_type: 'linux', display_name: 'Linux 终端',
  service_status: 'online', acceptance_status: 'accepting', agent_version: '1.0',
  current_capability_profile_id: null, row_version: 2, name_version: 0, created_at: '2026-09-20T00:00:00Z',
  last_seen_at: '2026-09-20T00:00:00Z', delete: { allowed: false, refusal_code: null, refusal_message: null },
}
const android: Terminal = { ...linux, terminal_id: 'android-1', terminal_type: 'android', display_name: 'Android 终端' }
const target: TargetDevice = {
  device_id: 'device-1', display_name: 'Pixel', platform: 'android', mode: 'mounted',
  managing_terminal_id: 'linux-1', row_version: 1, created_at: '2026-09-20T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
}

let devices: TargetDevice[]
let discoveries: TargetDeviceDiscovery[]

function discovery(bound = false): TargetDeviceDiscovery {
  return {
    identifier_id: 'identifier-1', target_device_id: bound ? target.device_id : null,
    source_terminal_id: 'linux-1', source_type: 'adb_serial', display_hint: 'adb-serial-1',
    row_version: 7, created_at: '2026-09-20T00:00:00Z', bound_at: bound ? '2026-09-20T00:01:00Z' : null,
  }
}

function view() {
  return mount(TerminalWorkbenchView, {
    global: { stubs: { RouterLink: true, TerminalCapability: true, HostMaintenance: true, RegistrationGrantDialog: true } },
  })
}

function button(wrapper: ReturnType<typeof view>, text: string) {
  const result = wrapper.findAllComponents(ElButton).find(item => item.text() === text)
  if (!result) throw new Error('未找到按钮：' + text)
  return result
}

beforeEach(() => {
  devices = []
  discoveries = [discovery()]
  get.mockReset()
  post.mockReset()
  remove.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/terminals') return Promise.resolve({ data: { items: [linux, android], next_cursor: null } })
    if (url === '/target-devices') return Promise.resolve({ data: { items: devices, next_cursor: null } })
    if (url === '/target-devices/adb-discoveries') {
      return Promise.resolve({ data: { items: discoveries, next_cursor: null } })
    }
    throw new Error('unexpected GET ' + url)
  })
  post.mockImplementation((url: string, body: Record<string, unknown>) => {
    if (url !== '/target-devices/discoveries/identifier-1/connect') throw new Error('unexpected POST ' + url)
    expect(body).toEqual({ expected_identifier_version: 7, display_name: 'Pixel' })
    devices = [target]
    discoveries = [discovery(true)]
    return Promise.resolve({ data: target })
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Linux ADB discovery association', () => {
  it('keeps the full terminal name available beside its edit action', async () => {
    const longName = '这是一台名称很长的 Linux 终端'.repeat(8)
    get.mockImplementation((url: string) => {
      if (url === '/terminals') return Promise.resolve({ data: { items: [{ ...linux, display_name: longName }], next_cursor: null } })
      if (url === '/target-devices') return Promise.resolve({ data: { items: [], next_cursor: null } })
      throw new Error('unexpected GET ' + url)
    })
    const wrapper = view()
    try {
      await flushPromises()
      expect(wrapper.get('.terminal-choice strong').attributes('title')).toBe(longName)
      const title = wrapper.get('.terminal-title-line h2')
      expect(title.attributes('title')).toBe(longName)
      expect(title.element.nextElementSibling?.getAttribute('aria-label')).toBe('修改终端名称')
    } finally { wrapper.unmount() }
  })
  it('filters loaded terminals by name and type without changing identity', async () => {
    const wrapper = view()
    try {
      await flushPromises()
      expect(wrapper.findAll('.terminal-choice')).toHaveLength(2)
      await wrapper.get('input[aria-label="搜索终端名称或ID"]').setValue('android-1')
      expect(wrapper.findAll('.terminal-choice')).toHaveLength(1)
      await wrapper.get('.terminal-choice').trigger('click')
      expect(wrapper.get('.terminal-identity h2').text()).toBe('Android 终端')
      expect(wrapper.findComponent({ name: 'TerminalDiscoveries' }).exists()).toBe(false)
      await wrapper.get('input[aria-label="搜索终端名称或ID"]').setValue('')
      expect(wrapper.findAll('.terminal-choice')).toHaveLength(2)
      expect(wrapper.text()).not.toContain('未发现设备')
    } finally { wrapper.unmount() }
  })
  it('keeps unbound logical phones accessible without merging them with terminals', async () => {
    devices = [{ ...target, managing_terminal_id: null, mode: 'unassigned' }]
    const wrapper = view()
    try {
      await flushPromises()
      const radios = wrapper.findAll('input[type="radio"]')
      await radios.find(r => r.element instanceof HTMLInputElement && r.element.value === 'unbound')!.setValue()
      expect(wrapper.find('.phone-row').text()).toContain('Pixel')
      expect(wrapper.find('.phone-row').text()).toContain('未绑定')
      expect(wrapper.findAll('.terminal-choice')).toHaveLength(2)
    } finally { wrapper.unmount() }
  })
  it('places the phone rename button beside a single-line name', async () => {
    const longName = '这是一部名称很长的逻辑手机'.repeat(8)
    devices = [{ ...target, display_name: longName }]
    const wrapper = view()
    try {
      await flushPromises()
      const row = wrapper.get('.phone-row')
      const name = row.get('.phone-name-line strong')
      expect(name.attributes('title')).toBe(longName)
      expect(name.element.nextElementSibling?.getAttribute('aria-label')).toBe('修改手机名称')
      expect(row.find('[aria-label="更多手机操作"]').exists()).toBe(false)
      expect(row.get('.phone-actions').text()).toContain('绑定 Android APK')
      await row.get('[aria-label="修改手机名称"]').trigger('click')
      expect(wrapper.findAllComponents(ElDialog).some(dialog => dialog.props('modelValue') === true)).toBe(true)
    } finally { wrapper.unmount() }
  })
  it('marks failed refresh as stale rather than zero or current', async () => {
    const wrapper = view()
    try {
      await flushPromises()
      get.mockRejectedValue(new Error('网络不可达'))
      await button(wrapper, '刷新').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('显示上次数据')
      expect(wrapper.text()).toContain('终端统计暂不可用')
      expect(wrapper.findAll('.terminal-choice')).toHaveLength(2)
    } finally { wrapper.unmount() }
  })
  it('does not silently select a different terminal when the selected record disappears', async () => {
    const wrapper = view()
    try {
      await flushPromises()
      get.mockResolvedValue({ data: { items: [], next_cursor: null } })
      await button(wrapper, '刷新').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('记录已失效')
      expect(wrapper.find('.terminal-detail-head').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })
  it('does not reload a departed discovery panel after a late association response', async () => {
    let finish!: (value: unknown) => void
    post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = view()
    await flushPromises()
    await button(wrapper, '发现 ADB 手机').trigger('click')
    await flushPromises()
    const input = wrapper.get('input[aria-label^="手机名称"]')
    await input.setValue('Pixel')
    await button(wrapper, '关联此手机').trigger('click')
    await flushPromises()
    const before = get.mock.calls.filter(([path]) => path === '/target-devices/adb-discoveries').length
    wrapper.unmount()
    finish({ data: target })
    await flushPromises()
    expect(get.mock.calls.filter(([path]) => path === '/target-devices/adb-discoveries')).toHaveLength(before)
  })
  it('loads existing discovery records, explains their meaning, and associates a phone', async () => {
    const wrapper = view()
    try {
      await flushPromises()
      expect(wrapper.findAllComponents(ElButton).filter(item => item.text() === '发现 ADB 手机')).toHaveLength(1)
      await button(wrapper, '发现 ADB 手机').trigger('click')
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/target-devices/adb-discoveries', {
        params: { terminal_id: 'linux-1', after_id: undefined, limit: 50 },
      })
      const discoveryHelp = await helpText(wrapper, 'ADB 发现记录')
      expect(discoveryHelp).toContain('已有的发现记录')
      expect(discoveryHelp).toContain('不代表 ADB 当前在线')

      const name = wrapper.get('input[aria-label^="手机名称"]')
      await name.setValue('Pixel')
      await button(wrapper, '关联此手机').trigger('click')
      await flushPromises()
      expect(post).toHaveBeenCalledWith('/target-devices/discoveries/identifier-1/connect', {
        expected_identifier_version: 7, display_name: 'Pixel',
      })
      expect(wrapper.text()).toContain('Pixel')
      expect(wrapper.text()).toContain('已关联')
      expect(get.mock.calls.filter(call => call[0] === '/target-devices')).toHaveLength(2)
      expect(wrapper.findAllComponents(ElButton).some(item => item.text() === '关联此手机')).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('does not offer a second association for an already-bound discovery', async () => {
    discoveries = [discovery(true)]
    const wrapper = view()
    try {
      await flushPromises()
      await button(wrapper, '发现 ADB 手机').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('已关联')
      expect(wrapper.findAllComponents(ElButton).some(item => item.text() === '关联此手机')).toBe(false)
      expect(post).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })

  it('retains the same name and version for a user retry after a failed connect', async () => {
    post.mockRejectedValueOnce(new Error('连接冲突'))
    const wrapper = view()
    try {
      await flushPromises()
      await button(wrapper, '发现 ADB 手机').trigger('click')
      await flushPromises()
      await button(wrapper, '关联此手机').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('连接冲突')
      await button(wrapper, '关联此手机').trigger('click')
      await flushPromises()
      expect(post).toHaveBeenNthCalledWith(1, '/target-devices/discoveries/identifier-1/connect', {
        expected_identifier_version: 7, display_name: 'adb-serial-1',
      })
      expect(post).toHaveBeenNthCalledWith(2, '/target-devices/discoveries/identifier-1/connect', {
        expected_identifier_version: 7, display_name: 'adb-serial-1',
      })
    } finally { wrapper.unmount() }
  })
})
