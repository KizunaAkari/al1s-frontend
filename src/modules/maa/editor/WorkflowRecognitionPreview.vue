<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
import CanvasNodeImage from './CanvasNodeImage.vue'
import ColorMarkerSummary from './ColorMarkerSummary.vue'
import { recognitionDisplay } from './recognition-display'
const props = withDefaults(defineProps<{ step: WorkflowStep; scriptId: string; versionId?: string; showText?: boolean }>(), { showText: true })
const display = computed(() => recognitionDisplay(props.step))
</script>
<template>
  <div class="recognition-preview" :class="{ ocr: display.text }">
    <div class="recognition-caption"><strong>{{ display.kind }}</strong><small v-if="display.binding">{{ display.binding }}</small></div>
    <ColorMarkerSummary v-if="display.marker" :step="step" compact />
    <div v-else-if="display.inline" class="node-image legacy-preview"><img :src="display.inline" :alt="display.text ? '文字区域图片预览' : '识别图片预览'" /></div>
    <CanvasNodeImage v-else :script-id="scriptId" :version-id="versionId" :blob-id="display.blob"
      :empty-text="display.empty" :description="display.text ? '文字区域图片预览' : '识别图片预览'" />
    <div v-if="display.text && showText" class="recognition-text" :class="{ missing: !display.target.trim() }">
      <span v-if="display.target.trim()">识别文字：<strong>{{ display.target }}</strong></span>
      <span v-else>未设置识别文字</span>
    </div>
  </div>
</template>
<style scoped>
.recognition-preview { display:grid; gap:6px; min-width:0; text-align:left; }
.recognition-caption { display:flex; gap:6px; align-items:center; justify-content:space-between; font-size:11px; color:var(--muted); }
.recognition-caption strong { font-weight:500; color:var(--text); }.recognition-caption small { font-size:10px; }
.ocr .recognition-caption strong { color:var(--accent); }.recognition-text { font-size:12px; line-height:1.5; overflow-wrap:anywhere; white-space:pre-wrap; color:var(--text); }
.recognition-text.missing { color:var(--muted); }.legacy-preview { display:flex; align-items:center; justify-content:center; height:64px; overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface-soft); }
.legacy-preview img { display:block; max-width:100%; max-height:100%; object-fit:contain; }
</style>
