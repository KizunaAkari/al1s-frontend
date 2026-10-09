<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as api from '../../../shared/api/memes'
import type { AvatarSlot, MemeRecord, MemeTemplate, PreviewInput, TextSlot } from '../../../shared/api/memes'
import MemeCanvas from './MemeCanvas.vue'
import { avatarSlot, defaultLayout, normalizeSlot, textSlot } from './layout'
import { PreviewSession } from './preview-session'
import sampleAvatar from '../../../assets/bot-discord.png'

const props = defineProps<{ template: MemeRecord | null; locked?: boolean }>()
const emit = defineEmits<{ saved: [value: MemeRecord]; close: [] }>()
const draft = ref<MemeTemplate>({ name: '新模板', keyword: '新模板', aliases: [], enabled: true,
  random_enabled: true, layout: defaultLayout(), background_blob_id: null, foreground_blob_id: null })
const selected = ref<string | null>(null)
const aliases = ref('')
const demoTexts = ref('今天也要开心! | 爱丽丝出击! | 样例文字三 | 样例文字四')
const testAvatars = ref<string[]>([])
const testImage = ref<string | null>(null)
const background = ref(''), foreground = ref(''), resultUrl = ref('')
const error = ref(''), previewError = ref(''), notice = ref('')
const busy = ref(false), uploading = ref(false), previewBusy = ref(false)
const controlsLocked = computed(() => busy.value || props.locked)
let identity = '', expected = 0, initial = '', destroyed = false, assetGeneration = 0
let pendingSave: { body: string; key: string } | undefined
let samplePromise: Promise<string> | undefined
const inputGeneration = { avatars: 0, image: 0 }
const selection = computed(() => {
  if (!selected.value) return null
  const [kind, index] = selected.value.split(':')
  const slot = kind === 'avatar' ? draft.value.layout.avatars[Number(index)] : draft.value.layout.texts[Number(index)]
  return slot ? { kind, index: Number(index), slot } : null
})
const avatar = computed(() => selection.value?.kind === 'avatar' ? selection.value.slot as AvatarSlot : null)
const text = computed(() => selection.value?.kind === 'text' ? selection.value.slot as TextSlot : null)
const dirty = computed(() => JSON.stringify(draft.value) !== initial)
const captionStyle = computed<TextSlot>(() => draft.value.layout.texts[0] ?? {
  ...textSlot(draft.value.layout), color: '#222222', stroke_width: 0,
})
function captionChange(key: keyof TextSlot, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const value = ['font_size', 'stroke_width'].includes(key) ? Number(raw) : raw
  draft.value.layout.texts = [{ ...captionStyle.value, [key]: value } as TextSlot]
}
defineExpose({ dirty, busy, uploading })
function normalizeSelection() {
  if (selection.value) normalizeSlot(draft.value.layout, selection.value.slot)
}
function restoreExamples() {
  ++inputGeneration.avatars; ++inputGeneration.image
  testAvatars.value = []; testImage.value = null
}

function replaceUrl(target: typeof resultUrl, blob?: Blob) {
  if (target.value) URL.revokeObjectURL(target.value)
  target.value = blob ? URL.createObjectURL(blob) : ''
}
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}
async function sample(): Promise<string> {
  samplePromise ??= fetch(sampleAvatar).then(response => response.blob()).then(base64)
  return samplePromise
}
const session = new PreviewSession<PreviewInput, Blob>(async (input, signal) => {
  const example = await sample()
  const count = input.template.layout.engine === 'petpet' ? 1 : input.template.layout.avatars.length
  if (!input.avatars.length) input.avatars = Array.from({ length: count }, () => example)
  if (!input.images.length && input.template.layout.engine === 'caption') input.images = [example]
  return api.preview(input, signal)
}, blob => { replaceUrl(resultUrl, blob); previewBusy.value = false; previewError.value = '' }, cause => {
  previewBusy.value = false
  previewError.value = cause instanceof Error ? cause.message : '预览失败，请检查图片与文字后重试'
})
function refreshPreview() {
  previewBusy.value = true
  session.schedule({ template: api.templateBody({ ...draft.value, name: draft.value.name.trim() || '预览',
    keyword: draft.value.keyword.trim() || '预览' }), avatars: [...testAvatars.value],
    images: testImage.value ? [testImage.value] : [], texts: demoTexts.value.split('|').map(value => value.trim()).filter(Boolean) })
}
async function loadPictures() {
  const generation = ++assetGeneration
  for (const [id, target] of [[draft.value.background_blob_id, background], [draft.value.foreground_blob_id, foreground]] as const) {
    if (!id) { replaceUrl(target); continue }
    try {
      const body = await api.readAsset(id)
      if (!destroyed && generation === assetGeneration) replaceUrl(target, body)
    } catch { if (!destroyed && generation === assetGeneration) error.value = '素材读取失败，请重试或重新上传' }
  }
}
watch(() => props.template, value => {
  identity = value?.id ?? crypto.randomUUID()
  expected = value?.row_version ?? 0
  draft.value = value ? api.templateBody(value) : { name: '新模板', keyword: '新模板', aliases: [], enabled: true,
    random_enabled: true, layout: defaultLayout(), background_blob_id: null, foreground_blob_id: null }
  aliases.value = draft.value.aliases.join(' ')
  selected.value = null; error.value = ''; notice.value = ''; pendingSave = undefined
  initial = JSON.stringify(draft.value)
  void loadPictures()
}, { immediate: true })
watch(draft, refreshPreview, { deep: true, immediate: true })
watch([testAvatars, testImage, demoTexts], refreshPreview)
watch(aliases, value => { draft.value.aliases = value.split(/[\s,，]+/).map(word => word.trim()).filter(Boolean) })

