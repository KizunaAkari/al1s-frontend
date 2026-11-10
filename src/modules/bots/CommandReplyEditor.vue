<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CommandReplyLayout from './CommandReplyLayout.vue'
import { fetchTradingCommands, previewTradingCommand, saveTradingCommand,
  type CommandDraft, type TradingCommandsView, type TradingEngine } from '../../shared/api/trading-replies'

const props = defineProps<{ serviceId: string; engine: TradingEngine; revision: number }>()
const emit = defineEmits<{ saved: [value: TradingCommandsView] }>()
const view = ref<TradingCommandsView | null>(null)
const drafts = ref<Record<string, CommandDraft>>({})
const active = ref(''), variant = ref('main')
const loading = ref(false), saving = ref(false), loadError = ref(''), requestError = ref(''), notice = ref('')
const previewText = ref('正在生成示例预览…')
let generation = 0, previewRequest = 0
let previewTimer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<string, { fingerprint: string; key: string }>()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const fingerprint = (value: CommandDraft) => JSON.stringify({ keyword: value.keyword,
  templates: Object.fromEntries(Object.entries(value.templates).sort(([a], [b]) => a.localeCompare(b))) })
const selected = computed(() => view.value?.commands.find(item => item.id === active.value))
const current = computed(() => drafts.value[active.value])
const selectedVariant = computed(() => selected.value?.variants.find(item => item.id === variant.value))
const currentText = computed(() => current.value?.templates[variant.value] ?? selectedVariant.value?.default_template ?? '')
const usage = computed(() => selected.value?.usage.startsWith(selected.value.keyword)
  ? current.value?.keyword + selected.value.usage.slice(selected.value.keyword.length) : selected.value?.usage ?? '')
function isDirty(id: string) {
  const item = view.value?.commands.find(row => row.id === id), draft = drafts.value[id]
  return Boolean(item && draft && fingerprint(draft) !== fingerprint(item))
}
const hasUnsaved = computed(() => saving.value || Boolean(view.value?.commands.some(item => isDirty(item.id))))
const entries = computed(() => (view.value?.commands ?? []).map(item => ({
  id: item.id, label: item.label, group: item.group, keyword: drafts.value[item.id]?.keyword ?? item.keyword,
  custom: (drafts.value[item.id]?.keyword ?? item.keyword) !== item.default_keyword || Boolean(Object.keys(drafts.value[item.id]?.templates ?? item.templates).length),
  dirty: isDirty(item.id),
})))

const validationError = computed(() => {
  if (!current.value || !selected.value) return ''
  const keyword = current.value.keyword.normalize('NFKC').toLocaleLowerCase()
  if (!keyword || Array.from(keyword).length > 32 || /[\s\p{Cc}\p{Cs}]/u.test(keyword)) return '触发词须为1–32个不含空白的字符'
  if (view.value?.commands.some(item => item.id !== active.value && item.keyword.normalize('NFKC').toLocaleLowerCase() === keyword)) return '触发词与其他已保存指令重复'
  for (const item of selected.value.variants) {
    const body = current.value.templates[item.id] ?? item.default_template
    if (!body.trim() || body.length > 4096) return `${item.label}：回复须为1–4096个字符`
    const allowed = new Set(item.variables.map(value => value.key))
    let invalid: string | null = null
    const rest = body.replace(/\{\{|\}\}/g, '').replace(/\{([^{}]*)\}/g, (_all, key: string) => {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !allowed.has(key)) invalid = key || '（空变量）'
      return ''
    })
    if (invalid !== null) return `${item.label}：不可用变量 ${invalid}`
    if (/[{}]/.test(rest)) return `${item.label}：变量括号不完整；显示括号请使用双括号`
  }
  return ''
})

function errorText(cause: unknown) {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail ?? (cause instanceof Error ? cause.message : null)
  if (typeof detail === 'string') {
    if (detail.includes('conflict')) return '配置已变化，请重新读取后核对草稿再保存'
    if (detail.includes('variable')) return `模板包含不可用变量：${detail.split(':').pop()}`
    if (detail.includes('keyword')) return '触发词与其他指令或表情词冲突'
    return `请求未完成：${detail}`
  }
  return cause instanceof Error ? cause.message : '请求失败，请重试'
}

async function load(preserve = false) {
  const request = ++generation
  const retained = preserve ? Object.fromEntries(Object.entries(drafts.value).filter(([id]) => isDirty(id))) : {}
  loading.value = true; loadError.value = ''; requestError.value = ''
  if (!preserve) { view.value = null; drafts.value = {}; active.value = ''; pending.clear(); notice.value = '' }
  try {
    const value = await fetchTradingCommands(props.serviceId, props.engine)
    if (request !== generation) return
    view.value = value
    drafts.value = Object.fromEntries(value.commands.map(item => [item.id, retained[item.id] ?? clone({ keyword: item.keyword, templates: item.templates })]))
    if (!value.commands.some(item => item.id === active.value)) active.value = value.commands[0]?.id ?? ''
    if (!selected.value?.variants.some(item => item.id === variant.value)) variant.value = selected.value?.variants[0]?.id ?? 'main'
    if (preserve) notice.value = '已重新读取配置，未保存的草稿已保留，请核对后保存'
    void refreshPreview()
  } catch (cause) { if (request === generation) loadError.value = errorText(cause) }
  finally { if (request === generation) loading.value = false }
}

