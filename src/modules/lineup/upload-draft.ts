/** Browser-local file bodies, isolated by the current tab's refresh-stable ID. */
export interface UploadDraftStore {
  load(): Promise<File[]>
  save(files: File[]): Promise<void>
}
export const uploadFileKey = (file: File) => `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`
type StoredFile = { draft: string; key: string; body: Blob; name: string; path: string; modified: number }
const STORE = 'files'

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('al1s-lineup-upload-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ['draft', 'key'] })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const value = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(value())
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export function createUploadDraftStore(): UploadDraftStore | null {
  if (typeof indexedDB === 'undefined') return null
  let draft: string
  try {
    draft = sessionStorage.getItem('al1s-lineup-draft-id') || crypto.randomUUID()
    sessionStorage.setItem('al1s-lineup-draft-id', draft)
  } catch { return null }
  let saved = new Map<string, File>()
  return {
    async load() {
      const records = await transaction('readonly', store => {
        const request = store.getAll(IDBKeyRange.bound([draft], [draft, []]), 201)
        return () => request.result as StoredFile[]
      })
      if (records.length > 200) throw new Error('本地图片数量超出限制')
      const files = records.map(record => {
        if (!(record.body instanceof Blob) || typeof record.name !== 'string' || typeof record.path !== 'string') throw new Error('本地图片暂存无效')
        const file = new File([record.body], record.name, { type: record.body.type, lastModified: record.modified })
        Object.defineProperty(file, 'webkitRelativePath', { value: record.path })
        return file
      }).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'zh-CN', { numeric: true }))
      saved = new Map(files.map(file => [uploadFileKey(file), file]))
      return files
    },
    async save(files) {
      if (files.length > 200) throw new Error('每批最多200张')
      const next = new Map(files.map(file => [uploadFileKey(file), file]))
      await transaction('readwrite', store => {
        if (!files.length) store.delete(IDBKeyRange.bound([draft], [draft, []]))
        else {
          for (const key of saved.keys()) if (!next.has(key)) store.delete([draft, key])
          for (const [key, file] of next) if (saved.get(key) !== file) {
            store.put({ draft, key, body: file, name: file.name, path: file.webkitRelativePath || '', modified: file.lastModified } satisfies StoredFile)
          }
        }
        return () => undefined
      })
      saved = next
    },
  }
}
