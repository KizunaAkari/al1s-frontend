import { ApiError } from '../../../shared/api/client'
import type { TargetDevice } from '../../../shared/api/terminals'
import { phoneAvailability } from '../../../shared/presentation/phone-availability'

export function phonePreviewGuidance(device: TargetDevice): string {
  if (device.availability_reason === 'terminal_offline') return device.mode === 'standalone'
    ? '检查 APK 网络和后台服务，恢复后刷新。' : '检查 Linux 终端网络和服务，恢复后刷新。'
  if (device.availability === 'disconnected') return device.mode === 'standalone'
    ? '检查 APK 网络和本机辅助服务。' : '检查 USB 连接和 ADB 服务。'
  if (device.availability === 'unauthorized') return '请在手机上确认调试授权，再刷新。'
  return phoneAvailability(device).guidance
}

export function previewFailure(failure: unknown) {
  const api = failure instanceof ApiError ? failure : undefined
  const descriptions: Record<string, [string, string]> = {
    editor_capability_unavailable: ['预览暂不可用', '终端尚未提供预览能力，恢复连接后重试。'],
    editor_device_busy: ['手机正被其他会话使用', '可关闭旧会话后重连。'],
    network_error: ['无法连接平台', '检查网络或平台服务后重试。'],
    request_timeout: ['连接请求超时', '请稍后重试。'],
  }
  const [title, description] = descriptions[api?.code ?? ''] ?? (api?.status === 401
    ? ['登录已失效', '请重新登录平台。'] : api?.status === 403
      ? ['无权连接这台手机', '请检查当前访问权限。'] : ['连接失败', '请重试；详细原因见下方技术信息。'])
  const details = [
    { label: 'HTTP', value: api?.status === undefined ? '' : String(api.status) },
    { label: '错误码', value: api?.code ?? '' },
    { label: '请求 ID', value: api?.requestId ?? '' },
    { label: '原始信息', value: failure instanceof Error ? failure.message : '未提供详细信息' },
  ].filter(item => item.value)
  return { title, description, details }
}
