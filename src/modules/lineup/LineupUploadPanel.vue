<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import HelpHint from '../../shared/ui/HelpHint.vue'
import type {
  LineupLayoutHint,
  LineupRecognitionMode,
  LineupTerminal,
} from '../../shared/api/lineup'

const props = defineProps<{
  busy: boolean
  files: File[]
  terminals: LineupTerminal[]
  terminalId: string
  layoutHint: LineupLayoutHint
  recognitionMode: LineupRecognitionMode
  notice: string
  error: string
  progress: { uploaded: number; total: number } | null
}>()

const emit = defineEmits<{
  files: [files: File[]]
  'update:terminalId': [value: string]
  'update:layoutHint': [value: LineupLayoutHint]
  'update:recognitionMode': [value: LineupRecognitionMode]
  submit: []
  remove: [index: number]
  clear: []
}>()

const MAX_VISIBLE_FILES = 6
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const expanded = ref(false)
const dragging = ref(false)

const visibleFiles = computed(() => {
  const indexed = props.files.map((file, index) => ({ file, index }))
  return expanded.value || indexed.length <= MAX_VISIBLE_FILES
    ? indexed
    : indexed.slice(0, MAX_VISIBLE_FILES)
})
const hiddenFileCount = computed(() => Math.max(0, props.files.length - visibleFiles.value.length))
const canSubmit = computed(() => !props.busy && props.files.length > 0 && Boolean(props.terminalId))
const progressPercent = computed(() => {
  const progress = props.progress
  if (!progress || progress.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress.uploaded / progress.total) * 100)))
})

watch(() => props.files.length, (count) => {
  if (count <= MAX_VISIBLE_FILES) expanded.value = false
})

function openFilePicker(): void {
  if (!props.busy) fileInput.value?.click()
}

function openFolderPicker(): void {
  if (!props.busy) folderInput.value?.click()
}

function selectedFiles(event: Event): File[] {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  return files
}

function onFilesSelected(event: Event): void {
  if (props.busy) return
  emit('files', selectedFiles(event))
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  if (props.busy) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) emit('files', files)
}

function onDragEnter(): void {
  if (!props.busy) dragging.value = true
}

