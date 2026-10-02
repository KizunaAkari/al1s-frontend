import type { QuickTestFailureDetail } from '../../../shared/api/maa-quick-test'

const reasons: Record<string, string> = {
  maa_step_execution_stalled: '步骤执行超过时间预算，终端已停止本次测试',
  maa_independent_rule_timeout: '独立规则处理超时',
  maa_step_timeout: '步骤执行超时',
  maa_pipeline_failed: '步骤执行失败',
  post_assertion_failed: '执行后断言未通过',
  maa_post_assertion_failed: '执行后断言未通过',
  recognition_failed: '目标识别失败',
}
export function quickTestFailureReason(code: string): string {
  return reasons[code] ?? '测试执行失败，终端返回了错误'
}
function number(value: number): string { return String(Number(value.toFixed(5))) }
export function quickTestFailureLines(detail: QuickTestFailureDetail): string[] {
  const stage = { recognition: '目标识别', click_target: '点击目标识别', post_assertion: '执行后断言识别' }[detail.stage]
  const location = detail.rule_name
    ? `00 · 全局规则“${detail.rule_name}”（关联主步骤 ${String(detail.step_number).padStart(2, '0')}）`
    : `第 ${detail.step_number} 步`
  const lines = [`脚本“${detail.script_name}” · ${location} · ${stage}`]
  const recognition = [detail.algorithm === 'OCR' ? '文字识别' : '图片匹配']
  if (detail.consecutive_misses != null && detail.consecutive_misses > 0) recognition.push(`连续 ${detail.consecutive_misses} 次未命中`)
  if (detail.best_score != null) recognition.push(`最高匹配分数 ${number(detail.best_score)}`)
  if (detail.threshold != null) recognition.push(`阈值 ${number(detail.threshold)}`)
  if (detail.best_score == null) recognition.push('未取得候选匹配分数')
  lines.push(recognition.join(' · '))
  const timing: string[] = []
  if (detail.timeout_seconds != null) timing.push(`时间预算 ${number(detail.timeout_seconds)} 秒`)
  if (detail.elapsed_seconds != null) timing.push(`已用 ${number(detail.elapsed_seconds)} 秒`)
  if (timing.length) lines.push(timing.join(' · '))
  return lines
}
