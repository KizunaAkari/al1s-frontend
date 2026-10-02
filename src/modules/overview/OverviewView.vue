<script setup lang="ts">
import TerminalTypeIcon from '../../shared/ui/TerminalTypeIcon.vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInput, ElAlert, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
import { Refresh, Search, Plus } from '@element-plus/icons-vue'
import { fetchTerminals, type Terminal } from '../../shared/api/terminals'
import { useCursorPage } from '../../shared/api/pagination'
import { formatDateTime } from '../../shared/presentation/format'
import DataState from '../../shared/ui/DataState.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import RegistrationGrantDialog from '../terminals/RegistrationGrantDialog.vue'
const router = useRouter()
const page = useCursorPage<Terminal, string>(fetchTerminals, t => t.terminal_id)
const search = ref('')
const grant = ref(false)
const rows = computed(() => page.items.value.filter(t => t.display_name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
const online = computed(() => page.items.value.filter(t => t.service_status === 'online').length)
const offline = computed(() => page.items.value.filter(t => t.service_status === 'offline').length)
function open(t: Terminal) { void router.push({ path: '/terminals', query: { terminal_id: t.terminal_id } }) }
onMounted(() => page.load(true))
</script>
<template>
  <section class="terminal-overview">
    <div class="overview-top">
      <div><h1>我的终端</h1>
        <p v-if="!page.loaded.value || page.error.value">{{ page.loading.value ? '正在读取终端…' : '终端状态暂不可用' }}</p>
        <p v-else>{{ online }} 在线 · {{ offline }} 离线<span v-if="page.nextCursor.value">（已加载范围）</span></p>
      </div>
      <div class="overview-tools">
        <ElInput v-model="search" :prefix-icon="Search" placeholder="搜索已加载终端" clearable aria-label="搜索终端" />
        <ElButton :icon="Refresh" :loading="page.loading.value" aria-label="刷新终端" @click="page.load(true)" />
        <ElButton type="primary" :icon="Plus" @click="grant = true">接入终端</ElButton>
      </div>
    </div>
    <ElAlert v-if="page.error.value && page.loaded.value && page.items.value.length" title="刷新失败，以下为上次数据，状态可能已变化。" type="warning" :closable="false" />
    <DataState :loading="page.loading.value" :loaded="page.loaded.value" :empty="!page.items.value.length"
      :error="page.error.value" empty-title="暂无终端，点击“接入终端”开始" @retry="page.load(true)">
      <div class="terminal-table">
        <div class="terminal-row terminal-labels"><span>终端</span><span>状态</span><span class="terminal-extra">最近心跳</span><span>操作</span></div>
        <article v-for="terminal in rows" :key="terminal.terminal_id" class="terminal-row">
          <div class="terminal-name"><TerminalTypeIcon :type="terminal.terminal_type" /><div><strong>{{ terminal.display_name }}</strong><small>{{ terminal.terminal_type === 'linux' ? 'Linux' : 'Android' }} · {{ terminal.agent_version }}</small></div></div>
          <StatusBadge :value="terminal.service_status" />
          <span class="terminal-extra">{{ formatDateTime(terminal.last_seen_at) }}</span>
          <div class="terminal-actions">
            <ElButton link type="primary" @click="open(terminal)">{{ terminal.service_status === 'online' ? '打开终端' : '查看详情' }}</ElButton>
            <ElDropdown trigger="click" @command="open(terminal)">
              <button class="icon-button" :aria-label="terminal.display_name + ' 更多操作'">⋯</button>
              <template #dropdown><ElDropdownMenu><ElDropdownItem command="detail">终端详情与维护</ElDropdownItem></ElDropdownMenu></template>
            </ElDropdown>
          </div>
          <details class="terminal-mobile-details"><summary>更多信息</summary><p>最近心跳：{{ formatDateTime(terminal.last_seen_at) }}</p><p>Agent：{{ terminal.agent_version }}</p></details>
        </article>
        <p v-if="!rows.length">已加载终端中没有匹配项。</p>
      </div>
      <footer class="overview-footer"><span>已加载 {{ page.items.value.length }} 台终端</span><ElButton v-if="page.nextCursor.value" :loading="page.loading.value" @click="page.load()">加载更多</ElButton></footer>
    </DataState>
    <RegistrationGrantDialog v-model="grant" :target-device="null" />
  </section>
</template>
<style scoped>
.overview-top { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin: 4px 0 18px; }
h1 { font-size: 28px; margin: 0 0 10px; } .overview-top p { margin: 0; color: var(--muted); }
.overview-tools { display: flex; gap: 10px; align-items: center; } .overview-tools .el-input { width: 210px; } .overview-tools .el-button { margin: 0; }
.terminal-row { display: grid; grid-template-columns: minmax(170px, 2fr) minmax(75px, 1fr) minmax(130px, 1fr) minmax(140px, 1fr); gap: 20px; align-items: center; padding: 16px; border-bottom: 1px solid var(--border); }
.terminal-row:not(.terminal-labels):hover { background: var(--accent-soft); border-radius: 10px; }
.terminal-labels { color: var(--muted); padding-block: 12px; font-size: 13px; }
.terminal-name { display: flex; align-items: center; gap: 16px; min-width: 0; }
.terminal-name strong { display: block; overflow-wrap: anywhere; font-size: 15px; }
.terminal-name small { display: block; margin-top: 7px; color: var(--muted); }
.terminal-symbol { padding: 13px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 22px; }
.terminal-row .status-badge { justify-self: start; } .terminal-extra { color: var(--muted); font-size: 13px; }
.terminal-actions { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
.overview-footer { display: flex; justify-content: space-between; margin-top: 16px; color: var(--muted); font-size: 13px; }
.terminal-mobile-details { display: none; }
@media(max-width: 1100px) { .overview-top { align-items: start; flex-direction: column; } }
@media(max-width: 760px) {
  .terminal-row { grid-template-columns: minmax(0, 1fr) 70px 112px; padding-inline: 0; gap: 8px; }
  .terminal-extra, .terminal-symbol { display: none; } .terminal-name strong { font-size: 14px; }
  .terminal-name small { font-size: 11px; } .terminal-actions .el-button { font-size: 12px; }
  .terminal-actions .icon-button { width: 24px; } .terminal-mobile-details { display: block; grid-column: 1 / -1; font-size: 12px; color: var(--muted); }
  .overview-tools { flex-wrap: wrap; width: 100%; } .overview-tools .el-input { width: 100%; } h1 { font-size: 28px; }
}
</style>
