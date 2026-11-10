<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import tonghuashunIcon from '../../assets/tonghuashun.png'
import bitcoinIcon from '../../assets/bitcoin.svg'
import type { QuantStatus } from '../../shared/api/quant'
import type { FreqtradeStatus } from '../../shared/api/freqtrade'

defineProps<{
  quant: QuantStatus | null
  quantError: string
  quantBusy: boolean
  quantMessage?: string
  quote: { last_success: string | null; error: string | null } | null
  freqtrade: FreqtradeStatus | null
  freqtradeError: string
  freqtradeBusy: boolean
  freqtradeMessage?: string
}>()
const emit = defineEmits<{ refreshQuant: []; refreshFreqtrade: [] }>()

function marketState(value: FreqtradeStatus['market']['state']) {
  return value === 'available' ? '可用' : value === 'error' ? '错误' : '未验证'
}
</script>

<template>
  <section class="trading-dashboard" aria-label="模拟交易运维看板">
    <article class="dashboard-card">
      <header>
        <div class="dashboard-title">
          <span class="dashboard-icon"><img :src="tonghuashunIcon" alt="" aria-hidden="true"></span>
          <div><h3>A股 · AKQuant</h3><span :class="['dashboard-state', quant ? 'good' : quantError ? 'bad' : '']"><i />{{ quant ? '运行中' : quantError ? '不可用' : '读取中' }}</span></div>
        </div>
        <button type="button" :disabled="quantBusy" @click="emit('refreshQuant')"><Refresh aria-hidden="true" />{{ quantBusy ? '刷新中…' : '刷新' }}</button>
      </header>
      <div class="dashboard-metrics">
        <div><span>数据库</span><strong>{{ quant ? (quant.database === 'available' ? '正常' : '不可用') : '未知' }}</strong></div>
        <div><span>引擎版本</span><strong>{{ quant?.engine.version || '未知' }}</strong></div>
        <div><span>内存</span><strong>{{ quant?.rss_bytes != null ? `${(quant.rss_bytes / 1048576).toFixed(1)} MiB` : '未知' }}</strong></div>
        <div><span>进程 CPU（单核）</span><strong>{{ quant ? `${quant.cpu_percent.toFixed(1)}%` : '未知' }}</strong></div>
        <div><span>行情</span><strong>{{ quote?.error || (quote?.last_success ? `最近成功 ${quote.last_success}` : '尚无采样') }}</strong></div>
      </div>
      <p v-if="quantError" class="dashboard-error" role="alert">{{ quantError }}</p>
      <p v-else-if="quantMessage" class="dashboard-message" role="status">{{ quantMessage }}</p>
    </article>

    <article class="dashboard-card">
      <header>
        <div class="dashboard-title">
          <span class="dashboard-icon crypto"><img :src="bitcoinIcon" alt="" aria-hidden="true"></span>
          <div><h3>虚拟币 · Freqtrade</h3><span :class="['dashboard-state', freqtrade?.state === 'ready' ? 'good' : freqtradeError || freqtrade?.state === 'unavailable' ? 'bad' : '']"><i />{{ freqtrade?.state === 'ready' ? '就绪' : freqtradeError || freqtrade?.state === 'unavailable' ? '不可用' : '读取中' }}</span></div>
        </div>
        <button type="button" :disabled="freqtradeBusy" @click="emit('refreshFreqtrade')"><Refresh aria-hidden="true" />{{ freqtradeBusy ? '刷新中…' : '刷新' }}</button>
      </header>
      <div class="dashboard-metrics">
        <div><span>引擎版本</span><strong>{{ freqtrade?.version || '未知' }}</strong></div>
        <div><span>活动账户</span><strong>{{ freqtrade ? `${freqtrade.active_accounts} / ${freqtrade.total_accounts}` : '未知' }}</strong></div>
        <div><span>容量上限</span><strong>{{ freqtrade?.max_active_accounts ?? '未知' }}</strong></div>
        <div><span>内存</span><strong>{{ freqtrade?.rss_bytes != null ? `${(freqtrade.rss_bytes / 1048576).toFixed(1)} MiB` : '未知' }}</strong></div>
        <div><span>进程 CPU</span><strong>{{ freqtrade ? `${freqtrade.cpu_percent.toFixed(1)}%` : '未知' }}</strong></div>
        <div><span>行情</span><strong>{{ freqtrade ? `${marketState(freqtrade.market.state)}${freqtrade.market.error ? `：${freqtrade.market.error}` : ''}` : '未知' }}</strong></div>
      </div>
      <p v-if="freqtradeError" class="dashboard-error" role="alert">{{ freqtradeError }}</p>
      <p v-else-if="freqtradeMessage" class="dashboard-message" role="status">{{ freqtradeMessage }}</p>
    </article>
  </section>
</template>

<style scoped>
.trading-dashboard { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:stretch; padding:20px clamp(16px,2vw,26px) 26px; }
.dashboard-card { min-width:0; padding:20px; border:1px solid var(--border); border-radius:10px; background:var(--surface); }
.dashboard-card header,.dashboard-title { display:flex; align-items:center; gap:12px; }
.dashboard-card header { justify-content:space-between; gap:16px; }
.dashboard-title { min-width:0; }
.dashboard-title h3 { margin:0 0 5px; color:var(--text); font-size:16px; line-height:22px; }
.dashboard-icon { display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:10px; color:var(--accent); background:var(--surface-soft); }
.dashboard-icon.crypto { color:#139c87; }
.dashboard-icon img { width:32px; height:32px; border-radius:7px; object-fit:contain; }
.dashboard-icon.crypto img { border-radius:50%; }
.dashboard-icon svg,.dashboard-card button svg { width:18px; height:18px; }
.dashboard-state { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:12px; }
.dashboard-state i { width:7px; height:7px; border-radius:50%; background:currentColor; }
.dashboard-state.good { color:#129b6a; }.dashboard-state.bad { color:#bd3838; }
.dashboard-card button { display:inline-flex; align-items:center; gap:5px; flex:none; padding:6px 10px; border:1px solid var(--border); border-radius:6px; color:var(--muted); background:var(--surface); font:inherit; font-size:12px; cursor:pointer; }
.dashboard-card button:hover { color:var(--accent); border-color:var(--accent); }.dashboard-card button:disabled { opacity:.55; cursor:wait; }
.dashboard-card button svg { width:14px; height:14px; }
.dashboard-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:22px 16px; margin-top:24px; }
.dashboard-metrics>div { display:grid; align-content:start; gap:6px; min-width:0; }
.dashboard-metrics span { color:var(--muted); font-size:12px; line-height:18px; }
.dashboard-metrics strong { color:var(--text); font-size:14px; font-weight:600; line-height:20px; overflow-wrap:anywhere; }
.dashboard-error { margin:16px 0 0; color:#bd3838; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.dashboard-message { margin:16px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
@container bot-workspace (max-width:900px) { .trading-dashboard { grid-template-columns:minmax(0,1fr); } }
@container bot-workspace (max-width:520px) { .dashboard-card { padding:16px; }.dashboard-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
