export type BotPanel = 'connection' | 'runtime' | 'records' | 'interaction'
export type BotContainerState = { running: boolean; status: string; health: string; revision: string; started_at: string | null }
export const botPanels = [
  { id: 'connection', label: '连接配置', group: '连接与运行', description: '管理当前连接的基础身份与平台接入。', keywords: '地址 Token 注册码' },
  { id: 'runtime', label: '运行维护', group: '连接与运行', description: '查看容器状态、运行操作与 QQ 原生管理入口。', keywords: '启动 停止 重启 原生 登录' },
  { id: 'records', label: '应用记录', group: '连接与运行', description: '查看配置目标版本、应用状态与历史记录。', keywords: '版本 历史' },
  { id: 'interaction', label: '互动表情', group: '功能设置', description: '配置摸摸、配字及头像合成的使用范围与发送限制。', keywords: '摸摸 权限 群聊 频道 冷却 频率 表情包工坊 内容 图片 素材 模板' },
] as const
const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
export function formatBotClock(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : clock.format(date)
}
export function botContainerLabel(value: BotContainerState | null) {
  return !value ? '未知' : value.status === 'restarting' ? '重启中' : value.running ? '运行中' : '已停止'
}
export function botHealthLabel(value: BotContainerState | null) {
  return !value ? '未知' : ({ healthy: '正常', unhealthy: '异常', starting: '检查中', not_configured: '未配置' } as Record<string, string>)[value.health] ?? '异常'
}
