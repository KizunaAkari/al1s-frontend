export function shiftDecimal(value: string, shift: number) {
  const text = value.trim().replace(/^([+-]?)\./, '$10.')
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match) return value
  const exponent = Number(match[4] || 0)
  if (Math.abs(exponent) > 100) return value
  const digits = match[2] + (match[3] || '')
  const point = match[2].length + exponent + shift
  const whole = (point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')).replace(/^0+(?=\d)/, '')
  const fraction = (point < 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(/0+$/, '')
  return `${match[1]}${whole}${fraction ? `.${fraction}` : ''}`
}
