<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { onBeforeUnmount, ref } from 'vue'
import { ApiError } from '../../shared/api/client'
import { ElButton, ElDialog, ElAlert, ElMessageBox, ElTable, ElTableColumn, ElSelect, ElOption } from 'element-plus'
import { linuxReleases, type LinuxRelease } from '../../shared/api/linux-releases'
import { hostMaintenance, maintenanceActive, type HostHealth as Health,
  type HostCommand as Command, type MaintenanceImpact as Impact } from '../../shared/api/host-maintenance'

const props = defineProps<{ terminalId: string; name: string }>()
const affected = ref<Impact | null>(null)
const releases = ref<LinuxRelease[]>([])
const selectedRelease = ref('')
const releasesError = ref('')
async function loadReleases() {
  releasesError.value = ''
  try { releases.value = (await linuxReleases.list(0, 100)).filter((item) => item.state === 'published') }
  catch { releasesError.value = '发布版本读取失败，请刷新；不影响重启功能。' }
}
const opened = ref(false)
const busy = ref(false)
const health = ref<Health | null>(null)
const result = ref<Command | null>(null)
const error = ref('')
const recoveryNotice = ref('')
const pendingId = ref<string | null>(null)
const sentAt = ref(0)
const waitExpired = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let polling = false
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
async function refresh() {
  busy.value = true; error.value = ''; health.value = null
  try { health.value = await hostMaintenance.health(props.terminalId) }
  catch { error.value = '宿主管理通道未配置或不可达，当前不能下发重启。业务终端状态与管理通道独立。' }
  finally { busy.value = false }
}
async function inspectUpgrade() {
  const identity = health.value?.unresolved_upgrade_id
  if (!identity || busy.value || health.value?.upgrade_in_progress || pendingId.value) return
  busy.value = true
  error.value = ''
  recoveryNotice.value = ''
  try {
    const value = await hostMaintenance.recover(props.terminalId, identity)
    const reasons: Record<string, string> = {
      host_restart_required_to_exclude_orphan_operations: '尚不能排除遗留操作，请确认风险后重启Linux主机，再检查恢复。',
      deployment_helpers_require_inspection: '发现遗留部署容器，需核对处理后再检查，不能直接清锁。',
      database_or_cutover_requires_inspection: '数据库迁移或切换可能中断，需要检查当前数据，不能自动覆盖或清锁。',
      candidate_identity_or_health_unconfirmed: '候选或原版本镜像、健康状态尚未确认，保留升级锁定。',
      database_integrity_or_revision_unconfirmed: '数据库完整性或迁移版本未通过核验，保留升级锁定。',
      legacy_deployment_requires_inspection: '旧部署记录缺少恢复证据，需要人工核对。',
      deployment_record_missing: '缺少部署记录，不能仅凭重启解除升级锁定。',
    }
    recoveryNotice.value = value.resolved
      ? `原升级已对账：${value.status === 'succeeded' ? '成功' : '未成功但已安全结算'}。未重复执行升级。`
      : reasons[value.reason ?? ''] ?? '证据不足，保留升级锁定，请检查终端部署记录。'
    await refresh()
  } catch {
    error.value = '恢复检查未确认，请刷新状态核对；不会自动重发升级或清理数据。'
  } finally { busy.value = false }
}
async function show() {
  clearTimeout(timer)
  opened.value = true
  void loadReleases()
  try {
    const saved = sessionStorage.getItem('al1s.host-command.' + props.terminalId)
    if (saved) {
      const value = JSON.parse(saved)
      if (typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id)
          || !Number.isFinite(value.sentAt) || value.sentAt <= 0) {
        throw new Error('invalid_saved_command')
      }
      pendingId.value = value.id; sentAt.value = value.sentAt
    }
  }
  catch { error.value = '浏览器存储不可用，无法安全保存命令身份。'; return }
  await refresh()
  try {
    const latest = await hostMaintenance.latest(props.terminalId)
    if (latest && (!pendingId.value || latest.command_id === pendingId.value)) {
      result.value = latest
      if (maintenanceActive(latest.state)) {
        pendingId.value = latest.command_id; sentAt.value = latest.accepted_at
        waitExpired.value = false
      }
    }
  } catch {
    health.value = null
    error.value = '平台命令记录读取失败，请稍后刷新核对；不要重复提交重启。'
  }
  if (pendingId.value) void poll()
}
async function poll() {
  clearTimeout(timer)
  if (!pendingId.value || disposed || polling) return
  polling = true
  try {
    result.value = await hostMaintenance.command(props.terminalId, pendingId.value)
    if (!maintenanceActive(result.value.state)) {
      sessionStorage.removeItem('al1s.host-command.' + props.terminalId)
      pendingId.value = null
      waitExpired.value = false
      await refresh()
      return
    }
  } catch { error.value = '命令结果暂未确认，只查询、不自动重发重启。' }
  finally { polling = false }
  const budget = result.value?.started_at && result.value.action === 'upgrade_container' ? 1800 : 600
  if (Date.now() / 1000 >= (result.value?.started_at ?? sentAt.value) + budget) {
    waitExpired.value = true
    error.value = result.value?.started_at
      ? '终端离线或维护结果未确认：执行等待已超时。不能据此判断命令未执行。'
      : '命令响应等待已超时，不能据此判断命令未执行。请核对设备后再操作。'
    return
  }
  if (!disposed) timer = setTimeout(() => void poll(), 10000)
}
async function finishWaiting() {
  if (!waitExpired.value) return
  try {
    await ElMessageBox.confirm('结束本地等待不会取消已经接收的重启命令。请先核对设备，避免重复重启。', '确认已核对', { type: 'warning' })
  } catch { return }
  sessionStorage.removeItem('al1s.host-command.' + props.terminalId)
  pendingId.value = null; waitExpired.value = false; result.value = null
  await refresh()
}
async function restart(action: 'restart_container' | 'restart_host' | 'upgrade_container') {
  if (!health.value || busy.value || pendingId.value) return
  if (health.value.upgrade_in_progress) {
    error.value = '升级仍在执行，请等待升级结果或执行超时后再核对风险。'
    return
  }
  const target = health.value
  const upgrading = action === 'upgrade_container'
  const release = releases.value.find((item) => item.release_id === selectedRelease.value)
  if (upgrading && (!release || target.unresolved_upgrade_id)) {
    error.value = '请选择已发布版本，并先完成旧升级结果对账。'
    return
  }
  busy.value = true
  affected.value = null
  try {
    affected.value = await hostMaintenance.impact(props.terminalId)
  } catch {
    error.value = '无法读取受影响任务，请恢复平台连接后再重启。'
    busy.value = false
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认${upgrading ? '升级到 ' + release?.version : action === 'restart_host' ? '重启Linux主机' : '重启终端容器'}“${props.name}”？平台当前记录${affected.value.truncated ? '至少' : ''}${affected.value.items.length}项活动执行（见清单）。运行任务可能被中断；先尽力保存，90秒收尾超时后仍允许执行维护。结果不明的任务不会自动重跑。`,
      '确认中断任务', { type: 'warning', confirmButtonText: upgrading ? '确认中断并升级' : '确认中断并重启' },
    )
    if (target.unresolved_upgrade_id) {
      await ElMessageBox.confirm(
        `升级“${target.unresolved_upgrade_id}”的结果仍未知，Docker可能仍在执行升级或数据库迁移。重启可能中断这些操作。重启不会把该升级记为成功，也不会解除再次升级的锁定。`,
        '确认升级风险', { type: 'warning', confirmButtonText: '已了解升级风险，仍然重启' },
      )
    }
  } catch { busy.value = false; return }
  const id = crypto.randomUUID()
  result.value = null; waitExpired.value = false; error.value = ''
  try {
    sentAt.value = Date.now() / 1000
    sessionStorage.setItem('al1s.host-command.' + props.terminalId, JSON.stringify({ id, sentAt: sentAt.value }))
    pendingId.value = id
    const common = {
      command_id: id, expires_at: Date.now() / 1000 + 600,
      confirm_interrupt: true as const, expected_boot_id: target.boot_id,
      expected_container_id: target.container_id,
      expected_container_started_at: target.container_started_at,
    }
    result.value = action === 'upgrade_container'
      ? await hostMaintenance.upgrade(props.terminalId, {
        ...common, action, release_id: release!.release_id,
      })
      : await hostMaintenance.submit(props.terminalId, {
      ...common, action,
      confirmed_upgrade_id: target.unresolved_upgrade_id ?? null,
    })
  } catch (cause) {
    const code = cause instanceof ApiError ? cause.code : ''
    if (['host_management_not_configured', 'host_management_unreachable_or_unknown',
      'host_identity_changed', 'command_deadline_invalid', 'maintenance_conflict',
      'upgrade_risk_confirmation_required',
      'upgrade_in_progress', 'previous_upgrade_unresolved', 'published_linux_release_not_found',
      'command_identity_conflict'].includes(code)) {
      sessionStorage.removeItem('al1s.host-command.' + props.terminalId)
      pendingId.value = null
      health.value = null
      error.value = '平台拒绝下发：管理通道不可达、目标已变化或存在其他维护，请刷新核对。'
    } else {
      error.value = '命令提交未确认；保留命令身份并查询，不自动重发。'
    }
  }
  finally { busy.value = false; if (pendingId.value) void poll() }
}
</script>
<template>
  <ElButton size="small" @click="show">宿主维护</ElButton>
  <ElDialog v-model="opened" title="Linux宿主维护" width="min(680px, 95vw)">
    <ElAlert v-if="error" :title="error" type="warning" :closable="false" />
    <ElAlert v-if="recoveryNotice" :title="recoveryNotice" type="info" :closable="false" />
    <p v-if="health">管理通道已连接；业务容器健康：{{ health.healthy ? '健康' : '未通过' }}</p>
    <ElAlert v-if="health?.upgrade_in_progress" type="info" :closable="false"
      title="终端正在升级，暂不能执行其他维护操作。" />
    <ElAlert v-else-if="health?.unresolved_upgrade_id" type="warning" :closable="false"
      :title="`升级 ${health.unresolved_upgrade_id} 尚未结算：禁止再次升级；手动重启需要额外风险确认。`" />
    <template v-if="affected">
      <p>受影响执行快照：断网期间可能尚未补报；排队任务暂缓，运行任务可能中断。</p>
      <ElTable :data="affected.items" max-height="260" empty-text="平台当前无活动执行记录">
        <ElTableColumn prop="name" label="任务名称" />
        <ElTableColumn prop="status" label="执行状态" width="110" />
      </ElTable>
      <p v-if="affected.truncated">仅显示前100条；本次操作影响该终端全部任务。</p>
    </template>
    <p v-if="result">命令 {{ result.command_id }}：{{ result.state }} {{ result.error_code }}</p>
    <p v-if="result?.late_state">迟到回执：{{ result.late_state }}（原超时事实保留）</p>
    <p v-else-if="pendingId">待确认命令：{{ pendingId }}</p>
    <ElButton v-if="waitExpired" @click="finishWaiting">已核对设备，结束本次等待</ElButton>
    <template #header="{ titleId, titleClass }"><span :id="titleId" :class="titleClass">Linux宿主维护 </span></template>
    
    <ElAlert v-if="releasesError" :title="releasesError" type="warning" :closable="false" />
    <div class="maintenance-upgrade-row"><HelpHint subject="终端升级">升级响应上限10分钟，执行（含下载）上限30分钟；超时不自动重发或覆盖数据库。</HelpHint>
    <ElSelect v-model="selectedRelease" placeholder="选择已发布Linux版本" :disabled="busy || !!pendingId">
      <ElOption v-for="release in releases" :key="release.release_id" :value="release.release_id" :label="release.version" />
    </ElSelect>
    <ElButton @click="loadReleases">刷新版本</ElButton>
    <ElButton type="primary" :disabled="busy || !health || !!pendingId || !selectedRelease || !!health?.unresolved_upgrade_id"
      @click="restart('upgrade_container')">升级终端容器</ElButton>
    </div>
    <div class="maintenance-actions">
    <ElButton :loading="busy" @click="refresh">刷新状态</ElButton>
    <ElButton v-if="health?.unresolved_upgrade_id"
      :disabled="busy || !!pendingId || health.upgrade_in_progress" @click="inspectUpgrade">
      检查并恢复升级状态
    </ElButton>
    <ElButton :disabled="busy || !health || !!pendingId" @click="restart('restart_container')">重启终端容器</ElButton>
    <ElButton type="danger" :disabled="busy || !health || !!pendingId" @click="restart('restart_host')">重启Linux主机</ElButton>
    </div>
  </ElDialog>
</template>
<style scoped>
.maintenance-upgrade-row, .maintenance-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.maintenance-upgrade-row :deep(.el-select) { flex: 1 1 220px; min-width: 0; }
.maintenance-upgrade-row :deep(.el-button), .maintenance-actions :deep(.el-button) { margin: 0; }
</style>
