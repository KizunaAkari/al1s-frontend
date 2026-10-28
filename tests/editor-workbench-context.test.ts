import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchTargetDevices: vi.fn(), fetchTargetDevice: vi.fn(), fetchEditorDrafts: vi.fn(),
  fetchScript: vi.fn(), fetchApplicationDevices: vi.fn(),
}))
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
let route: { path: string; fullPath: string; query: Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => route, useRouter: () => navigation,
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn(),
}))
vi.mock('../src/shared/api/terminals', () => ({
  fetchTargetDevices: api.fetchTargetDevices, fetchTargetDevice: api.fetchTargetDevice,
}))
vi.mock('../src/shared/api/maa', () => ({ fetchScript: api.fetchScript }))
vi.mock('../src/shared/api/maa-applicability', () => ({ fetchApplicationDevices: api.fetchApplicationDevices }))
vi.mock('../src/shared/api/maa-script-editor', () => ({ fetchEditorDrafts: api.fetchEditorDrafts }))
import EditorWorkbenchView from '../src/modules/maa/editor/EditorWorkbenchView.vue'

const phone = (id: string) => ({ device_id: id, display_name: id, mode: 'standalone',
  managing_terminal_id: 'terminal', availability: 'disconnected', availability_reason: 'terminal_offline' })
const resume = { scriptId: 'old-script', deviceId: 'old-phone', step: 3, restoreDraft: true }
const Select = defineComponent({ name: 'ElSelect', props: ['modelValue'], emits: ['update:modelValue'],
  template: '<div><slot /></div>' })
const wrappers: VueWrapper[] = []
function open() {
  const wrapper = mount(EditorWorkbenchView, { global: { stubs: {
    teleport: true, ElButton: true, ElSelect: Select, ElOption: true, ElDrawer: true,
    MaaLibraryPanel: true, ScriptWorkflowPanel: true, EditorVideoPanel: true,
    FloatingPhonePanel: { template: '<section><slot /></section>' },
  } } })
  wrappers.push(wrapper)
  return wrapper
}
function choose(wrapper: VueWrapper, id?: string) {
  wrapper.findAllComponents(Select).find(item => item.attributes('aria-label') === '选择手机')!
    .vm.$emit('update:modelValue', id)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  route = reactive({ path: '/editor', fullPath: '/editor', query: {} })
  api.fetchTargetDevices.mockResolvedValue({ items: [phone('old-phone'), phone('s21')], nextCursor: null })
  api.fetchTargetDevice.mockImplementation(async (id: string) => phone(id))
  api.fetchEditorDrafts.mockResolvedValue([])
  api.fetchScript.mockResolvedValue({ script_id: 'old-script', application_id: 'category', name: '旧脚本' })
  api.fetchApplicationDevices.mockResolvedValue([{ device_id: 'old-phone' }])
  navigation.replace.mockImplementation(async (value: { query: Record<string, string> }) => {
    route.query = value.query
    route.fullPath = `/editor?${new URLSearchParams(value.query)}`
  })
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); sessionStorage.clear() })

it('opens an empty workbench with no history without checking any script', async () => {
  const wrapper = open(); await flushPromises()
  expect(api.fetchScript).not.toHaveBeenCalled()
  expect(api.fetchApplicationDevices).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('未打开脚本')
})

it('keeps a phone-only workspace empty without attempting script authorization', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ deviceId: 's21', step: 1 }))
  const wrapper = open(); await flushPromises()
  expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBe('s21')
  expect(wrapper.findComponent({ name: 'ScriptWorkflowPanel' }).exists()).toBe(false)
  expect(api.fetchScript).not.toHaveBeenCalled()
  expect(api.fetchApplicationDevices).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('未打开脚本')
})

it('skips an inapplicable automatic resume before mounting the script editor', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  api.fetchApplicationDevices.mockResolvedValueOnce([{ device_id: 's21' }])
  const wrapper = open(); await flushPromises()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(wrapper.findComponent({ name: 'ScriptWorkflowPanel' }).exists()).toBe(false)
  expect(wrapper.text()).toContain('未恢复上次脚本')
  expect(wrapper.text()).not.toContain('当前手机未获此脚本分类授权')
  expect(JSON.parse(sessionStorage.getItem('al1s.editor.resume')!)).toEqual(resume)
})

it('restores an applicable script even when its phone is offline', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  const wrapper = open(); await flushPromises()
  expect(api.fetchApplicationDevices).toHaveBeenCalledExactlyOnceWith('category')
  expect(route.query).toMatchObject({ script_id: 'old-script', step: '3' })
  expect(wrapper.getComponent({ name: 'ScriptWorkflowPanel' }).props('device').device_id).toBe('old-phone')
})

