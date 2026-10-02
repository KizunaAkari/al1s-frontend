<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchBotRuntimeStatus, type BotRuntimeStatus } from '../../shared/api/bot-runtime'

const POLL_INTERVAL_MS = 10_000

const props = defineProps<{ serviceId: string }>()
const status = ref<BotRuntimeStatus | null>(null)
const loading = ref(false)
const failed = ref(false)
let generation = 0
let disposed = false
let inFlight = false
let timer: ReturnType<typeof setInterval> | undefined
let controller: AbortController | null = null

const stateLabels: Record<BotRuntimeStatus['state'], string> = {
  online: '在线', offline: '离线', unknown: '未知', disabled: '已停用', unconfigured: '未配置',
}
const reasonLabels: Record<string, string> = {
  online: '连接正常',
  qq_not_logged_in: 'QQ 未登录',
  qq_gateway_unhealthy: 'QQ 网关异常',
  qq_status_unavailable: 'QQ 状态不可用',
  qq_status_invalid: 'QQ 状态无效',
  discord_heartbeat_missing: 'Discord 心跳缺失',
  discord_heartbeat_stale: 'Discord 心跳过期',
  discord_config_mismatch: 'Discord 配置不一致',
  discord_disconnected: 'Discord 已断开',
  discord_stopping: 'Discord 正在停止',
  disabled: '连接已停用',
  unconfigured: '尚未配置',
}
const errorLabels: Record<string, string> = {
  discord_login_timeout: 'Discord 登录超时',
  discord_authentication_failed: 'Discord 鉴权失败',
  discord_connection_error: 'Discord 连接错误',
  discord_gateway_disconnected: 'Discord Gateway 已断开',
  discord_client_error: 'Discord 客户端错误',
}

const stateLabel = computed(() => stateLabels[status.value?.state ?? 'unknown'] ?? '未知')
const reasonLabel = computed(() => {
  const code = status.value?.reason_code
  return code ? (reasonLabels[code] ?? code) : ''
})
const errorLabel = computed(() => {
  const code = status.value?.error_code
  return code ? (errorLabels[code] ?? code) : ''
})
const activity = computed(() => {
  const current = status.value
  if (!current) return null
  return current.observed_at
    ? { label: '最近观测', value: current.observed_at }
    : { label: '检查时间', value: current.checked_at }
})

async function refresh() {
  if (disposed || inFlight || !props.serviceId) return
  const currentGeneration = ++generation
  const serviceId = props.serviceId
  const requestController = new AbortController()
  controller = requestController
  inFlight = true
  loading.value = true
  failed.value = false
  try {
    const result = await fetchBotRuntimeStatus(serviceId, requestController.signal)
    if (disposed || currentGeneration !== generation || serviceId !== props.serviceId) return
    status.value = result
  } catch {
    if (disposed || currentGeneration !== generation || serviceId !== props.serviceId) return
    status.value = null
    failed.value = true
  } finally {
    if (controller === requestController) controller = null
    if (!disposed && currentGeneration === generation && serviceId === props.serviceId) {
      inFlight = false
      loading.value = false
    }
  }
}

function resetForService() {
  generation += 1
  controller?.abort()
  controller = null
  inFlight = false
  loading.value = false
  failed.value = false
  status.value = null
  void refresh()
}

watch(() => props.serviceId, resetForService, { immediate: true })
onMounted(() => { timer = setInterval(() => { void refresh() }, POLL_INTERVAL_MS) })
onBeforeUnmount(() => {
  disposed = true
  generation += 1
  clearInterval(timer)
  controller?.abort()
  controller = null
})
</script>

<template>
  <section class="bot-online-status" aria-label="Bot 在线状态">
    <div class="bot-online-heading">
      <span>账号在线状态</span>
      <strong :class="['bot-online-value', `bot-online-${status?.state ?? 'unknown'}`]">{{ stateLabel }}</strong>
    </div>
    <p v-if="reasonLabel" class="bot-online-detail">原因：{{ reasonLabel }}</p>
    <p v-if="errorLabel" class="bot-online-detail">错误：{{ errorLabel }}</p>
    <p v-if="activity" class="bot-online-detail">{{ activity.label }}：<time :datetime="activity.value">{{ activity.value }}</time></p>
    <p v-if="failed" class="bot-online-error" role="alert">无法获取 Bot 在线状态，请稍后刷新。</p>
    <button type="button" class="bot-online-refresh" :disabled="loading" @click="refresh">{{ loading ? '检查中…' : '刷新在线状态' }}</button>
  </section>
</template>

<style scoped>
.bot-online-status { display: grid; gap: 6px; min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); }
.bot-online-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bot-online-heading > span, .bot-online-detail { color: var(--muted); font-size: 13px; }
.bot-online-value { font-size: 18px; }
.bot-online-online { color: #129b6a; }
.bot-online-offline { color: #bd3838; }
.bot-online-unknown { color: var(--muted); }
.bot-online-disabled, .bot-online-unconfigured { color: #a85c00; }
.bot-online-detail, .bot-online-error { margin: 0; line-height: 1.45; overflow-wrap: anywhere; }
.bot-online-error { color: #bd3838; }
.bot-online-refresh { justify-self: start; margin-top: 3px; padding: 5px 10px; border: 1px solid var(--border-strong); border-radius: 6px; color: var(--accent); background: var(--surface); cursor: pointer; }
.bot-online-refresh:disabled { cursor: default; opacity: .65; }
@media (max-width: 600px) { .bot-online-heading { align-items: flex-start; } }
</style>
