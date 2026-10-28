<script setup lang="ts">
import { ElAlert, ElButton, ElMessageBox } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { closeEditorSession, createEditorSession, currentEditorSession, fetchEditorSession, type EditorSession } from '../../../shared/api/editor'
import { connectPhoneVideo } from './video-connection'
import { connectPhoneControl, keyPacket, touchPacket } from './control-connection'
import { Back, House } from '@element-plus/icons-vue'
import { ApiError } from '../../../shared/api/client'
import { videoPoint } from './video-coordinates'
import { ControlConfirmation, isTransientConfirmationFailure } from './control-confirmation'
import { previewFailure } from './preview-presentation'

const props = defineProps<{ deviceId: string }>()
const emit = defineEmits<{ geometry:[width:number,height:number]; screenshotUrl:[url:string|undefined] }>()
const canvas = ref<HTMLCanvasElement>()
const session = ref<EditorSession>()
const occupied = ref<EditorSession>()
const busy = ref(false)
const error = ref('')
const failureDetails = ref<ReturnType<typeof previewFailure>>()
const watching = ref(false)
const controlling = ref(false)
const platformReady = ref(false)
let controlRetryAt = 0
const frameSize = ref({ width:0, height:0 })
const videoState = computed(() => {
  if (closing.value) return '正在关闭会话'
  if (videoFailed.value) return '画面已断开'
  if (frameSize.value.width) return `${frameSize.value.width} × ${frameSize.value.height}`
  if (busy.value) return '正在申请画面…'
  if (error.value) return '未连接'
  if (session.value?.status === 'closed') return '会话已关闭'
  if (session.value?.status === 'expired') return '会话已过期'
  return session.value?.status === 'pending' ? '等待终端响应…' : '正在连接画面…'
})
function geometry(width:number,height:number) {
  if (frameSize.value.width === width && frameSize.value.height === height) return
  stopControl()
  frameSize.value = { width,height }
  emit('geometry',width,height)
}

let control: ReturnType<typeof connectPhoneControl> | undefined
let pointer: number | undefined
let lastTouchPoint: { x: number; y: number } | undefined
let requestId = crypto.randomUUID()
const requestStorageKey = `al1s.editor.request.${props.deviceId}`
try { const saved = sessionStorage.getItem(requestStorageKey); if (saved && /^[0-9a-f-]{36}$/i.test(saved)) requestId = saved as typeof requestId } catch { /* Optional recovery storage. */ }
function clearRequest() {
  try { sessionStorage.removeItem(requestStorageKey) } catch { /* Browser storage unavailable. */ }
  requestId = crypto.randomUUID()
}
let timer: ReturnType<typeof setTimeout> | undefined
let stopVideo: (() => void) | undefined
let disposed = false
const closing = ref(false)
const videoFailed = ref(false)
const recovering = ref(0)
let retryTimer: ReturnType<typeof setTimeout> | undefined
let stableTimer: ReturnType<typeof setTimeout> | undefined
let videoEpoch = 0
let pollEpoch = 0
let controlEpoch = 0
let restartRequested = false
let polling = false
const confirmation = new ControlConfirmation(() => {
  platformReady.value = false
  stopControl()
  if (!disposed && !closing.value) error.value = '无法核对平台会话状态超过10秒；视频可继续，人工操作已暂停。'
})

function stopLocal(): void {
  ++videoEpoch
  clearTimeout(timer)
  clearTimeout(retryTimer)
  clearTimeout(stableTimer)
  stopVideo?.()
  stopVideo = undefined
  watching.value = false
  emit('screenshotUrl', undefined)
  geometry(0, 0)
  stopControl()
}

function stopControl(): void {
  ++controlEpoch
  const previous = control
  control = undefined
  previous?.close()
  controlling.value = false
  pointer = undefined
  lastTouchPoint = undefined
}

