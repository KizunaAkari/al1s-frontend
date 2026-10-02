import type { Ref } from 'vue'
import type { MaaScript } from '../../../shared/api/maa'
import { saveScriptDocument, type ScriptDocument } from '../../../shared/api/maa-script-editor'
import type { TargetDevice } from '../../../shared/api/terminals'

type SaveContext = {
  script: Ref<MaaScript | undefined>
  document: Ref<ScriptDocument | undefined>
  device: () => TargetDevice | undefined
  busy: Ref<boolean>
  testing: Ref<boolean>
  uploading: Ref<boolean>
  dirty: Ref<boolean>
  saved: Ref<boolean>
  error: Ref<string>
  clearDraftTimer: () => void
  persistDraft: () => Promise<unknown>
  onSaved: () => void
  prepareDraft?: () => void
}

export function useEditorSave(context: SaveContext) {
  let pendingSave: { payload: string; key: string } | undefined

  async function save() {
    const device = context.device()
    if (!context.script.value || !context.document.value || !device ||
      context.busy.value || context.testing.value || context.uploading.value) return
    context.busy.value = true
    context.error.value = ''
    const payload = JSON.stringify(context.document.value)
    if (pendingSave?.payload !== payload) pendingSave = { payload, key: crypto.randomUUID() }
    try {
      context.script.value = await saveScriptDocument(
        context.script.value, JSON.parse(payload) as ScriptDocument, device.device_id, pendingSave.key,
      )
      context.dirty.value = false
      context.saved.value = true
      context.clearDraftTimer()
      context.prepareDraft?.()
      await context.persistDraft()
      pendingSave = undefined
      context.onSaved()
    } catch (e) {
      context.error.value = e instanceof Error ? e.message : '保存失败，草稿已保留'
    } finally {
      context.busy.value = false
    }
  }

  return { save }
}
