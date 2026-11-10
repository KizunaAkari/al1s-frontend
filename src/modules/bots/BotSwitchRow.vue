<script setup lang="ts">
import { useId } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ modelValue: boolean; title: string; description: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const id = useId()
</script>

<template>
  <div class="bot-switch-row">
    <div class="bot-switch-label">
      <span class="bot-switch-copy"><strong :id="`${id}-title`">{{ title }}</strong><small :id="`${id}-description`">{{ description }}</small></span>
      <input v-bind="$attrs" type="checkbox" :checked="modelValue" :disabled="disabled" :aria-labelledby="`${id}-title`" :aria-describedby="`${id}-description`" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
    </div>
  </div>
</template>

<style scoped>
.bot-switch-row { border-bottom:1px solid var(--border); }
.bot-switch-row:last-child { border-bottom:0; }
.bot-switch-label { display:flex; align-items:center; justify-content:space-between; gap:20px; min-height:64px; padding:14px 0; box-sizing:border-box; }
.bot-switch-copy { display:grid; gap:4px; min-width:0; }
.bot-switch-copy strong { color:var(--text); font-size:14px; line-height:20px; font-weight:600; }
.bot-switch-copy small { color:var(--muted); font-size:12px; line-height:1.5; font-weight:400; }
input { appearance:none; position:relative; flex:none; box-sizing:border-box; width:44px; height:24px; margin:0; border:1px solid var(--border-strong); border-radius:20px; background:var(--border-strong); cursor:pointer; }
input::after { content:''; position:absolute; width:18px; height:18px; top:2px; left:2px; border-radius:50%; background:#fff; transition:transform .15s; }
input:checked { border-color:var(--accent); background:var(--accent); }
input:checked::after { transform:translateX(20px); }
input:disabled { opacity:.5; cursor:not-allowed; }
input:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
</style>
