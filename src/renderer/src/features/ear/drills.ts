import type { DrillDef, DrillId, DrillSettings, Item, OptionDef, OptValue, Stats } from './types'
import { rankItems } from './weighting'
import { intervalsDrill } from './drillIntervals'
import { chordsDrill } from './drillChords'
import { scalesDrill } from './drillScales'
import { progressionsDrill } from './drillProgressions'
import { degreesDrill } from './drillDegrees'
import { melodyDrill, noteFinderDrill } from './drillFret'

export const DRILLS: DrillDef[] = [intervalsDrill, chordsDrill, scalesDrill, progressionsDrill, degreesDrill, melodyDrill, noteFinderDrill]

export const drillById = (id: DrillId): DrillDef => DRILLS.find((d) => d.id === id)!

/** All labels that may appear in a drill's stats. */
export const statLabels = (d: DrillDef): Item[] => [...d.items, ...(d.extraItems ?? [])]

// ---------- per-drill settings in localStorage ----------

const storeKey = (id: DrillId) => `fretwise-ear-settings-${id}`

/** A stored option value if it is valid for the option, otherwise the default. */
export function normalizeOpt(o: OptionDef, v: unknown, dflt: OptValue | undefined): OptValue | undefined {
  switch (o.kind) {
    case 'select':
      return typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : dflt
    case 'multi': {
      if (!Array.isArray(v)) return dflt
      const on = o.choices.map((c) => c.value).filter((c) => v.includes(c))
      return on.length >= (o.min ?? 1) ? on : dflt
    }
    case 'toggle':
      return typeof v === 'boolean' ? v : dflt
    case 'range': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return dflt
      const snapped = o.min + Math.round((v - o.min) / o.step) * o.step
      return Math.min(o.max, Math.max(o.min, snapped))
    }
  }
}

/** Merge stored settings over defaults, dropping unknown items and invalid option values. */
export function normalizeSettings(d: DrillDef, raw: unknown): DrillSettings {
  const base: DrillSettings = { items: [...d.defaults.items], weak: d.defaults.weak, opts: { ...d.defaults.opts } }
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<DrillSettings>
  const valid = new Set(d.items.map((i) => i.key))
  const items = Array.isArray(r.items) ? [...new Set(r.items.filter((k): k is string => typeof k === 'string' && valid.has(k)))] : []
  const stored = r.opts && typeof r.opts === 'object' && !Array.isArray(r.opts) ? (r.opts as Record<string, unknown>) : {}
  const opts: Record<string, OptValue> = {}
  for (const o of d.options) {
    const v = normalizeOpt(o, stored[o.id], base.opts[o.id])
    if (v !== undefined) opts[o.id] = v
  }
  return {
    items: items.length >= d.minItems ? items : base.items,
    weak: typeof r.weak === 'boolean' ? r.weak : base.weak,
    opts
  }
}

/**
 * Settings for "Practise weakest": weak weighting on, and the weakest items the user has
 * tried (below 100%) switched on even if the current selection excludes them.
 */
export function weakestSettings(d: DrillDef, s: DrillSettings, stats: Stats, n = 3): DrillSettings {
  const rows = rankItems(stats, d.items).filter((r) => r.acc < 1 && d.items.some((i) => i.key === r.key))
  const add = rows.slice(0, n).map((r) => r.key)
  const on = new Set([...s.items, ...add])
  return { ...s, weak: true, items: d.items.map((i) => i.key).filter((k) => on.has(k)) }
}

export function loadSettings(d: DrillDef): DrillSettings {
  try {
    return normalizeSettings(d, JSON.parse(localStorage.getItem(storeKey(d.id)) ?? 'null'))
  } catch {
    return normalizeSettings(d, null)
  }
}

export function saveSettings(id: DrillId, s: DrillSettings): void {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(s))
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}
