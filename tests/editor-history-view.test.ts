import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'
import type { EditorDraft, HistoryMetadata } from '../src/modules/maa/editor/editor-draft'

const historyApi = vi.hoisted(() => ({
  fetch: vi.fn(),
  read: vi.fn(),
}))

vi.mock('../src/shared/api/maa-script-history', () => ({
  fetchScriptHistory: historyApi.fetch,
  readScriptHistory: historyApi.read,
}))

import { useEditorHistory } from '../src/modules/maa/editor/use-editor-history'

const documentWith = (action: string, fields: Record<string, unknown> = {}): ScriptDocument => ({
  version: 2,
  steps: [{ action, ...fields }],
})

const version = (id: string, revision: number) => ({
  script_version_id: id,
  revision,
  created_at: '2026-01-02T03:04:05Z',
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

type HistoryView = ReturnType<typeof useEditorHistory>

function editorView(options: {
  history?: ScriptDocument[]
  metadata?: HistoryMetadata[]
  cursor?: number
  protectedDraft?: EditorDraft
} = {}): {
  wrapper: VueWrapper
  view: HistoryView
  document: Ref<ScriptDocument | undefined>
  protectedDraft: Ref<EditorDraft | undefined>
} {
  const document = ref<ScriptDocument | undefined>(documentWith('wait', { seconds: 9 }))
  const history = ref<ScriptDocument[]>(options.history ?? [documentWith('wait', { seconds: 1 })])
  const metadata = ref<HistoryMetadata[]>(options.metadata ?? [{ time: 10, versionId: 'local-version' }])
  const cursor = ref(options.cursor ?? 0)
  const protectedDraft = ref<EditorDraft | undefined>(options.protectedDraft)
  let view!: HistoryView
  const Harness = defineComponent({
    setup() {
      view = useEditorHistory({
        scriptId: () => 'script-1',
        versionId: () => 'saved-current',
        document,
        history,
        metadata,
        cursor,
        protectedDraft,
      })
      return () => null
    },
  })
  const wrapper = mount(Harness)
  return { wrapper, view, document, protectedDraft }
}

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  historyApi.fetch.mockReset()
  historyApi.read.mockReset()
})

describe('useEditorHistory', () => {
  it('keeps local and protected selections read-only and uses metadata timestamps', async () => {
    const protectedDraft: EditorDraft = {
      scriptId: 'script-1',
      baseRowVersion: 1,
      history: [documentWith('home')],
      cursor: 0,
      updatedAt: 1,
      historyMetadata: [{ time: null, versionId: 'protected-version' }],
    }
    const { wrapper, view, document } = editorView({
      history: [documentWith('wait', { seconds: 1 }), documentWith('back')],
      metadata: [{ time: 101 }, { time: null }],
      cursor: 1,
      protectedDraft,
    })
    const original = document.value

    expect(view.entries.value.find(entry => entry.id === 'local:0')?.time).toBe(101)
    expect(view.entries.value.find(entry => entry.id === 'local:1')?.time).toBeNull()
    expect(view.entries.value.find(entry => entry.id === 'protected:0')?.time).toBeNull()

    await view.select('local:0')
    expect(document.value).toBe(original)
    expect(view.selectedDocument.value).toEqual(documentWith('wait', { seconds: 1 }))
    expect(view.selectedDocument.value).not.toBe(original)

    await view.select('protected:0')
    expect(document.value).toBe(original)
    expect(view.selectedDocument.value).toEqual(documentWith('home'))
    expect(historyApi.read).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('loads a saved manifest only for the selected version and never preloads during paging', async () => {
    historyApi.fetch
      .mockResolvedValueOnce({ items: [version('v1', 1), version('v2', 2)], next_after_revision: 2 })
      .mockResolvedValueOnce({ items: [version('v2', 2), version('v3', 3)], next_after_revision: null })
    const { wrapper, view, document } = editorView()
    const original = document.value

    await view.load()
    expect(historyApi.read).not.toHaveBeenCalled()
    await view.load(false)
    expect(historyApi.read).not.toHaveBeenCalled()
    expect(view.entries.value.filter(entry => entry.source === 'saved').map(entry => entry.id))
      .toEqual(['saved:v1', 'saved:v2', 'saved:v3'])
    expect(historyApi.fetch).toHaveBeenNthCalledWith(1, 'script-1', null, expect.any(AbortSignal))
    expect(historyApi.fetch).toHaveBeenNthCalledWith(2, 'script-1', 2, expect.any(AbortSignal))

    const savedDocument = documentWith('tap', { x: 12, y: 24 })
    historyApi.read.mockResolvedValue(savedDocument)
    await view.select('saved:v2')
    expect(historyApi.read).toHaveBeenCalledOnce()
    expect(historyApi.read).toHaveBeenCalledWith('script-1', 'v2', expect.any(AbortSignal))
    expect(view.selectedDocument.value).toBe(savedDocument)
    expect(document.value).toBe(original)
    wrapper.unmount()
  })

  it('aborts the previous saved request and ignores its late response', async () => {
    historyApi.fetch.mockResolvedValue({ items: [version('v1', 1), version('v2', 2)], next_after_revision: null })
    const first = deferred<ScriptDocument>()
    const second = deferred<ScriptDocument>()
    const requests: Array<{ id: string; signal: AbortSignal }> = []
    historyApi.read.mockImplementation((_scriptId: string, id: string, signal: AbortSignal) => {
      requests.push({ id, signal })
      return id === 'v1' ? first.promise : second.promise
    })
    const { wrapper, view, document } = editorView()
    await view.load()
    const original = document.value

    const firstSelection = view.select('saved:v1')
    await flushPromises()
    const secondSelection = view.select('saved:v2')
    expect(requests.map(request => request.id)).toEqual(['v1', 'v2'])
    expect(requests[0]!.signal.aborted).toBe(true)

    const secondDocument = documentWith('home')
    second.resolve(secondDocument)
    await secondSelection
    first.resolve(documentWith('back'))
    await firstSelection

    expect(view.selectedId.value).toBe('saved:v2')
    expect(view.selectedDocument.value).toBe(secondDocument)
    expect(document.value).toBe(original)
    wrapper.unmount()
  })

  it('aborts list and selection requests when the mounted owner is unmounted', async () => {
    const page = deferred<{ items: ReturnType<typeof version>[]; next_after_revision: number | null }>()
    const pageRequests: AbortSignal[] = []
    historyApi.fetch.mockImplementation((_scriptId: string, _after: number | null, signal: AbortSignal) => {
      pageRequests.push(signal)
      return page.promise
    })
    const { wrapper, view } = editorView()
    const loadingPage = view.load()
    await flushPromises()
    const pageResult = { items: [version('v1', 1)], next_after_revision: null }
    page.resolve(pageResult)
    await loadingPage

    const selected = deferred<ScriptDocument>()
    const selectionRequests: AbortSignal[] = []
    historyApi.read.mockImplementation((_scriptId: string, _versionId: string, signal: AbortSignal) => {
      selectionRequests.push(signal)
      return selected.promise
    })
    const loadingSelection = view.select('saved:v1')
    await flushPromises()
    wrapper.unmount()

    expect(pageRequests[0]!.aborted).toBe(true)
    expect(selectionRequests[0]!.aborted).toBe(true)
    selected.resolve(documentWith('home'))
    await loadingSelection
  })
})
