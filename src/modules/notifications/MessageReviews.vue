<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  ElAlert, ElButton, ElDrawer, ElInput, ElMessageBox, ElOption, ElSelect, ElTable, ElTableColumn,
} from 'element-plus'
import { approveReview, batchReviews, fetchReview, fetchReviews, type Review, type ReviewDetail } from '../../shared/api/reviews'

const rows = ref<Review[]>([])
const selected = ref<Review[]>([])
const filter = ref('pending')
const cursor = ref<string | null>(null)
const detail = ref<ReviewDetail>()
const open = ref(false)
const edit = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
let sequence = 0
const labels: Record<string, string> = {
  hold: '暂存待判断', pending: '待审核', approved: '投递中', rejected: '已拒绝', expired: '已过期', completed: '已结算',
}
async function refresh(more = false) {
  const page = await fetchReviews(filter.value || undefined, more ? cursor.value ?? undefined : undefined)
  rows.value = more ? [...rows.value, ...page.items] : page.items
  cursor.value = page.next_cursor
  selected.value = []
}
async function perform(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try { await action() } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') error.value = cause instanceof Error ? cause.message : '操作失败'
  } finally { busy.value = false }
}
async function inspect(row: Review) {
  const current = ++sequence
  detail.value = undefined
  edit.value = ''
  open.value = true
  const result = await fetchReview(row.id)
  if (current !== sequence || !open.value) return
  detail.value = result
  edit.value = result.document?.text ?? ''
}
function close() {
  sequence++
  detail.value = undefined
  edit.value = ''
}
async function approve(original: boolean) {
  const current = detail.value
  if (!current) return
  await ElMessageBox.confirm('批准后会按配置逐目标发送，已经发送的消息不能撤回。', '确认批准', { type: 'warning' })
  await approveReview(current, original ? null : edit.value)
  open.value = false
  close()
  notice.value = '已批准，请在投递记录查看实际发送状态。'
  await refresh()
}
async function batch(action: 'reject' | 'delete') {
  if (!selected.value.length) return
  if (selected.value.length > 50) throw new Error('每次最多处理50条，请减少选择数量。')
  await ElMessageBox.confirm(action === 'reject'
    ? '拒绝所选待审核消息并立即清理正文？'
    : '删除所选已结算记录？活动消息不会删除。', '批量处理', { type: 'warning' })
  const result = await batchReviews(selected.value.map(row => row.id), action)
  notice.value = `已处理 ${result.filter(row => row.accepted).length} 条，未处理 ${result.filter(row => !row.accepted).length} 条。`
  await refresh()
}
async function rejectCurrent() {
  if (!detail.value) return
  await ElMessageBox.confirm('拒绝当前消息并清理正文？', '拒绝消息', { type: 'warning' })
  const result = await batchReviews([detail.value.id], 'reject')
  if (!result[0]?.accepted) throw new Error('消息状态已变更，请刷新后重试。')
  open.value = false
  close()
  await refresh()
}
onMounted(() => perform(() => refresh()))
</script>
<template>
  <section>
    <h2>消息审核</h2>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <div class="notification-review-toolbar">
      <div class="notification-review-filter">
        <span>审核状态</span>
        <el-select v-model="filter" aria-label="审核状态" :disabled="busy" @change="perform(() => refresh())">
          <el-option label="全部" value="" />
          <el-option v-for="(label, value) in labels" :key="value" :label="label" :value="value" />
        </el-select>
      </div>
      <div class="notification-review-actions">
        <el-button :disabled="busy" @click="perform(() => refresh())">刷新</el-button>
        <el-button :disabled="busy || !selected.length" @click="perform(() => batch('reject'))">批量拒绝</el-button>
        <el-button :disabled="busy || !selected.length" type="danger" @click="perform(() => batch('delete'))">批量删除已处理</el-button>
      </div>
    </div>
    <div class="notification-review-table-wrap"><el-table :data="rows" row-key="id" @selection-change="(value: Review[]) => selected = value">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="message_id" label="来源消息" min-width="180" show-overflow-tooltip />
      <el-table-column prop="received_at" label="接收时间" min-width="160" />
      <el-table-column label="状态" width="110"><template #default="{ row }">{{ labels[row.state] ?? row.state }}</template></el-table-column>
      <el-table-column label="操作" width="90"><template #default="{ row }"><el-button :disabled="busy" @click="perform(() => inspect(row as Review))">查看</el-button></template></el-table-column>
    </el-table></div>
    <el-button v-if="cursor" :disabled="busy" @click="perform(() => refresh(true))">加载更多</el-button>
    <el-drawer v-model="open" title="审核详情" size="min(640px, 95vw)" @closed="close">
      <template v-if="detail">
        <p>{{ labels[detail.state] }}</p>
        <template v-if="detail.body_available && detail.document">
          <h3>原文</h3><pre class="body">{{ detail.document.original }}</pre>
          <p>匹配：{{ detail.document.matches.join('、') || '无' }}</p>
          <template v-if="detail.state === 'pending'">
            <el-input v-model="edit" type="textarea" :rows="8" maxlength="16000" :disabled="busy" />
            <el-button :disabled="busy" @click="perform(() => approve(true))">按原文批准</el-button>
            <el-button :disabled="busy || !edit" type="primary" @click="perform(() => approve(false))">编辑后批准</el-button>
            <el-button :disabled="busy" type="danger" @click="perform(rejectCurrent)">拒绝</el-button>
          </template>
        </template>
        <p v-else>正文已清理或已超过允许查看期限。</p>
      </template>
    </el-drawer>
  </section>
</template>
<style scoped>
.body { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
