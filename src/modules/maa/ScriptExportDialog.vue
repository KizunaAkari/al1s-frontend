<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElAlert, ElButton, ElDialog, ElOption, ElSelect } from 'element-plus'
import { apiClient, normalizeApiError } from '../../shared/api/client'
import type { MaaScript } from '../../shared/api/maa'

const props = defineProps<{ script: MaaScript | null }>()
const emit = defineEmits<{ close: [] }>()
const version = ref('')
const busy = ref(false)
const error = ref('')
let generation = 0
const versions = computed(() => {
  const result: { id: string; label: string }[] = []
  if (props.script?.current_version_id) result.push({ id: props.script.current_version_id, label: '当前已保存版本' })
  return result
})
watch(() => props.script, () => { ++generation; version.value = ''; error.value = '' })
onBeforeUnmount(() => { ++generation })
async function download(): Promise<void> {
  const script = props.script
  if (!script || busy.value || !versions.value.some(v => v.id === version.value)) return
  const selected = version.value
  const current = generation
  busy.value = true; error.value = ''
  try {
    const response = await apiClient.get<Blob>(`/maa/scripts/${script.script_id}/versions/${selected}/archive`,
      { responseType: 'blob', timeout: 180000 })
    if (current !== generation) return
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url; link.download = `maa-${script.script_id}-${selected}.zip`
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    if (current === generation) error.value = normalizeApiError(cause).message
  } finally { busy.value = false }
}
</script>
<template>
  <ElDialog :model-value="!!script" title="导出脚本归档" width="min(560px, 94vw)" :close-on-click-modal="false"
    :show-close="!busy" :close-on-press-escape="!busy"
    @update:model-value="value => { if (!value && !busy) emit('close') }">
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">导出脚本归档 <HelpHint subject="导出脚本归档">包含当前已保存脚本、应用包名、图片资源和引用的过程脚本。导入时需匹配现有应用分类；同名脚本覆盖前会提示确认。</HelpHint></span></template>
    <ElSelect v-model="version" :disabled="busy" placeholder="选择要导出的版本">
      <ElOption v-for="item in versions" :key="item.id" :value="item.id" :label="item.label" />
    </ElSelect>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template #footer>
      <ElButton :disabled="busy" @click="emit('close')">关闭</ElButton>
      <ElButton type="primary" :loading="busy" :disabled="!version" @click="download">下载 ZIP</ElButton>
    </template>
  </ElDialog>
</template>
