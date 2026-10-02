import { expect, it } from 'vitest'
import { annotationFromDetail, resizeTeam, updateRegion } from '../src/modules/lineup/annotation-draft'
import type { WorkspaceDetail } from '../src/shared/api/lineup-workspace'

it('starts with no invented teams when inference failed completely', () => {
  expect(annotationFromDetail({ result: null, annotation: null } as WorkspaceDetail)).toEqual({ teams: {}, slots: [] })
})
it('preserves saved labels independently of machine results and copies before editing', () => {
  const saved = { teams: { attack: 1 }, slots: [{ side: 'attack', index: 0, student_id: 10001, regions: [] }] }
  const result = annotationFromDetail({ annotation: saved, result: null } as unknown as WorkspaceDetail)
  result.slots[0]!.student_id = 10002
  expect(saved.slots[0]!.student_id).toBe(10001)
})
it('resizing a team keeps position order and region edits target only the selected kind', () => {
  const doc = resizeTeam({ teams: {}, slots: [] }, 'attack', 2)
  expect(doc.slots.map(s => s.index)).toEqual([0, 1])
  const changed = updateRegion(doc, 'attack-1-name', [1, 2, 3, 4])
  expect(changed.slots[1]!.regions).toEqual([{ kind: 'name', box: [1, 2, 3, 4] }])
  expect(doc.slots[1]!.regions).toEqual([])
  expect(updateRegion(changed, 'attack-1-name', null).slots[1]!.regions).toEqual([])
  expect(resizeTeam(changed, 'attack', 1).slots).toHaveLength(1)
})
