import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { fetchScriptHistory, readScriptHistory, type ScriptHistoryVersion } from '../../../shared/api/maa-script-history'
import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
import type { EditorDraft, HistoryMetadata } from './editor-draft'
import { historyDifference } from './history-diff'
import { cloneJson } from './use-editor-drafts'

type Context = {
  scriptId: () => string; versionId: () => string | undefined
  document: Ref<ScriptDocument | undefined>; history: Ref<ScriptDocument[]>; metadata: Ref<HistoryMetadata[]>
  cursor: Ref<number>; protectedDraft: Ref<EditorDraft | undefined>
}
export function useEditorHistory(context: Context) {
  const versions = shallowRef<ScriptHistoryVersion[]>([]), selectedId = ref('')
  const selectedDocument = shallowRef<ScriptDocument>(), selectedVersion = ref<string>()
  const listLoading = ref(false), selectionLoading = ref(false), error = ref('')
  const next = ref<number | null>(null)
  let pageGeneration = 0, selectionGeneration = 0
  let pageController: AbortController | undefined, selectionController: AbortController | undefined
  const local = computed(() => context.history.value.map((document, index) => ({
    id: `local:${index}`, source: 'local' as const, label: index === 0 ? '初始状态' :
      historyDifference(context.history.value[index - 1]!, document).summary,
    time: context.metadata.value[index]?.time ?? null, steps: document.steps.length,
    current: index === context.cursor.value,
  })).reverse())
  const entries = computed(() => [...local.value,
    ...(context.protectedDraft.value?.history.map((document, index) => ({ id: `protected:${index}`,
      source: 'local' as const, label: `旧草稿 · 第 ${index + 1} 次修改`,
      time: context.protectedDraft.value?.historyMetadata?.[index]?.time ?? null, steps: document.steps.length,
    })).reverse() ?? []),
    ...versions.value.map(version => ({ id: `saved:${version.script_version_id}`, source: 'saved' as const,
      label: `版本 ${version.revision}`, time: Number.isFinite(Date.parse(version.created_at)) ? Date.parse(version.created_at) : null,
      current: version.script_version_id === context.versionId(),
    }))])
  async function select(id: string) {
    selectionController?.abort()
    const generation = ++selectionGeneration
    selectedId.value = id; selectedDocument.value = undefined; selectedVersion.value = undefined
    selectionLoading.value = false; error.value = ''
    const [kind, key] = id.split(':')
    if (kind === 'local' || kind === 'protected') {
      const index = Number(key), draft = context.protectedDraft.value
      const snapshot = kind === 'local' ? context.history.value[index] : draft?.history[index]
      if (!snapshot) return
      selectedDocument.value = cloneJson(snapshot)
      selectedVersion.value = (kind === 'local' ? context.metadata.value : draft?.historyMetadata)?.[index]?.versionId
      selectionLoading.value = false
      return
    }
    const version = versions.value.find(item => item.script_version_id === key)
    if (!version) return
    selectionController = new AbortController(); selectionLoading.value = true
    try {
      const document = await readScriptHistory(context.scriptId(), version.script_version_id, selectionController.signal)
      if (generation !== selectionGeneration) return
      selectedDocument.value = document; selectedVersion.value = version.script_version_id
    } catch (cause) {
      if (generation === selectionGeneration) error.value = cause instanceof Error ? cause.message : '读取历史失败'
    } finally { if (generation === selectionGeneration) selectionLoading.value = false }
  }
  async function load(reset = true) {
    if (listLoading.value && !reset) return
    pageController?.abort()
    const generation = ++pageGeneration
    pageController = new AbortController(); listLoading.value = true; error.value = ''
    if (reset) { versions.value = []; next.value = null; void select(`local:${context.cursor.value}`) }
    try {
      const page = await fetchScriptHistory(context.scriptId(), reset ? null : next.value, pageController.signal)
      if (generation !== pageGeneration) return
      const existing = new Set(versions.value.map(item => item.script_version_id))
      versions.value = [...versions.value, ...page.items.filter(item => !existing.has(item.script_version_id))]
      next.value = page.next_after_revision
    } catch (cause) {
      if (generation === pageGeneration) error.value = cause instanceof Error ? cause.message : '读取历史列表失败'
    } finally { if (generation === pageGeneration) listLoading.value = false }
  }
  function clear() {
    pageGeneration++; selectionGeneration++; pageController?.abort(); selectionController?.abort()
    listLoading.value = false; selectionLoading.value = false
  }
  watch(context.scriptId, clear)
  onBeforeUnmount(clear)
  const difference = computed(() => selectedDocument.value && context.document.value
    ? historyDifference(context.document.value, selectedDocument.value) : undefined)
  return { entries, selectedId, selectedDocument, selectedVersion, error, difference, select, load, cancel: clear,
    loading: computed(() => listLoading.value || selectionLoading.value), more: computed(() => next.value !== null) }
}
