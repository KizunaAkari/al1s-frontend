<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { fetchTradingAccount, fetchTradingOperation, fetchTradingOwner, saveTradingOwner, submitTradingAction,
  type TradingAccountResult, type TradingAction, type TradingActionInput, type TradingMarket, type TradingOperation,
  type TradingOwner } from '../../shared/api/trading-accounts'

const props = defineProps<{ serviceId: string; engine: 'a-share' | 'crypto' }>()
const market = ref<TradingMarket>(props.engine === 'a-share' ? 'a-share' : 'spot')
const owner = ref<TradingOwner | null>(null), qqInput = ref(''), editingOwner = ref(false)
const account = ref<TradingAccountResult | null>(null), positions = ref<Record<string, unknown>[]>([]), orders = ref<Record<string, unknown>[]>([])
const loading = ref(false), saving = ref(false), listsLoaded = ref(false), error = ref(''), message = ref('')
const positionPage = ref(1), orderPage = ref(1), pending = ref<TradingOperation | null>(null)
const pendingInput = ref<TradingActionInput | null>(null), pendingMissing = ref(false)
const action = ref<TradingAction>('buy')
const symbol = ref(''), amount = ref(''), quantity = ref(''), leverage = ref(''), all = ref(false)
let generation = 0

const actions = computed<{ id: TradingAction; label: string }[]>(() => market.value === 'a-share'
  ? [{ id: 'buy', label: '买入' }, { id: 'sell', label: '卖出' }]
  : market.value === 'spot'
    ? [{ id: 'buy', label: '买入' }, { id: 'sell', label: '卖出' }, { id: 'deposit', label: '虚拟充值' }]
    : [{ id: 'long', label: '开多' }, { id: 'short', label: '开空' }, { id: 'close', label: '平仓' },
       { id: 'deposit', label: '虚拟充值' }, { id: 'margin', label: '追加保证金' }])
const accountMissing = computed(() => account.value?.code === 'account_missing')
const accountReady = computed(() => account.value?.status === 'success')
const accountState = computed(() => account.value?.account_state ?? account.value?.data?.account_state)
const locked = computed(() => saving.value || Boolean(pending.value) || ['needs_review', 'unknown'].includes(String(accountState.value)))
const operationKey = () => `al1s-paper-operation:${props.serviceId}:${market.value}`
const value = (item: unknown) => item === null || item === undefined || item === '' ? '未提供' : String(item)
const stockName = (row: Record<string, unknown>) => typeof row.name === 'string' && row.name.trim() && row.name.trim() !== String(row.code ?? '')
  ? row.name.trim() : null
const timeText = (item: unknown) => {
  if (typeof item !== 'string') return '未提供'
  const time = new Date(item)
  return Number.isNaN(time.getTime()) ? item : time.toLocaleString('zh-CN', { hour12: false })
}
const statusLabels: Record<string, string> = { accepted: '已受理', processing: '处理中', partially_filled: '部分成交',
  filled: '已成交', rejected: '已拒绝', expired: '已过期', unknown: '待核实', active: '正常', ready: '正常', needs_review: '待核实' }
const statusText = (status: unknown) => statusLabels[String(status)] ?? value(status)
const codeText: Record<string, string> = { trading_owner_required: '请先绑定本人 QQ 号。', trading_owner_conflict: '绑定已变更，请刷新后重试。',
  trading_owner_changed: '绑定已变更，请刷新后重试。', trading_owner_busy: '仍有未完成或待核实的操作，暂不能更换绑定。',
  trading_operation_pending: '账户有未完成或待核实的操作，请先查看回执。', idempotency_conflict: '操作标识已使用，请核对回执。',
  trading_service_unavailable: '模拟交易服务未启用、未同步或暂不可用。', account_missing: '尚未开户。',
  account_data_missing: '账户数据不可用，未创建新账户。', account_engine_unavailable: '账户引擎暂不可用或活动容量已满。',
  account_engine_inactive: '账户引擎暂未运行。', quant_configuration_pending: '交易配置尚未同步。', trading_scope_denied: '当前市场尚未启用。' }
