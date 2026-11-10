<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import type { FreqtradeSettings } from '../../../shared/api/freqtrade'

const props = defineProps<{ settings: FreqtradeSettings; fee: string; leverageError: string }>()
const emit = defineEmits<{ 'update:fee': [value: string] }>()
const settings = toRef(props, 'settings')
const lastFixedLimit = ref(props.settings.futures_max_leverage || props.settings.futures_default_leverage)
watch(() => props.settings.futures_max_leverage, value => { if (value > 0) lastFixedLimit.value = value })
function setLeverageMode(mode: 'auto' | 'fixed') {
  if (mode === 'auto') {
    if (settings.value.futures_max_leverage > 0) lastFixedLimit.value = settings.value.futures_max_leverage
    settings.value.futures_max_leverage = 0
  } else if (!settings.value.futures_max_leverage) {
    settings.value.futures_max_leverage = lastFixedLimit.value || settings.value.futures_default_leverage
  }
}
function updateFee(event: Event) {
  emit('update:fee', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="freqtrade-futures-settings" data-section="futures-trading">
    <label class="bot-setting-line"><span class="bot-setting-text">合约新账户初始虚拟资金<small>每个 QQ 的合约钱包独立于现货，仅影响新账户。</small></span><span class="bot-number-with-unit"><input v-model="settings.futures_initial_cash" data-field="futures-initial-cash" inputmode="decimal"><span>USDT</span></span></label>
    <label class="bot-setting-line"><span class="bot-setting-text">合约模拟费率</span><span class="bot-number-with-unit"><input :value="fee" data-rate="futures_fee" inputmode="decimal" @input="updateFee"><span>%</span></span></label>
    <label class="bot-setting-line"><span class="bot-setting-text">默认杠杆</span><span class="bot-number-with-unit"><input v-model.number="settings.futures_default_leverage" data-field="futures-default-leverage" type="number" min="1" max="150" step="1"><span>x</span></span></label>
    <div class="bot-setting-line"><span class="bot-setting-text">杠杆上限</span>
      <div class="leverage-options" role="radiogroup" aria-label="杠杆上限方式">
        <label><input type="radio" name="leverage-mode" data-leverage-mode="auto" :checked="settings.futures_max_leverage === 0" @change="setLeverageMode('auto')">自动跟随档位</label>
        <label><input type="radio" name="leverage-mode" data-leverage-mode="fixed" :checked="settings.futures_max_leverage !== 0" @change="setLeverageMode('fixed')">固定上限</label>
      </div>
    </div>
    <label v-show="settings.futures_max_leverage !== 0" class="bot-setting-line"><span class="bot-setting-text">最大杠杆上限</span><span class="bot-number-with-unit"><input v-model.number="settings.futures_max_leverage" data-field="futures-max-leverage" type="number" min="0" max="150" step="1"><span>x</span></span></label>
    <p v-if="leverageError" class="freqtrade-leverage-error" data-error="leverage" role="alert">{{ leverageError }}</p>
    <div class="freqtrade-rules">
      <details class="freqtrade-rule"><summary>杠杆与持仓规则</summary><p class="bot-help">自动模式（0=跟随原生模拟档位）；固定上限为1–150。初次开仓省略杠杆使用默认值，已有持仓加仓省略杠杆沿用当前持仓杠杆；合约查询每页10条，现货查询每页20条。资金费率、盈亏、强平与保护由框架计算，不承诺与交易所逐项完全一致。</p></details>
      <details class="freqtrade-rule"><summary>强平与保护退出规则</summary><p class="bot-help">已确认的强平或保护退出使用原生Freqtrade数据源，通知原始开仓群并@本人，每次仅通知一次。</p></details>
      <details class="freqtrade-rule"><summary>资金与追加保证金规则</summary><p class="bot-help">合约充值只增加自己的虚拟USDT并保留初始资金与全部历史；合约加保证金从自己的可用余额转入已有仓位，不改变数量、均价或原始杠杆，部分平仓保留追加保证金，全部平仓或强平释放追加保证金。</p></details>
    </div>
  </div>
</template>

<style scoped>
.leverage-options { display:flex; flex-wrap:wrap; gap:16px; min-height:38px; align-items:center; }
.leverage-options label { display:flex; align-items:center; gap:6px; }
.leverage-options input { accent-color:var(--accent); }
.freqtrade-rules { padding:4px 0 14px; border-bottom:1px solid var(--border); }
.freqtrade-rule { margin-top:10px; padding:10px 12px; border:1px solid var(--border); border-radius:6px; }
.freqtrade-rule summary { cursor:pointer; font-size:13px; font-weight:600; }
.freqtrade-rule p { margin:10px 0 0; }
.freqtrade-leverage-error { margin:12px 0 0; color:#bd3838; }
</style>
