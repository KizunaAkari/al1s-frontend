<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInput, ElProgress,
  ElTable, ElTableColumn, ElMessageBox } from 'element-plus'
import { linuxReleases, uploadRelease, type LinuxRelease, type ReleaseInput } from '../../shared/api/linux-releases'

const rows = ref<LinuxRelease[]>([])
const offset = ref(0)
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const progress = ref(0)
const file = ref<File | null>(null)
const form = reactive<ReleaseInput>({ release_id: crypto.randomUUID(), version: '',
  architecture: 'arm64', size_bytes: 0, sha256: '', candidate_image: '', expected_image_id: '' })
const labels: Record<LinuxRelease['state'], string> = {
  draft: '待上传/发布', queued: '等待校验', verifying: '正在校验', published: '已发布', failed: '校验未通过',
}
const uploadController = shallowRef<AbortController | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); uploadController.value?.abort() })
onMounted(() => void refresh())
async function refresh() {
  if (loading.value || disposed) return
  clearTimeout(timer)
  loading.value = true
  try { rows.value = await linuxReleases.list(offset.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '版本读取失败' }
  finally {
    loading.value = false
    if (!disposed && rows.value.some((row) => ['queued', 'verifying'].includes(row.state))) {
      timer = setTimeout(() => void refresh(), 10000)
    }
  }
}
function choose(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  form.size_bytes = file.value?.size ?? 0
}
function resume(row: LinuxRelease) {
  Object.assign(form, Object.fromEntries(Object.keys(form).map((key) => [key, row[key as keyof ReleaseInput]])))
  notice.value = '已选择原发布记录。请选择对应镜像tar文件后重新上传；版本内容不能更改。'
}
async function submit() {
  if (!file.value || busy.value) return
  if (file.value.size !== form.size_bytes || form.size_bytes > 5 * 1024 ** 3) {
    error.value = '文件大小必须匹配版本记录，且不超过5GiB。'; return
  }
  busy.value = true; error.value = ''; notice.value = ''; progress.value = 0
  uploadController.value = new AbortController()
  try {
    const release = await linuxReleases.create({ ...form })
    if (release.state === 'published') { notice.value = '此版本已发布，不重复上传。'; return }
    const grant = await linuxReleases.upload(release.release_id)
    await uploadRelease(grant.url, grant.headers, file.value, (value) => { progress.value = value }, uploadController.value.signal)
    notice.value = '文件上传完成，请在列表点击“校验并发布”。发布不会自动升级终端。'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '上传失败，保留原发布身份' }
  finally { busy.value = false; uploadController.value = null; await refresh() }
}
async function publish(row: LinuxRelease) {
  try { await ElMessageBox.confirm(`确认校验并发布Linux版本 ${row.version}？发布后内容不可修改，不会自动执行升级。`, '发布版本') }
  catch { return }
  busy.value = true; error.value = ''
  try { await linuxReleases.publish(row); notice.value = '已提交后台校验，可离开此页。' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '发布请求未确认，请刷新核对。' }
  finally { busy.value = false; await refresh() }
}
function nextVersion() {
  Object.assign(form, { release_id: crypto.randomUUID(), version: '', sha256: '', candidate_image: '', expected_image_id: '' })
  form.size_bytes = file.value?.size ?? 0
}
async function page(delta: number) { offset.value = Math.max(0, offset.value + delta * 25); await refresh() }
</script>

<template>
  <section class="release-page">
    <h1>Linux终端版本与升级包 <HelpHint subject="Linux版本与升级包">先发布版本，再到终端管理选择目标终端升级。当前支持ARM64 Linux终端；不包含Android APK。</HelpHint></h1>
    
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElAlert v-if="notice" :title="notice" type="success" :closable="false" />
    <ElCard>
      <ElForm label-position="top" :disabled="busy" class="release-form">
        <ElFormItem label="版本号（唯一）"><ElInput v-model="form.version" maxlength="64" /></ElFormItem>
        <ElFormItem label="候选镜像标签"><ElInput v-model="form.candidate_image" placeholder="al1s-terminal-next:v1" /></ElFormItem>
        <ElFormItem label="镜像ID（构建产物sha256:…）"><ElInput v-model="form.expected_image_id" /></ElFormItem>
        <ElFormItem label="归档SHA-256（构建产物哈希）"><template #label>归档SHA-256（构建产物哈希） </template><ElInput v-model="form.sha256" maxlength="64" /></ElFormItem>
        <ElFormItem label="docker save导出的tar包，最大5GiB">
          <input type="file" accept=".tar" :disabled="busy" @change="choose" />
        </ElFormItem>
      </ElForm>
      <p>发布ID：{{ form.release_id }}</p>
      <ElProgress v-if="busy" :percentage="progress" />
      <ElButton type="primary" :loading="busy" :disabled="!file" @click="submit">上传升级包</ElButton>
      <ElButton :disabled="busy" @click="nextVersion">填写另一版本</ElButton>
      <ElButton v-if="uploadController" @click="uploadController.abort()">取消上传</ElButton>
    </ElCard>
    <ElCard>
      <ElButton :loading="loading" @click="refresh">刷新版本</ElButton>
      <ElTable :data="rows" empty-text="尚无Linux发布版本">
        <ElTableColumn prop="version" label="版本" />
        <ElTableColumn label="状态"><template #default="{ row }">{{ labels[row.state as LinuxRelease['state']] }}</template></ElTableColumn>
        <ElTableColumn prop="error_code" label="校验说明" />
        <ElTableColumn label="操作" min-width="200"><template #default="{ row }">
          <template v-if="['draft', 'failed'].includes(row.state)">
            <ElButton size="small" :disabled="busy" @click="resume(row as LinuxRelease)">重新上传</ElButton>
            <ElButton size="small" :disabled="busy" @click="publish(row as LinuxRelease)">校验并发布</ElButton>
          </template>
          <span v-else-if="row.state === 'published'">可在终端管理下发</span>
        </template></ElTableColumn>
      </ElTable>
      <ElButton :disabled="loading || offset === 0" @click="page(-1)">上一页</ElButton>
      <ElButton :disabled="loading || rows.length < 25" @click="page(1)">下一页</ElButton>
    </ElCard>
  </section>
</template>
<style scoped>
.release-page { display: grid; gap: 16px; }
.release-page h1 { margin: 0; font-size: 22px; }
.release-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 0 18px; }
.release-form :deep(.el-form-item), .release-form input { min-width:0; max-width:100%; }
p { overflow-wrap: anywhere; }
</style>
