import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { coreWorkflowActions, parseScriptDocument } from '../src/shared/api/maa-script-contract'

const examples = JSON.parse(readFileSync(resolve(process.cwd(), '../backend/al1s-backend/contracts/maa-dsl-v2.examples.json'), 'utf8'))

it('reads the shared v2 example and retains extension fields', () => {
  expect(coreWorkflowActions).toEqual(examples.core_actions)
  const document = { ...examples.valid, extension_hint: { source: 'import' } }
  expect(parseScriptDocument(document)).toBe(document)
  expect(parseScriptDocument(document).steps.map(step => step.action)).toEqual([
    'wait', 'tap', 'swipe', 'wait_text',
  ])
  expect(parseScriptDocument(examples.valid_complex).steps[0]?.action).toBe('wait_click')
})

it('rejects the shared malformed action before opening the editor', () => {
  expect(() => parseScriptDocument(examples.invalid)).toThrow('脚本步骤格式无效')
  expect(() => parseScriptDocument({ steps: [] })).toThrow('不支持的脚本文档版本')
})

it('rejects wrong known field types while preserving unknown extensions', () => {
  expect(() => parseScriptDocument(examples.invalid_typed)).toThrow('脚本步骤格式无效')
  expect(() => parseScriptDocument(examples.invalid_complex)).toThrow('脚本步骤格式无效')
  expect(() => parseScriptDocument(examples.invalid_branch)).toThrow('脚本步骤格式无效')
  const extended = { ...examples.valid, steps: [{ action: 'custom_extension', payload: { tag: 7 } }] }
  expect(parseScriptDocument(extended)).toBe(extended)
  expect(() => parseScriptDocument({ version: 2, steps: [
    { action: 'wait_click', click_mode: null },
  ] })).toThrow('脚本步骤格式无效')
  expect(() => parseScriptDocument({ version: 2, steps: [
    { action: 'wait_text', search_region: { x: 1, y: 2, width: 3, height: 4, extra: 5 } },
  ] })).toThrow('脚本步骤格式无效')
})
