<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as api from '../../../shared/api/memes'
import type { MemeRecord } from '../../../shared/api/memes'
import MemeTemplateEditor from './MemeTemplateEditor.vue'

const rows = ref<MemeRecord[]>([]), cursor = ref<string | null>(null)
const editing = ref<MemeRecord | null | undefined>(undefined)
const editor = ref<InstanceType<typeof MemeTemplateEditor> | null>(null)
const editorKey = ref('initial')
const error = ref(''), loading = ref(false), changing = ref(false)
let generation = 0, destroyed = false, userPicked = false
const pending = new Map<string, { fingerprint: string; key: string }>()
async function load(more = false) {
  const current = ++generation
  loading.value = true; error.value = ''
  try {
    const page = await api.fetchTemplates(more ? cursor.value ?? undefined : undefined)
    if (destroyed || current !== generation) return
    rows.value = more ? [...rows.value, ...page.items] : page.items
    cursor.value = page.next_cursor
    if (!userPicked && editing.value === undefined && rows.value[0]) editing.value = rows.value[0]
  } catch (cause) { if (!destroyed && current === generation) error.value = cause instanceof Error ? cause.message : '读取模板失败' }
  finally { if (!destroyed && current === generation) loading.value = false }
}
function saved(value: MemeRecord) {
  const index = rows.value.findIndex(row => row.id === value.id)
  if (index < 0) rows.value.unshift(value); else rows.value[index] = value
  editing.value = value; pending.delete(value.id)
}
function select(value: MemeRecord | null | undefined) {
  if (editor.value?.busy || editor.value?.uploading || changing.value) {
    error.value = '正在保存或上传，请稍候再切换模板。'; return
  }
  if (editor.value?.dirty && !window.confirm('切换会丢弃未保存的模板修改，是否继续？')) return
  userPicked = true
  editorKey.value = crypto.randomUUID()
  editing.value = value
}
async function toggle(row: MemeRecord) {
  if (changing.value || editor.value?.busy || editor.value?.uploading) return
  if (editing.value?.id === row.id && editor.value?.dirty) {
    error.value = '当前模板有未保存修改，请先保存后启停。'; return
  }
  const body = api.templateBody({ ...row, enabled: !row.enabled })
  const fingerprint = JSON.stringify(body)
  let operation = pending.get(row.id)
  if (!operation || operation.fingerprint !== fingerprint) {
    operation = { fingerprint, key: crypto.randomUUID() }; pending.set(row.id, operation)
  }
  changing.value = true; error.value = ''
  try {
    const value = await api.saveTemplate(row.id, body, row.row_version, operation.key)
    if (!destroyed) {
      const index = rows.value.findIndex(item => item.id === value.id)
      if (index >= 0) rows.value[index] = value
      if (editing.value?.id === value.id) editing.value = value
      pending.delete(value.id)
    }
  } catch (cause) { if (!destroyed) error.value = cause instanceof Error ? cause.message : '设置失败，请核对后重试' }
  finally { if (!destroyed) changing.value = false }
}
async function remove(row: MemeRecord) {
  if (row.builtin || changing.value || editor.value?.busy || editor.value?.uploading || !window.confirm(`删除“${row.name}”？删除后不能再调用此模板，共用素材会继续保留。`)) return
  changing.value = true; error.value = ''
  try {
    const key = pending.get(`delete:${row.id}`)?.key ?? crypto.randomUUID()
    pending.set(`delete:${row.id}`, { fingerprint: String(row.row_version), key })
    await api.deleteTemplate(row, key)
    if (!destroyed) { rows.value = rows.value.filter(value => value.id !== row.id); if (editing.value?.id === row.id) editing.value = undefined }
  } catch (cause) { if (!destroyed) error.value = cause instanceof Error ? cause.message : '删除失败' }
  finally { if (!destroyed) changing.value = false }
}
onMounted(() => void load())
onBeforeUnmount(() => { destroyed = true; ++generation })
</script>

