<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElOption, ElSelect } from 'element-plus'
import { componentApi, componentLabel, type ComponentRelease, type ComponentPreflight, type ComponentOperation, type InventoryEntry } from '../../shared/api/components'
const props = defineProps<{ row: InventoryEntry | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const versions = ref<ComponentRelease[]>([]), selected = ref(''), check = ref<ComponentPreflight | null>(null)
const operation = ref<ComponentOperation | null>(null), busy = ref(false), error = ref(''), key = ref('')
const labels = { accepted: '等待执行', preparing: '校验与备份', switching: '切换组件', verifying: '核对版本与健康', succeeded: '升级成功', failed_safe: '升级未成功，原版本已核实', unknown: '结果未知，需检查恢复' }
const reasons: Record<string, string> = { component_mismatch: '发布包与所选组件不符', component_not_ready: '当前版本或健康状态尚未确认', architecture_mismatch: '发布包不支持当前架构', source_version_incompatible: '当前版本不在此发布包的兼容范围内', postgres_major_migration_required: '跨 PostgreSQL 主版本需要专门迁移方案', component_data_migration_required: '跨主版本的数据格式迁移尚未验证', component_version_unpublished: '版本包尚未通过校验并发布', component_host_unconfigured: '独立维护执行器尚未配置', component_active_work: '存在活动任务、调试或尚未完成的升级' }
const selectedVersion = computed(() => versions.value.find(row => row.release_id === selected.value))
const targetVersion = computed(() => props.row?.component === 'maa' ? selectedVersion.value?.maa_version ?? '包内Maa版本未记录' : check.value?.target_version)
let timer: ReturnType<typeof setTimeout> | undefined, generation = 0, disposed = false
watch(() => props.row, async row => {
  const request = ++generation; clearTimeout(timer); selected.value = ''; check.value = null; operation.value = null; error.value = ''; key.value = crypto.randomUUID()
  if (!row) return
  busy.value = true
  try { const page = await componentApi.releases(row.upgrade_unit); if (!disposed && request === generation) versions.value = page.items.filter(v => v.state === 'published' && v.architecture === row.architecture) }
  catch (cause) { if (request === generation) error.value = String(cause instanceof Error ? cause.message : '无法读取可升级版本') }
  finally { if (request === generation) busy.value = false }
}, { immediate: true })
async function preflight() {
  if (!props.row || !selected.value || busy.value) return
  const request = generation, target = props.row.target, release = selected.value
  busy.value = true; error.value = ''; check.value = null
  try { const result = await componentApi.preflight(target, release); if (!disposed && request === generation) check.value = result }
  catch (cause) { if (!disposed && request === generation) error.value = cause instanceof Error ? cause.message : '预检未通过' }
  finally { if (!disposed && request === generation) busy.value = false }
}
async function start() {
  if (!props.row || !check.value?.allowed || busy.value) return
  const request = generation, confirmed = check.value
  busy.value = true; error.value = ''
  try { const result = await componentApi.start({ component: confirmed.component, target: confirmed.target, release_id: confirmed.release_id, expected_source: confirmed.expected_source, idempotency_key: key.value }); if (!disposed && request === generation) { operation.value = result; void poll() } }
  catch (cause) { if (!disposed && request === generation) error.value = cause instanceof Error ? cause.message : '升级请求未确认，请刷新核对' }
  finally { if (!disposed && request === generation) busy.value = false }
}
async function poll() {
  const current = operation.value, request = generation
  if (!current || disposed) return
  try { const result = await componentApi.operation(current.operation_id); if (!disposed && request === generation) operation.value = result }
  catch {
    if (current.status_token && !disposed && request === generation) try { const receipt = await componentApi.standaloneStatus(current.operation_id, current.status_token); if (!disposed && request === generation) operation.value = { ...current, ...receipt } } catch { if (!disposed && request === generation) error.value = '升级期间平台暂不可用，保留本次操作身份，稍后核对进度。' }
  }
  if (disposed || request !== generation) return
  if (operation.value && ['succeeded', 'failed_safe'].includes(operation.value.state)) emit('changed')
  else timer = setTimeout(() => void poll(), 2000)
}
async function reconcile() {
  if (!operation.value || busy.value) return
  const request = generation, identity = operation.value.operation_id
  busy.value = true
  try { const result = await componentApi.reconcile(identity); if (!disposed && request === generation) operation.value = result }
  catch (cause) { if (!disposed && request === generation) error.value = cause instanceof Error ? cause.message : '无法确认实际部署，锁定继续保留' }
  finally { if (!disposed && request === generation) busy.value = false }
}
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timer) })
</script>
<template>
 <ElDialog :model-value="Boolean(row)" title="组件升级" width="min(640px, 94vw)" @close="emit('close')">
  <div class="upgrade-content" v-if="row">
   <strong>{{ componentLabel(row.component) }} · {{ row.display_name }}</strong><p>当前版本：{{ row.version ?? '未知' }}</p>
   <ElAlert v-if="error" :title="error" type="error" :closable="false" />
   <template v-if="!operation">
    <label>已校验的目标版本<ElSelect v-model="selected" :disabled="busy" aria-label="选择组件升级版本" @change="check = null">
    <ElOption v-for="version in versions" :key="version.release_id" :value="version.release_id" :disabled="row.component === 'maa' && !version.maa_version" :label="version.version + ' · ' + (row.component === 'maa' ? version.maa_version ?? 'Maa版本未记录' : version.native_version)" />
    </ElSelect></label>
    <p v-if="!versions.length && !busy">暂无匹配架构的已发布版本，请先在版本库上传并校验。</p>
    <ElButton :disabled="!selected || busy" :loading="busy" @click="preflight">检查兼容性与影响</ElButton>
    <div v-if="check" class="preflight"><p>目标版本：{{ targetVersion }}</p><p>影响服务：{{ check.affected_services.join('、') }}</p><p v-if="check.backup_required">执行器将先验证恢复点，并在维护窗口内切换。</p>
     <ElAlert v-if="!check.allowed" :title="'预检未通过：' + check.reasons.map(value => reasons[value] ?? value).join('；')" type="warning" :closable="false" />
     <p>本次升级可能暂时断开页面或终端连接。确认后只执行这一次操作，结果未知时保持锁定。</p>
    </div>
   </template>
   <section v-else class="operation"><h3>{{ labels[operation.state] }}</h3><p>阶段：{{ operation.stage }}</p><p v-if="operation.error_code">原因：{{ operation.error_code }}</p><small>操作编号：{{ operation.operation_id }}</small>
    <ElButton v-if="operation.state === 'unknown'" :loading="busy" @click="reconcile">检查实际部署并恢复</ElButton>
   </section>
  </div>
  <template #footer><ElButton @click="emit('close')">收起</ElButton><ElButton v-if="!operation" type="primary" :disabled="!check?.allowed || busy" :loading="busy" @click="start">确认升级</ElButton></template>
 </ElDialog>
</template>
<style scoped>
.upgrade-content{display:grid;gap:14px;min-width:0}label{display:grid;gap:6px}p{margin:0;line-height:1.6;overflow-wrap:anywhere}small{color:var(--muted);overflow-wrap:anywhere}.preflight,.operation{display:grid;gap:12px;padding:14px;border:1px solid var(--border);border-radius:8px}h3{margin:0}.el-select{width:100%}
</style>
