import { apiClient } from './client'
import type {
  LineupDetail,
  LineupLayoutHint,
  LineupRecognitionMode,
  LineupRunOptions,
  LineupSide,
} from './lineup'

export type AnnotationRegion = {
  kind: 'portrait' | 'name'
  box: [number, number, number, number]
}

export type AnnotationSlot = {
  side: LineupSide
  index: number
  student_id: number | null
  regions: AnnotationRegion[]
}

export type AnnotationDocument = {
  teams: Partial<Record<LineupSide, number>>
  slots: AnnotationSlot[]
}

export type SavedAnnotation = AnnotationDocument & {
  record_id: string
  version: number
  state: 'draft' | 'confirmed'
  updated_at: string
}

export type UsableResultSlot = {
  side: LineupSide
  index: number
  student_id?: number | null
  selected_id?: number | null
  accepted?: boolean
  image_id?: number | null
  agreed?: boolean
  box?: [number, number, number, number] | null
}

export type UsableResult = {
  layout_valid: boolean
  teams?: LineupSide[]
  team_sizes?: Partial<Record<LineupSide, number>>
  slots: UsableResultSlot[]
  source?: string
}

export type WorkspaceDetail = LineupDetail & {
  annotation: SavedAnnotation | null
  needs_attention: boolean
  attention_reason: string
  ordinal?: number
  usable_result: UsableResult | null
}

export type LineupTaskSummary = {
  total: number
  finished: number
  usable: number
  needs_attention: number
  failure: number
  running: number
}

export type LineupTask = {
  task_id: string
  name: string
  lifecycle_status: string
  created_at: string
  row_version: number
  retry_source_task_id: string | null
  terminal_id: string
  options: LineupRunOptions
  summary: LineupTaskSummary
  items: WorkspaceDetail[]
  next_cursor: number | null
}

export type LineupTaskSummaryItem = Omit<LineupTask, 'items' | 'next_cursor'>

export type AnnotationTasksPage = {
  items: LineupTaskSummaryItem[]
  next_cursor: string | null
}

export type SubmitLineupTaskResponse = {
  task_id: string
}

export async function submitLineupTask(
  recordIds: string[],
  terminalId: string,
  options: LineupRunOptions,
  idempotencyKey: string,
): Promise<SubmitLineupTaskResponse> {
  const body = {
    record_ids: recordIds,
    terminal_id: terminalId,
    layout_hint: options.layout_hint ?? 'auto' as LineupLayoutHint,
    recognition_mode: options.recognition_mode ?? 'auto' as LineupRecognitionMode,
    idempotency_key: idempotencyKey,
  }
  return (await apiClient.post<SubmitLineupTaskResponse>('/lineup/tasks', body)).data
}

export async function fetchLineupTask(
  taskId: string,
  after = 0,
  category: 'all' | 'usable' | 'attention' | 'failure' = 'all',
): Promise<LineupTask> {
  return (await apiClient.get<LineupTask>(`/lineup/tasks/${encodeURIComponent(taskId)}`, {
    params: { after, category },
  })).data
}

export async function retryLineupTask(taskId: string, idempotencyKey: string): Promise<SubmitLineupTaskResponse> {
  return (await apiClient.post<SubmitLineupTaskResponse>(
    `/lineup/tasks/${encodeURIComponent(taskId)}/retry`,
    { idempotency_key: idempotencyKey },
  )).data
}

export async function fetchAnnotationTasks(cursor: string | null = null): Promise<AnnotationTasksPage> {
  return (await apiClient.get<AnnotationTasksPage>('/lineup/annotation-tasks', {
    params: { cursor: cursor ?? undefined },
  })).data
}

export async function fetchLineupAnnotation(recordId: string, taskId?: string): Promise<WorkspaceDetail> {
  return (await apiClient.get<WorkspaceDetail>(
    `/lineup/records/${encodeURIComponent(recordId)}/annotation`,
    { params: { task_id: taskId ?? undefined } },
  )).data
}

export async function saveLineupAnnotation(
  recordId: string,
  expectedVersion: number,
  document: AnnotationDocument,
): Promise<WorkspaceDetail> {
  return (await apiClient.put<WorkspaceDetail>(
    `/lineup/records/${encodeURIComponent(recordId)}/annotation`,
    { expected_version: expectedVersion, ...document },
  )).data
}

export async function exportLineupAnnotation(recordId: string): Promise<Blob> {
  return (await apiClient.get<Blob>(
    `/lineup/records/${encodeURIComponent(recordId)}/annotation/export`,
    { responseType: 'blob' },
  )).data
}
