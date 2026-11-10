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
import FreqtradeFuturesSettings from './FreqtradeFuturesSettings.vue'
import { fetchFreqtradeSettings, fetchFreqtradeStatus, saveFreqtradeSettings, type FreqtradeAction, type FreqtradeSettings, type FreqtradeStatus, type FreqtradeView, type FreqtradeWrite } from '../../../shared/api/freqtrade'

const props = defineProps<{ serviceId: string }>()
type SettingsTab = 'general' | 'sources' | 'replies' | 'accounts'
const settingsTab = ref<SettingsTab>('general')
const repliesVisited = ref(false)
const replyEditor = ref<InstanceType<typeof CommandReplyEditor> | null>(null)
function selectSettingsTab(value: SettingsTab) { settingsTab.value = value; if (value === 'replies') repliesVisited.value = true }


const defaultSettings: FreqtradeSettings = {
  enabled: false, private_enabled: false, event_ws_url: null, groups: [], initial_cash: '1000', fee: '0.001',
  futures_enabled: false, futures_initial_cash: '1000', futures_fee: '0.0005', futures_default_leverage: 3, futures_max_leverage: 0,
  reply_interval_seconds: 10, max_active_accounts: 5, idle_seconds: 300,
}
const defaultCommands: Record<FreqtradeAction, string> = {
  open: '币开户', buy: '币买入', sell: '币卖出', balance: '币资产', positions: '币持仓', orders: '币成交', help: '币帮助', chart: '币走势', deposit: '币充值',
  f_open: '合约开户', long: '合约开多', short: '合约开空', close: '合约平仓', f_balance: '合约资产', f_positions: '合约持仓', f_orders: '合约成交', f_chart: '合约走势', f_deposit: '合约充值', f_margin: '合约加保证金',
}
const spotActions: { id: FreqtradeAction; label: string; example: string; description: string }[] = [
  { id: 'open', label: '开户', example: '', description: '创建自己的模拟账户；已有账户不会重置。' },
  { id: 'buy', label: '买入', example: 'BTC 100', description: '使用100 USDT买入BTC；金额是计价币USDT。' },
  { id: 'sell', label: '卖出', example: 'BTC 0.001', description: '按币数量卖出；使用“全部”可卖出该币全部可卖持仓。' },
  { id: 'balance', label: '资产', example: '', description: '查看USDT余额与账户总资产。' },
  { id: 'positions', label: '持仓', example: '2', description: '查看持仓；示例查询第2页，不填页码时默认第1页。' },
  { id: 'orders', label: '成交', example: '2', description: '查看成交与委托；示例查询第2页。' },
  { id: 'chart', label: '走势', example: 'BTC 1小时', description: '回复当前QQ会话的PNG收盘价折线图；默认最近1小时，可选15分钟、1小时、4小时、1天或7天；无需开户。' },
  { id: 'deposit', label: '充值', example: '1000', description: '向自己的现货模拟钱包增加1000虚拟USDT；正数、最多4位小数、单次不超过1e9；不重置初始资金或交易历史，无提现和自动开户。' },
]
const futuresActions: { id: FreqtradeAction; label: string; example: string; description: string }[] = [
  { id: 'f_open', label: '合约开户', example: '', description: '创建独立的USDT本位逐仓永续模拟钱包；已有钱包不会重置。' },
  { id: 'long', label: '合约开多', example: 'BTC 100 10', description: '100 USDT保证金×10约1000 USDT名义价值；省略杠杆使用配置默认值。' },
  { id: 'short', label: '合约开空', example: 'ETH 50 5', description: '50 USDT保证金×5约250 USDT名义价值；省略杠杆使用配置默认值。' },
  { id: 'close', label: '合约平仓', example: 'BTC 0.001', description: '按币数量平仓；使用“全部”平掉该币全部可平仓位。' },
  { id: 'f_balance', label: '合约资产', example: '', description: '查看合约钱包余额、保证金和框架计算的盈亏。' },
  { id: 'f_positions', label: '合约持仓', example: '2', description: '查看合约持仓；示例查询第2页。' },
  { id: 'f_orders', label: '合约成交', example: '2', description: '查看合约成交与委托；示例查询第2页。' },
  { id: 'f_chart', label: '合约走势', example: 'BTC 4小时', description: '回复当前QQ会话的PNG收盘价折线图；可选15分钟、1小时、4小时、1天或7天，无需开户。' },
  { id: 'f_deposit', label: '合约充值', example: '1000', description: '向自己的合约模拟钱包增加1000虚拟USDT；正数、最多4位小数、单次不超过1e9；不重置初始资金或交易历史，无提现和自动开户。' },
  { id: 'f_margin', label: '合约加保证金', example: 'BTC 100', description: '从自己的合约可用余额向已有BTC仓位转入100虚拟USDT；正数、最多4位小数、单次不超过1e9；不改变数量、均价或原始杠杆。' },
]
const helpAction: { id: FreqtradeAction; label: string; example: string; description: string } =
  { id: 'help', label: '帮助（现货与合约）', example: '', description: '在QQ查看当前现货与合约指令和用法。' }

