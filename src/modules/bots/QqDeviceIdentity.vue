<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElButton, ElInput, ElMessageBox } from 'element-plus'
import HelpHint from '../../shared/ui/HelpHint.vue'
import { ApiError } from '../../shared/api/client'
import { qqDeviceIdentityApi, type QqDeviceSettings, type QqIdentityState } from '../../shared/api/qq-device-identity'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const state = ref<QqIdentityState | null>(null)
const draft = reactive<QqDeviceSettings>({ device_name: '', guid: '' })
const busy = ref(false), known = ref(false), uncertain = ref(false), error = ref('')
let alive = true, generation = 0
const dirty = computed(() => state.value && (draft.device_name !== state.value.desired.device_name || draft.guid !== state.value.desired.guid))
const available = computed(() => state.value?.mode !== 'pmhq' && state.value?.available !== false)
const status = computed(() => !known.value || uncertain.value ? '未知' : !available.value ? '不适用' : state.value?.error_code ? '应用失败' : state.value?.pending ? '待重启' : '已应用')
const saveDisabled = computed(() => busy.value || !known.value || uncertain.value || !props.active || !available.value)
function current(epoch: number) { return alive && props.active && epoch === generation }
function message(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === 'qq_identity_revision_changed') return '设置已变化，请刷新核对；你的草稿已保留。'
    if (cause.code.includes('maintenance')) return 'QQ 正在维护，请等待操作结束后刷新。'
    if (cause.code.includes('unsupported')) return '当前 QQ 运行时不支持此设置，请选择支持的完整版本。'
    if (cause.code === 'qq_identity_apply_unresolved') return '上一次设备应用尚未完成，请先核对应用失败原因。'
  }
  return cause instanceof Error ? cause.message : '设备设置操作失败，请刷新核对。'
}
async function load(preserveDraft = true) {
  if (busy.value || !props.active) return
  const epoch = ++generation, keep = preserveDraft && dirty.value
  busy.value = true; error.value = ''
  try {
    const value = await qqDeviceIdentityApi.read()
    if (!current(epoch)) return
    state.value = value; known.value = true; uncertain.value = false
    if (!keep) Object.assign(draft, value.desired)
  } catch (cause) {
    if (current(epoch)) { known.value = false; error.value = message(cause) }
  } finally { if (current(epoch)) busy.value = false }
}
function randomGuid() {
  if (saveDisabled.value) return
  try { draft.guid = crypto.randomUUID().replaceAll('-', ''); error.value = '' }
  catch { error.value = '当前浏览器无法生成随机 GUID，请手动填写。' }
}
function validated(): QqDeviceSettings | null {
  const name = draft.device_name.trim(), guid = draft.guid.trim()
  if (Array.from(name).length > 64 || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(name)) {
    error.value = '设备名最多 64 个字符，不能包含控制字符。'; return null
  }
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(guid) || guid.replaceAll('-', '') === '0'.repeat(32)) {
    error.value = 'GUID 请填写非全零的 32 位十六进制或标准 UUID。'; return null
  }
  return { device_name: name, guid: guid.replaceAll('-', '').toLowerCase() }
}
async function save() {
  if (saveDisabled.value || !state.value) return
  error.value = ''
  const settings = validated()
  if (!settings) return
  const revision = state.value.revision, changedGuid = settings.guid !== state.value.current_guid
  const epoch = ++generation
  busy.value = true
  try {
    if (changedGuid) {
      try {
        await ElMessageBox.confirm('下一次重启 QQ 容器时，会备份并封存该目录的全部旧登录会话，应用新 GUID 后需要重新扫码。账号配置会保留。', '更换 QQ 设备 GUID', { type: 'warning', confirmButtonText: '确认并保存', cancelButtonText: '取消' })
      } catch { return }
    }
    if (!current(epoch)) return
    const value = await qqDeviceIdentityApi.save(settings, revision, crypto.randomUUID(), changedGuid)
    if (!current(epoch)) return
    state.value = value; Object.assign(draft, value.desired); known.value = true
  } catch (cause) {
    if (!current(epoch)) return
    if (cause instanceof ApiError && ['request_timeout', 'network_error', 'qq_identity_unavailable_or_result_unknown'].includes(cause.code)) {
      uncertain.value = true; error.value = '保存结果未知，请先刷新核对，不要重复提交。'
    } else error.value = message(cause)
  } finally { if (current(epoch)) busy.value = false }
}
watch(() => props.active, active => {
  ++generation; busy.value = false
  if (active) void load()
})
onMounted(() => void load(false))
onBeforeUnmount(() => { alive = false; ++generation })
</script>

<template>
  <section class="bot-card qq-device-identity" data-test="qq-device-identity">
    <div class="bot-card-heading"><h2>登录设备 <HelpHint subject="登录设备">设备名留空使用 LLBot 默认名称。只改名称保留登录会话；更换 GUID 需要重新扫码。保存后下一次启动或重启 QQ 容器生效。</HelpHint></h2><span class="bot-pill">{{ status }}</span></div>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <p v-if="!available" class="bot-help">当前使用真实 QQ 客户端（PMHQ 有头模式），以下 Direct 设备设置不适用，已保留供恢复使用。此处的设备名和 GUID 不代表当前客户端身份。</p>
    <p v-if="available && state?.error_code" class="bot-inline-error">设备设置应用失败，原生登录已暂停。请核对原因后重启。<code>{{ state.error_code }}</code></p>
    <div v-if="state" class="qq-device-current">
      <div><span>{{ available ? '启动时设备名' : '原 Direct 设备名' }}</span><strong>{{ state.applied?.reported_device_name ?? '等待容器启动' }}</strong></div>
      <div><span>{{ available ? '当前 GUID' : '原 Direct GUID' }}</span><code>{{ state.current_guid }}</code></div>
    </div>
    <div class="qq-device-fields">
      <label class="bot-field" for="qq-device-name"><span>登录设备名</span><ElInput id="qq-device-name" v-model="draft.device_name" :disabled="busy || !available" placeholder="留空使用默认名称" data-test="device-name" /></label>
      <label class="bot-field" for="qq-device-guid"><span>设备 GUID</span><ElInput id="qq-device-guid" v-model="draft.guid" :disabled="busy || !available" placeholder="32 位十六进制或 UUID" data-test="device-guid" /></label>
    </div>
    <p v-if="available && state?.pending" class="bot-help">已保存，待重启 QQ 容器后生效。待生效设备名：{{ state.desired.device_name || '默认名称' }}；GUID：<code>{{ state.desired.guid }}</code></p>
    <div class="bot-actions">
      <ElButton type="primary" :disabled="saveDisabled" data-action="save-identity" @click="save">保存设备设置</ElButton>
      <ElButton :disabled="saveDisabled" data-action="random-guid" @click="randomGuid">生成随机 GUID</ElButton>
      <ElButton :disabled="busy" data-action="refresh-identity" @click="load(true)">刷新</ElButton>
    </div>
    <small v-if="state" class="qq-device-time">观测时间：{{ new Date(state.observed_at).toLocaleString() }} · 设备应用状态与 QQ 在线状态分别显示</small>
  </section>
</template>

<style scoped>
.qq-device-fields, .qq-device-current { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 16px 0; }
.qq-device-current > div { display: grid; gap: 8px; min-width: 0; }
.qq-device-current span, .qq-device-time { color: var(--muted); font-size: 13px; }
.qq-device-identity code, .qq-device-current strong { overflow-wrap: anywhere; }
.qq-device-time { display: block; margin-top: 14px; }
@media (max-width: 640px) { .qq-device-fields, .qq-device-current { grid-template-columns: 1fr; } }
</style>
