// Pure guitar chord-voicing generator and "which shapes do we know for this chord" collection.
import { CHORDS, ChordType, buildChord } from '@/theory/chords'
import { parseInterval } from '@/theory/intervals'
import {
  CAGED_ORDER,
  ChordShape,
  OPEN_CHORDS,
  cagedShape,
  midiAt,
  movableChord,
  realBarre,
  STANDARD_TUNING,
  shape,
  shapeMidis
} from '@/theory/guitar'
import { mod, noteName, pitchClass } from '@/theory/notes'

export interface VoicingOptions {
  /** Largest allowed distance between lowest and highest fretted note, in frets (a 4-fret span = 3). Default 3. */
  maxSpread?: number
  /** Fewest sounded strings. Default 4 (3 for chords of two notes). */
  minStrings?: number
  maxFret?: number
  /** Lowest sounded string must be the root (default true). false allows any chord tone (inversions). */
  rootInBass?: boolean
  allowOmitFifth?: boolean
  limit?: number
}

/** Interval strings that may be left out of a voicing of this chord. */
export function omittableIntervals(type: ChordType): string[] {
  const ivs = CHORDS[type].intervals
  const out: string[] = []
  if (ivs.length >= 4 && ivs.includes('P5')) out.push('P5')
  // 11ths and 13ths are too crowded to stack everything: leave out the 9th (and 11th of a 13).
  if (ivs.some((i) => ['P11', 'M13'].includes(i))) {
    out.push('M9')
    if (ivs.includes('M13')) out.push('P11')
  }
  return out
}

/** Pitch classes (relative to root, 0..11) that every voicing must contain. */
export function requiredSemitones(type: ChordType, allowOmitFifth = true): number[] {
  const omit = new Set(allowOmitFifth ? omittableIntervals(type) : omittableIntervals(type).filter((i) => i !== 'P5'))
  return CHORDS[type].intervals.filter((iv) => !omit.has(iv)).map((iv) => mod(parseInterval(iv).semitones, 12))
}

/**
 * Find playable voicings of root+type on a standard-tuned guitar: contiguous sounded strings (no muted string
 * inside the shape), fretted notes within a 4-fret span, at most four fingers (a barre counts as one), root in the
 * bass by default, every essential chord tone present. Best (most playable) first.
 */
