import { describe, expect, it } from 'vitest'
import { ScrcpyStream, type VideoEvent } from '../src/modules/maa/editor/scrcpy-stream'

function fixture() {
  const bytes = new Uint8Array(40)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x68323634); view.setUint32(4, 576); view.setUint32(8, 1280)
  view.setBigUint64(12, 1n << 63n); view.setUint32(20, 2)
  bytes.set([1, 2], 24)
  view.setBigUint64(26, (1n << 62n) | 123n); view.setUint32(34, 2)
  bytes.set([3, 4], 38)
  return bytes
}

describe('managed scrcpy framing', () => {
  it('preserves packets at every possible split and combined messages', () => {
    const bytes = fixture()
    for (let split = 0; split <= bytes.length; split++) {
      const parser = new ScrcpyStream(), events: VideoEvent[] = []
      parser.push(bytes.subarray(0, split), event => events.push(event))
      parser.push(bytes.subarray(split), event => events.push(event))
      parser.finish()
      expect(events).toEqual([
        { kind: 'metadata', width: 576, height: 1280 },
        { kind: 'packet', config: true, key: false, timestamp: 0n, data: new Uint8Array([1, 2]) },
        { kind: 'packet', config: false, key: true, timestamp: 123n, data: new Uint8Array([3, 4]) },
      ])
    }
  })

  it('supports bytewise delivery', () => {
    const parser = new ScrcpyStream(), events: VideoEvent[] = []
    for (const byte of fixture()) parser.push(new Uint8Array([byte]), event => events.push(event))
    parser.finish()
    expect(events).toHaveLength(3)
  })

  it.each([0, 4 * 1024 * 1024 + 1, 0xffffffff])('rejects invalid frame length %s', length => {
    const bytes = fixture(), parser = new ScrcpyStream()
    new DataView(bytes.buffer).setUint32(20, length)
    expect(() => parser.push(bytes, () => {})).toThrow('长度')
    expect(() => parser.push(fixture(), () => {})).toThrow('失效')
  })

  it('rejects truncated stream and wrong metadata', () => {
    const parser = new ScrcpyStream()
    parser.push(fixture().subarray(0, 39), () => {})
    expect(() => parser.finish()).toThrow('不完整')
    const bytes = fixture()
    new DataView(bytes.buffer).setUint32(4, 2401)
    expect(() => new ScrcpyStream().push(bytes, () => {})).toThrow('尺寸')
  })

  it('accepts the full 1080 by 2400 phone metadata', () => {
    const bytes = fixture(), events: VideoEvent[] = []
    const view = new DataView(bytes.buffer)
    view.setUint32(4, 1080)
    view.setUint32(8, 2400)
    const parser = new ScrcpyStream()
    parser.push(bytes, event => events.push(event))
    parser.finish()
    expect(events[0]).toEqual({ kind: 'metadata', width: 1080, height: 2400 })
  })
})
