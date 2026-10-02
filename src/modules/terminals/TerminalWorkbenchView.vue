<script setup lang="ts">
import { Plus, Refresh, Search, MoreFilled } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElInput, ElMessage, ElMessageBox, ElDrawer, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon, ElTabs, ElTabPane, ElRadioGroup, ElRadioButton } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LinuxReleases from './LinuxReleases.vue'
import { useCursorPage } from '../../shared/api/pagination'
import { fetchTerminals, fetchTargetDevices, deleteTerminal, type Terminal, type TargetDevice } from '../../shared/api/terminals'
import { formatDateTime as dateTime } from '../../shared/presentation/format'
import PageHeader from '../../shared/ui/PageHeader.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import TerminalTypeIcon from '../../shared/ui/TerminalTypeIcon.vue'
import RegistrationGrantDialog from './RegistrationGrantDialog.vue'
import TerminalCapability from './TerminalCapability.vue'
import HostMaintenance from './HostMaintenance.vue'
import TerminalStorage from './TerminalStorage.vue'
import TerminalLogs from './TerminalLogs.vue'
import LogicalPhones from './LogicalPhones.vue'
import TerminalNameEditor from './TerminalNameEditor.vue'
import TerminalOverview from './TerminalOverview.vue'
import './workbench.css'
const terminals = useCursorPage<Terminal, string>(fetchTerminals, t => t.terminal_id)
const devices = useCursorPage<TargetDevice, string>(fetchTargetDevices, d => d.device_id)
const route = useRoute()
const router = useRouter()
const search = ref('')
const formatDateTime = (value: string | null | undefined) => dateTime(value).replace('---', '—')
const type = ref('all')
const selectedId = ref(typeof route.query.terminal_id === 'string' ? route.query.terminal_id : '')
const mobileDetail = ref(Boolean(selectedId.value))
const tab = ref('overview')
const phoneScope = ref<'current' | 'unbound' | 'all'>('current')
const grantDialogVisible = ref(false)
const grantTarget = ref<Pick<TargetDevice, 'device_id' | 'display_name'> | null>(null)
const deletingTerminalId = ref<string | null>(null)
const releasesVisible = computed({
  get: () => route.query.panel === 'releases',
  set: value => { void router.replace({ query: { ...route.query, panel: value ? 'releases' : undefined } }) },
})
const filtered = computed(() => terminals.items.value.filter(t =>
  (type.value === 'all' || t.terminal_type === type.value)
  && (t.display_name + ' ' + t.terminal_id).toLowerCase().includes(search.value.trim().toLowerCase())))
