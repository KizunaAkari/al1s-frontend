import { expect, it } from 'vitest'
import { avcCodec } from '../src/modules/maa/editor/h264-config'

it('extracts profile from three or four byte Annex B SPS prefixes', () => {
  expect(avcCodec(new Uint8Array([0, 0, 1, 0x67, 0x64, 0, 0x28]))).toBe('avc1.640028')
  expect(avcCodec(new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f]))).toBe('avc1.42c01f')
})

it('rejects missing and truncated SPS', () => {
  expect(() => avcCodec(new Uint8Array([0, 0, 1, 0x68, 1, 2, 3]))).toThrow('SPS')
  expect(() => avcCodec(new Uint8Array([0, 0, 1, 0x67, 1]))).toThrow('SPS')
})
