<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import {
  ElAlert, ElButton, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu,
  ElForm, ElFormItem, ElInput, ElInputNumber, ElMessageBox,
  ElOption, ElSelect, ElTable, ElTableColumn,
} from 'element-plus'
import {
  createSmtpChannel, createBotChannel, deleteNotificationChannel, fetchChannels,
  renameNotificationChannel, setChannelEnabled, type NotificationChannel,
} from '../../shared/api/notifications'
import { fetchBotServices, type BotService } from '../../shared/api/bots'
import { ApiError } from '../../shared/api/client'

const props = defineProps<{ kind: NotificationChannel['kind'] }>()
const emit = defineEmits<{ changed: [] }>()
const visibleRows = computed(() => rows.value.filter(row => row.kind === props.kind))
const bots = ref<BotService[]>([])
const botCursor = ref<string | null>(null)
const botForm = reactive({ name: '', id: '', kind: (props.kind === 'discord' ? 'discord' : 'qq') as 'qq' | 'discord' })
watch(() => botForm.kind, () => { botForm.id = '' })
let botKey = crypto.randomUUID()
watch(botForm, () => { botKey = crypto.randomUUID() }, { flush: 'sync' })
async function loadBots(more = false) {
  const page = await fetchBotServices(more ? botCursor.value ?? undefined : undefined)
  bots.value = more ? [...bots.value, ...page.items] : page.items
  botCursor.value = page.next_cursor
}
async function saveBot() {
  await createBotChannel(botForm.name, botForm.id, botKey, botForm.kind)
  botKey = crypto.randomUUID()
  emit('changed')
  await refresh()
  notice.value = 'Bot通道已关联；接下来配置路由目标。'
}

