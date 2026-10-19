import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElFormItem, ElInput, ElOption, ElSelect } from 'element-plus'
import TaskSubmissionDialog from '../src/modules/tasks/TaskSubmissionDialog.vue'

const api = vi.hoisted(() => ({ scripts: vi.fn(), strategies: vi.fn(), submit: vi.fn() }))
vi.mock('../src/shared/api/maa', () => ({ fetchScripts: api.scripts, fetchStrategies: api.strategies }))
vi.mock('../src/shared/api/maa-applicability', () => ({ fetchApplicableApplications: async () => [{ application_id: 'app', display_name: '应用' }] }))
vi.mock('../src/shared/api/terminals', () => ({
  fetchTerminals: async () => ({ items: [{ terminal_id: 'linux', terminal_type: 'linux', display_name: '终端', service_status: 'online' }], nextCursor: null }),
  fetchTargetDevices: async () => ({ items: [{ device_id: 'phone', managing_terminal_id: 'linux', mode: 'mounted', display_name: '手机', availability: 'connected' }], nextCursor: null }),
  fetchTargetDevice: async () => ({ device_id: 'phone', managing_terminal_id: 'linux', mode: 'mounted', display_name: '手机', availability: 'connected' }),
}))
vi.mock('../src/shared/api/task-submission', () => ({ submitTask: api.submit, restorePendingTask: () => null, preservePendingTask: vi.fn() }))

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.scripts.mockResolvedValueOnce({ items: [
    { script_id: 's1', name: '脚本一', current_version_id: 'v1', script_type: 'process' },
    { script_id: 'draft', name: '未保存', current_version_id: null, script_type: 'process' },
    { script_id: 'standard', name: '标准', current_version_id: 'v1', script_type: 'standard' },
  ], nextCursor: 's-next' }).mockResolvedValue({ items: [
    { script_id: 's1', name: '脚本一', current_version_id: 'v1', script_type: 'process' },
    { script_id: 's2', name: '脚本二', current_version_id: 'v2', script_type: 'process' },
  ], nextCursor: null })
  api.strategies.mockResolvedValueOnce({ items: [
    { strategy_id: 'p1', name: '策略一', current_version_id: 'v1' },
    { strategy_id: 'draft', name: '未保存策略', current_version_id: null },
  ], nextCursor: 'p-next' }).mockResolvedValue({ items: [
    { strategy_id: 'p2', name: '策略二', current_version_id: 'v2' },
  ], nextCursor: null })
  api.submit.mockResolvedValue({ task_id: 'created' })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

async function page() {
  wrapper = mount(TaskSubmissionDialog, { props: { modelValue: false },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } } })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  for (const [label, value] of [['Linux终端', 'linux'], ['挂载手机', 'phone'], ['适用应用分类', 'app']]) {
    field(label!).findComponent(ElSelect).vm.$emit('update:modelValue', value)
    await flushPromises()
  }
  return wrapper
}
function field(label: string) { return wrapper!.findAllComponents(ElFormItem).find(item => String(item.props('label')).includes(label))! }
function contentField() { return wrapper!.findAllComponents(ElFormItem).find(item => String(item.props('label')).includes('已保存'))! }
function options() { return contentField().findAllComponents(ElOption).map(item => item.props('value')) }

it('places every strategy before scripts on initial load and after loading more without changing selection', async () => {
  await page()
  expect(options()).toEqual(['strategy:p1', 'script:s1'])
  contentField().findComponent(ElSelect).vm.$emit('update:modelValue', 'script:s1')
  await flushPromises()
  await contentField().findAllComponents(ElButton).find(item => item.text() === '更多内容')!.trigger('click')
  await flushPromises()
  expect(options()).toEqual(['strategy:p1', 'strategy:p2', 'script:s1', 'script:s2'])
  expect(contentField().findComponent(ElSelect).props('modelValue')).toBe('script:s1')
  expect(api.scripts).toHaveBeenLastCalledWith('app', 's-next')
  expect(api.strategies).toHaveBeenLastCalledWith('app', 'p-next')
})

it.each(['strategy:p1', 'script:s1'])('submits the unchanged logical target %s', async target => {
  const view = await page()
  field('任务名称').findComponent(ElInput).vm.$emit('update:modelValue', '任务')
  contentField().findComponent(ElSelect).vm.$emit('update:modelValue', target)
  await flushPromises()
  await view.findAllComponents(ElButton).find(item => item.text() === '下发任务')!.trigger('click')
  await flushPromises()
  expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ logical_content_id: target,
    requested_terminal_id: 'linux', requested_target_device_id: 'phone' }))
})
