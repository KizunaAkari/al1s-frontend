<script setup lang="ts">
import ThemeMenu from '../../shared/ui/ThemeMenu.vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, routerKey } from 'vue-router'
import BotConfiguration from './BotConfiguration.vue'
import BotContainers from './BotContainers.vue'
import BotLogViewer from './BotLogViewer.vue'
import BotServiceUpdates from './BotServiceUpdates.vue'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'
import MemeWorkshop from './memes/MemeWorkshop.vue'
import BotNavigation from './BotNavigation.vue'
import BotStatusBar from './BotStatusBar.vue'
import BotInteractionSettings from './BotInteractionSettings.vue'
import BotInteractionTabs from './BotInteractionTabs.vue'
import BotTradingDashboard from './BotTradingDashboard.vue'
import QuantSettings from './quant/QuantSettings.vue'
import FreqtradeSettings from './freqtrade/FreqtradeSettings.vue'
import AiSettings from './ai/AiSettings.vue'
import AiDrawingSettings from './drawing/AiDrawingSettings.vue'
import { botPanels, navigateBotTabs, type BotPanel, type BotContainerState } from './bot-console-model'
import type { BotRuntimeStatus } from '../../shared/api/bot-runtime'
import './bot-console.css'
import { apiClient } from '../../shared/api/client'
import { fetchBotServices, type BotService } from '../../shared/api/bots'

