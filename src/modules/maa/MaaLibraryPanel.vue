<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { Close, Document, Grid, MoreFilled, Refresh, Search, Upload } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElInput } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'

import {
  fetchApplications,
  fetchLibraryScripts,
  fetchStrategies,
  reorderLibraryScript,
  type MaaApplicationSummary,
  type MaaScript,
  type MaaStrategy,
} from '../../shared/api/maa'
import { useCursorPage } from '../../shared/api/pagination'
import { compactId, formatDateTime } from '../../shared/presentation/format'
import DataState from '../../shared/ui/DataState.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import ApplicationManager from './ApplicationManager.vue'
import ApplicationDevices from './ApplicationDevices.vue'
import ScriptMetadataDialog from './ScriptMetadataDialog.vue'
import ScriptDeleteDialog from './ScriptDeleteDialog.vue'
import StrategyCreateDialog from './StrategyCreateDialog.vue'
import StrategyManageDialog from './StrategyManageDialog.vue'
import StrategyExportButton from './StrategyExportButton.vue'
import MaaArchiveImport from './MaaArchiveImport.vue'
import ScriptExportDialog from './ScriptExportDialog.vue'
const failedApplicationIcons = ref(new Set<string>())

function applicationIcon(application: MaaApplicationSummary): string | null {
  const key = `${application.application_id}:${application.row_version}`
  return failedApplicationIcons.value.has(key) ? null : application.icon_data_url
}

function iconFailed(application: MaaApplicationSummary): void {
  failedApplicationIcons.value = new Set([
    ...failedApplicationIcons.value, `${application.application_id}:${application.row_version}`,
  ])
}

const selectedApplicationId = ref('')
const search = ref('')
const categorySearch = ref('')
const importing = ref(false)
const importBusy = ref(false)
onBeforeRouteLeave(() => !importBusy.value)
onBeforeRouteUpdate(() => !importBusy.value)
const router = useRouter()
const emit = defineEmits<{ opened: []; close: [] }>()
async function editScript(id: string) {
  const failure = await router.push({ path: '/editor', query: { script_id: id } })
  if (!failure || router.currentRoute.value.query.script_id === id) emit('opened')
}
const renamingScript = ref<MaaScript | null>(null)
const deletingScript = ref<MaaScript | null>(null)
const exportingScript = ref<MaaScript | null>(null)
const versionScript = ref<MaaScript | null>(null)
const versionStrategy = ref<MaaStrategy | null>(null)
const activeView = ref<'scripts' | 'strategies'>('scripts')
const applications = useCursorPage<MaaApplicationSummary, string>(fetchApplications, (item) => item.application_id)
const scripts = useCursorPage<MaaScript, string>(
  (cursor) => fetchLibraryScripts(selectedApplicationId.value, cursor),
  (item) => item.script_id,
)
const strategies = useCursorPage<MaaStrategy, string>(
  (cursor) => fetchStrategies(selectedApplicationId.value, cursor),
  (item) => item.strategy_id,
)

const selectedApplication = computed(() =>
  applications.items.value.find((item) => item.application_id === selectedApplicationId.value),
)
const visibleApplications = computed(() => applications.items.value.filter(item =>
  (item.display_name + ' ' + item.package_name).toLowerCase().includes(categorySearch.value.trim().toLowerCase()),
))
const savedScripts = computed(() => scripts.items.value.filter(s =>
  s.current_version_id && s.script_type !== 'standard' && s.status === 'active',
))
const visibleScripts = computed(() => savedScripts.value.filter(s =>
  (s.name + ' ' + s.script_id).toLowerCase().includes(search.value.trim().toLowerCase()),
))
const visibleStrategies = computed(() => strategies.items.value.filter(s =>
  (s.name + ' ' + s.strategy_id).toLowerCase().includes(search.value.trim().toLowerCase()),
))
const dragSourceId = ref('')
const dragTargetId = ref('')
const dragPlacement = ref<'before' | 'after'>('before')
const orderBusy = ref(false)
const orderError = ref('')
let pointerStart: { id: number; scriptId: string; x: number; y: number } | null = null

