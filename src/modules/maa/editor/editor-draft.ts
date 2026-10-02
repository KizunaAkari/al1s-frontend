import { parseScriptDocument, type ScriptDocument } from '../../../shared/api/maa-script-contract'

export interface EditorDraft {
  historyMetadata?: HistoryMetadata[]
  scriptId: string
  baseRowVersion: number
  history: ScriptDocument[]
  cursor: number
  updatedAt: number
  configDocument?: ScriptDocument
  configStep?: number
}
export type HistoryMetadata = { time: number | null; versionId?: string }

const DB_NAME = 'al1s-editor-drafts'
const STORE = 'drafts'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'scriptId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      let value: T
      request.onsuccess = () => { value = request.result }
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export function validateEditorDraft(value: unknown, scriptId: string): EditorDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('本地草稿格式无效，草稿仍保留在本机')
  const draft = value as EditorDraft
  if (draft.scriptId !== scriptId || !Array.isArray(draft.history) ||
    !Number.isInteger(draft.cursor) || draft.cursor < 0 || draft.cursor >= draft.history.length)
    throw new Error('本地草稿格式无效，草稿仍保留在本机')
  try {
    draft.history.forEach(parseScriptDocument)
    if (draft.configDocument) parseScriptDocument(draft.configDocument)
  } catch {
    throw new Error('本地草稿含无效脚本字段，草稿仍保留在本机')
  }
  if (draft.historyMetadata !== undefined && (!Array.isArray(draft.historyMetadata) ||
    draft.historyMetadata.length !== draft.history.length || draft.historyMetadata.some(item =>
      !item || (item.time !== null && (typeof item.time !== 'number' || !Number.isFinite(item.time))) ||
      (item.versionId !== undefined && typeof item.versionId !== 'string'))))
    throw new Error('本地历史信息无效，草稿仍保留在本机')
  return draft
}

export async function readDraft(scriptId: string): Promise<EditorDraft | undefined> {
  const draft = await transaction('readonly', store => store.get(scriptId) as IDBRequest<EditorDraft | undefined>)
  return draft ? validateEditorDraft(draft, scriptId) : undefined
}

export function writeDraft(draft: EditorDraft): Promise<IDBValidKey> {
  validateEditorDraft(draft, draft.scriptId)
  return transaction('readwrite', store => store.put(draft))
}

export function deleteDraft(scriptId: string): Promise<undefined> {
  return transaction('readwrite', store => store.delete(scriptId))
}
