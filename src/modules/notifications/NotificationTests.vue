<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElMessageBox, ElOption, ElSelect } from 'element-plus'
import { enqueueNotificationTest, fetchChannels, type NotificationChannel } from '../../shared/api/notifications'
import { parseTargets, type ChannelKind } from './notification-form'

const props = defineProps<{ kind: ChannelKind; revision: number }>()
const channels = ref<NotificationChannel[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const test = reactive({ channelId: '', targets: '', targetType: 'private' as 'private' | 'group', summary: 'AL-1S 通知测试' })
const visibleChannels = computed(() => channels.value.filter(channel => channel.kind === props.kind && channel.enabled))
const targetLabel = computed(() => props.kind === 'smtp' ? '收件邮箱' : props.kind === 'qq' ? 'QQ 号码或群号' : 'Discord 频道 ID')

async function refresh() {
  loading.value = true; error.value = ''
  try {
    const found: NotificationChannel[] = []
    const seen = new Set<string>()
    let after: string | undefined
    do {
      const page = await fetchChannels(after)
      found.push(...page.items)
      after = page.next_cursor ?? undefined
      if (after && seen.has(after)) throw new Error('通道分页异常，请刷新重试')
      if (after) seen.add(after)
    } while (after)
    channels.value = found
    if (!visibleChannels.value.some(channel => channel.channel_id === test.channelId)) {
      test.channelId = visibleChannels.value[0]?.channel_id ?? ''
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '配置读取失败' }
  finally { loading.value = false }
}
async function send() {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    if (!visibleChannels.value.some(channel => channel.channel_id === test.channelId)) throw new Error('请选择已启用的通知通道')
    if (!test.summary.trim()) throw new Error('请填写测试消息')
    const targets = parseTargets(test.targets, props.kind, test.targetType)
    await ElMessageBox.confirm('这会向填写的真实目标发送测试消息，是否继续？', '确认发送', { type: 'warning' })
    const result = await enqueueNotificationTest({ channel_id: test.channelId, targets, summary: test.summary }, crypto.randomUUID())
    notice.value = `已加入发送队列（不是已送达），投递 ID：${result.delivery_id}。`
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') error.value = cause instanceof Error ? cause.message : '发送测试失败'
  } finally { busy.value = false }
}
watch(() => [props.kind, props.revision], () => { void refresh() })
onMounted(() => { void refresh() })
</script>

<template>
  <section class="notification-card">
    <h2>发送测试 <HelpHint subject="发送测试">验证通道与接收目标，发送前需要确认。已入队不代表已送达，可在「投递记录」查看结果。</HelpHint></h2>
    
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="info" :closable="false" />
    <el-form label-position="top" :disabled="busy || loading" @submit.prevent="send">
      <el-form-item label="通知通道"><el-select v-model="test.channelId" placeholder="请选择已启用的通道"><el-option v-for="channel in visibleChannels" :key="channel.channel_id" :label="channel.name" :value="channel.channel_id" /></el-select></el-form-item>
      <el-form-item v-if="kind === 'qq'" label="接收类型"><el-select v-model="test.targetType"><el-option label="QQ 私聊" value="private" /><el-option label="QQ 群" value="group" /></el-select></el-form-item>
      <el-form-item :label="targetLabel + '（每行一个）'"><el-input v-model="test.targets" type="textarea" :rows="2" maxlength="20000" /></el-form-item>
      <el-form-item label="测试消息"><el-input v-model="test.summary" type="textarea" :rows="3" maxlength="2000" /></el-form-item>
      <div class="notification-actions">
      <el-button native-type="submit" type="primary" :loading="busy" :disabled="!test.channelId || loading">发送测试消息</el-button>
      <el-button :disabled="busy || loading" @click="refresh">刷新配置</el-button>
      </div>
    </el-form>
    
  </section>
</template>
