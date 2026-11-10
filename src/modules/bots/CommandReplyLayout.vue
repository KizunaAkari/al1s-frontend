<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'

type CommandEntry = {
  id: string
  label: string
  group: string
  keyword: string
  custom: boolean
  dirty: boolean
}

type CommandVariant = { id: string; label: string }
type CommandVariable = { key: string; label: string; example: string }
type HighlightPart = { text: string; variable: boolean }

const props = withDefaults(defineProps<{
  entries: CommandEntry[]
  active: string
  title: string
  description: string
  keyword: string
  usage: string
  variants: CommandVariant[]
  variant: string
  template: string
  variables: CommandVariable[]
  preview: string
  previewCommand: string
  chart: boolean
  customTemplate?: boolean
  dirty: boolean
  busy: boolean
  error: string
  notice: string
  sync: string
}>(), { customTemplate: false })

const emit = defineEmits<{
  select: [id: string]
  variant: [id: string]
  keyword: [value: string]
  template: [value: string]
  templateDefault: []
  templateCustom: []
  restore: []
  save: []
}>()

const search = ref('')
const variableSearch = ref('')
const groupOverrides = ref<Record<string, boolean>>({})
const templateField = ref<HTMLTextAreaElement | null>(null)
const highlightField = ref<HTMLElement | null>(null)

const activeEntry = computed(() => props.entries.find(entry => entry.id === props.active))
const activeGroup = computed(() => activeEntry.value?.group ?? '')
const customCount = computed(() => props.entries.filter(entry => entry.custom).length)
const filteredVariables = computed(() => {
  const query = variableSearch.value.trim().toLocaleLowerCase()
  return props.variables.filter(item => `${item.label} ${item.key}`.toLocaleLowerCase().includes(query))
})
watch(() => [props.active, props.variant], () => { variableSearch.value = '' })

const groupOrder: Record<string, number> = { 现货: 0, A股: 0, 合约: 1, 通用: 2 }
const entryOrders: Record<string, number> = {
  open: 0, buy: 1, sell: 2, balance: 3, positions: 4, orders: 5, chart: 6, backtest: 6, deposit: 7,
  f_open: 0, long: 1, short: 2, close: 3, f_balance: 4, f_positions: 5, f_orders: 6, f_chart: 7, f_deposit: 8, f_margin: 9,
  help: 0,
}

function groupRank(group: string) { return groupOrder[group] ?? 50 }
function entryRank(entry: CommandEntry) { return entryOrders[entry.id] ?? 100 }

const groupedEntries = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  const groups = new Map<string, { entry: CommandEntry; index: number }[]>()
  props.entries.forEach((entry, index) => {
    const searchable = `${entry.label} ${entry.keyword}`.toLocaleLowerCase()
    if (query && !searchable.includes(query)) return
    const group = groups.get(entry.group) ?? []
    group.push({ entry, index })
    groups.set(entry.group, group)
  })
  return Array.from(groups, ([label, values]) => ({
    label,
    entries: values.sort((left, right) => entryRank(left.entry) - entryRank(right.entry) || left.index - right.index).map(value => value.entry),
  })).sort((left, right) => groupRank(left.label) - groupRank(right.label) || left.label.localeCompare(right.label))
})

const displayTitle = computed(() => props.title.replace(/^(现货|合约)\s*/, ''))
const marketLabel = computed(() => activeGroup.value)

const highlightParts = computed<HighlightPart[]>(() => {
  const source = props.template
  const parts: HighlightPart[] = []
  const pattern = /\{[a-z][a-z0-9_]*\}/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (source[match.index - 1] === '{' || source[match.index + match[0].length] === '}') continue
    if (match.index > cursor) parts.push({ text: source.slice(cursor, match.index), variable: false })
    parts.push({ text: match[0], variable: true })
    cursor = match.index + match[0].length
  }
  if (cursor < source.length || !parts.length) parts.push({ text: source.slice(cursor), variable: false })
  return parts
})

function isGroupExpanded(group: string) {
  if (search.value.trim()) return true
  if (groupOverrides.value[group] !== undefined) return groupOverrides.value[group]
  return group === activeGroup.value
}

function toggleGroup(group: string) {
  groupOverrides.value[group] = !isGroupExpanded(group)
}

function inputValue(event: Event) {
  emit('keyword', (event.target as HTMLInputElement).value)
}

function selectVariant(event: Event) {
  emit('variant', (event.target as HTMLSelectElement).value)
}