function explain(cause: unknown) {
  const code = cause instanceof Error ? cause.message : ''
  return codeText[code] ?? (code || '请求失败，请稍后重试。')
}
function httpStatus(cause: unknown) {
  return cause instanceof Error && 'status' in cause && typeof cause.status === 'number' ? cause.status : undefined
}
function rows(result: TradingAccountResult | null, key: string) {
  const data = result?.data?.[key]
  return Array.isArray(data) ? data as Record<string, unknown>[] : []
}
function storedOperation() {
  try {
    const raw = sessionStorage.getItem(operationKey())
    if (!raw) return null
    const saved = JSON.parse(raw) as { id?: unknown; input?: TradingActionInput }
    return typeof saved.id === 'string' && saved.input && typeof saved.input.owner_version === 'number'
      ? { id: saved.id, input: saved.input } : null
  } catch { return null }
}
function removeStoredOperation() {
  try { sessionStorage.removeItem(operationKey()) } catch { /* The server receipt remains authoritative. */ }
}
async function loadOwner() {
  const request = ++generation
  loading.value = true; error.value = ''; account.value = null; positions.value = []; orders.value = []; pending.value = null
  try {
    const result = await fetchTradingOwner()
    if (request !== generation) return
    owner.value = result; qqInput.value = result.qq_id ?? ''; editingOwner.value = !result.qq_id
    if (result.qq_id) await loadMarket(request)
  } catch (cause) { if (request === generation) error.value = explain(cause) }
  finally { if (request === generation) loading.value = false }
}
async function loadMarket(request = ++generation) {
  if (!owner.value?.qq_id) return
  loading.value = true; listsLoaded.value = false; error.value = ''; account.value = null; positions.value = []; orders.value = []
  const current = market.value, service = props.serviceId, ownerVersion = owner.value.row_version
  let localOperation = storedOperation()
  if (localOperation && localOperation.input.owner_version !== ownerVersion) { removeStoredOperation(); localOperation = null }
  pendingInput.value = localOperation?.input ?? null; pendingMissing.value = false
  pending.value = localOperation ? { id: localOperation.id, market: current, status: 'unknown' } : null
  try {
    const result = await fetchTradingAccount(service, current, 'account')
    if (request !== generation) return
    if (result.owner_version !== ownerVersion) throw new Error('trading_owner_changed')
    account.value = result
    if (result.pending_operation && (!localOperation || result.pending_operation.id === localOperation.id)) pending.value = result.pending_operation
    if (result.status === 'success') {
      const [holdings, history] = await Promise.all([
        fetchTradingAccount(service, current, 'positions', positionPage.value),
        fetchTradingAccount(service, current, 'orders', orderPage.value),
      ])
      if (request !== generation) return
      if (holdings.owner_version !== ownerVersion || history.owner_version !== ownerVersion) {
        account.value = null; throw new Error('trading_owner_changed')
      }
      if (holdings.status === 'success' && history.status === 'success') {
        positions.value = rows(holdings, 'positions'); orders.value = rows(history, 'trades'); listsLoaded.value = true
      }
      if (typeof history.data?.recovery_message === 'string') message.value = history.data.recovery_message
      if (holdings.status !== 'success' || history.status !== 'success') error.value = codeText[holdings.code ?? history.code ?? ''] ?? '部分账户数据暂不可用。'
    } else if (result.code !== 'account_missing') error.value = codeText[result.code ?? ''] ?? '账户数据暂不可用。'
    if (localOperation && result.pending_operation?.id !== localOperation.id) await checkOperation(localOperation.id, request)
  } catch (cause) { if (request === generation) error.value = explain(cause) }
  finally { if (request === generation) loading.value = false }
}
async function bindOwner() {
  const id = qqInput.value.trim()
  if (!/^[1-9][0-9]{0,19}$/.test(id) || !owner.value) { error.value = '请输入有效的 QQ 号。'; return }
  try { await ElMessageBox.confirm(`将 QQ ${id} 作为页面操作的本人账户。此操作不会验证 QQ 身份。`, '确认绑定', { confirmButtonText: '确认', cancelButtonText: '取消' }) }
  catch { return }
  saving.value = true; error.value = ''
  try { owner.value = await saveTradingOwner(id, owner.value.row_version); editingOwner.value = false; await loadMarket() }
  catch (cause) { error.value = explain(cause) }
  finally { saving.value = false }
}
function selectMarket(next: TradingMarket) {
  if (market.value === next || saving.value) return
  market.value = next; action.value = next === 'futures' ? 'long' : 'buy'
  symbol.value = ''; amount.value = ''; quantity.value = ''; leverage.value = ''; all.value = false
  positionPage.value = orderPage.value = 1; message.value = ''; void loadMarket()
}
function inputFor(selected: TradingAction): TradingActionInput | null {
  const result: TradingActionInput = { action: selected, owner_version: owner.value?.row_version ?? 0 }
  if (selected === 'open') return result
  if (selected !== 'deposit') {
    if (market.value === 'a-share' ? !/^[0-9]{6}$/.test(symbol.value) : !['BTC', 'ETH', 'SOL'].includes(symbol.value)) {
      error.value = market.value === 'a-share' ? '请输入六位股票代码。' : '请选择币种。'; return null
    }
    result.symbol = symbol.value
  }
  if (market.value === 'a-share') {
    if (!/^[1-9][0-9]{0,8}$/.test(quantity.value)) { error.value = '请输入有效股数。'; return null }
    result.quantity = Number(quantity.value)
  } else if (all.value && (selected === 'sell' || selected === 'close')) result.all = true
  else {
    if (!/^(?:[0-9]+)(?:\.[0-9]{1,12})?$/.test(amount.value) || !/[1-9]/.test(amount.value)) { error.value = '请输入有效数量。'; return null }
    if ((selected === 'deposit' || selected === 'margin') && (!/^[0-9]+(?:\.[0-9]{1,4})?$/.test(amount.value) || Number(amount.value) > 1e9)) {
      error.value = '金额最多 4 位小数，且不超过 10 亿 USDT。'; return null
    }
    result.amount = amount.value
  }
  if ((selected === 'long' || selected === 'short') && leverage.value) {
    if (!/^[1-9][0-9]{0,2}$/.test(leverage.value) || Number(leverage.value) > 150) { error.value = '杠杆请输入 1 到 150 的整数。'; return null }
    result.leverage = Number(leverage.value)
  }
  return result
}
async function perform(selected = action.value) {
  if (locked.value || !owner.value?.qq_id) return
  error.value = ''; message.value = ''
  const input = inputFor(selected)
  if (!input) return
  const operation = globalThis.crypto?.randomUUID?.()
  if (!operation) { error.value = '无法创建操作回执，未提交请求。'; return }
  try { sessionStorage.setItem(operationKey(), JSON.stringify({ id: operation, input })) }
  catch { error.value = '浏览器无法保存回执标识，未提交请求。'; return }
  pendingInput.value = input; pendingMissing.value = false
  pending.value = { id: operation, market: market.value, action: selected, status: 'running' }
  await sendOperation(input, operation)
}
async function sendOperation(input: TradingActionInput, operation: string) {
  const request = generation, service = props.serviceId, current = market.value
  saving.value = true
  try {
    const result = await submitTradingAction(service, current, input, operation)
    if (request === generation) await applyOperation(result)
  } catch (cause) {
    if (request === generation) {
      const checked = await checkOperation(operation, request)
      const status = httpStatus(cause)
      if (checked === 'missing' && status !== undefined && status < 500) {
        removeStoredOperation(); pending.value = null; pendingInput.value = null; pendingMissing.value = false
        if (cause instanceof Error && cause.message === 'trading_owner_changed') await loadOwner()
        else await loadMarket()
        error.value = explain(cause)
      } else if (checked !== 'found') error.value = `${explain(cause)} 请查询回执和成交记录，勿重复提交。`
    }
  } finally { saving.value = false }
}
async function retryOperation() {
  if (!pending.value?.id || !pendingInput.value || !pendingMissing.value || saving.value) return
  error.value = ''; message.value = ''; pendingMissing.value = false
  await sendOperation(pendingInput.value, pending.value.id)
}
async function applyOperation(result: TradingOperation) {
  pending.value = result; pendingMissing.value = false
  if (result.status === 'completed' || result.status === 'failed') {
    removeStoredOperation(); pending.value = null; pendingInput.value = null; message.value = result.result || '请求已处理。'
    await loadMarket()
  } else message.value = result.result || '请求正在处理或结果待核实，请勿重复提交。'
}
async function checkOperation(id = pending.value?.id, request = generation) {
  if (!id) return 'missing'
  try {
    const result = await fetchTradingOperation(props.serviceId, market.value, id)
    if (request !== generation) return 'unavailable'
    await applyOperation(result)
    return 'found'
  } catch (cause) {
    const missing = httpStatus(cause) === 404
    if (request === generation) {
      pending.value = { id, status: 'unknown' }; pendingMissing.value = missing
      error.value = '暂时无法核实请求，请先查看委托与成交，勿重复提交。'
    }
    return missing ? 'missing' : 'unavailable'
  }
}
async function changePage(kind: 'positions' | 'orders', delta: number) {
  const page = kind === 'positions' ? positionPage : orderPage
  const next = page.value + delta
  if (next < 1 || next > 1000) return
  const request = generation
  try {
    const result = await fetchTradingAccount(props.serviceId, market.value, kind, next)
    if (request !== generation) return
    if (result.owner_version !== owner.value?.row_version) { account.value = null; throw new Error('trading_owner_changed') }
    if (result.status !== 'success') { error.value = codeText[result.code ?? ''] ?? '读取失败。'; return }
    page.value = next
    if (kind === 'positions') positions.value = rows(result, 'positions'); else orders.value = rows(result, 'trades')
  } catch (cause) { if (request === generation) error.value = explain(cause) }
}
watch(() => props.serviceId, () => { positionPage.value = orderPage.value = 1; void loadOwner() }, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <div class="paper-account">
    <div class="paper-head">
      <div><strong>账号管理</strong><span v-if="owner?.qq_id">QQ {{ owner.qq_id }}</span></div>
      <div class="paper-actions"><button v-if="owner?.qq_id" type="button" :disabled="locked" @click="editingOwner = !editingOwner">更换绑定</button><button v-if="owner?.qq_id" type="button" :disabled="loading || saving" @click="loadOwner">刷新</button></div>
    </div>
    <form v-if="editingOwner" class="paper-bind" @submit.prevent="bindOwner">
      <label>本人 QQ 号<input v-model="qqInput" inputmode="numeric" maxlength="20" autocomplete="off"></label>
      <button type="submit" :disabled="saving">确认绑定</button><span>由管理员填写，不验证 QQ 身份。</span>
    </form>
    <p v-if="error" class="paper-error" role="alert">{{ error }}</p>
    <p v-if="message" class="paper-message" role="status">{{ message }}</p>
    <template v-if="owner?.qq_id && !editingOwner">
      <div v-if="engine === 'crypto'" class="paper-markets" role="tablist" aria-label="虚拟币市场">
        <button type="button" role="tab" :aria-selected="market === 'spot'" @click="selectMarket('spot')">现货</button>
        <button type="button" role="tab" :aria-selected="market === 'futures'" @click="selectMarket('futures')">合约</button>
      </div>
      <div v-if="pending" class="paper-pending" role="status">
        <span>{{ pending.status === 'other_service' ? '该账户在其他连接有未完成操作。' : '操作正在处理或结果待核实，请勿重复提交。' }}</span>
        <button v-if="pending.id" type="button" :disabled="saving" @click="checkOperation()">查询回执</button>
        <button v-if="pending.id && pendingMissing && pendingInput" type="button" :disabled="saving" @click="retryOperation">重试原请求</button>
      </div>
      <p v-if="loading && !account" role="status">正在读取账户…</p>
      <template v-if="account">
        <div v-if="accountMissing" class="paper-empty"><span>尚未开户</span><button type="button" :disabled="locked" @click="perform('open')">开通模拟账户</button></div>
        <template v-else-if="accountReady">
          <div class="paper-summary">
            <template v-if="market === 'a-share'"><div><span>可用资金</span><strong>{{ value(account.data?.cash) }} 元</strong></div><div><span>持仓市值</span><strong>{{ value(account.data?.market_value) }} 元</strong></div><div><span>总资产</span><strong>{{ value(account.data?.total_assets) }} 元</strong></div></template>
            <template v-else><div v-if="!rows(account, 'currencies').some(item => item.currency === 'USDT')"><span>USDT 可用</span><strong>未提供</strong></div><div v-for="currency in rows(account, 'currencies')" :key="String(currency.currency)"><span>{{ value(currency.currency) }} 可用</span><strong>{{ value(currency.free) }}</strong></div><div v-if="market === 'futures'"><span>未实现盈亏</span><strong>{{ value(account.data?.unrealized_pnl) }} USDT</strong></div><div v-if="market === 'futures'"><span>追加保证金</span><strong>{{ value(account.data?.added_margin) }} USDT</strong></div><div><span>累计虚拟充值</span><strong>{{ value(account.data?.deposits_total) }} USDT</strong></div></template>
            <div><span>账户状态</span><strong>{{ statusText(accountState) }}</strong></div>
          </div>
          <p v-if="account.data?.quote_stale" class="paper-warning">行情已过期，资产估值可能变化。</p>
          <div class="paper-grid">
            <section class="paper-section">
              <h3>持仓</h3>
              <div v-if="listsLoaded && positions.length" class="paper-table-wrap"><table><thead><tr><th>{{ market === 'a-share' ? '股票' : '币对' }}</th><th>{{ market === 'a-share' ? '数量（股）' : '数量（币）' }}</th><th>{{ market === 'a-share' ? '可卖（股）' : '方向' }}</th><th v-if="market === 'futures'">保证金（USDT）</th><th v-if="market === 'futures'">杠杆</th><th>{{ market === 'a-share' ? '成本（元）' : '盈亏（USDT）' }}</th><th v-if="market === 'futures'">强平价</th></tr></thead><tbody><tr v-for="row in positions" :key="String(row.code ?? row.trade_id)"><td>{{ market === 'a-share' ? stockName(row) ?? value(row.code) : value(row.pair ?? row.code) }}<small v-if="market === 'a-share' && stockName(row)">{{ value(row.code) }}</small></td><td>{{ value(row.quantity ?? row.amount) }}</td><td>{{ value(row.available ?? row.side) }}</td><td v-if="market === 'futures'">{{ value(row.total_collateral) }}</td><td v-if="market === 'futures'">{{ value(row.leverage) }}</td><td>{{ value(row.total_cost ?? row.profit_abs) }}</td><td v-if="market === 'futures'">{{ value(row.liquidation_price) }}</td></tr></tbody></table></div><p v-else class="paper-empty-text">{{ listsLoaded ? '暂无持仓' : loading ? '正在读取持仓…' : '无法读取持仓' }}</p>
              <div class="paper-pages"><button type="button" :disabled="positionPage <= 1 || loading" @click="changePage('positions', -1)">上一页</button><span>{{ positionPage }}</span><button type="button" :disabled="positions.length < (market === 'a-share' ? 25 : market === 'spot' ? 20 : 10) || loading" @click="changePage('positions', 1)">下一页</button></div>
            </section>
            <section class="paper-section">
              <h3>模拟交易</h3>
              <div class="paper-action-tabs"><button v-for="item in actions" :key="item.id" type="button" :aria-pressed="action === item.id" :disabled="locked" @click="action = item.id; all = false">{{ item.label }}</button></div>
              <form class="paper-order" @submit.prevent="perform()">
                <label v-if="action !== 'deposit'">{{ market === 'a-share' ? '股票代码' : '币种' }}<input v-if="market === 'a-share'" v-model="symbol" inputmode="numeric" maxlength="6" placeholder="六位代码"><select v-else v-model="symbol"><option value="">请选择</option><option>BTC</option><option>ETH</option><option>SOL</option></select></label>
                <label v-if="market === 'a-share'">股数<input v-model="quantity" inputmode="numeric" placeholder="股"></label>
                <label v-else-if="!all">{{ action === 'buy' || action === 'deposit' || action === 'margin' ? '金额（USDT）' : action === 'long' || action === 'short' ? '保证金（USDT）' : '数量（币）' }}<input v-model="amount" inputmode="decimal"></label>
                <label v-if="action === 'long' || action === 'short'">杠杆倍数（可选）<input v-model="leverage" inputmode="numeric" placeholder="默认杠杆"></label>
                <label v-if="action === 'sell' && market === 'spot' || action === 'close'" class="paper-check"><input v-model="all" type="checkbox">全部{{ action === 'close' ? '平仓' : '卖出' }}</label>
                <button class="paper-primary" type="submit" :disabled="locked || loading">{{ actions.find(item => item.id === action)?.label }}</button>
              </form>
              <p class="paper-empty-text">{{ market === 'a-share' ? '按有效行情受理，成交结果以委托记录为准。' : '使用模拟市价，成交结果以引擎记录为准。' }}</p>
            </section>
          </div>
          <section class="paper-section paper-history"><h3>委托与成交</h3><div v-if="listsLoaded && orders.length" class="paper-table-wrap"><table><thead><tr><th>{{ market === 'a-share' ? '股票' : '币对' }}</th><th>方向</th><th>{{ market === 'a-share' ? '数量（股）' : '数量（币）' }}</th><th>状态</th><th>时间</th></tr></thead><tbody><tr v-for="row in orders" :key="String(row.id ?? row.trade_id)"><td>{{ market === 'a-share' ? stockName(row) ?? value(row.code) : value(row.pair ?? row.code) }}<small v-if="market === 'a-share' && stockName(row)">{{ value(row.code) }}</small></td><td>{{ row.side === 'buy' ? '买入' : row.side === 'sell' ? '卖出' : value(row.side) }}</td><td>{{ value(row.quantity ?? row.amount) }}</td><td>{{ statusText(row.status ?? row.state) }}</td><td>{{ timeText(row.created_at ?? row.opened_at) }}</td></tr></tbody></table></div><p v-else class="paper-empty-text">{{ listsLoaded ? '暂无委托与成交' : loading ? '正在读取记录…' : '无法读取记录' }}</p><div class="paper-pages"><button type="button" :disabled="orderPage <= 1 || loading" @click="changePage('orders', -1)">上一页</button><span>{{ orderPage }}</span><button type="button" :disabled="orders.length < (market === 'a-share' ? 25 : market === 'spot' ? 20 : 10) || loading" @click="changePage('orders', 1)">下一页</button></div></section>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.paper-account{padding:20px 26px;color:var(--text)}.paper-head,.paper-head>div,.paper-actions,.paper-markets,.paper-action-tabs,.paper-pages,.paper-pending{display:flex;align-items:center;gap:10px}.paper-action-tabs{flex-wrap:wrap}.paper-head{justify-content:space-between;margin-bottom:16px}.paper-head strong{font-size:18px}.paper-head span,.paper-bind span,.paper-pages{color:var(--muted);font-size:13px}.paper-account button{border:1px solid var(--border);border-radius:6px;padding:7px 12px;background:var(--surface);color:var(--text);cursor:pointer}.paper-account button:disabled{opacity:.5;cursor:not-allowed}.paper-account button[aria-selected=true],.paper-account button[aria-pressed=true]{color:var(--accent);border-color:var(--accent);background:var(--surface-soft)}.paper-bind,.paper-order{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.paper-bind label,.paper-order label:not(.paper-check){display:grid;gap:6px;font-size:13px;font-weight:600}.paper-account input:not([type=checkbox]),.paper-account select{box-sizing:border-box;min-width:140px;padding:9px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)}.paper-markets{margin-bottom:16px}.paper-summary{display:flex;gap:28px;flex-wrap:wrap;padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.paper-summary div{display:grid;gap:6px}.paper-summary span{font-size:12px;color:var(--muted)}.paper-summary strong{font-size:17px}.paper-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,1fr);gap:16px;margin-top:16px}.paper-section{min-width:0;padding:18px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.paper-section h3{margin:0 0 14px;font-size:16px}.paper-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 8px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}th{color:var(--muted);font-weight:600}td small{display:block;color:var(--muted)}.paper-pages{justify-content:flex-end;margin-top:12px}.paper-pages button{padding:4px 8px}.paper-order{margin-top:14px}.paper-order label:not(.paper-check){flex:1 1 140px}.paper-order input:not([type=checkbox]),.paper-order select{width:100%}.paper-check{display:flex;align-items:center;gap:6px;font-size:13px}.paper-account .paper-primary{background:var(--accent);border-color:var(--accent);color:#fff}.paper-history{margin-top:16px}.paper-empty,.paper-pending{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border:1px solid var(--border);border-radius:8px}.paper-empty-text{color:var(--muted);font-size:13px}.paper-error{color:var(--danger)}.paper-warning,.paper-pending{color:var(--warning)}.paper-message{white-space:pre-wrap}.paper-account button:focus-visible,.paper-account input:focus-visible,.paper-account select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}@media(max-width:800px){.paper-grid{grid-template-columns:1fr}.paper-head{align-items:flex-start;flex-wrap:wrap}.paper-summary{gap:16px}.paper-bind label,.paper-order label:not(.paper-check){flex-basis:100%}}
@container bot-workspace (max-width:1282px){.paper-account{padding-inline:16px}}
</style>
