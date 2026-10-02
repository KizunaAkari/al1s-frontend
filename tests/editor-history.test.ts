import { expect, it } from 'vitest'
import { appendHistory, restoreHistory } from '../src/modules/maa/editor/editor-history'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'

const document = (value: number): ScriptDocument => ({ steps: [{ action: 'wait', seconds: value }] })

it('keeps fifty independent snapshots and drops redo entries after a new edit', () => {
  let state = { snapshots: [document(0)], cursor: 0 }
  for (let index = 1; index <= 52; index++)
    state = appendHistory(state.snapshots, state.cursor, document(index))

  expect(state.snapshots).toHaveLength(50)
  expect(state.snapshots[0]?.steps[0]?.seconds).toBe(3)
  const branched = appendHistory(state.snapshots, 10, document(100))
  expect(branched.snapshots).toHaveLength(12)
  expect(branched.snapshots.at(-1)?.steps[0]?.seconds).toBe(100)
  expect(branched.cursor).toBe(11)
})

it('restores a copy so editing does not mutate saved history', () => {
  const snapshots = [document(1)]
  const restored = restoreHistory(snapshots, 0)!
  restored.steps[0]!.seconds = 2
  expect(snapshots[0]!.steps[0]!.seconds).toBe(1)
})
