import { lineupExportSlots } from './lineup-export-slots'
import type {
  AnnotationSlot,
  UsableResult,
  UsableResultSlot,
  WorkspaceDetail,
} from '../../shared/api/lineup-workspace'
import type { LineupSide } from '../../shared/api/lineup'

export type WorkspaceCodes = {
  attack: string | null
  defense: string | null
  pair: string | null
}

function isStudentId(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0
}

function codeForIds(ids: Array<number | null | undefined>): string | null {
  const values = ids.filter(isStudentId)
  if (values.length !== ids.length || new Set(values).size !== values.length) return null
  const expanded = lineupExportSlots(values)
  return expanded ? expanded.join(',') : null
}

function sideOffset(side: LineupSide): number {
  return side === 'attack' ? 0 : 6
}

function sourceFor(detail: WorkspaceDetail): UsableResult | null {
  return detail.usable_result ?? detail.result
}

function sideIsPresent(source: UsableResult | null, side: LineupSide): boolean {
  return !source?.teams || source.teams.includes(side)
}

function sideCount(source: UsableResult | null, side: LineupSide, fallback = 6): number {
  if (!sideIsPresent(source, side)) return 0
  const value = source?.team_sizes?.[side] ?? fallback
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 0
}

function annotationIds(annotation: NonNullable<WorkspaceDetail['annotation']>, side: LineupSide): Array<number | null> | null {
  const countValue = annotation.teams[side]
  if (typeof countValue !== 'number' || !Number.isInteger(countValue) || countValue < 1 || countValue > 6) return null
  const count = countValue
  const slots = new Map<number, AnnotationSlot>()
  for (const slot of annotation.slots) {
    if (slot.side !== side) continue
    if (slots.has(slot.index)) return null
    slots.set(slot.index, slot)
  }
  const ids: Array<number | null> = []
  for (let index = 0; index < count; index += 1) {
    const slot = slots.get(index)
    if (!slot || !isStudentId(slot.student_id)) return null
    ids.push(slot.student_id)
  }
  return ids
}

function reviewIds(detail: WorkspaceDetail, side: LineupSide): Array<number | null> | null {
  if (!detail.review || detail.review.length !== 12) return null
  const source = sourceFor(detail)
  const count = sideCount(source, side)
  if (!count) return null
  const offset = sideOffset(side)
  return detail.review.slice(offset, offset + count)
}

function machineIds(detail: WorkspaceDetail, side: LineupSide): Array<number | null> | null {
  const source = sourceFor(detail)
  if (!source?.layout_valid) return null
  const count = sideCount(source, side)
  if (!count) return null
  const slots = new Map<number, UsableResultSlot>()
  for (const slot of source.slots) {
    if (slot.side !== side) continue
    if (slots.has(slot.index)) return null
    slots.set(slot.index, slot)
  }
  const ids: Array<number | null> = []
  for (let index = 0; index < count; index += 1) {
    const slot = slots.get(index)
    if (!slot) return null
    const id = slot.accepted === true
      ? slot.selected_id ?? slot.student_id
      : slot.agreed === true
        ? slot.image_id ?? slot.student_id ?? slot.selected_id
        : null
    if (!isStudentId(id)) return null
    ids.push(id)
  }
  return ids
}

function sideCode(detail: WorkspaceDetail, side: LineupSide): string | null {
  const annotation = detail.annotation
  if (annotation) {
    if (annotation.state !== 'confirmed') return null
    return codeForIds(annotationIds(annotation, side) ?? [])
  }
  if (detail.state === 'failure' || detail.state === 'timed_out') return null
  if (detail.review?.length === 12) return codeForIds(reviewIds(detail, side) ?? [])
  return codeForIds(machineIds(detail, side) ?? [])
}

export function workspaceCodes(detail: WorkspaceDetail): WorkspaceCodes {
  const attack = sideCode(detail, 'attack')
  const defense = sideCode(detail, 'defense')
  return {
    attack,
    defense,
    pair: attack && defense ? `${attack}\t${defense}` : null,
  }
}
