import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { apiClient } from '../src/shared/api/client'
import TaskDetailsDrawer from '../src/modules/tasks/TaskDetailsDrawer.vue'

afterEach(() => vi.restoreAllMocks())
const attempt = { attempt_id: 'a', attempt_no: 1, status: 'ended', result: 'failure',
  confirmed: false, expired: false, no_screenshot: true, details: [{ module_number: 3,
    script_name: '测试脚本', step_number: 2, title: '截图失败', message: '断开连接',
    screenshot_id: null, screenshot_error: '设备断开' }] }
function drawer(task: { task_id: string; name?: string } = { task_id: 'task' }) {
  return mount(TaskDetailsDrawer, { props: { modelValue: true, task },
    global: { stubs: { ElDrawer: { props: ['beforeClose'], emits: ['update:modelValue'], template: '<div><header data-testid="drawer-header"><slot name="header" /></header><button data-close @click="beforeClose(() => $emit(\'update:modelValue\', false))">关闭</button><slot /></div>' },
      ElButton: { template: '<button><slot /></button>' }, RouterLink: { template: '<a><slot /></a>' }, FailureImage: true } } })
}
it('loads on opening and shows exact module and local step', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [attempt], next_cursor: null } })
  const wrapper = drawer(); await flushPromises()
  expect(get).toHaveBeenCalledWith('/tasks/task/details', { params: { cursor: undefined } })
  expect(wrapper.text()).toContain('组合第 3 步')
  expect(wrapper.text()).toContain('脚本第 2 步')
  expect(wrapper.text()).toContain('确认并关闭')
  wrapper.unmount()
})

