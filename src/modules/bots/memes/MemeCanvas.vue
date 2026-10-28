<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { MemeLayout, Slot } from '../../../shared/api/memes'
import { transformSlot } from './layout'
import sampleAvatar from '../../../assets/bot-discord.png'

const props = defineProps<{ modelValue: MemeLayout; background?: string; foreground?: string; selected: string | null; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [layout: MemeLayout]; select: [key: string]; settled: [] }>()
const canvas = ref<HTMLDivElement>()
const slots = computed(() => [
  ...props.modelValue.avatars.map((slot, index) => ({ kind: 'avatar' as const, index, slot, key: `avatar:${index}` })),
  ...props.modelValue.texts.map((slot, index) => ({ kind: 'text' as const, index, slot, key: `text:${index}` })),
])
let stopDrag: (() => void) | undefined
function style(slot: Slot) {
  return { left: `${slot.x / props.modelValue.width * 100}%`, top: `${slot.y / props.modelValue.height * 100}%`,
    width: `${slot.width / props.modelValue.width * 100}%`, height: `${slot.height / props.modelValue.height * 100}%`, zIndex: slot.order + 1 }
}
function start(event: PointerEvent, kind: 'avatar' | 'text', index: number, action: 'move' | 'resize') {
  if (props.disabled || event.button !== 0) return
  event.preventDefault()
  stopDrag?.()
  emit('select', `${kind}:${index}`)
  const slot = kind === 'avatar' ? props.modelValue.avatars[index] : props.modelValue.texts[index]
  if (!slot || !canvas.value) return
  const original = { ...slot }
  const origin = { x: event.clientX, y: event.clientY }
  const scale = canvas.value.getBoundingClientRect().width / props.modelValue.width
  const move = (next: PointerEvent) => {
    if (props.disabled) { finish(); return }
    emit('update:modelValue', transformSlot(props.modelValue,
      kind, index, original, next.clientX - origin.x, next.clientY - origin.y, scale, action))
  }
  const finish = () => { cleanup(); emit('settled') }
  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    stopDrag = undefined
  }
  stopDrag = cleanup
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  window.addEventListener('pointercancel', finish, { once: true })
}
onBeforeUnmount(() => stopDrag?.())
</script>

<template>
  <div ref="canvas" class="meme-canvas" :style="{ aspectRatio: `${modelValue.width}/${modelValue.height}`, backgroundColor: modelValue.background_color }" aria-label="模板编辑画布">
    <img v-if="background" class="canvas-base" :src="background" alt="模板底图" draggable="false">
    <div v-for="item in slots" :key="item.key" class="canvas-slot" :class="{ selected: selected === item.key, avatar: item.kind === 'avatar' }" :style="style(item.slot)"
      :data-slot="item.key" tabindex="0" :aria-label="`${item.kind === 'avatar' ? '头像' : '文字'}槽${item.index + 1}`"
      @focus="emit('select', item.key)" @pointerdown="start($event, item.kind, item.index, 'move')">
      <img v-if="item.kind === 'avatar'" :src="sampleAvatar" alt="样例头像" draggable="false" :style="{ borderRadius: modelValue.avatars[item.index]?.shape === 'circle' ? '50%' : '0', objectFit: modelValue.avatars[item.index]?.fit, transform: `rotate(${modelValue.avatars[item.index]?.rotation ?? 0}deg)` }">
      <span v-else>文字 {{ item.index + 1 }}</span>
      <button class="resize-handle" type="button" aria-label="调整槽位大小" @pointerdown.stop="start($event, item.kind, item.index, 'resize')">↘</button>
    </div>
    <img v-if="foreground" class="canvas-front" :src="foreground" alt="透明前景图" draggable="false">
  </div>
</template>

<style scoped>
.meme-canvas { position: relative; width: 100%; max-width: 560px; overflow: hidden; border: 1px solid var(--border, #dbe1e8); border-radius: 8px; touch-action: none; }
.canvas-base,.canvas-front { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.canvas-front { z-index: 10; }
.canvas-slot { position: absolute; display: flex; align-items: center; justify-content: center; border: 1px dashed #4f7cec; cursor: grab; color: #315da9; background: #ffffff80; user-select: none; }
.canvas-slot.selected { border: 2px solid #3967d9; box-shadow: 0 0 0 2px #ffffff90; }
.canvas-slot img { width: 100%; height: 100%; pointer-events: none; }
.resize-handle { position: absolute; right: 0; bottom: 0; padding: 0; width: 20px; height: 20px; border: 0; background: #3967d9; color: white; cursor: nwse-resize; z-index: 12; }
</style>
