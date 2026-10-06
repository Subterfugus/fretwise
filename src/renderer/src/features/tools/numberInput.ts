export function commitNumberDraft(draft: string, previous: number, min?: number, max?: number, step = 1): number {
  if (!draft.trim()) return previous
  const parsed = Number(draft)
  if (!Number.isFinite(parsed)) return previous
  const base = min ?? 0
  const rounded = step > 0 ? base + Math.round((parsed - base) / step) * step : parsed
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Number(rounded.toPrecision(12))))
}