async function upload(event: Event, role: 'background' | 'foreground') {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    error.value = '素材须为8MiB以内的PNG、JPEG或WebP'; return
  }
  const generation = ++assetGeneration
  uploading.value = true; error.value = ''
  try {
    const saved = await api.uploadAsset(file)
    if (destroyed || generation !== assetGeneration) return
    if (role === 'background') {
      draft.value.background_blob_id = saved.blob_id
      const scale = Math.min(1, 2048 / Math.max(saved.width, saved.height))
      draft.value.layout.width = Math.max(32, Math.round(saved.width * scale))
      draft.value.layout.height = Math.max(32, Math.round(saved.height * scale))
      for (const slot of [...draft.value.layout.avatars, ...draft.value.layout.texts]) {
        slot.width = Math.min(slot.width, draft.value.layout.width)
        slot.height = Math.min(slot.height, draft.value.layout.height)
        slot.x = Math.min(slot.x, draft.value.layout.width - slot.width)
        slot.y = Math.min(slot.y, draft.value.layout.height - slot.height)
      }
      replaceUrl(background, file)
      notice.value = scale < 1 ? '画布已按比例缩小至2048像素以内，原素材保留。' : ''
    } else { draft.value.foreground_blob_id = saved.blob_id; replaceUrl(foreground, file) }
  } catch (cause) { if (!destroyed) error.value = cause instanceof Error ? cause.message : '上传失败，原素材仍保留' }
  finally { if (!destroyed && generation === assetGeneration) uploading.value = false }
}
async function testFile(event: Event, kind: 'avatars' | 'image') {
  const input = event.target as HTMLInputElement, files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  if (files.length > (kind === 'avatars' ? 4 : 1) || files.some(file => file.size > 8 * 1024 * 1024 || !file.type.startsWith('image/'))) {
    previewError.value = '头像最多4张、图片最多1张，每张不超过8MiB'; return
  }
  const generation = ++inputGeneration[kind]
  try {
    const values = await Promise.all(files.map(base64))
    if (destroyed || generation !== inputGeneration[kind]) return
    if (kind === 'avatars') testAvatars.value = values
    else testImage.value = values[0] ?? null
  } catch (cause) {
    if (!destroyed && generation === inputGeneration[kind]) previewError.value = cause instanceof Error ? cause.message : '图片读取失败'
  }
}
function add(kind: 'avatar' | 'text') {
  const list = kind === 'avatar' ? draft.value.layout.avatars : draft.value.layout.texts
  if (list.length >= 4) return
  if (kind === 'avatar') draft.value.layout.avatars.push(avatarSlot(draft.value.layout))
  else draft.value.layout.texts.push(textSlot(draft.value.layout))
  selected.value = `${kind}:${list.length - 1}`
}
function removeSlot() {
  if (!selection.value) return
  const list = selection.value.kind === 'avatar' ? draft.value.layout.avatars : draft.value.layout.texts
  list.splice(selection.value.index, 1); selected.value = null
}
function removeForeground() { draft.value.foreground_blob_id = null; replaceUrl(foreground) }
async function save() {
  if (controlsLocked.value || uploading.value) return
  error.value = ''
  const body = api.templateBody(draft.value), fingerprint = JSON.stringify(body)
  if (!body.name.trim() || !body.keyword.trim()) { error.value = '请填写模板名称和关键词'; return }
  if (!pendingSave || pendingSave.body !== fingerprint) pendingSave = { body: fingerprint, key: crypto.randomUUID() }
  busy.value = true
  try {
    const result = await api.saveTemplate(identity, body, expected, pendingSave.key)
    if (!destroyed) { initial = fingerprint; notice.value = '模板已保存'; emit('saved', result) }
  } catch (cause) { if (!destroyed) error.value = cause instanceof Error ? cause.message : '保存失败，请核对后重试' }
  finally { if (!destroyed) busy.value = false }
}
onBeforeUnmount(() => {
  ++inputGeneration.avatars; ++inputGeneration.image
  destroyed = true; ++assetGeneration; session.close()
  for (const target of [background, foreground, resultUrl]) replaceUrl(target)
})
</script>

