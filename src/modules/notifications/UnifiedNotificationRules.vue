<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessageBox, ElOption, ElSelect, ElTable, ElTableColumn } from 'element-plus'
import { botHealth, fetchBotServices, type BotService } from '../../shared/api/bots'
import {
  createNotificationRoute, deleteDiscordForwardRule, fetchChannels, fetchDiscordForwardRules,
  fetchNotificationRoutes, saveDiscordForwardRule, toggleNotificationRoute,
  type DiscordForwardAction, type DiscordForwardRule, type DiscordForwardRuleInput,
  type NotificationChannel, type NotificationRoute,
} from '../../shared/api/notifications'
import { eventLabels, eventsFor, parseTargets, type ChannelKind } from './notification-form'

type Source = '' | 'platform' | 'discord'
type Trigger = '' | DiscordForwardRule['trigger_kind']
type RuleRow = { key: string; source: 'platform' | 'discord'; title: string; summary: string; targets: string; enabled: boolean; route?: NotificationRoute; discord?: DiscordForwardRule }

const props = defineProps<{ revision: number }>()
const channels = ref<NotificationChannel[]>([])
const bots = ref<BotService[]>([])
const platformRules = ref<NotificationRoute[]>([])
const discordRules = ref<DiscordForwardRule[]>([])
const platformCursor = ref<string | null>(null)
const botCursors = ref<Record<string, string | null>>({})
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const dialogError = ref('')
const notice = ref('')
const dialog = ref(false)
const source = ref<Source>('')
const trigger = ref<Trigger>('')
const editing = ref<DiscordForwardRule | null>(null)
const eventForm = reactive({ event: '', kind: '' as ChannelKind | '', channelId: '', targetType: 'private' as 'private' | 'group', targets: '' })
const messageForm = reactive<DiscordForwardRuleInput>({
  bot_service_id: '', name: '', guild_id: '', channel_id: '', trigger_kind: 'contains', trigger_text: '',
  frequency_count: 6, frequency_window_seconds: 10, cooldown_seconds: 10,
  enabled: true, actions: [],
})
const eventOptions = Object.entries(eventLabels)
const kindsForEvent = computed(() => (['smtp', 'qq', 'discord'] as const).filter(kind => eventForm.event in eventsFor(kind)))
const enabledChannels = computed(() => channels.value.filter(row => row.enabled))
const targetChannels = computed(() => enabledChannels.value.filter(row => row.kind === eventForm.kind))
const botName = (id: string) => bots.value.find(row => row.service_id === id)?.name ?? id
const channelName = (id: string) => channels.value.find(row => row.channel_id === id)?.name ?? id
const triggerLabels = { contains: '包含指定文字', acrostic: '上下文藏头', frequency: '消息频率' }
const actionLabels = { qq_private: 'QQ 私聊', qq_group: 'QQ 群', smtp: 'SMTP 邮件' }
const rows = computed<RuleRow[]>(() => [
  ...platformRules.value.map(route => ({
    key: `platform:${route.route_id}`, source: 'platform' as const,
    title: eventLabels[route.notification_kind] ?? route.notification_kind,
    summary: `平台事件 · ${channelName(route.channel_id)}`,
    targets: route.targets.join('、'), enabled: route.enabled, route,
  })),
  ...discordRules.value.map(rule => ({
    key: `discord:${rule.id}`, source: 'discord' as const,
    title: rule.name,
    summary: `Discord 消息 · ${botName(rule.bot_service_id)} · ${triggerLabels[rule.trigger_kind]}`,
    targets: rule.actions.map(action => `${actionLabels[action.kind]} ${action.target}`).join('、'),
    enabled: rule.enabled, discord: rule,
  })),
])
const hasMore = computed(() => Boolean(platformCursor.value || Object.values(botCursors.value).some(Boolean)))

