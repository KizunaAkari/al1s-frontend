import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { MaaScript } from '../../../shared/api/maa'
import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
import { deleteDraft, readDraft, writeDraft, type EditorDraft, type HistoryMetadata } from './editor-draft'
import { appendHistory, restoreHistory } from './editor-history'
import { createLatestWriteQueue } from './latest-write-queue'
import { sameDocument } from './document-equality'

type RecoveryState = 'loading' | 'ready' | 'invalid' | 'conflict'
type DraftContext = {
  previewVersionId?: () => string | undefined
  selectPreviewVersion?: (version: string | undefined) => void
  scriptId: () => string
  script: Ref<MaaScript | undefined>
  document: Ref<ScriptDocument | undefined>
  config: () => { document: ScriptDocument; step: number } | undefined
  unsaved: () => boolean
  uploading: () => boolean
  edited: () => void
}

export function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

/** Own recovery permission and all automatic writes to the single local record. */
export function useEditorDrafts(context: DraftContext) {
  const history = shallowRef<ScriptDocument[]>([])
  const historyMetadata = shallowRef<HistoryMetadata[]>([])
  const protectedDraft = shallowRef<EditorDraft>()
  const historyCursor = ref(0)
  const draftError = ref('')
  const recoveryState = ref<RecoveryState>('loading')
  let timer: ReturnType<typeof setTimeout> | undefined
  let discarding = false
  let disposed = false
  let generation = 0
  let writeFailed = false
  const writer = createLatestWriteQueue(async (snapshot: EditorDraft) => {
    await writeDraft(snapshot)
    writeFailed = false
  }, () => {
    writeFailed = true
    draftError.value = '草稿存储失败，请尽快保存脚本'
  })

  function clearDraftTimer() { clearTimeout(timer) }
  function beginLoad() {
    generation++
    clearDraftTimer()
    recoveryState.value = 'loading'
    draftError.value = ''
    protectedDraft.value = undefined
    discarding = false
  }
  function initialize(document: ScriptDocument) {
    history.value = [cloneJson(document)]
    historyMetadata.value = [{ time: Date.now(), versionId: context.script.value?.current_version_id ?? undefined }]
    historyCursor.value = 0
  }
  async function read(): Promise<EditorDraft | undefined> {
    const request = generation
    await writer.wait()
    try {
      const draft = await readDraft(context.scriptId())
      if (disposed || request !== generation) return undefined
      if (draft && draft.baseRowVersion !== context.script.value?.row_version) {
        if (sameDocument(draft.history[draft.cursor], context.document.value) &&
          (!draft.configDocument || sameDocument(draft.configDocument, context.document.value))) {
          recoveryState.value = 'ready'
          return { ...draft, baseRowVersion: context.script.value!.row_version }
        }
        protectedDraft.value = cloneJson(draft)
        recoveryState.value = 'conflict'
        draftError.value = '服务器脚本已更新，本地历史基于旧版本；为避免覆盖新内容，未自动恢复。草稿仍保留在本机。'
        return undefined
      }
      if (!draft) recoveryState.value = 'ready'
      return draft
    } catch (cause) {
      if (disposed || request !== generation) return undefined
      recoveryState.value = 'invalid'
      draftError.value = cause instanceof Error ? cause.message : '本地草稿存储不可用，原草稿不会被自动覆盖'
      return undefined
    }
  }
  function restore(draft: EditorDraft) {
    history.value = cloneJson(draft.history)
    historyCursor.value = draft.cursor
    historyMetadata.value = cloneJson(draft.historyMetadata ?? draft.history.map(() => ({ time: null })))
    context.selectPreviewVersion?.(historyMetadata.value[draft.cursor]?.versionId)
    recoveryState.value = 'ready'
  }
  function persistDraft(): Promise<void> {
    if (disposed || discarding || recoveryState.value !== 'ready' ||
      !context.document.value || !context.script.value || !history.value.length) return writer.wait()
    const config = context.config()
    return writer.enqueue({
      scriptId: context.scriptId(), baseRowVersion: context.script.value.row_version,
      history: history.value, cursor: historyCursor.value, updatedAt: Date.now(),
      historyMetadata: historyMetadata.value,
      configDocument: config ? cloneJson(config.document) : undefined,
      configStep: config?.step,
    })
  }
  function scheduleDraft() {
    clearDraftTimer()
    timer = setTimeout(() => { void persistDraft() }, 250)
  }
  function checkpoint() {
    if (!context.document.value) return
    const next = appendHistory(history.value, historyCursor.value, context.document.value)
    historyMetadata.value = [...historyMetadata.value.slice(0, historyCursor.value + 1),
      { time: Date.now(), versionId: context.previewVersionId?.() ?? context.script.value?.current_version_id ?? undefined }].slice(-50)
    history.value = next.snapshots
    historyCursor.value = next.cursor
    scheduleDraft()
  }
  function travel(index: number) {
    const snapshot = restoreHistory(history.value, index)
    if (!snapshot) return
    historyCursor.value = index
    context.document.value = snapshot
    context.selectPreviewVersion?.(historyMetadata.value[index]?.versionId)
    context.edited()
    scheduleDraft()
  }
  function restoreSnapshot(snapshot: ScriptDocument, versionId?: string) {
    if (context.document.value && !sameDocument(history.value.at(-1), context.document.value)) {
      history.value = [...history.value, cloneJson(context.document.value)]
      historyMetadata.value = [...historyMetadata.value,
        { ...historyMetadata.value[historyCursor.value]!, time: Date.now() }]
    }
    history.value = [...history.value, cloneJson(snapshot)].slice(-50)
    historyMetadata.value = [...historyMetadata.value, { time: Date.now(), versionId }].slice(-50)
    historyCursor.value = history.value.length - 1
    context.document.value = cloneJson(snapshot)
    context.selectPreviewVersion?.(versionId)
    context.edited()
    scheduleDraft()
  }
  function markSaved() {
    if (recoveryState.value === 'conflict' && protectedDraft.value && context.document.value) {
      const previous = protectedDraft.value
      const entries = [
        ...previous.history.map((document, index) => ({ document,
          metadata: previous.historyMetadata?.[index] ?? { time: null } })),
        ...history.value.map((document, index) => ({ document,
          metadata: historyMetadata.value[index] ?? { time: null } })),
      ]
      if (!sameDocument(entries.at(-1)?.document, context.document.value)) {
        entries.push({ document: cloneJson(context.document.value), metadata: { time: Date.now() } })
      }
      const retained = entries.slice(-50)
      history.value = cloneJson(retained.map(item => item.document))
      historyMetadata.value = cloneJson(retained.map(item => item.metadata))
      historyCursor.value = retained.length - 1
      protectedDraft.value = undefined
      recoveryState.value = 'ready'
      draftError.value = ''
    }
    historyMetadata.value = historyMetadata.value.map((item, index) => index === historyCursor.value
      ? { ...item, versionId: context.script.value?.current_version_id ?? undefined } : item)
  }
  async function discardOriginal() {
    clearDraftTimer()
    await writer.wait()
    try { await deleteDraft(context.scriptId()) }
    catch (cause) {
      recoveryState.value = 'invalid'
      throw cause
    }
    recoveryState.value = 'ready'
    draftError.value = ''
    protectedDraft.value = undefined
    writeFailed = false
  }
  async function preserveBeforeLeave(): Promise<boolean> {
    clearDraftTimer()
    if (recoveryState.value !== 'ready' && context.unsaved()) {
      draftError.value = '原草稿无法安全恢复，当前修改未自动暂存；请先保存到平台或明确舍弃旧草稿。'
      return false
    }
    await persistDraft()
    return !(context.unsaved() && writeFailed)
  }
  async function discardForLeave() {
    clearDraftTimer()
    await writer.wait()
    // Discarding new edits is not permission to destroy an unreadable older record.
    if (recoveryState.value === 'ready') await deleteDraft(context.scriptId())
    discarding = true
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (context.unsaved() || context.uploading()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    clearDraftTimer()
    void persistDraft()
    disposed = true
    generation++
  })
  return {
    history, historyMetadata, protectedDraft, historyCursor, draftError, recoveryState, beginLoad, initialize, read, restore,
    restoreSnapshot, markSaved,
    checkpoint, travel, scheduleDraft, clearDraftTimer, persistDraft, discardOriginal,
    preserveBeforeLeave, discardForLeave,
  }
}
