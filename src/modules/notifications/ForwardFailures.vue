<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import { fetchReviews, type Review } from '../../shared/api/reviews'
import { fetchDeliveries, type Delivery } from '../../shared/api/notifications'

const rejected = ref<Review[]>([])
const deliveries = ref<Delivery[]>([])
const reviewCursor = ref<string | null>(null)
const deliveryCursor = ref<string | null>(null)
const reviewBusy = ref(false)
const deliveryBusy = ref(false)
const reviewError = ref('')
const deliveryError = ref('')
let reviewRequest = 0
let deliveryRequest = 0

function rejectionReason(reason?: string | null) {
  if (reason === 'source_not_allowed') return '来源不在允许范围'
  if (reason === 'manual_rejection') return '管理员拒绝'
  return '已拒绝（旧记录未记录具体原因）'
}

async function loadRejected(more = false) {
  const request = ++reviewRequest
  reviewBusy.value = true
  reviewError.value = ''
  try {
    const page = await fetchReviews('rejected', more ? reviewCursor.value ?? undefined : undefined)
    if (request !== reviewRequest) return
    rejected.value = more ? [...rejected.value, ...page.items] : page.items
    reviewCursor.value = page.next_cursor
  } catch (cause) {
    if (request === reviewRequest) reviewError.value = cause instanceof Error ? cause.message : '拒绝记录读取失败'
  } finally {
    if (request === reviewRequest) reviewBusy.value = false
  }
}

async function loadDeliveries(more = false) {
  const request = ++deliveryRequest
  deliveryBusy.value = true
  deliveryError.value = ''
  try {
    const page = await fetchDeliveries('dead_letter', more ? deliveryCursor.value ?? undefined : undefined, 'forward')
    if (request !== deliveryRequest) return
    deliveries.value = more ? [...deliveries.value, ...page.items] : page.items
    deliveryCursor.value = page.next_cursor
  } catch (cause) {
    if (request === deliveryRequest) deliveryError.value = cause instanceof Error ? cause.message : '转发投递读取失败'
  } finally {
    if (request === deliveryRequest) deliveryBusy.value = false
  }
}

onMounted(() => { void loadRejected(); void loadDeliveries() })
onBeforeUnmount(() => { reviewRequest++; deliveryRequest++ })
</script>

<template>
  <section>
    <h2>转发失败记录 <HelpHint subject="转发失败记录">拒绝发生在发送前；投递失败表示通道尝试后已停止重试。两类记录分别分页。</HelpHint></h2>
    
    <h3>已拒绝的来源消息</h3>
    <el-button :loading="reviewBusy" @click="loadRejected()">刷新拒绝记录</el-button>
    <el-alert v-if="reviewError" :title="reviewError" type="error" :closable="false" />
    <el-empty v-if="!reviewBusy && !reviewError && !rejected.length" description="暂无拒绝记录" />
    <el-table v-else :data="rejected" row-key="id">
      <el-table-column prop="message_id" label="来源消息" />
      <el-table-column label="状态" width="90">已拒绝</el-table-column>
      <el-table-column label="原因"><template #default="{ row }">{{ rejectionReason(row.failure_reason) }}</template></el-table-column>
      <el-table-column prop="received_at" label="接收时间" />
    </el-table>
    <el-button v-if="reviewCursor && !reviewError" :loading="reviewBusy" @click="loadRejected(true)">加载更多拒绝记录</el-button>
    <h3>转发投递失败</h3>
    <el-button :loading="deliveryBusy" @click="loadDeliveries()">刷新投递失败</el-button>
    <el-alert v-if="deliveryError" :title="deliveryError" type="error" :closable="false" />
    <el-empty v-if="!deliveryBusy && !deliveryError && !deliveries.length" description="暂无转发投递失败" />
    <el-table v-else :data="deliveries" row-key="delivery_id">
      <el-table-column prop="channel_name" label="通道" />
      <el-table-column label="目标"><template #default="{ row }">{{ row.targets.join('、') }}</template></el-table-column>
      <el-table-column label="状态" width="140">发送失败</el-table-column>
      <el-table-column label="原因"><template #default="{ row }">{{ row.last_error_code || row.last_error_type || '未记录原因' }}</template></el-table-column>
      <el-table-column prop="created_at" label="创建时间" />
    </el-table>
    <el-button v-if="deliveryCursor && !deliveryError" :loading="deliveryBusy" @click="loadDeliveries(true)">加载更多投递失败</el-button>
  </section>
</template>