const view = ref<FreqtradeView | null>(null)
const draft = ref<FreqtradeWrite | null>(null)
const groups = ref('')
const groupEditor = ref<InstanceType<typeof BotQqGroups> | null>(null)
const fee = ref('')
const futuresFee = ref('')
const marketView = ref<'spot' | 'futures'>('spot')
const status = ref<FreqtradeStatus | null>(null)
const statusError = ref('')
const statusBusy = ref(false), statusMessage = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
let generation = 0
let statusRequest = 0
let savedFingerprint = ''
let pending: { fingerprint: string; key: string } | null = null

const fingerprint = () => JSON.stringify({ settings: draft.value?.settings, groups: groups.value, fee: fee.value, futuresFee: futuresFee.value })
const dirty = computed(() => fingerprint() !== savedFingerprint || Boolean(groupEditor.value?.hasPending))
const leverageError = computed(() => {
  if (!draft.value) return ''
  const { futures_default_leverage: defaultLeverage, futures_max_leverage: maxLeverage } = draft.value.settings
  if (!Number.isInteger(defaultLeverage) || defaultLeverage < 1 || defaultLeverage > 150) return '默认杠杆必须是1–150的整数'
  if (!Number.isInteger(maxLeverage) || maxLeverage < 0 || maxLeverage > 150) return '最大杠杆必须是0（跟随原生模拟档位）或1–150的整数'
  if (maxLeverage > 0 && defaultLeverage > maxLeverage) return '默认杠杆不能高于最大杠杆'
  return ''
})


function apply(value: FreqtradeView, fallback?: FreqtradeWrite) {
  const incomingSettings = value.desired.settings || {}
  const settings: FreqtradeSettings = {
    ...defaultSettings,
    ...(fallback?.settings ?? {}),
    ...incomingSettings,
    groups: [...(incomingSettings.groups ?? fallback?.settings.groups ?? defaultSettings.groups)],
  }
  const incomingCommands = value.desired.commands || {}
  const command = (id: FreqtradeAction) => incomingCommands[id] ?? fallback?.commands[id] ?? defaultCommands[id]
  const commands: Record<FreqtradeAction, string> = {
    open: command('open'), buy: command('buy'), sell: command('sell'), balance: command('balance'),
    positions: command('positions'), orders: command('orders'), help: command('help'), chart: command('chart'), deposit: command('deposit'), f_open: command('f_open'),
    long: command('long'), short: command('short'), close: command('close'), f_balance: command('f_balance'),
    f_positions: command('f_positions'), f_orders: command('f_orders'), f_chart: command('f_chart'), f_deposit: command('f_deposit'), f_margin: command('f_margin'),
  }
  view.value = value
  draft.value = { settings, commands }
  groups.value = settings.groups.join('\n')
  fee.value = shiftDecimal(settings.fee, 2)
  futuresFee.value = shiftDecimal(settings.futures_fee, 2)
  savedFingerprint = fingerprint()
}

async function loadStatus(request = generation, manual = false) {
  if (manual) statusMessage.value = ''
  const current = ++statusRequest
  statusBusy.value = true
  try {
    const result = await fetchFreqtradeStatus()
    if (request === generation && current === statusRequest) { status.value = result; statusError.value = ''; if (manual) statusMessage.value = '状态已刷新' }
  } catch (cause) {
    if (request === generation && current === statusRequest) {
      status.value = null
      statusError.value = cause instanceof Error ? cause.message : '读取Freqtrade状态失败'
      if (manual) statusMessage.value = '状态刷新失败'
    }
  } finally {
    if (request === generation && current === statusRequest) statusBusy.value = false
  }
}

