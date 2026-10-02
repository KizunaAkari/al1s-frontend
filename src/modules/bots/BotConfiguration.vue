<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElInput, ElOption, ElSelect } from 'element-plus'
import { botGrant, createBot, fetchBotConfigVersion, probeGateway, resolveDiscordApplicationId, saveBotConfig, type BotService } from '../../shared/api/bots'

const props = defineProps<{ kind: 'qq' | 'discord'; services: BotService[] }>()
const emit = defineEmits<{ changed: []; selected: [serviceId: string | null] }>()
const kindValue = computed(() => props.kind === 'qq' ? 'onebot_gateway' : 'discord_bridge')
const available = computed(() => props.services.filter(item => item.kind === kindValue.value))
const selectedId = ref('')
const current = computed(() => available.value.find(item => item.service_id === selectedId.value))
const name = ref('')
const creating = ref(false)
watch(() => creating.value ? null : current.value?.service_id ?? null,
  value => emit('selected', value), { immediate: true })
const busy = ref(false)
const loadingVersion = ref(false)
const resolvingApplication = ref(false)
const error = ref('')
const notice = ref('')
const grant = ref('')
const secretConfigured = ref(false)
const fields = reactive({
  url: 'http://al1s-llbot:3000', applicationId: '', secret: '',
})
let versionRequest = 0
let createKey = crypto.randomUUID()
let saveKey = crypto.randomUUID()
let resolvedToken = ''
let pendingToken = ''
let pendingResolution: Promise<string> | null = null

function resetFields() {
  resolvedToken = ''
  fields.url = 'http://al1s-llbot:3000'
  fields.applicationId = ''
  fields.secret = ''
  secretConfigured.value = false
  grant.value = ''
  error.value = ''
  notice.value = ''
  saveKey = crypto.randomUUID()
}
watch(() => props.kind, () => {
  creating.value = false
  selectedId.value = available.value[0]?.service_id ?? ''
  resetFields()
}, { immediate: true })
watch(available, rows => {
  if (!creating.value && !rows.some(item => item.service_id === selectedId.value)) {
    selectedId.value = rows[0]?.service_id ?? ''
  }
})
watch(selectedId, async id => {
  const request = ++versionRequest
  resetFields()
  const service = available.value.find(item => item.service_id === id)
  if (!service?.desired_config_version_id) return
  loadingVersion.value = true
  try {
    const version = await fetchBotConfigVersion(id, service.desired_config_version_id)
    if (request !== versionRequest) return
    const settings = version.settings
    fields.url = String(settings.ONEBOT_BASE_URL ?? 'http://al1s-llbot:3000')
    fields.applicationId = String(settings.DISCORD_APPLICATION_ID ?? '')
    secretConfigured.value = version.secret_configured
  } catch (cause) {
    if (request === versionRequest) error.value = cause instanceof Error ? cause.message : '读取配置失败'
  } finally {
    if (request === versionRequest) loadingVersion.value = false
  }
}, { immediate: true })
watch(fields, () => { saveKey = crypto.randomUUID(); grant.value = '' }, { deep: true })
watch(() => fields.secret, token => {
  if (props.kind === 'discord' && token.trim()) {
    resolvedToken = ''
    fields.applicationId = ''
  }
})
watch(name, () => { createKey = crypto.randomUUID() })

async function resolvedDiscordId(): Promise<string> {
  const token = fields.secret.trim()
  if (!token) throw new Error('请填写 Discord Bot Token。')
  if (token === resolvedToken && fields.applicationId) return fields.applicationId
  if (token === pendingToken && pendingResolution) {
    const applicationId = await pendingResolution
    if (props.kind !== 'discord' || fields.secret.trim() !== token) {
      throw new Error('Bot Token 已更改，请重试。')
    }
    return applicationId
  }

  resolvingApplication.value = true
  pendingToken = token
  const request = resolveDiscordApplicationId(token).then(applicationId => {
    if (props.kind === 'discord' && fields.secret.trim() === token) {
      fields.applicationId = applicationId
      resolvedToken = token
    }
    return applicationId
  })
  pendingResolution = request
  try {
    const applicationId = await request
    if (props.kind !== 'discord' || fields.secret.trim() !== token) {
      throw new Error('Bot Token 已更改，请重试。')
    }
    return applicationId
  } finally {
    if (pendingResolution === request) {
      pendingResolution = null
      pendingToken = ''
      resolvingApplication.value = false
    }
  }
}