function enableControl(): void {
  const connection = session.value?.connection
  if (!connection || disposed || closing.value || !platformReady.value || !confirmation.valid() || control || Date.now()<controlRetryAt || !watching.value || !frameSize.value.width) return
  const epoch = ++controlEpoch
  try {
    control = connectPhoneControl(connection.control_ws_url,
      () => { if(epoch === controlEpoch && !disposed && platformReady.value && confirmation.valid() && !closing.value) controlling.value = true },
      () => {
        if (epoch !== controlEpoch) return
        controlling.value = false; pointer = undefined; lastTouchPoint = undefined
        control = undefined; controlRetryAt = Date.now() + 5000
        if (connection.transport === 'android-reverse-v1') {
          // Automation revokes the Android media attachment. A fresh video/control
          // pair restores input; reconnecting control to the old media cannot.
          stopLocal()
          videoFailed.value = true
          retryTimer = setTimeout(() => {
            videoFailed.value = false
            void poll()
          }, 5000)
        }
      })
  } catch { control=undefined; controlRetryAt=Date.now()+5000 }
}

function touch(event: PointerEvent, action: 0 | 1 | 2): void {
  const target=canvas.value, size=frameSize.value
  if (!target || !watching.value || !controlling.value || !confirmation.valid() || !size.width || target.width!==size.width || target.height!==size.height) return
  if (action === 0 && event.button !== 0) return
  const point=videoPoint(event.clientX,event.clientY,target.getBoundingClientRect(),size)
  if (action === 0) {
    if (pointer !== undefined || !point) return
    target.setPointerCapture(event.pointerId)
    pointer=event.pointerId
    lastTouchPoint=point
  } else if (pointer !== event.pointerId) return
  if (action === 1) {
    const releasePoint=point ?? lastTouchPoint
    pointer=undefined
    lastTouchPoint=undefined
    if (releasePoint) control?.send(touchPacket(1,releasePoint.x,releasePoint.y,size.width,size.height))
    return
  }
  if (!point) return
  lastTouchPoint=point
  control?.send(touchPacket(action,point.x,point.y,size.width,size.height))
}

function pressKey(key: 3 | 4): void {
  if (!controlling.value || !confirmation.valid() || !frameSize.value.width) return
  control?.send(keyPacket(0, key))
  control?.send(keyPacket(1, key))
}

function schedulePoll(): void {
  clearTimeout(timer)
  if (!disposed) timer = setTimeout(() => { void poll() }, session.value?.status === 'pending' ? 500 : 2000)
}

async function poll(): Promise<void> {
  if (!session.value || disposed || polling) return
  polling = true
  const epoch = ++pollEpoch
  const id = session.value.session_id
  const started = Date.now()
  try {
    const current = await fetchEditorSession(id)
    if (disposed || epoch !== pollEpoch || session.value?.session_id !== id) return
    session.value = current
    platformReady.value = current.status === 'active' && confirmation.confirm(started)
    if (current.status !== 'active') confirmation.clear()
    emit('screenshotUrl', !closing.value && current.status === 'active' ? current.connection?.screenshot_ws_url : undefined)
    if(platformReady.value && (error.value.startsWith('无法核对平台会话状态') || error.value.startsWith('连接波动')))error.value=''
    if (closing.value && ['active', 'pending'].includes(current.status)) {
      session.value = await closeEditorSession(current.session_id)
      schedulePoll()
      return
    }
    if (!closing.value && !videoFailed.value && current.status === 'active' && current.connection && !stopVideo) {
      await nextTick()
      if (disposed || epoch !== pollEpoch || !canvas.value) return
      startVideo(current)
    }
    if (['closed', 'failed', 'expired'].includes(current.status)) {
      if (current.status === 'failed') error.value = `终端创建画面失败：${current.error_code ?? '未提供错误码'}。请检查终端视频服务、ADB连接和证书。`
      stopLocal()
      closing.value = false
      clearRequest()
      if (restartRequested) {
        restartRequested = false
        polling = false
        await open()
      }
      return
    }
    if (current.status === 'closing') stopLocal()
    else enableControl()
    schedulePoll()
  } catch (failure) {
    if (disposed || epoch !== pollEpoch) return
    if (isTransientConfirmationFailure(failure) && confirmation.valid()) {
      error.value = '连接波动，正在重试；已确认的控制暂时保留。'
    } else {
      confirmation.clear()
      platformReady.value = false
      stopControl()
      error.value = '无法核对平台会话状态；视频可继续，人工操作不可用。'
    }
    schedulePoll()
  } finally {
    polling = false
    if (session.value && ['pending', 'active', 'closing'].includes(session.value.status)) schedulePoll()
  }
}

