export interface EditorResume {
  scriptId: string
  deviceId?: string
  step: number
  restoreDraft?: boolean
}

const KEY = 'al1s.editor.resume'

export function readEditorResume(): EditorResume | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return undefined
    const record = value as Record<string, unknown>
    if (typeof record.scriptId !== 'string' || !record.scriptId) return undefined
    return {
      scriptId: record.scriptId,
      deviceId: typeof record.deviceId === 'string' ? record.deviceId : undefined,
      step: typeof record.step === 'number' && Number.isInteger(record.step) && record.step > 0 ? record.step : 1,
      restoreDraft: record.restoreDraft === true,
    }
  } catch { return undefined }
}

export function writeEditorResume(value: EditorResume): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)) } catch { /* Storage can be disabled. */ }
}

export function clearEditorResume(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* Storage can be disabled. */ }
}
