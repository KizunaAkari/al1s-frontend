<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElTag } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import { formatDateTime } from '../../shared/presentation/format'
const props = defineProps<{ terminalId: string }>()
type Facts = { secure_lock: boolean; provider_ready: boolean; battery_exempt: boolean; notifications_allowed: boolean; wireless_recovery_enabled: boolean }
type Check = { status: string; requested_at: string; completed_at: string | null; facts: Facts | null }
const current = ref<Check | null>(), busy = ref(false), error = ref('')
async function refresh(manual = false) {
  busy.value = true; error.value = ''
  try { current.value = (await (manual ? apiClient.post<Check>(`/terminals/${props.terminalId}/setup-check`) : apiClient.get<Check | null>(`/terminals/${props.terminalId}/setup-check`))).data }
  catch { error.value = '设置检查读取失败，请重试。' }
  finally { busy.value = false }
}
onMounted(() => refresh())
</script>
<template>
  <section class="terminal-info-card">
    <div class="check-heading"><h3>Android 设置检查</h3><ElButton :loading="busy" size="small" @click="refresh(true)">检查设置</ElButton></div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="current?.status !== 'completed'">{{ current ? '等待终端完成检查；任务运行时会延后。' : '尚无检查结果。' }}</p>
    <template v-if="current?.facts">
      <p><ElTag :type="current.facts.secure_lock ? 'warning' : 'success'">{{ current.facts.secure_lock ? '安全锁屏未关闭' : '安全锁屏已关闭' }}</ElTag></p>
      <p>本机辅助服务：{{ current.facts.provider_ready ? '已连接' : '未连接' }}</p>
      <p>电池优化：{{ current.facts.battery_exempt ? '已豁免' : '需要在手机检查' }} · 通知：{{ current.facts.notifications_allowed ? '已允许' : '未允许' }}</p>
      <p>恢复无线调试：{{ current.facts.wireless_recovery_enabled ? '已明确启用' : '未启用（可选）' }}</p>
      <p>厂商休眠策略需要在手机中核对。</p>
    </template>
    <small>实际完成时间：{{ formatDateTime(current?.completed_at) }} · 自动检查每 24 小时一次</small>
    <ElButton v-if="current" link size="small" @click="refresh()">刷新结果</ElButton>
  </section>
</template>
<style scoped>
.check-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; }
small { color:var(--el-text-color-secondary); overflow-wrap:anywhere; } h3 { margin:0; }
</style>
