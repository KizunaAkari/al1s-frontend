<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string; disabled?: boolean; clickable?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; removed: [group: string]; selected: [group: string] }>()
const adding = ref(false), entry = ref(''), error = ref('')
const groups = computed(() => props.modelValue.split(/[\s,，]+/).filter(Boolean))
const hasPending = computed(() => Boolean(entry.value.trim()))
watch(entry, () => { error.value = '' })

function add() {
  const value = entry.value.trim()
  if (!/^[1-9]\d{0,19}$/.test(value)) { error.value = '请输入有效的 QQ 群号。'; return }
  if (groups.value.includes(value)) { error.value = '该群号已添加。'; return }
  if (groups.value.length >= 100) { error.value = '最多添加 100 个群号。'; return }
  emit('update:modelValue', [...groups.value, value].join('\n'))
  entry.value = ''; error.value = ''; adding.value = false
}
function remove(index: number) {
  const group = groups.value[index]
  if (!group) return
  emit('update:modelValue', groups.value.filter((_, at) => at !== index).join('\n'))
  emit('removed', group)
}
function cancel() { entry.value = ''; error.value = ''; adding.value = false }
function validatePending() {
  if (!hasPending.value) return true
  adding.value = true; error.value = '请先添加或清空待输入的群号。'
  return false
}
defineExpose({ hasPending, validatePending })
</script>

<template>
  <div class="qq-groups">
    <div class="qq-groups-heading"><strong>授权群号</strong><small>仅在这些群中响应，移除后需保存生效。</small></div>
    <div class="qq-group-controls">
      <div class="qq-group-tags">
        <span v-for="(group, index) in groups" :key="`${group}-${index}`" class="qq-group-tag"><button v-if="clickable" type="button" class="qq-group-link" :data-ai-configure-group="group" @click="emit('selected', group)">{{ group }}</button><template v-else>{{ group }}</template><button type="button" :disabled="disabled" :aria-label="`移除 ${group}`" @click="remove(index)">×</button></span>
        <button type="button" class="qq-group-button" :disabled="disabled" @click="adding = true">＋ 添加</button>
      </div>
      <div v-if="adding" class="qq-group-entry">
        <input v-model="entry" type="text" inputmode="numeric" aria-label="QQ群号" placeholder="输入群号" :disabled="disabled" @keydown.enter.prevent="add">
        <button type="button" class="qq-group-button" :disabled="disabled" @click="add">添加</button>
        <button type="button" class="qq-group-button" :disabled="disabled" @click="cancel">取消</button>
      </div>
      <p v-if="error" class="qq-group-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.qq-groups { display:grid; grid-template-columns:minmax(160px,1fr) minmax(0,2fr); align-items:center; grid-column:1/-1; gap:20px; min-width:0; padding:14px 0; border-bottom:1px solid var(--border); }
.qq-groups:last-child { border-bottom:0; }
.qq-groups-heading { display:grid; gap:4px; }
.qq-groups-heading strong { color:var(--text); font-size:14px; font-weight:600; line-height:20px; }
.qq-groups-heading small { color:var(--muted); font-size:12px; line-height:1.5; }
.qq-group-controls { display:grid; justify-items:end; gap:8px; min-width:0; }
.qq-group-tags,.qq-group-entry { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:8px; }
.qq-group-tag { display:inline-flex; align-items:center; gap:7px; padding:6px 9px; border-radius:5px; background:var(--surface-soft); color:var(--text); font-size:12px; }
.qq-group-tag button { padding:0 3px; border:0; background:transparent; color:inherit; cursor:pointer; }
.qq-group-tag .qq-group-link { color:var(--accent); text-decoration:underline; text-underline-offset:3px; }
.qq-group-button { padding:7px 10px; border:1px solid var(--border-strong); border-radius:6px; background:var(--surface); color:var(--text); font:inherit; font-size:13px; cursor:pointer; }
.qq-group-entry input { box-sizing:border-box; width:200px; max-width:100%; padding:7px 10px; border:1px solid var(--border-strong); border-radius:6px; background:var(--surface); color:var(--text); font:inherit; font-size:13px; }
.qq-group-entry input:focus-visible,.qq-group-button:focus-visible,.qq-group-tag button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
button:disabled,input:disabled { opacity:.55; cursor:not-allowed; }
.qq-group-error { margin:0; color:#bd3838; font-size:12px; }
@container bot-workspace (max-width:700px) { .qq-groups { grid-template-columns:minmax(0,1fr); gap:8px; }.qq-group-controls { justify-items:start; }.qq-group-tags,.qq-group-entry { justify-content:flex-start; } }
</style>