it('opens the lineup workspace for legacy single tasks without generic empty diagnostics', async () => {
  const ids=[10001,10002,10003,10004,20001,20002,10005,10006,10007,10008,20003,20004]
  const record={id:'record-1',name:'battle.png',task_id:'task',state:'success',review:null,annotation:null,needs_attention:false,
    result:{model_version:'lineup-v3',layout_valid:true,teams:['attack','defense'],slots:ids.map((selected_id,index)=>({side:index<6?'attack':'defense',index:index%6,present:true,accepted:true,selected_id,agreed:true}))}}
  vi.spyOn(apiClient,'get').mockImplementation(async path => {
    if (String(path).endsWith('/details')) return {data:{items:[{...attempt,result:'success',details:[]}],next_cursor:null,lineup_record_id:'record-1',source_module:'lineup'}} as never
    if (String(path).endsWith('/catalog')) return {data:{version:'v1',students:[]}} as never
    return {data:{task_id:'task',name:'legacy lineup',lifecycle_status:'completed',summary:{total:1,finished:1,usable:1,needs_attention:0,failure:0,running:0},items:[record],next_cursor:null}} as never
  })
  const wrapper=drawer();await flushPromises()
  expect(wrapper.text()).toContain('battle.png')
  expect(wrapper.text()).not.toContain('组合第 未知')
  expect(wrapper.text()).toContain('纠错与标注')
  expect(wrapper.text()).not.toContain('暂无执行尝试')
  wrapper.unmount()
})
it('renders a compact named header, a loaded count, and a Chinese status badge', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [{ ...attempt, result: null, details: [] }], next_cursor: 'next' } })
  const wrapper = drawer({ task_id: 'task', name: '夜间巡检任务' }); await flushPromises()
  expect(wrapper.find('[data-testid="drawer-header"]').text()).toContain('任务执行详情')
  expect(wrapper.find('[data-task-name]').text()).toBe('夜间巡检任务')
  expect(wrapper.text()).toContain('已加载 1 次尝试')
  expect(wrapper.text()).toContain('已结束')
  expect(wrapper.text()).not.toContain('ended')
  wrapper.unmount()
})
it('confirms then closes without a second prompt or deleting the task', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { items: [attempt], next_cursor: null } })
    .mockResolvedValue({ data: { items: [{ ...attempt, confirmed: true, details: [] }], next_cursor: null } })
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: null })
  const remove = vi.spyOn(apiClient, 'delete')
  const wrapper = drawer(); await flushPromises()
  await wrapper.findAll('button').find((button) => button.text().includes('确认'))!.trigger('click')
  await flushPromises()
  expect(post).toHaveBeenCalledWith('/tasks/task/attempts/a/confirm-failure')
  expect(remove).not.toHaveBeenCalled()
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('lists execution screenshots without repeating failure screenshots or showing success confirmation', async () => {
  const successAttempt = {
    ...attempt,
    result: 'success',
    details: [{ ...attempt.details[0], screenshot_id: 'failure-image', screenshot_error: null }],
    screenshots: [
      { artifact_id: 'failure-image', file_name: 'failure.png' },
      { artifact_id: 'normal-image', file_name: 'step-01.png' },
      { artifact_id: 'conditional-image', file_name: 'skip-condition-with-a-very-long-original-name.png' },
    ],
  }
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: { items: [successAttempt], next_cursor: null },
  })
  const wrapper = drawer(); await flushPromises()
  expect(wrapper.find('[aria-label="执行截图"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('step-01.png')
  expect(wrapper.text()).toContain('skip-condition-with-a-very-long-original-name.png')
  expect(wrapper.text()).not.toContain('failure.png')
  expect(wrapper.find('ul').exists()).toBe(false)
  expect(wrapper.find('[data-screenshot-count]').text()).toBe('2 张')
  expect(wrapper.findAll('[data-screenshot-row]')).toHaveLength(2)
  expect(wrapper.find('[data-screenshot-row] .execution-screenshot-name')!.attributes('title')).toBe('step-01.png')
  expect(wrapper.findAll('[data-screenshot-row] .execution-screenshot-name')[1].attributes('title'))
    .toBe('skip-condition-with-a-very-long-original-name.png')
  expect(wrapper.findAll('button').some(button => button.attributes('aria-label') === '下载执行截图：step-01.png')).toBe(true)
  expect(wrapper.findAll('button').some(button => button.attributes('aria-label') === '下载执行截图：skip-condition-with-a-very-long-original-name.png')).toBe(true)
  expect(wrapper.findAll('button').some(button => button.text().includes('确认'))).toBe(false)
  wrapper.unmount()
})
it('reuses the verified screenshot download path for execution screenshots', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1]).buffer)
  const get = vi.spyOn(apiClient, 'get')
    .mockResolvedValueOnce({
      data: {
        items: [{
          ...attempt,
          result: 'success',
          details: [],
          screenshots: [{ artifact_id: 'normal-image', file_name: 'step-01.png' }],
        }],
        next_cursor: null,
      },
    })
    .mockResolvedValueOnce({
      data: new Blob(['not-a-valid-hash-match'], { type: 'image/png' }),
      headers: { 'x-content-sha256': '0'.repeat(64) },
    })
  const wrapper = drawer(); await flushPromises()
  await wrapper.findAll('button').find(button => button.attributes('aria-label')?.startsWith('下载执行截图'))!.trigger('click')
  await flushPromises()
  expect(get).toHaveBeenNthCalledWith(
    2,
    '/tasks/task/attempts/a/screenshots/normal-image',
    { responseType: 'blob' },
  )
  expect(wrapper.text()).toContain('截图校验失败')
  wrapper.unmount()
})
it('ignores a late download failure after switching tasks', async () => {
  let rejectDownload!: (error: Error) => void
  const delayedDownload = new Promise<never>((_, reject) => { rejectDownload = reject })
  const firstAttempt = { ...attempt, result: 'success', details: [], screenshots: [{ artifact_id: 'normal-image', file_name: 'step-01.png' }] }
  const secondAttempt = { ...attempt, result: 'success', details: [], screenshots: [] }
  const get = vi.spyOn(apiClient, 'get')
    .mockResolvedValueOnce({ data: { items: [firstAttempt], next_cursor: null } })
    .mockImplementationOnce(() => delayedDownload as never)
    .mockResolvedValueOnce({ data: { items: [secondAttempt], next_cursor: null } })
  const wrapper = drawer(); await flushPromises()
  await wrapper.findAll('button').find(button => button.attributes('aria-label')?.startsWith('下载执行截图'))!.trigger('click')
  await wrapper.setProps({ task: { task_id: 'other-task' } })
  await flushPromises()
  rejectDownload(new Error('旧任务下载失败'))
  await flushPromises()
  expect(get).toHaveBeenCalledWith('/tasks/other-task/details', { params: { cursor: undefined } })
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})
it('does not let a late confirmation response update the new task', async () => {
  let resolvePost!: (value: unknown) => void
  const delayedPost = new Promise<unknown>(resolve => { resolvePost = resolve })
  const firstAttempt = { ...attempt }
  const secondAttempt = { ...attempt, result: 'success', details: [] }
  const get = vi.spyOn(apiClient, 'get')
    .mockResolvedValueOnce({ data: { items: [firstAttempt], next_cursor: null } })
    .mockResolvedValueOnce({ data: { items: [secondAttempt], next_cursor: null } })
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const post = vi.spyOn(apiClient, 'post').mockImplementationOnce(() => delayedPost as never)
  const wrapper = drawer(); await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '确认并关闭')!.trigger('click')
  await flushPromises()
  expect(post).toHaveBeenCalledWith('/tasks/task/attempts/a/confirm-failure')
  await wrapper.setProps({ task: { task_id: 'other-task' } })
  await flushPromises()
  resolvePost(null)
  await flushPromises()
  expect(get).toHaveBeenCalledTimes(2)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  wrapper.unmount()
})

it('blocks duplicate confirmation while the first request is pending', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [attempt], next_cursor: null } })
  let finish!: () => void
  const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ data: null })
  }))
  const wrapper = drawer(); await flushPromises()
  const button = wrapper.findAll('button').find(button => button.text() === '确认并关闭')!
  await button.trigger('click'); await button.trigger('click')
  expect(post).toHaveBeenCalledTimes(1)
  finish(); await flushPromises()
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})

it('closing only dismisses without other pages, downloads or confirmation', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { items: [attempt], next_cursor: 'page2' } })
    .mockResolvedValue({ data: { items: [], next_cursor: null } })
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: null })
  const remove = vi.spyOn(apiClient, 'delete')
  const wrapper = drawer(); await flushPromises()
  await wrapper.find('[data-close]').trigger('click'); await flushPromises()
  expect(get).toHaveBeenCalledOnce()
  expect(post).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})
it('closing still dismisses when confirmation would fail', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [attempt], next_cursor: null } })
  const post = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('网络中断'))
  const wrapper = drawer(); await flushPromises()
  await wrapper.find('[data-close]').trigger('click'); await flushPromises()
  expect(post).not.toHaveBeenCalled()
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})
