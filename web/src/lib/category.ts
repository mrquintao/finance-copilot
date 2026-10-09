export const CATEGORY_INKS = 8

const ink = (index: number) => `var(--cat-${(index % CATEGORY_INKS) + 1})`

/**
 * Gives each category its ink: fixed for a category on every screen and in every month, and
 * distinct for the first eight. Past eight the inks repeat, so the name always sits beside the
 * color. "Sem categoria" (no id) has its own neutral ink.
 *
 * `knownIds` is the full category list; the position of an id in its sorted order is what
 * keeps the assignment stable. An id outside the list falls back to a hash of the id.
 */
export function categoryInks(knownIds: readonly string[]): (categoryId: string | null) => string {
  const position = new Map([...knownIds].sort().map((id, index) => [id, index]))
  return (categoryId) => {
    if (categoryId === null) return 'var(--cat-0)'
    const known = position.get(categoryId)
    if (known !== undefined) return ink(known)
    let hash = 0
    for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) % 9973
    return ink(hash)
  }
}