async function load(id: string) {
  const request = ++generation
  view.value = null; draft.value = null; pending = null; error.value = ''; notice.value = ''; statusMessage.value = ''
  busy.value = true
  void loadStatus(request)
  try {
    const value = await fetchFreqtradeSettings(id)
    if (request === generation) apply(value)
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : '读取Freqtrade配置失败'
  } finally {
    if (request === generation) busy.value = false
  }
}

async function save() {
  if (!draft.value || !view.value || busy.value) return
  if (groupEditor.value && !groupEditor.value.validatePending()) { settingsTab.value = 'general'; return }
  if (leverageError.value) { error.value = leverageError.value; return }
  const request = generation
  const version = view.value.desired.row_version
  const value: FreqtradeWrite = JSON.parse(JSON.stringify(draft.value)) as FreqtradeWrite
  value.settings.groups = groups.value.split(/[\s,，]+/).filter(Boolean)
  value.settings.event_ws_url = value.settings.event_ws_url?.trim() || null
  value.settings.fee = shiftDecimal(fee.value, -2)
  value.settings.futures_fee = shiftDecimal(futuresFee.value, -2)
  const saveFingerprint = JSON.stringify({ version, value })
  if (!pending || pending.fingerprint !== saveFingerprint) pending = { fingerprint: saveFingerprint, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await saveFreqtradeSettings(props.serviceId, { settings: value.settings }, version, pending.key)
    if (request !== generation) return
    apply(result, value); pending = null
    notice.value = result.synchronized ? '配置已保存并应用' : '配置已保存，正在等待服务确认'
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : 'Freqtrade配置保存失败'
  } finally {
    if (request === generation) busy.value = false
  }
}

function replySaved(value: TradingCommandsView) {
  if (!view.value || !draft.value) return
  const commands = Object.fromEntries(value.commands.map(item => [item.id, item.keyword]))
  draft.value.commands = { ...draft.value.commands, ...commands }
  view.value.desired.commands = { ...view.value.desired.commands, ...commands }
  view.value.desired.row_version = value.row_version
  view.value.synchronized = value.synchronized
  if (value.synchronized) view.value.applied_version = value.row_version
}
const hasUnsaved = computed(() => Boolean(draft.value && dirty.value) || Boolean(replyEditor.value?.hasUnsaved))
const savedEnabled = computed(() => Boolean(view.value?.desired.settings.enabled))
defineExpose({ hasUnsaved, savedEnabled, status, statusError, statusBusy, statusMessage,
  refreshStatus: () => loadStatus(generation, true) })
watch(() => props.serviceId, id => { void load(id) }, { immediate: true })
onBeforeUnmount(() => { generation++; statusRequest++ })
</script>

