<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BotSwitchRow from '../BotSwitchRow.vue'
import { fetchDrawingPreset, saveDrawingPreset, type DrawingBinding, type DrawingKind, type DrawingPresetDraft } from '../../../shared/api/bot-drawing'

const props = defineProps<{ serviceId: string; presetId: string | null; open: boolean }>()
const emit = defineEmits<{ close: []; saved: []; dirty: [value: boolean] }>()
const name = ref(''), kind = ref<DrawingKind>('txt2img'), enabled = ref(false), graphText = ref('')
const positive = ref(''), negative = ref(''), image = ref(''), seed = ref(''), output = ref('')
const positivePrefix = ref(''), negativePrefix = ref(''), aliasText = ref('')
const version = ref(0), busy = ref(false), error = ref('')
let generation = 0, baseline = '', loading = false
let pending: { fingerprint: string; operation: string } | null = null
type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
const graph = computed<Record<string, Node> | null>(() => {
  try {
    const value: unknown = JSON.parse(graphText.value)
    if (!value || typeof value !== 'object' || Array.isArray(value) || 'nodes' in value) return null
    const entries = Object.entries(value)
    if (!entries.length || entries.length > 100 || entries.some(([, node]) => !node || typeof node !== 'object'
      || typeof (node as Node).class_type !== 'string' || !(node as Node).inputs || typeof (node as Node).inputs !== 'object')) return null
    return value as Record<string, Node>
  } catch { return null }
})
const options = (classes: string[], field: string) => computed(() => Object.entries(graph.value ?? {})
  .filter(([, node]) => classes.includes(node.class_type) && field in node.inputs)
  .map(([id, node]) => ({ value: `${id}:${field}`, label: `#${id} ${node._meta?.title || node.class_type} · ${field}` })))
const texts = options(['CLIPTextEncode'], 'text')
const qwenPositive = options(['TextEncodeQwenImage21'], 'prompt')
const qwenNegative = options(['TextEncodeQwenImage21'], 'negative_prompt')
const positiveTexts = computed(() => [...texts.value, ...qwenPositive.value])
const negativeTexts = computed(() => [...texts.value, ...qwenNegative.value])
const images = computed(() => Object.entries(graph.value ?? {}).flatMap(([id, node]) =>
  node.class_type === 'LoadImage' && 'image' in node.inputs ? [{ value: `${id}:image`, label: `#${id} LoadImage` }]
    : node.class_type === 'ImageReceiver' && 'image_data' in node.inputs ? [{ value: `${id}:image_data`, label: `#${id} ImageReceiver` }] : []))
const seeds = options(['KSampler'], 'seed')
const outputs = computed(() => Object.entries(graph.value ?? {}).filter(([, node]) => ['SaveImage', 'PreviewImage'].includes(node.class_type))
  .map(([id, node]) => ({ value: id, label: `#${id} ${node._meta?.title || node.class_type}` })))
const loras = computed(() => [...new Set(Object.values(graph.value ?? {}).filter(node => ['LoraLoader', 'LoraLoaderModelOnly'].includes(node.class_type))
  .map(node => node.inputs.lora_name).filter((value): value is string => typeof value === 'string'))])
const fingerprint = () => JSON.stringify({ name: name.value, kind: kind.value, enabled: enabled.value, graph: graphText.value,
  positive: positive.value, negative: negative.value, image: image.value, seed: seed.value, output: output.value,
  positivePrefix: positivePrefix.value, negativePrefix: negativePrefix.value, aliasText: aliasText.value })
const dirty = computed(() => fingerprint() !== baseline)
watch(dirty, value => emit('dirty', value))

function sourceText(binding: string) {
  const [id, field] = binding.split(':')
  const value = id && field ? graph.value?.[id]?.inputs[field] : undefined
  return typeof value === 'string' ? value : ''
}
watch(positive, (value, previous) => {
  if (!loading && (!positivePrefix.value || positivePrefix.value === sourceText(previous))) positivePrefix.value = sourceText(value)
}, { flush: 'sync' })
watch(negative, (value, previous) => {
  if (!loading && (!negativePrefix.value || negativePrefix.value === sourceText(previous))) negativePrefix.value = sourceText(value)
}, { flush: 'sync' })
function encoded(binding: DrawingBinding | null | undefined) { return binding ? `${binding.node_id}:${binding.input_name}` : '' }
function binding(value: string): DrawingBinding | null {
  const [node_id, input_name] = value.split(':')
  return node_id && input_name ? { node_id, input_name } : null
}

