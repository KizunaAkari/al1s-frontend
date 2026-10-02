type BlobResponse = { data: Blob; headers?: unknown }

function headerValue(headers: unknown, name: string): string | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined
  const value = headers as Record<string, unknown> & { get?: (key: string) => unknown }
  if (typeof value.get === 'function') {
    const result = value.get(name)
    if (typeof result === 'string') return result
  }
  const direct = value[name] ?? value[name.toLowerCase()] ?? value[name.toUpperCase()]
  return typeof direct === 'string' ? direct : undefined
}

export async function downloadVerifiedBlob(response: BlobResponse, fallbackName: string): Promise<void> {
  const expected = headerValue(response.headers, 'x-content-sha256')
  const digest = await crypto.subtle.digest('SHA-256', await response.data.arrayBuffer())
  const actual = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  if (!expected || actual !== expected) throw new Error('截图校验失败，请重新下载')

  const disposition = headerValue(response.headers, 'content-disposition') ?? ''
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = encodedName ? decodeURIComponent(encodedName) : fallbackName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