<template>
  <section class="freqtrade-settings" :data-reply-editing="settingsTab === 'replies'">
      <div v-if="draft" class="trading-settings-tabs" role="tablist" aria-label="Freqtrade设置页签" @keydown="navigateBotTabs">
        <button v-for="section in ([['general', '通用设置'], ['sources', '行情数据'], ['replies', '指令配置'], ['accounts', '账号管理']] as const)"
          :key="section[0]" :id="`freqtrade-tab-${section[0]}`" type="button" role="tab" :data-settings-tab="section[0]" :disabled="busy" :aria-selected="settingsTab === section[0]" :aria-controls="`freqtrade-panel-${section[0]}`" :tabindex="settingsTab === section[0] ? 0 : -1" @click="selectSettingsTab(section[0])">{{ section[1] }} <span v-if="section[0] === 'replies'">19</span></button>
      </div>
    <div v-if="settingsTab === 'general' && (!view || !view.synchronized)" class="freqtrade-sync">{{ view ? '等待服务同步' : '未连接' }}</div>
    <p v-if="status?.state === 'unavailable'" class="bot-inline-error" role="alert">Freqtrade 引擎暂不可用，配置不会自动生效；请确认服务已部署后重试。</p>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <p v-if="leverageError && settingsTab === 'sources'" class="bot-inline-error" role="alert">{{ leverageError }}，请在通用设置中修改。</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="draft">

      <fieldset v-show="settingsTab !== 'replies' && settingsTab !== 'accounts'" class="trading-general" :disabled="busy" :aria-busy="busy">

      <div v-show="settingsTab === 'sources'" class="freqtrade-market-tabs" role="tablist" aria-label="Freqtrade市场视图" @keydown="navigateBotTabs">
        <button type="button" role="tab" data-market-view="spot" :aria-selected="marketView === 'spot'" :tabindex="marketView === 'spot' ? 0 : -1" @click="marketView = 'spot'">现货</button>
        <button type="button" role="tab" data-market-view="futures" :aria-selected="marketView === 'futures'" :tabindex="marketView === 'futures' ? 0 : -1" @click="marketView = 'futures'">合约</button>
      </div>

      <div v-show="settingsTab === 'general' || settingsTab === 'sources'" class="freqtrade-grid freqtrade-focused-grid">
        <section id="freqtrade-panel-general" v-show="settingsTab === 'general'" class="freqtrade-card bot-general-items" data-section="basic" role="tabpanel" aria-labelledby="freqtrade-tab-general">
          <div class="bot-switch-list">
            <BotSwitchRow v-model="draft.settings.enabled" title="启用模拟交易" description="允许授权用户使用虚拟币模拟交易指令。" />
            <BotSwitchRow v-model="draft.settings.private_enabled" title="允许私聊" description="允许在私聊中使用模拟交易指令。" />
            <BotSwitchRow v-model="draft.settings.futures_enabled" title="启用合约模拟交易" description="允许使用 USDT 本位合约模拟交易功能。" data-field="futures-enabled" />
          </div>
          <div class="bot-general-fields">
            <label class="bot-setting-line"><span class="bot-setting-text">QQ 事件 WebSocket 地址</span><input v-model="draft.settings.event_ws_url" class="bot-setting-control" placeholder="ws://llbot:3001"></label>
            <BotQqGroups ref="groupEditor" v-model="groups" />
            <label class="bot-setting-line"><span class="bot-setting-text">现货新账户初始虚拟资金<small>仅适用于新账户，不会重置已有账户。</small></span><span class="bot-number-with-unit"><input v-model="draft.settings.initial_cash" inputmode="decimal"><span>USDT</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">现货模拟费率</span><span class="bot-number-with-unit"><input v-model="fee" data-rate="fee" inputmode="decimal"><span>%</span></span></label>
            <FreqtradeFuturesSettings :settings="draft.settings" v-model:fee="futuresFee" :leverage-error="leverageError" />
            <label class="bot-setting-line"><span class="bot-setting-text">回复间隔<small>现货和合约共享。</small></span><span class="bot-number-with-unit"><input v-model.number="draft.settings.reply_interval_seconds" type="number" min="1"><span>秒</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">活动账户上限<small>现货和合约共享。</small></span><span class="bot-number-with-unit"><input v-model.number="draft.settings.max_active_accounts" type="number" min="1" max="50"><span>个（1–50）</span></span></label>
            <label class="bot-setting-line"><span class="bot-setting-text">空闲退出时间</span><span class="bot-number-with-unit"><input v-model.number="draft.settings.idle_seconds" type="number" min="60" max="86400"><span>秒（60–86400）</span></span></label>
          </div>
        </section>
        <section id="freqtrade-panel-sources" v-show="settingsTab === 'sources'" class="freqtrade-card" data-section="market" role="tabpanel" aria-labelledby="freqtrade-tab-sources">
          <div class="freqtrade-market-heading"><h3>市场与撮合</h3>
          </div>
          <dl v-if="marketView === 'spot'" class="freqtrade-facts"><div><dt>市场</dt><dd>Binance Spot</dd></div><div><dt>计价币</dt><dd>USDT</dd></div><div><dt>交易对</dt><dd>BTC/USDT ETH/USDT SOL/USDT</dd></div><div><dt>行情与模式</dt><dd>REST · dry-run</dd></div></dl>
          <dl v-else class="freqtrade-facts"><div><dt>市场</dt><dd>Binance USDT本位逐仓永续</dd></div><div><dt>钱包</dt><dd>每个QQ独立于现货</dd></div><div><dt>交易对</dt><dd>BTC/USDT:USDT ETH/USDT:USDT SOL/USDT:USDT</dd></div><div><dt>模式与持仓</dt><dd>REST · dry-run · 单向持仓</dd></div><div><dt>活动槽位</dt><dd>与现货共享（默认5）</dd></div></dl>
        </section>
      </div>
      <div class="freqtrade-save" :class="{ 'bot-general-save': settingsTab === 'general' }"><span>{{ dirty ? '有未保存的更改' : '配置无未保存更改' }} · 保存全部现货与合约常规设置</span><button type="button" class="bot-save-button" data-action="save-freqtrade-settings" :disabled="busy || Boolean(leverageError)" @click="save">{{ busy ? '保存中…' : '保存' }}</button></div>
      </fieldset>
      <div id="freqtrade-panel-replies" v-show="settingsTab === 'replies'" class="trading-replies" role="tabpanel" aria-labelledby="freqtrade-tab-replies">
      <section class="freqtrade-card" data-section="commands">
        <div class="freqtrade-command-heading"><h3>指令用法</h3><HelpHint label="查看提示" subject="Freqtrade帮助">
          <div class="freqtrade-help-content">
            <p>以下示例使用已保存指令词；编辑与预览在下方进行。</p>
            <p>在已授权的群聊或允许的私聊发送指令，参数用空格分隔，可先@Bot。</p>
            <h4>现货</h4><div v-for="action in spotActions" :key="action.id"><strong>{{ action.label }}</strong><code>{{ draft.commands[action.id] }} {{ action.example }}</code><p>{{ action.description }}</p></div>
            <h4>合约</h4><div v-for="action in futuresActions" :key="action.id"><strong>{{ action.label }}</strong><code>{{ draft.commands[action.id] }} {{ action.example }}</code><p>{{ action.description }}</p></div>
            <div><strong>{{ helpAction.label }}</strong><code>{{ draft.commands[helpAction.id] }}</code><p>{{ helpAction.description }}</p></div>
            <p>币买入按USDT金额；币卖出按币数量，也可使用“全部”。已提交不代表已成交，请查询成交与委托。</p>
            <code>{{ draft.commands.sell }} BTC 全部</code>
            <p>合约开多/开空的数量是保证金USDT和可选杠杆，名义价值约为保证金×杠杆；单向持仓不可同一币对同时持有多空，同方向加仓沿用当前杠杆，反向操作前先平仓。</p>
            <code>{{ draft.commands.long }} BTC 100 10</code><code>{{ draft.commands.short }} ETH 50 5</code>
            <code>{{ draft.commands.close }} BTC 0.001</code><code>{{ draft.commands.close }} BTC 全部</code>
            <p>省略杠杆时使用当前配置默认值；最大杠杆上限为0时跟随原生模拟档位。资金费率、盈亏、强平和保护由框架计算，不承诺与交易所逐项完全一致。</p>
            <p>充值和加保证金仅支持正数、最多4位小数、单次不超过1e9；不提供提现或自动开户，属于dry_run扩展（绑定Freqtrade 2026.9）。</p>
          </div>
        </HelpHint></div>
        <p class="bot-help">关键词为1～32个字符的普通文字，不能含空白、与其他量化词或表情词重复；参数以空格分隔。</p>
      </section>
        <CommandReplyEditor v-if="repliesVisited" ref="replyEditor" :service-id="serviceId" engine="freqtrade" :revision="view?.desired.row_version ?? 0" @saved="replySaved" />
      </div>
      <div v-if="settingsTab === 'accounts'" id="freqtrade-panel-accounts" role="tabpanel" aria-labelledby="freqtrade-tab-accounts"><TradingAccounts :service-id="serviceId" engine="crypto" /></div>
    </template>
    <button v-else-if="error" type="button" @click="load(serviceId)">重试</button>
    <p v-else class="bot-help">正在读取…</p>
  </section>
