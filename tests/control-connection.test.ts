import { expect, it } from 'vitest'
import { keyPacket, touchPacket } from '../src/modules/maa/editor/control-connection'

it('serializes only the supported home/back key shape', () => {
  const view = new DataView(keyPacket(1, 4))
  expect(view.byteLength).toBe(14)
  expect(view.getUint8(0)).toBe(0)
  expect(view.getUint8(1)).toBe(1)
  expect(view.getUint32(2)).toBe(4)
  expect(view.getUint32(6)).toBe(0)
})

it('encodes pointer zero with bounded image coordinates', () => {
  const view = new DataView(touchPacket(0, 50, 100, 576, 1280))
  expect(view.byteLength).toBe(32)
  expect(view.getUint8(0)).toBe(2)
  expect(view.getBigUint64(2)).toBe(0n)
  expect(view.getInt32(10)).toBe(50)
  expect(view.getInt32(14)).toBe(100)
  expect(view.getUint16(18)).toBe(576)
  expect(view.getUint16(22)).toBe(65535)
  expect(new DataView(touchPacket(1, 50, 100, 576, 1280)).getUint16(22)).toBe(0)
  expect(() => touchPacket(0, -1, 0, 576, 1280)).toThrow()
  expect(() => touchPacket(0, 576, 0, 576, 1280)).toThrow()
})
