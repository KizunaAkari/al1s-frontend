import type { ScriptDocument, WorkflowStep } from '../../../shared/api/maa-script-editor'
import { sameDocument } from './document-equality'

const actions: Record<string, string> = { back: '返回', home: '主页', task_view: '任务视图', wait: '等待',
  wait_image: '等待图片', wait_text: '等待文字', recognize_execute: '识别图形并执行', wait_click: '识别并点击',
  click_text: '识别文字并点击', wait_random: '随机等待', launch_app: '启动应用', stop_app: '关闭应用',
  tap: '点击', swipe: '滑动', smart_swipe: '智能滑动', start: '开始', screenshot: '截图', cleanup: '结束应用并清理' }
const fields: Record<string, string> = { threshold: '匹配阈值', poll_interval_seconds: '识别间隔',
  timeout_seconds: '步骤超时', seconds: '等待秒数', execution_mode: '执行方式', execution_count: '执行次数',
  recognition_mode: '识别方式',
  execution_interval_ms: '执行间隔', wait_before_execution_seconds: '执行前等待',
  wait_after_execution_seconds: '执行后等待', template_base64: '识别图片', click_template_base64: '点击图片',
  text: '识别文字', click: '点击坐标', swipe: '滑动坐标', skip_condition: '条件跳过',
  post_assertion: '执行后断言', failure_retry: '失败重试', name: '名称', title: '标题' }
export function historyStepTitle(step: WorkflowStep) {
  return String(step.name || step.title || actions[step.action] || '其他动作')
}
export function historyExecutionMode(value: unknown): string {
  return ({ fixed_tap: '固定坐标点击', fixed_swipe: '固定坐标滑动', match_center: '点击识别图片中心',
    image_center: '点击目标图片中心' } as Record<string, string>)[String(value)] ?? '已配置的执行方式'
}
function value(value: unknown, key?: string): string {
  if (value == null) return '未设置'
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  if (typeof value === 'object') return '配置已更新'
  if (key === 'execution_mode') return historyExecutionMode(value)
  if (key === 'recognition_mode') return value === 'text' ? '文字识别' : '图片识别'
  if (typeof value === 'number' && (key?.endsWith('_seconds') || key === 'seconds')) return `${value} 秒`
  if (typeof value === 'number' && key?.endsWith('_ms')) return `${value} 毫秒`
  if (typeof value === 'string' && value.startsWith('data:image/')) return '图片内容'
  return String(value).slice(0, 80)
}
export function historyDifference(before: ScriptDocument, after: ScriptDocument) {
  let added = 0, removed = 0, changed = 0
  const lines: string[] = []
  for (let index = 0; index < Math.max(before.steps.length, after.steps.length); index++) {
    const a = before.steps[index], b = after.steps[index], prefix = `第 ${String(index + 1).padStart(2, '0')} 步`
    if (!a && b) { added++; lines.push(`${prefix}：新增 ${historyStepTitle(b)}`); continue }
    if (a && !b) { removed++; lines.push(`${prefix}：移除 ${historyStepTitle(a)}`); continue }
    if (!a || !b || sameDocument(a, b)) continue
    changed++
    if (a.action !== b.action) lines.push(`${prefix}：${historyStepTitle(a)} → ${historyStepTitle(b)}`)
    else {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !sameDocument(a[key], b[key]))
      const known = keys.filter(key => fields[key]).slice(0, 4).map(key => key.endsWith('_base64') ||
        typeof a[key] === 'object' || typeof b[key] === 'object' ? `${fields[key]}已变更`
          : `${fields[key]} ${value(a[key], key)} → ${value(b[key], key)}`)
      lines.push(`${prefix} · ${historyStepTitle(b)}：${known.join('；') || '步骤参数已变更'}`)
    }
  }
  const { steps: _before, ...beforeSettings } = before, { steps: _after, ...afterSettings } = after
  const settingsChanged = !sameDocument(beforeSettings, afterSettings)
  if (settingsChanged) lines.push('脚本设置或全局规则已变更')
  const summary = [added ? `新增 ${added} 步` : '', removed ? `移除 ${removed} 步` : '',
    changed ? `修改 ${changed} 步` : '', settingsChanged ? '脚本设置变更' : ''].filter(Boolean).join(' · ')
  return { summary: summary || '内容一致', lines: lines.slice(0, 20), more: Math.max(0, lines.length - 20),
    changed: !sameDocument(before, after) }
}
