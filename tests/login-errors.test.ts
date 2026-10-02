import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/shared/api/client'
import { loginErrorMessage } from '../src/modules/auth/loginErrors'

describe('login errors', () => {
  it('does not blame password for CSRF rejection', () => {
    expect(loginErrorMessage(new ApiError('', { code: 'admin_csrf_rejected', status: 403 }))).toContain('不是密码错误')
  })
  it('explains rate limiting separately', () => {
    expect(loginErrorMessage(new ApiError('', { code: 'admin_login_unavailable', status: 429 }))).toContain('一分钟')
  })
  it('explains incorrect passwords', () => {
    expect(loginErrorMessage(new ApiError('', { code: 'admin_login_failed', status: 401 }))).toContain('眼睛图标')
  })
})
