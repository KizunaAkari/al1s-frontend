<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { importAiStickers, manageAiSticker, previewAiSticker, type AiSticker, type AiStickerResult } from '../../../shared/api/bot-ai'

const props = defineProps<{ serviceId: string; groups: string[]; enabled: boolean; synchronized: boolean; blocked: boolean }>()
const emit = defineEmits<{ dirty: [value: boolean] }>()
const group = ref(''), result = ref<AiStickerResult | null>(null), images = ref<Record<string, string>>({})
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), offset = ref(0)
const editing = ref<AiSticker | null>(null), draft = ref({category:'', description:'', overlay_text:'', tags:'', scenes:''})
const files = ref<File[]>([]), selectedGroups = ref<string[]>([]), importing = ref(false), stopRequested = ref(false)
type ImportJob = {file: File; group: string; offset: number}
const importState = ref<{jobs: ImportJob[]; index: number; queued: number} | null>(null)
let generation = 0, savedDraft = '', disposed = false
const canUse = computed(() => props.enabled && props.synchronized && !props.blocked && Boolean(group.value))
const dirty = computed(() => Boolean(editing.value && JSON.stringify(draft.value) !== savedDraft))
watch(dirty, value => emit('dirty', value), {immediate:true})

function releaseImages() {
  for (const value of Object.values(images.value)) URL.revokeObjectURL(value)
  images.value = {}
}
async function load() {
  const token = ++generation, service = props.serviceId, currentGroup = group.value
  releaseImages(); result.value = null; error.value = ''
  if (!service || !currentGroup || !props.enabled || !props.synchronized) return
  loading.value = true
  try {
    const data = await manageAiSticker(service, {action:'list',group_id:currentGroup,offset:offset.value,limit:24})
    if (disposed || token !== generation) return
    result.value = data
    await Promise.all((data.items ?? []).map(async item => {
      try {
        const blob = await previewAiSticker(service, currentGroup, item.id)
        if (disposed || token !== generation) return
        images.value[item.id] = URL.createObjectURL(blob)
      } catch { /* A missing preview must not hide the rest of the library. */ }
    }))
  } catch { if (!disposed && token === generation) error.value = '读取图库失败，请检查 AI 配置和服务状态。' }
  finally { if (!disposed && token === generation) loading.value = false }
}
watch(() => [props.serviceId, props.groups.join(','), props.enabled, props.synchronized], () => {
  editing.value = null; importState.value = null; stopRequested.value = true
  if (!props.groups.includes(group.value)) group.value = props.groups[0] ?? ''
  selectedGroups.value = selectedGroups.value.filter(item => props.groups.includes(item))
  if (!selectedGroups.value.length && group.value) selectedGroups.value = [group.value]
  offset.value = 0
  void load()
}, {immediate:true})
onBeforeUnmount(() => { disposed = true; generation++; stopRequested.value = true; releaseImages() })

