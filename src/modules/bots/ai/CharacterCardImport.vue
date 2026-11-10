<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CARD_FIELDS, CARD_FILE_LIMIT, compileCharacterCard, parseCharacterCard, personaLength,
  type CardField, type ImportedCard } from './character-card'

const props = defineProps<{ disabled: boolean; contextKey: string }>()
const emit = defineEmits<{ apply: [value: { name: string; persona: string }]; cancel: [] }>()
const card = ref<ImportedCard | null>(null), name = ref(''), filename = ref(''), error = ref(''), reading = ref(false)
const fields = ref<CardField[]>([]), worldbook = ref<number[]>([])
let generation = 0
function reset() {
  generation++; card.value = null; name.value = ''; filename.value = ''; error.value = ''; reading.value = false
  fields.value = []; worldbook.value = []
}
watch(() => props.contextKey, reset)
onBeforeUnmount(() => { generation++ })
const preview = computed(() => {
  if (!card.value) return { value: null, error: '' }
  try { return { value: compileCharacterCard(card.value, { name: name.value, fields: fields.value, worldbook: worldbook.value }), error: '' } }
  catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : '角色卡无法转换。' } }
})
async function read(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.disabled) return
  reset()
  const request = generation
  reading.value = true; filename.value = file.name
  try {
    if (file.size > CARD_FILE_LIMIT) throw new Error('角色卡文件不能超过 10 MiB。')
    const data = await file.arrayBuffer()
    if (request !== generation || props.disabled) return
    card.value = parseCharacterCard(new Uint8Array(data), file.name)
    name.value = card.value.name
    fields.value = CARD_FIELDS.filter(field => field.initial && card.value!.fields[field.key]).map(field => field.key)
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : '文件读取失败，请重新选择。'
  } finally { if (request === generation) reading.value = false }
}
function apply() {
  if (props.disabled || reading.value || !preview.value.value) return
  emit('apply', preview.value.value)
}
</script>

<template>
  <section class="card-import" data-section="character-card-import" aria-label="角色卡导入">
    <header><strong>导入角色卡</strong><button type="button" data-action="cancel-card-import" @click="emit('cancel')">取消</button></header>
    <label class="card-file">选择 JSON / PNG
      <input type="file" data-field="character-card-file" accept=".json,.png,application/json,image/png" :disabled="disabled" @change="read">
    </label>
    <p v-if="reading" role="status">正在读取 {{ filename }}…</p>
    <p v-if="error" role="alert" class="card-error">{{ error }}</p>
    <template v-if="card">
      <p class="card-meta">{{ filename }} · {{ card.format }}<span v-if="card.version"> · {{ card.version }}</span><span v-if="card.creator"> · {{ card.creator }}</span></p>
      <label class="card-name">导入名称<input v-model="name" data-field="card-name" :disabled="disabled"></label>
      <div class="card-fields" aria-label="选择角色设定">
        <label v-for="field in CARD_FIELDS.filter(item => card!.fields[item.key])" :key="field.key">
          <input v-model="fields" type="checkbox" :value="field.key" :data-card-field="field.key" :disabled="disabled">
          {{ field.label }} <small>{{ personaLength(card.fields[field.key]) }} 字符</small>
        </label>
      </div>
      <details v-if="card.worldbook.length" class="card-worldbook" open>
        <summary>世界书 · 已选 {{ worldbook.length }} / {{ card.worldbook.length }}</summary>
        <p>勾选内容将固定加入人格，不按关键词触发。</p>
        <div class="card-world-list">
          <div v-for="(entry, index) in card.worldbook" :key="index">
            <label><input v-model="worldbook" type="checkbox" :value="index" :data-card-world="index" :disabled="disabled || !entry.enabled || !entry.content">
              {{ entry.title }} <small>{{ entry.enabled ? personaLength(entry.content) + ' 字符' : '已停用' }}</small></label>
            <details><summary>查看内容</summary><pre>{{ entry.content }}</pre></details>
          </div>
        </div>
      </details>
      <p v-for="warning in card.warnings" :key="warning" class="card-warning">{{ warning }}</p>
      <p v-if="preview.error" role="alert" class="card-error">{{ preview.error }}</p>
      <label class="card-preview">QQ 人格预览 <small>{{ preview.value ? personaLength(preview.value.persona).toLocaleString() : '—' }} / 12,000 字符</small>
        <textarea data-field="card-preview" :value="preview.value?.persona ?? ''" readonly rows="9" spellcheck="false" />
      </label>
      <footer><span>只更新名称和人格草稿，检查后再保存。</span>
        <button type="button" data-action="apply-character-card" :disabled="disabled || reading || !preview.value" @click="apply">应用到当前草稿</button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.card-import { padding:16px; border:1px solid var(--border-strong); border-radius:8px; background:var(--surface-soft); display:grid; gap:12px; min-width:0; }
header,footer { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.card-import label { display:flex; align-items:center; gap:8px; min-width:0; font-size:13px; }
.card-import .card-file,.card-import .card-name,.card-import .card-preview { display:grid; gap:7px; }
.card-import input:not([type=checkbox]),.card-import textarea { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--border-strong); border-radius:5px; color:var(--text); background:var(--surface); font:inherit; }
.card-import textarea { resize:vertical; line-height:1.6; }
.card-import input[type=checkbox] { accent-color:var(--accent); flex-shrink:0; }
.card-import p { margin:0; font-size:12px; }
.card-meta,.card-import small,footer span,.card-worldbook p { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.card-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.card-worldbook summary { cursor:pointer; font-size:13px; }
.card-worldbook p { margin:8px 0; }
.card-world-list { display:grid; gap:10px; max-height:250px; overflow:auto; }
.card-world-list>div { padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:5px; }
.card-world-list details { margin-top:5px; color:var(--muted); }
.card-world-list pre { white-space:pre-wrap; overflow-wrap:anywhere; color:var(--text); font:inherit; font-size:12px; }
.card-import .card-error { color:var(--danger,#c33); }
.card-warning { color:var(--muted); }
.card-import button { padding:8px 11px; border:1px solid var(--border-strong); border-radius:5px; color:var(--accent); background:var(--surface); font:inherit; font-size:13px; cursor:pointer; }
.card-import [data-action='apply-character-card'] { background:var(--accent); color:#fff; border-color:var(--accent); }
.card-import button:disabled { opacity:.55; cursor:not-allowed; }
.card-import button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media(max-width:600px) { .card-fields { grid-template-columns:1fr; } footer { align-items:stretch; flex-direction:column; } }
</style>
