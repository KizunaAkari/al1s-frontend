/** UI seconds; existing script and strategy contracts still store integer milliseconds. */
export function millisecondsToSeconds(value: number): number {
  return value / 1000
}

export function secondsToMilliseconds(value: number | null | undefined): number | undefined {
  return value == null || !Number.isFinite(value) ? undefined : Math.round(value * 1000)
}