function startVideo(current: EditorSession): void {
  const epoch = ++videoEpoch
  if (!canvas.value || !current.connection) return
  const failed = (failure: Error) => {
    if (disposed || epoch !== videoEpoch) return
    stopLocal()
    videoFailed.value = true
    if (recovering.value >= 3) {
      error.value = `画面恢复失败：${failure.message}。可点击重试。`
      schedulePoll()
      return
    }
    ++recovering.value
    error.value = `正在恢复画面（${recovering.value}/3）…`
    retryTimer = setTimeout(() => {
      videoFailed.value = false
      void poll()
    }, [500, 1000, 2000][recovering.value - 1])
  }
  try {
    stopVideo = connectPhoneVideo(current.connection.video_ws_url, canvas.value, failed,
      () => {
        if (disposed || epoch !== videoEpoch) return
        watching.value = true
        error.value = ''
        enableControl()
        stableTimer = setTimeout(() => { recovering.value = 0 }, 30000)
      }, (w, h) => { if (epoch === videoEpoch) geometry(w, h) })
  } catch (failure) { failed(failure instanceof Error ? failure : new Error('视频连接失败')) }
}

async function open(): Promise<void> {
  if (busy.value) return
  ++pollEpoch
  confirmation.clear()
  platformReady.value = false
  busy.value = true
  error.value = ''
  failureDetails.value = undefined
  closing.value = false
  videoFailed.value = false
  recovering.value = 0
  occupied.value = undefined
  try {
    try { sessionStorage.setItem(requestStorageKey, requestId) } catch { /* In-memory retry still reuses the key. */ }
    const created = await createEditorSession(props.deviceId, requestId)
    if (disposed) { await closeEditorSession(created.session_id); return }
    session.value = created
    await poll()
  } catch (failure) {
    failureDetails.value = previewFailure(failure)
    error.value = failureDetails.value.title
    if (failure instanceof ApiError && failure.code === 'editor_device_busy') {
      try { occupied.value = await currentEditorSession(props.deviceId) ?? undefined }
      catch { failureDetails.value.description += ' 占用信息暂时无法读取，请稍后重试。' }
    }
  } finally { busy.value = false }
}

async function close(preserveError = false): Promise<void> {
  ++pollEpoch
  confirmation.clear()
  platformReady.value = false
  restartRequested = false
  closing.value = true
  stopLocal()
  if (!session.value) return
  busy.value = true
  if (!preserveError) { error.value = ''; failureDetails.value = undefined }
  try {
    session.value = await closeEditorSession(session.value.session_id)
    schedulePoll()
  } catch {
    error.value = '关闭请求未确认，请重试。终端仍有空闲超时保护。'
    schedulePoll()
  } finally { busy.value = false }
}

async function recoverOccupied(): Promise<void> {
  const previous = occupied.value
  if (!previous || busy.value) return
  try { await ElMessageBox.confirm('关闭这台手机的旧编辑会话？其他浏览器的预览和人工控制会断开，正式任务不受影响。', '恢复视频连接', { confirmButtonText:'关闭旧会话并重连', cancelButtonText:'取消' }) }
  catch { return }
  if (occupied.value !== previous || disposed) return
  session.value = previous
  occupied.value = undefined
  await close()
  restartRequested = true
  if (session.value && ['closed', 'failed', 'expired'].includes(session.value.status)) {
    restartRequested = false; clearRequest(); await open()
  }
}

async function reconnectVideo(): Promise<void> {
  if (disposed || busy.value || closing.value) return
  ++pollEpoch
  stopLocal()
  videoFailed.value = false
  recovering.value = 0
  error.value = '正在重新连接画面…'
  busy.value = true
  try { await poll() } finally { busy.value = false }
}

onMounted(()=>{void open()})
onBeforeUnmount(() => {
  disposed = true
  confirmation.clear()
  stopLocal()
  if (session.value) void closeEditorSession(session.value.session_id).catch(() => undefined)
})
</script>

