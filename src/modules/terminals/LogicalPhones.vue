<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ApiError } from '../../shared/api/client'
import { Iphone, Refresh } from '@element-plus/icons-vue'
import { ElButton, ElDrawer, ElIcon, ElRadioGroup, ElRadioButton } from 'element-plus'
import type { TargetDevice, Terminal } from '../../shared/api/terminals'
import { formatDateTime } from '../../shared/presentation/format'
import { phoneAvailability } from '../../shared/presentation/phone-availability'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import DataState from '../../shared/ui/DataState.vue'
import LogicalPhoneNameEditor from './LogicalPhoneNameEditor.vue'
import PhonePaths from './PhonePaths.vue'
const selectedPath = ref<string>()
defineEmits<{ binding: [device: TargetDevice]; renamed: [device: TargetDevice]; more: []; retry: [] }>()
const scope = defineModel<'current' | 'unbound' | 'all'>('scope', { default: 'current' })
const props = defineProps<{
  items: TargetDevice[]; terminals: Terminal[]; terminalId: string | null
  loading: boolean; loaded: boolean; error: ApiError | null; hasMore: boolean
}>()
const rows = computed(() => props.items.filter(d => scope.value === 'all'
  || (scope.value === 'unbound' ? !d.managing_terminal_id : d.managing_terminal_id === props.terminalId)))
function manager(id: string | null) {
  return id ? props.terminals.find(t => t.terminal_id === id)?.display_name || id : '未绑定'
}
</script>
<template>
<section class="logical-phones">
  <div class="phones-heading">
    <div><h3>管理的逻辑手机 <span class="phones-count">{{ rows.length }}</span> </h3>
      
    </div>
    <div class="phones-actions"><span v-if="hasMore" class="device-muted">仅筛选已加载的 {{ items.length }} 部手机</span>
      <ElRadioGroup v-model="scope" size="small" aria-label="逻辑手机范围">
        <ElRadioButton value="current">当前终端</ElRadioButton>
        <ElRadioButton value="unbound">未绑定</ElRadioButton>
        <ElRadioButton value="all">全部</ElRadioButton>
      </ElRadioGroup>
      <ElButton :icon="Refresh" size="small" :loading="loading" aria-label="刷新手机状态" title="刷新手机状态" @click="$emit('retry')" />
    </div>
  </div>
  <DataState :loading="loading" :loaded="loaded" :error="error" :empty="!items.length" empty-title="尚未建立逻辑手机" @retry="$emit('retry')">
    <p v-if="!rows.length">此范围内暂无已加载的逻辑手机。</p>
    <div v-else class="phones-table-wrap">
      <div class="phones-table-head" aria-hidden="true"><span>手机</span><span>运行模式</span><span>连接状态</span><span>最近更新</span><span>操作</span></div>
      <article v-for="device in rows" :key="device.device_id" class="phone-row">
        <div class="phone-identity" data-label="手机"><ElIcon class="phone-icon"><Iphone /></ElIcon>
          <div class="phone-details"><div class="phone-name-line"><strong :title="device.display_name" :aria-label="device.display_name">{{ device.display_name }}</strong>
              <LogicalPhoneNameEditor :device="device" @renamed="$emit('renamed', $event)" />
            </div><code>{{ device.device_id }}</code>
            <small v-if="scope !== 'current'">管理终端：{{ manager(device.managing_terminal_id) }}</small>
          </div>
        </div>
        <div data-label="运行模式"><StatusBadge :value="device.mode" /></div>
        <div class="phone-connection" data-label="连接状态"><strong :class="{ 'is-connected': phoneAvailability(device).label === '已连接', 'is-alert': ['未连接', '未授权', '终端离线'].includes(phoneAvailability(device).label) }">{{ phoneAvailability(device).label }}</strong>
          <small>{{ phoneAvailability(device).guidance }}</small>
          <small>观测于 {{ formatDateTime(device.availability_observed_at) }}</small>
        </div>
        <div data-label="最近更新"><span>{{ formatDateTime(device.updated_at).replace('---', '—') }}</span></div>
        <div class="phone-actions" data-label="操作">
          <ElButton size="small" @click="selectedPath=device.device_id">连接路径</ElButton>
          <ElButton size="small" plain @click="$emit('binding', device)">绑定 Android APK</ElButton>
        </div>
      </article>
    </div>
  </DataState>
  <p v-if="error && items.length" role="alert">{{ error.message }}（显示上次数据）<ElButton size="small" @click="$emit('retry')">重试手机列表</ElButton></p>
  <ElButton v-if="hasMore" class="phones-more" :loading="loading" @click="$emit('more')">加载更多手机</ElButton>
  <slot name="after" />
  <ElDrawer :model-value="!!selectedPath" title="手机连接路径" size="500px" @close="selectedPath=undefined">
    <PhonePaths v-if="selectedPath" :key="selectedPath" :device-id="selectedPath" />
  </ElDrawer>
</section>
</template>
<style scoped>
.logical-phones { padding:18px; border:1px solid var(--el-border-color-lighter); border-radius:10px; min-width:0; }
.phones-heading,.phones-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.phones-heading { margin-bottom:18px; }
h3 { font-size:18px; margin:0; }
.phones-count { margin-left:8px; color:var(--el-text-color-secondary); font-size:14px; font-weight:500; }
.phones-heading p { margin:8px 0 0; color:var(--el-text-color-secondary); font-size:13px; }
.phones-table-wrap { overflow-x:auto; }
.phones-table-head,.phone-row { display:grid; grid-template-columns:minmax(180px,1.7fr) minmax(82px,.8fr) minmax(130px,1.2fr) minmax(120px,1fr) minmax(145px,1.2fr); gap:8px; align-items:center; min-width:720px; }
.phones-table-head { padding:10px 12px; border:1px solid var(--el-border-color-lighter); border-radius:6px; background:var(--el-fill-color-light); color:var(--el-text-color-secondary); font-size:12px; }
.phone-row { padding:12px; border-bottom:1px solid var(--el-border-color-lighter); }
.phone-row>div { min-width:0; }
.phone-identity { display:flex; align-items:center; gap:10px; }
.phone-details { display:grid; gap:4px; flex:1; min-width:0; }
.phone-connection { display:grid; gap:4px; }
.phone-name-line { display:flex; align-items:center; gap:8px; min-width:0; font-size:16px; }
.phone-name-line strong { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.phone-icon { padding:5px; border-radius:6px; background:var(--el-color-primary-light-9); color:var(--el-color-primary); font-size:19px; box-sizing:content-box; flex:none; }
small,code { color:var(--el-text-color-secondary); font-size:11px; overflow-wrap:anywhere; }
.phone-connection strong.is-connected { color:var(--el-color-success); }
.phone-connection strong.is-alert { color:var(--el-color-warning); }
.phone-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.phone-actions :deep(.el-button), .phones-actions :deep(.el-button) { margin-left:0; }
.phones-more { margin-top:12px; }
@media(max-width:750px) {
  .logical-phones { padding:14px; }
  .phones-table-head { display:none; }
  .phone-row { min-width:0; grid-template-columns:1fr 1fr; gap:14px; padding:16px 0; }
  .phone-row>div::before { content:attr(data-label); display:block; margin-bottom:4px; color:var(--el-text-color-secondary); font-size:12px; }
  .phone-identity,.phone-actions { grid-column:1/-1; }
  .phone-identity::before { display:none !important; }
}
</style>
