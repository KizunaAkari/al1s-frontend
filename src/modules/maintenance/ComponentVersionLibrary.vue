<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElInput, ElOption, ElProgress, ElSelect, ElTable, ElTableColumn } from 'element-plus'
import { componentApi, componentLabel, type UpgradeUnit, type ComponentRelease, type ComponentReleaseInput } from '../../shared/api/components'
import { uploadRelease } from '../../shared/api/linux-releases'
const unit = ref<UpgradeUnit>('platform'), rows = ref<ComponentRelease[]>([]), cursor = ref<string | null>(null)
const busy = ref(false), error = ref(''), notice = ref(''), progress = ref(0), file = ref<File | null>(null)
const form = reactive<ComponentReleaseInput>({ release_id: crypto.randomUUID(), component: 'platform', version: '', architecture: 'amd64', size_bytes: 0, sha256: '', candidate_image: '', expected_image_id: '', native_version: '', compatible_from: '', data_policy: 'same-format' })
const labels = { draft: '待上传', queued: '等待校验', verifying: '正在校验', published: '已校验发布', failed: '校验失败' }
let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, disposed = false, generation = 0
async function refresh(more = false) {
  const request = ++generation; clearTimeout(timer)
  try { const page = await componentApi.releases(unit.value, more ? cursor.value ?? undefined : undefined); if (!disposed && request === generation) { rows.value = more ? [...rows.value, ...page.items] : page.items; cursor.value = page.next_cursor } }
  catch (cause) { if (!disposed && request === generation) error.value = cause instanceof Error ? cause.message : '版本库读取失败' }
  finally { if (!disposed && request === generation && rows.value.some(row => ['queued','verifying'].includes(row.state))) timer = setTimeout(() => void refresh(), 5000) }
}
watch(unit, value => { another(); form.component = value; form.architecture = value === 'linux-terminal' ? 'arm64' : 'amd64'; form.data_policy = 'same-format'; form.schema_from = undefined; form.schema_to = undefined; form.maa_version = undefined; rows.value = []; cursor.value = null; void refresh() })
function choose(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; form.size_bytes = file.value?.size ?? 0 }
async function submit() {
  if (!file.value || busy.value) return
  if (file.value.size > 5 * 1024 ** 3) { error.value = '版本包不能超过5GiB'; return }
  busy.value = true; error.value = ''; notice.value = ''; progress.value = 0; controller = new AbortController()
  try {
    const row = await componentApi.createRelease({ ...form })
    if (disposed) return
    if (row.state === 'published') { notice.value = '该版本已发布'; return }
    const grant = await componentApi.uploadRelease(row.release_id)
    if (disposed) return
    await uploadRelease(grant.url, grant.headers, file.value, value => { progress.value = value }, controller.signal)
    if (!disposed) notice.value = '上传完成，请在列表校验并发布；发布不会自动安装。'
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '上传未确认，保留版本身份以便重试' }
  finally { if (!disposed) { busy.value = false; controller = undefined; await refresh() } }
}
async function publish(row: ComponentRelease) {
  if (busy.value || disposed) return
  busy.value = true; error.value = ''
  try { await componentApi.publishRelease(row); if (!disposed) { notice.value = '后台校验已开始，不会自动升级组件。'; await refresh() } }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '版本发布未确认' }
  finally { if (!disposed) busy.value = false }
}
function another() { form.release_id = crypto.randomUUID(); form.version = ''; form.sha256 = ''; form.expected_image_id = ''; file.value = null; form.size_bytes = 0 }
onMounted(() => void refresh())
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timer); controller?.abort() })
</script>
<template>
 <section class="versions">
  <header><h2>版本库</h2><ElSelect v-model="unit" :disabled="busy" aria-label="组件版本库分类"><ElOption v-for="id in (['platform','linux-terminal','postgresql','s3','mqtt'] as const)" :key="id" :value="id" :label="componentLabel(id)" /></ElSelect><ElButton @click="refresh()">刷新</ElButton></header>
  <ElAlert v-if="error" :title="error" type="error" :closable="false" /><ElAlert v-if="notice" :title="notice" type="success" :closable="false" />
  <details class="upload-panel"><summary>上传新版本包</summary>
   <div class="upload-grid">
    <label>版本名称<ElInput v-model="form.version" :disabled="busy" maxlength="64" /></label>
    <label>原生组件版本<ElInput v-model="form.native_version" :disabled="busy" maxlength="64" /></label>
    <label>目标架构<ElSelect v-model="form.architecture" :disabled="busy || unit === 'linux-terminal'"><ElOption label="AMD64" value="amd64" /><ElOption label="ARM64" value="arm64" /></ElSelect></label>
    <label>兼容源版本<ElInput v-model="form.compatible_from" :disabled="busy" placeholder="例如17，同一主版本" maxlength="128" /></label>
    <label>候选镜像标签<ElInput v-model="form.candidate_image" :disabled="busy" maxlength="256" /></label>
    <label>镜像ID<ElInput v-model="form.expected_image_id" :disabled="busy" placeholder="sha256:…" /></label>
    <label>归档SHA-256<ElInput v-model="form.sha256" :disabled="busy" maxlength="64" /></label>
    <label v-if="unit === 'linux-terminal'">包内MaaFramework版本<ElInput v-model="form.maa_version" :disabled="busy" placeholder="可选，必须来自构建验证" /></label>
    <label>数据策略<ElSelect v-model="form.data_policy" :disabled="busy"><ElOption label="数据格式兼容" value="same-format" /><ElOption v-if="unit === 'platform'" label="平台Alembic迁移" value="alembic" /></ElSelect></label>
    <template v-if="form.data_policy === 'alembic'"><label>迁移起点<ElInput v-model="form.schema_from" :disabled="busy" /></label><label>迁移目标<ElInput v-model="form.schema_to" :disabled="busy" /></label></template>
    <label class="wide">docker save版本包（tar，最多5GiB）<input type="file" accept=".tar" :disabled="busy" @change="choose" /></label>
   </div>
   <ElProgress v-if="busy" :percentage="progress" /><ElButton :disabled="!file || busy" :loading="busy" @click="submit">上传版本包</ElButton><ElButton :disabled="busy" @click="another">填写另一版本</ElButton>
  </details>
  <ElTable :data="rows" empty-text="尚无组件发布版本"><ElTableColumn prop="version" label="版本" /><ElTableColumn prop="native_version" label="原生版本" /><ElTableColumn prop="architecture" label="架构" /><ElTableColumn label="状态"><template #default="{ row }">{{ labels[row.state as keyof typeof labels] }}</template></ElTableColumn><ElTableColumn prop="error_code" label="校验结果" /><ElTableColumn label="操作"><template #default="{ row }"><ElButton v-if="['draft','failed'].includes(row.state)" :disabled="busy" @click="publish(row as ComponentRelease)">校验并发布</ElButton></template></ElTableColumn></ElTable>
  <ElButton v-if="cursor" @click="refresh(true)">加载更多版本</ElButton>
 </section>
</template>
<style scoped>
.versions{display:grid;gap:16px;min-width:0}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}h2{margin:0;font-size:18px}header .el-select{width:210px}.upload-panel{padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}summary{cursor:pointer;font-weight:600}.upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;margin:16px 0}label{display:grid;gap:6px;min-width:0}input[type=file]{max-width:100%}.wide{grid-column:1/-1}.el-input,.el-select{width:100%}
</style>
