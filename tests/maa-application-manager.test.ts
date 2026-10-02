import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ApplicationManager from '../src/modules/maa/ApplicationManager.vue'
import { apiClient } from '../src/shared/api/client'

afterEach(() => vi.restoreAllMocks())
const application = { application_id: 'a', display_name: '应用', package_name: 'org.example',
  row_version: 1, created_at: '', updated_at: '', icon_data_url: null }
function manager() {
  return mount(ApplicationManager, { props: { application }, global: { stubs: {
    ElDropdown: { emits: ['command'],
      provide() { return { testDropdownCommand: (command: string) => this.$emit('command', command) } },
      template: '<div><slot/><slot name="dropdown"/></div>' },
    ElDropdownMenu: { template: '<div><slot/></div>' },
    ElDropdownItem: { props: ['command', 'disabled'], inject: ['testDropdownCommand'],
      template: '<button :disabled="disabled" @click="testDropdownCommand(command)"><slot/></button>' },
    ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>' },
    ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot/></button>' },
    ElInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
      template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  } } })
}
function button(wrapper: ReturnType<typeof manager>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)!
}

it('shows category cascade preview but blocks deletion while an active task refers to it', async () => {
  vi.spyOn(apiClient, 'get').mockImplementation(async url => ({ data: url.endsWith('/actions')
    ? { rename: null, delete: null }
    : { script_count: 3, strategy_count: 1, device_count: 2,
      blocking_task_ids: ['task-1'], has_more_blockers: false } }) as never)
  const wrapper = manager()
  try {
    await flushPromises()
    await button(wrapper, '删除分类').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('3 个脚本')
    expect(wrapper.text()).toContain('task-1')
    expect(button(wrapper, '确认').attributes('disabled')).toBeDefined()
  } finally { wrapper.unmount() }
})

it('deletes a nonempty category once after preview and emits refresh', async () => {
  vi.spyOn(apiClient, 'get').mockImplementation(async url => ({ data: url.endsWith('/actions')
    ? { rename: null, delete: null }
    : { script_count: 3, strategy_count: 1, device_count: 2,
      blocking_task_ids: [], has_more_blockers: false } }) as never)
  const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: null } as never)
  const wrapper = manager()
  try {
    await flushPromises()
    await button(wrapper, '删除分类').trigger('click')
    await flushPromises()
    await button(wrapper, '确认').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledOnce()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  } finally { wrapper.unmount() }
})

it('keeps actions disabled when projection fails', async () => {
  vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'))
  const wrapper = manager()
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('操作权限加载失败')
    expect(button(wrapper, '重命名分类').attributes('disabled')).toBeDefined()
  } finally { wrapper.unmount() }
})

it('uploads a missing icon and lets an administrator delete it', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { rename: null, delete: null } } as never)
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: application } as never)
  const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: application } as never)
  const wrapper = manager()
  try {
    await flushPromises()
    const input = wrapper.find('input[type="file"]')
    const file = new File(['png'], 'icon.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(put).toHaveBeenCalledOnce()
    expect(wrapper.emitted('changed')).toHaveLength(1)

    await wrapper.setProps({ application: { ...application, row_version: 2,
      icon_data_url: 'data:image/png;base64,cG5n' } })
    await flushPromises()
    await button(wrapper, '删除图标').trigger('click')
    await flushPromises()
    await button(wrapper, '确认').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledOnce()
    expect(wrapper.emitted('changed')).toHaveLength(2)
  } finally { wrapper.unmount() }
})