function inputTemplate(event: Event) {
  emit('template', (event.target as HTMLTextAreaElement).value)
}

function syncTemplateScroll(event: Event) {
  const field = event.target as HTMLTextAreaElement
  if (!highlightField.value) return
  highlightField.value.scrollTop = field.scrollTop
  highlightField.value.scrollLeft = field.scrollLeft
}

function restoreTemplateScroll() {
  if (!templateField.value || !highlightField.value) return
  highlightField.value.scrollTop = templateField.value.scrollTop
  highlightField.value.scrollLeft = templateField.value.scrollLeft
}

function insertVariable(key: string) {
  const field = templateField.value
  const source = props.template
  const start = field?.selectionStart ?? source.length
  const end = field?.selectionEnd ?? start
  const token = `{${key}}`
  const value = `${source.slice(0, start)}${token}${source.slice(end)}`
  emit('template', value)
  const cursor = start + token.length
  void nextTick(() => {
    const current = templateField.value
    if (!current) return
    current.focus()
    current.setSelectionRange(cursor, cursor)
    restoreTemplateScroll()
  })
}

function selectCustomTemplate() {
  emit('templateCustom')
  void nextTick(() => templateField.value?.focus())
}

watch(() => props.template, () => { void nextTick(restoreTemplateScroll) })
</script>

