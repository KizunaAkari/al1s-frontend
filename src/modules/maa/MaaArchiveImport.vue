<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElMessageBox, ElOption, ElSelect, ElTable, ElTableColumn } from 'element-plus'
import { RouterLink } from 'vue-router'
import { ApiError, apiClient } from '../../shared/api/client'

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024
const OPERATION_KEY = 'al1s.maa.import.operation'
type ImportOperation = {
  operation_id: string
  state: 'processing' | 'executing' | 'result_unknown' | 'completed' | 'failed' | 'cancelled'
  row_version: number
  error_code: string | null
  deadline: string
  can_cancel: boolean
}

type ImportBatch = {
  batch_id: string
  logical_sha256: string
  archive_sha256: string
  archive_schema: string
  status: string
  script_count: number
  application_count: number
  resource_reference_count: number
  unique_resource_count: number
  error_code: string | null
  diagnostic: string | null
  created_at: string
  completed_at: string | null
  row_version: number
}

type ImportItem = {
  item_id: string
  archive_ordinal: number
  script_name: string
  status: string
  script_id: string | null
  migration_code: string | null
  error_code: string | null
  diagnostic: string | null
}

type ImportItemPage = {
  items: ImportItem[]
  next_after_ordinal: number | null
}

const emit = defineEmits<{
  imported: [batch: ImportBatch]
  busy: [value: boolean]
  close: []
}>()

const selectedFile = ref<File>()
const batch = ref<ImportBatch>()
const items = ref<ImportItem[]>([])
const nextAfterOrdinal = ref<number | null>(null)
const busy = ref(false)
const operation = ref<ImportOperation>()
const operationBusy = ref(false)
const operationError = ref('')
const itemsLoading = ref(false)
const uploadError = ref('')
const itemsError = ref('')
const targetApplications = ref<Record<string, string>>({})
const confirmedOverwrites = ref<Record<string, number>>({})
const pendingPackage = ref('')
const pendingChoices = ref<string[]>([])
const pendingTarget = ref('')
const overwriteWarnings = ref<Array<{ script_id: string; row_version: number; target_name: string; incoming_name: string }>>([])
let itemsGeneration = 0
let pollTimer: ReturnType<typeof setTimeout> | undefined
let operationGeneration = 0

function activeOperation() {
  return operation.value && ['processing', 'executing', 'result_unknown'].includes(operation.value.state)
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  if (activeOperation()) pollTimer = setTimeout(() => { void refreshOperation() }, 2000)
}

async function loadBatch(batchId: string) {
  const response = await apiClient.get<ImportBatch>('/maa/imports/' + batchId)
  batch.value = response.data
  items.value = []
  nextAfterOrdinal.value = null
  itemsError.value = ''
  if (response.data.status === 'completed') emit('imported', response.data)
  await loadItems(true)
}

async function refreshOperation() {
  const current = operation.value
  if (!current || operationBusy.value) return
  const generation = ++operationGeneration
  operationBusy.value = true
  operationError.value = ''
  try {
    const response = await apiClient.get<ImportOperation>(
      '/maa/imports/' + current.operation_id + '/operation',
    )
    if (generation !== operationGeneration) return
    operation.value = response.data
    if (!activeOperation()) {
      sessionStorage.removeItem(OPERATION_KEY)
      await loadBatch(current.operation_id)
    }
  } catch (cause) {
    if (generation === operationGeneration) operationError.value = messageOf(cause, '查询导入状态失败：')
  } finally {
    if (generation === operationGeneration) {
      operationBusy.value = false
      if (!operationError.value) schedulePoll()
    }
  }
}

async function cancelOperation() {
  const current = operation.value
  if (!current?.can_cancel || operationBusy.value) return
  operationBusy.value = true
  operationError.value = ''
  try {
    const response = await apiClient.post<ImportOperation>(
      '/maa/imports/' + current.operation_id + '/cancel', { row_version: current.row_version },
    )
    operation.value = response.data
    if (!activeOperation()) {
      sessionStorage.removeItem(OPERATION_KEY)
      await loadBatch(current.operation_id)
    }
  } catch (cause) {
    operationError.value = messageOf(cause, '取消请求失败，请先刷新状态：')
  } finally {
    operationBusy.value = false
    if (!operationError.value) schedulePoll()
  }
}