async function changeGroup() { editing.value = null; offset.value = 0; await load() }
async function edit(item: AiSticker) {
  if (!canUse.value || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const data = await manageAiSticker(props.serviceId, {action:'detail',group_id:group.value,image_id:item.id})
    if (!data.item) throw new Error('missing detail')
    editing.value = data.item
    draft.value = {category:data.item.category, description:data.item.description, overlay_text:data.item.overlay_text,
      tags:data.item.tags.join('，'), scenes:(data.item.scenes ?? []).join('\n')}
    savedDraft = JSON.stringify(draft.value)
  } catch { error.value = '读取表情详情失败，请重试。' }
  finally { busy.value = false }
}
async function save() {
  if (!editing.value || !canUse.value || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await manageAiSticker(props.serviceId, {action:'edit',group_id:group.value,image_id:editing.value.id,
      category:draft.value.category, description:draft.value.description, overlay_text:draft.value.overlay_text,
      tags:draft.value.tags.split(/[\n,，]+/).map(value=>value.trim()).filter(Boolean),
      scenes:draft.value.scenes.split('\n').map(value=>value.trim()).filter(Boolean)})
    editing.value = null; notice.value = '表情信息已保存。'; await load()
  } catch { error.value = '保存失败，请检查分类、标签和场景后重试。' }
  finally { busy.value = false }
}
async function change(item: AiSticker, action: 'enable' | 'disable' | 'delete') {
  if (!canUse.value || busy.value || editing.value) return
  if (action === 'delete' && !window.confirm('删除此群的这张表情？')) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await manageAiSticker(props.serviceId, {action,group_id:group.value,image_id:item.id})
    notice.value = action === 'delete' ? '表情已删除。' : action === 'enable' ? '表情已启用。' : '表情已禁用。'
    await load()
  } catch { error.value = '操作未完成，请刷新图库后重试。' }
  finally { busy.value = false }
}
function chooseFiles(event: Event) {
  files.value = Array.from((event.target as HTMLInputElement).files ?? [])
  importState.value = null; notice.value = ''; error.value = ''
}
async function submitImports() {
  if (!canUse.value || importing.value || !files.value.length || !selectedGroups.value.length) return
  if (!importState.value) {
    if (files.value.some(file => file.size > (file.name.toLowerCase().endsWith('.zip') ? 32 : 8) * 1024 * 1024)) {
      error.value = '单张图片最多 8 MiB，ZIP 最多 32 MiB。'; return
    }
    importState.value = {jobs:selectedGroups.value.flatMap(target => files.value.map(file => ({file,group:target,offset:0}))),
      index:0,queued:0}
  }
  const state = importState.value, token = generation
  importing.value = true; stopRequested.value = false; error.value = ''; notice.value = ''
  try {
    while (state.index < state.jobs.length && !stopRequested.value && token === generation) {
      const job = state.jobs[state.index]!
      const response = await importAiStickers(props.serviceId, job.group, job.offset, job.file)
      if (token !== generation || disposed) return
      state.queued += response.queued
      const previousOffset = job.offset
      if (response.next_offset !== null && response.next_offset > job.offset) job.offset = response.next_offset
      if (response.status === 'busy' || response.status === 'full') {
        notice.value = response.status === 'full' ? '图库已满；已排队的图片继续识别。' : '识别队列繁忙，可稍后继续导入。'
        break
      }
      if (response.next_offset === null) state.index++
      else if (response.next_offset <= previousOffset) throw new Error('import offset not advanced')
    }
    if (state.index === state.jobs.length) notice.value = `已排队 ${state.queued} 张，识别结果请刷新图库查看。`
    else if (stopRequested.value) notice.value = `已停止后续提交；已排队 ${state.queued} 张继续识别。`
    else if (state.queued && !notice.value) notice.value = `已排队 ${state.queued} 张。`
    if (state.index === state.jobs.length) importState.value = null
  } catch { error.value = '导入未确认，请刷新图库核对后继续。' }
  finally { importing.value = false }
}
</script>

