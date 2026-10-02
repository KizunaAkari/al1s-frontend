import type { QuickTestEvent } from '../../../shared/api/maa-quick-test'

export function ruleEvent(event: QuickTestEvent) {
  if (event.kind !== 'log' || event.step_number != null) return undefined
  const match = /^maa_rule_(started|succeeded|failed):(.+):([0-9]+)$/.exec(event.code ?? '')
  if (!match || Number(match[3]) >= 50) return undefined
  return { phase: match[1]!, key: `${match[2]}:${match[3]}`, name: event.rule_name || '独立规则' }
}

export function ruleEventLabel(event: QuickTestEvent): string | undefined {
  const rule = ruleEvent(event)
  if (!rule) return undefined
  const phase = ({ started: '开始处理', succeeded: '处理完成', failed: '处理失败' } as Record<string, string>)[rule.phase]
  return `00 · 全局规则 · ${rule.name} · ${phase}`
}