onMounted(() => {
  const saved = sessionStorage.getItem(OPERATION_KEY)
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) {
    operation.value = { operation_id: saved, state: 'result_unknown', row_version: 0,
      error_code: null, deadline: '', can_cancel: false }
    void refreshOperation()
  }
})
onBeforeUnmount(() => {
  operationGeneration++
  if (pollTimer) clearTimeout(pollTimer)
})

const selectedFileLabel = computed(() => {
  const file = selectedFile.value
  return file ? file.name + '（' + (file.size / 1024 / 1024).toFixed(2) + ' MiB）' : ''
})

function setBusy(value: boolean) {
  if (busy.value === value) return
  busy.value = value
  emit('busy', value)
}

function clearBatchView() {
  itemsGeneration += 1
  itemsLoading.value = false
  batch.value = undefined
  items.value = []
  nextAfterOrdinal.value = null
  itemsError.value = ''
}

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value || activeOperation()) return

  uploadError.value = ''
  if (!file.name.toLowerCase().endsWith('.zip')) {
    uploadError.value = '请选择 .zip 归档文件；不接受任意 JSON。'
    return
  }
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    uploadError.value = '归档文件不能为空，且不能超过 32 MiB。'
    return
  }
  selectedFile.value = file
  targetApplications.value = {}
  confirmedOverwrites.value = {}
  pendingPackage.value = ''
  pendingChoices.value = []
  pendingTarget.value = ''
  overwriteWarnings.value = []
  clearBatchView()
}

function selectCategory() {
  if (!pendingPackage.value || !pendingChoices.value.includes(pendingTarget.value)) return
  targetApplications.value = { ...targetApplications.value, [pendingPackage.value]: pendingTarget.value }
  pendingPackage.value = ''
  pendingChoices.value = []
  pendingTarget.value = ''
  uploadError.value = '目标分类已选择，请点击“导入归档”继续。'
}

async function confirmOverwrite() {
  const warnings = overwriteWarnings.value
  if (!warnings.length) return
  try {
    await ElMessageBox.confirm(
      warnings.map(item => `「${item.target_name}」将由「${item.incoming_name}」覆盖`).join('；'),
      '确认覆盖已有脚本', { type: 'warning', confirmButtonText: '确认覆盖', cancelButtonText: '取消' },
    )
  } catch { return }
  confirmedOverwrites.value = Object.fromEntries(warnings.map(item => [item.script_id, item.row_version]))
  overwriteWarnings.value = []
  uploadError.value = '覆盖已确认，请点击“导入归档”继续。'
}

function errorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as { code?: unknown; status?: unknown; response?: unknown }
  if (typeof candidate.code === 'string') return candidate.code
  if (typeof candidate.status === 'number') return String(candidate.status)
  if (typeof candidate.response !== 'object' || candidate.response === null) return undefined
  const response = candidate.response as { status?: unknown }
  return typeof response.status === 'number' ? String(response.status) : undefined
}

function isTimeout(value: unknown): boolean {
  const code = errorCode(value)
  return code === 'network_error' || code?.startsWith('http_5') === true
    || code === 'request_timeout' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === '408'
}

function messageOf(value: unknown, prefix: string): string {
  return value instanceof Error && value.message ? prefix + value.message : prefix + '请重试。'
}

async function loadItems(reset = false) {
  if (!batch.value || itemsLoading.value) return
  const batchId = batch.value.batch_id
  const generation = itemsGeneration
  const after = reset ? undefined : (nextAfterOrdinal.value ?? undefined)
  if (reset) {
    items.value = []
    nextAfterOrdinal.value = null
  }
  itemsLoading.value = true
  itemsError.value = ''
  try {
    const options = after === undefined
      ? { params: { limit: 50 } }
      : { params: { limit: 50, after_ordinal: after } }
    const response = await apiClient.get<ImportItemPage>(
      '/maa/imports/' + batchId + '/items',
      options,
    )
    if (generation !== itemsGeneration || batch.value?.batch_id !== batchId) return
    items.value = reset ? response.data.items : [...items.value, ...response.data.items]
    nextAfterOrdinal.value = response.data.next_after_ordinal
  } catch (value) {
    if (generation === itemsGeneration && batch.value?.batch_id === batchId) {
      itemsError.value = messageOf(value, '读取导入结果失败：')
    }
  } finally {
    if (generation === itemsGeneration && batch.value?.batch_id === batchId) itemsLoading.value = false
  }
}

