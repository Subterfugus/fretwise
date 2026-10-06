export const isLessonId = (id: unknown): id is string => typeof id === 'string' && /^u\d{1,3}l\d{1,3}$/.test(id)

/** Keep saved ordering, ignore malformed entries, and tolerate retired lesson IDs. */
export function normalizeBookmarks(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isLessonId))] : []
}
