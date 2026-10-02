import { expect, it } from 'vitest'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'
import { addPopupRule, globalPopupsEnabled, popupRules, removePopupRule, ruleStepIndexes, setRuleStepIndexes,
  toggleGlobalPopups, updatePopupRule } from '../src/modules/maa/editor/global-popup-rules'

it('toggles every existing popup rule without changing its configuration or real step indexes', () => {
  const original: ScriptDocument = { steps: [{ action: 'start' }, { action: 'wait' }], global_popups: [
    { name: 'A', enabled: true, step_indexes: [2], template_base64: 'image-a' },
    { name: 'B', enabled: false, from_step_index: 1, template_base64: 'image-b' },
  ] }
  const paused = toggleGlobalPopups(original, false)
  expect(globalPopupsEnabled(paused)).toBe(false)
  expect(popupRules(paused).map(rule => rule.enabled)).toEqual([false, false])
  expect(paused.steps).toEqual(original.steps)
  expect(popupRules(paused).map(rule => rule.template_base64)).toEqual(['image-a', 'image-b'])
  const resumed = toggleGlobalPopups(paused, true)
  expect(popupRules(resumed).map(rule => rule.enabled)).toEqual([true, true])
  expect(original.global_popups).toEqual([
    { name: 'A', enabled: true, step_indexes: [2], template_base64: 'image-a' },
    { name: 'B', enabled: false, from_step_index: 1, template_base64: 'image-b' },
  ])
})

it('creates a first rule on enable and preserves the old range until scope is edited', () => {
  const empty: ScriptDocument = { steps: [{ action: 'back' }, { action: 'home' }] }
  const enabled = toggleGlobalPopups(empty, true)
  expect(popupRules(enabled)).toHaveLength(1)
  expect(popupRules(enabled)[0]).toMatchObject({ click_mode: 'match_center', enabled: true })
  expect(enabled.steps).toEqual(empty.steps)
  expect(popupRules(toggleGlobalPopups(enabled, false))).toEqual([])
  const old = { from_step_index: 2, name: 'old' }
  expect(ruleStepIndexes(old, 3)).toEqual([2, 3])
  expect(setRuleStepIndexes(old, [1, 3], 3)).toEqual({ name: 'old', step_indexes: [1, 3] })
  expect(setRuleStepIndexes(old, [1, 2, 3], 3)).toEqual({ name: 'old' })
  expect(() => setRuleStepIndexes(old, [], 3)).toThrow('至少选择一个')
})

it('edits and removes one condition while retaining sibling popup rules', () => {
  const base: ScriptDocument = { steps: [{ action: 'back' }], global_popups: [
    { name: 'first', template_base64: 'first-image' }, { name: 'second', template_base64: 'second-image' },
  ] }
  const changed = updatePopupRule(base, 1, { ...popupRules(base)[1], name: 'renamed' })
  expect(popupRules(changed)[0]).toEqual(popupRules(base)[0])
  const added = addPopupRule(changed)
  expect(popupRules(added)).toHaveLength(3)
  expect(popupRules(removePopupRule(added, 2))).toEqual(popupRules(changed))
  expect(base.steps).toHaveLength(1)
})