const selected = computed(() => terminals.items.value.find(t => t.terminal_id === selectedId.value))
const onlineCount = computed(() => terminals.items.value.filter(t => t.service_status === 'online').length)
watch(() => route.query.terminal_id, id => {
  if (typeof id === 'string') { selectedId.value = id; mobileDetail.value = true }
  else mobileDetail.value = false
})
watch(terminals.items, items => { if (!selectedId.value && items.length) selectedId.value = items[0]!.terminal_id })
watch(selectedId, () => { tab.value = 'overview' })
function select(t: Terminal) {
  selectedId.value = t.terminal_id
  mobileDetail.value = true
  void router.replace({ query: { ...route.query, terminal_id: t.terminal_id } })
}
function back() {
  mobileDetail.value = false
  void router.replace({ query: { ...route.query, terminal_id: undefined } })
}
function viewAllPhones() {
  phoneScope.value = 'all'
  tab.value = 'overview'
  mobileDetail.value = true
}
async function copyId(id: string) {
  try { await navigator.clipboard.writeText(id); ElMessage.success('ID已复制') }
  catch { ElMessage.error('复制失败，请手动选择ID复制') }
}
async function refresh() { await Promise.all([terminals.load(true), devices.load(true)]) }
function renamed(updated: Pick<Terminal, 'terminal_id' | 'display_name' | 'row_version' | 'name_version'>) {
  const current = terminals.items.value.find(item => item.terminal_id === updated.terminal_id)
  if (current) Object.assign(current, updated)
  ElMessage.success('终端名称已更新')
  void terminals.load(true)
}
function renamedPhone(updated: TargetDevice) {
  const current = devices.items.value.find(item => item.device_id === updated.device_id)
  if (current) Object.assign(current, updated)
  ElMessage.success('手机名称已更新')
  void devices.load(true)
}
function openGlobalGrant() { grantTarget.value = null; grantDialogVisible.value = true }
function openAndroidBinding(device: TargetDevice) {
  grantTarget.value = { device_id: device.device_id, display_name: device.display_name }
  grantDialogVisible.value = true
}
async function removeTerminal(terminal: Terminal): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除后会撤销“${terminal.display_name}”的注册身份和凭据；历史任务与审计记录仍保留。`,
      '确认删除离线终端',
      { type: 'warning', confirmButtonText: '删除终端', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingTerminalId.value = terminal.terminal_id
  try {
    await deleteTerminal(terminal)
    ElMessage.success('终端已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除终端失败')
    await terminals.load(true)
  } finally {
    deletingTerminalId.value = null
  }
}


onMounted(refresh)
</script>
<template>
  <div class="page-stack terminal-workbench">
    <nav class="terminal-breadcrumb" aria-label="面包屑"><RouterLink to="/">管理平台</RouterLink><span>/</span><span>终端管理</span></nav>
    <PageHeader title="终端管理">
      <ElButton @click="releasesVisible = true">升级包管理</ElButton>
      <ElButton :icon="Plus" type="primary" @click="openGlobalGrant">创建注册码</ElButton>
      <ElButton :icon="Refresh" :loading="terminals.loading.value || devices.loading.value" @click="refresh">刷新</ElButton>
    </PageHeader>
    <p class="workbench-summary">
      <template v-if="terminals.loaded.value && !terminals.error.value">已加载 {{ terminals.items.value.length }} 台终端 · {{ onlineCount }} 台在线</template>
      <template v-else>{{ terminals.loading.value ? '正在读取终端…' : '终端统计暂不可用' }}</template>
      <template v-if="devices.loaded.value && !devices.error.value"> · {{ devices.items.value.length }} 部逻辑手机（已加载）</template>
      <span v-if="terminals.nextCursor.value || devices.nextCursor.value"> · 非平台总数</span>
    </p>
    <div class="terminal-split" :class="{ 'show-detail': mobileDetail }">
      <aside class="terminal-picker">
        <div class="terminal-picker__heading"><h2>终端 <span>{{ terminals.items.value.length }}</span></h2></div>
        <ElInput v-model="search" :prefix-icon="Search" placeholder="搜索名称或 ID" clearable aria-label="搜索终端名称或ID" />
        <ElRadioGroup v-model="type" size="small" aria-label="终端类型">
          <ElRadioButton value="all">全部</ElRadioButton><ElRadioButton value="linux">Linux</ElRadioButton><ElRadioButton value="android">Android</ElRadioButton>
        </ElRadioGroup>
        <small v-if="terminals.nextCursor.value">搜索与筛选仅限已加载终端</small>
        <p v-if="terminals.loading.value && !terminals.loaded.value">正在加载…</p>
        <ElAlert v-if="terminals.error.value" :title="terminals.error.value.message + (terminals.items.value.length ? '（显示上次数据）' : '')" type="error" :closable="false" />
        <ElButton v-if="terminals.error.value" @click="terminals.load(true)">重试终端列表</ElButton>
        <p v-if="terminals.loaded.value && !terminals.loading.value && !terminals.error.value && !filtered.length">{{ terminals.items.value.length ? '没有匹配的已加载终端' : '尚未注册终端' }}</p>
        <button v-for="t in filtered" :key="t.terminal_id" class="terminal-choice" :class="{ selected: t.terminal_id === selectedId }" :aria-pressed="t.terminal_id === selectedId" @click="select(t)">
          <TerminalTypeIcon :type="t.terminal_type" />
          <span><strong :title="t.display_name" :aria-label="t.display_name">{{ t.display_name }}</strong><small>{{ t.terminal_type === 'linux' ? 'Linux' : t.terminal_type === 'android' ? 'Android' : '未知类型' }}</small></span>
          <StatusBadge :value="t.service_status" />
        </button>
        <ElButton v-if="terminals.nextCursor.value" :loading="terminals.loading.value" @click="terminals.load()">加载更多终端</ElButton>
        <button class="all-phones-link" @click="viewAllPhones">查看全部逻辑手机 <span aria-hidden="true">→</span></button>
      </aside>
      <section class="terminal-detail">
        <ElButton class="back-to-list" @click="back">← 返回终端列表</ElButton>
        <template v-if="selected">
          <div class="terminal-detail-head">
            <TerminalTypeIcon :type="selected.terminal_type" />
            <div class="terminal-identity">
              <div class="terminal-title-line">
                <div class="terminal-name-group"><h2 :title="selected.display_name" :aria-label="selected.display_name">{{ selected.display_name }}</h2>
                  <TerminalNameEditor :key="selected.terminal_id" :terminal="selected" compact @renamed="renamed" />
                </div>
                <div class="terminal-status-group"><StatusBadge :value="selected.service_status" /><StatusBadge :value="selected.acceptance_status" /></div>
              </div>
              <div class="terminal-meta"><span>{{ selected.terminal_type === 'linux' ? 'Linux' : selected.terminal_type === 'android' ? 'Android' : '未知类型' }}</span><span>· 最近心跳 {{ formatDateTime(selected.last_seen_at) }}</span>
                <span>· ID {{ selected.terminal_id }}</span><ElButton link type="primary" size="small" @click="copyId(selected.terminal_id)">复制 ID</ElButton>
              </div>
            </div>
            <div class="terminal-head-actions">
              <TerminalCapability :key="selected.terminal_id" :terminal-id="selected.terminal_id" :service-status="selected.service_status" :storage="selected.storage" :storage-observed-at="selected.storage_observed_at" :storage-probe-ok="selected.storage_probe_ok" />
              <ElDropdown trigger="click">
                <button class="icon-button" aria-label="终端更多操作"><ElIcon><MoreFilled /></ElIcon></button>
                <template #dropdown><ElDropdownMenu>
                  <ElDropdownItem :disabled="!selected.delete.allowed || !!deletingTerminalId" @click="removeTerminal(selected!)">删除终端</ElDropdownItem>
                  <ElDropdownItem v-if="!selected.delete.allowed" disabled>{{ selected.delete.refusal_message || '当前状态不允许删除' }}</ElDropdownItem>
                </ElDropdownMenu></template>
              </ElDropdown>
            </div>
          </div>
          <ElAlert v-if="terminals.error.value || terminals.loading.value" title="终端信息正在核对或未能刷新；显示的状态可能不是最新。" type="warning" :closable="false" />
          <ElTabs v-model="tab">
            <ElTabPane label="概览" name="overview">
              <TerminalOverview
                v-model:scope="phoneScope" :terminal="selected" :terminals="terminals.items.value"
                :devices="devices.items.value" :devices-loading="devices.loading.value"
                :devices-loaded="devices.loaded.value" :devices-error="devices.error.value"
                :devices-has-more="!!devices.nextCursor.value"
                @binding="openAndroidBinding" @renamed="renamedPhone" @more="devices.load()"
                @retry="devices.load(true)" @connected="devices.load(true)" @storage-details="tab = 'storage'"
              />
            </ElTabPane>
            <ElTabPane label="存储" name="storage">
              <TerminalStorage :storage="selected.storage" :storage-observed-at="selected.storage_observed_at" :storage-probe-ok="selected.storage_probe_ok" :service-status="selected.service_status" />
            </ElTabPane>
            <ElTabPane label="维护" name="maintenance">
              <HostMaintenance v-if="selected.terminal_type === 'linux'" :key="selected.terminal_id" :terminal-id="selected.terminal_id" :name="selected.display_name" />
              <p v-else>此类型尚无维护接口，不能下发重启或升级。</p>
            </ElTabPane>
            <ElTabPane v-if="selected.terminal_type === 'linux'" label="日志" name="logs">
              <TerminalLogs :terminal-id="selected.terminal_id" :active="tab === 'logs'" />
            </ElTabPane>
          </ElTabs>
        </template>
        <p v-else-if="selectedId" role="status">所选终端尚未加载或记录已失效。请加载更多、刷新列表或选择其他终端。</p>
        <p v-else>请从左侧选择终端；也可以先查看未绑定的逻辑手机。</p>
        <LogicalPhones v-if="!selected" v-model:scope="phoneScope" :items="devices.items.value" :terminals="terminals.items.value" :terminal-id="null" :loading="devices.loading.value" :loaded="devices.loaded.value" :error="devices.error.value" :has-more="!!devices.nextCursor.value" @binding="openAndroidBinding" @renamed="renamedPhone" @more="devices.load()" @retry="devices.load(true)" />
      </section>
    </div>
    <RegistrationGrantDialog v-model="grantDialogVisible" :target-device="grantTarget" />
    <ElDrawer v-model="releasesVisible" title="升级包管理 · Linux" size="min(100%, 1000px)" :close-on-click-modal="false"><LinuxReleases /></ElDrawer>
  </div>
</template>