export function generateVoicings(root: string, type: ChordType, opts: VoicingOptions = {}): ChordShape[] {
  const maxSpread = opts.maxSpread ?? 3
  const maxFret = opts.maxFret ?? 15
  const rootInBass = opts.rootInBass ?? true
  const rootPcV = pitchClass(root)
  const chordPcs = new Set(buildChord(root, type).map(pitchClass))
  const required = requiredSemitones(type, opts.allowOmitFifth ?? true).map((s) => mod(rootPcV + s, 12))
  const minStrings = opts.minStrings ?? (chordPcs.size <= 2 ? 3 : 4)
  const limit = opts.limit ?? 8
  const symbol = noteName(root) + CHORDS[type].symbol

  const seen = new Set<string>()
  const found: { frets: (number | null)[]; score: number; bass: number; center: number }[] = []

  // candidates[string index 0..5 = low E..high E] for a given fretted window
  const pcOpen = [40, 45, 50, 55, 59, 64].map((m) => mod(m, 12))
  for (let lo = 1; lo <= Math.max(1, maxFret - maxSpread); lo++) {
    const cands: (number | null)[][] = []
    for (let i = 0; i < 6; i++) {
      const list: (number | null)[] = [null]
      if (chordPcs.has(pcOpen[i])) list.push(0)
      for (let f = lo; f <= Math.min(maxFret, lo + maxSpread); f++) if (chordPcs.has(mod(pcOpen[i] + f, 12))) list.push(f)
      cands.push(list)
    }
    const cur: (number | null)[] = new Array(6).fill(null)
    const rec = (i: number): void => {
      if (i === 6) {
        evaluate(cur)
        return
      }
      for (const f of cands[i]) {
        // no muted string once sounding has begun, unless all remaining are muted (trailing mutes allowed)
        cur[i] = f
        rec(i + 1)
      }
      cur[i] = null
    }
    rec(0)
  }

  function evaluate(frets: (number | null)[]): void {
    const sounded = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0)
    if (sounded.length < minStrings) return
    const first = sounded[0]
    const last = sounded[sounded.length - 1]
    for (let i = first; i <= last; i++) if (frets[i] === null) return // contiguous strings only
    const key = frets.join(',')
    if (seen.has(key)) return
    // fretted-note rules
    const fretted = frets.filter((f): f is number => f !== null && f > 0)
    if (fretted.length) {
      const mn = Math.min(...fretted)
      if (Math.max(...fretted) - mn > maxSpread) return
    }
    // pitch classes present
    const pcs = new Set(sounded.map((i) => mod(pcOpen[i] + (frets[i] as number), 12)))
    if (!required.every((pc) => pcs.has(pc))) return
    // Bass = the LOWEST SOUNDING PITCH (not merely the first sounding string: e.g. a low-E fret 6 sits above an open A).
    const bassIdx = lowestSoundingIndex(frets)
    const bassPc = mod(pcOpen[bassIdx] + (frets[bassIdx] as number), 12)
    if (rootInBass && bassPc !== rootPcV) return
    // fingers: one per fretted note; a barre at the lowest fretted fret covers many strings
    let fingers = fretted.length
    const lowest = fretted.length ? Math.min(...fretted) : 0
    const barre = fretted.length ? realBarre(frets, lowest) : undefined
    if (barre !== undefined) {
      // realBarre works on low-to-high array order which is what we have
      const n = frets.filter((f) => f === barre).length
      fingers -= n - 1
    }
    if (fingers > 4) return
    seen.add(key)

    const span = fretted.length ? Math.max(...fretted) - lowest : 0
    const open = sounded.filter((i) => frets[i] === 0).length
    const center = fretted.length ? (lowest + Math.max(...fretted)) / 2 : 0
    // duplicates of a tone beyond the essential count are fine; penalise missing fifth and awkward gaps
    const hasFifth = chordPcs.size < 3 || [...chordPcs].some((pc) => mod(pc - rootPcV, 12) === 7 && pcs.has(pc))
    let score = 0
    score += fingers * 1.1
    score += span * 0.7
    score += lowest * 0.18
    score -= sounded.length * 0.9
    score -= open * 0.45
    score += barre !== undefined ? 1.2 : 0
    score += hasFifth ? 0 : 0.6
    // interior stretches: big jumps between neighbouring sounded strings are awkward
    for (let k = 1; k < sounded.length; k++) {
      const a = frets[sounded[k - 1]] as number
      const b = frets[sounded[k]] as number
      if (a > 0 && b > 0 && Math.abs(a - b) >= 3) score += 0.8
    }
    found.push({ frets: [...frets], score, bass: 6 - bassIdx, center })
  }

  found.sort((a, b) => a.score - b.score)
  // Prefer variety across the neck: first pass takes one voicing per (bass string, neck region).
  const picked: typeof found = []
  const regionSeen = new Set<string>()
  for (const f of found) {
    const k = `${f.bass}:${Math.round(f.center / 3)}`
    if (regionSeen.has(k)) continue
    regionSeen.add(k)
    picked.push(f)
    if (picked.length >= limit) break
  }
  for (const f of found) {
    if (picked.length >= limit) break
    if (!picked.includes(f)) picked.push(f)
  }
  picked.sort((a, b) => a.score - b.score)
  return picked.map((f, i) => toShape(`${symbol} (${i + 1})`, f.frets))
}

/** MIDI of the open strings, low E (index 0) to high E (index 5). */
const OPEN_LOW_TO_HIGH = [...STANDARD_TUNING].reverse()

/** Index (0 = low E ... 5 = high E) of the string producing the lowest sounding MIDI pitch, or -1 if nothing sounds. */
export function lowestSoundingIndex(frets: readonly (number | null)[]): number {
  let best = -1
  let bestMidi = Infinity
  frets.forEach((f, i) => {
    if (f === null) return
    const m = OPEN_LOW_TO_HIGH[i] + f
    if (m < bestMidi) {
      bestMidi = m
      best = i
    }
  })
  return best
}

/** MIDI pitches of the sounding strings, ascending by pitch (not by string). */
export function soundingMidis(frets: readonly (number | null)[]): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [OPEN_LOW_TO_HIGH[i] + f])).sort((a, b) => a - b)
}