<template>
  <section class="workshop">
    <header class="workshop-heading"><div><h2>表情包工坊</h2><p>QQ 与 Discord 共用模板；群、频道和私聊范围在各自连接中配置。</p></div><div class="workshop-actions"><button type="button" :disabled="loading" @click="load()">刷新</button><button type="button" class="primary" data-action="create-template" @click="select(null)">新建模板</button></div></header>
    <p class="workshop-help">表情外发全局间隔：Discord 10 秒一次、QQ 30 秒一次。结果、用法和错误回复共用名额；预览不计入。</p>
    <p v-if="error" class="workshop-error">{{ error }}</p>
    <div class="workshop-grid">
      <aside class="template-list" aria-label="表情操作与模板">
        <article v-for="row in rows" :key="row.id" class="template-card" :class="{ selected: editing?.id === row.id, disabled: !row.enabled }">
          <button class="template-select" type="button" @click="select(row)"><span class="template-symbol">{{ row.layout.engine === 'petpet' ? '摸' : row.layout.engine === 'caption' ? '字' : '图' }}</span><span><strong>{{ row.name }}</strong><small>{{ row.keyword }} · {{ row.layout.engine === 'petpet' ? 'GIF' : 'PNG' }}</small><small>{{ row.builtin ? '预设操作' : '自定义模板' }} · {{ row.enabled ? '已启用' : '已停用' }}</small></span></button>
          <div class="card-actions"><button type="button" :disabled="changing" @click="toggle(row)">{{ row.enabled ? '停用' : '启用' }}</button><button v-if="!row.builtin" type="button" :disabled="changing" @click="remove(row)">删除</button><span v-if="row.random_enabled">参与随机</span></div>
        </article>
        <p v-if="!rows.length" class="empty">{{ loading ? '正在读取模板…' : '暂无模板，可以上传底图创建一个。' }}</p>
        <button v-if="cursor" type="button" :disabled="loading" @click="load(true)">加载更多</button>
        <p class="workshop-help">聊天指令：摸摸 @某人、头像合成 模板关键词 @某人、配字 文字 + 图片、随机表情、表情列表。</p>
      </aside>
      <MemeTemplateEditor v-if="editing !== undefined" :key="editorKey" ref="editor" :template="editing" :locked="changing" @saved="saved" @close="select(undefined)" />
      <div v-else class="empty">选择一个操作查看效果，或创建自己的合成模板。</div>
    </div>
  </section>
</template>

<style scoped>
.workshop { min-width: 0; }.workshop-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 14px 0; }.workshop-heading h2 { margin: 0; font-size: 18px; }.workshop-heading p,.workshop-help { color: var(--text-secondary,#738095); font-size: 12px; line-height: 1.6; }
.workshop-actions,.card-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }button { border: 1px solid var(--border,#d8dfe8); border-radius: 6px; padding: 7px 10px; background: var(--surface,white); color: inherit; cursor: pointer; }button:disabled { opacity: .5; }.primary { background: #426ad7; color: white; border-color: #426ad7; }
.workshop-grid { display: grid; grid-template-columns: minmax(210px, 270px) minmax(0, 1fr); gap: 16px; align-items: start; }.template-list { min-width: 0; }.template-card { padding: 10px; border: 1px solid var(--border,#dbe2eb); border-radius: 10px; margin-bottom: 10px; background: var(--surface,white); }.template-card.selected { border-color: #426ad7; box-shadow: 0 0 0 1px #426ad72b; }.template-card.disabled { opacity: .72; }
.template-select { display: flex; gap: 10px; align-items: center; border: 0; text-align: left; width: 100%; padding: 0 0 9px; }.template-symbol { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 10px; background: #426ad716; color: #426ad7; font-size: 20px; }.template-select strong,.template-select small { display: block; overflow-wrap: anywhere; }.template-select small,.card-actions span { font-size: 11px; color: var(--text-secondary,#738095); margin-top: 3px; }.card-actions button { font-size: 12px; padding: 4px 8px; }.empty { padding: 24px; text-align: center; color: var(--text-secondary,#738095); }.workshop-error { color: #ba4343; overflow-wrap: anywhere; }
@media(max-width: 900px) { .workshop-grid { grid-template-columns: minmax(0, 1fr); }.template-list { display: flex; gap: 10px; flex-wrap: wrap; }.template-card { flex: 1 1 200px; margin: 0; }.workshop-help { width: 100%; } }
</style>
