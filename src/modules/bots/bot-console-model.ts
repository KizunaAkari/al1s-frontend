export type BotPanel = 'runtime' | 'records' | 'interaction' | 'quant' | 'ai' | 'drawing'
export type BotContainerState = { running: boolean; status: string; health: string; revision: string; started_at: string | null }
export const botPanels = [
  { id: 'runtime', label: '运维面板', group: '连接与运行', description: '管理连接配置和 Bot 运行维护。', keywords: '运行维护 连接配置 启动 停止 重启 原生 登录 地址 Token 注册码' },
  { id: 'records', label: '运行日志', group: '连接与运行', description: '查看容器、后端和网关日志。', keywords: '日志 容器 后端 网络' },
  { id: 'interaction', label: '互动表情', group: '功能设置', description: '配置摸摸、配字及头像合成的使用范围与发送限制。', keywords: '摸摸 权限 群聊 频道 冷却 频率 表情包工坊 内容 图片 素材 模板' },
  { id: 'quant', label: '模拟交易', group: '功能设置', description: '配置模拟交易、历史回测和 QQ 指令。', keywords: '量化 回测 模拟 股票 AKQuant AKShare 指令' },
  { id: 'ai', label: 'AI 对话', group: '功能设置', description: '配置人格、模型服务、图片与语音对话。', keywords: 'AI 大模型 对话 人格 图片 语音 API' },
  { id: 'drawing', label: 'AI 绘图', group: '功能设置', description: '管理 ComfyUI 工作流、群模式和绘图任务。', keywords: '生图 图生图 工作流 LoRA 绿色 R18 ComfyUI' },
] as const
export function navigateBotTabs(event: KeyboardEvent) {
  const container = event.currentTarget as HTMLElement
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not(:disabled)'))
  const index = tabs.indexOf(event.target as HTMLButtonElement)
  if (index < 0 || !tabs.length) return
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  tabs[next]?.focus()
  tabs[next]?.click()
}
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
  return !value ? '未知' : ({ healthy: '正常', unhealthy: '异常', starting: '检查中', not_configured: '未配置' } as Record<string, string>)[value.health] ?? '未知'
}