const rows = ref<NotificationChannel[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const renameVisible = ref(false)
const renameTarget = ref<NotificationChannel | null>(null)
const renameName = ref('')
const form = reactive({
  name: '', host: '', port: 465, from_address: '', username: '', secret: '', security: 'ssl',
})
let createKey = crypto.randomUUID()
watch(form, () => { createKey = crypto.randomUUID() }, { flush: 'sync' })

async function refresh(more = false) {
  const page = await fetchChannels(more ? cursor.value ?? undefined : undefined)
  rows.value = more ? [...rows.value, ...page.items] : page.items
  cursor.value = page.next_cursor
}

async function perform(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try { await action() } catch (cause) {
    error.value = cause instanceof ApiError && cause.code === 'notification_channel_conflict'
      ? '通道名称已存在，请换一个名称。'
      : cause instanceof ApiError && cause.status === 409
        ? '配置已变化，请刷新后重试。'
        : cause instanceof ApiError && cause.status === 404
          ? '通道已不存在，请刷新列表。'
          : cause instanceof Error ? cause.message : '操作失败'
  } finally { busy.value = false }
}

async function save() {
  const { name, secret, ...settings } = form
  await createSmtpChannel({ name, secret: secret || null, settings }, createKey)
  form.secret = ''
  createKey = crypto.randomUUID()
  emit('changed')
  notice.value = '通道已保存；尚未配置路由或发送测试，不代表邮件已送达。'
  await refresh()
}

async function toggle(row: NotificationChannel) {
  await setChannelEnabled(row, !row.enabled)
  emit('changed')
  await refresh()
}
function openRename(row: NotificationChannel) {
  renameTarget.value = row
  renameName.value = row.name
  renameVisible.value = true
}
async function saveRename() {
  const row = renameTarget.value
  const name = renameName.value.trim()
  if (!row || !name || name === row.name) return
  await perform(async () => {
    await renameNotificationChannel(row, name)
    renameVisible.value = false
    await refresh()
    emit('changed')
    notice.value = '通道名称已更新。'
  })
}
async function removeChannel(row: NotificationChannel) {
  try {
    await ElMessageBox.confirm(
      `删除“${row.name}”后，关联通知规则将停用并从列表移除，待发送通知会取消；历史记录保留，Bot 管理中的连接不受影响。确认删除？`,
      '删除通知通道',
      { type: 'warning', confirmButtonText: '删除通道', cancelButtonText: '取消' },
    )
  } catch { return }
  await perform(async () => {
    await deleteNotificationChannel(row)
    await refresh()
    emit('changed')
    notice.value = '通道已删除。'
  })
}
async function channelAction(command: string, row: NotificationChannel) {
  if (command === 'toggle') await perform(() => toggle(row))
  else if (command === 'rename') openRename(row)
  else if (command === 'delete') await removeChannel(row)
}
onMounted(() => perform(async () => { await Promise.all([refresh(), ...(props.kind === 'smtp' ? [] : [loadBots()])]) }))
</script>

<template>
  <section class="notification-card">
    <h2>{{ kind === 'smtp' ? '邮件连接配置' : 'Bot 关联' }} <HelpHint v-if="kind === 'smtp'" subject="连接配置">请先在邮箱服务商处开启 SMTP，并使用授权码。仅支持加密连接；已保存的密码不会回显。</HelpHint></h2>
    <el-alert v-if="error" type="error" :title="error" :closable="false" />
    <el-alert v-if="notice" type="success" :title="notice" :closable="false" />
    <el-form v-if="kind !== 'smtp'" label-position="top" :disabled="busy" @submit.prevent="perform(saveBot)">
      <el-form-item label="通道名称"><el-input v-model="botForm.name" maxlength="100" placeholder="例如：日常通知" /></el-form-item>
      <el-form-item label="Bot 管理中的连接">
        <el-select v-model="botForm.id" placeholder="选择已配置的 Bot" filterable>
          <el-option v-for="bot in bots.filter(b => b.kind === (kind === 'qq' ? 'onebot_gateway' : 'discord_bridge'))"
            :key="bot.service_id" :label="bot.name" :value="bot.service_id" :disabled="!bot.enabled" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <div class="notification-actions">
        <el-button native-type="submit" type="primary" :loading="busy" :disabled="!botForm.id || !botForm.name.trim()">保存关联</el-button>
        <el-button @click="perform(() => loadBots())">刷新连接</el-button>
        <el-button v-if="botCursor" @click="perform(() => loadBots(true))">更多连接</el-button>
        </div>
      </el-form-item>
      <router-link to="/bots">前往 Bot 管理</router-link>
    </el-form>
    <el-form v-else label-position="top" :disabled="busy" class="notification-form-grid" @submit.prevent="perform(save)">
      <el-form-item label="通道名称"><el-input v-model="form.name" maxlength="100" placeholder="例如：个人邮箱" /></el-form-item>
      <el-form-item label="发件邮箱"><el-input v-model="form.from_address" maxlength="320" placeholder="name@example.com" /></el-form-item>
      <el-form-item label="SMTP 服务器" class="wide"><el-input v-model="form.host" maxlength="255" placeholder="smtp.example.com" /></el-form-item>
      <el-form-item label="端口"><el-input-number v-model="form.port" :min="1" :max="65535" /></el-form-item>
      <el-form-item label="连接安全"><el-select v-model="form.security"><el-option label="SSL" value="ssl" /><el-option label="STARTTLS" value="starttls" /></el-select></el-form-item>
      <el-form-item label="用户名"><el-input v-model="form.username" maxlength="320" autocomplete="off" /></el-form-item>
      <el-form-item label="密码或授权码"><el-input v-model="form.secret" type="password" show-password autocomplete="new-password" maxlength="4096" /></el-form-item>
      <el-form-item class="wide"><el-button native-type="submit" type="primary" :loading="busy" :disabled="!form.name.trim() || !form.host.trim() || !form.from_address.trim()">新增 SMTP 通道</el-button></el-form-item>
      
    </el-form>
    <div class="notification-channel-list">
      <div class="notification-card-heading"><h3>已配置通道</h3><el-button :disabled="busy" text @click="perform(() => refresh())">刷新</el-button></div>
      <p v-if="busy" role="status">正在读取配置…</p>
      <el-table v-if="visibleRows.length" :data="visibleRows" row-key="channel_id">
        <el-table-column prop="name" label="名称" min-width="100" show-overflow-tooltip />
        <el-table-column label="状态" width="88"><template #default="{ row }">{{ row.enabled ? '已启用' : '已停用' }}</template></el-table-column>
        <el-table-column label="操作" width="84"><template #default="{ row }">
          <el-dropdown trigger="click" :disabled="busy" @command="channelAction($event, row as NotificationChannel)">
            <el-button class="notification-channel-action-trigger" text :icon="MoreFilled" :aria-label="`通道操作：${row.name}`" title="通道操作" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="toggle">{{ row.enabled ? '停用' : '启用' }}</el-dropdown-item>
                <el-dropdown-item command="rename">改名</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template></el-table-column>
      </el-table>
      <p v-else-if="!busy && !error">{{ cursor ? '已加载范围内暂无此类通道，请加载更多。' : '尚未配置此类通道' }}</p>
      <el-button v-if="cursor" :disabled="busy" @click="perform(() => refresh(true))">加载更多通道</el-button>
    </div>
    <el-dialog v-model="renameVisible" title="修改通道名称" width="min(420px, 92vw)" append-to-body>
      <el-input v-model="renameName" maxlength="100" show-word-limit aria-label="新通道名称" @keyup.enter="saveRename" />
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" :loading="busy" :disabled="!renameName.trim() || renameName.trim() === renameTarget?.name" @click="saveRename">保存名称</el-button>
      </template>
    </el-dialog>
  </section>
</template>
