import axios, { AxiosError } from 'axios'

type ErrorPayload = {
  code?: string
  message?: string
  detail?: string | Array<{ loc?: Array<string | number>; msg?: string }>
  request_id?: string
  context?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly code: string
  readonly requestId?: string
  readonly status?: number
  readonly context?: Record<string, unknown>

  constructor(message: string, options: { code: string; requestId?: string; status?: number; context?: Record<string, unknown> }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.requestId = options.requestId
    this.status = options.status
    this.context = options.context
  }
}

function validationMessage(detail: ErrorPayload['detail']): string | undefined {
  if (!Array.isArray(detail)) return typeof detail === 'string' ? detail : undefined
  return detail
    .map((item) => {
      const location = item.loc?.slice(1).join('.')
      return location ? `${location}：${item.msg ?? '参数无效'}` : item.msg
    })
    .filter(Boolean)
    .join('；')
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!(error instanceof AxiosError) && !axios.isAxiosError(error)) {
    return new ApiError(error instanceof Error ? error.message : '发生未知错误，请重试。', { code: 'unknown_error' })
  }

  const axiosError = error as AxiosError<ErrorPayload>
  const payload = axiosError.response?.data
  const requestId = payload?.request_id ?? axiosError.response?.headers['x-request-id']

  if (axiosError.code === AxiosError.ECONNABORTED) {
    return new ApiError('请求超时，请检查平台状态后重试。', {
      code: 'request_timeout',
      requestId,
      status: axiosError.response?.status,
    })
  }
  if (!axiosError.response) {
    return new ApiError('无法连接平台后端，请检查网络或服务状态。', {
      code: 'network_error',
      requestId,
    })
  }

  return new ApiError(
    payload?.message ?? validationMessage(payload?.detail) ?? `请求失败（HTTP ${axiosError.response.status}）`,
    {
      code: payload?.code ?? `http_${axiosError.response.status}`,
      requestId,
      status: axiosError.response.status,
      context: payload?.context,
    },
  )
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const requestId = globalThis.crypto?.randomUUID?.()
    ?? `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`
  config.headers.set('X-Request-ID', requestId)
  config.headers.set('X-AL1S-CSRF', '1')
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error)),
)
