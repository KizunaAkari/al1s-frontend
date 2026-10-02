import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../src/shared/api/client'
import {
  createLineupRecord,
  fetchLineupImage,
  fetchLineupRecords,
  reviewLineupRecord,
  runLineupRecord,
  type LineupDetail,
  type LineupStudentIds,
} from '../src/shared/api/lineup'
import {
  availableSidesForResult,
  buildPairCopyText,
  buildSideCopyText,
  canCopySide,
  emptyLineupReview,
  hasCompleteAgreedLayout,
  initialReview,
  isLineupPollingState,
  isValidUniqueSide,
  machineDefaultsForDetail,
  isV3LineupResult,
} from '../src/modules/lineup/lineup-utils'

afterEach(() => vi.restoreAllMocks())

function review(): LineupStudentIds {
  return [101, 102, 103, 104, 105, 106, 201, 202, 203, 204, 205, 206]
}

function detail(overrides: Partial<LineupDetail> = {}): LineupDetail {
  return {
    id: 'record-1', name: 'battle.png', width: 1200, height: 800,
    catalog_version: 'catalog-1', created_at: '2026-09-29T00:00:00Z', task_id: null,
    state: 'success', error_code: null, review: null, row_version: 1,
    result: {
      layout_valid: true, model_version: 'model-1', catalog_version: 'catalog-1', elapsed_ms: 18,
      slots: Array.from({ length: 12 }, (_, index) => ({
        side: index < 6 ? 'attack' as const : 'defense' as const,
        index: (index % 6) as 0 | 1 | 2 | 3 | 4 | 5,
        box: [index * 10, 0, 10, 10] as [number, number, number, number],
        ocr_text: '', image_id: null, ocr_id: null, score: 0.9, margin: 0.2, agreed: true,
      })),
    },
    ...overrides,
  }
}

describe('lineup export rules', () => {
  it('requires six non-null unique IDs and a saved review for each side', () => {
    const ids = review()
    expect(isValidUniqueSide(ids, 'attack')).toBe(true)
    expect(isValidUniqueSide(ids, 'defense')).toBe(true)
    expect(canCopySide(ids, 'attack', false)).toBe(false)
    expect(canCopySide(ids, 'attack', true)).toBe(true)
    expect(isValidUniqueSide([101, 101, 103, 104, 105, 106, 201, 202, 203, 204, 205, 206], 'attack')).toBe(false)
    expect(buildSideCopyText([101, null, 103, 104, 105, 106, 201, 202, 203, 204, 205, 206], 'attack', true)).toBeNull()
  })

  it('preserves side order and uses a real tab between attack and defense', () => {
    const text = buildPairCopyText(review(), true)
    expect(text).toBe('101,102,103,104,105,106\t201,202,203,204,205,206')
    expect(text).not.toContain('\\t')
  })
})

