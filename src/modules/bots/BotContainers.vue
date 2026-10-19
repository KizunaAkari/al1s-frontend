<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElMessageBox } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import BotOnlineStatus from './BotOnlineStatus.vue'

type Alias = 'qq' | 'discord'
type Action = 'start' | 'stop' | 'restart'
type State = { running: boolean; status: string; health: string; revision: string; started_at: string | null }
const props = defineProps<{ alias: Alias; serviceId?: string | null; showOnline?: boolean }>()
const emit = defineEmits<{ state: [value: { alias: Alias; state: State | null }] }>()
const state = ref<State | null>(null)
const error = ref('')
const busy = ref(false)
const actions: Record<Action, string> = { start: '启动', stop: '停止', restart: '重启' }
let requestNo = 0
let disposed = false
function publish() { emit('state', { alias: props.alias, state: state.value }) }

function containerLabel(value: State | null) {
  if (!value) return '未知'
  if (value.status === 'restarting') return '重启中'
  return value.running ? '运行中' : '已停止'
}
function healthLabel(value: State | null) {
  if (!value) return busy.value ? '检查中' : '未知'
  return ({ healthy: '正常', unhealthy: '异常', starting: '检查中', not_configured: '未配置' } as Record<string, string>)[value.health] ?? '异常'
}

async function refresh() {
  if (disposed) return
  const request = ++requestNo, alias = props.alias
  busy.value = true; error.value = ''
  try {
    const result = (await apiClient.get<State>(`/bots/containers/${alias}`, { timeout: 85_000 })).data
    if (!disposed && request === requestNo && alias === props.alias) { state.value = result; publish() }
  } catch {
    if (!disposed && request === requestNo && alias === props.alias) {
      state.value = null; publish(); error.value = '管理代理不可达或目标未登记；暂无法读取容器状态。'
    }
  } finally { if (!disposed && request === requestNo) busy.value = false }
}
async function run(action: Action) {
  if (!state.value || busy.value || disposed) return
  const alias = props.alias, revision = state.value.revision, request = ++requestNo
  try {
    await ElMessageBox.confirm(`确认${actions[action]} ${alias === 'qq' ? 'QQ Bot' : 'Discord Bot'}？消息收发可能暂时中断。`, '容器操作', { type: 'warning' })
  } catch { return }
  if (disposed || alias !== props.alias || request !== requestNo || state.value?.revision !== revision) return
  busy.value = true; error.value = ''
  try {
    const result = (await apiClient.post<State>(`/bots/containers/${alias}`, { action, revision }, { timeout: 85_000 })).data
    if (!disposed && alias === props.alias && request === requestNo) { state.value = result; publish() }
  } catch {
    if (!disposed && alias === props.alias && request === requestNo) {
      state.value = null; publish(); error.value = '操作未确认或状态已变化。请刷新后核对实际状态。'
    }
  } finally { if (!disposed && request === requestNo) busy.value = false }
}
watch(() => props.alias, () => { state.value = null; publish(); void refresh() })
onMounted(() => { void refresh() })
onBeforeUnmount(() => { disposed = true; requestNo++ })
defineExpose({ refresh, busy })
</script>

<template>
  <section class="bot-card bot-container">
    <div class="bot-card-heading"><h2>容器管理</h2><el-button text :loading="busy" @click="refresh()">刷新状态</el-button></div>
    <div class="bot-status-grid">
      <div><span>容器状态</span><strong>{{ containerLabel(state) }}</strong></div>
      <div><span>容器健康检查</span><strong>{{ healthLabel(state) }}</strong></div>
    </div>
    <div v-if="error" class="bot-warning"><strong>暂时无法获取容器状态</strong><p>{{ error }}</p></div>
    <p v-else class="bot-help">启动时间：{{ state?.started_at ?? '未知' }}</p>
    <BotOnlineStatus v-if="serviceId && showOnline !== false" :service-id="serviceId" />
    <p v-else-if="showOnline !== false" class="bot-help">请选择连接以查看账号在线状态。</p>
    <div class="bot-actions bot-container-actions"><el-button v-for="action in (['start', 'stop', 'restart'] as const)" :key="action" :disabled="busy || !state" @click="run(action)">{{ actions[action] }}</el-button></div>
    
  </section>
</template>