function resetDrag(): void {
  pointerStart = null
  dragSourceId.value = ''
  dragTargetId.value = ''
}

function startScriptPointer(event: PointerEvent, scriptId: string): void {
  if (orderBusy.value || !event.isPrimary || event.button !== 0) return
  const target = event.target as HTMLElement
  const handle = target.closest('.library-drag-handle')
  if (target.closest('button, a, input, textarea, select') && !handle) return
  if (event.pointerType === 'touch' && !handle) return
  pointerStart = { id: event.pointerId, scriptId, x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function updateScriptTarget(x: number, y: number): void {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('.library-row[data-script-id]')
  const targetId = row?.dataset.scriptId ?? ''
  const sourceIndex = visibleScripts.value.findIndex(script => script.script_id === dragSourceId.value)
  const targetIndex = visibleScripts.value.findIndex(script => script.script_id === targetId)
  dragTargetId.value = sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex ? '' : targetId
  if (dragTargetId.value) dragPlacement.value = targetIndex < sourceIndex ? 'before' : 'after'
}

function moveScriptPointer(event: PointerEvent): void {
  if (!pointerStart || pointerStart.id !== event.pointerId) return
  if (!dragSourceId.value) {
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 6) return
    dragSourceId.value = pointerStart.scriptId
  }
  updateScriptTarget(event.clientX, event.clientY)
}

function previewScriptMove(sourceId: string, targetId: string, placement: 'before' | 'after'): MaaScript[] {
  const previous = scripts.items.value
  const sourceIndex = previous.findIndex(script => script.script_id === sourceId)
  if (sourceIndex < 0 || !previous.some(script => script.script_id === targetId)) return previous
  const reordered = [...previous]
  const [source] = reordered.splice(sourceIndex, 1)
  const targetIndex = reordered.findIndex(script => script.script_id === targetId)
  reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, source)
  scripts.items.value = reordered
  return previous
}

async function persistScriptMove(
  sourceId: string, targetId: string, placement: 'before' | 'after',
): Promise<void> {
  const applicationId = selectedApplicationId.value
  if (!sourceId || !targetId || sourceId === targetId || !applicationId || orderBusy.value) return
  const loadedCount = scripts.items.value.length
  orderError.value = ''
  orderBusy.value = true
  const previous = previewScriptMove(sourceId, targetId, placement)
  try {
    await reorderLibraryScript(applicationId, sourceId, targetId, placement)
  } catch (error) {
    if (selectedApplicationId.value === applicationId) scripts.items.value = previous
    orderError.value = error instanceof Error ? error.message : '保存脚本顺序失败，请重试。'
  } finally {
    // The server is authoritative, including when another administrator changed the order.
    if (selectedApplicationId.value === applicationId) {
      await scripts.load(true)
      while (selectedApplicationId.value === applicationId && scripts.items.value.length < loadedCount
        && scripts.nextCursor.value && !scripts.error.value) await scripts.load()
    }
    orderBusy.value = false
  }
}

async function endScriptPointer(event: PointerEvent): Promise<void> {
  if (!pointerStart || pointerStart.id !== event.pointerId) return
  if (dragSourceId.value) updateScriptTarget(event.clientX, event.clientY)
  const sourceId = dragSourceId.value
  const targetId = dragTargetId.value
  const placement = dragPlacement.value
  resetDrag()
  await persistScriptMove(sourceId, targetId, placement)
}

async function keyboardMove(scriptId: string, direction: -1 | 1): Promise<void> {
  const index = visibleScripts.value.findIndex(script => script.script_id === scriptId)
  const target = visibleScripts.value[index + direction]
  if (target) await persistScriptMove(scriptId, target.script_id, direction < 0 ? 'before' : 'after')
}

function scriptTypeLabel(type: MaaScript['script_type']): string {
  if (type === 'module_start') return '开始脚本'
  if (type === 'module_end') return '结束脚本'
  return '过程脚本'
}