async function load() {
  const current = ++generation
  loading = true; busy.value = Boolean(props.presetId); error.value = ''; pending = null
  name.value = ''; kind.value = 'txt2img'; enabled.value = false; graphText.value = ''
  positive.value = ''; negative.value = ''; image.value = ''; seed.value = ''; output.value = ''
  positivePrefix.value = ''; negativePrefix.value = ''; aliasText.value = ''; version.value = 0
  try {
    if (props.presetId) {
      const value = await fetchDrawingPreset(props.serviceId, props.presetId)
      if (current !== generation) return
      name.value = value.name; kind.value = value.kind; enabled.value = value.enabled
      graphText.value = JSON.stringify(value.graph, null, 2); version.value = value.row_version
      positive.value = encoded(value.bindings.positive); negative.value = encoded(value.bindings.negative)
      image.value = encoded(value.bindings.image); seed.value = encoded(value.bindings.seed); output.value = value.bindings.output.node_id
      positivePrefix.value = value.bindings.positive_prefix; negativePrefix.value = value.bindings.negative_prefix
      aliasText.value = Object.entries(value.aliases).map(([key, filename]) => `${key}=${filename}`).join('\n')
    }
    if (current === generation) baseline = fingerprint()
  } catch { if (current === generation) error.value = '读取工作流失败，请重试。' }
  finally { if (current === generation) { busy.value = false; loading = false } }
}
watch(() => [props.open, props.serviceId, props.presetId] as const, ([open]) => { if (open) void load(); else generation++ }, { immediate: true })