function select(id: string) {
  active.value = id; variant.value = selected.value?.variants[0]?.id ?? 'main'
  notice.value = ''; requestError.value = ''
}
function setText(value: string) {
  if (!current.value) return
  if (value !== selectedVariant.value?.default_template || current.value.templates[variant.value] !== undefined) {
    current.value.templates[variant.value] = value
  }
  notice.value = ''; requestError.value = ''
}
function restore() {
  if (!selected.value) return
  drafts.value[active.value] = { keyword: selected.value.default_keyword, templates: {} }
  notice.value = '已恢复本条默认草稿，保存后生效'; requestError.value = ''
}

function useDefaultTemplate() {
  if (!current.value) return
  delete current.value.templates[variant.value]
  notice.value = ''; requestError.value = ''
}
function useCustomTemplate() {
  if (!current.value) return
  current.value.templates[variant.value] = currentText.value
  notice.value = ''; requestError.value = ''
}

async function refreshPreview() {
  if (previewTimer !== null) { clearTimeout(previewTimer); previewTimer = null }
  const request = ++previewRequest, currentGeneration = generation
  if (!current.value || !selected.value || validationError.value) { previewText.value = '修正模板后即可预览'; return }
  try {
    const value = await previewTradingCommand(props.serviceId, props.engine, active.value,
      { ...clone(current.value), variant: variant.value })
    if (request === previewRequest && currentGeneration === generation) previewText.value = value.content
  } catch (cause) {
    if (request === previewRequest && currentGeneration === generation) previewText.value = `预览失败：${errorText(cause)}`
  }
}

async function save() {
  if (!current.value || !view.value || validationError.value || saving.value || !isDirty(active.value)) return
  const id = active.value, payload = clone(current.value), version = view.value.row_version
  const request = generation, snapshot = fingerprint(payload), keyFingerprint = JSON.stringify({ version, payload })
  if (pending.get(id)?.fingerprint !== keyFingerprint) pending.set(id, { fingerprint: keyFingerprint, key: crypto.randomUUID() })
  saving.value = true; requestError.value = ''; notice.value = ''
  try {
    const result = await saveTradingCommand(props.serviceId, props.engine, id, payload, version, pending.get(id)!.key)
    if (request !== generation) return
    const saved = result.commands.find(item => item.id === id)
    if (!saved) throw new Error('保存结果缺少当前指令，请重新读取')
    view.value.row_version = result.row_version; view.value.mapping_version = result.mapping_version
    view.value.synchronized = result.synchronized
    view.value.commands = view.value.commands.map(item => item.id === id ? clone(saved) : item)
    if (drafts.value[id] && fingerprint(drafts.value[id]!) === snapshot) drafts.value[id] = clone({ keyword: saved.keyword, templates: saved.templates })
    pending.delete(id)
    if (active.value === id) notice.value = result.synchronized ? '当前指令已保存并应用' : '当前指令已保存，等待服务同步'
    emit('saved', result)
  } catch (cause) { if (request === generation) requestError.value = errorText(cause) }
  finally { if (request === generation) saving.value = false }
}

function beforeUnload(event: BeforeUnloadEvent) { if (hasUnsaved.value) { event.preventDefault(); event.returnValue = '' } }
watch(() => [props.serviceId, props.engine], () => { void load() }, { immediate: true })
watch(() => props.revision, value => { if (view.value && value > view.value.row_version) view.value.row_version = value })
watch(() => JSON.stringify([active.value, variant.value, current.value]), () => {
  previewRequest++
  if (previewTimer !== null) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { void refreshPreview() }, 200)
})
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { generation++; previewRequest++; if (previewTimer !== null) clearTimeout(previewTimer); window.removeEventListener('beforeunload', beforeUnload) })
defineExpose({ hasUnsaved })
</script>

<template>
  <section class="reply-editor-container" data-section="command-replies">
    <p class="reply-editor-intro">按指令设置触发词与回复内容。未自定义的指令使用默认模板。</p>
    <p v-if="loadError || requestError" class="reply-request-error" role="alert">{{ loadError || requestError }} <button type="button" data-action="reload-replies" @click="load(true)">重新读取（保留草稿）</button></p>
    <p v-if="loading && !view">正在读取指令…</p>
    <CommandReplyLayout v-if="selected && current" :entries="entries" :active="active" :title="selected.label"
      :description="selected.description" :keyword="current.keyword" :usage="usage" :variants="selected.variants"
      :variant="variant" :template="currentText" :variables="selectedVariant?.variables ?? []" :preview="previewText"
      :custom-template="current.templates[variant] !== undefined"
      :preview-command="current.keyword" :chart="selected.id === 'chart' || selected.id === 'f_chart'" :dirty="isDirty(active)"
      :busy="saving || loading" :error="validationError" :notice="notice" :sync="view?.synchronized ? '当前配置已同步' : '等待服务同步'"
      @select="select" @variant="variant = $event" @keyword="current.keyword = $event; requestError = ''; notice = ''"
      @template="setText" @template-default="useDefaultTemplate" @template-custom="useCustomTemplate" @restore="restore" @save="save" />
  </section>
</template>

<style scoped>
.reply-editor-container { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; container-type:inline-size; padding:0 var(--reply-gutter-right,20px) 0 var(--reply-gutter-left,26px); }
.reply-editor-intro { color:var(--muted); margin:0; height:42px; flex:none; display:flex; align-items:center; padding-right:80px; font-size:13px; }
.reply-request-error { color:var(--danger,#c24145); padding:10px; border:1px solid currentColor; border-radius:6px; }
.reply-request-error button { color:inherit; border:0; background:none; text-decoration:underline; cursor:pointer; }
</style>