async function upload() {
  if (busy.value || activeOperation() || !selectedFile.value) return
  setBusy(true)
  uploadError.value = ''
  try {
    const response = await apiClient.post<ImportOperation>(
      '/maa/imports/operations',
      selectedFile.value,
      { headers: { 'Content-Type': 'application/zip',
        'X-AL1S-Import-Selection': JSON.stringify({
          target_applications: targetApplications.value,
          confirmed_overwrites: confirmedOverwrites.value,
        }),
      }, timeout: 70000 },
    )
    itemsGeneration += 1
    itemsLoading.value = false
    operation.value = response.data
    sessionStorage.setItem(OPERATION_KEY, response.data.operation_id)
    batch.value = undefined
    items.value = []
    nextAfterOrdinal.value = null
    itemsError.value = ''
    if (activeOperation()) schedulePoll()
    else await refreshOperation()
  } catch (value) {
    if (value instanceof ApiError && value.code === 'archive_application_selection_required') {
      const packageName = value.context?.application_package
      const choices = value.context?.application_ids
      if (typeof packageName === 'string' && Array.isArray(choices) && choices.every(x => typeof x === 'string')) {
        pendingPackage.value = packageName
        pendingChoices.value = choices
        pendingTarget.value = ''
        uploadError.value = choices.length ? '请选择归档对应的现有脚本分类，然后继续导入。'
          : `应用 ${packageName} 没有可用脚本分类；请先用该应用创建分类，当前归档不会自动建分类。`
        return
      }
    }
    if (value instanceof ApiError && value.code === 'archive_overwrite_confirmation_required') {
      const warnings = value.context?.overwrites
      if (Array.isArray(warnings) && warnings.every(x => typeof x?.script_id === 'string'
        && Number.isInteger(x.row_version) && typeof x.target_name === 'string'
        && typeof x.incoming_name === 'string')) {
        overwriteWarnings.value = warnings
        uploadError.value = '导入会覆盖已有脚本，请核对并确认目标。'
        return
      }
    }
    uploadError.value = isTimeout(value)
      ? '上传请求超时或连接中断，操作编号未知；请核对导入结果后再决定是否使用同一文件重试。'
      : messageOf(value, '归档导入失败：')
  } finally {
    setBusy(false)
  }
}

function close() {
  if (!busy.value) emit('close')
}
</script>

