<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { ElButton, ElDialog, ElMessageBox, ElOption, ElSelect } from 'element-plus'
import type { MaaApplication } from '../../shared/api/maa'
import { fetchTargetDevices, type TargetDevice } from '../../shared/api/terminals'
import { useCursorPage } from '../../shared/api/pagination'
import { normalizeApiError } from '../../shared/api/client'
import {
  bindApplicationDevice, fetchApplicationDevices, unbindApplicationDevice,
  type ApplicationDevice,
} from '../../shared/api/maa-applicability'

const props = defineProps<{ application?: MaaApplication }>()
const devices = useCursorPage<TargetDevice, string>(fetchTargetDevices, d => d.device_id)
const bindings = ref<ApplicationDevice[]>([])
const selected = ref('')
const managing = ref(false)
const busy = ref(false)
const error = ref('')
let generation = 0
const available = computed(() => devices.items.value.filter(
  d => !bindings.value.some(b => b.device_id === d.device_id),
))
function label(id: string): string {
  const device = devices.items.value.find(d => d.device_id === id)
  return device ? `${device.display_name} (${id})` : id
}
function displayName(id: string): string {
  return devices.items.value.find(d => d.device_id === id)?.display_name ?? id
}
async function load(): Promise<void> {
  const applicationId = props.application?.application_id
  const current = ++generation
  bindings.value = []
  selected.value = ''
  error.value = ''
  if (!applicationId) return
  try {
    const result = await fetchApplicationDevices(applicationId)
    if (current === generation) bindings.value = result
  } catch (cause) {
    if (current === generation) error.value = normalizeApiError(cause).message
  }
}
async function bind(): Promise<void> {
  if (!props.application || !selected.value || busy.value) return
  const applicationId = props.application.application_id
  const deviceId = selected.value
  busy.value = true
  error.value = ''
  try {
    await ElMessageBox.confirm(`允许 ${label(deviceId)} 使用分类“${props.application.display_name}”中的全部脚本？`,
      '确认适用手机', { confirmButtonText: '绑定', cancelButtonText: '取消' })
    await bindApplicationDevice(applicationId, deviceId, crypto.randomUUID())
    await load()
  } catch (cause) {
    if (cause !== 'cancel') error.value = normalizeApiError(cause).message
  } finally { busy.value = false }
}
async function unbind(deviceId: string): Promise<void> {
  if (!props.application || busy.value) return
  const applicationId = props.application.application_id
  busy.value = true
  error.value = ''
  try {
    await ElMessageBox.confirm(`解除 ${label(deviceId)} 的分类授权？已下发且未结束的任务会阻止此操作。`,
      '确认解绑', { confirmButtonText: '解绑', cancelButtonText: '取消', type: 'warning' })
    await unbindApplicationDevice(applicationId, deviceId, crypto.randomUUID())
    await load()
  } catch (cause) {
    if (cause !== 'cancel') error.value = normalizeApiError(cause).message
  } finally { busy.value = false }
}
watch(() => props.application?.application_id, load, { immediate: true })
onMounted(() => { void devices.load(true) })
</script>

<template>
  <section v-if="application" class="application-devices" aria-label="分类适用手机">
    <strong>适用手机 </strong>
    <div class="device-summary">
      <span v-for="item in bindings.slice(0, 3)" :key="item.device_id" class="device-chip" :title="label(item.device_id)">{{ displayName(item.device_id) }}</span>
      <span v-if="!bindings.length" class="device-muted">尚无授权手机</span>
      <span v-if="bindings.length > 3" class="device-muted">另 {{ bindings.length - 3 }} 部</span>
    </div>
    <span class="device-muted">已授权 {{ bindings.length }} 部</span>
    <ElButton link type="primary" @click="managing = true">管理授权</ElButton>
    <ElDialog v-model="managing" title="管理分类适用手机" width="min(720px, 96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
      <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">管理分类适用手机 <HelpHint subject="分类手机授权">按平台逻辑手机 ID 授权；Linux 终端不自动继承。从手机创建分类时会自动绑定创建手机。</HelpHint></span></template>
      <div class="device-manager">
        
        <ul v-if="bindings.length">
          <li v-for="item in bindings" :key="item.device_id">
            <span>{{ label(item.device_id) }}</span>
            <ElButton size="small" :disabled="busy" @click="unbind(item.device_id)">解绑</ElButton>
          </li>
        </ul>
        <p v-else>尚无授权手机</p>
        <div class="device-bind-controls">
          <ElSelect v-model="selected" filterable placeholder="选择已注册或挂载手机" :disabled="busy">
            <ElOption v-for="device in available" :key="device.device_id" :label="label(device.device_id)" :value="device.device_id" />
          </ElSelect>
          <ElButton :disabled="!selected || busy" :loading="busy" @click="bind">授权手机</ElButton>
          <ElButton v-if="devices.nextCursor.value" :loading="devices.loading.value" @click="devices.load()">更多手机</ElButton>
        </div>
        <p v-if="devices.error.value" role="alert">手机列表加载失败：{{ devices.error.value.message }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
    </ElDialog>
  </section>
</template>

<style scoped>
.application-devices { display:flex; align-items:center; gap:16px; min-width:0; padding:12px 16px; border-radius:10px; background:var(--surface-soft); }
.application-devices > strong { flex:none; }
.device-summary { display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; }
.device-chip { min-width:0; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:5px 10px; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
.device-muted { flex:none; color:var(--muted); font-size:12px; }
.application-devices > .el-button { margin-left:auto; flex:none; }
.device-manager { display:grid; gap:16px; }
.device-manager p { margin:0; color:var(--muted); font-size:13px; }
.device-manager ul { margin:0; padding:0; list-style:none; display:grid; gap:6px; }
.device-manager li,.device-bind-controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.device-manager li span { flex:1; overflow-wrap:anywhere; }
.device-bind-controls .el-select { min-width:220px; flex:1; }
@media (max-width: 620px) {
  .application-devices { flex-wrap:wrap; gap:8px; }
  .device-summary { order:2; flex-basis:100%; }
  .application-devices > .el-button { margin-left:auto; }
}
</style>
