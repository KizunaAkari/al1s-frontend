<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ElAlert, ElButton, ElDrawer, ElEmpty, ElOption, ElSelect,
  ElTable, ElTableColumn,
} from 'element-plus'
import {
  fetchDeliveries, fetchDelivery, type Delivery, type DeliveryAttempt, type DeliveryStatus,
} from '../../shared/api/notifications'

const labels: Record<DeliveryStatus, string> = {
  pending: '排队中', processing: '发送处理中', sent: '已发送',
  dead_letter: '发送失败（已停止重试）', cancelled: '已取消',
}
const rows = ref<Delivery[]>([])
const status = ref<DeliveryStatus>()
const nextCursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const detailError = ref('')
const detailBusy = ref(false)
const drawer = ref(false)
const selected = ref<Delivery | null>(null)
const attempts = ref<DeliveryAttempt[]>([])
let listRequest = 0
let detailRequest = 0

async function load(more = false) {
  const request = ++listRequest
  busy.value = true
  error.value = ''
  try {
    const page = await fetchDeliveries(status.value, more ? nextCursor.value ?? undefined : undefined)
    if (request !== listRequest) return
    rows.value = more ? [...rows.value, ...page.items] : page.items
    nextCursor.value = page.next_cursor
  } catch (cause) {
    if (request === listRequest) error.value = cause instanceof Error ? cause.message : '读取失败'
  } finally {
    if (request === listRequest) busy.value = false
  }
}

async function open(row: Delivery) {
  const request = ++detailRequest
  drawer.value = true
  selected.value = row
  attempts.value = []
  detailError.value = ''
  detailBusy.value = true
  try {
    const detail = await fetchDelivery(row.delivery_id)
    if (request !== detailRequest) return
    selected.value = detail.delivery
    attempts.value = detail.attempts
  } catch (cause) {
    if (request === detailRequest) {
      detailError.value = cause instanceof Error ? cause.message : '详情读取失败'
    }
  } finally {
    if (request === detailRequest) detailBusy.value = false
  }
}

onMounted(() => load())
onBeforeUnmount(() => { listRequest++; detailRequest++ })
</script>

<template>
  <section class="notification-records">
    <h2>通知投递记录 <HelpHint subject="通知投递记录">每个目标分别记录。已发送表示通道返回成功，不代表收件人已阅读。</HelpHint></h2>
    
    <div class="toolbar">
      <el-select v-model="status" clearable placeholder="全部状态" @change="load(false)">
        <el-option v-for="(label, value) in labels" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button :loading="busy" @click="load(false)">刷新</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-empty v-if="!busy && !error && !rows.length" description="暂无投递记录，不代表通知已成功发送" />
    <el-table v-else :data="rows" row-key="delivery_id">
      <el-table-column prop="channel_name" label="通道" min-width="140" />
      <el-table-column label="目标" min-width="180">
        <template #default="{ row }">{{ row.targets.join('、') }}</template>
      </el-table-column>
      <el-table-column label="状态" min-width="210">
        <template #default="{ row }">{{ labels[row.status as DeliveryStatus] }}</template>
      </el-table-column>
      <el-table-column prop="attempt_count" label="尝试次数" width="100" />
      <el-table-column prop="created_at" label="创建时间" min-width="220" />
      <el-table-column label="操作" width="110">
        <template #default="{ row }"><el-button @click="open(row as Delivery)">详情</el-button></template>
      </el-table-column>
    </el-table>
    <el-button v-if="nextCursor && !error" :loading="busy" @click="load(true)">加载更多</el-button>
    <el-drawer v-model="drawer" title="投递详情" size="min(720px, 95vw)">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <p v-if="detailBusy">正在读取…</p>
      <template v-else-if="selected">
        <p>{{ selected.channel_name }} · {{ labels[selected.status] }}</p>
        <p>错误：{{ selected.last_error_code || selected.last_error_type || '—' }}</p>
        <el-table :data="attempts" row-key="attempt_id">
          <el-table-column prop="attempt_no" label="次数" width="70" />
          <el-table-column label="结果"><template #default="{ row }">{{ row.outcome === 'sent' ? '已发送' : '失败' }}</template></el-table-column>
          <el-table-column prop="error_code" label="错误代码" />
          <el-table-column prop="provider_message_id" label="通道回执" />
          <el-table-column prop="completed_at" label="结束时间" min-width="200" />
        </el-table>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.notification-records { min-width: 0; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.toolbar .el-select { width: 180px; max-width: 100%; }
.toolbar :deep(.el-button) { margin: 0; }
</style>
