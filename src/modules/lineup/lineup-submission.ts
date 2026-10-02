/** Frozen submissions survive navigation; file drafts also survive refresh. */
import { reactive } from 'vue'
import { createLineupRecord, type LineupRunOptions } from '../../shared/api/lineup'
import { submitLineupTask } from '../../shared/api/lineup-workspace'
import { createUploadDraftStore, uploadFileKey as fileKey, type UploadDraftStore } from './upload-draft'

type Settings = { terminalId: string; options: LineupRunOptions }
type Pending = Settings & { ids: string[]; key: string; names: string[] }
const STORAGE = 'al1s-lineup-submit-v1'
const UPLOADED = 'al1s-lineup-upload-refs-v1'

export function createLineupSubmission(draft: UploadDraftStore | null = createUploadDraftStore()) {
  const state = reactive({ files: [] as File[], busy: false, error: '', notice: '', taskId: '',
    restoring: Boolean(draft), savingDraft: false, draftNotice: '', draftFailed: false,
    pending: false, progress: null as { uploaded: number; total: number } | null })
  const uploaded = new Map<string, string>()
  let pending: Pending | null = null
  const cacheFailure = () => { state.draftFailed = true; state.draftNotice = '本机暂存失败，刷新可能丢失选择，请完成下发后再刷新。' }
  const ready = draft ? draft.load().then(files => {
    state.files = files; state.error = selectionError()
    if (files.length) state.draftNotice = '已恢复本机暂存的图片，刷新后仍可继续。'
  }).catch(cacheFailure).finally(() => { state.restoring = false }) : Promise.resolve()
  let saving = ready
  let generation = 0
  function persist() {
    if (!draft) { if (state.files.length) cacheFailure(); return }
    const files = [...state.files], current = ++generation
    state.savingDraft = true; state.draftNotice = '正在暂存图片…'
    saving = saving.then(() => draft.save(files)).then(() => {
      if (current !== generation) return
      state.draftFailed = false
      state.draftNotice = files.length ? '图片已暂存本机，刷新后可继续。' : ''
    }).catch(async () => {
      // Remove an older snapshot so deleted files cannot silently reappear.
      try { await draft.save([]) } catch { /* The warning remains visible. */ }
      if (current === generation) cacheFailure()
    }).finally(() => { if (current === generation) state.savingDraft = false })
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE) || 'null') as Pending | null
    if (typeof saved?.key === 'string' && typeof saved.terminalId === 'string' && saved.options && Array.isArray(saved.ids) && saved.ids.every(id => typeof id === 'string') && saved.ids.length <= 200 && saved.ids.length) {
      pending = saved; state.pending = true
      state.notice = `有 ${saved.ids.length} 张已上传图片需要确认下发结果，点击下发任务继续。`
    }
  } catch { /* A damaged browser hint never creates a task. */ }
  try {
    const refs: unknown = JSON.parse(sessionStorage.getItem(UPLOADED) || '[]')
    if (Array.isArray(refs) && refs.length <= 200) for (const entry of refs) {
      if (Array.isArray(entry) && entry.length === 2 && entry.every(v => typeof v === 'string') && entry[0].length <= 1024) uploaded.set(entry[0], entry[1])
    }
  } catch { /* Local upload references are optional; authoritative data is server-side. */ }

  function addFiles(files: File[]) {
    if (state.busy || state.pending || state.restoring) return
    const merged = new Map([...state.files, ...files].map(file => [fileKey(file), file]))
    state.error = ''
    if (merged.size > 200) { state.error = '每批最多 200 张图片'; return }
    state.files = [...merged.values()].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'zh-CN', { numeric: true }))
    state.error = selectionError()
    state.taskId = ''; state.notice = ''; state.progress = null
    persist()
  }

  function remove(index: number) {
    if (!state.busy && !state.pending && !state.restoring) { state.files.splice(index, 1); state.error = selectionError(); state.progress = null; persist() }
  }

  function clear() {
    if (state.busy || state.pending || state.restoring) return
    state.files = []; state.error = ''; state.notice = ''; state.progress = null
    uploaded.clear(); sessionStorage.removeItem(UPLOADED); persist()
  }

  function selectionError() {
    const invalid = state.files.find(file => !['image/png', 'image/jpeg'].includes(file.type) || file.size > 16 * 1024 * 1024)
    return invalid ? `${invalid.name}：仅支持不超过 16 MiB 的 PNG/JPEG，请移除此文件后下发。` : ''
  }

  async function submit(settings: Settings) {
    if (state.busy || state.restoring || (!pending && (!state.files.length || !settings.terminalId))) return
    if (!pending && selectionError()) { state.error = selectionError(); return }
    state.busy = true; state.error = ''; state.notice = ''; state.taskId = ''
    const frozen = { terminalId: settings.terminalId, options: { ...settings.options } }
    const files = [...state.files]
    try {
      if (!pending) {
        state.progress = { uploaded: 0, total: files.length }
        for (const file of files) {
          const key = fileKey(file)
          if (!uploaded.has(key)) {
            const name = (file.webkitRelativePath || file.name).slice(0, 160)
            const input = name === file.name ? file : new File([file], name, { type: file.type })
            uploaded.set(key, (await createLineupRecord(input)).id)
            try { sessionStorage.setItem(UPLOADED, JSON.stringify([...uploaded.entries()].slice(-200))) } catch { /* memory retains it */ }
          }
          state.progress.uploaded++
        }
        pending = { ...frozen, ids: files.map(f => uploaded.get(fileKey(f))!),
          names: files.map(f => f.name), key: crypto.randomUUID() }
        state.pending = true
        try { sessionStorage.setItem(STORAGE, JSON.stringify(pending)) } catch { /* in-memory key remains */ }
      }
      const result = await submitLineupTask(pending.ids, pending.terminalId, pending.options, pending.key)
      state.taskId = result.task_id
      state.notice = `已下发 ${pending.ids.length} 张图片，请到任务中心查看结果。`
      state.files = []; uploaded.clear(); persist()
      await saving
      // Keep the receipt until old file bodies are gone, including a reload mid-clear.
      if (!draft || !state.draftFailed) {
        pending = null; state.pending = false
        sessionStorage.removeItem(STORAGE)
        sessionStorage.removeItem(UPLOADED)
      }
    } catch (cause) {
      const status = (cause as { status?: number } | null)?.status
      if (status && status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status)) {
        pending = null; state.pending = false; sessionStorage.removeItem(STORAGE)
      }
      state.error = cause instanceof Error ? cause.message : '上传或下发失败，请重试'
      if (pending) state.error += '；再次下发会确认同一任务，不会重复创建。'
    } finally { state.busy = false }
  }
  return { state, addFiles, remove, clear, submit, ready, flushDraft: () => saving }
}

export const lineupSubmission = createLineupSubmission()