<template>
  <section class="meme-editor">
    <header><h3>{{ template ? template.name : '新建合成模板' }}</h3><button type="button" :disabled="controlsLocked || uploading" @click="emit('close')">关闭</button></header>
    <fieldset :disabled="controlsLocked">
    <div class="meme-form-grid">
      <label>模板名称<input v-model="draft.name" maxlength="64"></label>
      <label>主关键词<input v-model="draft.keyword" maxlength="32"></label>
      <label>别名<input v-model="aliases" placeholder="用空格分隔，最多8个"></label>
      <div class="meme-flags"><label><input v-model="draft.enabled" type="checkbox">启用</label><label><input v-model="draft.random_enabled" type="checkbox">参与随机</label></div>
    </div>
    <template v-if="draft.layout.engine === 'composite'">
      <div class="meme-toolbar">
        <label class="file-button">上传底图<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="uploading" @change="upload($event, 'background')"></label>
        <label class="file-button">上传透明前景<input type="file" accept="image/png,image/webp" :disabled="uploading" @change="upload($event, 'foreground')"></label>
        <button v-if="draft.foreground_blob_id" type="button" @click="removeForeground">移除前景</button>
        <button type="button" :disabled="draft.layout.avatars.length >= 4" @click="add('avatar')">添加头像</button>
        <button type="button" :disabled="draft.layout.texts.length >= 4" @click="add('text')">添加文字</button>
      </div>
      <div class="meme-edit-grid">
        <div><p class="meme-caption">定位画布 · {{ draft.layout.width }} × {{ draft.layout.height }} · 拖动方框，右下角调整大小</p>
          <MemeCanvas v-model="draft.layout" :disabled="controlsLocked" :background="background" :foreground="foreground" :selected="selected" @select="selected = $event" />
        </div>
        <aside class="slot-panel">
          <div class="meme-toolbar"><button v-for="(_, index) in draft.layout.avatars" :key="`a${index}`" type="button" @click="selected = `avatar:${index}`">头像 {{ index + 1 }}</button><button v-for="(_, index) in draft.layout.texts" :key="`t${index}`" type="button" @click="selected = `text:${index}`">文字 {{ index + 1 }}</button></div>
          <template v-if="selection">
            <div class="meme-form-grid">
              <label>X<input v-model.number="selection.slot.x" type="number" min="0" :max="draft.layout.width - selection.slot.width" @change="normalizeSelection"></label><label>Y<input v-model.number="selection.slot.y" type="number" min="0" :max="draft.layout.height - selection.slot.height" @change="normalizeSelection"></label>
              <label>宽<input v-model.number="selection.slot.width" type="number" min="1" :max="draft.layout.width" @change="normalizeSelection"></label><label>高<input v-model.number="selection.slot.height" type="number" min="1" :max="draft.layout.height" @change="normalizeSelection"></label>
              <label>层级<input v-model.number="selection.slot.order" type="number" min="0" max="7"></label>
            </div>
            <template v-if="avatar"><div class="meme-form-grid">
              <label>裁剪<select v-model="avatar.shape"><option value="circle">圆形</option><option value="rectangle">矩形</option></select></label>
              <label>显示<select v-model="avatar.fit"><option value="cover">填满</option><option value="contain">完整显示</option></select></label>
              <label>旋转<input v-model.number="avatar.rotation" type="number" min="-180" max="180"></label>
            </div></template>
            <template v-if="text"><div class="meme-form-grid">
              <label>字号<input v-model.number="text.font_size" type="number" min="8" max="256"></label><label>颜色<input v-model="text.color" type="color"></label>
              <label>描边宽<input v-model.number="text.stroke_width" type="number" min="0" max="8"></label><label>描边颜色<input v-model="text.stroke_color" type="color"></label>
              <label>对齐<select v-model="text.align"><option value="left">左</option><option value="center">居中</option><option value="right">右</option></select></label>
            </div></template>
            <button type="button" class="danger" @click="removeSlot">移除这个槽位</button>
          </template><p v-else class="meme-caption">选择头像或文字槽，调整位置与样式。</p>
        </aside>
      </div>
    </template>
    <div v-else class="meme-form-grid">
      <template v-if="draft.layout.engine === 'petpet'"><label>动图尺寸<input v-model.number="draft.layout.width" type="number" min="32" max="512" @change="draft.layout.height = draft.layout.width"></label><label>每帧毫秒<input v-model.number="draft.layout.frame_duration_ms" type="number" min="40" max="500"></label></template>
      <template v-else><label>配字背景<input v-model="draft.layout.background_color" type="color"></label><label>配字字号<input :value="captionStyle.font_size" type="number" min="8" max="256" @input="captionChange('font_size', $event)"></label><label>配字颜色<input :value="captionStyle.color" type="color" @input="captionChange('color', $event)"></label><label>配字描边颜色<input :value="captionStyle.stroke_color" type="color" @input="captionChange('stroke_color', $event)"></label><label>配字描边宽<input :value="captionStyle.stroke_width" type="number" min="0" max="8" @input="captionChange('stroke_width', $event)"></label><label>配字对齐<select :value="captionStyle.align" @change="captionChange('align', $event)"><option value="left">左</option><option value="center">居中</option><option value="right">右</option></select></label><p class="meme-caption">文字在图片下方自动换行并缩小。</p></template>
    </div>
    <section class="preview-pane">
      <div class="meme-preview-input"><h4>效果预览</h4><p class="meme-caption">使用样例头像或本机图片，预览不会发送到聊天。</p>
        <div class="meme-toolbar"><label class="file-button">测试头像<input type="file" accept="image/*" multiple @change="testFile($event, 'avatars')"></label><label class="file-button">测试图片<input type="file" accept="image/*" @change="testFile($event, 'image')"></label><button type="button" @click="restoreExamples">恢复样例</button></div>
        <label>测试文字<textarea v-model="demoTexts" maxlength="200" rows="3" placeholder="多个文字槽用 | 分隔"></textarea></label>
        <button type="button" @click="refreshPreview">重新预览</button><span v-if="previewBusy" class="meme-caption">正在预览…</span>
        <p v-if="previewError" class="meme-error">{{ previewError }}</p>
      </div>
      <div class="meme-result"><img v-if="resultUrl" :src="resultUrl" alt="服务端生成的表情效果"><p v-else class="meme-caption">生成结果显示在这里</p></div>
    </section>
    <p v-if="error" class="meme-error">{{ error }}</p><p v-if="notice" class="meme-notice">{{ notice }}</p>
    </fieldset>
    <footer><span class="meme-caption">{{ dirty ? '有未保存修改' : '当前模板' }}</span><button class="primary" type="button" :disabled="controlsLocked || uploading" @click="save">{{ busy ? '保存中…' : '保存模板' }}</button></footer>
  </section>
