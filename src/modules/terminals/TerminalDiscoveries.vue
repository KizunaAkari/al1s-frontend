<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElAlert, ElButton, ElInput, ElMessage } from 'element-plus'
import { connectTargetDeviceDiscovery, fetchTargetDeviceDiscoveries, type TargetDeviceDiscovery, type Terminal } from '../../shared/api/terminals'
import { compactId } from '../../shared/presentation/format'
defineProps<{ terminal: Terminal }>()
const emit = defineEmits<{ connected: [] }>()
const discoveryTerminalId = ref<string | null>(null)
const discoveries = ref<TargetDeviceDiscovery[]>([])
const discoveryCursor = ref<string | null>(null)
const discoveryLoading = ref(false)
const discoveryError = ref('')
const discoveryNames = reactive<Record<string, string>>({})
const connectingIdentifierId = ref<string | null>(null)
const expanded = ref(false)
let discoveryGeneration = 0


const adbDiscoveries = computed(() => discoveries.value.filter(item => item.source_type === 'adb_serial'))

function openAndLoad(terminalId: string): void {
  expanded.value = true
  void loadDiscoveries(terminalId)
}

async function loadDiscoveries(terminalId: string, reset = true): Promise<void> {
  if (discoveryLoading.value && !reset) return
  if (reset) {
    discoveryGeneration++
    discoveryTerminalId.value = terminalId
    discoveries.value = []
    discoveryCursor.value = null
    discoveryError.value = ''
  }
  const current = discoveryGeneration
  const after = reset ? null : discoveryCursor.value
  discoveryLoading.value = true
  discoveryError.value = ''
  try {
    const page = await fetchTargetDeviceDiscoveries(terminalId, after)
    if (current !== discoveryGeneration || discoveryTerminalId.value !== terminalId) return
    const seen = new Set(discoveries.value.map(item => item.identifier_id))
    discoveries.value.push(...page.items.filter(item => !seen.has(item.identifier_id)))
    discoveryCursor.value = page.nextCursor
    for (const item of page.items) {
      if (!(item.identifier_id in discoveryNames)) discoveryNames[item.identifier_id] = item.display_hint
    }
  } catch (cause) {
    if (current === discoveryGeneration && discoveryTerminalId.value === terminalId) {
      discoveryError.value = cause instanceof Error ? cause.message : '读取 ADB 发现记录失败'
    }
  } finally {
    if (current === discoveryGeneration && discoveryTerminalId.value === terminalId) discoveryLoading.value = false
  }
}

async function connectDiscovery(item: TargetDeviceDiscovery): Promise<void> {
  if (connectingIdentifierId.value) return
  const displayName = (discoveryNames[item.identifier_id] ?? item.display_hint).trim()
  if (!displayName) {
    discoveryError.value = '请填写手机名称后再关联。'
    return
  }
  connectingIdentifierId.value = item.identifier_id
  const generation = discoveryGeneration
  const stillCurrent = () => generation === discoveryGeneration && discoveryTerminalId.value === item.source_terminal_id
  discoveryError.value = ''
  try {
    await connectTargetDeviceDiscovery(item.identifier_id, item.row_version, displayName)
    if (stillCurrent()) ElMessage.success('ADB 手机已关联')
  } catch (cause) {
    if (stillCurrent()) discoveryError.value = cause instanceof Error ? cause.message : '关联 ADB 手机失败；可用相同信息重试。'
    connectingIdentifierId.value = null
    return
  }
  connectingIdentifierId.value = null
  try {
    await Promise.all([
      Promise.resolve(emit('connected')),
      ...(stillCurrent() ? [loadDiscoveries(item.source_terminal_id, true)] : []),
    ])
  } catch (cause) {
    if (discoveryTerminalId.value === item.source_terminal_id && generation + 1 === discoveryGeneration) {
      discoveryError.value = cause instanceof Error ? cause.message : '手机已关联，但刷新列表失败，请手动刷新。'
    }
  }
}


onBeforeUnmount(() => { discoveryGeneration++ })
</script>
<template>
<section class="discovery-panel">
  <div class="discovery-panel__heading">
    <button class="discovery-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="discovery-chevron" :class="{ expanded }">›</span><strong>ADB 设备发现</strong>
    </button>
    <span>查看已上报的发现记录。</span>
    <ElButton
      size="small"
      plain
      :loading="discoveryLoading && discoveryTerminalId === terminal.terminal_id"
      @click="openAndLoad(terminal.terminal_id)"
    >{{ discoveryTerminalId === terminal.terminal_id ? '刷新发现记录' : '发现 ADB 手机' }}</ElButton><HelpHint subject="ADB 发现记录">这是终端已有的发现记录，不代表 ADB 当前在线；查询不触发即时扫描，实际执行仍需终端在线并完成授权。</HelpHint>
  </div>
  <div v-if="expanded" class="discovery-content">
    
    <template v-if="discoveryTerminalId === terminal.terminal_id">
                  <ElAlert v-if="discoveryError" :title="discoveryError" type="error" :closable="false" />
                  <p v-if="discoveryLoading">正在读取发现记录…</p>
                  <article v-for="item in adbDiscoveries" :key="item.identifier_id" class="discovery-item">
                    <div>
                      <strong>{{ item.display_hint }}</strong>
                      <small>来源：Linux ADB</small>
                    </div>
                    <template v-if="item.target_device_id || item.bound_at">
                      <span>已关联</span>
                      <code>{{ compactId(item.target_device_id) }}</code>
                    </template>
                    <template v-else>
                      <ElInput
                        v-model="discoveryNames[item.identifier_id]"
                        :aria-label="`手机名称 ${item.display_hint}`"
                        maxlength="120"
                        placeholder="输入目标手机名称"
                      />
                      <ElButton
                        size="small"
                        type="primary"
                        :loading="connectingIdentifierId === item.identifier_id"
                        :disabled="Boolean(connectingIdentifierId)"
                        @click="connectDiscovery(item)"
                      >
                        关联此手机
                      </ElButton>
                    </template>
                  </article>
                  <p v-if="!discoveryLoading && !discoveryError && !adbDiscoveries.length">暂无可关联的 ADB 发现记录。</p>
                  <ElButton
                    v-if="discoveryCursor"
                    size="small"
                    :loading="discoveryLoading"
                    :disabled="discoveryLoading"
                    @click="loadDiscoveries(terminal.terminal_id, false)"
                  >加载更多发现</ElButton>
    </template>
  </div>
</section>
</template>
<style scoped>
.discovery-panel { margin-top:16px; padding-top:16px; border-top:1px solid var(--el-border-color-lighter); }
.discovery-panel__heading { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.discovery-panel__heading>span { flex:1; color:var(--el-text-color-secondary); font-size:13px; }
.discovery-toggle { display:flex; align-items:center; gap:8px; padding:0; border:0; background:none; color:var(--el-text-color-primary); cursor:pointer; font:inherit; }
.discovery-chevron { display:inline-block; font-size:24px; line-height:1; transition:transform .2s; }
.discovery-chevron.expanded { transform:rotate(90deg); }
.discovery-content { padding-top:12px; }
.discovery-note { color:var(--el-text-color-secondary); font-size:13px; }
.discovery-item { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 0; border-top:1px solid var(--el-border-color-lighter); }
.discovery-item>div { display:grid; gap:4px; }
.discovery-item .el-input { max-width:260px; } small { color:var(--el-text-color-secondary); }
</style>
