import type { ScriptDocument, WorkflowStep } from '../../../shared/api/maa-script-editor'

const CONFIGURABLE_ACTIONS = new Set([
  'wait', 'wait_random', 'wait_image', 'recognize_execute', 'back', 'home', 'task_view',
])
export function isConfigurableWorkflowAction(action: string): boolean {
  return CONFIGURABLE_ACTIONS.has(action)
}

type Entry = { old: number | null; step: WorkflowStep }
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function reference(value: unknown, count: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > count) {
    throw new Error('存在无效步骤引用，请先修正后再调整结构。')
  }
  return value - 1
}
function rewrite(doc: ScriptDocument, entries: Entry[]): ScriptDocument {
  const mapping = new Map(entries.flatMap((e, i) => e.old === null ? [] : [[e.old, i] as const]))
  const steps = entries.map(({ step }, index) => {
    const skip = object(step.skip_condition)
    if (skip?.skip_to_step_index == null) return step
    const target = mapping.get(reference(skip.skip_to_step_index, doc.steps.length))
    if (target === undefined) throw new Error('目标步骤仍被引用，不能删除。')
    if (target <= index) throw new Error('移动会产生向前或自身跳转，已拒绝操作。')
    return { ...step, skip_condition: { ...skip, skip_to_step_index: target + 1 } }
  })
  if (doc.script_type === 'module_start' && (steps[0]?.action !== 'start' || !steps.some(s => s.action === 'launch_app'))) {
    throw new Error('开始脚本必须保留首个开始动作和至少一个启动应用动作。')
  }
  const result: ScriptDocument = { ...doc, steps }
  if (Array.isArray(doc.global_popups)) result.global_popups = doc.global_popups.map((value, i) => {
    const rule = object(value)
    if (!rule) return value
    if (rule.from_step_index != null || rule.through_step_index != null) {
      if (rule.step_indexes != null) throw new Error(`独立规则 ${i + 1} 混用了两种范围，请先修正。`)
      const start = rule.from_step_index == null ? 0 : reference(rule.from_step_index, doc.steps.length)
      const end = rule.through_step_index == null ? undefined : reference(rule.through_step_index, doc.steps.length)
      const nextStart = mapping.get(start), nextEnd = end === undefined ? undefined : mapping.get(end)
      if (nextStart === undefined || (end !== undefined && nextEnd === undefined)) throw new Error(`独立规则 ${i + 1} 仍引用此范围边界，请先修改规则。`)
      if (nextEnd !== undefined && nextEnd < nextStart) throw new Error(`移动会颠倒独立规则 ${i + 1} 的范围。`)
      return { ...rule, from_step_index: nextStart + 1,
        ...(nextEnd === undefined ? {} : { through_step_index: nextEnd + 1 }) }
    }
    if (rule.step_indexes == null) return value
    if (!Array.isArray(rule.step_indexes)) throw new Error(`独立规则 ${i + 1} 的步骤范围无效。`)
    const indexes = rule.step_indexes.map(n => mapping.get(reference(n, doc.steps.length)))
      .filter((n): n is number => n !== undefined).map(n => n + 1)
    if (!indexes.length) throw new Error(`独立规则 ${i + 1} 将失去全部适用步骤，请先调整规则。`)
    return { ...rule, step_indexes: indexes }
  })
  if (!steps.length && Array.isArray(doc.global_popups) && doc.global_popups.some(value => {
    const rule = object(value)
    return rule && rule.enabled !== false
  })) throw new Error('全局规则仍需至少一个适用步骤，请先关闭规则。')
  return result
}
function entries(doc: ScriptDocument): Entry[] { return doc.steps.map((step, old) => ({ step, old })) }
function requireIndex(doc: ScriptDocument, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= doc.steps.length) throw new Error('步骤不存在。')
}
export function deleteWorkflowStep(doc: ScriptDocument, index: number): ScriptDocument {
  requireIndex(doc, index)
  if (!isConfigurableWorkflowAction(doc.steps[index]!.action)) {
    throw new Error('此步骤由脚本类型或旧版本管理，不能在这里删除。')
  }
  const referrers = doc.steps.flatMap((step, i) => i !== index && object(step.skip_condition)?.skip_to_step_index === index + 1 ? [i + 1] : [])
  if (referrers.length) throw new Error(`不能删除：第 ${referrers.join('、')} 步仍跳转到此步骤，请先修改引用。`)
  return rewrite(doc, entries(doc).filter(e => e.old !== index))
}
export function moveWorkflowStep(doc: ScriptDocument, from: number, to: number): ScriptDocument {
  requireIndex(doc, from); requireIndex(doc, to)
  if (!isConfigurableWorkflowAction(doc.steps[from]!.action)) {
    throw new Error('此步骤由脚本类型或旧版本管理，不能在这里排序。')
  }
  const ordered = entries(doc)
  const [item] = ordered.splice(from, 1)
  ordered.splice(to, 0, item!)
  return rewrite(doc, ordered)
}
export function insertWorkflowStep(doc: ScriptDocument, at: number, step: WorkflowStep): ScriptDocument {
  if (!Number.isInteger(at) || at < 0 || at > doc.steps.length) throw new Error('插入位置无效。')
  if (!isConfigurableWorkflowAction(step.action)) throw new Error('只能添加五类可配置步骤。')
  if (doc.steps.length >= 1000) throw new Error('脚本最多包含1000个步骤。')
  const ordered = entries(doc)
  ordered.splice(at, 0, { old: null, step })
  return rewrite(doc, ordered)
}
