import { describe, expect, it } from 'vitest'

import { router } from '../src/app/router'

describe('application routes', () => {
  it('opens component management through an authenticated maintenance route', () => {
    expect(router.resolve('/maintenance/components').meta.title).toBe('组件管理')
  })
  it('uses separate URLs for task history and active schedules', () => {
    expect(router.resolve('/tasks/history').name).toBe('task-history')
    expect(router.resolve('/tasks/schedules').name).toBe('task-schedules')
  })

  it('has real routes for the first Stage 6 modules and a not-found boundary', () => {
    expect(router.resolve('/terminals').name).toBe('terminals')
    expect(router.resolve('/scripts').name).toBe('maa-library')
    expect(router.resolve('/missing').name).toBe('not-found')
  })
})