</template>

<style scoped>
.freqtrade-parameter-layout { display:grid; grid-template-columns:minmax(0,2fr) minmax(250px,1fr); gap:16px; align-items:start; }
.freqtrade-parameter-summary { display:grid; gap:14px; min-width:0; }
.freqtrade-parameter-summary .freqtrade-card { background:var(--surface-soft); }
@container bot-workspace (max-width:850px) { .freqtrade-parameter-layout { grid-template-columns:1fr; } }
.trading-settings-tabs { display:flex; gap:8px; border-bottom:1px solid var(--border); }
.trading-settings-tabs button { border:0; border-bottom:2px solid transparent; padding:12px 16px; background:none; color:var(--muted); cursor:pointer; font-weight:600; }
.trading-settings-tabs button[aria-selected="true"] { color:var(--primary); border-bottom-color:var(--primary); }
.trading-settings-tabs span { font-size:12px; padding:2px 6px; border-radius:6px; background:var(--surface-soft); }
.trading-general,.trading-replies { display:grid; gap:14px; min-width:0; }
.trading-general { margin:0; padding:0; border:0; }

.freqtrade-settings { display:grid; gap:14px; min-width:0; }
.freqtrade-settings p { margin:0; }
.freqtrade-sync { justify-self:end; color:var(--muted); font-size:13px; }
.freqtrade-info { padding:12px 16px; border-radius:7px; color:var(--accent); background:var(--surface-soft); font-size:13px; }
.freqtrade-card { min-width:0; padding:18px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
.freqtrade-card h3 { margin:0 0 6px; font-size:17px; }
.freqtrade-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.freqtrade-market-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }.freqtrade-market-tabs { display:flex; gap:4px; border:1px solid var(--border); border-radius:7px; padding:3px; }.freqtrade-market-tabs button { border:0; border-radius:5px; padding:7px 12px; color:var(--muted); background:transparent; cursor:pointer; font:inherit; font-size:13px; }.freqtrade-market-tabs button[aria-selected=true] { color:var(--accent); background:var(--surface-soft); font-weight:700; }
.freqtrade-status { display:flex; align-items:center; gap:16px; flex-wrap:wrap; font-size:13px; }
.freqtrade-status div { display:grid; gap:4px; }.freqtrade-status div span { color:var(--muted); }.freqtrade-status button { margin-left:auto; }
.freqtrade-switches { display:flex; gap:24px; flex-wrap:wrap; margin:20px 0; }.freqtrade-switches label { display:flex; align-items:center; gap:12px; font-size:13px; }
.freqtrade-fields { display:grid; gap:14px; }.freqtrade-fields label { display:grid; align-content:start; gap:6px; min-width:0; font-size:13px; }
.freqtrade-fields input,.freqtrade-fields textarea { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--border-strong); border-radius:5px; background:var(--surface); color:var(--text); font:inherit; }
.freqtrade-fields input { height:38px; }.freqtrade-fields small { color:var(--muted); }.freqtrade-facts { display:grid; gap:12px; margin:20px 0 0; }.freqtrade-facts div { display:flex; gap:12px; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px; }.freqtrade-facts dt { color:var(--muted); }.freqtrade-facts dd { margin:0; text-align:right; overflow-wrap:anywhere; }
.freqtrade-trading-fields { grid-template-columns:repeat(2,minmax(0,1fr)); }.freqtrade-unit { display:flex; min-width:0; border:1px solid var(--border-strong); border-radius:5px; overflow:hidden; }.freqtrade-unit input { border:0; border-radius:0; flex:1; }.freqtrade-unit>span { display:flex; align-items:center; padding:0 11px; background:var(--surface-soft); border-left:1px solid var(--border); color:var(--muted); white-space:nowrap; }
.freqtrade-command-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }.freqtrade-help-content { display:grid; gap:12px; max-height:60vh; overflow-y:auto; white-space:normal; }.freqtrade-help-content p { margin:0; }.freqtrade-help-content code { display:block; font-size:12px; overflow-wrap:anywhere; }.freqtrade-commands { grid-template-columns:repeat(4,minmax(0,1fr)); }
.freqtrade-help-content h4,.freqtrade-command-group h4 { margin:4px 0 0; font-size:14px; }.freqtrade-command-group+.freqtrade-command-group { margin-top:18px; }
.freqtrade-save { display:flex; justify-content:space-between; gap:12px; align-items:center; font-size:13px; }.freqtrade-save button { border:1px solid var(--accent); border-radius:5px; padding:8px 11px; color:#fff; background:var(--accent); cursor:pointer; }.freqtrade-save button:disabled { opacity:.55; cursor:not-allowed; }
@media (max-width:1000px) { .freqtrade-grid { grid-template-columns:1fr; }.freqtrade-commands { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:600px) { .freqtrade-trading-fields { grid-template-columns:1fr; }.freqtrade-save { flex-wrap:wrap; } }
</style>