async function autoFillDiscordId() {
  if (props.kind !== 'discord' || !fields.secret.trim()) return
  error.value = ''
  const token = fields.secret.trim()
  try {
    await resolvedDiscordId()
  } catch (cause) {
    if (fields.secret.trim() === token) {
      error.value = cause instanceof Error ? cause.message : '无法获取 Discord 应用 ID。'
    }
  }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try { await action() } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
  } finally { busy.value = false }
}
async function create() {
  const trimmed = name.value.trim()
  if (!trimmed) throw new Error('请填写连接名称')
  const result = await createBot(kindValue.value, trimmed, createKey)
  creating.value = false
  selectedId.value = result.service_id
  name.value = ''
  emit('changed')
  notice.value = '连接已创建，请填写平台连接配置。'
}
async function save() {
  const service = current.value
  if (!service) return
  if (!fields.secret.trim() && (secretConfigured.value || props.kind === 'discord')) throw new Error(secretConfigured.value
    ? '提交新版本时请重新输入令牌；令牌不会从服务器回显。'
    : '请填写 Discord Bot Token。')
  let settings: Record<string, unknown>
  if (props.kind === 'qq') {
    let url: URL
    try { url = new URL(fields.url.trim()) } catch { throw new Error('请填写有效的 OneBot HTTP 地址') }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new Error('OneBot 地址只能包含 http(s) 协议、主机和端口')
    }
    settings = { ONEBOT_BASE_URL: fields.url.trim().replace(/\/$/, '') }
  } else {
    const applicationId = await resolvedDiscordId()
    settings = { DISCORD_APPLICATION_ID: applicationId }
  }
  const result = await saveBotConfig(service, settings, fields.secret.trim() || null,
    null, saveKey)
  fields.secret = ''
  secretConfigured.value = result.version.secret_configured
  emit('changed')
  notice.value = props.kind === 'qq'
    ? '目标配置已保存。请点击“验证连接”确认 OneBot HTTP 服务和 QQ 登录。'
    : 'Bot 基础配置已提交；Bot 在线后请在通知设置添加消息规则。'
}
async function probe() {
  const service = current.value
  if (!service) return
  const result = await probeGateway(service.service_id)
  emit('changed')
  notice.value = result.applied ? '连接验证通过，配置已应用。' : '连接或登录验证失败；请检查原生管理页的登录及 HTTP 服务。'
}
async function registration() {
  if (!current.value) return
  const result = await botGrant(current.value.service_id)
  grant.value = result.registration_code
  notice.value = `一次性注册码有效至 ${result.expires_at}。请只在受控部署入口中使用。`
}
</script>

<template>
  <section class="bot-card bot-config">
    <div class="bot-card-heading"><h2>连接配置 </h2><span class="bot-pill">{{ available.length ? `${available.length} 个连接` : '暂无连接' }}</span></div>
    
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="notice" :title="notice" type="info" :closable="false" show-icon />
    <div v-if="available.length && !creating" class="bot-field">
      <label for="bot-service">已有连接</label>
      <div class="bot-inline"><el-select id="bot-service" v-model="selectedId" placeholder="选择连接" class="bot-fill"><el-option v-for="service in available" :key="service.service_id" :label="service.name" :value="service.service_id" /></el-select><el-button @click="creating = true">新建</el-button></div>
    </div>
    <div v-if="!available.length || creating" class="bot-create">
      <div class="bot-field"><label for="bot-name">连接名称</label><el-input id="bot-name" v-model="name" maxlength="100" :placeholder="kind === 'qq' ? '例如：QQ 主机器人' : '例如：Discord 主机器人'" @keyup.enter="run(create)" /></div>
      <div class="bot-field"><label>适配器</label><el-input :model-value="kind === 'qq' ? 'LLOneBot' : 'Discord Worker'" disabled /></div>
      <div class="bot-actions"><el-button type="primary" :loading="busy" @click="run(create)">创建连接</el-button><el-button v-if="creating" @click="creating = false">取消</el-button></div>
    </div>
    <template v-if="current && !creating">
      <div v-loading="loadingVersion" class="bot-settings">
        <template v-if="kind === 'qq'"><div class="bot-field"><label for="bot-url">平台连接 OneBot 的 HTTP 地址 <HelpHint subject="OneBot HTTP 地址">默认的 al1s-llbot 是容器内部名称，浏览器无法打开这个地址。请使用本页“原生管理页”入口登录 QQ、启用 OneBot HTTP 服务，再验证连接。</HelpHint></label><el-input id="bot-url" v-model="fields.url" placeholder="http://al1s-llbot:3000" /></div></template>
        <template v-else>
          <div class="bot-field"><label for="bot-application">Discord 应用 ID </label><el-input id="bot-application" v-model="fields.applicationId" readonly placeholder="填入 Bot Token 后自动获取" /><small v-if="resolvingApplication || fields.applicationId" role="status">{{ resolvingApplication ? '正在从 Discord 获取应用 ID…' : '已从当前 Bot Token 获取' }}</small></div>
          <div class="bot-field"><label for="bot-secret">Discord Bot Token（长字符串） <HelpHint subject="Discord Bot Token">离开输入框后自动获取应用 ID；令牌不会回显。</HelpHint></label><el-input id="bot-secret" v-model="fields.secret" type="password" show-password autocomplete="new-password" :placeholder="secretConfigured ? '已设置；更新配置时重新输入' : '在 Bot 页面复制 Token'" @blur="autoFillDiscordId" /></div>
        </template>
        <div v-if="kind === 'qq'" class="bot-field"><label for="bot-secret">OneBot 访问令牌（可选） <HelpHint subject="OneBot 访问令牌">令牌不会回显；已设置令牌时，提交新版本需重新输入。</HelpHint></label><el-input id="bot-secret" v-model="fields.secret" type="password" show-password autocomplete="new-password" :placeholder="secretConfigured ? '已设置；更新配置时重新输入' : '输入令牌'" /></div>
      </div>
      <div class="bot-actions"><el-button type="primary" :loading="busy" :disabled="loadingVersion" @click="run(save)">保存配置</el-button><el-button v-if="kind === 'qq'" :loading="busy" :disabled="!current.desired_config_version_id" @click="run(probe)">验证连接</el-button><el-button v-else :loading="busy" @click="run(registration)">生成注册码</el-button></div>
      <div v-if="grant" class="bot-grant"><el-input :model-value="grant" readonly type="password" show-password /><el-button @click="grant = ''">隐藏</el-button></div>
      
    </template>
  </section>
</template>
