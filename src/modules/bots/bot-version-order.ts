import type { ComponentRelease } from '../../shared/api/components'

function versionParts(value: string | null | undefined): bigint[] {
  const match = /^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(value ?? '')
  return match ? [BigInt(match[1]!), BigInt(match[2] ?? 0), BigInt(match[3] ?? 0), value?.includes('-') ? 0n : 1n] : [-1n, -1n, -1n, 0n]
}

export function compareBotVersions(a: string | null | undefined, b: string | null | undefined): number {
  const first = versionParts(a), second = versionParts(b)
  for (let index = 0; index < first.length; index++) {
    if (first[index]! !== second[index]!) return first[index]! > second[index]! ? 1 : -1
  }
  return 0
}

export function sortBotVersions(rows: readonly ComponentRelease[]): ComponentRelease[] {
  return [...rows].sort((a, b) => compareBotVersions(b.native_version, a.native_version)
    || compareBotVersions(b.runtime_version, a.runtime_version)
    || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
    || b.release_id.localeCompare(a.release_id))
}
