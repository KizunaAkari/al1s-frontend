<script setup lang="ts">
import { ElButton, ElDrawer, ElSelect, ElOption, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import MaaLibraryPanel from '../MaaLibraryPanel.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import { createScriptFromForeground, fetchEditorDrafts, fetchForegroundPackage } from '../../../shared/api/maa-script-editor'
import type { MaaScript } from '../../../shared/api/maa'
import { normalizeApiError } from '../../../shared/api/client'
import { useCursorPage } from '../../../shared/api/pagination'
import { fetchTargetDevice, fetchTargetDevices, type TargetDevice } from '../../../shared/api/terminals'
import { phoneAvailability } from '../../../shared/presentation/phone-availability'
import EditorVideoPanel from './EditorVideoPanel.vue'
import FloatingPhonePanel from './FloatingPhonePanel.vue'
import ScriptWorkflowPanel from './ScriptWorkflowPanel.vue'
import { readEditorResume, writeEditorResume } from './editor-resume'
const route=useRoute()
const router=useRouter()
const libraryOpen=ref(route.query.library==='1')
watch(()=>route.query.library,v=>{if(v==='1')libraryOpen.value=true})
watch(()=>route.query.script_id,()=>{libraryOpen.value=false;phoneDocked.value=false;phoneHidden.value=false})
const devices=useCursorPage<TargetDevice,string>(fetchTargetDevices,d=>d.device_id)
const selected=ref<string>()
const resumedStep=ref(1)
const device=computed(()=>devices.items.value.find(d=>d.device_id===selected.value))
let phoneTimer: ReturnType<typeof setInterval> | undefined
async function refreshSelectedPhone() {
  const id = selected.value
  if (!id) return
  try {
    const latest = await fetchTargetDevice(id)
    if (selected.value === id) devices.items.value = devices.items.value.map(
      item => item.device_id === id ? latest : item,
    )
  } catch {
    if (selected.value === id) devices.items.value = devices.items.value.map(item =>
      item.device_id === id ? { ...item, availability: 'unknown', availability_reason: 'status_refresh_failed' } : item,
    )
  }
}
const landscape=ref(false)
const connected=ref(false)
const phoneDocked=ref(false)
const phoneHidden=ref(false)
const screenshotUrl=ref<string>()
const creating=ref(false)
const createError=ref('')
const drafts=ref<MaaScript[]>([])
const draftChoice=ref('')
const draftLoading=ref(false)
const draftError=ref('')
let draftGeneration=0
let draftController: AbortController | undefined
async function loadDrafts() {
  const generation=++draftGeneration
  draftController?.abort()
  draftController = new AbortController()
  const deviceId=selected.value
  drafts.value=[]
  draftError.value=''
  if (!deviceId) { draftLoading.value=false; return }
  draftLoading.value=true
  try {
    const result=await fetchEditorDrafts(deviceId, draftController.signal)
    if (generation===draftGeneration) drafts.value=result
  } catch (cause) {
    if (generation===draftGeneration) draftError.value=normalizeApiError(cause).message
  } finally { if (generation===draftGeneration) draftLoading.value=false }
}
async function openDraft(id:string) {
  if (!id) return
  await router.push({path:'/editor',query:{script_id:id}})
  draftChoice.value=''
}
let pendingCreate: { deviceId: string; packageName: string; key: string } | undefined
async function createScript() {
  if (!selected.value || !connected.value || creating.value) return
  const deviceId = selected.value
  creating.value = true
  createError.value = ''
  try {
    const packageName = await fetchForegroundPackage(deviceId)
    await ElMessageBox.confirm(`当前手机前台应用：${packageName}。确定为这个应用创建脚本？`,
      '从前台应用创建脚本', { confirmButtonText:'创建', cancelButtonText:'取消' })
    if (selected.value !== deviceId || !connected.value) throw new Error('手机会话已变化，请重试')
    if (!pendingCreate || pendingCreate.deviceId !== deviceId || pendingCreate.packageName !== packageName)
      pendingCreate = { deviceId, packageName, key: crypto.randomUUID() }
    const created = await createScriptFromForeground(deviceId, pendingCreate.key)
    pendingCreate = undefined
    await router.push({ path:'/editor', query:{ script_id:created.script_id } })
    void loadDrafts()
  } catch (cause) {
    if (cause !== 'cancel') createError.value = normalizeApiError(cause).message
  } finally { creating.value = false }
}
watch(selected,()=>{phoneDocked.value=false;phoneHidden.value=false;connected.value=false;screenshotUrl.value=undefined;draftChoice.value='';void loadDrafts();void refreshSelectedPhone()})
watch([() => route.query.script_id, selected], ([scriptId, deviceId]) => {
  if (typeof scriptId !== 'string') return
  const previous = readEditorResume()
  const step = previous?.scriptId === scriptId ? previous.step : 1
  writeEditorResume({ scriptId, deviceId, step, restoreDraft: previous?.scriptId === scriptId && previous.restoreDraft })
})
watch(()=>device.value?.availability, value=>{if(value==='disconnected'||value==='unauthorized'){connected.value=false;screenshotUrl.value=undefined}})
function geometry(w:number,h:number){connected.value=!!(w&&h);if(w&&h)landscape.value=w>h}
onMounted(()=>{
  void (async () => {
    const resume = readEditorResume()
    await devices.load(true)
    if (typeof route.query.script_id !== 'string' && resume?.scriptId) {
      await router.replace({ path: '/editor', query: { script_id: resume.scriptId, step: String(resume.step) } })
    }
    if (resume && resume.scriptId === route.query.script_id && resume.deviceId) {
      resumedStep.value = resume.step
      if (!devices.items.value.some(item => item.device_id === resume.deviceId)) {
        try { devices.items.value = [...devices.items.value, await fetchTargetDevice(resume.deviceId)] } catch { /* The phone may have been removed. */ }
      }
      if (devices.items.value.some(item => item.device_id === resume.deviceId)) selected.value = resume.deviceId
    }
  })()
  phoneTimer=setInterval(()=>{if(document.visibilityState==='visible')void refreshSelectedPhone()},10000)
})
onBeforeUnmount(()=>{clearInterval(phoneTimer);draftGeneration++;draftController?.abort()})
</script>
<template>
<div class="maa-studio">
  <Teleport defer to="#editor-shell-header">
    <div class="studio-topbar">
      <h1>Maa 编辑工作台</h1>
      <div class="studio-script-meta">
        <div id="editor-document-identity" />
        <span v-if="typeof route.query.script_id !== 'string'" class="studio-no-script">未打开脚本</span>
        <ElSelect v-if="selected" v-model="draftChoice" class="draft-picker" placeholder="继续草稿" :loading="draftLoading"
          aria-label="继续未保存脚本" @visible-change="open => { if (open) void loadDrafts() }" @change="openDraft">
          <ElOption v-for="draft in drafts" :key="draft.script_id" :value="draft.script_id"
            :label="`${draft.name} · ${draft.script_type === 'module_start' ? '开始' : draft.script_type === 'module_end' ? '结束' : '过程'}`" />
        </ElSelect>
      </div>
      <div class="studio-actions">
        <ElButton type="primary" :disabled="!selected || !connected" :loading="creating" @click="createScript">新建脚本</ElButton>
        <ElButton @click="libraryOpen=true">脚本库</ElButton>
        <div id="editor-document-tools" />
      </div>
    </div>
  </Teleport>
  <p v-if="draftError || createError" class="studio-notice" role="alert">{{ draftError ? `草稿列表读取失败：${draftError}` : createError }}</p>
  <ElDrawer v-model="libraryOpen" direction="ltr" size="100vw" class="maa-library-drawer" :with-header="false"
    :close-on-click-modal="false" :close-on-press-escape="false" :destroy-on-close="true">
    <MaaLibraryPanel @opened="libraryOpen=false" @close="libraryOpen=false" />
  </ElDrawer>
  <div class="studio-panels">
    <div class="studio-workflow">
      <ScriptWorkflowPanel v-if="typeof route.query.script_id==='string' && device" :key="route.query.script_id + ':' + selected" :script-id="route.query.script_id"
        :initial-step="Number(route.query.step)||resumedStep" :device="device" :screenshot-url="screenshotUrl" :screen-landscape="landscape" identity-target="#editor-document-identity" toolbar-target="#editor-document-tools" footer-target="#editor-workspace-footer" @saved="loadDrafts" @phone-dock="phoneDocked = $event" @phone-hidden="phoneHidden = $event" />
      <div v-else class="studio-empty">{{ route.query.script_id ? '先选择获授权的手机，再打开此脚本。' : '选择手机，打开已保存脚本，或从当前前台应用新建脚本。' }}</div>
    </div>
    <FloatingPhonePanel v-show="!phoneHidden" :landscape="landscape" :connected="connected" :docked="phoneDocked">
      <div class="phone-content" :class="{'phone-disconnected':!connected}">
        <div class="phone-device-select"><ElSelect v-model="selected" placeholder="选择挂载手机" aria-label="选择手机" clearable :teleported="false">
          <ElOption v-for="d in devices.items.value" :key="d.device_id" :value="d.device_id" :label="`${d.display_name}（${phoneAvailability(d).label}）`" :disabled="d.mode!=='mounted'" />
        </ElSelect><span v-if="device" class="phone-availability" :class="{ connected: device.availability === 'connected' }" title="手机连接状态">{{ phoneAvailability(device).label }}</span><ElButton :icon="Refresh" aria-label="刷新设备" title="刷新设备" :loading="devices.loading.value" @click="devices.load(true)" /><ElButton v-if="devices.nextCursor.value" @click="devices.load()">更多</ElButton></div>
        <p v-if="devices.error.value" role="alert">{{ devices.error.value.message }}</p>
        <p v-if="device && device.availability !== 'connected'">{{ phoneAvailability(device).label }}：{{ phoneAvailability(device).guidance }} 已保存脚本仍可编辑。</p>
        <EditorVideoPanel v-if="selected && device?.availability !== 'disconnected' && device?.availability !== 'unauthorized'" :key="selected" :device-id="selected" @geometry="geometry" @screenshot-url="screenshotUrl=$event" />
        <p v-else>请选择手机</p>
      </div>
    </FloatingPhonePanel>
  </div>
  <footer class="studio-statusbar">
    <div id="editor-workspace-footer" class="studio-footer-slot"></div>
  </footer>
</div>
</template>
<style scoped>
:global(.maa-library-drawer .el-drawer__body) { padding:0; overflow:hidden; }
.maa-studio { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; }
.studio-topbar { display:flex; align-items:center; gap:12px; width:100%; min-width:0; white-space:nowrap; }
.studio-topbar h1 { flex:none; margin:0; font-size:18px; }
.studio-script-meta { display:flex; align-items:center; gap:12px; min-width:0; padding-left:12px; border-left:1px solid var(--border); }
.studio-no-script { color:var(--muted); font-size:13px; }
.studio-actions { display:flex; align-items:center; gap:8px; margin-left:auto; flex:none; }
.studio-actions :deep(.el-button + .el-button) { margin-left:0; }
.draft-picker { width:138px; flex:none; }
.studio-notice { margin:0; padding:6px 16px; color:var(--el-color-danger); font-size:12px; }
.studio-panels { position:relative; display:flex; flex:1; min-height:0; width:100%; }
.studio-workflow { flex:1; min-height:0; min-width:0; overflow:hidden; }
.studio-empty { padding:30px; color:var(--muted); }
.studio-statusbar { display:flex; align-items:center; gap:14px; flex:none; height:36px; padding:0 14px; border-top:1px solid var(--border); background:var(--surface); }
.studio-log-slot { flex:none; min-width:160px; max-height:inherit; }
.studio-footer-slot { flex:1; min-width:0; overflow-x:auto; scrollbar-width:thin; color:var(--muted); font-size:12px; }
.phone-content { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; overflow:visible; padding:0; }
.phone-device-select { display:flex; align-items:center; gap:8px; flex:none; min-height:58px; padding:7px 12px; border-bottom:1px solid var(--border); }
.phone-device-select .el-select { min-width:0; flex:1; }
.phone-device-select .el-button { flex:none; width:38px; height:38px; margin:0; padding:0; }
.phone-availability { flex:none; color:var(--muted); font-size:12px; white-space:nowrap; }
.phone-availability::before { content:''; display:inline-block; width:8px; height:8px; margin-right:7px; border-radius:50%; background:var(--muted); }
.phone-availability.connected::before { background:var(--el-color-success); }
.phone-content :deep(.editor-video-panel) { flex:1; }
.phone-disconnected :deep(.video-stage) { display:none; }
.pick-result { font-size:12px; color:var(--accent); margin:6px; }
</style>
