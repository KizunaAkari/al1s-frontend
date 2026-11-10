<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiClient } from '../../../shared/api/client'
import { fetchDrawingResources, type DrawingResources } from '../../../shared/api/bot-drawing'

const props = defineProps<{ serviceId?: string; visionEnabled?: boolean; syncing?: boolean }>()
type State = 'checking' | 'running' | 'stopped' | 'incompatible' | 'unknown'
const state = ref<State>('checking')
const resources = ref<DrawingResources | null>(null)
const pending = ref<'start' | 'stop' | null>(null)
const error = ref('')
let active = true, checking = false, since = 0, timedOut: 'start' | 'stop' | null = null
let poll: ReturnType<typeof setInterval> | undefined, deferred: ReturnType<typeof setTimeout> | undefined
const label = computed(() => pending.value === 'stop' ? '停止中' : pending.value === 'start' ? '启动中' :
  ({ checking: '检查中', running: '运行中', stopped: '未启动', incompatible: '服务不兼容', unknown: '状态未知' })[state.value])
const disabled = computed(() => Boolean(pending.value) || state.value === 'checking' || state.value === 'incompatible')
const action = computed(() => state.value === 'running' ? 'stop' : 'start')
const visionLabel = computed(() => {
  if (props.syncing) return '配置同步中'
  if (!props.visionEnabled) return '已关闭'
  if (state.value !== 'running') return '共享服务未就绪'
  if (!resources.value || resources.value.state !== 'available') return '预热状态暂不可用'
  const names = { disabled: '等待配置同步', cold: '等待预热', loading: '预热或识图中',
    warm: '已预热', suspended: '绘图期间暂让显存' }
  return resources.value.vision_state ? names[resources.value.vision_state] : '预热状态待核对'
})

async function refresh() {
  if (checking) return
  checking = true
  try {
    const response = await apiClient.get<{ state: State }>('/bots/ai/local-vision/status', { timeout: 10_000 })
    if (!active) return
    state.value = response.data.state
  } catch { if (!active) return; state.value = 'unknown' }
  if (props.serviceId) {
    const id = props.serviceId
    try {
      const value = await fetchDrawingResources(id)
      if (active && props.serviceId === id) resources.value = value
    } catch { if (active && props.serviceId === id) resources.value = null }
  }
  checking = false
  if ((pending.value === 'start' && state.value === 'running') ||
      (pending.value === 'stop' && state.value === 'stopped')) pending.value = null
  if ((timedOut === 'start' && state.value === 'running') ||
      (timedOut === 'stop' && state.value === 'stopped')) { timedOut = null; error.value = '' }
  if (pending.value && Date.now() - since >= (pending.value === 'start' ? 180_000 : 60_000)) {
    timedOut = pending.value
    error.value = pending.value === 'stop' ? '停止超时，尚未确认服务已停止；请检查本机启动入口。' :
      '启动超时，请确认浏览器已允许打开本机应用后重试。'
    pending.value = null
  }
}
function invoke(event: MouseEvent) {
  if (deferred || disabled.value) { event.preventDefault(); return }
  const requested = action.value
  if (requested === 'stop' && !window.confirm('停止共享 ComfyUI 服务？图片理解和绘图都会受到影响，正在处理的任务会被中断。')) {
    event.preventDefault(); return
  }
  deferred = setTimeout(() => {
    deferred = undefined
    if (active) { pending.value = requested; timedOut = null; error.value = ''; since = Date.now() }
  }, 0)
}
onMounted(() => { void refresh(); poll = setInterval(() => { void refresh() }, 5000) })
watch(() => props.serviceId, () => { resources.value = null; void refresh() })
onBeforeUnmount(() => { active = false; if (poll) clearInterval(poll); if (deferred) clearTimeout(deferred) })
</script>

<template>
  <div class="local-vision" data-local-vision>
    <div class="local-vision-line">
      <span aria-live="polite">共享 ComfyUI 服务：<strong :class="{ online: state === 'running' && !pending }">{{ label }}</strong></span>
      <a :href="`al1s-vision://${action}`" role="button" :data-action="`${action}-local-vision`"
        :aria-disabled="disabled" :tabindex="disabled ? -1 : 0" @click="invoke">
        {{ pending === 'stop' ? '正在停止…' : pending === 'start' ? '正在启动…' : action === 'stop' ? '停止共享服务' : '启动共享服务' }}
      </a>
    </div>
    <small v-if="serviceId" aria-live="polite">图片理解模型：{{ visionLabel }}</small>
    <small v-if="error" role="alert">{{ error }}</small>
    <small v-else-if="state === 'incompatible'">8188 端口上的服务与视觉节点不兼容，请检查本机 ComfyUI。</small>
    <small v-else>共享服务用于图片理解和绘图。仅安装了本机启动入口时可从浏览器启停；手动启动的服务请在启动器中操作。运行状态不代表模型已预热。</small>
  </div>
</template>
