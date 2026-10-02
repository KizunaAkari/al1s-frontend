import { flushPromises, mount } from '@vue/test-utils'
import { ElButton } from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import { apiClient } from '../src/shared/api/client'
import * as testing from '../src/shared/api/maa-quick-test'
import ScriptQuickTest from '../src/modules/maa/editor/ScriptQuickTest.vue'

const script = { script_id: 's', current_version_id: 'v' } as never
const device = { device_id: 'd', managing_terminal_id: 't', mode: 'mounted' } as never
const result: testing.QuickTestDetail = {
  session_id: 'session', candidate_version_id: 'v', status: 'claimed',
  expires_at: '2099-01-01T00:00:00Z', qualification_status: null, error_code: null, step_number: null, failed_step_number: null,
}
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
beforeEach(() => {
  vi.spyOn(testing, 'fetchQuickTestEvents').mockResolvedValue({ items: [], next_after: null })
})
function editor(disabled = false, stepNumber?: number, compact = false) {
  return mount(ScriptQuickTest, { props: { script, device, disabled, stepNumber, compact } })
}

it('shows an accepted recognition failure as skipped with the real step number', async () => {
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, status: 'completed', qualification_status: 'passed' })
  vi.mocked(testing.fetchQuickTestEvents).mockResolvedValue({ items: [
    { sequence: 1, kind: 'step_failed', step_number: 4, code: null, created_at: '2026-10-01T00:00:00Z' },
    { sequence: 2, kind: 'log', step_number: null, code: 'maa_failure_skipped:recognition:step_timeout:4', created_at: '2026-10-01T00:00:01Z' },
  ], next_after: null })
  sessionStorage.setItem('al1s.quick-test.s', JSON.stringify({
    command: { scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'key' }, sessionId: 'session',
  }))
  const wrapper = editor(false, undefined, true)
  try {
    await flushPromises()
    const log = wrapper.get('[aria-label="调试步骤日志"]')
    expect(log.text()).toContain('步骤失败')
    expect(log.text()).toContain('识别失败已跳过（步骤超时）')
    expect(log.text()).toContain('第 4 步')
    expect(log.text()).not.toContain('步骤完成')
    expect(log.text()).not.toContain('00 · 全局规则')
  } finally { wrapper.unmount() }
})

