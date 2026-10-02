<script setup lang="ts">
import { ref } from 'vue'
import { ClickOutside as vClickOutside, ElPopover } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'

withDefaults(defineProps<{ label?: string; subject?: string; content?: string }>(), {
  label: '', subject: '', content: '',
})
const visible = ref(false)
const pinned = ref(false)
const focused = ref(false)
const body = ref<HTMLElement>()
function dismiss(event?: Event) {
  if (event?.target instanceof Node && body.value?.contains(event.target)) return
  visible.value = pinned.value = false
}
function leave() { if (!pinned.value && !focused.value) visible.value = false }
function toggle() { pinned.value = !pinned.value; visible.value = pinned.value }
function blur() { focused.value = false; leave() }
</script>

<template>
  <span class="help-hint">
    <span v-if="label" class="help-hint__label">{{ label }}</span>
    <ElPopover :visible="visible" placement="top" :width="320" :show-after="0" :hide-after="0"
      popper-class="platform-help-popover" :persistent="false">
      <template #reference>
        <button v-click-outside="dismiss" type="button" class="help-hint__button"
          :aria-label="`${subject || label || '此项'}说明`" :aria-pressed="pinned"
          @mouseenter="visible = true" @mouseleave="leave" @focus="focused = true; visible = true"
          @blur="blur" @click.stop.prevent="toggle" @keydown.esc.stop.prevent="dismiss()"
          @pointerdown.stop @dblclick.stop>
          <InfoFilled aria-hidden="true" />
        </button>
      </template>
      <div ref="body" class="help-hint__content" @click.stop @pointerdown.stop
        @mouseenter="visible = true" @mouseleave="leave" @keydown.esc.stop.prevent="dismiss()">
        <slot>{{ content }}</slot>
      </div>
    </ElPopover>
  </span>
</template>

<style scoped>
.help-hint { display:inline-flex; align-items:center; gap:5px; max-width:100%; vertical-align:middle; }
.help-hint__button { display:inline-flex; align-items:center; justify-content:center; flex:none;
  position:relative; width:18px; height:18px; padding:1px; border:0; border-radius:50%;
  background:transparent; color:var(--muted); cursor:help; vertical-align:middle; line-height:1; }
.help-hint__button::after { content:''; position:absolute; inset:-3px; }
.help-hint__button svg { width:14px; height:14px; }
.help-hint__button:hover,.help-hint__button:focus-visible { color:var(--accent); }
.help-hint__button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.help-hint__content { white-space:pre-line; overflow-wrap:anywhere; font-size:13px; line-height:1.6; }
</style>

<style>
.el-popper.platform-help-popover { max-width:calc(100vw - 24px); color:var(--text);
  background:var(--surface); border-color:var(--border); }
</style>