export interface Fingering {
  /** Number of fretted (non-open) notes. */
  fretted: number
  /** Fingers needed, a barre counting as one. */
  fingers: number
  /** Fret of the barre if one is required (or declared and genuine). */
  barre?: number
}

/**
 * The string indices (0 = low E) one finger can bar at `fret`: >=2 adjacent-in-run strings sounding exactly that fret,
 * with every string between them fretted at or above it (no open or muted string, nothing lower). If the notes on that
 * fret split into several runs the longest wins (ties: the lower strings). null when no run of 2+ exists.
 */
export function barreGroup(frets: readonly (number | null)[], fret: number): number[] | null {
  let best: number[] | null = null
  let run: number[] = []
  const flush = (): void => {
    if (run.length >= 2 && (!best || run.length > best.length)) best = run
    run = []
  }
  frets.forEach((f, i) => {
    if (f === fret) run.push(i)
    else if (run.length && (f === null || f < fret)) flush() // a muted/open/lower string breaks the bar
  })
  flush()
  return best
}

/**
 * How many fingers a shape needs. A barre is only reported when it is needed (more than four fretted notes and a bar
 * brings it to four or fewer... or as few as possible) or when the caller declares a genuine one (`declaredBarre`).
 * The bar may lie on any fret, e.g. "x 3 5 5 5 5" (index on 3, ring across the 5s) or "x 3 2 3 3 3" (across the top three).
 */
export function fingering(frets: readonly (number | null)[], declaredBarre?: number): Fingering {
  const fretted = frets.filter((f): f is number => f !== null && f > 0)
  if (!fretted.length) return { fretted: 0, fingers: 0 }
  const plain: Fingering = { fretted: fretted.length, fingers: fretted.length }
  let best: Fingering | null = null
  const pick = (fret: number): void => {
    const g = barreGroup(frets, fret)
    if (!g) return
    const f: Fingering = { fretted: fretted.length, fingers: fretted.length - g.length + 1, barre: fret }
    if (!best || f.fingers < best.fingers) best = f
  }
  if (declaredBarre !== undefined && declaredBarre > 0) pick(declaredBarre)
  if (!best && fretted.length > 4) for (const fret of [...new Set(fretted)].sort((a, b) => a - b)) pick(fret)
  return best ?? plain
}

/**
 * Deterministic simple finger numbers: null muted, 0 open, 1-4 otherwise. Notes are given "finger slots" in ascending fret
 * order (low string first on ties); a barre run shares one slot. Beyond four slots the number is capped at 4.
 */
export function assignFingers(frets: readonly (number | null)[], barre?: number): (number | null)[] {
  const out: (number | null)[] = frets.map((f) => (f === null ? null : 0))
  const group = barre !== undefined ? barreGroup(frets, barre) : null
  const inGroup = new Set(group ?? [])
  const slots: { f: number; idx: number[] }[] = []
  frets.forEach((f, i) => {
    if (f === null || f <= 0) return
    if (inGroup.has(i)) {
      if (i === group![0]) slots.push({ f, idx: group! })
    } else slots.push({ f, idx: [i] })
  })
  slots.sort((a, b) => a.f - b.f || a.idx[0] - b.idx[0])
  slots.forEach((s, k) => s.idx.forEach((i) => (out[i] = Math.min(4, k + 1))))
  return out
}
/** Chord types whose voicings may leave out the root (9th/11th/13th chords: the bass player has it). */
export const ROOTLESS_TYPES: ReadonlySet<ChordType> = new Set<ChordType>(['dom9', 'maj9', 'min9', 'dom13', 'dom11', 'min11', 'dom7b9', 'dom7s9', 'maj7s11'])

/** Open strings are only used when the whole shape sits at or below this fret. */
export const OPEN_REACH = 4
/** Highest fret enumerated. */
export const LAST_FRET = 22
/** Max fret difference between the lowest and highest fretted notes: 3 (a 4-fret stretch), or 4 for 3-string shapes (as the Triads trainer). */
export const maxSpreadFor = (stringCount: number): number => (stringCount <= 3 ? 4 : 3)

export interface EnumerateOptions {
  /** Fewest strings sounded (default 3; 2 for power chords). */
  minStrings?: number
  maxFret?: number
}

