<script setup lang="ts">
import { MoreFilled } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElInput } from 'element-plus'
import { ref, watch } from 'vue'
import { normalizeApiError } from '../../shared/api/client'
import type { MaaApplication } from '../../shared/api/maa'
import {
  deleteApplication, fetchApplicationActions, fetchApplicationDeletePreview,
  deleteApplicationIcon, uploadApplicationIcon,
  renameApplication, type ApplicationActions, type ApplicationDeletePreview,
} from '../../shared/api/maa-applications'

const props = defineProps<{ application?: MaaApplication }>()
const emit = defineEmits<{ changed: [] }>()
const actions = ref<ApplicationActions | null>(null)
const actionError = ref('')
const mode = ref<'rename' | 'delete' | 'delete-icon' | null>(null)
const iconInput = ref<HTMLInputElement | null>(null)
const name = ref('')
const preview = ref<ApplicationDeletePreview | null>(null)
const busy = ref(false)
const error = ref('')
const attempted = ref(false)
let key = ''
let target: MaaApplication | undefined
let generation = 0

watch(() => [props.application?.application_id, props.application?.row_version], async () => {
  const current = ++generation
  actions.value = null
  actionError.value = ''
  if (!props.application) return
  try {
    const result = await fetchApplicationActions(props.application.application_id)
    if (current === generation) actions.value = result
  } catch (cause) {
    if (current === generation) actionError.value = normalizeApiError(cause).message
  }
}, { immediate: true })

async function open(next: 'rename' | 'delete' | 'delete-icon'): Promise<void> {
  target = props.application ? { ...props.application } : undefined
  mode.value = next
  name.value = target?.display_name ?? ''
  preview.value = null
  key = crypto.randomUUID()
  error.value = ''
  attempted.value = false
  if (next === 'delete' && target) {
    busy.value = true
    try { preview.value = await fetchApplicationDeletePreview(target.application_id) }
    catch (cause) { error.value = normalizeApiError(cause).message }
    finally { busy.value = false }
  }
}

async function submit(): Promise<void> {
  if (busy.value || !mode.value) return
  if (mode.value === 'rename' && !name.value.trim()) {
    error.value = '请填写分类名称。'
    return
  }
  busy.value = true
  attempted.value = true
  error.value = ''
  try {
    if (target && mode.value === 'rename') {
      await renameApplication(target, name.value.trim(), key)
    } else if (target && mode.value === 'delete-icon') {
      await deleteApplicationIcon(target, key)
    } else if (target) {
      await deleteApplication(target, key)
    }
    mode.value = null
    emit('changed')
  } catch (cause) {
    const failure = normalizeApiError(cause)
    error.value = `${failure.message}（${failure.code}）${failure.requestId ? ` 请求：${failure.requestId}` : ''}`
  } finally {
    busy.value = false
  }
}

async function onCommand(command: string): Promise<void> {
  if (command === 'upload-icon') {
    error.value = ''
    iconInput.value?.click()
    return
  }
  await open(command as 'rename' | 'delete' | 'delete-icon')
}

async function onIconFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.application || busy.value) return
  if (file.size > 2 * 1024 * 1024) {
    error.value = '图标文件不得超过 2 MiB。'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await uploadApplicationIcon(props.application, file, crypto.randomUUID())
    emit('changed')
  } catch (cause) {
    error.value = normalizeApiError(cause).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="category-actions">
    <input ref="iconInput" class="icon-file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传应用图标" @change="onIconFile" />
    <ElDropdown trigger="click" :disabled="!application || busy" @command="onCommand">
      <ElButton text aria-label="分类更多操作" title="分类更多操作"><ElIcon><MoreFilled /></ElIcon></ElButton>
      <template #dropdown><ElDropdownMenu>
        <ElDropdownItem command="rename" :disabled="!actions || actions.rename !== null">重命名分类</ElDropdownItem>
        <ElDropdownItem command="delete" :disabled="!actions || actions.delete !== null">删除分类</ElDropdownItem>
        <ElDropdownItem command="upload-icon" :disabled="!actions || !!application?.icon_data_url">上传图标</ElDropdownItem>
        <ElDropdownItem command="delete-icon" :disabled="!actions || !application?.icon_data_url">删除图标</ElDropdownItem>
      </ElDropdownMenu></template>
    </ElDropdown>
    <span v-if="actionError" role="alert">操作权限加载失败：{{ actionError }}，请刷新。</span>
    <span v-if="error && mode === null" role="alert">{{ error }}</span>
  </div>
  <ElDialog :model-value="mode !== null" :title="mode === 'rename' ? '重命名应用分类' : mode === 'delete-icon' ? '删除应用图标' : '删除应用分类'"
    width="min(480px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy"
    @update:model-value="value => { if (!value && !busy) mode = null }">
    <div class="category-form">
      <template v-if="mode === 'rename'">
        <label>分类名称<ElInput v-model="name" maxlength="255" :disabled="attempted" /></label>
      </template>
      <template v-else-if="mode === 'delete'">
        <p>确定删除“{{ name }}”？将同时处理该分类内 {{ preview?.script_count ?? '—' }} 个脚本、{{ preview?.strategy_count ?? '—' }} 个策略和 {{ preview?.device_count ?? '—' }} 条手机绑定；历史执行快照保留。</p>
        <p v-if="preview?.blocking_task_ids.length">有活动任务引用，必须先停止并清理：</p>
        <ul v-if="preview?.blocking_task_ids.length"><li v-for="id in preview.blocking_task_ids" :key="id">{{ id }}</li></ul>
        <p v-if="preview?.has_more_blockers">另有更多阻塞任务。</p>
      </template>
      <p v-else>删除后，下次创建该分类脚本时会从当前手机重新尝试获取图标。</p>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <p v-if="error">重试会沿用相同请求，避免重复创建。若需修改内容，请关闭后重新打开；结果不明时先刷新列表核对。</p>
    </div>
    <template #footer>
      <ElButton :disabled="busy" @click="mode = null">关闭</ElButton>
      <ElButton :type="mode === 'delete' || mode === 'delete-icon' ? 'danger' : 'primary'" :loading="busy"
        :disabled="mode === 'delete' && (!preview || preview.blocking_task_ids.length > 0)" @click="submit">{{ error && attempted ? '重试原请求' : '确认' }}</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.category-actions { display: flex; align-items: center; gap: 8px; }
.icon-file-input { display: none; }
.category-actions span { font-size: 12px; color: var(--el-text-color-secondary); }
.category-form { display: grid; gap: 16px; }
.category-form label { display: grid; gap: 8px; }
.category-form p { color: var(--el-text-color-secondary); }
</style>
