import { normalizeApiError } from '../../shared/api/client'

export function loginErrorMessage(cause: unknown): string {
  const error = normalizeApiError(cause)
  if (error.code === 'admin_csrf_rejected') return '当前访问地址未通过安全校验，请使用部署配置中的平台地址；这不是密码错误。'
  if (error.status === 429) return '登录尝试过于频繁，请等待一分钟后重试。'
  if (error.status === 401) return '管理员密码不正确，可点击眼睛图标核对输入。'
  if (error.status === 503) return '登录服务尚未就绪，请检查管理员密码配置和平台状态。'
  if (error.code === 'network_error' || error.code === 'request_timeout') return error.message
  return '登录或页面跳转失败，请刷新后重试；若持续出现，请检查平台状态。'
}
