<script setup lang="ts">
import { ref } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElIcon, ElInput } from 'element-plus'
import { ApiError } from '../../shared/api/client'
import { renameTerminal, type Terminal } from '../../shared/api/terminals'

const props = defineProps<{ terminal: Terminal; compact?: boolean }>()
const emit = defineEmits<{ renamed: [terminal: Pick<Terminal, 'terminal_id' | 'display_name' | 'row_version' | 'name_version'>] }>()
const open = ref(false)
const draft = ref('')
const busy = ref(false)
const error = ref('')

function edit() {
  draft.value = props.terminal.display_name
  error.value = ''
  open.value = true
}

async function save() {
  if (busy.value) return
  const name = draft.value.trim()
  if (!name || name.length > 120) {
    error.value = '名称去除首尾空格后须为 1～120 个字符。'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const updated = await renameTerminal(props.terminal, name)
    emit('renamed', updated)
    open.value = false
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.status === 409
      ? '名称已由其他管理员修改，请刷新终端后重试。'
      : cause instanceof Error ? cause.message : '修改名称失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button v-if="compact" class="terminal-name-edit" aria-label="修改终端名称" title="修改终端名称" @click="edit"><ElIcon><EditPen /></ElIcon></button>
  <ElButton v-else size="small" @click="edit">修改名称</ElButton>
  <ElDialog v-model="open" title="修改终端显示名称" width="min(420px, 95vw)" :close-on-click-modal="!busy" :show-close="!busy">
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">修改终端显示名称 </span></template>
    <ElInput v-model="draft" maxlength="120" show-word-limit aria-label="终端显示名称" :disabled="busy" @keyup.enter="save" />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template #footer><ElButton :disabled="busy" @click="open=false">取消</ElButton><ElButton type="primary" :loading="busy" @click="save">保存</ElButton></template>
  </ElDialog>
</template>
<style scoped>
.terminal-name-edit { display:inline-grid; place-items:center; flex:none; width:1.55em; height:1.55em; padding:0; border:1px solid var(--el-border-color-lighter); border-radius:8px; background:var(--el-bg-color); color:var(--el-text-color-primary); font-size:inherit; cursor:pointer; }
.terminal-name-edit:hover,.terminal-name-edit:focus-visible { border-color:var(--el-color-primary); color:var(--el-color-primary); }
</style>
