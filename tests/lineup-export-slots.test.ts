import { describe, expect, it } from 'vitest'
import { lineupExportSlots } from '../src/modules/lineup/lineup-export-slots'
import { buildPairCopyText, buildSideCopyText, canCopySide } from '../src/modules/lineup/lineup-utils'

describe('ArcGM six-slot exports', () => {
  it.each([
    [[10001, 10023, 20052, 20053], [10001, 10023, 0, 0, 20052, 20053]],
    [[10100, 20052, 20053], [10100, 0, 0, 0, 20052, 20053]],
    [[10001, 10026, 10017, 10023, 20053], [10001, 10026, 10017, 10023, 20053, 0]],
    [[10001, 13009, 16000], [10001, 13009, 16000, 0, 0, 0]],
    [[10099, 26000, 23000], [10099, 0, 0, 0, 26000, 23000]],
  ])('pads only the empty slots of %j', (input, expected) => {
    expect(lineupExportSlots(input)).toEqual(expected)
    expect(buildSideCopyText(input, 'attack', true, true, input.length)).toBe(expected.join(','))
  })

  it.each([[], [999], [30000], [20052], [10001, 10002, 10003, 10004, 10005], [10001, 20000, 20001, 20002], [10001, 0], [NaN], [10001.5]].map(input => ({ input })))('rejects an invalid compact team $input', ({ input }) => {
    expect(lineupExportSlots(input)).toBeNull()
    expect(canCopySide(input, 'attack', true, true, input.length)).toBe(false)
  })

  it('keeps full teams and support order unchanged without mutating the review', () => {
    const ids = [10001, 10026, 13009, 10099, 20053, 20052]
    expect(lineupExportSlots(ids)).toEqual(ids)
    expect(lineupExportSlots(ids)).not.toBe(ids)
  })

  it('requires confirmation, uniqueness and both sides for a pair', () => {
    const review = [10001, 20053, null, null, null, null, 10023, 20052, null, null, null, null]
    expect(buildPairCopyText(review, true, ['attack', 'defense'], { attack: 2, defense: 2 }))
      .toBe('10001,0,0,0,20053,0\t10023,0,0,0,20052,0')
    expect(buildPairCopyText(review, true, ['attack'], { attack: 2 })).toBeNull()
    expect(buildSideCopyText(review, 'attack', false, true, 2)).toBeNull()
    expect(buildSideCopyText(review, 'attack', true, true, 3)).toBeNull()
    expect(buildSideCopyText([10001, 10001], 'attack', true, true, 2)).toBeNull()
  })
})
