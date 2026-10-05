import { onBeforeUnmount, ref, watch } from 'vue'
import { capturePhoneScreenshot, type NativeScreenshot } from './screenshot-connection'
import { readImportedScreenshot } from './imported-screenshot'

type ScreenshotContext = {
  url: () => string | undefined
  landscape: () => boolean | undefined
  focus: () => string
  configurable: () => boolean
  blocked: () => boolean
  screenSize?: () => { width: number; height: number } | undefined
  showLive: () => void
  showScreenshot: () => void
}

/** Keep a native screenshot bound to exactly one device, orientation and editor focus. */
export function useEditorScreenshot(context: ScreenshotContext) {
  const screenshot = ref<NativeScreenshot>()
  const captureBusy = ref(false)
  const captureError = ref('')
  const importedName = ref<string>()
  let controller: AbortController | undefined
  let importPending = false

  function discardScreenshot() {
    controller?.abort()
    controller = undefined
    importPending = false
    captureBusy.value = false
    screenshot.value = undefined
    importedName.value = undefined
    captureError.value = ''
    if (context.configurable()) context.showLive()
  }
  async function openScreenshot() {
    if (captureBusy.value || context.blocked()) return
    screenshot.value = undefined
    importedName.value = undefined
    context.showLive()
    const url = context.url()
    if (!url) {
      captureError.value = '当前手机没有可用的原始截图通道，请检查连接后重试。'
      return
    }
    const request = new AbortController()
    controller = request
    importPending = false
    captureBusy.value = true
    captureError.value = ''
    const focus = context.focus()
    const landscape = context.landscape()
    try {
      const captured = await capturePhoneScreenshot(url, request.signal)
      if (controller !== request || context.focus() !== focus || context.url() !== url ||
        context.landscape() !== landscape || !context.configurable()) return
      screenshot.value = captured
      context.showScreenshot()
    } catch (cause) {
      if (controller === request) captureError.value = cause instanceof Error ? cause.message : '截图失败'
    } finally {
      if (controller === request) { controller = undefined; captureBusy.value = false }
    }
  }
  async function importScreenshot(file: File): Promise<boolean> {
    if (captureBusy.value || context.blocked() || !context.configurable()) return false
    const request = new AbortController()
    controller = request
    importPending = true
    captureBusy.value = true
    captureError.value = ''
    const focus = context.focus(), landscape = context.landscape()
    try {
      const imported = await readImportedScreenshot(file, request.signal)
      if (controller !== request || context.focus() !== focus ||
        context.landscape() !== landscape || !context.configurable()) return false
      const size = context.screenSize?.()
      if (size && (size.width !== imported.width || size.height !== imported.height)) {
        throw new Error(`脚本已绑定 ${size.width}×${size.height}，导入截图为 ${imported.width}×${imported.height}；请选择相同分辨率和方向的原图`)
      }
      screenshot.value = imported
      importedName.value = file.name || '本机截图'
      context.showScreenshot()
      return true
    } catch (cause) {
      if (controller === request) captureError.value = cause instanceof Error ? cause.message : '截图导入失败'
      return false
    } finally {
      if (controller === request) { controller = undefined; captureBusy.value = false; importPending = false }
    }
  }
  watch([context.focus, context.landscape], discardScreenshot)
  watch(context.url, () => {
    if (importedName.value) return // Local files do not depend on the live phone channel.
    if (importPending) screenshot.value = undefined
    else discardScreenshot()
  })
  watch(context.configurable, value => { if (!value) discardScreenshot() })
  onBeforeUnmount(discardScreenshot)
  return { screenshot, captureBusy, captureError, importedName, discardScreenshot, openScreenshot, importScreenshot }
}
