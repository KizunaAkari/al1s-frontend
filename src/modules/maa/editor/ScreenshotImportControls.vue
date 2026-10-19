<script setup lang="ts">
import { ref } from 'vue'
import { ElButton } from 'element-plus'
import type { NativeScreenshot } from './screenshot-connection'

defineProps<{ disabled: boolean; canCapture: boolean; screenshot?: NativeScreenshot; importedName?: string }>()
const emit = defineEmits<{ import: [file: File]; capture: [] }>()
const input = ref<HTMLInputElement>()
function choose(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = '' // Selecting the same saved failure frame again must still work.
  if (file) emit('import', file)
}
</script>

<template>
  <section class="screenshot-import" aria-label="截图来源">
    <div class="screenshot-source-actions">
      <ElButton size="small" :disabled="disabled" data-import-screenshot @click="input?.click()">导入截图</ElButton>
      <ElButton v-if="canCapture" size="small" :disabled="disabled" data-recapture-screenshot @click="emit('capture')">重新截图</ElButton>
      <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" :disabled="disabled" aria-label="导入截图文件" class="file-input" @change="choose" />
    </div>
    <small v-if="screenshot" class="screenshot-source-info" :title="importedName">{{ importedName ? `已导入：${importedName}` : '手机截图' }} · {{ screenshot.width }}×{{ screenshot.height }}</small>
    <p v-else class="screenshot-source-empty">可导入失败任务的原始截图，再从右侧选择要标注的功能。</p>
  </section>
</template>

<style scoped>
.screenshot-import { display:grid; gap:8px; min-width:0; }
.screenshot-source-actions { display:flex; flex-wrap:wrap; gap:8px; }
.screenshot-source-actions .el-button + .el-button { margin-left:0; }
.screenshot-source-info,.screenshot-source-empty { margin:0; color:var(--muted); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.file-input { display:none; }
</style>
