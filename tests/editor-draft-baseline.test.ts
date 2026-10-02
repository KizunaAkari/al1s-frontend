import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import type { MaaScript } from '../src/shared/api/maa'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'
import type { EditorDraft } from '../src/modules/maa/editor/editor-draft'
import type { TargetDevice } from '../src/shared/api/terminals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readDraft = vi.hoisted(() => vi.fn())
const writeDraft = vi.hoisted(() => vi.fn())
const deleteDraft = vi.hoisted(() => vi.fn())
vi.mock('../src/modules/maa/editor/editor-draft', () => ({ readDraft, writeDraft, deleteDraft }))

const saveScriptDocument = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/maa-script-editor', () => ({ saveScriptDocument }))

import { useEditorDrafts } from '../src/modules/maa/editor/use-editor-drafts'
import { useEditorSave } from '../src/modules/maa/editor/use-editor-save'

const scriptId = 'script-1'

function documentWith(seconds: number): ScriptDocument {
  return { version: 2, steps: [{ action: 'wait', seconds }] }
}

function makeScript(rowVersion: number, currentVersionId = `v${rowVersion}`): MaaScript {
  return {
    script_id: scriptId,
    application_id: 'application-1',
    name: '编辑器脚本',
    script_type: 'module_process',
    status: 'active',
    current_version_id: currentVersionId,
    candidate_version_id: null,
    row_version: rowVersion,
    created_at: '',
    updated_at: '',
  }
}

type Harness = ReturnType<typeof createHarness>

function createHarness(options: {
  document?: ScriptDocument
  config?: ScriptDocument
  rowVersion?: number
  unsaved?: boolean
} = {}) {
  const script = ref(makeScript(options.rowVersion ?? 2))
  const document = ref<ScriptDocument | undefined>(options.document ?? documentWith(3))
  const configDocument = ref<ScriptDocument | undefined>(options.config)
  const busy = ref(false)
  const testing = ref(false)
  const uploading = ref(false)
  const dirty = ref(options.unsaved ?? true)
  const saved = ref(false)
  const error = ref('')
  let drafts!: ReturnType<typeof useEditorDrafts>
  let saveDocument!: ReturnType<typeof useEditorSave>['save']

  const wrapper = mount(defineComponent({
    setup() {
      drafts = useEditorDrafts({
        scriptId: () => scriptId,
        script,
        document,
        config: () => configDocument.value
          ? { document: configDocument.value, step: 0 }
          : undefined,
        unsaved: () => dirty.value,
        uploading: () => uploading.value,
        edited: () => {
          dirty.value = true
          saved.value = false
        },
      })
      saveDocument = useEditorSave({
        script,
        document,
        device: () => ({ device_id: 'device-1' } as TargetDevice),
        busy,
        testing,
        uploading,
        dirty,
        saved,
        error,
        clearDraftTimer: drafts.clearDraftTimer,
        persistDraft: drafts.persistDraft,
        prepareDraft: () => drafts.markSaved(),
        onSaved: () => {},
      }).save
      return {}
    },
    template: '<div />',
  }))

  return { wrapper, script, document, configDocument, busy, dirty, saved, error, drafts, save: saveDocument }
}

async function loadDraft(harness: Harness) {
  harness.drafts.beginLoad()
  harness.drafts.initialize(harness.document.value!)
  return harness.drafts.read()
}