it('keeps compact debug empty until a session and removes repeated heading/sections', () => {
  const events = vi.mocked(testing.fetchQuickTestEvents)
  sessionStorage.setItem('al1s.quick-test.s', JSON.stringify({
    command: { scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'key' },
  }))
  const wrapper = editor(false, 3, true)
  try {
    expect(wrapper.text()).not.toContain('临时测试')
    expect(wrapper.text()).toContain('核对原测试请求')
    expect(wrapper.find('[aria-label="调试步骤日志"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="调试截图"]').exists()).toBe(false)
    expect(events).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('keeps compact pending controls and readable rule failure content while collapsing technical details', async () => {
  vi.spyOn(testing, 'readQuickTest')
    .mockResolvedValueOnce({ ...result, status: 'claimed', started_at: '2026-09-25T00:00:00Z' })
    .mockResolvedValueOnce({ ...result, status: 'completed', qualification_status: 'failed',
      error_code: 'maa_step_execution_stalled', failed_step_number: 4, started_at: '2026-09-25T00:00:00Z',
      failure_detail: { step_number: 4, script_name: '开始脚本', rule_name: '通知', stage: 'click_target',
        algorithm: 'TemplateMatch', best_score: 0.84406, threshold: 0.85, consecutive_misses: 9,
        timeout_seconds: 30, elapsed_seconds: 32 } })
  vi.mocked(testing.fetchQuickTestEvents).mockResolvedValue({
    items: [{ sequence: 1, kind: 'log', step_number: null, code: 'maa_rule_failed:recovery:abc:0',
      rule_name: '通知', created_at: '2026-09-25T00:00:01Z' }], next_after: null,
  })
  const screenshots = vi.spyOn(testing, 'fetchQuickTestScreenshots').mockResolvedValue({ items: [], next_cursor: null })
  sessionStorage.setItem('al1s.quick-test.s', JSON.stringify({
    command: { scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'key' }, sessionId: 'session',
  }))
  const wrapper = editor(false, 3, true)
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('刷新测试结果')
    expect(wrapper.text()).toContain('停止测试')
    expect(wrapper.find('[aria-label="调试步骤日志"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="调试截图"]').exists()).toBe(true)
    expect(screenshots).not.toHaveBeenCalled()
    const stop = vi.spyOn(testing, 'stopQuickTest').mockResolvedValue({
      ...result, started_at: '2026-09-25T00:00:00Z', cancel_requested_at: '2026-09-25T00:00:02Z',
    })
    await click(wrapper, '停止测试')
    expect(stop).toHaveBeenCalledWith('s', 'session')
    expect(wrapper.text()).toContain('停止请求已发送，等待终端确认')
    expect(wrapper.text()).not.toContain('停止测试')
    await click(wrapper, '刷新测试结果')
    const log = wrapper.get('[aria-label="调试步骤日志"]')
    expect(log.text()).toContain('00 · 全局规则 · 通知')
    expect(log.text()).toContain('点击目标识别')
    expect(log.text()).toContain('连续 9 次未命中')
    expect(log.text()).toContain('最高匹配分数 0.84406 · 阈值 0.85')
    expect(wrapper.text()).toContain('步骤执行超过时间预算')
    expect(wrapper.text()).toContain('查看关联主步骤 4')
    expect(wrapper.find('.test-status').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('结果：失败')
    await wrapper.setProps({ script: { script_id: 's', current_version_id: 'old' } as never })
    expect(wrapper.text()).toContain('这是旧保存版本的测试')
    const technical = wrapper.get('[aria-label="技术详情"]')
    expect(technical.attributes('open')).toBeUndefined()
    expect(technical.text()).toContain('session')
    expect(technical.text()).toContain('v')
    expect(technical.text()).toContain('2026-09-25T00:00:00Z')
    expect(technical.text()).toContain('maa_step_execution_stalled')
    expect(wrapper.find('.test-cause').text()).not.toContain('maa_step_execution_stalled')
  } finally { wrapper.unmount() }
})
it('shows matching facts once in debug logs and safely renders immutable rule names', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, status: 'completed',
    qualification_status: 'failed', error_code: 'maa_step_execution_stalled', failed_step_number: 4,
    failure_detail: { step_number: 4, script_name: '开始脚本', rule_name: '<img src=x onerror=alert(1)>',
      stage: 'click_target', algorithm: 'TemplateMatch', best_score: 0.84406, threshold: 0.85,
      consecutive_misses: 9, timeout_seconds: 30, elapsed_seconds: 32 } })
  const wrapper = editor()
  try {
    await click(wrapper, '运行临时测试')
    const log = wrapper.find('[aria-label="调试步骤日志"]')
    expect(log.text()).toContain('00 · 全局规则')
    expect(log.text()).toContain('关联主步骤 04')
    expect(log.text()).toContain('点击目标识别')
    expect(log.text()).toContain('连续 9 次未命中')
    expect(log.text()).toContain('最高匹配分数 0.84406 · 阈值 0.85')
    expect(log.text()).toContain('时间预算 30 秒')
    expect(log.find('img').exists()).toBe(false)
    await click(wrapper, '刷新测试结果')
    expect(log.findAll('.failure-summary')).toHaveLength(1)
    await click(wrapper, '查看关联主步骤 4')
    expect(wrapper.emitted('locate')).toEqual([[4]])
  } finally { wrapper.unmount() }
})
it('explains old receipts without inventing matching scores', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, status: 'completed',
    qualification_status: 'failed', error_code: 'maa_step_execution_stalled' })
  const wrapper = editor()
  try {
    await click(wrapper, '运行临时测试')
    expect(wrapper.text()).toContain('本次回执未包含匹配详情')
    expect(wrapper.text()).toContain('步骤执行超过时间预算')
    expect(wrapper.text()).not.toContain('最高匹配分数')
  } finally { wrapper.unmount() }
})
async function click(wrapper: ReturnType<typeof editor>, text: string) {
  await wrapper.findAllComponents(ElButton).find(b => b.text() === text)!.trigger('click')
  await flushPromises()
}
it('shows terminal step events and keeps stop pending until a real result', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, started_at: '2026-09-25T00:00:00Z' })
  vi.mocked(testing.fetchQuickTestEvents).mockResolvedValue({
    items: [
      { sequence: 1, kind: 'started', step_number: null, code: null, created_at: '2026-09-25T00:00:00Z' },
      { sequence: 2, kind: 'step_started', step_number: 3, code: null, created_at: '2026-09-25T00:00:01Z' },
    ], next_after: null,
  })
  const stop = vi.spyOn(testing, 'stopQuickTest').mockResolvedValue({
    ...result, started_at: '2026-09-25T00:00:00Z', cancel_requested_at: '2026-09-25T00:00:02Z',
  })
  const wrapper = editor()
  try {
    await wrapper.findAllComponents(ElButton).find(button => button.text().includes('运行临时测试'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('当前执行步骤：03')
    await wrapper.findAllComponents(ElButton).find(button => button.text() === '停止测试')!.trigger('click')
    await flushPromises()
    expect(stop).toHaveBeenCalledWith('s', 'session')
    expect(wrapper.text()).toContain('等待终端确认')
    expect(wrapper.text()).not.toContain('停止测试')
  } finally { wrapper.unmount() }
})
it('issues the selected saved version/device and does not mistake claimed for running', async () => {
  const issue = vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue(result)
  const wrapper = editor()
  try {
    await click(wrapper, '运行临时测试')
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd' }))
    expect(issue.mock.calls[0]?.[0]).not.toHaveProperty('stepNumber')
    expect(wrapper.text()).toContain('不代表已开始执行')
    expect(wrapper.text()).not.toContain('运行临时测试')
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([true])
  } finally { wrapper.unmount() }
})

