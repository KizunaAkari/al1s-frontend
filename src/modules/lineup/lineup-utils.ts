import type {
  LineupDetail,
  LineupResult,
  LineupSide,
  LineupSlot,
  LineupState,
  LineupStudentIds,
} from '../../shared/api/lineup'
import { lineupExportSlots } from './lineup-export-slots'

export const LINEUP_SLOTS_PER_SIDE = 6
export const LINEUP_TOTAL_SLOTS = LINEUP_SLOTS_PER_SIDE * 2

export function isLineupPollingState(state: LineupState | null | undefined): boolean {
  return state === 'waiting' || state === 'queued' || state === 'running'
}

export function emptyLineupReview(): LineupStudentIds {
  return [null, null, null, null, null, null, null, null, null, null, null, null]
}

export function sideOffset(side: LineupSide): number {
  return side === 'attack' ? 0 : LINEUP_SLOTS_PER_SIDE
}

export function reviewForSide(review: readonly (number | null)[], side: LineupSide, count = LINEUP_SLOTS_PER_SIDE): Array<number | null> {
  const offset = sideOffset(side)
  return Array.from({ length: count }, (_, index) => review[offset + index] ?? null)
}

export function isValidUniqueSide(review: readonly (number | null)[], side: LineupSide, count = LINEUP_SLOTS_PER_SIDE): boolean {
  if (!Number.isInteger(count) || count < 1 || count > 6) return false
  const ids = reviewForSide(review, side, count)
  return ids.every((id): id is number => typeof id === 'number') && new Set(ids).size === count
}

export function canCopySide(
  review: readonly (number | null)[],
  side: LineupSide,
  saved: boolean,
  available = true,
  count = LINEUP_SLOTS_PER_SIDE,
): boolean {
  return available && saved && isValidUniqueSide(review, side, count)
    && lineupExportSlots(reviewForSide(review, side, count) as number[]) !== null
}

export function buildSideCopyText(
  review: readonly (number | null)[],
  side: LineupSide,
  saved: boolean,
  available = true,
  count = LINEUP_SLOTS_PER_SIDE,
): string | null {
  if (!canCopySide(review, side, saved, available, count)) return null
  return lineupExportSlots(reviewForSide(review, side, count) as number[])!.join(',')
}

export function buildPairCopyText(
  review: readonly (number | null)[],
  saved: boolean,
  availableSides?: readonly LineupSide[],
  sizes?: Partial<Record<LineupSide, number>>,
): string | null {
  const attackAvailable = !availableSides || availableSides.includes('attack')
  const defenseAvailable = !availableSides || availableSides.includes('defense')
  const attack = buildSideCopyText(review, 'attack', saved, attackAvailable, sizes?.attack ?? 6)
  const defense = buildSideCopyText(review, 'defense', saved, defenseAvailable, sizes?.defense ?? 6)
  return attack && defense ? `${attack}\t${defense}` : null
}

export function slotAt(slots: readonly LineupSlot[], side: LineupSide, index: number): LineupSlot | null {
  return slots.find((slot) => slot.side === side && slot.index === index) ?? null
}

/** v3 adds decision fields while v1/v2 retain only the legacy agreed field. */
export function isV3LineupResult(result: Pick<LineupResult, 'model_version' | 'slots' | 'teams'> | null | undefined): boolean {
  if (!result) return false
  if (Array.isArray(result.teams)) return true
  if (result.model_version.endsWith('-v3')) return true
  return result.slots.some((slot) => (
    slot.present !== undefined
    || slot.selected_id !== undefined
    || slot.accepted !== undefined
    || slot.evidence !== undefined
  ))
}

/** Return the sides the v3 result says are present; legacy results contain both sides. */
export function availableSidesForResult(result: LineupResult | null | undefined): LineupSide[] {
  if (!result || !isV3LineupResult(result)) return ['attack', 'defense']
  if (Array.isArray(result.teams)) {
    return Array.from(new Set(result.teams.filter((side): side is LineupSide => side === 'attack' || side === 'defense')))
  }
  return (['attack', 'defense'] as const).filter((side) => (
    result.slots.some((slot) => slot.side === side && slot.present !== false)
  ))
}

export function isSideAvailable(
  detail: Pick<LineupDetail, 'result'> | null,
  side: LineupSide,
): boolean {
  return availableSidesForResult(detail?.result).includes(side)
}

export function hasCompleteAgreedLayout(detail: Pick<LineupDetail, 'result'> | null): boolean {
  const result = detail?.result
  if (!result || !result.layout_valid || result.slots.length !== LINEUP_TOTAL_SLOTS) return false
  for (const side of ['attack', 'defense'] as const) {
    for (let index = 0; index < LINEUP_SLOTS_PER_SIDE; index += 1) {
      const slot = slotAt(result.slots, side, index)
      if (!slot || !slot.agreed) return false
    }
  }
  return true
}

/** Prefer an explicit review; otherwise expose only safe machine defaults. */
export function initialReview(detail: LineupDetail): LineupStudentIds {
  if (detail.review?.length === LINEUP_TOTAL_SLOTS) {
    const review = [...detail.review] as LineupStudentIds
    if (isV3LineupResult(detail.result)) {
      for (const side of (['attack', 'defense'] as const)) {
        const count = teamSize(detail.result, side)
        const offset = sideOffset(side)
        for (let index = count; index < LINEUP_SLOTS_PER_SIDE; index += 1) review[offset + index] = null
      }
    }
    return review
  }
  return machineDefaultsForDetail(detail)
}

/**
 * Build the machine baseline without claiming that unresolved positions have
 * a student. Each position is independently eligible when the layout is
 * valid, both recognisers agreed, and they returned the same catalog ID.
 */
export function machineDefaultsForDetail(detail: Pick<LineupDetail, 'result'>): LineupStudentIds {
  const defaults = emptyLineupReview()
  const result = detail.result
  if (!result) return defaults
  if (isV3LineupResult(result)) {
    for (const slot of result.slots) {
      if (slot.present === false || slot.accepted !== true || slot.selected_id == null) continue
      defaults[sideOffset(slot.side) + slot.index] = slot.selected_id
    }
    return defaults
  }
  if (!result.layout_valid) return defaults
  for (const slot of result.slots) {
    if (!slot.agreed || slot.image_id === null || slot.image_id !== slot.ocr_id) continue
    defaults[sideOffset(slot.side) + slot.index] = slot.image_id
  }
  return defaults
}

export function reviewsEqual(
  left: readonly (number | null)[] | null,
  right: readonly (number | null)[] | null,
): boolean {
  if (!left || !right || left.length !== right.length) return left === right
  return left.every((value, index) => value === right[index])
}

export function teamSize(result: LineupResult | null | undefined, side: LineupSide): number {
  if (!availableSidesForResult(result).includes(side)) return 0
  return result?.team_sizes?.[side] ?? 6
}
