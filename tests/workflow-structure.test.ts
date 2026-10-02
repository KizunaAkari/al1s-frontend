import { expect, it } from 'vitest'
import { deleteWorkflowStep, insertWorkflowStep, moveWorkflowStep } from '../src/modules/maa/editor/workflow-structure'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'

it('keeps a range open to future steps and protects its boundary', () => {
  const doc: ScriptDocument = { steps: [{ action: 'back' }, { action: 'home' }], global_popups: [{ from_step_index: 2 }] }
  const next = insertWorkflowStep(doc, 2, { action: 'wait' })
  expect(next.global_popups).toEqual([{ from_step_index: 2 }])
  expect(insertWorkflowStep(doc, 0, { action: 'wait' }).global_popups).toEqual([{ from_step_index: 3 }])
  expect(() => deleteWorkflowStep(doc, 1)).toThrow('范围边界')
})

function document(): ScriptDocument {
  return { script_type: 'standard', steps: [
    { action: 'wait', seconds: 1, skip_condition: { enabled: false, skip_to_step_index: 3 } },
    { action: 'back' }, { action: 'home' },
  ], global_popups: [{ name: 'scoped', step_indexes: [1, 3], template_base64: 'kept' }, { name: 'global' }] }
}
it('insertion remaps targets and explicit scopes without changing input or global scope', () => {
  const original = document(); const before = JSON.stringify(original)
  const next = insertWorkflowStep(original, 1, { action: 'wait', seconds: 2 })
  expect(next.steps[0]?.skip_condition).toEqual({ enabled: false, skip_to_step_index: 4 })
  expect(next.global_popups).toEqual([{ name: 'scoped', step_indexes: [1, 4], template_base64: 'kept' }, { name: 'global' }])
  expect(JSON.stringify(original)).toBe(before)
})
it('deletion lists all referrers, including disabled conditions, without mutation', () => {
  const doc = document()
  doc.steps[1]!.skip_condition = { enabled: true, skip_to_step_index: 3 }
  const before = JSON.stringify(doc)
  expect(() => deleteWorkflowStep(doc, 2)).toThrow('第 1、2 步')
  expect(JSON.stringify(doc)).toBe(before)
})
it('deleting an unreferenced step shifts surviving references', () => {
  const next = deleteWorkflowStep(document(), 1)
  expect(next.steps[0]?.skip_condition).toEqual({ enabled: false, skip_to_step_index: 2 })
  expect((next.global_popups as Array<{ step_indexes?: number[] }>)[0]?.step_indexes).toEqual([1, 2])
})
it('moving retains the target identity and rejects backward jumps', () => {
  const doc = document()
  const next = moveWorkflowStep(doc, 2, 1)
  expect(next.steps[1]?.action).toBe('home')
  expect(next.steps[0]?.skip_condition).toEqual({ enabled: false, skip_to_step_index: 2 })
  expect(() => moveWorkflowStep(doc, 2, 0)).toThrow('向前')
})
it('never turns the last explicit popup scope into all steps', () => {
  const doc: ScriptDocument = { steps: [{ action: 'wait' }], global_popups: [{ step_indexes: [1] }] }
  expect(() => deleteWorkflowStep(doc, 0)).toThrow('失去全部适用步骤')
})
it('does not leave an active all-step popup rule with no real steps', () => {
  const doc: ScriptDocument = { steps: [{ action: 'wait' }], global_popups: [{ enabled: true, template_base64: 'image' }] }
  expect(() => deleteWorkflowStep(doc, 0)).toThrow('全局规则仍需至少一个适用步骤')
  expect(deleteWorkflowStep({ ...doc, global_popups: [{ enabled: false, template_base64: 'image' }] }, 0).steps).toEqual([])
})
it('protects start and last launch while allowing ordinary empty and end workflows', () => {
  const doc: ScriptDocument = { script_type: 'module_start', steps: [{ action: 'start' }, { action: 'launch_app' }] }
  expect(() => deleteWorkflowStep(doc, 0)).toThrow('不能在这里删除')
  expect(() => deleteWorkflowStep(doc, 1)).toThrow('不能在这里删除')
  expect(() => moveWorkflowStep(doc, 0, 1)).toThrow('不能在这里排序')
  expect(() => insertWorkflowStep(doc, 0, { action: 'wait' })).toThrow('开始脚本')
  expect(deleteWorkflowStep({ steps: [{ action: 'wait' }], cleanup_on_finish: true }, 0)).toEqual({ steps: [], cleanup_on_finish: true })
  expect(insertWorkflowStep({ steps: [] }, 0, { action: 'wait' }).steps).toHaveLength(1)
})
it('does not delete, reorder or add legacy and lifecycle actions from the five-step editor', () => {
  const doc: ScriptDocument = { steps: [
    { action: 'tap', x: 1, y: 2 }, { action: 'cleanup' }, { action: 'home' },
  ] }
  expect(() => deleteWorkflowStep(doc, 0)).toThrow('不能在这里删除')
  expect(() => deleteWorkflowStep(doc, 1)).toThrow('不能在这里删除')
  expect(() => moveWorkflowStep(doc, 0, 2)).toThrow('不能在这里排序')
  expect(() => insertWorkflowStep(doc, 3, { action: 'launch_app' })).toThrow('只能添加五类')
  expect(() => insertWorkflowStep(doc, 3, { action: 'tap' })).toThrow('只能添加五类')
  expect(doc.steps.map(step => step.action)).toEqual(['tap', 'cleanup', 'home'])
})
it('rejects bad indexes and step overflow', () => {
  expect(() => deleteWorkflowStep(document(), -1)).toThrow('不存在')
  expect(() => moveWorkflowStep(document(), 0, 3)).toThrow('不存在')
  expect(() => insertWorkflowStep({ steps: Array.from({ length: 1000 }, () => ({ action: 'wait' })) }, 0, { action: 'wait' })).toThrow('1000')
})
