<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElTag } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import { formatDateTime } from '../../shared/presentation/format'
const props = defineProps<{ deviceId: string }>()
type Path = { kind: 'linux' | 'android'; terminal_id: string; display_name: string; online: boolean; control_ready: boolean; observed_at: string | null; authority_protocol: number }
type Status = { holder_terminal_id: string | null; state: string; paths: Path[] }
const status = ref<Status>(), busy = ref(false), error = ref('')
async function refresh() {
  busy.value = true; error.value = ''
  try { status.value = (await apiClient.get<Status>(`/target-devices/${props.deviceId}/paths`)).data }
  catch { error.value = '连接路径读取失败，请重试。' }
  finally { busy.value = false }
}
onMounted(refresh)
</script>
<template>
  <div class="phone-paths">
    <div class="paths-heading"><strong>执行连接 · Linux 优先</strong><ElButton :loading="busy" size="small" @click="refresh">刷新</ElButton></div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElAlert v-if="status?.state === 'releasing'" title="等待旧连接确认停止输入并结清执行许可，期间不会授予另一端输入权。" type="warning" :closable="false" />
    <article v-for="path in status?.paths" :key="path.kind">
      <div><strong>{{ path.kind === 'linux' ? 'Linux 挂载' : 'Android 直连' }}</strong><ElTag v-if="path.terminal_id === status?.holder_terminal_id" size="small">当前执行通道</ElTag><ElTag v-else size="small" type="info">待命</ElTag></div>
      <p>{{ path.display_name }} · {{ path.online ? '终端在线' : '终端离线' }} · {{ path.control_ready ? '控制已就绪' : '控制未就绪' }}</p>
      <small>最近观测：{{ formatDateTime(path.observed_at) }}</small>
      <p v-if="!path.authority_protocol">此连接尚未支持安全交接，保留当前归属。</p>
    </article>
    <p v-if="status && !status.paths.length">尚无直连接入观测。</p>
  </div>
</template>
<style scoped>
.paths-heading,article>div { display:flex; align-items:center; gap:12px; justify-content:space-between; }
article { border:1px solid var(--el-border-color-lighter); padding:16px; border-radius:10px; margin-top:16px; }
p,small { color:var(--el-text-color-secondary); } small { overflow-wrap:anywhere; }
</style>
