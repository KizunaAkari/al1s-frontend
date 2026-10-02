<script setup lang="ts">
import { inject, provide } from 'vue'
import type { ScriptDocument } from '../../../shared/api/maa-script-editor'
import WorkflowRecognitionPreview from './WorkflowRecognitionPreview.vue'
import { recognitionActions, textRecognition } from './recognition-display'
import { regionPreviewsKey, useRegionPreviews } from './use-region-previews'
import { historyExecutionMode, historyStepTitle } from './history-diff'
const props = defineProps<{ document: ScriptDocument; scriptId: string; versionId?: string; useEditorCache?: boolean }>()
const inherited = inject(regionPreviewsKey, undefined)
const own = useRegionPreviews(() => props.scriptId, () => props.versionId)
provide(regionPreviewsKey, { ...own, load: value => props.useEditorCache && inherited ? inherited.load(value) : own.load(value) })
function point(value: unknown) {
  const coordinates = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return `(${coordinates.x ?? '—'}, ${coordinates.y ?? '—'})`
}
</script>
<template>
  <div class="history-document-preview" aria-label="历史内容预览">
    <p>共 {{ document.steps.length }} 步 · 只读预览</p>
    <p v-if="!document.steps.length">此状态没有步骤。</p>
    <article v-for="(step, index) in document.steps" :key="index" class="history-step">
      <strong>{{ String(index + 1).padStart(2, '0') }} · {{ historyStepTitle(step) }}</strong>
      <WorkflowRecognitionPreview v-if="recognitionActions.includes(step.action)" :step="step"
        :script-id="scriptId" :version-id="versionId" :show-text="false" />
      <div class="history-step-values">
        <span v-if="step.threshold != null && !textRecognition(step)">阈值 {{ step.threshold }}</span>
        <span v-if="step.text">识别文字 {{ step.text }}</span>
        <span v-if="step.seconds != null">等待 {{ step.seconds }} 秒</span>
        <span v-if="step.execution_count != null">执行 {{ step.execution_count }} 次</span>
        <span v-if="step.execution_mode">{{ historyExecutionMode(step.execution_mode) }}</span>
        <span v-if="step.execution_interval_ms != null">间隔 {{ step.execution_interval_ms }} 毫秒</span>
        <span v-if="step.poll_interval_seconds != null">识别间隔 {{ step.poll_interval_seconds }} 秒</span>
        <span v-if="step.click">点击坐标 {{ point(step.click) }}</span>
        <span v-if="step.action === 'tap'">点击坐标 {{ point(step) }}</span>
        <span v-if="step.timeout_seconds != null">超时 {{ step.timeout_seconds }} 秒</span>
        <span v-if="step.wait_before_execution_seconds != null">前等待 {{ step.wait_before_execution_seconds }} 秒</span>
        <span v-if="step.wait_after_execution_seconds != null">后等待 {{ step.wait_after_execution_seconds }} 秒</span>
      </div>
    </article>
  </div>
</template>
<style scoped>
.history-document-preview { display:grid; gap:10px; min-width:0; }
.history-document-preview p { margin:0; color:var(--muted); font-size:12px; }
.history-step { display:grid; gap:8px; padding:12px; border:1px solid var(--border); border-radius:8px; }
.history-step strong { font-size:13px; }.history-step-values { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
</style>
