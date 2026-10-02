import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../src/shared/api/client'
import { fetchScriptHistory } from '../src/shared/api/maa-script-history'
import type { ScriptDocument, WorkflowStep } from '../src/shared/api/maa-script-editor'
import { historyDifference } from '../src/modules/maa/editor/history-diff'

const documentWith = (steps: WorkflowStep[], settings: Record<string, unknown> = {}): ScriptDocument => ({
  version: 2,
  ...settings,
  steps,
})

afterEach(() => vi.restoreAllMocks())

describe('historyDifference', () => {
  it('ignores object key ordering when the persisted document is unchanged', () => {
    const before = documentWith([{
      action: 'wait',
      seconds: 5,
      extension: { before: true, after: 2 },
    }], { target: { application_package: 'org.example', channel: 'stable' } })
    const after = documentWith([{
      extension: { after: 2, before: true },
      seconds: 5,
      action: 'wait',
    }], { target: { channel: 'stable', application_package: 'org.example' } })

    expect(historyDifference(before, after)).toEqual({
      summary: '内容一致', lines: [], more: 0, changed: false,
    })
  })

  it('reports threshold and before/after wait changes with their old and new values', () => {
    const before = documentWith([{
      action: 'wait_image', threshold: 0.8,
      wait_before_execution_seconds: 1,
      wait_after_execution_seconds: 2,
    }])
    const after = documentWith([{
      action: 'wait_image', threshold: 0.9,
      wait_before_execution_seconds: 3,
      wait_after_execution_seconds: 4,
    }])

    const difference = historyDifference(before, after)
    expect(difference.summary).toBe('修改 1 步')
    expect(difference.lines).toEqual([
      '第 01 步 · 等待图片：匹配阈值 0.8 → 0.9；执行前等待 1 秒 → 3 秒；执行后等待 2 秒 → 4 秒',
    ])
  })

  it('summarizes image changes without exposing image base64', () => {
    const before = documentWith([{
      action: 'wait_image',
      template_base64: 'data:image/png;base64,BEFORE_TEMPLATE_SECRET',
      click_template_base64: 'data:image/png;base64,BEFORE_CLICK_SECRET',
    }])
    const after = documentWith([{
      action: 'wait_image',
      template_base64: 'data:image/png;base64,AFTER_TEMPLATE_SECRET',
      click_template_base64: 'data:image/png;base64,AFTER_CLICK_SECRET',
    }])

    const difference = historyDifference(before, after)
    expect(difference.lines[0]).toContain('识别图片已变更')
    expect(difference.lines[0]).toContain('点击图片已变更')
    expect(difference.lines.join('\n')).not.toContain('data:image/')
    expect(difference.lines.join('\n')).not.toContain('BEFORE_TEMPLATE_SECRET')
    expect(difference.lines.join('\n')).not.toContain('AFTER_CLICK_SECRET')
  })

  it('caps displayed lines at twenty and reports the remaining count', () => {
    const before = documentWith(Array.from({ length: 22 }, (_, index) => ({
      action: 'wait', seconds: index,
    })))
    const after = documentWith(Array.from({ length: 22 }, (_, index) => ({
      action: 'wait', seconds: index + 1,
    })))

    const difference = historyDifference(before, after)
    expect(difference.summary).toBe('修改 22 步')
    expect(difference.lines).toHaveLength(20)
    expect(difference.more).toBe(2)
  })
})

describe('fetchScriptHistory', () => {
  it('requests newest-first pages with a bounded twenty-item limit', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { items: [], next_after_revision: null },
    })
    const signal = new AbortController().signal

    await fetchScriptHistory('script/one', null, signal)
    await fetchScriptHistory('script/one', 40, signal)

    expect(get).toHaveBeenNthCalledWith(1, '/maa/scripts/script%2Fone/versions', {
      params: { newest_first: true, after_revision: undefined, limit: 20 }, signal,
    })
    expect(get).toHaveBeenNthCalledWith(2, '/maa/scripts/script%2Fone/versions', {
      params: { newest_first: true, after_revision: 40, limit: 20 }, signal,
    })
  })
})
