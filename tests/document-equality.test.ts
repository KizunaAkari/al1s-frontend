import { expect, it } from 'vitest'
import { sameDocument } from '../src/modules/maa/editor/document-equality'

it('ignores object order and absent undefined JSON fields, but preserves values and step order', () => {
  expect(sameDocument({ steps: [{ action: 'tap', x: 1, y: 2 }], extra: undefined },
    { steps: [{ y: 2, x: 1, action: 'tap' }] })).toBe(true)
  expect(sameDocument({ x: 1 }, { x: 2 })).toBe(false)
  expect(sameDocument({ x: 1 }, { x: '1' })).toBe(false)
  expect(sameDocument([{ action: 'tap' }, { action: 'back' }],
    [{ action: 'back' }, { action: 'tap' }])).toBe(false)
})
