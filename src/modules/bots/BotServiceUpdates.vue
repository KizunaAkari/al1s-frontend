<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElButton, ElDrawer } from 'element-plus'
import { botUpdateApi, type BotAlias, type BotUpdateState } from '../../shared/api/bot-updates'
import { type ComponentRelease, type InventoryEntry } from '../../shared/api/components'
import { formatDateTime } from '../../shared/presentation/format'
import ComponentUpgradeDialog from '../maintenance/ComponentUpgradeDialog.vue'
import ComponentOperationHistory from '../maintenance/ComponentOperationHistory.vue'
import BotReleaseList from './BotReleaseList.vue'
import { sortBotVersions } from './bot-version-order'
import { BotUpdateSession } from './bot-update-session'

const props = defineProps<{ alias: BotAlias }>()
const session = new BotUpdateSession(props.alias)
const state = ref<BotUpdateState | null>(null), versions = ref<ComponentRelease[]>([])
const cursor = ref<string | null>(null), error = ref(''), busy = ref(false)
const selected = ref<InventoryEntry | null>(null), selectedRelease = ref<ComponentRelease | null>(null)
const historyOpen = ref(false), historyBusy = ref(false), historyRows = ref<ComponentRelease[]>([])
const historyCursor = ref<string>(), historyNext = ref<string | null>(null)
const historyBack = ref<(string | undefined)[]>([])
const remembered: Partial<Record<BotAlias, BotUpdateState>> = {}
const available = computed(() => versions.value.some(row => row.state === 'published' && row.architecture === state.value?.current.architecture))
let timer: ReturnType<typeof setTimeout> | undefined, historyGeneration = 0

