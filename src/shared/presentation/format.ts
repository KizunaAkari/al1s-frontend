const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '---'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '---' : dateTimeFormatter.format(date)
}

export function formatGiB(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '---'
  return `${(value / 1024 ** 3).toFixed(2)} GiB`
}

export function compactId(value: string | null | undefined): string {
  if (!value) return '---'
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

export function formatDailyTimes(values: string[]): string {
  if (values.length === 0) return '---'
  return values.map((value) => value.slice(0, 5)).join('、')
}