const emit = defineEmits<{ platformNavigation: [] }>()
type Tab = 'qq' | 'discord'
const tab = ref<Tab>('qq')
const selectedServiceId = ref<string | null>(null)
const services = ref<BotService[]>([])
const filtered = computed(() => services.value.filter(row => row.kind === (tab.value === 'qq' ? 'onebot_gateway' : 'discord_bridge')))
const panel = ref<BotPanel>('interaction')
const visited = ref(new Set<BotPanel>(['interaction']))
const activePanel = computed(() => botPanels.find(item => item.id === panel.value)!)
const interactionTab = ref<'settings' | 'workshop'>('settings')
const workshopVisited = ref(false)
const showingWorkshop = computed(() => panel.value === 'interaction' && interactionTab.value === 'workshop')
type SimulationEngine = 'dashboard' | 'akquant' | 'freqtrade'
const simulationEngine = ref<SimulationEngine>('dashboard')
const quantSettings = ref<InstanceType<typeof QuantSettings> | null>(null)
const freqtradeSettings = ref<InstanceType<typeof FreqtradeSettings> | null>(null)
const aiSettings = ref<InstanceType<typeof AiSettings> | null>(null)
const drawingSettings = ref<InstanceType<typeof AiDrawingSettings> | null>(null)
const simulationEnabled = computed(() => Boolean(quantSettings.value?.savedEnabled || freqtradeSettings.value?.savedEnabled))
const hasTradingDrafts = computed(() => Boolean(quantSettings.value?.hasUnsaved || freqtradeSettings.value?.hasUnsaved))
function allowTradingLeave() {
  if (hasTradingDrafts.value && !window.confirm('模拟交易有未保存或尚未确认保存的修改，离开将丢弃草稿，是否继续？')) return false
  if (aiSettings.value?.hasUnsaved && !window.confirm('AI 对话有未保存的修改，离开将丢弃草稿，是否继续？')) return false
  if (drawingSettings.value?.hasUnsaved && !window.confirm('AI 绘图有未保存的修改，离开将丢弃草稿，是否继续？')) return false
  return true
}
function selectBotTab(value: Tab) { if (value === tab.value || allowTradingLeave()) tab.value = value }
function serviceSelected(id: string | null) {
  if (id !== selectedServiceId.value && !allowTradingLeave()) {
    if (selectedServiceId.value) configuration.value?.selectService(selectedServiceId.value)
    return
  }
  selectedServiceId.value = id
}
function protectTradingDrafts(event: BeforeUnloadEvent) { if (hasTradingDrafts.value || aiSettings.value?.hasUnsaved || drawingSettings.value?.hasUnsaved) { event.preventDefault(); event.returnValue = '' } }
if (inject(routerKey, null)) onBeforeRouteLeave(allowTradingLeave)
onMounted(() => window.addEventListener('beforeunload', protectTradingDrafts))
function selectInteractionTab(value: 'settings' | 'workshop') {
  interactionTab.value = value
  if (value === 'workshop') workshopVisited.value = true
}
const currentService = computed(() => filtered.value.find(row => row.service_id === selectedServiceId.value) ?? null)
const configuration = ref<InstanceType<typeof BotConfiguration> | null>(null)
const interaction = ref<InstanceType<typeof BotInteractionSettings> | null>(null)
const containerState = ref<BotContainerState | null>(null)
const runtimeStatus = ref<BotRuntimeStatus | null>(null)
const timeOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
const beijingTime = new Intl.DateTimeFormat('zh-CN', { ...timeOptions, timeZone: 'Asia/Shanghai' })
const utcTime = new Intl.DateTimeFormat('zh-CN', { ...timeOptions, timeZone: 'UTC' })
const serverClock = computed(() => {
  if (!runtimeStatus.value?.checked_at) return null
  const date = new Date(runtimeStatus.value.checked_at)
  return Number.isNaN(date.valueOf()) ? null : { beijing: beijingTime.format(date), utc: utcTime.format(date) }
})
function selectPanel(value: BotPanel) { panel.value = value; visited.value.add(value) }
function selectService(id: string) { configuration.value?.selectService(id) }
function created(service: BotService) {
  if (service.kind !== (tab.value === 'qq' ? 'onebot_gateway' : 'discord_bridge')) return
  if (!services.value.some(item => item.service_id === service.service_id)) services.value = [...services.value, service]
  serviceSelected(service.service_id)
}
function updateContainer(value: { alias: Tab; state: BotContainerState | null }) {
  if (value.alias === tab.value) containerState.value = value.state
}
function limitConfigurationHit(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.detail === 0) return
  const target = event.target instanceof Element ? event.target : null
  const label = target?.closest('label')
  if (!(label instanceof HTMLLabelElement) || !(event.currentTarget instanceof HTMLElement) || !event.currentTarget.contains(label)) return
  const interactive = target?.closest('input, select, textarea, button, a, summary, [contenteditable="true"], [role="button"], [role="combobox"], [role="radio"], [role="checkbox"], [role="switch"], .el-select, .el-input, .el-input-number, .el-switch, .bot-number-with-unit, .quant-unit, .freqtrade-unit, .reply-template-shell')
  if (interactive && label.contains(interactive)) return
  const control = label.control
  if (!control) return
  if (control instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(control.type)) {
    const style = window.getComputedStyle(control), rect = control.getBoundingClientRect()
    if (style.display === 'none' || style.visibility === 'hidden' || (rect.width <= 1 && rect.height <= 1)) return
  }
  event.preventDefault()
}

const nativeUrl = ref<string | null>(null)
const nativeAllowed = computed(() => {
  if (!nativeUrl.value || !['127.0.0.1', 'localhost'].includes(window.location.hostname) || window.location.protocol !== 'https:') return false
  try {
    const url = new URL(nativeUrl.value)
    return url.protocol === 'https:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password
  } catch { return false }
})
const nativeHref = computed(() => {
  if (!nativeAllowed.value || !nativeUrl.value) return null
  const url = new URL(nativeUrl.value)
  url.hostname = window.location.hostname
  return url.toString()
})
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
let requestNo = 0

