import type { ScriptDocument } from '../../../shared/api/maa-script-editor'

export type PopupRule = Record<string, unknown>

export function popupRules(document: ScriptDocument): PopupRule[] {
  return Array.isArray(document.global_popups)
    ? document.global_popups.filter((rule): rule is PopupRule => !!rule && typeof rule === 'object' && !Array.isArray(rule))
    : []
}

export function globalPopupsEnabled(document: ScriptDocument): boolean {
  return popupRules(document).some(rule => rule.enabled !== false)
}

export function toggleGlobalPopups(document: ScriptDocument, enabled: boolean): ScriptDocument {
  const rules = popupRules(document)
  if (enabled && !rules.length) {
    return { ...document, global_popups: [{ name: '弹窗规则 1', enabled: true, click_mode: 'match_center', threshold: 0.85 }] }
  }
  // An unfinished new condition cannot pass server validation even when disabled.
  // Turning the group off removes it; previously configured conditions remain intact.
  return { ...document, global_popups: rules.filter(rule => enabled || rule.template_base64)
    .map(rule => ({ ...rule, enabled })) }
}

export function updatePopupRule(document: ScriptDocument, index: number, value: PopupRule): ScriptDocument {
  const rules = popupRules(document)
  if (!rules[index]) throw new Error('弹窗规则不存在')
  return { ...document, global_popups: rules.map((rule, at) => at === index ? value : rule) }
}

export function addPopupRule(document: ScriptDocument): ScriptDocument {
  const rules = popupRules(document)
  if (rules.length >= 50) throw new Error('弹窗规则最多 50 条')
  return { ...document, global_popups: [...rules, { name: `弹窗规则 ${rules.length + 1}`, enabled: true,
    click_mode: 'match_center', threshold: 0.85 }] }
}

export function removePopupRule(document: ScriptDocument, index: number): ScriptDocument {
  const rules = popupRules(document)
  if (!rules[index]) throw new Error('弹窗规则不存在')
  return { ...document, global_popups: rules.filter((_, at) => at !== index) }
}

export function ruleStepIndexes(rule: PopupRule, count: number): number[] {
  if (Array.isArray(rule.step_indexes)) return rule.step_indexes.filter((value): value is number =>
    Number.isInteger(value) && value >= 1 && value <= count)
  const start = Number.isInteger(rule.from_step_index) ? Number(rule.from_step_index) : 1
  const end = Number.isInteger(rule.through_step_index) ? Number(rule.through_step_index) : count
  return Array.from({ length: count }, (_, index) => index + 1).filter(index => index >= start && index <= end)
}

export function setRuleStepIndexes(rule: PopupRule, indexes: number[], count: number): PopupRule {
  if (!indexes.length) throw new Error('至少选择一个适用步骤')
  const next = { ...rule }
  delete next.from_step_index
  delete next.through_step_index
  if (indexes.length === count && indexes.every((value, index) => value === index + 1)) delete next.step_indexes
  else next.step_indexes = [...indexes].sort((a, b) => a - b)
  return next
}
