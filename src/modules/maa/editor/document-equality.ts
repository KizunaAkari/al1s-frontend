/** Compare persisted JSON by value, without treating object key order as an edit. */
export function sameDocument(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
  })
  return canonical(left) === canonical(right)
}
