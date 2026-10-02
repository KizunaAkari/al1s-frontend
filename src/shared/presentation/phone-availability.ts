import type { TargetDevice } from '../api/terminals'

export function phoneAvailability(device: TargetDevice): { label: string; guidance: string } {
  if (device.mode !== 'mounted') return {
    label: '状态未确定', guidance: '请先将手机挂载到 Linux 终端。',
  }
  if (device.availability === 'connected') return {
    label: '已连接', guidance: '最近一次 ADB 探测已确认连接。',
  }
  if (device.availability_reason === 'status_refresh_failed') return {
    label: '状态未确定', guidance: '手机状态查询失败，请检查平台连接后刷新。',
  }
  if (device.availability_reason === 'terminal_offline') return {
    label: '终端离线', guidance: '先检查管理终端的网络和服务，再刷新手机状态。',
  }
  if (device.availability === 'unauthorized') return {
    label: '未授权', guidance: '请在手机上允许 USB 调试授权，然后刷新。',
  }
  if (device.availability === 'disconnected') return {
    label: '未连接', guidance: '请检查 USB 线、ADB 服务与手机连接，然后刷新。',
  }
  return { label: '状态未确定', guidance: '尚无有效 ADB 探测；请检查终端探测服务并刷新。' }
}
