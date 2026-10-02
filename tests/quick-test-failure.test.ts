import { expect, it } from 'vitest'
import { quickTestFailureLines, quickTestFailureReason } from '../src/modules/maa/editor/quick-test-failure'
import type { QuickTestFailureDetail } from '../src/shared/api/maa-quick-test'

const detail: QuickTestFailureDetail = { step_number: 7, script_name: '单步脚本', rule_name: null,
  stage: 'post_assertion', algorithm: 'OCR', best_score: null, threshold: null,
  consecutive_misses: 0, timeout_seconds: null, elapsed_seconds: null }
it('keeps absent matching facts absent and identifies an assertion', () => {
  const text = quickTestFailureLines(detail).join('\n')
  expect(text).toContain('第 7 步')
  expect(text).toContain('执行后断言识别')
  expect(text).toContain('文字识别 · 未取得候选匹配分数')
  expect(text).not.toContain('阈值')
  expect(text).not.toContain('连续 0 次')
})
it('formats measured scores without losing zero', () => {
  const text = quickTestFailureLines({ ...detail, best_score: 0, threshold: 0.8, consecutive_misses: 1 }).join('\n')
  expect(text).toContain('最高匹配分数 0 · 阈值 0.8')
})
it('uses a readable fallback for older or unknown codes', () => {
  expect(quickTestFailureReason('private-code')).toContain('终端返回了错误')
})