<template>
  <section class="archive-import" aria-label="Maa 脚本归档导入">
    <h3>导入 Maa 脚本与策略归档 <HelpHint subject="归档导入">仅支持 Maa 脚本／策略 ZIP 归档，不是任意 JSON。ZIP 不超过 32 MiB；解压后总量不超过 128 MiB，条目不超过 4096 项。导入仅匹配已有应用分类，同名脚本覆盖前需确认；成功后已保存内容可直接使用。</HelpHint></h3>
    

    <label class="file-picker">
      <span>选择 .zip 文件</span>
      <input type="file" accept=".zip,application/zip" :disabled="busy || Boolean(activeOperation())" aria-label="归档 ZIP 文件" @change="chooseFile" />
    </label>
    <p v-if="selectedFile" class="selected-file">已选择：<code>{{ selectedFileLabel }}</code></p>
    <ElAlert v-if="uploadError" type="error" :closable="false" :title="uploadError" />
    <div v-if="pendingPackage && pendingChoices.length" class="actions">
      <span>应用 {{ pendingPackage }} 对应的分类</span>
      <ElSelect v-model="pendingTarget" placeholder="选择目标分类">
        <ElOption v-for="id in pendingChoices" :key="id" :value="id" :label="id" />
      </ElSelect>
      <ElButton :disabled="!pendingTarget" @click="selectCategory">确认分类</ElButton>
    </div>
    <div v-if="overwriteWarnings.length" class="actions">
      <span>将覆盖 {{ overwriteWarnings.length }} 个已有脚本</span>
      <ElButton type="warning" @click="confirmOverwrite">查看并确认覆盖</ElButton>
    </div>

    <div class="actions">
      <ElButton type="primary" :loading="busy" :disabled="!selectedFile || busy || Boolean(activeOperation())" @click="upload">
        {{ batch ? '重新导入当前归档' : '导入归档' }}
      </ElButton>
      <ElButton :disabled="busy" @click="close">关闭</ElButton>
    </div>

    <section v-if="operation" aria-label="导入操作状态">
      <p>导入操作 {{ operation.operation_id }}：{{ operation.state }}</p>
      <ElAlert v-if="operation.state === 'result_unknown'" type="warning" :closable="false"
        title="执行结果暂不明确，请查询状态；不要重复提交。" />
      <ElAlert v-if="operationError" type="error" :closable="false" :title="operationError" />
      <ElButton :loading="operationBusy" @click="refreshOperation">查询状态</ElButton>
      <ElButton v-if="operation.can_cancel" :disabled="operationBusy" @click="cancelOperation">取消导入</ElButton>
    </section>

    <section v-if="batch" class="batch-result" aria-label="归档导入批次结果">
      <h4>导入批次结果</h4>
      <dl>
        <div><dt>批次</dt><dd><code>{{ batch.batch_id }}</code></dd></div>
        <div><dt>状态</dt><dd>{{ batch.status }}</dd></div>
        <div><dt>脚本数</dt><dd>{{ batch.script_count }}</dd></div>
        <div><dt>应用数</dt><dd>{{ batch.application_count }}</dd></div>
        <div><dt>资源引用数</dt><dd>{{ batch.resource_reference_count }}</dd></div>
        <div><dt>唯一资源数</dt><dd>{{ batch.unique_resource_count }}</dd></div>
        <div><dt>归档格式</dt><dd>{{ batch.archive_schema }}</dd></div>
      </dl>
      <ElAlert
        v-if="batch.status === 'completed'"
        type="success"
        :closable="false"
      ><template #title>导入完成 </template></ElAlert>
      <ElAlert
        v-if="batch.error_code || batch.diagnostic"
        type="warning"
        :closable="false"
        :title="(batch.error_code ?? '') + (batch.diagnostic ? '：' + batch.diagnostic : '')"
      />

      <ElAlert v-if="itemsError" type="error" :closable="false" :title="itemsError" />
      <ElButton v-if="itemsError" :loading="itemsLoading" @click="loadItems(true)">重新读取结果</ElButton>
      <p v-if="itemsLoading">正在读取逐项结果…</p>
      <ElTable v-else-if="items.length" :data="items" row-key="item_id" border>
        <ElTableColumn prop="archive_ordinal" label="归档序号" width="100" />
        <ElTableColumn label="脚本">
          <template #default="{ row }">
            <RouterLink v-if="row.script_id" :to="{ path: '/editor', query: { script_id: row.script_id } }">
              {{ row.script_name }}
            </RouterLink>
            <span v-else>{{ row.script_name }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="结果" width="110" />
        <ElTableColumn prop="migration_code" label="迁移码" />
        <ElTableColumn prop="error_code" label="错误码" />
        <ElTableColumn prop="diagnostic" label="诊断" />
      </ElTable>
      <p v-else-if="!itemsLoading">该批次暂无逐项结果。</p>
      <ElButton
        v-if="nextAfterOrdinal !== null"
        :loading="itemsLoading"
        :disabled="Boolean(itemsError)"
        @click="loadItems()"
      >加载更多结果</ElButton>
    </section>
  </section>
</template>

<style scoped>
.archive-import { display: grid; gap: 12px; }
.file-picker { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
.selected-file code { overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.batch-result { display: grid; gap: 8px; }
dl { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0; }
dl div { display: flex; gap: 8px; }
dt { color: var(--el-text-color-secondary); }
dd { margin: 0; }
</style>
