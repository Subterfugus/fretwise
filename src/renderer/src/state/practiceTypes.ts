export type PracticeDrill = 'triads' | 'noteFinder'
export interface PracticeStat { right: number; total: number; assisted: number }
export interface PracticeSummary extends PracticeStat { durationMs: number }
export interface PracticeData {
  stats: Record<string, PracticeStat>
  history: (PracticeSummary & { at: number })[]
}
export type PracticeProgress = Record<PracticeDrill, PracticeData>
export const emptyPractice = (): PracticeProgress => ({
  triads: { stats: {}, history: [] }, noteFinder: { stats: {}, history: [] }
})

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const number = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
function counts(v: unknown): PracticeStat | undefined {
  if (!object(v)) return
  const total = number(v.total), right = number(v.right), assisted = v.assisted === undefined ? 0 : number(v.assisted)
  if (total === undefined || right === undefined || assisted === undefined) return
  const validRight = Math.min(Math.floor(right), Math.floor(total))
  return { total: Math.floor(total), right: validRight, assisted: Math.min(Math.floor(assisted), Math.floor(total) - validRight) }
}
export function normalizePractice(raw: unknown): PracticeProgress {
  const out = emptyPractice()
  if (!object(raw)) return out
  for (const drill of ['triads', 'noteFinder'] as const) {
    const data = raw[drill]
    if (!object(data)) continue
    if (object(data.stats)) for (const [key, value] of Object.entries(data.stats)) {
      const stat = counts(value)
      if (stat && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') out[drill].stats[key] = stat
    }
    if (Array.isArray(data.history)) for (const value of data.history) {
      const stat = counts(value)
      if (!stat || !object(value)) continue
      const at = number(value.at), durationMs = value.durationMs === undefined ? 0 : number(value.durationMs)
      if (at !== undefined && durationMs !== undefined) out[drill].history.push({ ...stat, at, durationMs })
    }
    out[drill].history = out[drill].history.slice(-30)
  }
  return out
}
