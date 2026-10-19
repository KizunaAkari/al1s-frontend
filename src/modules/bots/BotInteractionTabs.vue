<script setup lang="ts">
import { ref } from 'vue'
type InteractionTab = 'settings' | 'workshop'
const props = defineProps<{ modelValue: InteractionTab }>()
const emit = defineEmits<{ 'update:modelValue': [value: InteractionTab] }>()
const settingsButton = ref<HTMLButtonElement | null>(null)
const workshopButton = ref<HTMLButtonElement | null>(null)
function navigate(event: KeyboardEvent) {
  let target: InteractionTab
  if (event.key === 'Home') target = 'settings'
  else if (event.key === 'End') target = 'workshop'
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') target = props.modelValue === 'settings' ? 'workshop' : 'settings'
  else return
  event.preventDefault()
  emit('update:modelValue', target)
  const button = target === 'settings' ? settingsButton.value : workshopButton.value
  button?.focus()
}
</script>
<template>
  <div class="bot-interaction-tabs" role="tablist" aria-label="互动表情子页" @keydown="navigate">
    <button id="bot-interaction-settings-tab" ref="settingsButton" type="button" role="tab" data-interaction-tab="settings"
      aria-controls="bot-interaction-settings" :aria-selected="modelValue === 'settings'" :tabindex="modelValue === 'settings' ? 0 : -1"
      @click="emit('update:modelValue', 'settings')">使用设置</button>
    <button id="bot-interaction-workshop-tab" ref="workshopButton" type="button" role="tab" data-interaction-tab="workshop"
      aria-controls="bot-interaction-workshop" :aria-selected="modelValue === 'workshop'" :tabindex="modelValue === 'workshop' ? 0 : -1"
      @click="emit('update:modelValue', 'workshop')">表情包工坊</button>
  </div>
</template>
