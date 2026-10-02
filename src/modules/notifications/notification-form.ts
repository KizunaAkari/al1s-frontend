import type { NotificationChannel } from '../../shared/api/notifications'
export type ChannelKind = NotificationChannel['kind']
export const eventLabels: Record<string, string> = {
  script_failure: '脚本失败', conditional_skip: '条件跳过', storage_low: '存储空间不足',
  terminal_alert: '终端异常', operation_failure: '操作失败',
}
export function eventsFor(kind: ChannelKind) {
  return Object.fromEntries(Object.entries(eventLabels).filter(([event]) =>
    kind === 'qq' || (kind === 'discord' ? event === 'terminal_alert' : event !== 'conditional_skip')))
}
export function parseTargets(value: string, kind: ChannelKind, qqType: 'private' | 'group') {
  const entries = [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]
  if (!entries.length || entries.length > 50) throw new Error('请填写 1～50 个目标，每行一个')
  return entries.map(entry => {
    if (kind === 'smtp') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) throw new Error('请填写有效的收件邮箱')
      return entry
    }
    const prefix = kind === 'qq' ? qqType : 'channel'
    if (!/^\d+$/.test(entry)) throw new Error(kind === 'qq' ? 'QQ 号码或群号只能填写数字' : '频道 ID 只能填写数字')
    return `${prefix}:${entry}`
  })
}