async function load(more = false) {
  const request = ++requestNo
  busy.value = true
  error.value = ''
  try {
    const page = await fetchBotServices(more ? cursor.value ?? undefined : undefined)
    if (request !== requestNo) return
    const current = services.value.find(row => row.service_id === selectedServiceId.value)
    const rows = new Map((more ? [...services.value, ...page.items] : page.items).map(row => [row.service_id, row]))
    if (current && !rows.has(current.service_id)) rows.set(current.service_id, current)
    services.value = [...rows.values()]
    cursor.value = page.next_cursor
  } catch (cause) {
    if (request === requestNo) error.value = cause instanceof Error ? cause.message : '读取连接失败'
  } finally { if (request === requestNo) busy.value = false }
}
watch(tab, () => { selectedServiceId.value = null; containerState.value = null; runtimeStatus.value = null; if (tab.value === 'discord' && (panel.value === 'quant' || panel.value === 'ai' || panel.value === 'drawing')) selectPanel('interaction') })
onMounted(async () => {
  await load()
  try {
    nativeUrl.value = (await apiClient.get<{ url: string | null }>('/bots/native-ui')).data.url
  } catch { nativeUrl.value = null }
})
onBeforeUnmount(() => { requestNo++; window.removeEventListener('beforeunload', protectTradingDrafts) })
</script>
<template>
  <section class="bot-page bot-console" @click.capture="limitConfigurationHit">
    <header class="bot-page-header">
      <BotStatusBar :kind="tab" :services="filtered" :service-id="selectedServiceId" :container-state="containerState"
        :busy="busy || Boolean(configuration?.busy)" :more="Boolean(cursor)" @select="selectService" @more="load(true)" @status="runtimeStatus = $event" @navigation="emit('platformNavigation')" />
      <div class="bot-tabs" role="tablist" aria-label="Bot 类型">
        <button type="button" role="tab" aria-label="QQ Bot" :aria-selected="tab === 'qq'" :class="{ active: tab === 'qq' }" :disabled="configuration?.busy" @click="selectBotTab('qq')"><BotBrandIcon kind="qq" /></button>
        <button type="button" role="tab" aria-label="Discord Bot" :aria-selected="tab === 'discord'" :class="{ active: tab === 'discord' }" :disabled="configuration?.busy" @click="selectBotTab('discord')"><BotBrandIcon kind="discord" /></button>
      </div><ThemeMenu /></header>
    <p v-if="error" class="bot-inline-error">{{ error }}</p>
    <div class="bot-console-body">
      <BotNavigation :panel="panel" :kind="tab" :connection-name="currentService?.name" :online="runtimeStatus?.state === 'online'"
        :interaction-enabled="Boolean(interaction?.savedEnabled)" :simulation-enabled="simulationEnabled" @select="selectPanel" />
      <main class="bot-content-panel" :aria-label="activePanel.label">
        <header v-if="panel === 'interaction' || panel === 'quant'" class="bot-content-heading">
          <BotInteractionTabs v-if="panel === 'interaction'" :model-value="interactionTab" @update:model-value="selectInteractionTab" />
          <div v-if="panel === 'quant'" class="bot-content-title-row">
            <div class="bot-engine-switch" role="tablist" aria-label="模拟交易引擎" @keydown="navigateBotTabs">
              <button id="bot-engine-dashboard" type="button" role="tab" data-engine-tab="dashboard" aria-controls="trading-dashboard" :aria-selected="simulationEngine === 'dashboard'" :tabindex="simulationEngine === 'dashboard' ? 0 : -1" @click="simulationEngine = 'dashboard'">运维看板</button>
              <button id="bot-engine-akquant" type="button" role="tab" data-engine-tab="akquant" aria-controls="akquant-settings" :aria-selected="simulationEngine === 'akquant'" :tabindex="simulationEngine === 'akquant' ? 0 : -1" @click="simulationEngine = 'akquant'">A股 · AKQuant</button>
              <button id="bot-engine-freqtrade" type="button" role="tab" data-engine-tab="freqtrade" aria-controls="freqtrade-settings" :aria-selected="simulationEngine === 'freqtrade'" :tabindex="simulationEngine === 'freqtrade' ? 0 : -1" @click="simulationEngine = 'freqtrade'">虚拟币 · Freqtrade</button>
            </div>
            <div class="bot-trading-clock" title="平台后端状态采样时间，约每 10 秒更新">
              <span>服务器时间（北京时间）</span><strong>{{ serverClock?.beijing ?? '—' }}</strong><small v-if="serverClock">UTC {{ serverClock.utc }}</small>
            </div>
          </div>
        </header>
        <div v-show="panel === 'runtime'" class="bot-panel-body bot-system-panel bot-runtime-panel">
          <BotContainers :alias="tab" :service-id="selectedServiceId" :show-online="false" @state="updateContainer">
            <a v-if="tab === 'qq' && nativeHref" :href="nativeHref" target="_blank" rel="noopener noreferrer">在新标签打开原生管理页</a>
          </BotContainers>
          <BotConfiguration ref="configuration" :kind="tab" :services="services" console-mode @changed="load()" @created="created" @selected="serviceSelected" />
          <BotServiceUpdates v-if="visited.has('runtime')" :alias="tab" />
        </div>
        <div v-if="visited.has('records')" v-show="panel === 'records'" class="bot-panel-body">
          <BotLogViewer :kind="tab" :active="panel === 'records'" />
        </div>
        <div v-if="visited.has('interaction')" v-show="panel === 'interaction'" class="bot-panel-body">
          <div id="bot-interaction-settings" v-show="interactionTab === 'settings'" role="tabpanel" aria-labelledby="bot-interaction-settings-tab">
            <BotInteractionSettings :key="tab" ref="interaction" :kind="tab" :service="currentService" />
          </div>
          <div id="bot-interaction-workshop" v-show="interactionTab === 'workshop'" role="tabpanel" aria-labelledby="bot-interaction-workshop-tab" class="bot-workshop-panel">
            <MemeWorkshop v-if="workshopVisited" :platform="tab" />
          </div>
        </div>
        <div v-if="visited.has('quant') && tab === 'qq'" v-show="panel === 'quant'" class="bot-panel-body">
          <template v-if="currentService">
            <div id="trading-dashboard" v-show="simulationEngine === 'dashboard'" role="tabpanel" aria-labelledby="bot-engine-dashboard">
              <BotTradingDashboard :quant="quantSettings?.health ?? null" :quant-error="quantSettings?.healthError ?? ''" :quant-busy="quantSettings?.healthBusy ?? false" :quant-message="quantSettings?.healthMessage ?? ''" :quote="quantSettings?.quoteHealth ?? null"
                :freqtrade="freqtradeSettings?.status ?? null" :freqtrade-error="freqtradeSettings?.statusError ?? ''" :freqtrade-busy="freqtradeSettings?.statusBusy ?? false" :freqtrade-message="freqtradeSettings?.statusMessage ?? ''"
                @refresh-quant="quantSettings?.refreshHealth()" @refresh-freqtrade="freqtradeSettings?.refreshStatus()" />
            </div>
            <div id="akquant-settings" v-show="simulationEngine === 'akquant'" role="tabpanel" aria-labelledby="bot-engine-akquant">
              <QuantSettings :key="currentService.service_id" ref="quantSettings" :service-id="currentService.service_id" />
            </div>
            <div id="freqtrade-settings" v-show="simulationEngine === 'freqtrade'" role="tabpanel" aria-labelledby="bot-engine-freqtrade">
              <FreqtradeSettings :key="currentService.service_id" ref="freqtradeSettings" :service-id="currentService.service_id" />
            </div>
          </template>
          <p v-else class="bot-console-empty">请选择 QQ 连接，再配置模拟交易。</p>
        </div>
        <div v-if="visited.has('ai') && tab === 'qq'" v-show="panel === 'ai'" class="bot-panel-body">
          <AiSettings v-if="currentService" :key="currentService.service_id" ref="aiSettings" :service-id="currentService.service_id" />
          <p v-else class="bot-console-empty">请选择 QQ 连接，再配置 AI 对话。</p>
        </div>
        <div v-if="visited.has('drawing') && tab === 'qq'" v-show="panel === 'drawing'" class="bot-panel-body">
          <AiDrawingSettings v-if="currentService" :key="currentService.service_id" ref="drawingSettings" :service-id="currentService.service_id" :active="panel === 'drawing'" />
          <p v-else class="bot-console-empty">请选择 QQ 连接，再配置 AI 绘图。</p>
        </div>
      </main>
    </div>
    <footer class="bot-console-foot"><i class="bot-status-dot" :class="{ online: runtimeStatus?.state === 'online' }" /><span>{{ showingWorkshop ? 'QQ / Discord 共用表情模板' : panel === 'interaction' ? interaction?.status || '正在读取…' : '当前连接：' + (currentService?.name || '未选择连接') }}</span></footer>
  </section>
</template>