it('drains event pages for a completed test and pins its final failure', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id:'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result,status:'completed',qualification_status:'failed',failed_step_number:3 })
  vi.mocked(testing.fetchQuickTestEvents)
    .mockResolvedValueOnce({items:[{sequence:1,kind:'step_started',step_number:3,code:null,created_at:''}],next_after:1})
    .mockResolvedValueOnce({items:[{sequence:2,kind:'step_failed',step_number:3,code:'timeout',created_at:''}],next_after:2})
    .mockResolvedValueOnce({items:[{sequence:3,kind:'step_started',step_number:8,code:null,created_at:''}],next_after:null})
  const wrapper=editor()
  try {
    await click(wrapper,'运行临时测试')
    expect(testing.fetchQuickTestEvents).toHaveBeenCalledTimes(3)
    expect(wrapper.emitted('progress')?.at(-1)?.[0]).toMatchObject({phase:'failed',step:3})
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
    expect(wrapper.text()).toContain('timeout')
  } finally { wrapper.unmount() }
})
it('shows screenshots for a completed full quick test without a step number', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, status: 'completed', step_number: null })
  const wrapper = editor()
  try {
    await click(wrapper, '运行临时测试')
    expect(wrapper.find('[aria-label="调试截图"]').exists()).toBe(true)
  } finally { wrapper.unmount() }
})
it('issues a current-step debug request without a publish gate', async () => {
  const issue = vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, step_number: 3 })
  const wrapper = editor(false, 3)
  try {
    await click(wrapper, '调试当前步骤')
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ stepNumber: 3 }))
    expect(wrapper.text()).toContain('单步调试第 3 步')
    expect(wrapper.text()).toContain('单步调试第 3 步')
  } finally { wrapper.unmount() }
})
it('retains original test identity across remount when delivery result is unknown', async () => {
  const issue = vi.spyOn(testing, 'issueQuickTest').mockRejectedValueOnce(new ApiError('offline', { code: 'network_error' }))
    .mockResolvedValueOnce({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue(result)
  const first = editor()
  await click(first, '运行临时测试'); first.unmount()
  const second = editor()
  try {
    await click(second, '核对原测试请求')
    expect(issue.mock.calls[1]).toEqual(issue.mock.calls[0])
  } finally { second.unmount() }
})
it('replays an unknown single-step request instead of using the new selected step', async () => {
  const command: testing.QuickTestCommand = {
    scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'original-key', stepNumber: 2,
  }
  sessionStorage.setItem('al1s.quick-test.s', JSON.stringify({ command }))
  const issue = vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, step_number: 2 })
  const wrapper = editor(false, 5)
  try {
    await click(wrapper, '核对原测试请求')
    expect(issue).toHaveBeenCalledWith(command)
  } finally { wrapper.unmount() }
})
it('locates failure only for the currently displayed saved version', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, status: 'completed', qualification_status: 'failed', failed_step_number: 2 })
  const wrapper = editor()
  try {
    await click(wrapper, '运行临时测试'); await click(wrapper, '定位第 2 步')
    expect(wrapper.emitted('locate')).toEqual([[2]])
    await wrapper.setProps({ script: { script_id: 's', current_version_id: 'new' } as never })
    expect(wrapper.text()).toContain('这是旧保存版本的测试')
    expect(wrapper.text()).not.toContain('定位第 2 步')
  } finally { wrapper.unmount() }
})
it('never issues unsaved edits or unmounted devices', async () => {
  const issue = vi.spyOn(testing, 'issueQuickTest')
  const wrapper = editor(true)
  try {
    await click(wrapper, '运行临时测试')
    await wrapper.setProps({ disabled: false, device: undefined })
    await click(wrapper, '运行临时测试')
    expect(issue).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})
it('only sends step_number for a single-step quick test', async () => {
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { session_id: 'session' } })
  const base: testing.QuickTestCommand = { scriptId: 's', candidateId: 'v', terminalId: 't', deviceId: 'd', key: 'key' }
  await testing.issueQuickTest({ ...base, stepNumber: 4 })
  await testing.issueQuickTest(base)
  expect(post).toHaveBeenNthCalledWith(1, '/maa/scripts/s/quick-test-definition', {
    candidate_version_id: 'v', terminal_id: 't', target_device_id: 'd', step_number: 4,
  }, { headers: { 'Idempotency-Key': 'key' } })
  expect(post).toHaveBeenNthCalledWith(2, '/maa/scripts/s/quick-test-definition', {
    candidate_version_id: 'v', terminal_id: 't', target_device_id: 'd',
  }, { headers: { 'Idempotency-Key': 'key' } })
})

