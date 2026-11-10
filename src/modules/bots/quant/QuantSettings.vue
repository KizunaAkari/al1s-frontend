<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { shiftDecimal } from '../trading-decimal'
import HelpHint from '../../../shared/ui/HelpHint.vue'
import CommandReplyEditor from '../CommandReplyEditor.vue'
import TradingAccounts from '../TradingAccounts.vue'
import BotSwitchRow from '../BotSwitchRow.vue'
import BotQqGroups from '../BotQqGroups.vue'
import { navigateBotTabs } from '../bot-console-model'
import type { TradingCommandsView } from '../../../shared/api/trading-replies'
import { fetchQuantSettings, fetchQuantStatus, saveQuantSettings, fetchQuantCredentials, saveQuantCredential, type CredentialProvider, type QuantAction, type QuantProvider, type QuantStatus, type QuantView, type QuantWrite } from '../../../shared/api/quant'

const props = defineProps<{ serviceId: string }>()
type SettingsTab = 'general' | 'sources' | 'replies' | 'accounts'
const settingsTab = ref<SettingsTab>('general')
const repliesVisited = ref(false)
const replyEditor = ref<InstanceType<typeof CommandReplyEditor> | null>(null)
function selectSettingsTab(value: SettingsTab) { settingsTab.value = value; if (value === 'replies') repliesVisited.value = true }

