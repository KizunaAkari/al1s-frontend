import type { LineupSide } from '../../shared/api/lineup'
import type { AnnotationDocument, AnnotationRegion, WorkspaceDetail } from '../../shared/api/lineup-workspace'
import { availableSidesForResult, initialReview, teamSize } from './lineup-utils'

export function cloneAnnotation(doc: AnnotationDocument): AnnotationDocument {
  return JSON.parse(JSON.stringify({ teams: doc.teams, slots: doc.slots })) as AnnotationDocument
}

export function annotationFromDetail(detail: WorkspaceDetail): AnnotationDocument {
  if (detail.annotation) return cloneAnnotation(detail.annotation)
  const doc: AnnotationDocument = { teams: {}, slots: [] }
  if (!detail.result) return doc
  const ids = initialReview(detail)
  for (const side of availableSidesForResult(detail.result)) {
    const count = teamSize(detail.result, side)
    if (!count) continue
    doc.teams[side] = count
    for (let index = 0; index < count; index++) {
      const slot = detail.result.slots.find(s => s.side === side && s.index === index)
      doc.slots.push({ side, index, student_id: ids[index + (side === 'attack' ? 0 : 6)] ?? null,
        regions: slot?.box ? [{ kind: detail.recognition_mode === 'text' ? 'name' : 'portrait', box: [...slot.box] }] : [] })
    }
  }
  return doc
}

export function resizeTeam(doc: AnnotationDocument, side: LineupSide, count: number): AnnotationDocument {
  const next = cloneAnnotation(doc)
  if (!Number.isInteger(count) || count < 0 || count > 6) return next
  if (count) next.teams[side] = count
  else delete next.teams[side]
  next.slots = next.slots.filter(s => s.side !== side || s.index < count)
  for (let index = 0; index < count; index++) {
    if (!next.slots.some(s => s.side === side && s.index === index)) next.slots.push({ side, index, student_id: null, regions: [] })
  }
  next.slots.sort((a, b) => a.side === b.side ? a.index - b.index : a.side === 'attack' ? -1 : 1)
  return next
}

export function updateRegion(doc: AnnotationDocument, key: string, box: AnnotationRegion['box'] | null): AnnotationDocument {
  const next = cloneAnnotation(doc)
  const [side, index, kind] = key.split('-')
  const slot = next.slots.find(s => s.side === side && s.index === Number(index))
  if (!slot || (kind !== 'portrait' && kind !== 'name')) return next
  slot.regions = slot.regions.filter(r => r.kind !== kind)
  if (box) slot.regions.push({ kind, box: [...box] })
  return next
}
