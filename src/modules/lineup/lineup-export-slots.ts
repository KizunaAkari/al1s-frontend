/** Expand a confirmed compact team into ArcGM's four front / two support slots. */
export function lineupExportSlots(ids: readonly number[]): number[] | null {
  if (!ids.length || ids.length > 6 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return null
  // Full teams already carry their six positional slots; preserve legacy ordering.
  if (ids.length === 6) return [...ids]
  // Playable student IDs encode Main as 1xxxx and Support as 2xxxx,
  // consistent with Kei's CharacterExcel SquadType. Reject unknown families.
  const front = ids.filter(id => id >= 10000 && id < 20000)
  const support = ids.filter(id => id >= 20000 && id < 30000)
  if (front.length + support.length !== ids.length || !front.length || front.length > 4 || support.length > 2) return null
  return [...front, ...Array<number>(4 - front.length).fill(0), ...support, ...Array<number>(2 - support.length).fill(0)]
}
