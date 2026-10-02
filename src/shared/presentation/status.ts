export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const labels: Record<string, string> = {
  accepting: '可接单',
  active: '活动中',
  android: 'Android',
  cancelled: '已取消',
  completed: '已完成',
  disabled: '已停用',
  draining: '停止接单中',
  ended: '已结束',
  failure: '失败',
  linux: 'Linux',
  loop: '循环任务',
  mounted: '挂载模式',
  offline: '离线',
  online: '在线',
  paused: '已暂停',
  module_process: '过程脚本',
  module_start: '开始脚本',
  module_end: '结束脚本',
  queued: '排队中',
  running: '执行中',
  single: '单次任务',
  batch: '批量任务',
  standalone: '独立模式',
  standard: '普通脚本',
  success: '成功',
  terminated: '已中止',
  terminating: '中止收尾中',
  timed: '定时任务',
  timed_out: '已超时',
  unassigned: '未分配',
  waiting: '等待中',
  validation_pending: '待验证',
  retired: '已停用',
}

const tones: Record<string, StatusTone> = {
  accepting: 'success',
  active: 'success',
  cancelled: 'neutral',
  completed: 'success',
  disabled: 'danger',
  draining: 'warning',
  ended: 'info',
  failure: 'danger',
  offline: 'neutral',
  online: 'success',
  paused: 'warning',
  queued: 'info',
  running: 'warning',
  success: 'success',
  terminated: 'neutral',
  terminating: 'warning',
  timed_out: 'danger',
  waiting: 'info',
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return '---'
  return labels[value] ?? value
}

export function statusTone(value: string | null | undefined): StatusTone {
  return value ? (tones[value] ?? 'info') : 'neutral'
}
