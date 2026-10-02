import { describe, expect, it } from 'vitest'
import type { AnnotationDocument, WorkspaceDetail } from '../src/shared/api/lineup-workspace'
import { workspaceCodes } from '../src/modules/lineup/workspace-export'

function detail(overrides: Partial<WorkspaceDetail> = {}): WorkspaceDetail {
  const base: WorkspaceDetail = {
    id: 'record-1', name: 'battle.png', width: 1200, height: 800,
    catalog_version: 'catalog-1', created_at: '2026-10-01T00:00:00Z', task_id: 'task-1',
    state: 'success', error_code: null, result: null, review: null, row_version: 1,
    annotation: null, needs_attention: false, attention_reason: 'none', ordinal: 1,
    usable_result: null,
  }
  return { ...base, ...overrides }
}

function annotation(overrides: Partial<AnnotationDocument> = {}): NonNullable<WorkspaceDetail['annotation']> {
  return {
    record_id: 'record-1', version: 2, state: 'confirmed', updated_at: '2026-10-01T00:00:00Z',
    teams: { attack: 3 },
    slots: [
      { side: 'attack', index: 2, student_id: 20053, regions: [{ kind: 'portrait', box: [20, 20, 10, 10] }] },
      { side: 'attack', index: 0, student_id: 10001, regions: [{ kind: 'portrait', box: [0, 0, 10, 10] }] },
      { side: 'attack', index: 1, student_id: 10023, regions: [{ kind: 'portrait', box: [10, 10, 10, 10] }] },
    ],
    ...overrides,
  }
}

describe('workspace export codes', () => {
  it('prefers a confirmed annotation even when the execution failed', () => {
    const current = detail({
      state: 'failure', error_code: 'runtime_failure', needs_attention: true, attention_reason: 'runtime_failure',
      annotation: annotation(),
    })
    expect(workspaceCodes(current)).toEqual({
      attack: '10001,10023,0,0,20053,0', defense: null, pair: null,
    })
  })

  it('does not turn unknown or duplicate students into zeroes', () => {
    const current = detail({
      usable_result: {
        layout_valid: true, teams: ['attack', 'defense'], team_sizes: { attack: 2, defense: 2 }, slots: [
          { side: 'attack', index: 0, selected_id: 10001, accepted: true },
          { side: 'attack', index: 1, selected_id: 10001, accepted: true },
          { side: 'defense', index: 0, selected_id: 20001, accepted: true },
          { side: 'defense', index: 1, selected_id: null, accepted: false },
        ],
      },
    })
    expect(workspaceCodes(current)).toEqual({
      attack: null, defense: null, pair: null,
    })
  })

  it('preserves source slot order and falls back to a saved legacy review', () => {
    const current = detail({
      annotation: null,
      review: [10001, 10023, 20053, null, null, null, 20001, 10002, null, null, null, null],
      usable_result: {
        layout_valid: true, teams: ['attack', 'defense'], team_sizes: { attack: 3, defense: 2 }, slots: [],
      },
    })
    expect(workspaceCodes(current)).toEqual({
      attack: '10001,10023,0,0,20053,0', defense: '10002,0,0,0,20001,0',
      pair: '10001,10023,0,0,20053,0\t10002,0,0,0,20001,0',
    })
  })

  it('uses accepted/agreed machine IDs only when both actual sides are complete', () => {
    const current = detail({
      usable_result: {
        layout_valid: true, teams: ['attack', 'defense'], team_sizes: { attack: 2, defense: 2 }, slots: [
          { side: 'defense', index: 1, image_id: 10002, agreed: true },
          { side: 'attack', index: 1, selected_id: 20001, accepted: true },
          { side: 'defense', index: 0, image_id: 10001, agreed: true },
          { side: 'attack', index: 0, selected_id: 10001, accepted: true },
        ],
      },
    })
    expect(workspaceCodes(current)).toEqual({
      attack: '10001,0,0,0,20001,0', defense: '10001,10002,0,0,0,0',
      pair: '10001,0,0,0,20001,0\t10001,10002,0,0,0,0',
    })
  })

  it('honors an explicit incomplete review and never falls back to machine IDs', () => {
    const current = detail({
      review: [null, 10001, 10002, 10003, 10004, 20001, null, null, null, null, null, null],
      usable_result: {
        layout_valid: true, teams: ['attack', 'defense'], team_sizes: { attack: 2, defense: 2 }, slots: [
          { side: 'attack', index: 0, selected_id: 10001, accepted: true },
          { side: 'attack', index: 1, selected_id: 10002, accepted: true },
          { side: 'defense', index: 0, selected_id: 10003, accepted: true },
          { side: 'defense', index: 1, selected_id: 10004, accepted: true },
        ],
      },
    })
    expect(workspaceCodes(current)).toEqual({ attack: null, defense: null, pair: null })
  })

  it('does not export failure, timeout, or draft annotation records', () => {
    const review = [
      10001, 10002, 10003, 10004, 20001, 20002,
      10003, 10004, 10005, 10006, 20003, 20004,
    ] as WorkspaceDetail['review']
    const machine: NonNullable<WorkspaceDetail['usable_result']> = {
      layout_valid: true, teams: ['attack'], team_sizes: { attack: 2 }, slots: [
        { side: 'attack' as const, index: 0, selected_id: 10001, accepted: true },
        { side: 'attack' as const, index: 1, selected_id: 10002, accepted: true },
      ],
    }
    expect(workspaceCodes(detail({ state: 'failure', review, usable_result: machine }))).toEqual({ attack: null, defense: null, pair: null })
    expect(workspaceCodes(detail({ state: 'timed_out', review, usable_result: machine }))).toEqual({ attack: null, defense: null, pair: null })
    expect(workspaceCodes(detail({ annotation: { ...annotation(), state: 'draft' }, usable_result: machine }))).toEqual({ attack: null, defense: null, pair: null })
  })
})