beforeEach(() => {
  readDraft.mockReset()
  readDraft.mockResolvedValue(undefined)
  writeDraft.mockReset()
  writeDraft.mockResolvedValue(scriptId)
  deleteDraft.mockReset()
  deleteDraft.mockResolvedValue(undefined)
  saveScriptDocument.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('editor draft baseline after save', () => {
  it('updates the saved baseline from a readable conflict, preserves old history and metadata, and reopens cleanly', async () => {
    const oldHistory = [documentWith(1), documentWith(2)]
    const currentDocument = documentWith(3)
    const oldDraft: EditorDraft = {
      scriptId,
      baseRowVersion: 1,
      cursor: 1,
      updatedAt: 10,
      history: oldHistory,
      historyMetadata: [
        { time: 11, versionId: 'v1' },
        { time: 12, versionId: 'v2' },
      ],
      configDocument: documentWith(90),
      configStep: 0,
    }
    readDraft.mockResolvedValueOnce(oldDraft)
    const harness = createHarness({ document: currentDocument })

    try {
      await expect(loadDraft(harness)).resolves.toBeUndefined()
      expect(harness.drafts.recoveryState.value).toBe('conflict')
      expect(harness.drafts.protectedDraft.value).toEqual(oldDraft)

      const returnedScript = makeScript(3, 'v3')
      saveScriptDocument.mockResolvedValueOnce(returnedScript)
      await harness.save()

      const persisted = writeDraft.mock.calls.at(-1)?.[0] as EditorDraft
      expect(persisted).toEqual(expect.objectContaining({
        scriptId,
        baseRowVersion: 3,
        cursor: 2,
        history: [...oldHistory, currentDocument],
        historyMetadata: [
          { time: 11, versionId: 'v1' },
          { time: 12, versionId: 'v2' },
          expect.objectContaining({ versionId: 'v3' }),
        ],
      }))
      expect(persisted.configDocument).toBeUndefined()
      expect(persisted.historyMetadata).toHaveLength(persisted.history.length)
      expect(persisted.history[persisted.cursor]).toEqual(currentDocument)
      expect(harness.script.value.row_version).toBe(3)
      expect(harness.drafts.recoveryState.value).toBe('ready')
      expect(harness.drafts.protectedDraft.value).toBeUndefined()

      readDraft.mockResolvedValueOnce(persisted)
      const reopened = await loadDraft(harness)
      expect(reopened).toEqual(persisted)
      harness.drafts.restore(reopened!)
      expect(harness.drafts.recoveryState.value).toBe('ready')
      expect(harness.drafts.protectedDraft.value).toBeUndefined()
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it('keeps a readable conflict frozen when the server save fails', async () => {
    const oldDraft: EditorDraft = {
      scriptId,
      baseRowVersion: 1,
      cursor: 0,
      updatedAt: 10,
      history: [documentWith(99)],
      historyMetadata: [{ time: 11, versionId: 'old-v1' }],
    }
    readDraft.mockResolvedValueOnce(oldDraft)
    const harness = createHarness({ document: documentWith(3) })

    try {
      await loadDraft(harness)
      saveScriptDocument.mockRejectedValueOnce(new Error('服务器拒绝了保存'))
      await harness.save()

      expect(harness.error.value).toBe('服务器拒绝了保存')
      expect(harness.dirty.value).toBe(true)
      expect(harness.drafts.recoveryState.value).toBe('conflict')
      expect(harness.drafts.protectedDraft.value).toEqual(oldDraft)
      expect(writeDraft).not.toHaveBeenCalled()
      expect(deleteDraft).not.toHaveBeenCalled()
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it('does not overwrite an unreadable original draft after a successful save', async () => {
    readDraft.mockRejectedValueOnce(new Error('本地草稿含无效脚本字段，草稿仍保留在本机'))
    const harness = createHarness({ document: documentWith(3) })

    try {
      await loadDraft(harness)
      expect(harness.drafts.recoveryState.value).toBe('invalid')
      const returnedScript = makeScript(3, 'v3')
      saveScriptDocument.mockResolvedValueOnce(returnedScript)
      await harness.save()

      expect(harness.script.value.row_version).toBe(3)
      expect(harness.dirty.value).toBe(false)
      expect(harness.drafts.recoveryState.value).toBe('invalid')
      expect(harness.drafts.draftError.value).toContain('本地草稿含无效脚本字段')
      expect(writeDraft).not.toHaveBeenCalled()
      expect(deleteDraft).not.toHaveBeenCalled()
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it('synchronizes only the row baseline when body and configuration are unchanged', async () => {
    const currentDocument = documentWith(3)
    const currentConfig = currentDocument
    const oldDraft: EditorDraft = {
      scriptId,
      baseRowVersion: 1,
      cursor: 0,
      updatedAt: 10,
      history: [currentDocument],
      historyMetadata: [{ time: 11, versionId: 'v1' }],
      configDocument: currentConfig,
      configStep: 0,
    }
    readDraft.mockResolvedValueOnce(oldDraft)
    const harness = createHarness({ document: currentDocument, config: currentConfig })

    try {
      const recovered = await loadDraft(harness)
      expect(recovered).toBeDefined()
      expect(harness.drafts.recoveryState.value).toBe('ready')
      expect(harness.drafts.protectedDraft.value).toBeUndefined()
      if (!recovered) return

      writeDraft.mockClear()
      harness.drafts.restore(recovered)
      await harness.drafts.persistDraft()
      const synchronized = writeDraft.mock.calls.at(-1)?.[0] as EditorDraft
      expect(synchronized.baseRowVersion).toBe(2)
      expect(synchronized.history).toEqual([currentDocument])
      expect(synchronized.historyMetadata).toEqual(oldDraft.historyMetadata)
      expect(synchronized.configDocument).toEqual(currentConfig)
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it.each([
    {
      difference: '正文',
      current: documentWith(3),
      oldHistory: [documentWith(99)],
      currentConfig: undefined,
      oldConfig: undefined,
    },
    {
      difference: '配置',
      current: documentWith(3),
      oldHistory: [documentWith(3)],
      currentConfig: documentWith(31),
      oldConfig: documentWith(30),
    },
  ])('keeps a conflict when the old draft differs in $difference', async testCase => {
    const oldDraft: EditorDraft = {
      scriptId,
      baseRowVersion: 1,
      cursor: 0,
      updatedAt: 10,
      history: testCase.oldHistory,
      historyMetadata: [{ time: 11, versionId: 'v1' }],
      configDocument: testCase.oldConfig,
      configStep: testCase.oldConfig ? 0 : undefined,
    }
    readDraft.mockResolvedValueOnce(oldDraft)
    const harness = createHarness({ document: testCase.current, config: testCase.currentConfig })

    try {
      await expect(loadDraft(harness)).resolves.toBeUndefined()
      expect(harness.drafts.recoveryState.value).toBe('conflict')
      expect(harness.drafts.protectedDraft.value).toEqual(oldDraft)
      expect(writeDraft).not.toHaveBeenCalled()
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it('keeps at most fifty merged history entries with metadata aligned and the cursor on the saved body', async () => {
    const oldHistory = Array.from({ length: 50 }, (_, index) => documentWith(index))
    const oldMetadata = oldHistory.map((_, index) => ({ time: index, versionId: `old-v${index}` }))
    const currentDocument = documentWith(500)
    const oldDraft: EditorDraft = {
      scriptId,
      baseRowVersion: 1,
      cursor: oldHistory.length - 1,
      updatedAt: 10,
      history: oldHistory,
      historyMetadata: oldMetadata,
    }
    readDraft.mockResolvedValueOnce(oldDraft)
    const harness = createHarness({ document: currentDocument })

    try {
      await loadDraft(harness)
      saveScriptDocument.mockResolvedValueOnce(makeScript(3, 'v3'))
      await harness.save()

      const persisted = writeDraft.mock.calls.at(-1)?.[0] as EditorDraft
      expect(persisted.history).toHaveLength(50)
      expect(persisted.historyMetadata).toHaveLength(50)
      expect(persisted.history[0]).toEqual(oldHistory[1])
      expect(persisted.historyMetadata?.[0]).toEqual(oldMetadata[1])
      expect(persisted.history.at(-1)).toEqual(currentDocument)
      expect(persisted.historyMetadata?.at(-1)).toEqual(expect.objectContaining({ versionId: 'v3' }))
      expect(persisted.cursor).toBe(49)
      expect(persisted.history[persisted.cursor]).toEqual(currentDocument)
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })

  it('shows local write failure, retries after storage recovery, and never deletes the old record', async () => {
    const original: EditorDraft = {
      scriptId,
      baseRowVersion: 2,
      cursor: 0,
      updatedAt: 10,
      history: [documentWith(3)],
      historyMetadata: [{ time: 11, versionId: 'v2' }],
    }
    let stored: EditorDraft | undefined = original
    readDraft.mockResolvedValueOnce(original)
    writeDraft.mockRejectedValueOnce(new Error('本地磁盘暂不可用'))
      .mockImplementation(async (next: EditorDraft) => {
        stored = next
        return scriptId
      })
    const harness = createHarness({ document: documentWith(3), unsaved: true })

    try {
      const recovered = await loadDraft(harness)
      expect(recovered).toBeDefined()
      if (!recovered) return
      harness.drafts.restore(recovered)

      await expect(harness.drafts.preserveBeforeLeave()).resolves.toBe(false)
      expect(harness.drafts.draftError.value).toBe('草稿存储失败，请尽快保存脚本')
      expect(writeDraft).toHaveBeenCalledOnce()
      expect(deleteDraft).not.toHaveBeenCalled()
      expect(stored).toEqual(original)

      await expect(harness.drafts.preserveBeforeLeave()).resolves.toBe(true)
      expect(writeDraft).toHaveBeenCalledTimes(2)
      expect(deleteDraft).not.toHaveBeenCalled()
      expect(stored).toEqual(writeDraft.mock.calls[1]?.[0])
    } finally {
      harness.wrapper.unmount()
      await flushPromises()
    }
  })
})
