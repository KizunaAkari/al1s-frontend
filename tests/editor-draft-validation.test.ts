import { expect, it } from 'vitest'
import { validateEditorDraft } from '../src/modules/maa/editor/editor-draft'

it('keeps an invalid local draft for manual recovery without loading it into the editor', () => {
  const draft = {
    scriptId: 's', baseRowVersion: 1, cursor: 0, updatedAt: 1,
    history: [{ version: 2, steps: [{ action: 'tap', x: 'invalid', y: 1 }] }],
  }
  expect(() => validateEditorDraft(draft, 's')).toThrow('本地草稿含无效脚本字段')
  expect(draft.history[0]?.steps[0]?.x).toBe('invalid')
})

it('accepts incomplete known steps and opaque extension actions in local drafts', () => {
  const draft = {
    scriptId: 's', baseRowVersion: 1, cursor: 0, updatedAt: 1,
    history: [{ version: 2, steps: [{ action: 'tap' }, { action: 'vendor_action', data: 1 }] }],
  }
  expect(validateEditorDraft(draft, 's')).toBe(draft)
})

it('retains partial nested coordinates throughout history and unfinished configuration', () => {
  const draft = {
    scriptId: 's', baseRowVersion: 1, cursor: 1, updatedAt: 1,
    history: [
      { version: 2, steps: [{ action: 'wait_click', click_mode: 'fixed', click: { x: 12 } }] },
      { version: 2, steps: [{ action: 'wait_click', click_mode: 'fixed', click: { x: 12, y: 34 } }] },
    ],
    configDocument: { version: 2, steps: [{ action: 'recognize_execute', swipe: { x1: 0, y1: 1 } }] },
  }
  expect(validateEditorDraft(draft, 's')).toBe(draft)
  delete (draft.history[1]!.steps[0]!.click as { y?: number }).y
  expect(validateEditorDraft(draft, 's')).toBe(draft)
})

it('rejects invalid values in present members of incomplete coordinates', () => {
  for (const value of ['12', null, NaN, Infinity]) {
    const draft = {
      scriptId: 's', baseRowVersion: 1, cursor: 0, updatedAt: 1,
      history: [{ version: 2, steps: [{ action: 'wait_click', click: { x: value } }] }],
    }
    expect(() => validateEditorDraft(draft, 's')).toThrow('本地草稿含无效脚本字段')
  }
})
