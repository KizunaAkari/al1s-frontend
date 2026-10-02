import { afterEach, expect, it, vi } from 'vitest'
import { PhoneVideoDecoder } from '../src/modules/maa/editor/video-decoder'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function setup() {
  let init: VideoDecoderInit
  const decoder = { state: 'unconfigured', decodeQueueSize: 0,
    configure: vi.fn(() => { decoder.state = 'configured' }), decode: vi.fn(),
    close: vi.fn(() => { decoder.state = 'closed' }),
    reset: vi.fn(() => { decoder.state = 'unconfigured'; decoder.decodeQueueSize = 0 }),
  }
  vi.stubGlobal('VideoDecoder', class { constructor(options: VideoDecoderInit) { init = options; return decoder } })
  vi.stubGlobal('EncodedVideoChunk', class { constructor(options: EncodedVideoChunkInit) { return options } })
  const drawImage = vi.fn(), error = vi.fn()
  const canvas = { getContext: () => ({ drawImage }), width: 0, height: 0 } as unknown as HTMLCanvasElement
  const player = new PhoneVideoDecoder(canvas, error)
  const configure = () => player.accept({ kind: 'packet', config: true, key: false, timestamp: 0n,
    data: new Uint8Array([0, 0, 1, 0x67, 0x42, 0, 0x1f]) })
  return { player, decoder, configure, drawImage, error, output: (frame: VideoFrame) => init.output(frame),
    fail: (failure: DOMException) => init.error(failure) }
}

it('explains unavailable browser H264 support without blaming the terminal', () => {
  const { configure, fail, error } = setup()
  configure()
  fail(new DOMException('Unsupported configuration', 'NotSupportedError'))
  expect(error.mock.calls[0][0].message).toContain('Chrome或Edge')
})

const packet = (key: boolean) => ({ kind: 'packet' as const, config: false, key,
  timestamp: 10n, data: new Uint8Array([0, 0, 1, 0x65, 1]) })

it('requires configuration and waits for a key frame', () => {
  const { player, configure, decoder } = setup()
  expect(() => player.accept(packet(true))).toThrow('配置')
  configure()
  player.accept(packet(false))
  expect(decoder.decode).not.toHaveBeenCalled()
  player.accept(packet(true))
  expect(decoder.decode.mock.calls[0][0]).toMatchObject({ type: 'key', timestamp: 10 })
  expect(decoder.decode.mock.calls[0][0].data).toHaveLength(12)
  player.close()
})

it('resets backlog and resumes from a key frame without decoding dependent deltas', () => {
  vi.useFakeTimers()
  const { player, configure, decoder, error, output } = setup()
  configure(); decoder.decodeQueueSize = 8
  player.accept(packet(false))
  expect(decoder.reset).toHaveBeenCalledOnce()
  player.accept(packet(false))
  expect(decoder.decode).not.toHaveBeenCalled()
  player.accept(packet(true))
  expect(decoder.decode.mock.calls[0][0].type).toBe('key')
  output({ displayWidth: 10, displayHeight: 20, close: vi.fn() } as unknown as VideoFrame)
  vi.advanceTimersByTime(5001)
  expect(error).not.toHaveBeenCalled()
  player.accept(packet(false))
  expect(decoder.decode).toHaveBeenCalledTimes(2)
  player.close()
})

it('reports stalled recovery and releases the recovery timer on close', () => {
  vi.useFakeTimers()
  const first = setup()
  first.configure(); first.decoder.decodeQueueSize = 8
  first.player.accept(packet(false))
  vi.advanceTimersByTime(5000)
  expect(first.error.mock.calls[0][0].message).toContain('恢复超时')
  expect(first.decoder.close).toHaveBeenCalledOnce()
  const second = setup()
  second.configure(); second.decoder.decodeQueueSize = 8
  second.player.accept(packet(false))
  second.player.close()
  vi.advanceTimersByTime(5000)
  expect(second.error).not.toHaveBeenCalled()
})

it('rejects unsafe timestamps', () => {
  const { player, configure } = setup()
  configure()
  expect(() => player.accept({ ...packet(true), timestamp: 1n << 60n })).toThrow('时间戳')
  player.close()
})

it('releases output frames on draw failure and closes idempotently', () => {
  const { player, output, drawImage, error, decoder } = setup()
  const frame = { displayWidth: 10, displayHeight: 20, close: vi.fn() } as unknown as VideoFrame
  drawImage.mockImplementation(() => { throw new Error('draw failed') })
  output(frame)
  expect(frame.close).toHaveBeenCalledOnce()
  expect(error).toHaveBeenCalledOnce()
  player.close()
  expect(decoder.close).toHaveBeenCalledOnce()
})

it('draws only the latest pending frame and releases all superseded frames',()=>{
 let paint!: FrameRequestCallback
 vi.stubGlobal('requestAnimationFrame',vi.fn((fn:FrameRequestCallback)=>{paint=fn;return 1}))
 const cancel=vi.fn();vi.stubGlobal('cancelAnimationFrame',cancel)
 const {player,output,drawImage}=setup()
 const frame=()=>({displayWidth:10,displayHeight:20,close:vi.fn()} as unknown as VideoFrame)
 const first=frame(),old=frame(),latest=frame(),pending=frame()
 output(first);output(old);output(latest)
 expect(drawImage).toHaveBeenCalledOnce();expect(old.close).toHaveBeenCalledOnce()
 paint(1);expect(drawImage).toHaveBeenLastCalledWith(latest,0,0)
 expect(latest.close).toHaveBeenCalledOnce()
 output(pending);player.close()
 expect(pending.close).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce()
})

it('discards pending old geometry when the stream is reconfigured',()=>{
 vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1))
 const cancel=vi.fn();vi.stubGlobal('cancelAnimationFrame',cancel)
 const {player,configure,output,decoder}=setup()
 configure()
 const first={displayWidth:10,displayHeight:20,close:vi.fn()} as unknown as VideoFrame
 const queued={displayWidth:10,displayHeight:20,close:vi.fn()} as unknown as VideoFrame
 output(first);output(queued);configure()
 expect(queued.close).toHaveBeenCalledOnce()
 expect(cancel).toHaveBeenCalledOnce()
 expect(decoder.reset).toHaveBeenCalledOnce()
 player.close()
})