it('loads single-step screenshots on demand, paginates them, and downloads ready items', async () => {
  vi.spyOn(testing, 'issueQuickTest').mockResolvedValue({ session_id: 'session' })
  vi.spyOn(testing, 'readQuickTest').mockResolvedValue({ ...result, step_number: 3 })
  const list = vi.spyOn(testing, 'fetchQuickTestScreenshots')
    .mockResolvedValueOnce({
      items: [{ artifact_id: 'image-1', attempt_id: 'session', file_name: 'step.png', status: 'ready', downloadable: true }],
      next_cursor: 'next',
    })
    .mockResolvedValueOnce({
      items: [{ artifact_id: 'image-2', attempt_id: 'session', file_name: 'skip.png', status: 'ready', downloadable: false }],
      next_cursor: null,
    })
  const download = vi.spyOn(testing, 'downloadQuickTestScreenshot').mockResolvedValue()
  const wrapper = editor(false, 3)
  try {
    await click(wrapper, '调试当前步骤')
    expect(list).not.toHaveBeenCalled()

    await click(wrapper, '加载调试截图')
    expect(list).toHaveBeenNthCalledWith(1, 's', 'session', null)
    expect(wrapper.text()).toContain('step.png')
    expect(wrapper.text()).toContain('加载更多截图')

    await click(wrapper, '加载更多截图')
    expect(list).toHaveBeenNthCalledWith(2, 's', 'session', 'next')
    expect(wrapper.text()).toContain('skip.png')
    await click(wrapper, '下载原件')
    expect(download).toHaveBeenCalledWith('s', 'session', 'image-1', 'step.png')
  } finally { wrapper.unmount() }
})

it('requests bounded screenshot pages and verifies the download response path', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [], next_cursor: null } })
  await testing.fetchQuickTestScreenshots('script/1', 'session/1', 'cursor')
  expect(get).toHaveBeenCalledWith('/maa/scripts/script%2F1/quick-tests/session%2F1/screenshots', {
    params: { cursor: 'cursor', limit: 20 },
  })

  const digest = vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1, 2]).buffer)
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:quick-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  get.mockResolvedValueOnce({ data: new Blob(['image']), headers: { 'x-content-sha256': '0102' } })
  await testing.downloadQuickTestScreenshot('script', 'session', 'artifact', 'shot.png')
  expect(get).toHaveBeenLastCalledWith('/maa/scripts/script/quick-tests/session/screenshots/artifact/download', { responseType: 'blob' })
  expect(digest).toHaveBeenCalled()
  expect(create).toHaveBeenCalled()
})