function scriptAction(command: string, script: MaaScript): void {
  if (command === 'rename') renamingScript.value = script
  if (command === 'export') exportingScript.value = script
  if (command === 'version') versionScript.value = script
  if (command === 'delete' && script.script_type === 'module_process') deletingScript.value = script
}

async function selectApplication(id: string): Promise<void> {
  if (selectedApplicationId.value === id) return
  selectedApplicationId.value = id
  search.value = ''
  orderError.value = ''
  resetDrag()
  await loadSelectedContent()
}

async function loadSelectedContent(): Promise<void> {
  scripts.reset()
  strategies.reset()
  if (!selectedApplicationId.value) return
  await Promise.all([scripts.load(true), strategies.load(true)])
}

async function refresh(): Promise<void> {
  orderError.value = ''
  resetDrag()
  const previous = selectedApplicationId.value
  await applications.load(true)
  selectedApplicationId.value = applications.items.value.some((item) => item.application_id === previous)
    ? previous
    : (applications.items.value[0]?.application_id ?? '')
  await loadSelectedContent()
}

async function handleImportCompleted(): Promise<void> {
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="maa-library">
    <header class="library-header">
      <div class="library-header-title"><strong>脚本库 <HelpHint subject="脚本库">新建脚本请在编辑器中选择手机和当前前台应用。保存后，尚未下发的任务使用新内容；已下发任务保持原快照。</HelpHint></strong></div>
      <div class="library-header-actions">
        <ElButton :icon="Upload" :disabled="importBusy" @click="importing = true">导入脚本归档</ElButton>
        <ElButton :icon="Refresh" :loading="applications.loading.value" aria-label="刷新脚本库" title="刷新" @click="refresh" />
        <ElButton :icon="Close" :disabled="importBusy" aria-label="关闭脚本库" title="关闭" text @click="emit('close')" />
      </div>
    </header>

    <div class="library-workspace">
      <aside class="library-sidebar" aria-label="应用分类">
        <h2>应用分类 </h2>
        <ElInput v-model="categorySearch" :prefix-icon="Search" placeholder="搜索分类" aria-label="搜索分类" clearable />
        <nav class="library-categories" aria-label="选择应用分类">
          <button v-for="application in visibleApplications" :key="application.application_id" type="button"
            class="library-category" :class="{ selected: selectedApplicationId === application.application_id }"
            :aria-current="selectedApplicationId === application.application_id ? 'true' : undefined"
            :title="application.display_name" @click="selectApplication(application.application_id)">
            <span class="library-category-icon" aria-hidden="true">
              <img v-if="applicationIcon(application)" :src="applicationIcon(application) ?? ''"
                alt="" @error="iconFailed(application)" />
              <ElIcon v-else><Grid /></ElIcon>
            </span>
            <span class="library-category-label">{{ application.display_name }}</span>
            <b>{{ application.script_count }}</b>
          </button>
          <p v-if="categorySearch && !visibleApplications.length" class="library-muted">已加载分类中没有匹配项。</p>
          <p v-if="applications.error.value" class="library-error" role="alert">{{ applications.error.value.message }}</p>
          <ElButton v-if="applications.nextCursor.value" :loading="applications.loading.value" @click="applications.load()">加载更多分类</ElButton>
        </nav>
        
      </aside>

      <main class="library-main">
        <DataState v-if="applications.items.value.length === 0" :loading="applications.loading.value"
          :loaded="applications.loaded.value" :empty="applications.loaded.value"
          :error="applications.error.value" empty-title="尚未创建应用分类" @retry="refresh" />
        <template v-else-if="selectedApplication">
          <div class="library-category-heading">
            <div><h2 :title="selectedApplication.display_name">{{ selectedApplication.display_name }}</h2>
              <p v-if="selectedApplication.package_name !== selectedApplication.display_name">{{ selectedApplication.package_name }}</p></div>
            <ApplicationManager :application="selectedApplication" @changed="refresh" />
          </div>
          <ApplicationDevices :application="selectedApplication" />

          <div class="library-controls">
            <nav class="library-tabs" aria-label="Maa 内容类型">
              <button type="button" :class="{ active: activeView === 'scripts' }" @click="activeView = 'scripts'">脚本 <span>{{ selectedApplication.script_count }}</span></button>
              <button type="button" :class="{ active: activeView === 'strategies' }" @click="activeView = 'strategies'">组合策略</button>
            </nav>
            <ElInput v-model="search" :prefix-icon="Search" :placeholder="activeView === 'scripts' ? '搜索已加载脚本名称…' : '搜索已加载策略名称…'"
              aria-label="搜索脚本库" clearable />
            <StrategyCreateDialog v-if="activeView === 'strategies'" :key="selectedApplicationId"
              :application="selectedApplication" :scripts="savedScripts"
              :more="Boolean(scripts.nextCursor.value || scripts.error.value)" :loading="scripts.loading.value"
              @more="scripts.load()" @created="loadSelectedContent" />
          </div>

          <section class="library-list-scroll" aria-label="脚本与策略列表">
            <DataState v-if="activeView === 'scripts'" :loading="scripts.loading.value" :loaded="scripts.loaded.value"
              :empty="savedScripts.length === 0 && !scripts.nextCursor.value" :error="scripts.error.value"
              empty-title="该分类暂无已保存脚本" @retry="scripts.load(scripts.items.value.length === 0)">
              <div class="library-table" role="table" aria-label="已保存脚本">
                <div class="library-table-head" role="row"><span role="columnheader">脚本名称</span><span role="columnheader">类型</span>
                  <span role="columnheader">状态</span><span role="columnheader">更新时间</span><span role="columnheader">操作</span></div>
                <div v-for="script in visibleScripts" :key="script.script_id" class="library-row" role="row" :data-script-id="script.script_id"
                  :aria-grabbed="dragSourceId === script.script_id"
                  :class="{ 'drag-source': dragSourceId === script.script_id, 'drag-before': dragTargetId === script.script_id && dragPlacement === 'before', 'drag-after': dragTargetId === script.script_id && dragPlacement === 'after' }"
                  @pointerdown="startScriptPointer($event, script.script_id)" @pointermove="moveScriptPointer"
                  @pointerup="endScriptPointer" @pointercancel="resetDrag" @lostpointercapture="resetDrag">
                  <div class="library-row-name" role="cell" :title="script.name">
                    <button class="library-drag-handle" type="button"
                      :aria-label="`拖动排序：${script.name}`" title="拖动整行排序，也可按上下方向键"
                      @keydown.up.prevent="keyboardMove(script.script_id, -1)"
                      @keydown.down.prevent="keyboardMove(script.script_id, 1)">⋮⋮</button>
                    <ElIcon><Document /></ElIcon><strong>{{ script.name }}</strong></div>
                  <span class="library-row-type" role="cell">{{ scriptTypeLabel(script.script_type) }}</span>
                  <span class="library-row-status" role="cell"><StatusBadge :value="script.status" /></span>
                  <time class="library-row-updated" role="cell">{{ formatDateTime(script.updated_at) }}</time>
                  <div class="library-row-actions" role="cell">
                    <ElButton type="primary" plain @click="editScript(script.script_id)">编辑步骤配置</ElButton>
                    <ElDropdown trigger="click" @command="command => scriptAction(String(command), script)">
                      <ElButton :icon="MoreFilled" :aria-label="`更多操作：${script.name}`" title="更多操作" />
                      <template #dropdown><ElDropdownMenu>
                        <ElDropdownItem command="rename">重命名</ElDropdownItem>
                        <ElDropdownItem command="export">导出 ZIP</ElDropdownItem>
                        <ElDropdownItem command="version">版本信息</ElDropdownItem>
                        <ElDropdownItem v-if="script.script_type === 'module_process'" command="delete">删除过程脚本</ElDropdownItem>
                      </ElDropdownMenu></template>
                    </ElDropdown>
                  </div>
                </div>
              </div>
              <p v-if="search && !visibleScripts.length" class="library-muted">已加载脚本中没有匹配项。</p>
              <p v-if="orderError" class="library-error" role="alert">{{ orderError }}</p>
              <div class="library-list-footer"><span>共 {{ selectedApplication.script_count }} 个脚本<template v-if="scripts.nextCursor.value"> · 已加载 {{ savedScripts.length }} 个</template></span><HelpHint subject="脚本排序">拖动整行排序</HelpHint>
                <span v-if="orderBusy" role="status">正在保存顺序…</span>
                <ElButton v-if="scripts.nextCursor.value" :loading="scripts.loading.value" @click="scripts.load()">加载更多脚本</ElButton></div>
              <p v-if="scripts.error.value && savedScripts.length" class="library-error" role="alert">{{ scripts.error.value.message }}</p>
            </DataState>

            <DataState v-else :loading="strategies.loading.value" :loaded="strategies.loaded.value"
              :empty="strategies.items.value.length === 0 && !strategies.nextCursor.value" :error="strategies.error.value"
              empty-title="该分类暂无组合策略" @retry="strategies.load(strategies.items.value.length === 0)">
              <div class="library-table strategy-table" role="table" aria-label="组合策略">
                <div class="library-table-head" role="row"><span role="columnheader">策略名称</span><span role="columnheader">类型</span>
                  <span role="columnheader">状态</span><span role="columnheader">更新时间</span><span role="columnheader">操作</span></div>
                <div v-for="strategy in visibleStrategies" :key="strategy.strategy_id" class="library-row" role="row">
                  <div class="library-row-name" role="cell" :title="strategy.name"><ElIcon><Document /></ElIcon><strong>{{ strategy.name }}</strong></div>
                  <span class="library-row-type" role="cell">组合策略</span>
                  <span class="library-row-status" role="cell"><StatusBadge :value="strategy.status" /></span>
                  <time class="library-row-updated" role="cell">{{ formatDateTime(strategy.updated_at) }}</time>
                  <div class="library-row-actions" role="cell">
                    <StrategyManageDialog :strategy="strategy" :scripts="savedScripts"
                      :more="Boolean(scripts.nextCursor.value || scripts.error.value)" :loading="scripts.loading.value"
                      @more="scripts.load()" @changed="loadSelectedContent" />
                    <ElDropdown trigger="click">
                      <ElButton :icon="MoreFilled" :aria-label="`更多操作：${strategy.name}`" title="更多操作" />
                      <template #dropdown><ElDropdownMenu>
                        <StrategyExportButton :strategy="strategy" menu />
                        <ElDropdownItem @click="versionStrategy = strategy">版本信息</ElDropdownItem>
                      </ElDropdownMenu></template>
                    </ElDropdown>
                  </div>
                </div>
              </div>
              <p v-if="search && !visibleStrategies.length" class="library-muted">已加载策略中没有匹配项。</p>
              <div class="library-list-footer"><span>已加载 {{ strategies.items.value.length }} 个策略</span>
                <ElButton v-if="strategies.nextCursor.value" :loading="strategies.loading.value" @click="strategies.load()">加载更多策略</ElButton></div>
              <p v-if="strategies.error.value && strategies.items.value.length" class="library-error" role="alert">{{ strategies.error.value.message }}</p>
            </DataState>
          </section>
        </template>
      </main>
    </div>

    

    <ElDialog :model-value="importing" title="导入脚本归档" width="min(920px, 96vw)" :close-on-click-modal="false"
      :close-on-press-escape="!importBusy" :show-close="!importBusy"
      @update:model-value="value => { if (!value && !importBusy) importing = false }">
      <MaaArchiveImport v-if="importing" @busy="importBusy = $event" @imported="handleImportCompleted" @close="importing = false" />
    </ElDialog>
    <ScriptMetadataDialog :script="renamingScript" @close="renamingScript = null" @changed="loadSelectedContent" />
    <ScriptDeleteDialog :script="deletingScript" @close="deletingScript = null" @changed="refresh" />
    <ScriptExportDialog :script="exportingScript" @close="exportingScript = null" />
    <ElDialog :model-value="!!versionScript || !!versionStrategy" title="版本信息" width="min(480px, 94vw)"
      @update:model-value="value => { if (!value) { versionScript = null; versionStrategy = null } }">
      <dl class="library-version-info">
        <template v-if="versionScript"><dt>脚本名称</dt><dd>{{ versionScript.name }}</dd><dt>当前保存版本</dt><dd>{{ compactId(versionScript.current_version_id) }}</dd><dt>更新时间</dt><dd>{{ formatDateTime(versionScript.updated_at) }}</dd></template>
        <template v-if="versionStrategy"><dt>策略名称</dt><dd>{{ versionStrategy.name }}</dd><dt>当前保存版本</dt><dd>{{ compactId(versionStrategy.current_version_id) }}</dd><dt>并发版本</dt><dd>v{{ versionStrategy.row_version }}</dd><dt>更新时间</dt><dd>{{ formatDateTime(versionStrategy.updated_at) }}</dd></template>
      </dl>
    </ElDialog>
  </div>
</template>

<style scoped>
.maa-library { height:100%; min-width:0; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; background:var(--surface); }
.library-header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 30px; border-bottom:1px solid var(--border); }
.library-header-title,.library-header-actions { display:flex; align-items:center; gap:16px; min-width:0; }
.library-header-title strong { font-size:22px; white-space:nowrap; }
.library-muted { color:var(--muted); font-size:13px; }
.library-header-actions { flex:none; }
.library-header-actions :deep(.el-button + .el-button) { margin-left:0; }
.library-workspace { display:grid; grid-template-columns:248px minmax(0,1fr); min-height:0; min-width:0; }
.library-sidebar { display:flex; flex-direction:column; min-height:0; min-width:0; padding:26px 16px 18px; border-right:1px solid var(--border); }
.library-sidebar h2 { margin:0 14px 16px; font-size:18px; }
.library-sidebar > .el-input { margin:0 0 16px; }
.library-categories { display:flex; flex-direction:column; gap:6px; min-height:0; overflow-y:auto; }
.library-category { display:flex; align-items:center; gap:12px; width:100%; min-height:55px; padding:8px 12px; border:0; border-radius:8px; background:transparent; text-align:left; cursor:pointer; }
.library-category:hover,.library-category.selected { background:var(--accent-soft); }
.library-category-icon { flex:none; display:grid; place-items:center; width:34px; height:34px; border-radius:7px; overflow:hidden; background:var(--accent); color:white; }
.library-category-icon img { display:block; width:100%; height:100%; object-fit:cover; }
.library-category-icon .el-icon { font-size:20px; }
.library-category-label { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.library-category b { flex:none; padding:4px 8px; border-radius:99px; background:var(--surface); color:var(--accent); font-size:12px; }
.library-sidebar-note { margin:auto 14px 0; padding-top:14px; color:var(--muted); font-size:12px; }
.library-main { display:flex; flex-direction:column; min-width:0; min-height:0; gap:18px; padding:18px; }
.library-category-heading { display:flex; align-items:flex-start; gap:10px; min-width:0; }
.library-category-heading > div:first-child { min-width:0; }
.library-category-heading h2 { margin:0; font-size:22px; overflow-wrap:anywhere; }
.library-category-heading p { margin:3px 0 0; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.library-controls { display:flex; flex-wrap:wrap; align-items:center; gap:12px; min-width:0; border-bottom:1px solid var(--border); }
.library-tabs { display:flex; align-self:stretch; gap:16px; margin-right:auto; }
.library-tabs button { border:0; border-bottom:3px solid transparent; padding:10px 8px; background:none; color:var(--muted); cursor:pointer; white-space:nowrap; }
.library-tabs button.active { border-bottom-color:var(--accent); color:var(--accent-strong); font-weight:700; }
.library-tabs span { margin-left:5px; padding:3px 7px; border-radius:99px; background:var(--accent-soft); }
.library-controls > .el-input { flex:0 1 300px; min-width:180px; margin-bottom:8px; }
.library-controls > :deep(.el-button) { margin:0 0 8px; }
.library-list-scroll { min-height:0; min-width:0; flex:1; overflow-y:auto; overflow-x:hidden; }
.library-table { min-width:0; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.library-table-head,.library-row { display:grid; grid-template-columns:minmax(180px,2fr) minmax(95px,.75fr) minmax(105px,.75fr) minmax(145px,1fr) minmax(190px,1.2fr); align-items:center; column-gap:14px; }
.library-table-head { min-height:48px; padding:0 18px; background:var(--surface-soft); color:var(--muted); font-size:13px; font-weight:650; }
.library-row { min-height:62px; padding:10px 18px; border-top:1px solid var(--border); cursor:grab; user-select:none; }
.library-row:hover { background:var(--surface-soft); }
.library-row.drag-source { opacity:.45; cursor:grabbing; }
.library-row.drag-before { box-shadow:inset 0 4px var(--accent); }
.library-row.drag-after { box-shadow:inset 0 -4px var(--accent); }
.library-row-name { display:flex; align-items:center; gap:12px; min-width:0; }
.library-drag-handle { flex:none; cursor:grab; color:var(--muted); font-size:18px; letter-spacing:-2px; padding:5px 6px 5px 2px; user-select:none; border:0; background:transparent; touch-action:none; }
.library-drag-handle:active { cursor:grabbing; }
.library-drag-handle:focus-visible { outline:2px solid var(--accent); border-radius:4px; }
.library-row-actions { cursor:default; }
.library-row-name .el-icon { flex:none; color:var(--accent); font-size:24px; }
.library-row-name strong { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.library-row-type,.library-row-updated { color:var(--muted); font-size:13px; }
.library-row-actions { display:flex; align-items:center; gap:8px; white-space:nowrap; }
.library-row-actions :deep(.el-button + .el-button) { margin-left:0; }
.library-list-footer { display:flex; align-items:center; gap:14px; margin:12px 0; color:var(--muted); font-size:13px; }
.library-error { color:var(--danger); font-size:13px; }
.library-footer { display:flex; align-items:center; flex-wrap:wrap; gap:14px; min-height:56px; padding:12px 30px; border-top:1px solid var(--border); font-size:13px; }
.library-footer span { color:var(--muted); }
.library-version-info { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; margin:0; }
.library-version-info dt { color:var(--muted); }
.library-version-info dd { margin:0; overflow-wrap:anywhere; }
@media (max-width:1100px) {
  .library-workspace { grid-template-columns:240px minmax(0,1fr); }
  .library-table-head { display:none; }
  .library-row { grid-template-columns:repeat(3,minmax(0,1fr)); row-gap:8px; }
  .library-row-name { grid-column:1/-1; }
  .library-row-actions { grid-column:1/-1; }
}
@media (max-width:620px) {
  .library-header { align-items:flex-start; flex-wrap:wrap; padding:12px 16px; }
  .library-header-title strong { font-size:18px; }
  .library-header-actions { width:100%; justify-content:flex-end; }
  .library-workspace { display:flex; flex-direction:column; }
  .library-sidebar { flex:none; max-height:185px; padding:12px 16px; border-right:0; border-bottom:1px solid var(--border); }
  .library-sidebar h2 { margin:0 0 8px; font-size:15px; }
  .library-sidebar > .el-input { margin-bottom:8px; }
  .library-categories { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); overflow-x:hidden; overflow-y:auto; }
  .library-category { width:100%; min-width:0; }
  .library-sidebar-note { display:none; }
  .library-main { gap:10px; padding:12px; }
  .library-category-heading h2 { font-size:18px; }
  .library-controls { flex-wrap:wrap; }
  .library-tabs { width:100%; }
  .library-controls > .el-input { flex:1 1 100%; min-width:0; }
  .library-row { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .library-row-type { grid-column:1; }
  .library-row-status { grid-column:2; }
  .library-row-updated { grid-column:1/-1; }
  .library-row-actions { white-space:normal; flex-wrap:wrap; }
  .library-footer { padding:10px 16px; font-size:12px; }
}
</style>
