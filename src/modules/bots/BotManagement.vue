<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElDrawer, ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import BotConfiguration from './BotConfiguration.vue'
import BotContainers from './BotContainers.vue'
import BotServiceUpdates from './BotServiceUpdates.vue'
import QqDeviceIdentity from './QqDeviceIdentity.vue'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'
import MemeWorkshop from './memes/MemeWorkshop.vue'
import BotNavigation from './BotNavigation.vue'
import BotStatusBar from './BotStatusBar.vue'
import BotInteractionSettings from './BotInteractionSettings.vue'
import BotInteractionTabs from './BotInteractionTabs.vue'
import { botPanels, type BotPanel, type BotContainerState } from './bot-console-model'
import type { BotRuntimeStatus } from '../../shared/api/bot-runtime'
import './bot-console.css'
import { apiClient } from '../../shared/api/client'
import { fetchBotApplications, fetchBotServices, type BotApplication, type BotService } from '../../shared/api/bots'

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
function selectInteractionTab(value: 'settings' | 'workshop') {
  interactionTab.value = value
  if (value === 'workshop') workshopVisited.value = true
}
const currentService = computed(() => filtered.value.find(row => row.service_id === selectedServiceId.value) ?? null)
const configuration = ref<InstanceType<typeof BotConfiguration> | null>(null)
const containers = ref<InstanceType<typeof BotContainers> | null>(null)
const statusBar = ref<InstanceType<typeof BotStatusBar> | null>(null)
const interaction = ref<InstanceType<typeof BotInteractionSettings> | null>(null)
const containerState = ref<BotContainerState | null>(null)
const runtimeStatus = ref<BotRuntimeStatus | null>(null)
function selectPanel(value: BotPanel) { panel.value = value; visited.value.add(value) }
function selectService(id: string) { configuration.value?.selectService(id) }
function createConnection() { selectPanel('connection'); configuration.value?.startCreate() }
function created(service: BotService) {
  if (service.kind !== (tab.value === 'qq' ? 'onebot_gateway' : 'discord_bridge')) return
  if (!services.value.some(item => item.service_id === service.service_id)) services.value = [...services.value, service]
  selectedServiceId.value = service.service_id
}
function updateContainer(value: { alias: Tab; state: BotContainerState | null }) {
  if (value.alias === tab.value) containerState.value = value.state
}
function refreshStatus() { void load(); void containers.value?.refresh(); void statusBar.value?.refresh() }