const view = ref<QuantView | null>(null)
const draft = ref<QuantWrite | null>(null)
const groups = ref('')
const groupEditor = ref<InstanceType<typeof BotQqGroups> | null>(null)
const health = ref<QuantStatus | null>(null), healthError = ref('')
const healthBusy = ref(false), healthMessage = ref('')
const quoteHealth = computed(() => {
  const provider = draft.value?.settings.provider
  const key = provider === 'sina' ? 'minute' : provider === 'eastmoney' ? 'minute_east' : `minute_${provider}`
  return health.value?.source[key]
})
const labels: Record<QuantProvider, string> = { sina: '新浪', tencent: '腾讯', eastmoney: '东方财富', tushare: 'Tushare', gugudata: '咕咕数据' }
const configured = ref<Record<CredentialProvider, boolean>>({ tushare: false, gugudata: false })
const credentials = ref<Record<CredentialProvider, string>>({ tushare: '', gugudata: '' })
const rates = ref({ commission_rate: '', stamp_tax_rate: '', slippage: '' })
let savedFingerprint = ''
const fingerprint = () => JSON.stringify({ settings: draft.value?.settings, groups: groups.value, rates: rates.value })
const dirty = computed(() => fingerprint() !== savedFingerprint || Boolean(groupEditor.value?.hasPending))
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
const actions: { id: QuantAction; label: string; example: string; description: string }[] = [
  { id: 'open', label: '开户', example: '', description: '创建自己的模拟账户；已有账户不会重置。买卖、查询和回测均需先开户。' },
  { id: 'buy', label: '买入', example: '600000 100', description: '提交买入100股的模拟委托；参数为股票代码和股数，数量不是手数。' },
  { id: 'sell', label: '卖出', example: '600000 100', description: '提交卖出100股的模拟委托，受可卖数量和T+1限制。' },
  { id: 'balance', label: '资产', example: '', description: '查看资金、市值与总资产；行情不完整时无法计算总资产。' },
  { id: 'positions', label: '持仓', example: '2', description: '查看持仓、可卖股数与成本；示例查询第2页，不填页码时默认第1页。' },
  { id: 'orders', label: '成交与委托', example: '2', description: '查看委托状态；普通订单回执仅展示股票名称、代码、方向、数量、价格和订单号，不含时间戳、来源或费率明细；每页25条，页码范围1–1000。' },
  { id: 'backtest', label: '回测', example: '双均线 600000 2025-01-01 2025-12-31', description: '按策略、股票代码、起止日期进行历史回测；策略可选买入持有或双均线。' },
  { id: 'help', label: '帮助', example: '费率', description: '查询当前模拟佣金、最低佣金、仅卖出印花税和滑点；单独发送帮助关键词可查看完整用法。' },
]
function apply(value: QuantView) {
  view.value = value
  draft.value = JSON.parse(JSON.stringify({ settings: value.desired.settings, commands: value.desired.commands })) as QuantWrite
  groups.value = value.desired.settings.groups.join('\n')
  rates.value = { commission_rate: shiftDecimal(value.desired.settings.commission_rate, 2), stamp_tax_rate: shiftDecimal(value.desired.settings.stamp_tax_rate, 2), slippage: shiftDecimal(value.desired.settings.slippage, 2) }
  savedFingerprint = fingerprint()
}
async function load(id: string) {
  const request = ++generation
  view.value = null; draft.value = null; pending = null; error.value = ''; notice.value = ''; healthBusy.value = false; healthMessage.value = ''
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
async function loadHealth(request = generation, manual = false) {
  if (manual && healthBusy.value) return
  if (manual) { healthBusy.value = true; healthMessage.value = '' }
  try { const result = await fetchQuantStatus(); if (request === generation) { health.value = result; healthError.value = ''; if (manual) healthMessage.value = '状态已刷新' } }
  catch { if (request === generation) { health.value = null; healthError.value = '量化进程暂不可用'; if (manual) healthMessage.value = '状态刷新失败' } }
  finally { if (request === generation && manual) healthBusy.value = false }
}
async function save() {
  if (!draft.value || !view.value || busy.value) return
  if (groupEditor.value && !groupEditor.value.validatePending()) { settingsTab.value = 'general'; return }
  const request = generation, id = props.serviceId, version = view.value.desired.row_version
  const value: QuantWrite = JSON.parse(JSON.stringify(draft.value)) as QuantWrite
  value.settings.groups = groups.value.split(/[\s,，]+/).filter(Boolean)
  value.settings.event_ws_url = value.settings.event_ws_url?.trim() || null
  value.settings.commission_rate = shiftDecimal(rates.value.commission_rate, -2)
  value.settings.stamp_tax_rate = shiftDecimal(rates.value.stamp_tax_rate, -2)
  value.settings.slippage = shiftDecimal(rates.value.slippage, -2)
  const fingerprint = JSON.stringify({ version, value })
  if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await saveQuantSettings(id, { settings: value.settings }, version, pending.key)
    if (request !== generation) return
    apply(result); pending = null
    notice.value = result.synchronized ? '配置已保存并应用' : '配置已保存，正在等待服务确认'
  } catch (cause) { if (request === generation) error.value = cause instanceof Error ? cause.message : '保存失败' }
  finally { if (request === generation) busy.value = false }
}
function replySaved(value: TradingCommandsView) {
  if (!view.value || !draft.value) return
  const commands = Object.fromEntries(value.commands.map(item => [item.id, item.keyword]))
  draft.value.commands = { ...draft.value.commands, ...commands }
  view.value.desired.commands = { ...view.value.desired.commands, ...commands }
  view.value.desired.row_version = value.row_version
  view.value.synchronized = value.synchronized
  view.value.desired.mapping_version = value.mapping_version
  if (value.synchronized) { view.value.applied = { row_version: value.row_version, mapping_version: value.mapping_version }; view.value.process_applied = { ...view.value.applied } }
}
const hasUnsaved = computed(() => Boolean(draft.value && dirty.value) || Boolean(replyEditor.value?.hasUnsaved))
const savedEnabled = computed(() => Boolean(view.value?.desired.settings.enabled))
defineExpose({ hasUnsaved, savedEnabled, health, healthError, healthBusy, healthMessage, quoteHealth,
  refreshHealth: () => loadHealth(generation, true) })