<template>
  <section class="editor-video-panel">
    <div v-if="error" class="preview-notice">
      <el-alert :title="error" :description="failureDetails?.description" type="warning" show-icon :closable="false" />
      <details v-if="failureDetails?.details.length" class="preview-technical-details"><summary>技术详情</summary>
        <dl><div v-for="item in failureDetails.details" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
      </details>
    </div>
    <p v-if="closing" class="preview-closing" role="status">等待终端确认关闭；离线时需先恢复连接。</p>
    <div class="video-stage"><canvas ref="canvas" :class="{ controlling }" aria-label="手机实时画面"
      @pointerdown.prevent="touch($event, 0)" @pointermove="touch($event, 2)"
      @pointerup="touch($event, 1)" @pointercancel="touch($event, 1)" @lostpointercapture="touch($event, 1)" /></div>
    <div class="editor-video-footer">
      <div class="editor-video-actions">
        <el-button :icon="Back" aria-label="返回" title="返回" :disabled="!controlling" @click="pressKey(4)">返回</el-button>
        <el-button :icon="House" aria-label="主页" title="主页" :disabled="!controlling" @click="pressKey(3)">主页</el-button>
        <el-button v-if="occupied" :disabled="busy" @click="recoverOccupied">关闭旧会话并重连</el-button>
        <el-button v-else-if="error || videoFailed || (session && ['closed','failed','expired'].includes(session.status))" :disabled="busy || closing" @click="session && !['closed','failed','expired'].includes(session.status) ? reconnectVideo() : open()">重试</el-button>
      </div>
      <div class="editor-video-meta">
        <span v-if="watching" class="control-status" :class="{ controlling }">{{ controlling ? '可控制' : '只读' }}</span>
        <small class="video-state">{{ videoState }}</small>
        <small v-if="watching && !controlling" class="control-guidance">控制暂不可用，恢复后自动重连</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-video-panel { display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; }
.preview-notice { flex:none; margin:10px 12px; min-width:0; }
.preview-notice :deep(.el-alert) { align-items:flex-start; padding:10px 12px; }
.preview-notice :deep(.el-alert__content) { min-width:0; }
.preview-notice :deep(.el-alert__title), .preview-notice :deep(.el-alert__description) { font-size:13px; line-height:1.6; white-space:normal; overflow-wrap:anywhere; }
.preview-technical-details { margin-top:8px; color:var(--muted); font-size:12px; line-height:1.6; }
.preview-technical-details summary { cursor:pointer; width:fit-content; }
.preview-technical-details dl { margin:8px 0 0; padding:10px; background:var(--surface-soft); border-radius:6px; }
.preview-technical-details dl > div { display:grid; grid-template-columns:4.5em minmax(0,1fr); gap:10px; margin:4px 0; }
.preview-technical-details dt { color:var(--muted); }
.preview-technical-details dd { margin:0; color:var(--text); white-space:pre-wrap; overflow-wrap:anywhere; }
.preview-closing { flex:none; margin:10px 12px; color:var(--muted); font-size:13px; line-height:1.6; }
.editor-video-footer { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 12px; flex:none; padding:10px 12px; border-top:1px solid var(--border); }
.editor-video-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; min-width:0; }
.editor-video-actions .el-button { min-width:64px; height:34px; margin:0; padding:6px 10px; }
.editor-video-meta { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:4px 10px; min-width:0; margin-left:auto; }
.control-status { display:block; max-width:100%; white-space:normal; color:var(--muted); font-size:12px; }
.control-guidance { flex-basis:100%; color:var(--muted); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.control-status::before { content:''; display:inline-block; width:8px; height:8px; margin-right:6px; border-radius:50%; background:var(--el-color-warning); }
.control-status.controlling::before { background:var(--el-color-success); }
.video-state { color:var(--muted); font-size:11px; }
.video-stage { flex:1; min-height:0; overflow:hidden; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); }
canvas { display:block; width:100%; height:100%; object-fit:contain; touch-action:none; }
.snapshot-tools { padding:10px; }summary{cursor:pointer}.snapshot-tools :deep(img){max-height:200px}
</style>
