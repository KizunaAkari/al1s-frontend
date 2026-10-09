<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElDrawer, ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import BotConfiguration from './BotConfiguration.vue'
import BotContainers from './BotContainers.vue'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'
import MemeWorkshop from './memes/MemeWorkshop.vue'
import { apiClient } from '../../shared/api/client'
import { fetchBotApplications, fetchBotServices, type BotApplication, type BotService } from '../../shared/api/bots'

type Tab = 'qq' | 'discord' | 'memes'
const tab = ref<Tab>('qq')
const selectedServiceId = ref<string | null>(null)
const services = ref<BotService[]>([])
const filtered = computed(() => services.value.filter(row => row.kind === (tab.value === 'qq' ? 'onebot_gateway' : 'discord_bridge')))
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
    services.value = more ? [...services.value, ...page.items] : page.items
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
watch(tab, () => { nativeOpen.value = false; selectedServiceId.value = null })
onMounted(async () => {
  await load()
  try {
    nativeUrl.value = (await apiClient.get<{ url: string | null }>('/bots/native-ui')).data.url
  } catch { nativeUrl.value = null }
})
onBeforeUnmount(() => { requestNo++; detailNo++ })
</script>

<template>
  <section class="bot-page">
    <header class="bot-page-header"><h1>Bot 管理</h1></header>
    <div class="bot-tabs" role="tablist" aria-label="Bot 类型">
      <button type="button" role="tab" :aria-selected="tab === 'qq'" :class="{ active: tab === 'qq' }" @click="tab = 'qq'"><BotBrandIcon kind="qq" />QQ Bot</button>
      <button type="button" role="tab" :aria-selected="tab === 'discord'" :class="{ active: tab === 'discord' }" @click="tab = 'discord'"><BotBrandIcon kind="discord" />Discord Bot</button>
      <button type="button" role="tab" :aria-selected="tab === 'memes'" :class="{ active: tab === 'memes' }" @click="tab = 'memes'">表情包工坊</button>
    </div>
    <MemeWorkshop v-if="tab === 'memes'" />
    <template v-else>
    <div class="bot-section-heading"><div><h2>{{ tab === 'qq' ? 'QQ Bot' : 'Discord Bot' }}</h2><span class="bot-pill">{{ tab === 'qq' ? 'LLOneBot' : 'Discord Worker' }}</span></div><el-button text :loading="busy" @click="load()">⟳ 刷新</el-button></div>
    <p v-if="error" class="bot-inline-error">{{ error }}</p>
    <div class="bot-card-grid">
      <div class="bot-connection-stack">
        <BotConfiguration :kind="tab" :services="services" @changed="load()" @selected="selectedServiceId = $event" />
        <section v-if="tab === 'qq'" class="bot-card bot-native-summary">
          <div class="bot-card-heading"><h2>原生管理页 </h2><span class="bot-pill">{{ nativeAllowed ? '本机可打开' : '未配置或不可访问' }}</span></div>
          
          <div v-if="nativeAllowed" class="bot-actions"><el-button type="primary" plain @click="openNative">在本页打开</el-button><a :href="nativeHref ?? undefined" target="_blank" rel="noopener noreferrer">在新标签页打开 ↗</a></div>
          <p v-else class="bot-help">{{ nativeUrl ? '原生页只允许通过部署主机的本机 HTTPS 地址打开；请在该主机使用 localhost 或 127.0.0.1 访问管理平台。' : '部署端尚未配置原生管理页入口；不会自动开放公网端口。' }}</p>
        </section>
      </div>
      <BotContainers :alias="tab" :service-id="selectedServiceId" />
    </div>
    <section v-if="tab === 'qq' && nativeOpen && nativeAllowed" class="bot-card bot-native-frame">
      <div class="bot-card-heading"><h2>LLOneBot 原生管理页</h2><div class="bot-actions"><a :href="nativeHref ?? undefined" target="_blank" rel="noopener noreferrer">新标签页打开 ↗</a><el-button text @click="nativeOpen = false">关闭</el-button></div></div>
      <p v-if="nativeLoading" class="bot-help">正在加载原生页面…</p>
      <p v-if="nativeFailed" class="bot-inline-error">原生页面加载失败；请检查 LLOneBot 容器和本机 HTTPS 入口。</p>
      <iframe :src="nativeHref ?? undefined" title="LLOneBot 原生管理页" referrerpolicy="no-referrer" @load="nativeLoading = false" @error="nativeLoading = false; nativeFailed = true" />
    </section>
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
    </template>
  </section>
</template>