it('closes the old script before switching phones and remembers only the new phone', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  const wrapper = open(); await flushPromises()
  choose(wrapper, 's21'); await flushPromises()
  expect(route.query.script_id).toBeUndefined()
  expect(wrapper.findComponent({ name: 'ScriptWorkflowPanel' }).exists()).toBe(false)
  expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBe('s21')
  expect(JSON.parse(sessionStorage.getItem('al1s.editor.resume')!)).toEqual({ deviceId: 's21', step: 1 })
})

it('keeps the original phone and script if navigation protection rejects the switch', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  const wrapper = open(); await flushPromises()
  navigation.replace.mockResolvedValueOnce({ type: 4 })
  choose(wrapper, 's21'); await flushPromises()
  expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBe('old-phone')
  expect(wrapper.getComponent({ name: 'ScriptWorkflowPanel' }).props('device').device_id).toBe('old-phone')
  expect(JSON.parse(sessionStorage.getItem('al1s.editor.resume')!).deviceId).toBe('old-phone')
})

it('ignores a late automatic resume after the user selects another phone', async () => {
  const pending = deferred<Array<{ device_id: string }>>()
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  api.fetchApplicationDevices.mockReturnValueOnce(pending.promise)
  const wrapper = open(); await flushPromises()
  choose(wrapper, 's21'); await flushPromises()
  pending.resolve([{ device_id: 'old-phone' }]); await flushPromises()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBe('s21')
  expect(route.query.script_id).toBeUndefined()
})

it('does not replace a script explicitly opened while automatic recovery is pending', async () => {
  const pending = deferred<Array<{ device_id: string }>>()
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  api.fetchApplicationDevices.mockReturnValueOnce(pending.promise)
  open(); await flushPromises()
  route.query = { script_id: 'explicit-script' }; route.fullPath = '/editor?script_id=explicit-script'
  pending.resolve([{ device_id: 'old-phone' }]); await flushPromises()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(route.query.script_id).toBe('explicit-script')
})

it('does not navigate after leaving the workbench during recovery', async () => {
  const pending = deferred<Array<{ device_id: string }>>()
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  api.fetchApplicationDevices.mockReturnValueOnce(pending.promise)
  const wrapper = open(); await flushPromises(); wrapper.unmount()
  pending.resolve([{ device_id: 'old-phone' }]); await flushPromises()
  expect(navigation.replace).not.toHaveBeenCalled()
})

it('keeps the phone and original recovery record when automatic authorization lookup fails', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  api.fetchApplicationDevices.mockRejectedValueOnce(new Error('network unavailable'))
  const wrapper = open(); await flushPromises()
  expect(route.query.script_id).toBeUndefined()
  expect(wrapper.text()).toContain('未恢复上次脚本')
  expect(JSON.parse(sessionStorage.getItem('al1s.editor.resume')!)).toEqual(resume)
})

it('clears the phone and script together without preserving a mixed recovery pair', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify(resume))
  const wrapper = open(); await flushPromises()
  choose(wrapper, ''); await flushPromises()
  expect(route.query.script_id).toBeUndefined()
  expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBeUndefined()
  expect(sessionStorage.getItem('al1s.editor.resume')).toBeNull()
})

it('does not turn a missing remembered phone into an authorization failure', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ ...resume, deviceId: 'removed' }))
  api.fetchTargetDevice.mockRejectedValueOnce(new Error('not found'))
  const wrapper = open(); await flushPromises()
  expect(api.fetchScript).not.toHaveBeenCalled()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('未恢复上次手机')
})

it('keeps explicit script links under the normal editor authorization check', async () => {
  route.query = { script_id: 'explicit-script' }; route.fullPath = '/editor?script_id=explicit-script'
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ deviceId: 's21', step: 1 }))
  const wrapper = open(); await flushPromises()
  expect(api.fetchScript).not.toHaveBeenCalled()
  expect(wrapper.getComponent({ name: 'ScriptWorkflowPanel' }).props()).toMatchObject({
    scriptId: 'explicit-script', device: { device_id: 's21' },
  })
})

it('keeps an explicitly requested script when selecting its first phone', async () => {
  route.query = { script_id: 'explicit-script' }; route.fullPath = '/editor?script_id=explicit-script'
  const wrapper = open(); await flushPromises()
  choose(wrapper, 's21'); await flushPromises()
  expect(route.query.script_id).toBe('explicit-script')
  expect(wrapper.getComponent({ name: 'ScriptWorkflowPanel' }).props('device').device_id).toBe('s21')
})

it('keeps the selected phone name separate from its readable availability guidance', async () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ deviceId: 's21', step: 1 }))
  const wrapper = open(); await flushPromises()
  const option = wrapper.findAll('el-option-stub').find(item => item.attributes('value') === 's21')!
  expect(option.attributes('label')).toBe('s21')
  expect(wrapper.get('.phone-availability').text()).toBe('终端离线')
  expect(wrapper.get('.phone-guidance').text()).toContain('APK')
  expect(wrapper.get('.phone-edit-hint').text()).toBe('脚本仍可编辑')
})
