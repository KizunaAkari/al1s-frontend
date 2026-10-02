import { apiClient } from './client'

export type LineupState =
  | 'uploaded'
  | 'waiting'
  | 'queued'
  | 'running'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'

export type LineupSide = 'attack' | 'defense'
export type LineupSlotIndex = 0 | 1 | 2 | 3 | 4 | 5
export type LineupStudentId = number | null
export type LineupLayoutHint = 'auto' | 'attack' | 'defense' | 'left_attack' | 'right_attack'
export type LineupRecognitionMode = 'auto' | 'portrait' | 'text'
export type LineupRunOptions = {
  layout_hint?: LineupLayoutHint
  recognition_mode?: LineupRecognitionMode
}
export type LineupEvidence = 'dual' | 'portrait_only' | 'text_only' | 'conflict' | 'unresolved' | 'absent'
/** The response field is an array; the PUT payload below is fixed at 12 entries. */
export type LineupReview = LineupStudentId[]
export type LineupStudentIds = [
  LineupStudentId, LineupStudentId, LineupStudentId,
  LineupStudentId, LineupStudentId, LineupStudentId,
  LineupStudentId, LineupStudentId, LineupStudentId,
  LineupStudentId, LineupStudentId, LineupStudentId,
]

export type LineupCatalogStudent = {
  id: number
  name: string
  aliases: string[]
}

export type LineupCatalog = {
  version: string
  students: LineupCatalogStudent[]
}

export type LineupTerminal = {
  terminal_id: string
  display_name: string
  available: boolean
  reason: string | null
}

export type LineupSlot = {
  side: LineupSide
  index: LineupSlotIndex
  box: [number, number, number, number] | null
  ocr_text: string
  ocr_score?: number
  image_id: number | null
  ocr_id: number | null
  score: number
  margin: number
  agreed: boolean
  present?: boolean
  selected_id?: number | null
  accepted?: boolean
  ambiguous_ids?: number[]
  evidence?: LineupEvidence
}

export type LineupResult = {
  slots: LineupSlot[]
  layout_valid: boolean
  model_version: string
  attack_side?: 'left' | 'right' | null
  team_sizes?: Partial<Record<LineupSide, number>>
  teams?: LineupSide[]
  layout_hint?: LineupLayoutHint
  recognition_mode?: LineupRecognitionMode
  catalog_version: string
  elapsed_ms: number
}

export type LineupDetail = {
  id: string
  name: string
  width: number
  height: number
  catalog_version: string
  created_at: string
  task_id: string | null
  state: LineupState
  error_code: string | null
  result: LineupResult | null
  review: LineupReview | null
  row_version: number
  layout_hint?: LineupLayoutHint
  recognition_mode?: LineupRecognitionMode
}

export type LineupRecordsPage = {
  items: LineupDetail[]
  next_cursor: string | null
}

export async function fetchLineupCatalog(): Promise<LineupCatalog> {
  return (await apiClient.get<LineupCatalog>('/lineup/catalog')).data
}

export async function fetchLineupTerminals(): Promise<{ items: LineupTerminal[] }> {
  return (await apiClient.get<{ items: LineupTerminal[] }>('/lineup/terminals')).data
}

export async function createLineupRecord(file: Blob & { name?: string }): Promise<LineupDetail> {
  const contentType = file.type === 'image/jpeg' || file.type === 'image/png' ? file.type : undefined
  return (await apiClient.post<LineupDetail>('/lineup/records', file, {
    params: { name: file.name ?? 'lineup-image' },
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    timeout: 30_000,
  })).data
}

export async function fetchLineupRecords(cursor: string | null = null): Promise<LineupRecordsPage> {
  return (await apiClient.get<LineupRecordsPage>('/lineup/records', {
    params: { cursor: cursor ?? undefined },
  })).data
}

export async function fetchLineupRecord(recordId: string): Promise<LineupDetail> {
  return (await apiClient.get<LineupDetail>(`/lineup/records/${encodeURIComponent(recordId)}`)).data
}

export async function fetchLineupRecordsByIds(recordIds: string[]): Promise<{
  items: LineupDetail[]; missing_ids: string[]
}> {
  return (await apiClient.post('/lineup/records/query', { record_ids: recordIds })).data
}

export async function fetchLineupImage(recordId: string): Promise<Blob> {
  return (await apiClient.get<Blob>(`/lineup/records/${encodeURIComponent(recordId)}/image`, {
    responseType: 'blob',
  })).data
}

export async function runLineupRecord(
  recordId: string,
  terminalId: string,
  options: LineupRunOptions = {},
): Promise<LineupDetail> {
  const body: { terminal_id: string } & LineupRunOptions = { terminal_id: terminalId, ...options }
  return (await apiClient.post<LineupDetail>(
    `/lineup/records/${encodeURIComponent(recordId)}/run`,
    body,
  )).data
}

export async function reviewLineupRecord(
  recordId: string,
  expectedVersion: number,
  studentIds: LineupStudentIds,
): Promise<LineupDetail> {
  return (await apiClient.put<LineupDetail>(
    `/lineup/records/${encodeURIComponent(recordId)}/review`,
    { expected_version: expectedVersion, student_ids: studentIds },
  )).data
}