<style>
.bot-page { padding: 0 0 24px; color: var(--text); background: var(--bg); min-width: 0; }
.bot-page-header h1 { margin: 0 0 20px; font-size: 30px; }
.bot-tabs { display: flex; gap: 24px; overflow-x: auto; border-bottom: 1px solid var(--border-strong); margin-bottom: 24px; }
.bot-tabs button { display: inline-flex; align-items: center; gap: 8px; flex: none; white-space: nowrap; background: none; border: 0; border-bottom: 3px solid transparent; padding: 12px 20px 14px; color: var(--muted); font: inherit; cursor: pointer; }
.bot-tabs button.active { border-bottom-color: var(--accent); color: var(--accent); font-weight: 700; }
.bot-section-heading, .bot-section-heading > div, .bot-card-heading, .bot-actions, .bot-inline { display: flex; align-items: center; gap: 12px; }
.bot-section-heading { flex-wrap: wrap; justify-content: space-between; margin: 0 0 18px; }
.bot-section-heading > div { flex-wrap: wrap; }
.bot-section-heading h2 { margin: 0; font-size: 24px; white-space: nowrap; }
.bot-pill { color: var(--accent); background: var(--surface-soft); border-radius: 6px; padding: 5px 10px; font-size: 13px; white-space: nowrap; }
.bot-card-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; gap: 16px; }
.bot-connection-stack { display: grid; gap: 16px; min-width: 0; }
.bot-card { padding: 18px; border: 1px solid var(--border-strong); background: var(--surface); border-radius: 10px; min-width: 0; }
.bot-card-heading { justify-content: space-between; flex-wrap: wrap; margin-bottom: 16px; }
.bot-card-heading h2 { margin: 0; font-size: 21px; }
.bot-card-heading > span { color: var(--muted); }
.bot-help { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 8px 0 16px; }
.bot-field { display: grid; gap: 7px; min-width: 0; }
.bot-field label { font-weight: 600; font-size: 14px; }
.bot-field small { color: var(--muted); font-weight: 400; font-size: 12px; }
.bot-create, .bot-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 16px 0; }
.bot-create .bot-actions, .bot-settings .bot-field { grid-column: 1 / -1; }
.bot-inline { min-width: 0; }
.bot-inline .el-button { margin-left: 0; flex-shrink: 0; }
.bot-fill { flex: 1; min-width: 0; }
.bot-field .el-select { width: 100%; }
.bot-actions { flex-wrap: wrap; margin: 16px 0 0; }
.bot-actions a { color: var(--accent); text-decoration: none; font-size: 14px; }
.bot-page .el-button.is-text { color: var(--accent); }
.bot-actions .el-button { margin-left: 0; }
.bot-grant { display: flex; gap: 8px; margin-top: 12px; }
.bot-status-grid { display: grid; grid-template-columns: repeat(2, 1fr); margin: 20px 0; }
.bot-status-grid > div { display: grid; gap: 8px; padding-right: 16px; }
.bot-status-grid > div + div { padding-left: 18px; border-left: 1px solid var(--border); }
.bot-status-grid span { color: var(--muted); font-size: 14px; }
.bot-status-grid strong { font-size: 22px; }
.bot-warning { background: #fff5e7; color: #a85c00; border-radius: 8px; padding: 14px; }
.bot-warning p { margin: 5px 0 0; font-size: 13px; }
.bot-container-actions .el-button { min-width: 68px; }
.bot-card-foot, .bot-record-foot { border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 0; }
.bot-inline-error { color: #bd3838; background: #fff0f0; padding: 10px 14px; border-radius: 6px; }
.bot-native-frame { margin-top: 16px; }
.bot-native-frame iframe { display: block; width: 100%; height: min(76vh, 860px); border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.bot-records { margin-top: 16px; }
.bot-table-wrap { overflow-x: auto; }
.bot-table { border-collapse: collapse; width: 100%; min-width: 730px; }
.bot-table th { background: var(--surface-soft); color: var(--muted); text-align: left; font-size: 14px; }
.bot-table th, .bot-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); }
.bot-table td:first-child { font-weight: 600; }
.bot-record-status.success { color: #129b6a; font-weight: 600; }
@media (max-width: 900px) { .bot-card-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .bot-page { padding: 0 0 20px; }.bot-page-header h1 { font-size: 25px; }.bot-tabs { gap: 4px; }.bot-tabs button { padding-inline: 12px; }.bot-card { padding: 18px 14px; }.bot-create, .bot-settings { grid-template-columns: 1fr; }.bot-create .bot-actions, .bot-settings .bot-field { grid-column: auto; } }
</style>