<template>
  <section class="sticker-library" aria-label="表情图库">
    <div class="sticker-toolbar">
      <label>来源群 <select v-model="group" :disabled="loading || busy || importing || Boolean(editing)" @change="changeGroup">
        <option v-for="id in groups" :key="id" :value="id">{{ id }}</option>
      </select></label>
      <span v-if="result">本群 {{ result.total ?? 0 }} 张 · 全库 {{ result.library_total ?? 0 }} / {{ result.capacity ?? 0 }} 张 · 待识别 {{ result.pending ?? 0 }}</span>
      <button type="button" :disabled="loading || busy || importing || Boolean(editing)" @click="load">{{ loading ? '读取中…' : '刷新图库' }}</button>
    </div>
    <p>在授权群引用图片并 @机器人发送“收藏”，或通过页面导入；不会自动收藏群图片。表情仅供来源群使用。</p>
    <p v-if="!enabled || !synchronized">请先启用 AI 对话并等待配置同步。</p>
    <p v-if="error" class="sticker-error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div class="sticker-import">
      <strong>导入表情包</strong><p>选择图片或 ZIP 和授权群；图片由视觉模型识别，识别失败或图库已满时可能不会入库。</p>
      <label>选择文件 <input type="file" data-field="sticker-files" accept="image/png,image/jpeg,image/gif,image/webp,.zip" multiple :disabled="!canUse || busy || importing" @change="chooseFiles"></label>
      <div class="sticker-groups" aria-label="导入到授权群"><label v-for="id in groups" :key="id"><input v-model="selectedGroups" type="checkbox" :value="id" :disabled="!canUse || busy || importing">{{ id }}</label></div>
      <button type="button" data-action="import-stickers" :disabled="!canUse || busy || importing || !files.length || !selectedGroups.length" @click="submitImports">{{ importState ? '继续导入' : '导入所选文件' }}</button>
      <button v-if="importing" type="button" @click="stopRequested = true">停止后续提交</button>
      <small>单张图片不超过 8 MiB；ZIP 不超过 32 MiB、最多 100 张图片。</small>
    </div>
    <div class="sticker-grid">
      <article v-for="item in result?.items ?? []" :key="item.id" class="sticker-card">
        <img v-if="images[item.id]" :src="images[item.id]" :alt="item.description || '表情预览'">
        <span v-else class="sticker-placeholder">预览不可用</span>
        <p>分类：{{ item.category_label || item.category }} · {{ item.enabled ? '已启用' : '已禁用' }}</p>
        <p>{{ item.description }}</p><small>标签：{{ item.tags.join('、') || '无' }} · 使用场景：{{ item.scene_count ?? 0 }} 条 · 使用 {{ item.uses }} 次</small>
        <div v-if="editing?.id === item.id" class="sticker-edit">
          <label>分类<select v-model="draft.category"><option v-for="option in result?.categories ?? []" :key="option.key" :value="option.key">{{ option.name }}</option></select></label>
          <label>图片描述<textarea v-model="draft.description" data-field="sticker-description" maxlength="500" /></label>
          <label>图片文字<input v-model="draft.overlay_text" maxlength="80"></label>
          <label>标签<input v-model="draft.tags" placeholder="逗号分隔"></label>
          <label>使用场景与含义<textarea v-model="draft.scenes" rows="3" /></label>
          <small>每行填写一个场景，最多 8 条；仅修改当前群的表情。</small>
          <div><button type="button" data-action="save-sticker" :disabled="busy" @click="save">保存</button><button type="button" :disabled="busy" @click="editing = null">取消</button></div>
        </div>
        <div v-else class="sticker-actions">
          <button type="button" data-action="edit-sticker" :disabled="!canUse || busy || Boolean(editing)" @click="edit(item)">编辑</button>
          <button type="button" :disabled="!canUse || busy || Boolean(editing)" @click="change(item, item.enabled ? 'disable' : 'enable')">{{ item.enabled ? '禁用' : '启用' }}</button>
          <button type="button" :disabled="!canUse || busy || Boolean(editing)" @click="change(item, 'delete')">删除</button>
        </div>
      </article>
    </div>
    <div v-if="(result?.total ?? 0) > 24" class="sticker-toolbar"><button type="button" :disabled="offset === 0 || loading" @click="offset = Math.max(0, offset - 24); load()">上一页</button><button type="button" :disabled="offset + 24 >= (result?.total ?? 0) || loading" @click="offset += 24; load()">下一页</button></div>
  </section>
</template>

<style scoped>
.sticker-library{display:grid;gap:14px;min-width:0}.sticker-toolbar,.sticker-actions,.sticker-groups{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.sticker-toolbar span{color:var(--muted)}.sticker-import,.sticker-card{padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.sticker-import{display:grid;gap:10px}.sticker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.sticker-card{display:grid;gap:8px;align-content:start;min-width:0}.sticker-card img,.sticker-placeholder{width:100%;height:150px;object-fit:contain;background:var(--background);border-radius:6px}.sticker-card p{overflow-wrap:anywhere}.sticker-card small,.sticker-import small{color:var(--muted)}.sticker-edit{display:grid;gap:8px}.sticker-edit label{display:grid;gap:4px}.sticker-actions button,.sticker-edit button{margin-right:6px}.sticker-error{color:var(--danger,#df4c59)}
</style>
