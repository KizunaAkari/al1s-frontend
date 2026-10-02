import { onBeforeUnmount, ref, watch } from 'vue'
import { capturePhoneScreenshot, type NativeScreenshot } from './screenshot-connection'

type ScreenshotContext = {
  url: () => string | undefined
  landscape: () => boolean | undefined
  focus: () => string
  configurable: () => boolean
  blocked: () => boolean
  showLive: () => void
  showScreenshot: () => void
}

/** Keep a native screenshot bound to exactly one device, orientation and editor focus. */
export function useEditorScreenshot(context: ScreenshotContext) {
  const screenshot = ref<NativeScreenshot>()
  const captureBusy = ref(false)
  const captureError = ref('')
  let controller: AbortController | undefined

  function discardScreenshot() {
    controller?.abort()
    controller = undefined
    captureBusy.value = false
    screenshot.value = undefined
    captureError.value = ''
    if (context.configurable()) context.showLive()
  }
  async function openScreenshot() {
    if (captureBusy.value || context.blocked()) return
    screenshot.value = undefined
    context.showLive()
    const url = context.url()
    if (!url) {
      captureError.value = '当前手机没有可用的原始截图通道，请检查连接后重试。'
      return
    }
    const request = new AbortController()
    controller = request
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
  watch(() => [context.focus(), context.url(), context.landscape()], discardScreenshot)
  watch(context.configurable, value => { if (!value) discardScreenshot() })
  onBeforeUnmount(discardScreenshot)
  return { screenshot, captureBusy, captureError, discardScreenshot, openScreenshot }
}
