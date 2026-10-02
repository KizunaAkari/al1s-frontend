import { computed, ref, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { ScriptDocument, WorkflowStep } from '../../../shared/api/maa-script-editor'

type ConfigContext = {
  document: Ref<ScriptDocument | undefined>
  selected: Ref<number>
  busy: Ref<boolean>
  testing: Ref<boolean>
  uploading: Ref<boolean>
  apply: (document: ScriptDocument) => void
  phoneDock: (docked: boolean) => void
  phoneHidden: (hidden: boolean) => void
}

const clone = (document: ScriptDocument): ScriptDocument => JSON.parse(JSON.stringify(document)) as ScriptDocument

export function useEditorConfig(context: ConfigContext) {
  const view = ref<'canvas' | 'config'>('canvas')
  const mediaView = ref<'screenshot' | 'live'>('live')
  const configGroup = ref<'recognition' | 'rules'>('recognition')
  const configDocument = ref<ScriptDocument>()
  const configChanged = computed(() => !!context.document.value && !!configDocument.value &&
    JSON.stringify(context.document.value) !== JSON.stringify(configDocument.value))
  const configStep = computed(() => configDocument.value?.steps[context.selected.value])
  function openParameters() {
    if (!context.document.value) return
    configDocument.value = clone(context.document.value)
    configGroup.value = 'recognition'
    mediaView.value = 'live'
    context.phoneDock(true)
    context.phoneHidden(false)
    view.value = 'config'
  }

  function setMedia(value: 'screenshot' | 'live') {
    mediaView.value = value
    context.phoneDock(view.value === 'config' && value === 'live')
    context.phoneHidden(view.value === 'config' && value === 'screenshot')
  }

  function closeConfig() {
    context.phoneDock(false)
    context.phoneHidden(false)
    view.value = 'canvas'
    configDocument.value = undefined
  }

  async function cancelConfig() {
    if (configChanged.value) {
      try {
        await ElMessageBox.confirm('放弃本次未应用的节点配置？', '返回画布', {
          type: 'warning', confirmButtonText: '放弃配置', cancelButtonText: '继续编辑',
        })
      } catch { return }
    }
    closeConfig()
  }

  function applyConfig() {
    if (!configDocument.value || context.busy.value || context.testing.value || context.uploading.value)
      return
    if (configChanged.value) context.apply(clone(configDocument.value))
    closeConfig()
  }

  function changeConfigStep(value: WorkflowStep) {
    if (!configDocument.value || context.busy.value || context.testing.value || context.uploading.value)
      return
    configDocument.value = {
      ...configDocument.value,
      steps: configDocument.value.steps.map((item, index) => index === context.selected.value ? value : item),
    }
  }

  function changeConfigDocument(value: ScriptDocument) {
    // Image binding emits its document while its upload busy flag is still set.
    if (!context.busy.value && !context.testing.value) configDocument.value = value
  }

  function changeConfigStructure(value: ScriptDocument, index: number) {
    changeConfigDocument(value)
    context.selected.value = index
  }

  return {
    view, mediaView, configGroup, configDocument, configChanged, configStep,
    openParameters, setMedia, closeConfig, cancelConfig, applyConfig,
    changeConfigStep, changeConfigDocument, changeConfigStructure,
  }
}
