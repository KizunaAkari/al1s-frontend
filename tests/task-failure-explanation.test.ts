import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import TaskFailureExplanation from '../src/modules/tasks/TaskFailureExplanation.vue'
import type { AttemptDetail } from '../src/shared/api/task-details'

it('shows a guard failure location even without recognition scores', () => {
  const value = { ...attempt, recognition_failures: [], failure_contexts: [{
    module_number: 2, script_name: '探险', step_number: 14, rule_name: null,
    timeout_seconds: 20, elapsed_seconds: 23.892,
  }] }
  const wrapper = mount(TaskFailureExplanation, { props: { attempt: value } })
  for (const text of ['组合第 2 步', '探险', '第 14 步', '时间预算 20 秒', '已用 23.892 秒']) expect(wrapper.text()).toContain(text)
  expect(wrapper.text()).not.toContain('未收到可用的详细诊断')
})

it('keeps the known script but explicitly marks an old missing step', () => {
  const value = { ...attempt, recognition_failures: [], failure_contexts: [{
    module_number: 2, script_name: '探险', step_number: null, rule_name: null,
    timeout_seconds: null, elapsed_seconds: null,
  }] }
  const wrapper = mount(TaskFailureExplanation, { props: { attempt: value } })
  expect(wrapper.text()).toContain('探险')
  expect(wrapper.text()).toContain('终端未上报步骤号')
  expect(wrapper.text()).not.toContain('第 14 步')
})

const attempt = { attempt_id: 'a', execution_id: 'e', attempt_no: 1, status: 'ended', no_screenshot: true, result: 'failure', error_code: 'maa_pipeline_failed', failure_phase: 'runtime', confirmed: false, expired: false, details: [], recognition_failures: [{
  module_number: 3, step_number: 4, script_name: '开始脚本', rule_name: null,
  stage: 'recognition', algorithm: 'TemplateMatch', best_score: .3, threshold: .85,
  consecutive_misses: 7, timeout_seconds: 20, elapsed_seconds: 23.892,
}] } as AttemptDetail
it('shows the concrete step, matching evidence and timing with raw codes collapsed', () => {
  const wrapper = mount(TaskFailureExplanation, { props: { attempt } })
  for (const text of ['组合第 3 步', '开始脚本', '第 4 步', '连续 7 次未命中', '最高匹配分数 0.3', '阈值 0.85', '已用 23.892 秒']) expect(wrapper.text()).toContain(text)
  expect(wrapper.find('details').attributes('open')).toBeUndefined()
})
it('distinguishes a global rule from the related main step', () => {
  const wrapper = mount(TaskFailureExplanation, { props: { attempt: { ...attempt, recognition_failures: [{ ...attempt.recognition_failures![0]!, rule_name: '通知', stage: 'click_target' }] } } })
  for (const text of ['00 · 全局规则', '关联主步骤 04', '点击目标识别']) expect(wrapper.text()).toContain(text)
})
it('explains missing evidence instead of inventing a matching failure', () => {
  const wrapper = mount(TaskFailureExplanation, { props: { attempt: { ...attempt, recognition_failures: [] } } })
  expect(wrapper.text()).toContain('未收到可用的详细诊断')
  expect(wrapper.text()).not.toContain('最高匹配分数')
})
it.each(['confirmed', 'expired'])('hides diagnostics after %s', field => {
  const wrapper = mount(TaskFailureExplanation, { props: { attempt: { ...attempt, [field]: true } } })
  expect(wrapper.text()).not.toContain('开始脚本')
})
