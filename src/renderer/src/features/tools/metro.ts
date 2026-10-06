// Pure metronome logic: time signatures with accent grouping, subdivisions, tap tempo and the tempo trainer.

export const MIN_BPM = 30
export const MAX_BPM = 300
export const clampBpm = (n: number): number => (Number.isFinite(n) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n))) : 120)

export const TRANSPORT_PPQ = 192

export type Subdivision = 'none' | 'eighth' | 'triplet' | 'sixteenth'
export const SUBDIVISIONS: { id: Subdivision; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'eighth', label: '8ths' },
  { id: 'triplet', label: 'Triplets' },
  { id: 'sixteenth', label: '16ths' }
]

export interface TimeSig {
  id: string
  label: string
  /** Clicked pulses per bar (the unit the BPM counts). */
  pulses: number
  /** Sizes of the accent groups, summing to `pulses`; each group starts with an accent. */
  groups: number[]
  /** Length of one pulse in quarter notes (1 = quarter, 1.5 = dotted quarter, 0.5 = eighth). */
  pulseQuarters: number
  /** Compound: each pulse naturally divides in three. */
  compound: boolean
  /** What the BPM counts, for the UI. */
  unit: string
}

export const TIME_SIGS: TimeSig[] = [
  { id: '2/4', label: '2/4', pulses: 2, groups: [2], pulseQuarters: 1, compound: false, unit: 'quarter notes' },
  { id: '3/4', label: '3/4', pulses: 3, groups: [3], pulseQuarters: 1, compound: false, unit: 'quarter notes' },
  { id: '4/4', label: '4/4', pulses: 4, groups: [2, 2], pulseQuarters: 1, compound: false, unit: 'quarter notes' },
  { id: '5/4', label: '5/4', pulses: 5, groups: [3, 2], pulseQuarters: 1, compound: false, unit: 'quarter notes' },
  { id: '6/8', label: '6/8', pulses: 2, groups: [1, 1], pulseQuarters: 1.5, compound: true, unit: 'dotted quarters' },
  { id: '7/8', label: '7/8', pulses: 7, groups: [2, 2, 3], pulseQuarters: 0.5, compound: false, unit: 'eighth notes' },
  { id: '12/8', label: '12/8', pulses: 4, groups: [2, 2], pulseQuarters: 1.5, compound: true, unit: 'dotted quarters' }
]

export const timeSigById = (id: string): TimeSig => TIME_SIGS.find((t) => t.id === id) ?? TIME_SIGS[2]

/** Accent level per pulse: 2 = strong (bar start), 1 = group start, 0 = ordinary. */
export function accentLevels(ts: TimeSig): number[] {
  const out: number[] = []
  ts.groups.forEach((g, gi) => {
    for (let i = 0; i < g; i++) out.push(i === 0 ? (gi === 0 ? 2 : 1) : 0)
  })
  return out
}

/** Clicks per pulse for a subdivision (compound meters divide in threes). */
export function subsPerPulse(ts: TimeSig, sub: Subdivision): number {
  if (sub === 'none') return 1
  if (ts.compound) return sub === 'sixteenth' ? 6 : 3 // triplets in compound time are the eighths themselves
  if (ts.pulseQuarters < 1) return sub === 'eighth' ? 2 : sub === 'triplet' ? 3 : 4 // eighth-note pulses
  return sub === 'eighth' ? 2 : sub === 'triplet' ? 3 : 4
}

/** Transport ticks in one pulse. */
export const pulseTicks = (ts: TimeSig): number => ts.pulseQuarters * TRANSPORT_PPQ

/** Transport (quarter-note) BPM that makes one pulse last 60/bpm seconds. */
export const transportBpm = (ts: TimeSig, bpm: number): number => (bpm * pulseTicks(ts)) / TRANSPORT_PPQ

/** The finest grid (ticks) that every time signature/subdivision combination is a multiple of. */
export const GRID_TICKS = 8

export interface MetroTick {
  /** Ticks since bar start. */
  at: number
  pulse: number
  sub: number
  /** 2 strong, 1 medium (group start), 0 weak pulse, -1 subdivision click */
  level: number
}

/** All clicks of one bar. */
export function barTicks(ts: TimeSig, sub: Subdivision, accentFirst = true): MetroTick[] {
  const n = subsPerPulse(ts, sub)
  const levels = accentLevels(ts)
  const pt = pulseTicks(ts)
  const out: MetroTick[] = []
  for (let p = 0; p < ts.pulses; p++) {
    for (let s = 0; s < n; s++) {
      const lvl = s === 0 ? (!accentFirst && p === 0 ? 0 : levels[p]) : -1
      out.push({ at: (p * pt) + (s * pt) / n, pulse: p, sub: s, level: lvl })
    }
  }
  return out
}

export const barLengthTicks = (ts: TimeSig): number => ts.pulses * pulseTicks(ts)

// ---------- tap tempo ----------

/** BPM from tap timestamps (ms): averages the last few gaps; taps more than 2.2 s apart start a new count. */
export function tapTempo(times: number[]): number | null {
  const recent: number[] = []
  for (let i = times.length - 1; i >= 0; i--) {
    if (i < times.length - 1 && times[i + 1] - times[i] > 2200) break
    recent.unshift(times[i])
  }
  const taps = recent.slice(-6)
  if (taps.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1])
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return clampBpm(60000 / avg)
}

// ---------- tempo trainer ----------

export interface Trainer {
  enabled: boolean
  /** Starting BPM comes from the main tempo; increase by `step` every `everyBars` bars up to `target`. */
  step: number
  everyBars: number
  target: number
}

/** BPM during bar `barIndex` (0-based) of a trainer run that started at `startBpm`. */
export function trainerBpm(startBpm: number, tr: Pick<Trainer, 'step' | 'everyBars' | 'target'>, barIndex: number): number {
  const every = Math.max(1, Math.floor(tr.everyBars))
  const raw = startBpm + tr.step * Math.floor(Math.max(0, barIndex) / every)
  const hi = Math.max(startBpm, tr.target)
  const lo = Math.min(startBpm, tr.target)
  // a negative step trains downward toward a lower target
  return clampBpm(tr.step >= 0 ? Math.min(raw, hi) : Math.max(raw, lo))
}

/** Number of bars until the trainer reaches its target (null if it never will). */
export function trainerBarsToTarget(startBpm: number, tr: Pick<Trainer, 'step' | 'everyBars' | 'target'>): number | null {
  if (tr.step === 0) return startBpm === tr.target ? 0 : null
  const need = (tr.target - startBpm) / tr.step
  if (need < 0) return null
  return Math.ceil(need) * Math.max(1, Math.floor(tr.everyBars))
}