watch(() => props.serviceId, id => { void load(id) }, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="quant-settings" :data-reply-editing="settingsTab === 'replies'">
      <div v-if="draft" class="trading-settings-tabs" role="tablist" aria-label="Quant设置页签" @keydown="navigateBotTabs">
        <button v-for="section in ([['general', '通用设置'], ['sources', '行情数据'], ['replies', '指令配置'], ['accounts', '账号管理']] as const)"
          :key="section[0]" :id="`quant-tab-${section[0]}`" type="button" role="tab" :data-settings-tab="section[0]" :disabled="busy" :aria-selected="settingsTab === section[0]" :aria-controls="`quant-panel-${section[0]}`" :tabindex="settingsTab === section[0] ? 0 : -1" @click="selectSettingsTab(section[0])">{{ section[1] }} <span v-if="section[0] === 'replies'">8</span></button>
      </div>
    <div v-if="settingsTab === 'general' && (!view || !view.synchronized)" class="quant-sync">{{ view ? '等待服务同步' : '未连接' }}</div>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="draft">

      <fieldset v-show="settingsTab !== 'replies' && settingsTab !== 'accounts'" class="trading-general" :disabled="busy" :aria-busy="busy">

      <div v-show="settingsTab === 'general'" class="quant-top-grid quant-focused-grid">
        <section id="quant-panel-general" v-show="settingsTab === 'general'" class="quant-card bot-general-items" data-section="basic" role="tabpanel" aria-labelledby="quant-tab-general">
          <div class="bot-switch-list">
            <BotSwitchRow v-model="draft.settings.enabled" title="启用模拟交易" description="允许授权用户使用 A 股模拟交易指令。" />
            <BotSwitchRow v-model="draft.settings.private_enabled" title="允许私聊" description="允许在私聊中使用模拟交易指令。" />
          </div>
          <div class="bot-general-fields">
            <label class="bot-setting-line"><span class="bot-setting-text">QQ 事件 WebSocket 地址</span><input v-model="draft.settings.event_ws_url" class="bot-setting-control" placeholder="ws://llbot:3001"></label>
            <BotQqGroups ref="groupEditor" v-model="groups" />
            <label class="bot-setting-line"><span class="bot-setting-text">新账户初始虚拟资金</span><span class="bot-number-with-unit"><input v-model="draft.settings.initial_cash" inputmode="decimal"><span>元</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">佣金比例</span><span class="bot-number-with-unit"><input v-model="rates.commission_rate" data-rate="commission_rate" inputmode="decimal"><span>%</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">最低佣金</span><span class="bot-number-with-unit"><input v-model="draft.settings.minimum_commission" inputmode="decimal"><span>元</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">卖出税比例</span><span class="bot-number-with-unit"><input v-model="rates.stamp_tax_rate" data-rate="stamp_tax_rate" inputmode="decimal"><span>%</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">滑点比例</span><span class="bot-number-with-unit"><input v-model="rates.slippage" data-rate="slippage" inputmode="decimal"><span>%</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">回复间隔</span><span class="bot-number-with-unit"><input v-model.number="draft.settings.reply_interval_seconds" type="number" min="1"><span>秒</span></span></label>
          </div>
        </section>
      </div>
      <section id="quant-panel-sources" v-show="settingsTab === 'sources'" class="quant-card" data-section="sources" role="tabpanel" aria-labelledby="quant-tab-sources">
        <div class="quant-fields quant-source-fields">
          <label>行情最大延迟<span class="quant-unit"><input v-model.number="draft.settings.max_quote_age_seconds" type="number" min="1"><span>秒</span></span></label>
          <label>行情刷新间隔<span class="quant-unit"><input v-model.number="draft.settings.refresh_seconds" type="number" min="10"><span>秒</span></span></label>
          <label>分钟缓存<span class="quant-unit"><input v-model.number="draft.settings.bar_cache_days" type="number" min="1"><span>交易日</span></span></label>
        </div>
        <div class="quant-table-wrap"><table class="quant-table">
          <thead><tr><th>优先级</th><th>行情来源</th><th>状态</th><th>凭据</th><th>排序</th></tr></thead>
          <tbody><tr v-for="(provider, index) in draft.settings.provider_order" :key="provider">
            <td>{{ String(index + 1).padStart(2, '0') }}</td>
            <td>{{ labels[provider] }} <span class="quant-tag">{{ index === 0 ? '主源' : `备用 ${index}` }}</span></td>
            <td>{{ sourceStatus(provider) }}</td>
            <td><div v-if="provider === 'tushare' || provider === 'gugudata'" class="quant-credential">
              <input v-model="credentials[provider]" :data-credential="provider" :aria-label="`${labels[provider]} 凭据`" placeholder="输入 Token" type="password" autocomplete="off" maxlength="1024">
              <button type="button" :data-save-credential="provider" :disabled="busy || !credentials[provider]" @click="updateCredential(provider)">保存</button>
              <button type="button" :disabled="busy || !configured[provider]" @click="updateCredential(provider, true)">移除</button>
            </div><span v-else class="bot-help">无需凭据</span></td>
            <td><div class="quant-order"><button type="button" :data-source-up="provider" :aria-label="`上移${labels[provider]}`" :disabled="index === 0 || busy" @click="moveSource(index, -1)">↑</button>
              <button type="button" :aria-label="`下移${labels[provider]}`" :disabled="index === draft.settings.provider_order.length - 1 || busy" @click="moveSource(index, 1)">↓</button></div></td>
          </tr></tbody>
        </table></div>
      </section>
      <div class="quant-save" :class="{ 'bot-general-save': settingsTab === 'general' }"><span>{{ dirty ? '有未保存的更改' : '配置无未保存更改' }} · 保存全部 A股常规设置</span><button type="button" class="bot-save-button" data-action="save-quant-settings" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存' }}</button></div>
      </fieldset>
      <div id="quant-panel-replies" v-show="settingsTab === 'replies'" class="trading-replies" role="tabpanel" aria-labelledby="quant-tab-replies">
      <section class="quant-card" data-section="commands">
        <div class="quant-command-heading"><h3>指令用法</h3>
          <HelpHint label="查看提示" subject="量化帮助">
            <div class="quant-help-content">
              <p>以下示例随当前输入预览，保存并同步后在 QQ 生效。</p>
              <p>在已授权的群聊或私聊发送指令，参数用空格分隔，可先@Bot。群聊回复对群成员可见。</p>
              <div v-for="action in actions" :key="action.id">
                <strong>{{ action.label }}</strong>
                <code>{{ draft.commands[action.id] }} {{ action.example }}</code>
                <p>{{ action.description }}</p>
              </div>
              <p>已提交不代表已成交，请查询委托状态；休市或行情无效时不能凭旧价成交。</p>
              <p>回测默认日线、不复权，双均线默认5/20。日期后可依次填写周期（日线/1分钟）、复权（不复权/前复权/后复权）、快线和慢线（仅双均线，需成对填写，单位为K线根数）。1分钟仅支持不复权；可用区间以数据源实际返回为准。</p>
              <code>{{ draft.commands.backtest }} 双均线 600000 2025-01-01 2025-12-31 日线 前复权 5 20</code>
            </div>
          </HelpHint>
        </div><p class="bot-help">关键词为1～32个字符的普通文字，不能含空白、与其他量化词或表情词重复；参数以空格分隔。</p>
      </section>
        <CommandReplyEditor v-if="repliesVisited" ref="replyEditor" :service-id="serviceId" engine="quant" :revision="view?.desired.row_version ?? 0" @saved="replySaved" />
      </div>
      <div v-if="settingsTab === 'accounts'" id="quant-panel-accounts" role="tabpanel" aria-labelledby="quant-tab-accounts"><TradingAccounts :service-id="serviceId" engine="a-share" /></div>
    </template>
    <button v-else-if="error" type="button" @click="load(serviceId)">重试</button>
    <p v-else class="bot-help">正在读取…</p>
  </section>
</template>

<style scoped>
.trading-settings-tabs { display:flex; gap:8px; border-bottom:1px solid var(--border); }
.trading-settings-tabs button { border:0; border-bottom:2px solid transparent; padding:12px 16px; background:none; color:var(--muted); cursor:pointer; font-weight:600; }
.trading-settings-tabs button[aria-selected="true"] { color:var(--primary); border-bottom-color:var(--primary); }
.trading-settings-tabs span { font-size:12px; padding:2px 6px; border-radius:6px; background:var(--surface-soft); }
.trading-general,.trading-replies { display:grid; gap:14px; min-width:0; }
.trading-general { margin:0; padding:0; border:0; }

.quant-settings { display:grid; gap:14px; min-width:0; }
.quant-settings p { margin:0; }
.quant-sync { justify-self:end; color:var(--muted); font-size:13px; }
.quant-info { padding:12px 16px; border-radius:7px; color:var(--accent); background:var(--surface-soft); font-size:13px; }
.quant-health,.quant-card,.quant-save { border:1px solid var(--border); border-radius:8px; background:var(--surface); padding:18px; }
.quant-health { display:flex; gap:16px; align-items:center; flex-wrap:wrap; font-size:13px; }
.quant-health span { overflow-wrap:anywhere; }
.quant-health button { margin-left:auto; }
.quant-top-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.quant-card { min-width:0; }
.quant-card h3 { margin:0 0 6px; font-size:17px; }
.quant-command-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.quant-help-content { display:grid; gap:12px; max-height:60vh; overflow-y:auto; white-space:normal; }
.quant-help-content p { margin:0; }
.quant-help-content code { display:block; font-size:12px; overflow-wrap:anywhere; }
.quant-card .bot-help { margin:0 0 18px; }
.quant-fields { display:grid; gap:14px; }
.quant-fields label { display:grid; align-content:start; gap:6px; min-width:0; font-size:13px; }
.quant-fields input,.quant-fields textarea,.quant-credential input { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--border-strong); border-radius:5px; background:var(--surface); color:var(--text); font:inherit; }
.quant-fields input,.quant-credential input { height:38px; }
.quant-fields small { color:var(--muted); overflow-wrap:anywhere; }
.quant-trading { grid-template-columns:repeat(2,minmax(0,1fr)); }
.quant-source-fields { grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:16px; }
.quant-commands { grid-template-columns:repeat(4,minmax(0,1fr)); }
.quant-unit { display:flex; min-width:0; border:1px solid var(--border-strong); border-radius:5px; overflow:hidden; }
.quant-unit input { border:0; border-radius:0; flex:1; }
.quant-unit>span { display:flex; align-items:center; padding:0 11px; background:var(--surface-soft); border-left:1px solid var(--border); color:var(--muted); white-space:nowrap; }
.quant-switches { display:flex; gap:24px; flex-wrap:wrap; margin:20px 0; }
.quant-switches label { display:flex; align-items:center; gap:12px; font-size:13px; }
.quant-switches input { appearance:none; position:relative; width:44px; height:24px; margin:0; border:1px solid var(--border-strong); border-radius:20px; background:var(--border-strong); cursor:pointer; }
.quant-switches input::after { content:''; position:absolute; width:18px; height:18px; top:2px; left:2px; border-radius:50%; background:#fff; transition:transform .15s; }
.quant-switches input:checked { background:var(--accent); border-color:var(--accent); }
.quant-switches input:checked::after { transform:translateX(20px); }
.quant-switches input:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.quant-table-wrap { overflow-x:auto; }
.quant-table { width:100%; min-width:720px; border-collapse:collapse; font-size:13px; }
.quant-table th,.quant-table td { padding:10px; border-bottom:1px solid var(--border); text-align:left; vertical-align:middle; }
.quant-table th { color:var(--muted); background:var(--surface-soft); white-space:nowrap; }
.quant-table td:nth-child(4) { width:38%; }
.quant-tag { display:inline-block; padding:3px 5px; border-radius:4px; color:var(--accent); background:var(--surface-soft); white-space:nowrap; }
.quant-credential,.quant-order { display:flex; align-items:center; gap:6px; }
.quant-credential input { min-width:100px; }
.quant-settings button { border:1px solid var(--border-strong); border-radius:5px; padding:8px 11px; color:var(--accent); background:var(--surface); cursor:pointer; white-space:nowrap; }
.quant-settings button:disabled { color:var(--muted); cursor:not-allowed; opacity:.55; }
.quant-save { display:flex; justify-content:space-between; gap:12px; align-items:center; font-size:13px; }
.quant-save button { color:#fff; background:var(--accent); border-color:var(--accent); }
@media (max-width:1000px) { .quant-top-grid { grid-template-columns:1fr; } .quant-commands { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:600px) { .quant-source-fields { grid-template-columns:1fr; } .quant-save { flex-wrap:wrap; } }
</style>