describe('lineup recognition result guards', () => {
  it('does not invent IDs for a pending or unrecognised result', () => {
    expect(initialReview(detail())).toEqual(emptyLineupReview())
    expect(initialReview(detail({ result: null, review: null }))).toEqual(emptyLineupReview())
    expect(hasCompleteAgreedLayout(detail())).toBe(true)
    expect(hasCompleteAgreedLayout(detail({ result: { ...detail().result!, layout_valid: false } }))).toBe(false)
    expect(initialReview(detail({ review: review() }))).toEqual(review())
  })

  it('prefills only independently agreed image/OCR matches', () => {
    const source = detail()
    source.result!.slots[0]!.image_id = 101
    source.result!.slots[0]!.ocr_id = 101
    source.result!.slots[1]!.image_id = 102
    source.result!.slots[1]!.ocr_id = 999
    source.result!.slots[2]!.image_id = 103
    source.result!.slots[2]!.ocr_id = 103
    source.result!.slots[2]!.agreed = false
    source.result!.slots[8]!.image_id = 208
    source.result!.slots[8]!.ocr_id = 208
    expect(machineDefaultsForDetail(source)).toEqual([
      101, null, null, null, null, null, null, null, 208, null, null, null,
    ])
    expect(initialReview(source)).toEqual(machineDefaultsForDetail(source))
  })

  it('uses accepted selected IDs for a single present v3 side and keeps the absent side empty', () => {
    const source = detail({
      result: {
        ...detail().result!,
        model_version: 'lineup-portrait-yolov8n-ppocrv5-v3',
        teams: ['attack'],
        slots: Array.from({ length: 12 }, (_, index) => ({
          ...detail().result!.slots[index]!,
          present: index < 6,
          selected_id: index < 6 ? 301 + index : null,
          accepted: index < 6,
          evidence: index < 6 ? 'portrait_only' as const : 'absent' as const,
          image_id: index < 6 ? 301 + index : null,
          ocr_id: null,
          agreed: false,
        })),
      },
    })
    expect(isV3LineupResult(source.result)).toBe(true)
    expect(availableSidesForResult(source.result)).toEqual(['attack'])
    expect(machineDefaultsForDetail(source)).toEqual([
      301, 302, 303, 304, 305, 306, null, null, null, null, null, null,
    ])
    expect(buildSideCopyText(review(), 'attack', true, true)).toBe('101,102,103,104,105,106')
    expect(buildSideCopyText(review(), 'defense', true, false)).toBeNull()
    expect(buildPairCopyText(review(), true, ['attack'])).toBeNull()
  })

  it('does not autofill a v3 conflict even when a selected ID is present', () => {
    const source = detail({
      result: {
        ...detail().result!,
        model_version: 'lineup-portrait-yolov8n-ppocrv5-v3',
        teams: ['attack', 'defense'],
        slots: detail().result!.slots.map((slot, index) => ({
          ...slot,
          present: true,
          selected_id: index === 0 ? 401 : null,
          accepted: index !== 0,
          evidence: index === 0 ? 'conflict' as const : 'unresolved' as const,
        })),
      },
    })
    expect(machineDefaultsForDetail(source)[0]).toBeNull()
  })

  it('keeps an explicit review even when machine slots disagree', () => {
    const source = detail({ review: review() })
    source.result!.layout_valid = false
    source.result!.slots[0]!.agreed = false
    expect(initialReview(source)).toEqual(review())
  })

  it('exports by resolved attack side even when attack boxes are on the right', () => {
    const source = detail()
    source.result!.attack_side = 'right'
    source.result!.slots.forEach((slot, index) => {
      slot.box = [index < 6 ? 700 + index * 50 : (index - 6) * 50, 600, 40, 40]
      slot.image_id = review()[index]!
      slot.ocr_id = review()[index]!
    })
    expect(buildPairCopyText(initialReview(source), true)).toBe(
      '101,102,103,104,105,106\t201,202,203,204,205,206',
    )
  })

  it('polls only states that represent active execution', () => {
    expect(isLineupPollingState('uploaded')).toBe(false)
    expect(isLineupPollingState('waiting')).toBe(true)
    expect(isLineupPollingState('queued')).toBe(true)
    expect(isLineupPollingState('running')).toBe(true)
  })
})

describe('lineup API contract', () => {
  it('uploads raw image bytes with the filename query and content type', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: detail({ state: 'uploaded' }) } as never)
    const file = new File(['png'], 'battle.png', { type: 'image/png' })
    await createLineupRecord(file)
    expect(post).toHaveBeenCalledWith('/lineup/records', file, {
      params: { name: 'battle.png' }, headers: { 'Content-Type': 'image/png' }, timeout: 30000,
    })
  })

  it('keeps the fixed history cursor and review/run request bodies', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: detail({ state: 'queued' }) } as never)
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: detail({ review: review() }) } as never)
    await fetchLineupRecords('cursor-1')
    await runLineupRecord('record-1', 'terminal-1')
    await reviewLineupRecord('record-1', 7, review())
    expect(get).toHaveBeenCalledWith('/lineup/records', { params: { cursor: 'cursor-1' } })
    expect(post).toHaveBeenCalledWith('/lineup/records/record-1/run', { terminal_id: 'terminal-1' })
    expect(put).toHaveBeenCalledWith('/lineup/records/record-1/review', { expected_version: 7, student_ids: review() })
  })

  it('passes selected v3 run options when provided', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: detail({ state: 'queued' }) } as never)
    await runLineupRecord('record-1', 'terminal-1', { layout_hint: 'left_attack', recognition_mode: 'text' })
    expect(post).toHaveBeenCalledWith('/lineup/records/record-1/run', {
      terminal_id: 'terminal-1', layout_hint: 'left_attack', recognition_mode: 'text',
    })
  })

  it('requests the authenticated original image as a blob', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }) } as never)
    await fetchLineupImage('record-1')
    expect(get).toHaveBeenCalledWith('/lineup/records/record-1/image', { responseType: 'blob' })
  })
})