function onDragLeave(): void {
  dragging.value = false
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select, [contenteditable="true"]')
    || target.isContentEditable
  )
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function onPaste(event: ClipboardEvent): void {
  if (props.busy || isTextEntryTarget(event.target)) return
  const clipboard = event.clipboardData
  if (!clipboard) return
  const files = Array.from(clipboard.files).filter(isImageFile)
  if (!files.length) {
    for (const item of Array.from(clipboard.items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) return
  event.preventDefault()
  emit('files', files)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '大小未知'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function toggleFiles(): void {
  expanded.value = !expanded.value
}

function removeFile(index: number): void {
  if (!props.busy) emit('remove', index)
}
</script>

<template>
  <section class="lineup-upload-panel" aria-labelledby="lineup-upload-panel-title" @paste="onPaste">
    <div class="upload-panel-heading">
      <div>
        <h2 id="lineup-upload-panel-title">上传战报 <HelpHint subject="上传战报">支持 PNG/JPEG，单张不超过 16 MiB、1600 万像素；可多选或选择文件夹。</HelpHint></h2>
      </div>
      <span class="upload-format-label">单张 / 多张 / 文件夹</span>
    </div>

    <div class="upload-panel-row">
      <div class="upload-sources">
      <div
        data-upload-dropzone
        class="upload-dropzone"
        :class="{ dragging, disabled: busy }"
        role="group"
        :aria-disabled="busy"
        aria-label="上传图片"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragEnter"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="upload-dropzone-copy"><strong>拖拽战报图片到这里</strong><span>支持多选，也可直接粘贴截图</span></div>

      <div class="upload-panel-actions" aria-label="图片选择方式">
        <ElButton class="upload-secondary" :disabled="busy" aria-label="选择图片" @click="openFilePicker">选择图片</ElButton>
        <ElButton class="upload-secondary" :disabled="busy" aria-label="选择文件夹" @click="openFolderPicker">选择文件夹</ElButton>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          aria-label="选择多张图片"
          @change="onFilesSelected"
        />
        <input
          ref="folderInput"
          class="visually-hidden"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          webkitdirectory
          directory
          aria-label="选择图片文件夹"
          @change="onFilesSelected"
        />
      </div>
      </div>
      </div>
      <div class="upload-settings">
      <div class="upload-controls">
      <label class="upload-field">
        <span>识别终端</span>
        <ElSelect :model-value="terminalId" :disabled="busy" aria-label="识别终端" @update:model-value="value => emit('update:terminalId', value)">
          <ElOption value="" label="选择终端" disabled />
          <ElOption v-for="terminal in terminals" :key="terminal.terminal_id" :value="terminal.terminal_id" :label="`${terminal.display_name}${terminal.available ? '' : `（${terminal.reason || '不可用'}）`}`" :disabled="!terminal.available" />
        </ElSelect>
      </label>

      <label class="upload-field">
        <span>阵容方向</span>
        <ElSelect :model-value="layoutHint" :disabled="busy" aria-label="阵容方向" @update:model-value="value => emit('update:layoutHint', value)">
          <ElOption label="自动识别方向" value="auto" />
          <ElOption label="单边进攻" value="attack" />
          <ElOption label="单边防守" value="defense" />
          <ElOption label="左攻右守" value="left_attack" />
          <ElOption label="右攻左守" value="right_attack" />
        </ElSelect>
      </label>

      <label class="upload-field">
        <span>识别方式</span>
        <ElSelect :model-value="recognitionMode" :disabled="busy" aria-label="识别方式" @update:model-value="value => emit('update:recognitionMode', value)">
          <ElOption label="自动 · 头像 + 文字" value="auto" />
          <ElOption label="仅头像" value="portrait" />
          <ElOption label="仅文字" value="text" />
        </ElSelect>
      </label>

      <ElButton class="upload-submit" type="primary" :disabled="!canSubmit" :loading="busy" aria-label="开始识别" @click="emit('submit')">开始识别</ElButton>
      </div>
      <p class="upload-destination">任务下发后，请前往任务中心查看处理结果。</p>
      </div>
    </div>

    <div v-if="error" class="upload-warning upload-warning--error" role="alert">{{ error }}</div>
    <p v-if="notice" class="upload-notice" role="status">{{ notice }}</p>

    <div v-if="progress" class="upload-progress" role="status" aria-live="polite">
      <div class="upload-progress-heading"><span>上传进度</span><strong>{{ progress.uploaded }} / {{ progress.total }}</strong></div>
      <div
        role="progressbar"
        class="upload-progress-track"
        :aria-valuemin="0"
        :aria-valuemax="progress.total"
        :aria-valuenow="Math.max(0, Math.min(progress.total, progress.uploaded))"
        :aria-label="`上传进度 ${progress.uploaded} / ${progress.total}`"
      >
        <span :style="{ width: `${progressPercent}%` }" />
      </div>
    </div>

    <div v-if="files.length" class="upload-file-list" aria-label="待上传图片">
      <div class="upload-file-list-heading">
        <span>已选择 {{ files.length }} 张图片</span>
        <div class="upload-list-actions">
        <ElButton v-if="files.length > MAX_VISIBLE_FILES" class="upload-list-toggle" text :aria-label="expanded ? '收起文件列表' : '展开文件列表'" @click="toggleFiles">
          {{ expanded ? '收起' : `展开其余 ${hiddenFileCount} 张` }}
        </ElButton>
        <ElButton :disabled="busy" text aria-label="全部移除" @click="emit('clear')">全部移除</ElButton>
        </div>
      </div>
      <ul>
        <li v-for="item in visibleFiles" :key="`${item.index}-${item.file.name}`" data-upload-file>
          <span class="upload-file-main"><strong :title="item.file.webkitRelativePath || item.file.name">{{ item.file.webkitRelativePath || item.file.name || '未命名图片' }}</strong><small>{{ formatBytes(item.file.size) }}</small></span>
          <ElButton class="upload-file-remove" text :disabled="busy" :aria-label="`移除 ${item.file.name || '未命名图片'}`" @click="removeFile(item.index)">移除</ElButton>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lineup-upload-panel {
  --upload-accent: var(--lineup-accent, #2f76da);
  --upload-accent-soft: var(--lineup-accent-soft, #e8f1ff);
  --upload-border: var(--lineup-border, var(--border, #d7e3f1));
  --upload-card: var(--lineup-card, var(--surface, #fff));
  container-type: inline-size;
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--upload-border);
  border-radius: 12px;
  background: var(--upload-card);
  color: var(--text, #172139);
}
.upload-panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.upload-panel-heading h2 { margin: 0; font-size: 20px; }
.upload-format-label { color: var(--muted); font-size: 13px; }
.upload-panel-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.upload-sources { min-width: 0; }
.upload-dropzone {
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  min-width: 0; min-height: 108px; padding: 20px 24px;
  border: 1px dashed var(--upload-accent); border-radius: 10px;
  background: var(--upload-accent-soft);
}
.upload-dropzone-copy { min-width: 0; }
.upload-dropzone strong { color: var(--text); font-size: 17px; line-height: 1.6; }
.upload-dropzone-copy > span { display: block; color: var(--muted); font-size: 14px; line-height: 1.6; }
.upload-dropzone.dragging { outline: 2px solid var(--upload-accent); outline-offset: 2px; }
.upload-dropzone.disabled { opacity: .6; }
.upload-panel-actions { display: flex; flex-shrink: 0; gap: 12px; }
.upload-secondary { height: 44px; padding: 0 18px; margin: 0; font-size: 15px; background: var(--upload-card); }
.upload-panel-actions :deep(.el-button + .el-button) { margin-left: 0; }
.upload-destination { color: var(--muted); font-size: 12px; }
.upload-settings { display: grid; gap: 10px; min-width: 0; }
.upload-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 116px; gap: 16px; align-items: end; }
.upload-field { display: grid; min-width: 0; gap: 8px; color: var(--muted); font-size: 14px; }
.upload-field :deep(.el-select) { width: 100%; min-width: 0; }
.upload-field :deep(.el-select__wrapper) { min-height: 44px; }
.upload-submit { height: 44px; width: 100%; margin: 0; font-weight: 600; }
.upload-destination { margin: 0; line-height: 1.5; }
.upload-warning, .upload-notice { margin: 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.upload-warning--error { color: var(--danger, #c43d50); }
.upload-notice { color: var(--muted); }
.upload-progress { display: grid; gap: 6px; font-size: 12px; }
.upload-progress-heading, .upload-file-list-heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.upload-progress-track { height: 6px; overflow: hidden; border-radius: 8px; background: var(--upload-accent-soft); }
.upload-progress-track span { display: block; height: 100%; background: var(--upload-accent); }
.upload-file-list { min-width: 0; border-top: 1px solid var(--upload-border); }
.upload-file-list-heading { padding: 10px 0; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
.upload-list-actions { display: flex; gap: 8px; }
.upload-list-actions :deep(.el-button + .el-button) { margin-left: 0; }
.upload-file-list ul { margin: 0; padding: 0; max-height: 240px; overflow: auto; list-style: none; }
.upload-file-list li { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--upload-border); }
.upload-file-main { display: grid; gap: 3px; min-width: 0; font-size: 13px; }
.upload-file-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.upload-file-main small { color: var(--muted); font-size: 11px; }
.upload-file-remove { flex-shrink: 0; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip-path: inset(50%) !important; white-space: nowrap !important; }
@container (max-width: 630px) {
  .upload-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .upload-dropzone { flex-direction: column; align-items: stretch; gap: 16px; padding: 18px; }
  .upload-panel-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .upload-secondary { min-width: 0; padding: 0 10px; }
}
@media (max-width: 600px) { .lineup-upload-panel { padding: 14px; } }
</style>