const nativeUrl = ref<string | null>(null)
const nativeOpen = ref(false)
const nativeLoading = ref(false)
const nativeFailed = ref(false)
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
const applications = ref<BotApplication[]>([])
const applicationCursor = ref<string | null>(null)
const selected = ref<BotService | null>(null)
const drawer = ref(false)
const detailBusy = ref(false)
const detailError = ref('')
let requestNo = 0
let detailNo = 0

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
async function open(service: BotService, more = false) {
  const request = ++detailNo
  selected.value = service
  drawer.value = true
  detailBusy.value = true
  detailError.value = ''
  if (!more) { applications.value = []; applicationCursor.value = null }
  try {
    const page = await fetchBotApplications(service.service_id, more ? applicationCursor.value ?? undefined : undefined)
    if (request !== detailNo) return
    applications.value = more ? [...applications.value, ...page.items] : page.items
    applicationCursor.value = page.next_cursor
  } catch (cause) {
    if (request === detailNo) detailError.value = cause instanceof Error ? cause.message : '读取应用记录失败'
  } finally { if (request === detailNo) detailBusy.value = false }
}
function applicationState(service: BotService) {
  if (!service.desired_config_version_id) return '未配置'
  return service.desired_config_version_id === service.applied_config_version_id ? '已应用' : '待应用'
}
function shortId(value: string | null) { return value ? value.slice(0, 8) + '…' : '—' }
function openNative() {
  nativeFailed.value = false
  nativeLoading.value = true
  nativeOpen.value = true
}
watch(tab, () => { nativeOpen.value = false; selectedServiceId.value = null; containerState.value = null; runtimeStatus.value = null })
onMounted(async () => {
  await load()
  try {
    nativeUrl.value = (await apiClient.get<{ url: string | null }>('/bots/native-ui')).data.url
  } catch { nativeUrl.value = null }
})
onBeforeUnmount(() => { requestNo++; detailNo++ })
</script>
<template>
  <section class="bot-page bot-console">
    <header class="bot-page-header"><div class="bot-console-heading"><h1>Bot 管理</h1><span class="bot-console-badge">Console</span></div>
      <div class="bot-tabs" role="tablist" aria-label="Bot 类型">
        <button type="button" role="tab" :aria-selected="tab === 'qq'" :class="{ active: tab === 'qq' }" :disabled="configuration?.busy" @click="tab = 'qq'"><BotBrandIcon kind="qq" />QQ Bot</button>
        <button type="button" role="tab" :aria-selected="tab === 'discord'" :class="{ active: tab === 'discord' }" :disabled="configuration?.busy" @click="tab = 'discord'"><BotBrandIcon kind="discord" />Discord Bot</button>
      </div></header>
    <BotStatusBar ref="statusBar" :kind="tab" :services="filtered" :service-id="selectedServiceId" :container-state="containerState"
      :busy="busy || Boolean(configuration?.busy)" :refreshing="Boolean(containers?.busy)" :more="Boolean(cursor)" @select="selectService" @create="createConnection" @more="load(true)" @refresh="refreshStatus" @status="runtimeStatus = $event" />
    <p v-if="error" class="bot-inline-error">{{ error }}</p>
    <div class="bot-console-body">
      <BotNavigation :panel="panel" :connection-name="currentService?.name" :online="runtimeStatus?.state === 'online'"
        :interaction-enabled="Boolean(interaction?.savedEnabled)" @select="selectPanel" />
      <main class="bot-content-panel">
        <header class="bot-content-heading">
          <BotInteractionTabs v-if="panel === 'interaction'" :model-value="interactionTab" @update:model-value="selectInteractionTab" />
          <p v-else>{{ activePanel.group }} <span>/</span> {{ activePanel.label }}</p>
          <h2>{{ showingWorkshop ? '表情包工坊' : activePanel.label }}</h2>
          <p>{{ showingWorkshop ? '制作互动表情：管理模板、素材与动画效果，预览合成结果。' : activePanel.description }}</p>
        </header>
        <div v-show="panel === 'connection'" class="bot-panel-body">
          <BotConfiguration ref="configuration" :kind="tab" :services="services" console-mode @changed="load()" @created="created" @selected="selectedServiceId = $event" />
        </div>
        <div v-show="panel === 'runtime'" class="bot-panel-body">
          <BotContainers ref="containers" :alias="tab" :service-id="selectedServiceId" :show-online="false" @state="updateContainer" />
          <QqDeviceIdentity v-if="tab === 'qq' && visited.has('runtime')" :active="panel === 'runtime'" />
          <BotServiceUpdates v-if="visited.has('runtime')" :alias="tab" />
          <section v-if="tab === 'qq'" class="bot-card bot-native-summary">
            <div class="bot-card-heading"><h2>原生管理页</h2><span class="bot-pill">{{ nativeAllowed ? '本机可打开' : '未配置或不可访问' }}</span></div>
            <div v-if="nativeAllowed" class="bot-actions"><el-button type="primary" plain @click="openNative">在本页打开</el-button><a :href="nativeHref ?? undefined" target="_blank" rel="noopener noreferrer">在新标签页打开 ↗</a></div>
            <p v-else class="bot-help">{{ nativeUrl ? '原生页仅允许通过部署主机的本机 HTTPS 地址访问。' : '部署端尚未配置原生管理页入口。' }}</p>
          </section>
          <section v-if="tab === 'qq' && nativeOpen && nativeAllowed" class="bot-card bot-native-frame">
            <div class="bot-card-heading"><h2>LLOneBot 原生管理页</h2><el-button text @click="nativeOpen = false">关闭</el-button></div>
            <p v-if="nativeLoading" class="bot-help">正在加载原生页面…</p><p v-if="nativeFailed" class="bot-inline-error">原生页面加载失败，请检查容器与本机 HTTPS 入口。</p>
            <iframe :src="nativeHref ?? undefined" title="LLOneBot 原生管理页" referrerpolicy="no-referrer" @load="nativeLoading = false" @error="nativeLoading = false; nativeFailed = true" />
          </section>
        </div>
        <div v-if="visited.has('records')" v-show="panel === 'records'" class="bot-panel-body">
    <section class="bot-card bot-records">
      <div class="bot-card-heading"><h2>连接与配置应用记录 <HelpHint subject="连接与配置应用记录">启用状态与容器状态分别显示；目标版本和已应用版本分别记录。通知通道引用这里的连接。</HelpHint></h2><span>{{ filtered.length }} 个连接</span></div>
      <div class="bot-table-wrap">
        <table class="bot-table">
          <thead><tr><th>连接名称</th><th>启用状态</th><th>目标版本</th><th>已应用版本</th><th>应用状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="service in filtered" :key="service.service_id">
              <td>{{ service.name }}</td><td>{{ service.enabled ? '已启用' : '已停用' }}</td>
              <td :title="service.desired_config_version_id ?? ''">{{ shortId(service.desired_config_version_id) }}</td>
              <td :title="service.applied_config_version_id ?? ''">{{ shortId(service.applied_config_version_id) }}</td>
              <td><span :class="['bot-record-status', applicationState(service) === '已应用' ? 'success' : '']">{{ applicationState(service) }}</span></td>
              <td><el-button text type="primary" @click="open(service)">应用记录</el-button></td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!busy && !error && !filtered.length" :description="`暂无 ${tab === 'qq' ? 'QQ Bot' : 'Discord Bot'} 连接`" />
      </div>
      <el-button v-if="cursor" :disabled="busy" @click="load(true)">加载更多连接</el-button>

    </section>
    <el-drawer v-model="drawer" title="配置应用记录" size="min(760px, 95vw)">
      <p v-if="detailError" class="bot-inline-error">{{ detailError }}</p>
      <el-table :data="applications" row-key="application_id" v-loading="detailBusy">
        <el-table-column prop="status" label="状态" min-width="90" />
        <el-table-column prop="error_code" label="错误代码" min-width="130" />
        <el-table-column prop="error_summary" label="错误摘要" min-width="180" />
        <el-table-column prop="requested_at" label="请求时间" min-width="210" />
        <el-table-column prop="completed_at" label="完成时间" min-width="210" />
      </el-table>
      <el-button v-if="applicationCursor && selected" :disabled="detailBusy" @click="open(selected, true)">加载更多记录</el-button>
    </el-drawer>

        </div>
        <div v-if="visited.has('interaction')" v-show="panel === 'interaction'" class="bot-panel-body">
          <div id="bot-interaction-settings" v-show="interactionTab === 'settings'" role="tabpanel" aria-labelledby="bot-interaction-settings-tab">
            <BotInteractionSettings :key="tab" ref="interaction" :kind="tab" :service="currentService" />
          </div>
          <div id="bot-interaction-workshop" v-show="interactionTab === 'workshop'" role="tabpanel" aria-labelledby="bot-interaction-workshop-tab" class="bot-workshop-panel">
            <MemeWorkshop v-if="workshopVisited" :platform="tab" />
          </div>
        </div>
      </main>
    </div>
    <footer class="bot-console-foot"><i class="bot-status-dot" :class="{ online: runtimeStatus?.state === 'online' }" /><span>{{ showingWorkshop ? 'QQ / Discord 共用表情模板' : panel === 'interaction' ? interaction?.status || '正在读取…' : '当前连接：' + (currentService?.name || '未选择连接') }}</span></footer>
  </section>
</template>
