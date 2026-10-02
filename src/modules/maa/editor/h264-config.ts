/** Derive the AVC codec string from an Annex B SPS, not a phone-specific profile. */
export function avcCodec(data: Uint8Array): string {
  for (let i = 0; i + 6 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue
    const start = data[i + 2] === 1 ? i + 3
      : data[i + 2] === 0 && data[i + 3] === 1 ? i + 4 : -1
    if (start >= 0 && start + 3 < data.length && (data[start] & 31) === 7) {
      return 'avc1.' + Array.from(data.subarray(start + 1, start + 4))
        .map(value => value.toString(16).padStart(2, '0')).join('')
    }
  }
  throw new Error('视频配置缺少H.264 SPS')
}
