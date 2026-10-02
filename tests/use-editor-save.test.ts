import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import type { MaaScript } from '../src/shared/api/maa'
import type { ScriptDocument } from '../src/shared/api/maa-script-editor'
import type { TargetDevice } from '../src/shared/api/terminals'

const saveScriptDocument = vi.hoisted(() => vi.fn())
vi.mock('../src/shared/api/maa-script-editor', () => ({ saveScriptDocument }))

import { useEditorSave } from '../src/modules/maa/editor/use-editor-save'

it('reuses one idempotency key for retries of the same payload and resets after success', async () => {
  const script = ref({ script_id: 'script-1' } as MaaScript)
  const document = ref({ version: 2, steps: [{ action: 'wait' }] } as ScriptDocument)
  const busy = ref(false)
  const dirty = ref(true)
  const saved = ref(false)
  const error = ref('')
  const persistDraft = vi.fn().mockResolvedValue(undefined)
  const onSaved = vi.fn()
  const clearDraftTimer = vi.fn()
  saveScriptDocument.mockReset()
  saveScriptDocument.mockRejectedValueOnce(new Error('network interrupted'))
    .mockResolvedValueOnce(script.value)
    .mockResolvedValueOnce(script.value)
  const { save } = useEditorSave({
    script, document, device: () => ({ device_id: 'device-1' }) as TargetDevice,
    busy, testing: ref(false), uploading: ref(false), dirty, saved, error,
    clearDraftTimer, persistDraft, onSaved,
  })

  await save()
  expect(error.value).toBe('network interrupted')
  expect(dirty.value).toBe(true)
  await save()
  expect(saveScriptDocument.mock.calls[1]?.[3]).toBe(saveScriptDocument.mock.calls[0]?.[3])
  expect(dirty.value).toBe(false)
  expect(saved.value).toBe(true)
  expect(persistDraft).toHaveBeenCalledOnce()
  expect(onSaved).toHaveBeenCalledOnce()
  expect(clearDraftTimer).toHaveBeenCalledOnce()

  dirty.value = true
  await save()
  expect(saveScriptDocument.mock.calls[2]?.[3]).not.toBe(saveScriptDocument.mock.calls[1]?.[3])
})
