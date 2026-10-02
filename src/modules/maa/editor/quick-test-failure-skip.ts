import type { QuickTestEvent } from '../../../shared/api/maa-quick-test'

export function failureSkipEvent(event: QuickTestEvent) {
  if (event.kind !== 'log') return undefined
  const reasons: Record<string, string> = { step_timeout: '步骤超时', action_failed: '动作失败',
    recovery_failed: '恢复脚本失败', retry_exhausted: '重试次数耗尽' }
  const match = /^maa_failure_skipped:(recognition|execution):([a-z_]+)(?::([1-9][0-9]{0,3}))?$/.exec(event.code ?? '')
  if (!match || !reasons[match[2]!]) return undefined
  const step = match[3] ? Number(match[3]) : event.step_number ?? undefined
  if (step != null && (!Number.isInteger(step) || step < 1 || step > 1000)) return undefined
  return { label: `${match[1] === 'recognition' ? '识别' : '执行'}失败已跳过（${reasons[match[2]!]}）`, step }
}

export function failureSkipLabel(event: QuickTestEvent): string | undefined {
  return failureSkipEvent(event)?.label
}
