// Random helpers (with injectable RNG for tests) and accuracy-based weighting.
import type { EarStat } from '@/state/progress'
import type { DrillSettings, Item, OptValue, Rng, Sound, Stats } from './types'
import type { PlayMode, SeqEvent } from '@/audio/engine'

export const pick = <T>(xs: readonly T[], rng: Rng = Math.random): T => xs[Math.floor(rng() * xs.length)]
export const randInt = (lo: number, hi: number, rng: Rng = Math.random): number => lo + Math.floor(rng() * (hi - lo + 1))

export function shuffle<T>(xs: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Smoothed accuracy (Laplace), so a single miss doesn't dominate. */
export const smoothedAccuracy = (s?: EarStat): number => ((s?.right ?? 0) + 1) / ((s?.total ?? 0) + 2)

/** Raw accuracy or null if never attempted. */
export const accuracy = (s?: EarStat): number | null => (s && s.total > 0 ? s.right / s.total : null)

/**
 * Selection weight for an item. Uniform unless `weak` is set; then low-accuracy items
 * (and items never tried) are picked much more often.
 */
export function itemWeight(s: EarStat | undefined, weak: boolean): number {
  if (!weak) return 1
  if (!s || s.total === 0) return 2
  const acc = smoothedAccuracy(s)
  return 0.2 + Math.pow(1 - acc, 2) * 8
}

/** Pick a key, weighted by accuracy when `weak` is true. `avoid` (last item) is made less likely. */
export function weightedPick(keys: readonly string[], stats: Stats, weak: boolean, rng: Rng = Math.random, avoid?: string): string {
  if (keys.length === 0) throw new Error('weightedPick: no keys')
  const w = keys.map((k) => {
    const x = itemWeight(stats[k], weak)
    // corrupt stats (NaN / negative) must not break selection
    return (Number.isFinite(x) && x > 0 ? x : 1) * (k === avoid && keys.length > 1 ? 0.35 : 1)
  })
  const total = w.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < keys.length; i++) {
    r -= w[i]
    if (r < 0) return keys[i]
  }
  return keys[keys.length - 1]
}

export interface StatRow {
  key: string
  label: string
  right: number
  total: number
  acc: number
}

/** Rows for the stats view, weakest first. Unknown keys get their key as label. */
export function rankItems(stats: Stats, labels: Item[]): StatRow[] {
  const lab = new Map(labels.map((i) => [i.key, i.label]))
  return Object.entries(stats)
    .filter(([, s]) => s.total > 0)
    .map(([key, s]) => ({ key, label: lab.get(key) ?? key, right: s.right, total: s.total, acc: s.right / s.total }))
    .sort((a, b) => a.acc - b.acc || b.total - a.total)
}

export function totals(stats: Stats | undefined): { right: number; total: number } {
  let right = 0
  let total = 0
  for (const s of Object.values(stats ?? {})) {
    right += s.right
    total += s.total
  }
  return { right, total }
}

// ---------- settings accessors ----------

export const optStr = (s: DrillSettings, id: string, dflt: string): string => {
  const v = s.opts[id]
  return typeof v === 'string' ? v : dflt
}
export const optNum = (s: DrillSettings, id: string, dflt: number): number => {
  const v = s.opts[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}
export const optBool = (s: DrillSettings, id: string, dflt: boolean): boolean => {
  const v = s.opts[id]
  return typeof v === 'boolean' ? v : dflt
}
export const optList = (s: DrillSettings, id: string, dflt: string[]): string[] => {
  const v: OptValue | undefined = s.opts[id]
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return list.length > 0 ? list : dflt
}

/** Enabled items in definition order; falls back to all items when fewer than `min`. */
export function enabledItems(s: DrillSettings, all: Item[], min = 1): string[] {
  const on = all.filter((i) => s.items.includes(i.key)).map((i) => i.key)
  return on.length >= min ? on : all.map((i) => i.key)
}

// ---------- sound builders ----------

export const ev = (notes: number[], beats: number, mode?: PlayMode): SeqEvent => (mode ? { notes, beats, mode } : { notes, beats })
export const rest = (beats: number): SeqEvent => ({ notes: [], beats })
export const sound = (events: Sound['events'], bpm: number): Sound => ({ events, bpm })