/**
 * Every playable shape of root+type with sounding strings contiguous, any chord tone in the bass (inversions included),
 * only chord tones, every essential tone present (the root may be missing for ROOTLESS_TYPES), span within `maxSpreadFor`,
 * open strings only when the shape sits at or below OPEN_REACH, and at most four fingers (a barre counts as one).
 * Frets are low E first. Unordered; deterministic. Validation by the library (analyzeVoicing) is still required.
 */
export function enumerateShapes(root: string, type: ChordType, opts: EnumerateOptions = {}): (number | null)[][] {
  const maxFret = Math.min(opts.maxFret ?? LAST_FRET, LAST_FRET)
  const rootPcV = pitchClass(root)
  const pcOpen = OPEN_LOW_TO_HIGH.map((m) => mod(m, 12))
  const chordMask = new Array<boolean>(12).fill(false)
  buildChord(root, type).forEach((n) => (chordMask[pitchClass(n)] = true))
  let required = requiredSemitones(type).map((s) => mod(rootPcV + s, 12))
  if (ROOTLESS_TYPES.has(type)) required = required.filter((pc) => pc !== rootPcV)
  const needMask = required.reduce((m, pc) => m | (1 << pc), 0)
  const minStrings = opts.minStrings ?? (type === 'power' ? 2 : 3)

  const out: (number | null)[][] = []
  const seen = new Set<string>()
  for (let lo = 1; lo <= maxFret; lo++) {
    const cands: number[][] = pcOpen.map((open) => {
      const list: number[] = []
      if (lo <= OPEN_REACH && chordMask[open]) list.push(0)
      for (let f = lo; f <= Math.min(maxFret, lo + 4); f++) if (chordMask[(open + f) % 12]) list.push(f)
      return list
    })
    const cur: (number | null)[] = new Array(6).fill(null)
    const evaluate = (a: number, end: number): void => {
      const n = end - a + 1
      if (n < minStrings) return
      let mask = 0
      let min = Infinity
      let max = 0
      let hasOpen = false
      for (let i = a; i <= end; i++) {
        const f = cur[i] as number
        mask |= 1 << ((pcOpen[i] + f) % 12)
        if (f === 0) hasOpen = true
        else {
          if (f < min) min = f
          if (f > max) max = f
        }
      }
      if ((mask & needMask) !== needMask) return
      if (min === Infinity) {
        if (lo !== 1) return // all-open shape: record once
        min = 0
      } else if (min !== lo) return // each shape belongs to exactly one window
      if (max - min > maxSpreadFor(n)) return
      if (hasOpen && max > OPEN_REACH) return
      const frets = cur.map((f, i) => (i >= a && i <= end ? f : null))
      if (fingering(frets).fingers > 4) return
      const key = frets.join(',')
      if (seen.has(key)) return
      seen.add(key)
      out.push(frets)
    }
    for (let a = 0; a < 6; a++) {
      const rec = (i: number): void => {
        if (i > a) evaluate(a, i - 1)
        if (i === 6) return
        for (const f of cands[i]) {
          cur[i] = f
          rec(i + 1)
        }
        cur[i] = null
      }
      cur.fill(null)
      rec(a)
    }
  }
  return out
}

/** ChordShape (low E first) with sensible finger numbers and barre. */
export function toShape(name: string, frets: (number | null)[]): ChordShape {
  const fretted = frets.filter((f): f is number => f !== null && f > 0)
  const lowest = fretted.length ? Math.min(...fretted) : 0
  const barre = fretted.length ? realBarre(frets, lowest) : undefined
  const fingers: (number | null)[] = frets.map(() => 0)
  let next = barre !== undefined ? 2 : 1
  const order = frets
    .map((f, i) => ({ f, i }))
    .filter((x): x is { f: number; i: number } => x.f !== null && x.f > 0)
    .sort((a, b) => a.f - b.f || b.i - a.i)
  for (const { f, i } of order) {
    if (barre !== undefined && f === barre) fingers[i] = 1
    else fingers[i] = Math.min(4, next++)
  }
  const out: ChordShape = { name, frets: [...frets], fingers }
  if (barre !== undefined) out.barre = barre
  return out
}

