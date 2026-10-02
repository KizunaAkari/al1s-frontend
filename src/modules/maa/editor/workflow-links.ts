import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
export function connectSkip(doc: ScriptDocument, from: number, to: number): ScriptDocument {
  if (![from,to].every(n=>Number.isInteger(n)&&n>=0&&n<doc.steps.length) || to<=from) throw new Error('条件跳过只能连接到后续步骤')
  const step=doc.steps[from]!
  const skip=step.skip_condition as Record<string,unknown> | undefined
  if (step.action==='start' || !skip || skip.enabled!==true) throw new Error('先在节点参数中配置并启用条件跳过，再拖动条件出口')
  return { ...doc, steps:doc.steps.map((s,i)=>i===from?{...s,skip_condition:{...skip,skip_to_step_index:to+1}}:s) }
}