<template>
  <section class="command-reply-layout" aria-label="指令与回复编辑">
    <aside class="reply-command-sidebar" aria-label="指令列表">
      <div class="reply-sidebar-heading">
        <h2>全部指令</h2>
        <span class="reply-count-square">{{ props.entries.length }}</span>
      </div>
      <input v-model="search" class="reply-search" data-field="command-search" aria-label="搜索指令" type="search" placeholder="搜索名称或触发词">
      <div class="reply-groups">
        <section v-for="group in groupedEntries" :key="group.label" class="reply-group" :data-group="group.label">
          <button class="reply-group-heading" type="button" :aria-expanded="isGroupExpanded(group.label)" @click="toggleGroup(group.label)">
            <span>{{ group.label }}</span>
            <span class="reply-group-meta"><span data-group-count>{{ group.entries.length }}</span><span aria-hidden="true">{{ isGroupExpanded(group.label) ? '⌃' : '›' }}</span></span>
          </button>
          <div v-show="isGroupExpanded(group.label)" class="reply-entry-list">
            <button v-for="entry in group.entries" :key="entry.id" class="reply-entry" :class="{ active: props.active === entry.id }" :data-entry="entry.id" type="button" :aria-current="props.active === entry.id ? 'true' : undefined" @click="emit('select', entry.id)">
              <span class="reply-entry-label">{{ entry.label.replace(/^(现货|合约)\s*/, '') }}</span>
              <span class="reply-entry-keyword">{{ entry.keyword }}</span>
              <span class="reply-entry-state" :class="{ custom: entry.custom }">{{ entry.custom ? '自定义' : '默认' }}</span>
              <span v-if="entry.dirty" data-dirty-marker class="reply-dirty-marker" aria-label="未保存"></span>
            </button>
          </div>
        </section>
        <p v-if="!groupedEntries.length" class="reply-empty">没有匹配的指令</p>
      </div>
      <p class="reply-custom-count">{{ customCount }} 条指令已自定义</p>
    </aside>

    <main class="reply-command-editor">
      <header class="reply-editor-heading">
        <div>
          <div class="reply-title-line"><h3>{{ displayTitle }}</h3><span class="reply-market-pill">{{ marketLabel }}</span></div>
          <p class="reply-description">{{ props.description }}</p>
        </div>
      </header>

      <div class="reply-editor-scroll">
        <div class="reply-keyword-row"><label class="reply-field reply-keyword-field">
          <span>触发指令</span>
          <input :value="props.keyword" data-field="keyword" @input="inputValue">
        </label>
        <label v-if="props.variants.length > 1" class="reply-variant-field">
          <span>结果</span>
          <select :value="props.variant" data-field="variant" aria-label="结果" @change="selectVariant">
            <option v-for="item in props.variants" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>
        </div>
        <p class="reply-usage"><span>用法：</span>{{ props.usage }}</p>
        <hr class="reply-divider">

        <div class="reply-template-heading">
          <h2>回复模板</h2>
          <div class="reply-template-actions">
            <button :class="{ selected: !props.customTemplate }" data-action="template-default" type="button" @click="emit('templateDefault')">默认模板</button>
            <button :class="{ selected: props.customTemplate }" data-action="template-custom" type="button" @click="selectCustomTemplate">自定义</button>
            <button class="reply-restore-link" data-action="restore-command-reply" type="button" @click="emit('restore')">恢复默认</button>
          </div>
        </div>



        <p class="reply-template-description">编辑文字与换行，变量会在回复时替换为实际内容。</p>
        <label class="reply-template-label">
          <span class="sr-only">回复模板文字</span>
          <div class="reply-template-shell">
            <pre ref="highlightField" class="reply-template-highlight" data-template-highlight aria-hidden="true"><template v-for="(part, index) in highlightParts" :key="`${index}-${part.text}`"><span v-if="part.variable" data-variable-token class="reply-template-variable">{{ part.text }}</span><span v-else>{{ part.text }}</span></template></pre>
            <textarea ref="templateField" class="reply-template-input" :value="props.template" data-field="template" rows="8" @input="inputTemplate" @scroll="syncTemplateScroll"></textarea>
          </div>
        </label>

        <div class="reply-variable-panel">
          <div class="reply-variable-heading"><h3>可用变量</h3><input v-model="variableSearch" data-field="variable-search" type="search" aria-label="过滤变量" placeholder="过滤变量"></div>
          <div class="reply-variable-list">
            <button v-for="item in filteredVariables" :key="item.key" class="reply-variable" :data-variable="item.key" type="button" :title="`${item.label} · {${item.key}} · 示例：${item.example}`" @mousedown.prevent @click="insertVariable(item.key)">{{ item.label }}</button>
          </div>
          <p v-if="!filteredVariables.length" class="reply-empty">没有匹配的变量</p>
        </div>


      </div>
        <div v-if="props.error" class="reply-validation reply-error" role="alert">{{ props.error }}</div>
        <div v-else class="reply-validation reply-valid" data-template-valid><span aria-hidden="true">✓</span> 模板变量有效</div>
    </main>

    <aside class="reply-command-preview" aria-label="回复预览">
      <header class="reply-preview-header">
        <h2>回复预览</h2>
        <span class="reply-example-badge" data-preview="example">示例数据</span>
      </header>
      <div class="reply-preview-chat">
        <div class="reply-preview-outgoing"><span class="reply-command-bubble">{{ props.previewCommand }}</span><span class="reply-user-avatar" aria-label="示例用户"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg></span></div>
        <div class="reply-preview-incoming">
          <BotBrandIcon kind="qq" />
          <div class="reply-preview-bot-content">
            <span class="reply-bot-name">QQbot</span>
            <div class="reply-preview-bubble"><p class="reply-preview-text" data-preview="message">{{ props.preview }}</p></div>
          </div>
        </div>
        <div v-if="props.chart" class="reply-chart-placeholder" data-preview="chart" role="img" aria-label="示例图片占位">示例图片占位</div>
        <div class="reply-preview-footnote"><p>ⓘ　使用示例数据，仅预览，不发送消息。</p><p>变量内容随指令结果更新</p></div>
      </div>
    </aside>

    <footer class="reply-command-footer">
      <div class="reply-footer-copy">
        <span class="reply-status-dot" :class="{ dirty: props.dirty }" aria-hidden="true"></span>
        <strong>{{ displayTitle }}</strong>
        <span>{{ props.dirty ? '有未保存更改' : '没有未保存更改' }}</span>
        <span v-if="props.error" class="reply-error" role="alert">{{ props.error }}</span>
        <span v-else-if="props.notice" class="reply-notice" role="status">{{ props.notice }}</span>
      </div>
      <div class="reply-footer-actions">
        <span class="reply-footer-scope">仅影响「{{ displayTitle }}」指令</span>
        <span v-if="props.sync && !props.sync.includes('已同步')" class="reply-sync">{{ props.sync }}</span>
        <button class="reply-save" data-action="save-command-reply" type="button" :disabled="props.busy || !props.dirty || Boolean(props.error)" @click="emit('save')">{{ props.busy ? '保存中…' : '保存当前指令' }}</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.command-reply-layout { --reply-accent:var(--accent,#1685f8); --reply-text:var(--text,#102747); --reply-soft:var(--surface-soft,#f1f7fd); --reply-border:var(--border,#dbe8f5); --reply-muted:var(--muted,#6e819c); --reply-green:#16a36a; --reply-amber:#f5a623; display:grid; grid-template-columns:272px minmax(0,1.3fr) minmax(0,1fr); grid-template-rows:minmax(0,1fr) 60px; grid-template-areas:'sidebar editor preview' 'footer footer footer'; gap:12px; width:100%; height:100%; min-height:0; flex:1 1 auto; color:var(--reply-text); }
.reply-command-sidebar,.reply-command-editor,.reply-command-preview { min-width:0; min-height:0; border:1px solid var(--reply-border); border-radius:8px; background:var(--surface,#fff); overflow:hidden; }
.reply-command-sidebar { grid-area:sidebar; display:flex; flex-direction:column; padding:14px; }
.reply-command-editor { grid-area:editor; display:flex; flex-direction:column; padding:16px 14px 14px; }
.reply-command-preview { grid-area:preview; display:flex; flex-direction:column; padding:0; }
.reply-command-footer { grid-area:footer; min-width:0; height:60px; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; gap:16px; margin-left:calc(-1 * var(--reply-gutter-left,26px)); margin-right:calc(-1 * var(--reply-gutter-right,20px)); padding:0 var(--reply-gutter-right,20px) 0 var(--reply-gutter-left,26px); border:1px solid var(--reply-border); border-radius:8px; background:var(--surface,#fff); }
.reply-sidebar-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 12px; }
.reply-sidebar-heading h2,.reply-preview-header h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.reply-count-square { min-width:26px; padding:4px 7px; border-radius:5px; color:var(--reply-muted); background:var(--reply-soft); text-align:center; font-size:12px; }
.reply-search { box-sizing:border-box; width:100%; height:34px; margin:0 0 12px; padding:7px 10px; border:1px solid var(--reply-border); border-radius:5px; color:var(--reply-text); background:var(--surface,#fff); font:inherit; font-size:12px; }
.reply-search:focus-visible,.reply-field input:focus-visible,.reply-variant-field select:focus-visible,.reply-template-input:focus-visible,.command-reply-layout button:focus-visible { outline:2px solid var(--reply-accent); outline-offset:2px; }
.reply-groups { min-height:0; flex:1 1 auto; overflow-y:auto; padding-right:2px; }
.reply-group { min-width:0; margin-bottom:8px; }
.reply-group-heading { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:36px; padding:8px 10px; border:0; border-radius:5px; color:var(--reply-text); background:var(--reply-soft); cursor:pointer; font:inherit; font-size:13px; font-weight:700; text-align:left; }
.reply-group-meta { display:flex; align-items:center; gap:8px; color:var(--reply-muted); font-size:12px; }
.reply-entry-list { display:grid; gap:2px; margin-top:3px; }
.reply-entry { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,.75fr) auto auto; align-items:center; gap:6px; width:100%; min-height:38px; box-sizing:border-box; padding:6px 10px; border:1px solid transparent; border-left:3px solid transparent; border-radius:5px; color:var(--reply-text); background:transparent; cursor:pointer; font:inherit; text-align:left; }
.reply-entry:hover { background:var(--reply-soft); }
.reply-entry.active { border-color:#cce4fb; border-left-color:var(--reply-accent); background:linear-gradient(90deg,#eaf4ff,#f8fbff); color:var(--reply-accent); }
.reply-entry-label,.reply-entry-keyword { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.reply-entry-keyword { color:var(--reply-muted); font-size:11px; }
.reply-entry-state { padding:3px 6px; border-radius:4px; color:#91a3b8; background:var(--reply-soft); font-size:11px; white-space:nowrap; }
.reply-entry-state.custom { color:var(--reply-green); background:#e9f8f0; }
.reply-dirty-marker { width:8px; height:8px; border-radius:50%; background:var(--reply-amber); }
.reply-empty,.reply-custom-count { margin:0; color:var(--reply-muted); font-size:12px; }
.reply-custom-count { flex:none; padding:12px 2px 0; }
.reply-editor-heading { flex:none; }
.reply-title-line { display:flex; align-items:center; gap:9px; min-width:0; }
.reply-title-line h3 { margin:0; font-size:24px; line-height:1.15; letter-spacing:-.03em; }
.reply-market-pill { display:inline-flex; align-items:center; min-height:24px; padding:3px 9px; border-radius:5px; color:var(--reply-accent); background:var(--reply-soft); font-size:12px; white-space:nowrap; }
.reply-description { margin:6px 0 0; color:var(--reply-muted); font-size:13px; line-height:1.4; }
.reply-editor-scroll { min-height:0; flex:1 1 auto; overflow-y:auto; padding:12px 0 0; }
.reply-field,.reply-variant-field { display:grid; gap:5px; min-width:0; font-size:13px; }
.reply-field input { box-sizing:border-box; width:100%; height:34px; padding:7px 10px; border:1px solid var(--reply-border); border-radius:5px; color:var(--reply-text); background:var(--surface,#fff); font:inherit; }
.reply-usage { margin:6px 0 0; color:var(--reply-muted); font-size:12px; line-height:1.4; }
.reply-usage span { color:var(--reply-text); }
.reply-divider { height:1px; margin:12px 0 10px; border:0; background:var(--reply-border); }
.reply-template-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.reply-template-heading h2 { margin:0; font-size:17px; }
.reply-template-description { margin:4px 0 0; color:var(--reply-muted); font-size:12px; line-height:18px; }
.reply-template-actions { display:flex; align-items:center; gap:4px; flex-wrap:nowrap; justify-content:flex-end; flex:none; }
.reply-template-actions button { border:1px solid transparent; border-radius:5px; padding:7px 9px; color:var(--reply-muted); background:transparent; cursor:pointer; font:inherit; font-size:12px; white-space:nowrap; }
.reply-template-actions button.selected { border-color:#c8e1fb; color:var(--reply-accent); background:var(--reply-soft); }
.reply-template-actions .reply-restore-link { padding-right:0; color:var(--reply-accent); }
.reply-variant-field { display:flex; align-items:center; gap:8px; margin:0; color:var(--reply-muted); font-size:12px; }
.reply-variant-field select { height:20px; padding:1px 7px; border:1px solid var(--reply-border); border-radius:5px; color:var(--reply-text); background:var(--surface,#fff); font:inherit; }
.reply-template-label { display:block; margin-top:8px; }
.reply-template-shell { position:relative; min-height:180px; border:1px solid var(--reply-border); border-radius:6px; background:var(--surface,#fff); overflow:hidden; }
.reply-template-highlight,.reply-template-input { box-sizing:border-box; width:100%; min-height:178px; margin:0; padding:11px 12px; border:0; font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif; white-space:pre-wrap; overflow-wrap:anywhere; }
.reply-template-highlight { position:absolute; inset:0; overflow:auto; color:var(--reply-text); pointer-events:none; }
.reply-template-variable { color:var(--reply-accent); }
.reply-template-input { height:178px; position:relative; display:block; resize:vertical; overflow:auto; color:transparent; caret-color:var(--reply-text); background:transparent; outline:none; }
.reply-template-input::selection { color:transparent; background:#b9d9fb; }
.reply-variable-panel { display:grid; gap:4px; margin-top:12px; }
.reply-variable-heading { display:flex; align-items:baseline; gap:8px; }
.reply-variable-heading h3 { margin:0; font-size:13px; }
.reply-variable-heading span { color:var(--reply-muted); font-size:12px; }
.reply-variable-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(88px,1fr)); gap:6px; max-height:100px; overflow-y:auto; align-content:start; }
.reply-variable { min-height:30px; padding:5px 7px; border:1px solid var(--reply-border); border-radius:5px; color:var(--reply-text); background:var(--surface,#fff); cursor:pointer; font:inherit; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.reply-variable:hover { border-color:var(--reply-accent); color:var(--reply-accent); background:var(--reply-soft); }
.reply-validation { flex:none; display:flex; align-items:center; gap:5px; min-height:20px; margin-top:10px; font-size:12px; }
.reply-valid { color:var(--reply-green); }
.reply-error { color:var(--danger,#c24145); overflow-wrap:anywhere; }
.reply-preview-header { display:flex; align-items:center; justify-content:space-between; flex:none; height:52px; box-sizing:border-box; padding:0 16px; border-bottom:1px solid var(--reply-border); background:var(--surface,#fff); }
.reply-example-badge { padding:5px 8px; border-radius:5px; color:var(--reply-muted); background:var(--reply-soft); font-size:11px; white-space:nowrap; }
.reply-preview-chat { min-height:0; flex:1 1 auto; display:flex; flex-direction:column; overflow-y:auto; padding:20px 16px 14px; background:linear-gradient(180deg,#f4f9ff 0%,#eef5fc 100%); }
.reply-preview-outgoing { display:flex; align-items:center; justify-content:flex-end; gap:12px; margin-bottom:24px; }
.reply-command-bubble { max-width:78%; padding:14px 16px; border-radius:9px 9px 3px 9px; color:#163f6d; background:#c5e4ff; font-size:16px; line-height:20px; overflow-wrap:anywhere; }
.reply-user-avatar { display:grid; place-items:center; width:40px; height:40px; border-radius:50%; color:#4e9be9; background:#cfe8ff; font-size:14px; }
.reply-preview-incoming { display:flex; align-items:flex-start; gap:18px; }
.reply-preview-incoming :deep(.bot-brand-icon) { width:32px; height:32px; }
.reply-preview-bot-content { min-width:0; flex:0 1 250px; max-width:250px; }
.reply-bot-name { display:block; margin:2px 0 7px -15px; color:var(--reply-muted); font-size:12px; }
.reply-preview-bubble { max-width:100%; box-sizing:border-box; padding:12px 13px; border:1px solid #e1ebf5; border-radius:3px 8px 8px 8px; background:#fff; box-shadow:0 2px 6px rgba(35,83,130,.04); }
.reply-preview-text { margin:0; color:#102747; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.55; }
.reply-chart-placeholder { display:grid; place-items:center; min-height:130px; margin:14px 0 0 42px; border:1px dashed var(--reply-border); border-radius:6px; color:var(--reply-muted); background:rgba(255,255,255,.6); font-size:12px; }
.reply-preview-footnote { margin-top:auto; padding-top:14px; border-top:1px solid var(--reply-border); color:var(--reply-muted); font-size:12px; line-height:1.6; }
.reply-preview-footnote p { margin:0; }
.reply-footer-copy { display:flex; align-items:center; gap:8px; min-width:0; font-size:13px; }
.reply-footer-copy strong { white-space:nowrap; }
.reply-footer-copy>span:not(.reply-status-dot):not(.reply-error):not(.reply-notice) { color:var(--reply-muted); white-space:nowrap; }
.reply-status-dot { width:11px; height:11px; border-radius:50%; background:#aab8c8; }
.reply-status-dot.dirty { background:var(--reply-amber); }
.reply-footer-actions { display:flex; align-items:center; justify-content:flex-end; gap:12px; min-width:0; }
.reply-footer-scope,.reply-sync { color:var(--reply-muted); font-size:12px; white-space:nowrap; }
.reply-save { border:1px solid var(--reply-accent); border-radius:5px; padding:9px 14px; color:#fff; background:var(--reply-accent); cursor:pointer; font:inherit; font-size:13px; white-space:nowrap; }
.reply-save:disabled { cursor:not-allowed; opacity:.55; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@container (max-width:980px) { .command-reply-layout { height:auto; min-height:0; grid-template-columns:1fr; grid-template-rows:auto auto auto 60px; grid-template-areas:'sidebar' 'editor' 'preview' 'footer'; overflow:visible; } .reply-command-sidebar,.reply-command-editor,.reply-command-preview { min-height:320px; overflow:visible; } .reply-groups,.reply-editor-scroll,.reply-preview-chat { overflow:visible; } .reply-command-footer { height:60px; margin-left:calc(-1 * var(--reply-gutter-left,26px)); margin-right:calc(-1 * var(--reply-gutter-right,20px)); } }
@container (max-width:650px) { .reply-template-heading { align-items:flex-start; flex-direction:column; } .reply-footer-copy,.reply-footer-actions { flex-wrap:wrap; } .reply-command-footer { height:auto; min-height:60px; padding-top:10px; padding-bottom:10px; align-items:flex-start; flex-direction:column; } .reply-footer-actions { width:100%; justify-content:space-between; } }
.reply-user-avatar svg { width:19px; height:19px; fill:currentColor; }
.reply-keyword-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-items:end; }
.reply-keyword-row .reply-variant-field { display:grid; gap:5px; color:var(--reply-text); font-size:13px; }
.reply-keyword-row .reply-variant-field select { width:100%; height:34px; padding:7px 10px; }
.reply-template-input { height:clamp(220px, 28vh, 320px); min-height:220px; }
.reply-template-highlight { height:100%; }
.reply-variable-heading input { min-width:0; flex:1; height:32px; padding:6px 9px; border:1px solid var(--reply-border); border-radius:5px; color:var(--reply-text); background:var(--surface,#fff); font:inherit; font-size:12px; }
@container(max-width:650px) { .reply-keyword-row { grid-template-columns:1fr; } }
.reply-usage-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:6px; }
.reply-usage-row .reply-usage { margin:0; }
@container(max-width:650px) { .reply-usage-row { flex-wrap:wrap; } .reply-template-actions { flex-wrap:wrap; } }
</style>