// ---------- collection of known shapes ----------

export interface LabelledShape {
  label: string
  shape: ChordShape
}

const OPEN_KEYS: Partial<Record<ChordType, string>> = {
  maj: '',
  min: 'm',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  sus2: 'sus2',
  sus4: 'sus4',
  add9: 'add9',
  power: '5'
}

/** The open-position shape of this chord from OPEN_CHORDS (matched by pitch class so Db/C# both find it), if any. */
export function openShape(root: string, type: ChordType): ChordShape | null {
  const suffix = OPEN_KEYS[type]
  if (suffix === undefined) return null
  const pc = pitchClass(root)
  for (const [name, sh] of Object.entries(OPEN_CHORDS)) {
    const m = /^([A-G][#b]?)(.*)$/.exec(name)
    if (m && m[2] === suffix && pitchClass(m[1]) === pc) return { ...sh, name: noteName(root) + CHORDS[type].symbol }
  }
  return null
}

const MINOR_CAGED: Record<string, { root: string; frets: string; label: string }> = {
  E: { root: 'E', frets: '022000', label: 'Em shape' },
  A: { root: 'A', frets: 'x02210', label: 'Am shape' },
  D: { root: 'D', frets: 'xx0231', label: 'Dm shape' }
}

/** CAGED-style shapes for major and minor triads (empty for other chords). */
export function cagedShapes(root: string, type: ChordType): LabelledShape[] {
  const sym = noteName(root) + CHORDS[type].symbol
  if (type === 'maj') {
    return CAGED_ORDER.map((form) => ({ label: `${form} shape`, shape: { ...cagedShape(root, form), name: sym } }))
  }
  if (type === 'min') {
    return Object.values(MINOR_CAGED).map((t) => {
      const shift = mod(pitchClass(root) - pitchClass(t.root), 12)
      const base = shape('', t.frets)
      const frets = base.frets.map((f) => (f === null ? null : f + shift))
      return { label: t.label, shape: toShape(sym, frets) }
    })
  }
  return []
}

const frKey = (s: ChordShape): string => s.frets.join(',')

/** Every shape the dictionary shows for a chord: open, E-form, A-form, CAGED, then generated voicings. */
export function chordShapeCollection(root: string, type: ChordType, generatedLimit = 8): LabelledShape[] {
  const out: LabelledShape[] = []
  const seen = new Set<string>()
  const add = (label: string, sh: ChordShape | null) => {
    if (!sh) return
    const k = frKey(sh)
    if (seen.has(k)) return
    seen.add(k)
    out.push({ label, shape: sh })
  }
  add('Open', openShape(root, type))
  add('E-form (root on 6th string)', movableChord(root, type, 6))
  add('A-form (root on 5th string)', movableChord(root, type, 5))
  for (const c of cagedShapes(root, type)) add(`CAGED: ${c.label}`, c.shape)
  for (const g of generateVoicings(root, type, { limit: generatedLimit })) add('Generated', g)
  return out
}

/** Midi notes of the most comfortable voicing near the nut (used by the looper). */
export function bestVoicing(root: string, type: ChordType, maxFret = 9): ChordShape {
  const open = openShape(root, type)
  if (open) return open
  const candidates: ChordShape[] = []
  for (const s of [6, 5] as const) {
    const m = movableChord(root, type, s)
    if (m) candidates.push(m)
  }
  candidates.push(...generateVoicings(root, type, { limit: 3, maxFret }))
  const reach = (sh: ChordShape) => Math.max(...(sh.frets.filter((f) => f !== null) as number[]))
  const nearNut = candidates.filter((c) => reach(c) <= maxFret + 3)
  const list = nearNut.length ? nearNut : candidates
  if (list.length) {
    return [...list].sort((a, b) => Math.min(...(a.frets.filter((f) => f) as number[])) - Math.min(...(b.frets.filter((f) => f) as number[])))[0]
  }
  // last resort: relaxed search
  const any = generateVoicings(root, type, { rootInBass: false, limit: 1, maxFret: 17, minStrings: 3 })
  if (any.length) return any[0]
  throw new Error(`No voicing for ${root}${type}`)
}

export const voicingMidis = (sh: ChordShape): number[] => shapeMidis(sh)
export { midiAt }



