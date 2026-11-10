<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchDrawingOnlinePreset, saveDrawingOnlinePreset, type DrawingOnlinePresetWrite } from '../../../shared/api/bot-drawing'

const props = defineProps<{ serviceId: string; presetId: string | null; open: boolean }>()
const emit = defineEmits<{ close: []; saved: []; dirty: [value: boolean] }>()
const initial = (): DrawingOnlinePresetWrite => ({ name: '', model_id: 'gpt-image-2.6-flare', base_url: '',
  network_mode: 'direct', size: 'auto', quality: 'auto', use_prompt_model: false,
  enabled: false, secret_input: null, clear_secret: false })
const draft = ref<DrawingOnlinePresetWrite>(initial()), version = ref(0), secretConfigured = ref(false)
const busy = ref(false), error = ref('')
let baseline = '', generation = 0
let pending: { fingerprint: string; operation: string } | null = null
const fingerprint = () => JSON.stringify(draft.value)
const dirty = computed(() => fingerprint() !== baseline)
watch(dirty, value => emit('dirty', value))

async function load() {
  const current = ++generation
  draft.value = initial(); version.value = 0; secretConfigured.value = false; error.value = ''; pending = null
  busy.value = Boolean(props.presetId)
  try {
    if (props.presetId) {
      const value = await fetchDrawingOnlinePreset(props.serviceId, props.presetId)
      if (current !== generation) return
      draft.value = { name: value.name, model_id: value.model_id, base_url: value.base_url,
        network_mode: value.network_mode, size: value.size, quality: value.quality,
        use_prompt_model: value.use_prompt_model, enabled: value.enabled, secret_input: null, clear_secret: false }
      version.value = value.row_version; secretConfigured.value = value.secret_configured
    }
    if (current === generation) { baseline = fingerprint(); emit('dirty', false) }
  } catch { if (current === generation) error.value = '读取线上预设失败，请重试。' }
  finally { if (current === generation) busy.value = false }
}
watch(() => [props.open, props.serviceId, props.presetId] as const, ([open]) => {
  if (open) void load(); else generation++
}, { immediate: true })

async function save() {
  if (busy.value) return
  if (!draft.value.name.trim()) { error.value = '请填写预设名称。'; return }
  const value = { ...draft.value, name: draft.value.name.trim(), secret_input: draft.value.secret_input || null }
  const mark = JSON.stringify({ value, version: version.value, preset: props.presetId })
  if (!pending || pending.fingerprint !== mark) pending = { fingerprint: mark, operation: crypto.randomUUID() }
  busy.value = true; error.value = ''
  try {
    await saveDrawingOnlinePreset(props.serviceId, props.presetId, value, version.value, pending.operation)
    baseline = fingerprint(); pending = null; emit('dirty', false); emit('saved')
  } catch { error.value = '保存线上预设失败，请检查配置或刷新后重试。' }
  finally { busy.value = false }
}
</script>

<template>
  <section v-if="open" class="online-editor" aria-label="线上绘图预设">
    <header class="drawing-modal-header"><h3>{{ presetId ? '编辑线上预设' : '新增线上预设' }}</h3><button type="button" aria-label="关闭" @click="emit('close')">×</button></header>
    <p v-if="error" class="online-error" role="alert">{{ error }}</p>
    <form @submit.prevent="save">
      <label class="online-row"><strong>预设名称</strong><input v-model="draft.name" maxlength="32" data-online-field="name"></label>
      <label class="online-row"><strong>生图模型</strong><select v-model="draft.model_id" data-online-field="model"><option value="gpt-image-2.6-flare">GPT Image 2.6 Flare</option><option value="gpt-image-2.6-sunburst">GPT Image 2.6 Sunburst</option></select></label>
      <label class="online-row"><strong>API 地址</strong><input v-model="draft.base_url" placeholder="留空使用 OpenAI 默认地址" data-online-field="url"></label>
      <label class="online-row"><strong>网络环境</strong><select v-model="draft.network_mode" data-online-field="network"><option value="direct">直连</option><option value="proxy">使用现有代理</option></select></label>
      <label class="online-row"><span><strong>API 密钥</strong><small v-if="secretConfigured">已保存，留空保持不变</small></span><input v-model="draft.secret_input" type="password" autocomplete="new-password" data-online-field="secret"></label>
      <label v-if="secretConfigured" class="online-check"><input v-model="draft.clear_secret" type="checkbox">清除已保存的密钥</label>
      <label class="online-row"><strong>图片尺寸</strong><select v-model="draft.size" data-online-field="size"><option value="auto">自动</option><option value="1024x1024">1024 × 1024</option><option value="1024x1536">1024 × 1536</option><option value="1536x1024">1536 × 1024</option></select></label>
      <label class="online-row"><strong>图片质量</strong><select v-model="draft.quality" data-online-field="quality"><option value="auto">自动</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">特高</option><option value="max">最高</option></select></label>
      <label class="online-row online-switch"><strong>整理许愿提示词</strong><input v-model="draft.use_prompt_model" type="checkbox" data-online-field="prompt-model"></label>
      <label class="online-row online-switch"><strong>启用此预设</strong><input v-model="draft.enabled" type="checkbox" data-online-field="enabled"></label>
      <footer><button type="submit" class="primary" :disabled="busy || !dirty" data-online-action="save">{{ busy ? '保存中…' : '保存预设' }}</button></footer>
    </form>
  </section>
</template>

<style scoped>
.online-editor{border:1px solid #dbe8f7;border-radius:10px;padding:20px;background:#fff;color:#18385e}.drawing-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.online-editor h3{margin:0;font-size:17px}.online-row{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:56px;padding:10px 0;border-bottom:1px solid #eaf1fa;font-size:14px}.online-row span{display:grid;gap:4px}.online-row small{color:#7b90ad;font-weight:400}.online-row input:not([type=checkbox]),.online-row select{width:min(100%,440px);min-width:0;border:1px solid #cfdef1;border-radius:6px;padding:9px 10px;color:#18385e;background:#fff;font:inherit}.online-switch input{appearance:none;width:44px;height:24px;flex:none;border-radius:20px;background:#cfdded;cursor:pointer;position:relative}.online-switch input:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff}.online-switch input:checked{background:#1680f8}.online-switch input:checked:before{left:23px}.online-switch input:focus-visible{outline:2px solid #1680f8;outline-offset:2px}.online-check input{accent-color:#1680f8}.online-check{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:8px 0;font-size:13px}.online-error{color:#bd3434}.online-editor footer{display:flex;justify-content:flex-end;padding-top:16px}.online-editor footer button{border:1px solid #1680f8;border-radius:6px;padding:9px 15px;background:#1680f8;color:#fff}.online-editor button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:700px){.online-row:not(.online-switch){align-items:stretch;flex-direction:column;gap:8px}.online-row input:not([type=checkbox]),.online-row select{width:100%}}
</style>