function scheduleRefresh() {
  clearTimeout(timer)
  const rows = [...versions.value, ...(historyOpen.value ? historyRows.value : [])]
  if (rows.some(row => ['queued', 'verifying'].includes(row.state))) timer = setTimeout(() => void refresh(), 5000)
}
async function refresh() {
  if (busy.value) return
  const request = session.capture()
  busy.value = true; error.value = ''; clearTimeout(timer)
  const [inventory, releases] = await Promise.allSettled([
    botUpdateApi.state(request.alias), botUpdateApi.versions(request.alias),
  ])
  if (!session.current(request)) return
  if (inventory.status === 'fulfilled') {
    state.value = inventory.value; remembered[request.alias] = inventory.value
  } else error.value = '当前版本读取失败，保留上次观测；请刷新重试。'
  if (releases.status === 'fulfilled') {
    versions.value = sortBotVersions(releases.value.items).slice(0, 5)
    cursor.value = releases.value.next_cursor
  } else error.value = '版本列表读取失败，请刷新重试。'
  busy.value = false; scheduleRefresh()
  if (historyOpen.value && !historyBusy.value) void loadHistory(historyCursor.value, historyBack.value)
}
async function loadHistory(anchor: string | undefined, previous: (string | undefined)[]) {
  if (historyBusy.value) return
  const request = session.capture(), epoch = ++historyGeneration
  historyBusy.value = true; error.value = ''
  try {
    const result = await botUpdateApi.versions(request.alias, 25, anchor)
    if (!session.current(request) || epoch !== historyGeneration || !historyOpen.value) return
    historyRows.value = sortBotVersions(result.items)
    historyCursor.value = anchor; historyNext.value = result.next_cursor
    historyBack.value = [...previous]
  } catch (cause) {
    if (session.current(request) && epoch === historyGeneration) error.value = cause instanceof Error ? cause.message : '历史版本读取失败，请重试。'
  } finally {
    if (session.current(request) && epoch === historyGeneration) {
      historyBusy.value = false; scheduleRefresh()
    }
  }
}
function openHistory() {
  historyOpen.value = true; historyRows.value = []; historyBack.value = []; historyNext.value = null
  historyCursor.value = cursor.value ?? undefined
  void loadHistory(cursor.value ?? undefined, [])
}
function selectVersion(row?: ComponentRelease) {
  if (!state.value?.current.source_identity) return
  selectedRelease.value = row ?? null; selected.value = state.value.current; historyOpen.value = false
}
async function checkOfficial() {
  if (busy.value || props.alias !== 'qq') return
  const request = session.capture()
  busy.value = true; error.value = ''
  try { await botUpdateApi.checkQq() }
  catch (cause) { if (session.current(request)) error.value = cause instanceof Error ? cause.message : '官方版本检查失败；现有服务保持运行。' }
  finally { if (session.current(request)) { busy.value = false; if (!error.value) void refresh() } }
}
async function prepare(row: ComponentRelease) {
  if (busy.value || props.alias !== 'qq' || !['draft', 'failed'].includes(row.state)) return
  const request = session.capture()
  busy.value = true; error.value = ''
  try {
    const result = await botUpdateApi.prepare(row)
    if (session.current(request)) {
      versions.value = versions.value.map(item => item.release_id === result.release_id ? result : item)
      historyRows.value = historyRows.value.map(item => item.release_id === result.release_id ? result : item)
    }
  } catch (cause) { if (session.current(request)) error.value = cause instanceof Error ? cause.message : '候选准备未确认，请刷新核对。' }
  finally { if (session.current(request)) { busy.value = false; if (!error.value) void refresh() } }
}
watch(historyOpen, open => {
  if (!open) { historyGeneration++; historyBusy.value = false; scheduleRefresh() }
})
watch(() => props.alias, alias => {
  session.select(alias); clearTimeout(timer); selected.value = null; selectedRelease.value = null; busy.value = false
  historyGeneration++; historyOpen.value = false; historyBusy.value = false; historyRows.value = []
  historyCursor.value = undefined; historyBack.value = []; historyNext.value = null
  state.value = remembered[alias] ?? null; versions.value = []; cursor.value = null; error.value = ''
  void refresh()
}, { immediate: true })
onBeforeUnmount(() => { session.close(); historyGeneration++; clearTimeout(timer) })
</script>
<template>
  <section class="bot-card bot-updates" aria-label="Bot服务更新">
    <div class="bot-card-heading"><h2>服务更新</h2><ElButton :loading="busy" @click="refresh()">刷新版本</ElButton></div>
    <dl v-if="state">
      <div><dt>原生版本</dt><dd>{{ state.current.version ?? '未知' }}</dd></div>
      <div><dt>表情后台版本</dt><dd>{{ state.runtime_version ?? '未知' }}</dd></div>
      <template v-if="alias === 'qq' && state.current.qq_protocol_mode === 'pmhq'">
        <div><dt>运行模式</dt><dd>PMHQ · 有头客户端</dd></div>
        <div><dt>QQ 客户端版本</dt><dd>{{ state.current.qq_client_version ?? '未知' }}</dd></div>
        <div><dt>PMHQ 版本</dt><dd>{{ state.current.pmhq_version ?? '未知' }}</dd></div>
      </template>
      <div><dt>镜像</dt><dd :title="state.current.image_id ?? ''">{{ state.current.image ?? '未知' }}</dd></div>
      <div><dt>观测时间</dt><dd>{{ state.current.observed_at ? formatDateTime(state.current.observed_at) : '尚未观测' }}</dd></div>
    </dl>
    <p class="bot-help">服务版本与账号在线状态分别显示。更新仅操作当前 Bot，账号需要重新验证时请打开原生管理页。</p>
    <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
    <div class="bot-actions">
      <ElButton v-if="alias === 'qq'" :disabled="busy" @click="checkOfficial">检查官方版本</ElButton>
      <ElButton v-if="available && state" data-action="upgrade-bot" type="primary" :disabled="busy || !state.current.source_identity" @click="selectVersion()">选择版本并预检</ElButton>
      <ElButton v-if="cursor" data-action="history-versions" :disabled="busy" @click="openHistory">历史版本</ElButton>
    </div>
    <p v-if="alias === 'qq'" class="bot-help">先准备包含表情后台的完整镜像，再预检并确认升级。检查和准备不会切换当前服务。</p>
    <p v-else class="bot-help">使用平台版本包；管理员在「系统维护 → 版本库 → Discord Bot」上传并校验。</p>
    <BotReleaseList data-test="latest-versions" :versions="versions" :alias="alias" :busy="busy" :current-version="state?.current.version ?? null" :architecture="state?.current.architecture ?? null" :ready="Boolean(state?.current.source_identity)" @prepare="prepare" @select="selectVersion" />
    <p v-if="!busy && !versions.length" class="bot-help">尚无可用版本。</p>
    <ElDrawer v-model="historyOpen" title="历史版本" size="min(960px, 95vw)">
      <div class="history-content">
        <p v-if="error" class="bot-inline-error" role="alert">{{ error }}</p>
        <BotReleaseList data-test="history-versions" :versions="historyRows" :alias="alias" :busy="busy || historyBusy" :current-version="state?.current.version ?? null" :architecture="state?.current.architecture ?? null" :ready="Boolean(state?.current.source_identity)" @prepare="prepare" @select="selectVersion" />
        <p v-if="!historyBusy && !historyRows.length">没有更早的版本。</p>
        <div class="bot-actions">
          <ElButton v-if="historyBack.length" :disabled="historyBusy || busy" @click="loadHistory(historyBack.at(-1), historyBack.slice(0,-1))">上一页</ElButton>
          <ElButton v-if="historyNext" :disabled="historyBusy || busy" @click="loadHistory(historyNext ?? undefined, [...historyBack, historyCursor])">更早版本</ElButton>
          <ElButton v-if="error" :disabled="historyBusy" @click="loadHistory(historyCursor, historyBack)">重试</ElButton>
        </div>
      </div>
    </ElDrawer>
    <ComponentUpgradeDialog :row="selected" :initial-release="selectedRelease" :bot-option-limit="5" @close="selected = null; selectedRelease = null" @changed="refresh()" />
    <ComponentOperationHistory :bot-alias="alias" />
  </section>
</template>
<style scoped>
.bot-updates{display:grid;gap:16px;min-width:0}dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}dt{color:var(--muted);font-size:12px}dd{margin:4px 0 0;overflow-wrap:anywhere}p{margin:0}.history-content{display:grid;gap:16px;min-width:0} @media(max-width:640px){dl{grid-template-columns:1fr}}
</style>

