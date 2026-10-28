<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchQuantSettings, fetchQuantStatus, saveQuantSettings, fetchQuantCredentials, saveQuantCredential, type CredentialProvider, type QuantAction, type QuantProvider, type QuantStatus, type QuantView, type QuantWrite } from '../../../shared/api/quant'

const props = defineProps<{ serviceId: string }>()
const view = ref<QuantView | null>(null)
const draft = ref<QuantWrite | null>(null)
const groups = ref('')
const health = ref<QuantStatus | null>(null), healthError = ref('')
const quoteHealth = computed(() => {
  const provider = draft.value?.settings.provider
  const key = provider === 'sina' ? 'minute' : provider === 'eastmoney' ? 'minute_east' : `minute_${provider}`
  return health.value?.source[key]
})
const labels: Record<QuantProvider, string> = { sina: '新浪', tencent: '腾讯', eastmoney: '东方财富', tushare: 'Tushare', gugudata: '咕咕数据' }
const credentialProviders: CredentialProvider[] = ['tushare', 'gugudata']
const configured = ref<Record<CredentialProvider, boolean>>({ tushare: false, gugudata: false })
const credentials = ref<Record<CredentialProvider, string>>({ tushare: '', gugudata: '' })
function sourceStatus(provider: QuantProvider) {
  if ((provider === 'tushare' || provider === 'gugudata') && !configured.value[provider]) return '未配置凭据'
  const key = provider === 'sina' ? 'minute' : provider === 'eastmoney' ? 'minute_east' : `minute_${provider}`
  const entry = health.value?.source[key]
  if (entry?.error) return '最近请求失败'
  return entry?.last_success ? `最近成功 ${entry.last_success}` : '尚未验证'
}
const busy = ref(false), error = ref(''), notice = ref('')
let generation = 0
let pending: { fingerprint: string; key: string } | null = null
const actions: { id: QuantAction; label: string; example: string }[] = [
  { id: 'open', label: '开户', example: '' }, { id: 'buy', label: '买入', example: '600000 100' },
  { id: 'sell', label: '卖出', example: '600000 100' }, { id: 'balance', label: '资产', example: '' },
  { id: 'positions', label: '持仓', example: '' }, { id: 'orders', label: '成交与委托', example: '' },
  { id: 'backtest', label: '回测', example: '双均线 600000 2025-01-01 2025-12-31' },
  { id: 'help', label: '帮助', example: '' },
]
function apply(value: QuantView) {
  view.value = value
  draft.value = JSON.parse(JSON.stringify({ settings: value.desired.settings, commands: value.desired.commands })) as QuantWrite
  groups.value = value.desired.settings.groups.join('\n')
}
async function load(id: string) {
  const request = ++generation
  view.value = null; draft.value = null; pending = null; error.value = ''; notice.value = ''
  busy.value = true
  void loadHealth(request)
  void loadCredentials(request)
  try { const value = await fetchQuantSettings(id); if (request === generation) apply(value) }
  catch (cause) { if (request === generation) error.value = cause instanceof Error ? cause.message : '读取量化配置失败' }
  finally { if (request === generation) busy.value = false }
}
async function loadCredentials(request = generation) {
  try { const result = await fetchQuantCredentials(); if (request === generation) configured.value = result }
  catch { if (request === generation) error.value = '无法读取数据源凭据状态' }
}
function moveSource(index: number, delta: number) {
  if (!draft.value) return
  const items = draft.value.settings.provider_order, other = index + delta
  if (other < 0 || other >= items.length) return
  ;[items[index], items[other]] = [items[other], items[index]]
  draft.value.settings.provider = items[0]
}
async function updateCredential(provider: CredentialProvider, clear = false) {
  if (busy.value || (!clear && !credentials.value[provider])) return
  const request = generation
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await saveQuantCredential(provider, clear ? null : credentials.value[provider])
    if (request === generation) { configured.value[provider] = result.configured; credentials.value[provider] = ''; notice.value = '数据源凭据已更新' }
  } catch { if (request === generation) error.value = '数据源凭据保存失败' }
  finally { if (request === generation) busy.value = false }
}
async function loadHealth(request = generation) {
  try { const result = await fetchQuantStatus(); if (request === generation) { health.value = result; healthError.value = '' } }
  catch { if (request === generation) { health.value = null; healthError.value = '量化进程暂不可用' } }
}
async function save() {
  if (!draft.value || !view.value || busy.value) return
  const request = generation, id = props.serviceId, version = view.value.desired.row_version
  const value: QuantWrite = JSON.parse(JSON.stringify(draft.value)) as QuantWrite
  value.settings.groups = groups.value.split(/[\s,，]+/).filter(Boolean)
  value.settings.event_ws_url = value.settings.event_ws_url?.trim() || null
  const fingerprint = JSON.stringify({ version, value })
  if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await saveQuantSettings(id, value, version, pending.key)
    if (request !== generation) return
    apply(result); pending = null
    notice.value = result.synchronized ? '配置已保存并应用' : '配置已保存，正在等待服务确认'
  } catch (cause) { if (request === generation) error.value = cause instanceof Error ? cause.message : '保存失败' }
  finally { if (request === generation) busy.value = false }
}
watch(() => props.serviceId, id => { void load(id) }, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="bot-card quant-settings">
    <div class="bot-card-heading"><h2>量化工具</h2><span>{{ view ? (view.synchronized ? '配置已同步' : '等待服务同步') : '未连接' }}</span></div>
    <p class="bot-help">仅供模拟交易和历史回测，不连接真实证券账户。群聊回复对群成员可见。</p>
    <div class="quant-health" aria-label="量化服务监测">
      <span>量化进程：{{ health ? '运行中' : healthError || '读取中' }}</span>
      <span>数据库：{{ health ? (health.database === 'available' ? '正常' : '不可用') : '未知' }}</span>
      <span>引擎：{{ health?.engine.version || '未知' }}</span>
      <span>内存：{{ health?.rss_bytes != null ? `${(health.rss_bytes / 1048576).toFixed(1)} MiB` : '未知' }}</span>
      <span>进程 CPU：{{ health ? `${health.cpu_percent.toFixed(1)}%（单核）` : '未知' }}</span>
      <button type="button" @click="loadHealth()">刷新状态</button>
    </div>
    <p v-if="health" class="bot-help">行情：{{ quoteHealth?.error || (quoteHealth?.last_success ? `最近成功 ${quoteHealth.last_success}` : '尚无采样') }}</p>
    <p v-if="view" class="bot-help">配置版本 {{ view.desired.row_version }} · QQ入口 {{ view.applied.row_version }} · 量化进程 {{ view.process_applied?.row_version ?? '未连接' }}</p>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="draft">
      <div class="quant-switches"><label><input v-model="draft.settings.enabled" type="checkbox">启用量化工具</label>
        <label><input v-model="draft.settings.private_enabled" type="checkbox">允许私聊</label></div>
      <div class="quant-grid">
        <label>QQ 事件 WebSocket 地址<input v-model="draft.settings.event_ws_url" placeholder="ws://llbot:3001"></label>
        <label>授权群号（每行一个）<textarea v-model="groups" rows="3" /></label>
        <label>新账户初始虚拟资金<input v-model="draft.settings.initial_cash" inputmode="decimal"></label>
        <label>佣金比例<input v-model="draft.settings.commission_rate" inputmode="decimal"></label>
        <label>最低佣金<input v-model="draft.settings.minimum_commission" inputmode="decimal"></label>
        <label>卖出税比例<input v-model="draft.settings.stamp_tax_rate" inputmode="decimal"></label>
        <label>滑点比例<input v-model="draft.settings.slippage" inputmode="decimal"></label>
        <label>行情最大延迟（秒）<input v-model.number="draft.settings.max_quote_age_seconds" type="number" min="1"></label>
        <label>分钟缓存（交易日）<input v-model.number="draft.settings.bar_cache_days" type="number" min="1"></label>
        <label>行情刷新间隔（秒）<input v-model.number="draft.settings.refresh_seconds" type="number" min="10"></label>
        <label>量化回复间隔（秒）<input v-model.number="draft.settings.reply_interval_seconds" type="number" min="1"></label>
      </div>
      <h3>行情来源顺序</h3>
      <p class="bot-help">仅在前一来源不可用时尝试下一来源；缺少权限或不支持当前行情的来源会跳过。</p>
      <ol class="quant-sources"><li v-for="(provider, index) in draft.settings.provider_order" :key="provider">
        {{ labels[provider] }} <span>{{ index === 0 ? '主源' : `备用 ${index}` }}</span>
        <span>{{ sourceStatus(provider) }}</span>
        <button type="button" :data-source-up="provider" :disabled="index === 0 || busy" @click="moveSource(index, -1)">上移</button>
        <button type="button" :disabled="index === draft.settings.provider_order.length - 1 || busy" @click="moveSource(index, 1)">下移</button>
      </li></ol>
      <div v-for="provider in credentialProviders" :key="provider" class="quant-credential">
        <label>{{ labels[provider] }} 凭据（{{ configured[provider] ? '已配置' : '未配置' }}）
          <input v-model="credentials[provider]" :data-credential="provider" type="password" autocomplete="off" maxlength="1024">
        </label>
        <button type="button" :data-save-credential="provider" :disabled="busy || !credentials[provider]" @click="updateCredential(provider)">保存凭据</button>
        <button type="button" :disabled="busy || !configured[provider]" @click="updateCredential(provider, true)">移除</button>
      </div>
      <h3>指令映射</h3><p class="bot-help">关键词为普通文字，不能含空格或与表情词重复；参数以空格分隔。</p>
      <div class="quant-commands"><label v-for="action in actions" :key="action.id">{{ action.label }}
        <input v-model="draft.commands[action.id]" :data-command="action.id" maxlength="32">
        <small>示例：{{ draft.commands[action.id] }} {{ action.example }}</small>
      </label></div>
      <button type="button" data-action="save-quant-settings" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存量化配置' }}</button>
    </template>
    <button v-else-if="error" type="button" @click="load(serviceId)">重试</button>
    <p v-else class="bot-help">正在读取…</p>
  </section>
</template>

<style scoped>
.quant-grid,.quant-commands { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 14px 0; }
.quant-grid label,.quant-commands label { display: grid; gap: 5px; }
.quant-grid input,.quant-grid select,.quant-grid textarea,.quant-commands input { min-width: 0; padding: 8px; }
.quant-switches { display: flex; gap: 20px; flex-wrap: wrap; }
.quant-health { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.quant-commands small { color: var(--text-secondary, #728092); overflow-wrap: anywhere; }
.quant-sources li,.quant-credential { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
</style>