async function pages<T>(load: (cursor?: string) => Promise<{ items: T[]; next_cursor: string | null }>): Promise<T[]> {
  const result: T[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await load(cursor)
    result.push(...page.items)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('分页游标异常，请刷新重试')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return result
}
async function refresh() {
  loading.value = true; error.value = ''
  try {
    const [channelRows, services, routes] = await Promise.all([
      pages(fetchChannels), pages(fetchBotServices), fetchNotificationRoutes(),
    ])
    channels.value = channelRows
    bots.value = services.filter(row => row.kind === 'discord_bridge' && row.enabled)
    platformRules.value = routes.items.filter(route => route.notification_kind !== 'forward')
    platformCursor.value = routes.next_cursor
    const results = await Promise.all(bots.value.map(async bot => ({ id: bot.service_id, page: await fetchDiscordForwardRules(bot.service_id) })))
    discordRules.value = results.flatMap(item => item.page.items)
    botCursors.value = Object.fromEntries(results.map(item => [item.id, item.page.next_cursor]))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '规则读取失败' }
  finally { loading.value = false }
}
async function loadMore() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try {
    if (platformCursor.value) {
      const page = await fetchNotificationRoutes(platformCursor.value)
      platformRules.value.push(...page.items.filter(route => route.notification_kind !== 'forward'))
      platformCursor.value = page.next_cursor
    }
    const pending = Object.entries(botCursors.value).filter((entry): entry is [string, string] => Boolean(entry[1]))
    const results = await Promise.all(pending.map(async ([id, cursor]) => ({ id, page: await fetchDiscordForwardRules(id, cursor) })))
    discordRules.value.push(...results.flatMap(item => item.page.items))
    for (const item of results) botCursors.value[item.id] = item.page.next_cursor
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载更多规则失败' }
  finally { loading.value = false }
}
function action(): DiscordForwardAction { return { kind: 'qq_private', channel_id: '', target: '', review_policy: 'none' } }
function copyRuleInput(input: DiscordForwardRuleInput): DiscordForwardRuleInput {
  return { ...input, actions: input.actions.map(item => ({ ...item })) }
}
function open(rule?: DiscordForwardRule) {
  dialogError.value = ''; editing.value = rule ?? null
  source.value = rule ? 'discord' : ''
  trigger.value = rule?.trigger_kind ?? ''
  Object.assign(eventForm, { event: '', kind: '', channelId: '', targetType: 'private', targets: '' })
  const editable = rule ? (() => {
    const { id: _id, row_version: _version, ...input } = rule
    return copyRuleInput(input)
  })() : null
  Object.assign(messageForm, editable ?? {
    bot_service_id: bots.value[0]?.service_id ?? '', name: '', guild_id: '', channel_id: '',
    trigger_kind: 'contains', trigger_text: '', frequency_count: 6,
    frequency_window_seconds: 10, cooldown_seconds: 10, enabled: true, actions: [action()],
  })
  dialog.value = true
}
function changeEvent() { eventForm.kind = ''; eventForm.channelId = ''; eventForm.targets = '' }
function changeKind() { eventForm.channelId = ''; eventForm.targets = '' }
function changeAction(row: DiscordForwardAction) {
  row.channel_id = ''; row.target = ''; row.review_policy = row.kind === 'qq_group' ? 'lexicon' : 'none'
}
function changeTrigger() {
  if (trigger.value === 'frequency') {
    messageForm.frequency_count ??= 6
    messageForm.frequency_window_seconds ??= 10
    messageForm.cooldown_seconds ??= 10
  } else if (trigger.value) messageForm.trigger_text ??= ''
}
function channelsFor(row: DiscordForwardAction) {
  return enabledChannels.value.filter(channel => channel.kind === (row.kind === 'smtp' ? 'smtp' : 'qq'))
}
async function checkOnline(id: string) {
  const bot = bots.value.find(row => row.service_id === id)
  if (!bot || !bot.applied_config_version_id || bot.applied_config_version_id !== bot.desired_config_version_id) {
    throw new Error('请先确认 Discord Bot 在线且当前配置已应用')
  }
  const health = await botHealth(id)
  const report = health.items[0]
  const age = report ? Date.now() - Date.parse(report.reported_at) : Infinity
  if (report?.config_version_id !== bot.applied_config_version_id || report.status !== 'healthy'
    || report.diagnostics.discord_ready !== true || !Number.isFinite(age) || age < -5000 || age > 90000) {
    throw new Error('Discord Bot 当前未确认在线，请刷新 Bot 状态')
  }
}
async function save() {
  dialogError.value = ''; busy.value = true
  try {
    if (source.value === 'platform') {
      if (!eventForm.event || !eventForm.kind || !(eventForm.event in eventsFor(eventForm.kind))) throw new Error('请先选择平台事件和通知方式')
      if (!targetChannels.value.some(row => row.channel_id === eventForm.channelId)) throw new Error('请选择已启用的通知通道')
      await createNotificationRoute({
        notification_kind: eventForm.event, channel_id: eventForm.channelId,
        targets: parseTargets(eventForm.targets, eventForm.kind, eventForm.targetType),
        template_key: `${eventForm.event}.v1`,
      }, crypto.randomUUID())
    } else if (source.value === 'discord') {
      if (!trigger.value) throw new Error('请先选择消息触发条件')
      await checkOnline(messageForm.bot_service_id)
      if (!messageForm.name.trim()) throw new Error('请填写规则名称')
      if (!messageForm.actions.length) throw new Error('请添加至少一个转发动作')
      const body = copyRuleInput(messageForm)
      body.trigger_kind = trigger.value
      if (trigger.value === 'frequency') body.trigger_text = null
      else { body.frequency_count = null; body.frequency_window_seconds = null; body.cooldown_seconds = null }
      await saveDiscordForwardRule(body, editing.value ?? undefined)
    } else throw new Error('请先选择规则来源')
    dialog.value = false; notice.value = '规则已保存，后续新事件将按当前规则处理。'
    await refresh()
  } catch (cause) { dialogError.value = cause instanceof Error ? cause.message : '保存规则失败' }
  finally { busy.value = false }
}
async function toggle(input: unknown) {
  const row = input as RuleRow
  busy.value = true; error.value = ''
  try {
    if (row.route) await toggleNotificationRoute(row.route)
    else if (row.discord) {
      const { id: _id, row_version: _version, ...body } = row.discord
      await saveDiscordForwardRule({ ...copyRuleInput(body), enabled: !row.discord.enabled }, row.discord)
    }
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '切换规则失败' }
  finally { busy.value = false }
}
async function remove(rule: DiscordForwardRule) {
  try { await ElMessageBox.confirm(`删除“${rule.name}”？历史审核和投递记录会保留。`, '删除规则', { type: 'warning' }) }
  catch { return }
  busy.value = true; error.value = ''
  try { await deleteDiscordForwardRule(rule); await refresh() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '删除规则失败' }
  finally { busy.value = false }
}
watch(() => props.revision, () => { void refresh() })
onMounted(() => { void refresh() })
</script>

<template>
  <section class="notification-card unified-rules">
    <div class="notification-card-heading">
      <div><h2>通知规则 </h2></div>
      <div><el-button :loading="loading" @click="refresh">刷新</el-button> <el-button type="primary" :disabled="loading || busy" @click="open()">＋ 新增规则</el-button></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="unified-rule-table-wrap">
      <el-table :data="rows" row-key="key" :empty-text="loading ? '正在读取规则…' : '暂无规则'">
        <el-table-column label="规则 / 触发条件" min-width="260"><template #default="{ row }"><strong>{{ row.title }}</strong><div class="unified-rule-subtitle">{{ row.summary }}</div></template></el-table-column>
        <el-table-column label="发送目标" min-width="220"><template #default="{ row }">{{ row.targets }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }">{{ row.enabled ? '已启用' : '已停用' }}</template></el-table-column>
        <el-table-column label="操作" width="188"><template #default="{ row }"><div class="notification-rule-actions">
          <el-button v-if="row.discord" text :disabled="busy" @click="open(row.discord)">编辑</el-button>
          <el-button text :disabled="busy" @click="toggle(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
          <el-button v-if="row.discord" text type="danger" :disabled="busy" @click="remove(row.discord)">删除</el-button>
        </div>
        </template></el-table-column>
      </el-table>
    </div>
    <el-button v-if="hasMore" :disabled="loading || busy" @click="loadMore">加载更多规则</el-button>

    <el-dialog v-model="dialog" :title="editing ? '编辑通知规则' : '新增通知规则'" class="unified-rule-dialog"
      :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
      <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      <div class="unified-rule-step"><span>1</span><div><strong>选择规则来源 </strong></div></div>
      <div class="unified-rule-source-choice" role="group" aria-label="规则来源">
        <button type="button" :class="{ selected: source === 'platform' }" :disabled="Boolean(editing) || busy" @click="source = 'platform'">平台事件</button>
        <button type="button" :class="{ selected: source === 'discord' }" :disabled="Boolean(editing) || busy" @click="source = 'discord'">Discord 消息</button>
      </div>
      <template v-if="source === 'platform'">
        <div class="unified-rule-step"><span>2</span><div><strong>选择事件 </strong></div></div>
        <el-form label-position="top" :disabled="busy">
          <el-form-item label="触发事件"><el-select v-model="eventForm.event" placeholder="先选择触发事件" @change="changeEvent"><el-option v-for="[key, label] in eventOptions" :key="key" :label="label" :value="key" /></el-select></el-form-item>
          <template v-if="eventForm.event">
            <div class="unified-rule-step"><span>3</span><div><strong>配置通知目标 </strong></div></div>
            <div class="notification-form-grid">
              <el-form-item label="通知方式"><el-select v-model="eventForm.kind" placeholder="选择通知方式" @change="changeKind"><el-option v-for="kind in kindsForEvent" :key="kind" :label="kind === 'smtp' ? 'SMTP 邮件' : kind === 'qq' ? 'QQ Bot' : 'Discord Bot'" :value="kind" /></el-select></el-form-item>
              <el-form-item v-if="eventForm.kind" label="连接通道"><el-select v-model="eventForm.channelId" placeholder="选择已启用的通道"><el-option v-for="channel in targetChannels" :key="channel.channel_id" :label="channel.name" :value="channel.channel_id" /></el-select></el-form-item>
              <el-form-item v-if="eventForm.kind === 'qq'" label="接收类型"><el-select v-model="eventForm.targetType"><el-option label="QQ 私聊" value="private" /><el-option label="QQ 群" value="group" /></el-select></el-form-item>
              <el-form-item v-if="eventForm.kind" class="wide" :label="eventForm.kind === 'smtp' ? '收件邮箱（每行一个）' : eventForm.kind === 'qq' ? 'QQ 号或群号（每行一个）' : 'Discord 频道 ID（每行一个）'"><el-input v-model="eventForm.targets" type="textarea" :rows="2" maxlength="20000" /></el-form-item>
            </div>
          </template>
        </el-form>
      </template>
      <template v-if="source === 'discord'">
        <div class="unified-rule-step"><span>2</span><div><strong>选择触发条件 </strong></div></div>
        <el-select v-model="trigger" placeholder="先选择消息触发条件" :disabled="busy" @change="changeTrigger">
          <el-option label="消息包含指定文字" value="contains" /><el-option label="上下文藏头" value="acrostic" /><el-option label="消息频率" value="frequency" />
        </el-select>
        <el-form v-if="trigger" label-position="top" :disabled="busy">
          <div class="unified-rule-step"><span>3</span><div><strong>设置来源与条件 </strong></div></div>
          <div class="notification-form-grid">
            <el-form-item label="规则名称"><el-input v-model="messageForm.name" maxlength="100" /></el-form-item>
            <el-form-item label="来源 Discord Bot"><el-select v-model="messageForm.bot_service_id" placeholder="选择已配置的 Bot" :disabled="Boolean(editing)"><el-option v-for="bot in bots" :key="bot.service_id" :label="bot.name" :value="bot.service_id" /></el-select></el-form-item>
            <el-form-item label="来源服务器 ID"><el-input v-model="messageForm.guild_id" maxlength="20" placeholder="Discord Guild ID" /></el-form-item>
            <el-form-item label="来源频道 ID"><el-input v-model="messageForm.channel_id" maxlength="20" placeholder="该服务器内的 Channel ID" /></el-form-item>
            <el-form-item v-if="trigger !== 'frequency'" class="wide" :label="trigger === 'acrostic' ? '藏头目标文字（最多 64 字）' : '消息包含的文字'"><template #label>{{ trigger === 'acrostic' ? '藏头目标文字（最多 64 字）' : '消息包含的文字' }} <HelpHint v-if="trigger === 'contains'" subject="消息包含的文字" content="可填普通文字、@显示名或 @用户ID；@everyone 仅匹配真实全员提及，无需 ID。" /></template>
              <el-input v-model="messageForm.trigger_text" :maxlength="trigger === 'acrostic' ? 64 : 256" />
              
            </el-form-item>
            <template v-else>
              <el-form-item label="每 n 条触发一次"><el-input-number v-model="messageForm.frequency_count" :min="2" :max="64" /></el-form-item>
              <el-form-item label="统计窗口（秒）"><el-input-number v-model="messageForm.frequency_window_seconds" :min="1" :max="3600" /></el-form-item>
              <el-form-item label="冷却时间（秒）"><el-input-number v-model="messageForm.cooldown_seconds" :min="0" :max="3600" /></el-form-item>
            </template>
          </div>
          <div class="unified-rule-step"><span>4</span><div><strong>转发动作 </strong></div></div>
          <div v-for="(item, index) in messageForm.actions" :key="index" class="discord-rule-action">
            <div class="notification-form-grid">
              <el-form-item label="转发方式"><template #label>转发方式 <HelpHint v-if="item.kind === 'qq_group'" subject="QQ群转发" content="QQ群消息必须经过词库检查，命中后暂存审核。" /></template><el-select v-model="item.kind" @change="changeAction(item)"><el-option label="QQ 私聊" value="qq_private" /><el-option label="QQ 群" value="qq_group" /><el-option label="SMTP 邮件" value="smtp" /></el-select></el-form-item>
              <el-form-item label="连接通道"><el-select v-model="item.channel_id" placeholder="选择已启用通道"><el-option v-for="channel in channelsFor(item)" :key="channel.channel_id" :label="channel.name" :value="channel.channel_id" /></el-select></el-form-item>
              <el-form-item :label="item.kind === 'smtp' ? '收件邮箱' : item.kind === 'qq_group' ? 'QQ 群号' : 'QQ 号'"><el-input v-model="item.target" maxlength="320" /></el-form-item>
              <el-form-item v-if="item.kind === 'qq_private'" label="敏感词处理"><el-select v-model="item.review_policy"><el-option label="直接转发" value="none" /><el-option label="命中后暂存审核" value="lexicon" /></el-select></el-form-item>
            </div>
            
            <el-button text type="danger" :disabled="messageForm.actions.length === 1" @click="messageForm.actions.splice(index, 1)">移除此动作</el-button>
          </div>
          <el-button :disabled="messageForm.actions.length >= 20" @click="messageForm.actions.push(action())">＋ 添加转发动作</el-button>
        </el-form>
      </template>
      <template #footer><el-button :disabled="busy" @click="dialog = false">取消</el-button><el-button type="primary" :loading="busy" :disabled="!source || source === 'discord' && !trigger || source === 'platform' && !eventForm.event" @click="save">保存规则</el-button></template>
    </el-dialog>
  </section>
</template>
