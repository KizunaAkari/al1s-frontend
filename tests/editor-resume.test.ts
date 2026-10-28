import { afterEach, expect, it } from 'vitest'
import { readEditorResume, writeEditorResume } from '../src/modules/maa/editor/editor-resume'

afterEach(() => sessionStorage.clear())
it('reads a phone-only recovery record without inventing a script', () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ deviceId: 's21', step: 1 }))
  expect(readEditorResume()).toEqual({ deviceId: 's21', step: 1, restoreDraft: false })
})
it('keeps existing script and draft recovery records compatible', () => {
  const value = { scriptId: 'script', deviceId: 'phone', step: 3, restoreDraft: true }
  writeEditorResume(value)
  expect(readEditorResume()).toEqual(value)
})
it('rejects records containing neither a phone nor a script', () => {
  sessionStorage.setItem('al1s.editor.resume', JSON.stringify({ step: 1 }))
  expect(readEditorResume()).toBeUndefined()
})
