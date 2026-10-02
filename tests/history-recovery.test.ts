import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useEditorDrafts } from '../src/modules/maa/editor/use-editor-drafts'
import * as storage from '../src/modules/maa/editor/editor-draft'

vi.mock('../src/modules/maa/editor/editor-draft', async original => ({ ...await original<object>(),
  readDraft: vi.fn().mockResolvedValue(undefined), writeDraft: vi.fn().mockResolvedValue('script'), deleteDraft: vi.fn() }))
afterEach(() => vi.clearAllMocks())

it('records times, restores as a new snapshot and preserves the previous state across reload', async () => {
  const document = ref({ version: 2, steps: [{ action: 'wait', seconds: 2 }] })
  const script = ref({ script_id: 'script', row_version: 1, current_version_id: 'v2' })
  const preview = ref<string | undefined>('v2')
  let drafts!: ReturnType<typeof useEditorDrafts>
  const wrapper = mount(defineComponent({ setup() {
    drafts = useEditorDrafts({ scriptId: () => 'script', script: script as never, document,
      config: () => undefined, unsaved: () => true, uploading: () => false, edited: () => {},
      previewVersionId: () => preview.value, selectPreviewVersion: value => { preview.value = value } })
    drafts.initialize(document.value)
  }, template: '<div />' }))
  try {
    await drafts.read()
    const original = JSON.parse(JSON.stringify(document.value))
    expect(drafts.restoreSnapshot).toBeTypeOf('function')
    drafts.restoreSnapshot({ version: 2, steps: [{ action: 'wait', seconds: 1 }] }, 'v1')
    expect(drafts.history.value).toHaveLength(2)
    expect(drafts.history.value[0]).toEqual(original)
    expect(drafts.historyMetadata.value[1]?.versionId).toBe('v1')
    expect(drafts.historyMetadata.value[1]?.time).toBeGreaterThan(0)
    expect(preview.value).toBe('v1')
    await drafts.persistDraft(); await flushPromises()
    expect(storage.writeDraft).toHaveBeenCalledWith(expect.objectContaining({
      historyMetadata: drafts.historyMetadata.value,
    }))
    drafts.travel(0)
    expect(document.value).toEqual(original)
    expect(preview.value).toBe('v2')
  } finally { wrapper.unmount() }
})

it('keeps legacy drafts readable without inventing individual modification times', async () => {
  const legacy = storage.validateEditorDraft({ scriptId: 'script', baseRowVersion: 1, updatedAt: 123,
    history: [{ version: 2, steps: [] }], cursor: 0 }, 'script')
  expect(legacy.historyMetadata).toBeUndefined()
  expect(() => storage.validateEditorDraft({ ...legacy, historyMetadata: [{ time: 'bad' }] }, 'script')).toThrow()
})
