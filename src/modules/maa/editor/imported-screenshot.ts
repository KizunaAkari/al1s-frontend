import type { NativeScreenshot } from './screenshot-connection'

/** Decode a local original image without resampling or uploading it. */
export async function readImportedScreenshot(file: File, signal?: AbortSignal): Promise<NativeScreenshot> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 PNG、JPEG 或 WebP 截图')
  }
  if (!file.size) throw new Error('截图文件为空')
  if (file.size > 16 * 1024 * 1024) throw new Error('截图不能超过 16 MiB')
  const cancelled = () => { if (signal?.aborted) throw new Error('截图导入已取消') }
  cancelled()
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) }
  catch { cancelled(); throw new Error('图片解码失败，请选择完整的原始截图') }
  try {
    cancelled()
    const { width, height } = bitmap
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216) {
      throw new Error('截图分辨率超出限制')
    }
    return { blob: file, width, height }
  } finally { bitmap.close() }
}