</template>

<style scoped>
.meme-editor { min-width: 0; border: 1px solid var(--border, #dbe1e8); border-radius: 12px; padding: 16px; background: var(--surface, white); }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
header,footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h3,h4 { margin: 0 0 10px; }
.meme-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 10px 0; }
label { display: flex; flex-direction: column; gap: 5px; min-width: 0; font-size: 13px; }
input,select,textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--border, #ccd4df); border-radius: 6px; padding: 7px 8px; background: var(--surface, white); color: inherit; }
input[type=checkbox] { width: auto; } input[type=color] { min-height: 34px; }
button,.file-button { border: 1px solid var(--border, #ccd4df); border-radius: 6px; padding: 7px 10px; background: var(--surface, white); color: inherit; font-size: 13px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }.file-button input { display: none; }.primary { color: white; background: #426ad7; border-color: #426ad7; }.danger { color: #b94b4b; }
.meme-flags,.meme-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }.meme-flags label { flex-direction: row; }
.meme-edit-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(180px, 1fr); gap: 14px; }
.slot-panel { min-width: 0; padding: 10px; background: #7d90b00b; border-radius: 8px; }
.meme-caption { font-size: 12px; color: var(--text-secondary, #728092); line-height: 1.5; }.meme-error { color: #ba4343; font-size: 13px; overflow-wrap: anywhere; }.meme-notice { color: #387c58; font-size: 13px; }
.preview-pane { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; padding: 14px 0; margin-top: 14px; border-top: 1px solid var(--border, #e4e9ef); }
.meme-result { display: flex; align-items: center; justify-content: center; min-height: 160px; border-radius: 8px; background: repeating-conic-gradient(#edf0f5 0% 25%, #ffffff 0% 50%) 50% / 16px 16px; overflow: hidden; }
.meme-result img { max-width: 100%; max-height: 320px; object-fit: contain; }
@media(max-width: 760px) { .meme-edit-grid,.preview-pane { grid-template-columns: minmax(0, 1fr); }.meme-editor { padding: 12px; } }
</style>