async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 256 * 1024) { error.value = '工作流文件不能超过 256 KiB。'; return }
  graphText.value = await file.text(); error.value = ''
}
function aliases(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of aliasText.value.split('\n').map(value => value.trim()).filter(Boolean)) {
    const index = line.indexOf('=')
    const key = line.slice(0, index).trim(), filename = line.slice(index + 1).trim()
    if (index <= 0 || !key || !loras.value.includes(filename) || Object.keys(result).some(item => item.normalize('NFKC').toLowerCase() === key.normalize('NFKC').toLowerCase()))
      throw new Error('LoRA 别名需填写“别名=工作流中的模型文件”，且不能重复。')
    result[key] = filename
  }
  return result
}
async function save() {
  if (busy.value) return
  try {
    if (!graph.value || new TextEncoder().encode(graphText.value).length > 256 * 1024)
      throw new Error('请导入不超过 256 KiB 的 ComfyUI API 格式工作流。')
    const positiveBinding = binding(positive.value)
    if (!name.value.trim() || !positiveBinding || !output.value || (kind.value === 'image_edit' && !binding(image.value)))
      throw new Error('请填写名称并选择正面、输出及图生图输入节点。')
    const value: DrawingPresetDraft = { name: name.value.trim(), kind: kind.value, enabled: enabled.value, graph: graph.value,
      aliases: aliases(), bindings: { positive: positiveBinding, negative: binding(negative.value),
        positive_prefix: positivePrefix.value, negative_prefix: negativePrefix.value, image: kind.value === 'image_edit' ? binding(image.value) : null,
        seed: binding(seed.value), output: { node_id: output.value, output_index: 0 } } }
    const mark = JSON.stringify({ value, version: version.value, preset: props.presetId })
    if (!pending || pending.fingerprint !== mark) pending = { fingerprint: mark, operation: crypto.randomUUID() }
    busy.value = true; error.value = ''
    await saveDrawingPreset(props.serviceId, props.presetId, value, version.value, pending.operation)
    baseline = fingerprint(); pending = null; emit('dirty', false); emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存工作流失败。' }
  finally { busy.value = false }
}
</script>

<template>
  <section v-if="open" class="drawing-editor" aria-label="工作流编辑">
    <header class="drawing-editor-header"><div><h3>{{ presetId ? '编辑工作流' : '导入工作流' }}</h3><p>导出 ComfyUI 的 API 格式，再指定可替换的输入和输出。</p></div><button type="button" @click="emit('close')">关闭</button></header>
    <p v-if="error" class="drawing-editor-error" role="alert">{{ error }}</p>
    <div class="drawing-editor-grid">
      <label>工作流名称<input v-model="name" data-field="preset-name" maxlength="32" placeholder="例如：动漫插画"></label>
      <label>工作流类型<select v-model="kind" data-field="preset-kind"><option value="txt2img">文生图</option><option value="image_edit">图生图</option></select></label>
    </div>
    <label class="drawing-editor-label">API 工作流 JSON <input type="file" accept=".json,application/json" @change="importFile"></label>
    <textarea v-model="graphText" data-field="workflow-json" rows="9" spellcheck="false" placeholder="选择 JSON 文件或粘贴 API 工作流" />
    <p class="drawing-editor-hint">只替换下方选中的文本、图片和种子；模型、LoRA 及采样参数保留工作流设置。</p>
    <div class="drawing-editor-grid">
      <label>正面条件<select v-model="positive" data-field="positive-binding"><option value="">请选择</option><option v-for="item in positiveTexts" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>负面条件（可选）<select v-model="negative" data-field="negative-binding"><option value="">不支持负面条件</option><option v-for="item in negativeTexts" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label v-if="kind === 'image_edit'">参考图输入<select v-model="image" data-field="image-binding"><option value="">请选择</option><option v-for="item in images" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>种子（可选）<select v-model="seed" data-field="seed-binding"><option value="">保持工作流原值</option><option v-for="item in seeds" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>最终图片输出<select v-model="output" data-field="output-binding"><option value="">请选择</option><option v-for="item in outputs" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    </div>
    <div class="drawing-editor-grid">
      <label>固定正面条件<textarea v-model="positivePrefix" data-field="positive-prefix" rows="3" /></label>
      <label>固定负面条件<textarea v-model="negativePrefix" data-field="negative-prefix" rows="3" /></label>
    </div>
    <label class="drawing-editor-label">LoRA 匹配别名<textarea v-model="aliasText" data-field="lora-aliases" rows="3" placeholder="每行一项：角色名=工作流中的 LoRA 文件名" /></label>
    <p class="drawing-editor-hint">工作流中的 LoRA：{{ loras.length ? loras.join('、') : '无' }}</p>
    <div class="bot-switch-list"><BotSwitchRow v-model="enabled" title="启用此工作流" description="启用后，可在依赖检查和试运行通过后使用。" /></div>
    <footer><span>保存后仍需检查依赖并完成试运行。</span><button type="button" data-action="save-preset" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存' }}</button></footer>
  </section>
</template>

<style scoped>
.drawing-editor{border:1px solid #dbe8f7;border-radius:12px;padding:20px;background:#fff;color:#18385e}.drawing-editor-header{display:flex;justify-content:space-between;gap:16px;align-items:start}.drawing-editor h3{margin:0;font-size:19px}.drawing-editor p{margin:6px 0 14px;color:#7187a5;font-size:13px}.drawing-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}.drawing-editor label,.drawing-editor-label{display:grid;gap:7px;font-size:14px;font-weight:600}.drawing-editor input:not([type=checkbox]),.drawing-editor select,.drawing-editor textarea{width:100%;box-sizing:border-box;border:1px solid #cfdef1;border-radius:6px;padding:10px;color:#18385e;background:#fff;font:inherit;font-weight:400}.drawing-editor textarea{resize:vertical}.drawing-editor input[type=file]{font-size:13px}.drawing-editor-check{display:flex!important;align-items:center;gap:8px;margin:16px 0}.drawing-editor footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;border-top:1px solid #e4edf7;color:#7187a5;font-size:13px}.drawing-editor button{border:1px solid #cfdef1;background:#fff;color:#327fdc;border-radius:6px;padding:9px 15px;cursor:pointer}.drawing-editor footer button{background:#1680f8;color:white;border-color:#1680f8}.drawing-editor-error{color:#c63737!important}.drawing-editor-hint{line-height:1.6}@media(max-width:700px){.drawing-editor-grid{grid-template-columns:1fr}.drawing-editor footer{align-items:stretch;flex-direction:column}}
</style>
