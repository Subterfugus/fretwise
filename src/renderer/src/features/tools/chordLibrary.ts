// Chord library for the comprehensive chord/key dictionary (see info.md "NEXT UP #1").
//
// The exported types and function signatures are the agreed interface between this library logic and the
// dictionary UI. Signatures may only gain OPTIONAL fields/params.
//
// CONVENTIONS (documented once, used everywhere):
//  - Frets are low E (string 6) -> high E (string 1); `null` = muted; 0 = open. Frets 0-22.
//  - Bass = the LOWEST SOUNDING MIDI PITCH, never "first sounding string".
//  - Degree labels use the app's glyphs: "1 2 3 4 5 6 7", flats/sharps as the real symbols, double-flat 7 for dim7.
//  - stringSet: all sounding string numbers ascending joined by "-" ("1-2-3", "2-3-4-5", non-adjacent "1-2-4-5",
//    "3-4-6"); a CONTIGUOUS run of 5 or 6 strings is abbreviated to "low-high": "1-5", "2-6", "1-6".
//  - size: <=3 sounding strings 'three', 4 'four', 5-6 'full'.
//  - position: the lowest fretted (non-open) fret; 0 for open-position shapes (open strings used and nothing above
//    fret OPEN_REACH = 4). minFret/maxFret are the lowest/highest FRETTED (non-open) frets.
//  - Spans (highest minus lowest fretted fret): generated 4+ string shapes <= 3 (a four-fret stretch), generated
//    3-string shapes <= 4 (same as the Triads trainer). Curated/open/barre shapes are taken as written.
//  - Fingers: >4 fretted notes require a genuine barre (a run of >=2 strings on one fret, nothing lower/open between them).
//    A barre is only reported when it is needed or declared by curated fingering; `barre` means "must barre".
//  - Omissions: the 5th (only if the chord has 4+ tones and a perfect 5th) and, for 11th/13th chords, the 9th (and
//    11th of a 13) may be omitted (voicings.omittableIntervals). ROOTLESS_TYPES (9th/11th/13th families) may also
//    omit the root. The 3rd / sus tone / 6th / 7th / altered 5th / the 9 of a plain 9th chord are never omittable.
//    `omitted` exactly equals the chord degrees that are not sounding.
//  - The returned library array is memoized and shared: DO NOT MUTATE it (copy before sorting).
import type { ChordShape } from '@/theory/guitar'
import { STANDARD_TUNING, movableChord, shape as parseShape } from '@/theory/guitar'
import type { ChordType } from '@/theory/chords'
import { CHORDS, buildChord } from '@/theory/chords'
import { parseInterval } from '@/theory/intervals'
import { mod, noteName, pitchClass } from '@/theory/notes'
import { CURATED_TEMPLATES, INTERVAL_DEGREE_LABEL } from './chordShapesData'
import type { CuratedTemplate } from './chordShapesData'
import {
  LAST_FRET,
  OPEN_REACH,
  ROOTLESS_TYPES,
  assignFingers,
  barreGroup,
  enumerateShapes,
  fingering,
  omittableIntervals,
  openShape
} from './voicings'

/** Where a voicing came from. 'curated' shapes are hand-checked common fingerings; 'barre' = movable E/A-form shapes. */
export type VoicingSource = 'open' | 'barre' | 'curated' | 'generated'

/** 3 strings (or fewer), 4 strings, or 5–6 strings ("full"). */
export type VoicingSize = 'three' | 'four' | 'full'

/** Chord member in the bass, computed from the LOWEST SOUNDING MIDI PITCH (never string order). */
export type BassRole = 'root' | 'third' | 'fifth' | 'seventh' | 'other'

export interface LibraryVoicing {
  /** Stable id: frets low-E→high-E joined, e.g. "x,2,4,4,3,2" */
  id: string
  /** Frets low E (string 6) → high E (string 1), fingers (1–4, 0 open, null muted) and barre fret */
  shape: ChordShape
  rootPc: number
  type: ChordType
  /** Chord symbol with correct spelling, e.g. "Bm" */
  symbol: string
  /** Slash name when the bass isn't the root, e.g. "Bm/D"; null in root position */
  slashName: string | null
  bassMidi: number
  bassPc: number
  bassRole: BassRole
  /** Degree label of the bass relative to the root, e.g. "1", "♭3", "5", "♭7" */
  bassDegree: string
  /**
   * 0 = root position, 1 = 3rd in bass, 2 = 5th in bass, 3 = 7th in bass; null when the bass is another tone (a 2nd/4th/6th/9th...)
   * and for chords without a 3rd (sus, power) whose non-root bass is never called an inversion. Matches chordShapesData.inversionFor.
   */
  inversion: 0 | 1 | 2 | 3 | null
  /** Sounding strings, ascending string number (1 = high E) */
  strings: number[]
  /** Contiguous-set label like "1-2-3", "2-3-4-5", or "1-6"; non-adjacent sets list strings, e.g. "1-2-4-5" */
  stringSet: string
  size: VoicingSize
  /** Lowest fretted (non-open) fret, 0 if only open strings are fretted */
  minFret: number
  maxFret: number
  /** Position on the neck used for ordering/axis (lowest fretted fret; 0 for open-position shapes) */
  position: number
  /** True if one finger must barre ≥2 strings */
  barre: boolean
  hasOpenStrings: boolean
  /** Chord tones intentionally left out, as degree labels, e.g. ["5"] or ["5", "9", "11"] */
  omitted: string[]
  source: VoicingSource
  /** Short human label, e.g. "Open", "E-shape barre", "Drop 2 (strings 1-4)", "Triad, 2nd inversion" */
  label: string
  /** Rough playability score, lower = easier (for ordering within a position, not a promise of comfort) */
  difficulty: number
  /** Spelled root name the voicing was built for (e.g. "Bb"). Optional for forward compatibility; always set by this module. */
  rootName?: string
}

export interface LibraryFilter {
  /** Exact stringSet labels to include (empty/undefined = any) */
  stringSets?: string[]
  sizes?: VoicingSize[]
  /** Inclusive range the whole shape must fit in (frets 0–22; open strings count as fret 0) */
  fretRange?: [number, number]
  barre?: 'any' | 'only' | 'none'
  bass?: 'any' | BassRole
  sources?: VoicingSource[]
  /** Hide shapes with open strings */
  noOpenStrings?: boolean
}

/**
 * Chord qualities the library covers (UI uses this list for quality pickers): every ChordType in CHORDS, common ones first.
 * chordLibrary() returns a non-empty library for each of them in every root.
 */
export const LIBRARY_QUALITIES: ChordType[] = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4', 'power', 'add9', 'maj6', 'min6',
  'dom7', 'maj7', 'min7', 'm7b5', 'dim7', 'minMaj7', 'sus7', 'dom9', 'maj9', 'min9', 'dom13',
  'aug7', 'augMaj7', 'dom7b9', 'dom7s9', 'dom11', 'min11', 'maj7s11'
]

// ---------- degree labels, regions ----------

const FLAT = '♭'
const SHARP = '♯'
const DFLAT = '\u{1D12B}'
const DSHARP = '\u{1D12A}'
const BASE_SEMIS = [0, 0, 2, 4, 5, 7, 9, 11]

/** Degree label of a short interval name: "m3" -> "♭3", "d5" -> "♭5", "A5" -> "♯5", "d7" -> "𝄫7", "M9" -> "9". */
export function degreeLabel(interval: string): string {
  if (INTERVAL_DEGREE_LABEL[interval]) return INTERVAL_DEGREE_LABEL[interval]
  const iv = parseInterval(interval)
  const simple = ((iv.number - 1) % 7) + 1
  const diff = iv.semitones - (BASE_SEMIS[simple] + 12 * Math.floor((iv.number - 1) / 7))
  const acc = diff === 0 ? '' : diff === -1 ? FLAT : diff === -2 ? DFLAT : diff === 1 ? SHARP : diff === 2 ? DSHARP : ''
  return acc + iv.number
}

export interface PositionRegion {
  id: string
  label: string
  /** Inclusive range of `position` values in this region */
  min: number
  max: number
}

/**
 * Neck regions the UI groups by (by `position`): Open–4th, 5th–8th, 9th–12th, 13th–17th, 18th–22nd.
 * Frets up the neck are narrower so the last two bands are wider; the 12th-fret octave sits at the 9–12 / 13+ boundary.
 */
export const positionRegions: readonly PositionRegion[] = [
  { id: 'open', label: 'Open–4th', min: 0, max: 4 },
  { id: '5-8', label: '5th–8th', min: 5, max: 8 },
  { id: '9-12', label: '9th–12th', min: 9, max: 12 },
  { id: '13-17', label: '13th–17th', min: 13, max: 17 },
  { id: '18-22', label: '18th–22nd', min: 18, max: 22 }
]

/** The region containing a position (clamped to the first/last region). */
export function regionOf(position: number): PositionRegion {
  return positionRegions.find((r) => position >= r.min && position <= r.max) ?? (position < 0 ? positionRegions[0] : positionRegions[positionRegions.length - 1])
}

/** Label for a set of sounding strings; see CONVENTIONS above. */
export function stringSetLabel(strings: readonly number[]): string {
  const s = [...strings].sort((a, b) => a - b)
  const contiguous = s.every((x, i) => i === 0 || x === s[i - 1] + 1)
  return contiguous && s.length >= 5 ? `${s[0]}-${s[s.length - 1]}` : s.join('-')
}

// ---------- chord context ----------

interface Ctx {
  root: string
  rootPc: number
  type: ChordType
  symbol: string
  /** spelled tone names / degree labels / roles per CHORDS[type].intervals index */
  names: string[]
  degrees: string[]
  roles: BassRole[]
  pcToIdx: Map<number, number>
  omittable: Set<number>
  /** index of the chord's 5th (any quality), or -1 */
  fifthIdx: number
  /** a chord with a 3rd: only those have meaningful inversions */
  hasThird: boolean
  rootless: boolean
}

const ctxCache = new Map<string, Ctx>()

function getCtx(root: string, type: ChordType): Ctx {
  const key = `${root}|${type}`
  const hit = ctxCache.get(key)
  if (hit) return hit
  const ivs = CHORDS[type].intervals
  const tones = buildChord(root, type)
  const omit = new Set(omittableIntervals(type))
  const rootless = ROOTLESS_TYPES.has(type)
  const ctx: Ctx = {
    root,
    rootPc: pitchClass(root),
    type,
    symbol: noteName(root) + CHORDS[type].symbol,
    names: tones.map(noteName),
    degrees: ivs.map(degreeLabel),
    roles: ivs.map((iv, i) => {
      if (i === 0) return 'root'
      const n = parseInterval(iv).number
      return n === 3 ? 'third' : n === 5 ? 'fifth' : n === 7 ? 'seventh' : 'other'
    }),
    pcToIdx: new Map(tones.map((n, i) => [pitchClass(n), i])),
    omittable: new Set(ivs.map((iv, i) => (omit.has(iv) || (rootless && i === 0) ? i : -1)).filter((i) => i >= 0)),
    fifthIdx: ivs.findIndex((iv) => parseInterval(iv).number === 5),
    hasThird: ivs.some((iv) => parseInterval(iv).number === 3),
    rootless
  }
  ctxCache.set(key, ctx)
  return ctx
}

const OPEN_LOW_TO_HIGH = [...STANDARD_TUNING].reverse()
const INVERSION_OF: Record<BassRole, 0 | 1 | 2 | 3 | null> = { root: 0, third: 1, fifth: 2, seventh: 3, other: null }

/** Round to 2 decimals. */
const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Difficulty score (lower = easier), documented so the UI can explain it: fingers needed (barre = 1) + 1.2 per fret of
 * span + 1.5 for a barre (+0.5 if it covers 5+ strings) + 0.2 x (8 - lowest fret) x (span - 2) for wide stretches low
 * on the neck + 1 per jump of 3+ frets between neighbouring fretted strings + 1.5 per muted string inside the shape
 * - 0.3 per open string; never below 0.
 */
function difficultyOf(frets: readonly (number | null)[], fg: ReturnType<typeof fingering>): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0)
  const min = fretted.length ? Math.min(...fretted) : 0
  const span = fretted.length ? Math.max(...fretted) - min : 0
  let d = fg.fingers + span * 1.2
  if (fg.barre !== undefined) d += 1.5 + (frets.filter((f) => f === fg.barre).length >= 5 ? 0.5 : 0)
  if (fretted.length && min <= 7 && span >= 3) d += (8 - min) * 0.2 * (span - 2)
  const idx = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0)
  for (let k = 1; k < idx.length; k++) {
    const a = frets[idx[k - 1]] as number
    const b = frets[idx[k]] as number
    if (a > 0 && b > 0 && Math.abs(a - b) >= 3) d += 1
  }
  for (let i = idx[0] ?? 0; i <= (idx[idx.length - 1] ?? -1); i++) if (frets[i] === null) d += 1.5
  d -= 0.3 * frets.filter((f) => f === 0).length
  return r2(Math.max(0, d))
}

function analyzeInCtx(ctx: Ctx, input: ChordShape, source: VoicingSource, label: string): LibraryVoicing | null {
  const frets = input.frets
  if (!Array.isArray(frets) || frets.length !== 6) return null
  if (frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0 || f > LAST_FRET))) return null
  const sounding: { idx: number; midi: number }[] = []
  frets.forEach((f, idx) => {
    if (f !== null) sounding.push({ idx, midi: OPEN_LOW_TO_HIGH[idx] + f })
  })
  if (sounding.length < (ctx.type === 'power' ? 2 : 3)) return null

  const present = new Set<number>()
  for (const s of sounding) {
    const t = ctx.pcToIdx.get(mod(s.midi, 12))
    if (t === undefined) return null // non-chord tone
    present.add(t)
  }
  const omittedIdx: number[] = []
  for (let i = 0; i < ctx.degrees.length; i++) {
    if (present.has(i)) continue
    // essential tone missing, unless omittable. Curated shells may also drop an altered 5th (e.g. a m7b5 shell R-b3-b7);
    // generated/arbitrary shapes may not, since without the b5 the shape reads as a different chord.
    const curatedFifth = source === 'curated' && i === ctx.fifthIdx && ctx.degrees.length >= 4
    if (!ctx.omittable.has(i) && !curatedFifth) return null
    omittedIdx.push(i)
  }
  if (present.size < (ctx.type === 'power' ? 2 : 3)) return null

  let bass = sounding[0]
  for (const s of sounding) if (s.midi < bass.midi) bass = s
  const bassIdx = ctx.pcToIdx.get(mod(bass.midi, 12)) as number
  const bassRole = ctx.roles[bassIdx]

  const strings = sounding.map((s) => 6 - s.idx).sort((a, b) => a - b)
  const fretted = frets.filter((f): f is number => f !== null && f > 0)
  const minFret = fretted.length ? Math.min(...fretted) : 0
  const maxFret = fretted.length ? Math.max(...fretted) : 0
  const hasOpenStrings = sounding.some((s) => frets[s.idx] === 0)
  const position = hasOpenStrings && maxFret <= OPEN_REACH ? 0 : minFret

  const fg = fingering(frets, input.barre)
  const fingers =
    input.fingers && input.fingers.length === 6 ? [...input.fingers] : assignFingers(frets, fg.barre)
  const symbol = ctx.symbol
  const slashName = bassRole === 'root' ? null : `${symbol}/${ctx.names[bassIdx]}`
  const outShape: ChordShape = { name: slashName ?? symbol, frets: [...frets], fingers }
  if (fg.barre !== undefined) outShape.barre = fg.barre

  return {
    id: frets.map((f) => (f === null ? 'x' : f)).join(','),
    shape: outShape,
    rootPc: ctx.rootPc,
    type: ctx.type,
    symbol,
    slashName,
    bassMidi: bass.midi,
    bassPc: mod(bass.midi, 12),
    bassRole,
    bassDegree: ctx.degrees[bassIdx],
    inversion: bassRole !== 'root' && !ctx.hasThird ? null : INVERSION_OF[bassRole],
    strings,
    stringSet: stringSetLabel(strings),
    size: strings.length <= 3 ? 'three' : strings.length === 4 ? 'four' : 'full',
    minFret,
    maxFret,
    position,
    barre: fg.barre !== undefined,
    hasOpenStrings,
    omitted: omittedIdx.map((i) => ctx.degrees[i]),
    source,
    label,
    difficulty: difficultyOf(frets, fg),
    rootName: noteName(ctx.root)
  }
}

/**
 * Analyse an arbitrary shape for root+type. Returns null if it contains a non-chord tone, lacks an essential tone
 * (3rd / sus tone / 6th / 7th / altered 5th, and the root unless the type is a rootless-capable 9th/11th/13th chord),
 * omits tones that may not be omitted, or sounds fewer than 3 strings (2 for power chords). Computes bass from the
 * lowest sounding MIDI pitch, spelled slash name, inversion, string set, barre, omissions, finger numbers and difficulty.
 */
export function analyzeVoicing(root: string, type: ChordType, shape: ChordShape, source: VoicingSource = 'generated', label = ''): LibraryVoicing | null {
  return analyzeInCtx(getCtx(root, type), shape, source, label)
}

// ---------- helpers for the UI ----------

function ctxOf(v: LibraryVoicing): Ctx {
  const root = v.rootName ?? (/^[A-G][#b]*/.exec(v.symbol)?.[0] ?? 'C')
  return getCtx(root, v.type)
}

/** Per-string degree labels, ALWAYS length 6 in string order low E (index 0) → high E (index 5), like ["1","5","1","♭3","5",...]; null for muted strings. */
export function voicingDegreeLabels(v: LibraryVoicing): (string | null)[] {
  const ctx = ctxOf(v)
  return v.shape.frets.map((f, i) => (f === null ? null : (ctx.degrees[ctx.pcToIdx.get(mod(OPEN_LOW_TO_HIGH[i] + f, 12)) ?? -1] ?? null)))
}

/** Per-string note names, ALWAYS length 6 in string order low E (index 0) → high E (index 5), spelled from the chord's own spelling (Bb chord: "Bb" not "A#"); null for muted. */
export function voicingNoteNames(v: LibraryVoicing): (string | null)[] {
  const ctx = ctxOf(v)
  return v.shape.frets.map((f, i) => (f === null ? null : (ctx.names[ctx.pcToIdx.get(mod(OPEN_LOW_TO_HIGH[i] + f, 12)) ?? -1] ?? null)))
}

export interface LibrarySummary {
  total: number
  /** Counts by `positionRegions` id (every region present, possibly 0) */
  byRegion: Record<string, number>
  byBass: Record<BassRole, number>
  bySize: Record<VoicingSize, number>
  bySource: Record<VoicingSource, number>
}

/** Counts per position region / bass role / size / source, for filter badges and headers. */
export function librarySummary(list: readonly LibraryVoicing[]): LibrarySummary {
  const s: LibrarySummary = {
    total: list.length,
    byRegion: Object.fromEntries(positionRegions.map((r) => [r.id, 0])),
    byBass: { root: 0, third: 0, fifth: 0, seventh: 0, other: 0 },
    bySize: { three: 0, four: 0, full: 0 },
    bySource: { open: 0, barre: 0, curated: 0, generated: 0 }
  }
  for (const v of list) {
    s.byRegion[regionOf(v.position).id]++
    s.byBass[v.bassRole]++
    s.bySize[v.size]++
    s.bySource[v.source]++
  }
  return s
}

// ---------- curated templates ----------

function finishTemplateShape(t: CuratedTemplate, frets: (number | null)[], fingers: (number | null)[] | undefined): ChordShape {
  const out: ChordShape = { name: t.label, frets }
  if (fingers) {
    out.fingers = fingers
    // a finger shared by >=2 strings on one fret is a declared barre (any fret, if a bar can really cover them)
    const frs = [...new Set(frets.filter((f): f is number => f !== null && f > 0))].sort((a, b) => a - b)
    for (const b of frs) {
      const g = barreGroup(frets, b)
      if (!g) continue
      const fs = g.map((i) => fingers[i])
      if (fs.every((x) => x !== null && x > 0 && x === fs[0])) {
        out.barre = b
        break
      }
    }
  }  return out
}

/**
 * Instances of one curated template for `root`: movable templates at every octave that fits in frets 0–22, non-movable
 * ones only when `root` is enharmonic with `refRoot`. Unparseable templates give []. Fingers are kept unless a note
 * becomes an open string by the move (then they are reassigned by the library).
 */
export function expandTemplate(t: CuratedTemplate, root: string): ChordShape[] {
  let base: ChordShape
  try {
    base = parseShape(t.label, t.frets, t.fingers)
  } catch {
    return []
  }
  const fingers0 = base.fingers && base.fingers.length === 6 ? base.fingers : undefined
  const delta0 = mod(pitchClass(root) - pitchClass(t.refRoot), 12)
  if (!t.movable) return delta0 === 0 ? [finishTemplateShape(t, base.frets, fingers0)] : []
  const out: ChordShape[] = []
  for (let k = -2; k <= 2; k++) {
    const d = delta0 + 12 * k
    const frets = base.frets.map((f) => (f === null ? null : f + d))
    if (frets.some((f) => f !== null && (f < 0 || f > LAST_FRET))) continue
    const becameOpen = frets.some((f, i) => f === 0 && (base.frets[i] as number) > 0)
    out.push(finishTemplateShape(t, frets, becameOpen ? undefined : fingers0))
  }
  return out
}

// ---------- building the library ----------

const PRIORITY: Record<VoicingSource, number> = { curated: 0, open: 1, barre: 2, generated: 3 }
const ORDINAL = ['root position', '1st inversion', '2nd inversion', '3rd inversion']

function structureOf(midis: number[]): string {
  const p = [...midis].sort((a, b) => a - b)
  if (p[3] - p[0] < 12) return 'Closed'
  if (p[3] - p[1] < 12) {
    const up = p[0] + 12
    if (up > p[2] && up < p[3]) return 'Drop 2'
    if (up > p[1] && up < p[2]) return 'Drop 3'
  }
  return 'Spread'
}

function generatedLabel(ctx: Ctx, v: LibraryVoicing): string {
  const n = v.strings.length
  const rootless = v.omitted.includes('1') ? 'Rootless ' : ''
  const tones = ctx.degrees.length
  if (n === 3 && tones === 3 && v.omitted.length === 0) {
    return `Triad, ${v.inversion !== null && v.inversion <= 2 ? ORDINAL[v.inversion] : `${v.bassDegree} in bass`}`
  }
  if (n === 3) return `${rootless}3-string shell`
  const lo = v.strings[0]
  const hi = v.strings[v.strings.length - 1]
  if (n === 4 && hi - lo === 3) {
    const midis = v.shape.frets.flatMap((f, i) => (f === null ? [] : [OPEN_LOW_TO_HIGH[i] + f]))
    if (new Set(midis.map((m) => mod(m, 12))).size === 4) return `${rootless}${structureOf(midis)} (strings ${lo}-${hi})`
  }
  return `${rootless}${n}-string voicing`
}

/** Most generated shapes kept per (string set, bass degree, omissions, neck region), by size. Keeps the library broad rather than exhaustive. */
const GENERATED_CAP: Record<VoicingSize, number> = { three: 4, four: 3, full: 2 }

const libraryCache = new Map<string, LibraryVoicing[]>()

/** Forget memoized libraries (tests/benchmarks). */
export function clearChordLibraryCache(): void {
  libraryCache.clear()
}

const cmp = (a: LibraryVoicing, b: LibraryVoicing): number =>
  a.position - b.position || a.difficulty - b.difficulty || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Every voicing for root+type across frets 0–22, deduplicated, ordered by `position`
 * then difficulty then id (stable). Memoized per spelled root + type: the returned array is shared, do not mutate it.
 */
export function chordLibrary(root: string, type: ChordType): LibraryVoicing[] {
  const key = `${root}|${type}`
  const hit = libraryCache.get(key)
  if (hit) return hit
  const ctx = getCtx(root, type)
  const byId = new Map<string, LibraryVoicing>()
  const add = (sh: ChordShape | null, source: VoicingSource, label: string): LibraryVoicing | null => {
    if (!sh) return null
    const v = analyzeInCtx(ctx, sh, source, label)
    if (!v) return null
    const prev = byId.get(v.id)
    if (prev && PRIORITY[prev.source] <= PRIORITY[source]) return null
    byId.set(v.id, v)
    return v
  }

  // curated (hand-checked) templates
  for (const t of CURATED_TEMPLATES) {
    if (t.type !== type) continue
    for (const sh of expandTemplate(t, root)) add(sh, 'curated', t.label)
  }
  // open shape
  add(openShape(root, type), 'open', 'Open')
  // movable E-form / A-form (and octave-up copies)
  for (const rootString of [6, 5] as const) {
    const m = movableChord(root, type, rootString)
    if (!m) continue
    const name = rootString === 6 ? 'E-shape' : 'A-shape'
    for (const shift of [0, 12]) {
      const frets = m.frets.map((f) => (f === null ? null : f + shift))
      if (frets.some((f) => f !== null && f > LAST_FRET)) continue
      const v = add({ name: m.name, frets }, 'barre', name)
      if (v && v.barre) v.label = `${name} barre`
    }
  }

  // generated shapes: validated, deduplicated against the above, then capped per bucket
  const generated: LibraryVoicing[] = []
  for (const frets of enumerateShapes(root, type)) {
    const v = analyzeInCtx(ctx, { name: '', frets }, 'generated', '')
    if (v && !byId.has(v.id)) generated.push(v)
  }
  generated.sort(cmp)
  const kept = new Map<string, number>()
  for (const v of generated) {
    const bucket = `${v.stringSet}|${v.bassDegree}|${v.omitted.join(',')}|${regionOf(v.position).id}`
    const n = kept.get(bucket) ?? 0
    if (n >= GENERATED_CAP[v.size]) continue
    kept.set(bucket, n + 1)
    v.label = generatedLabel(ctx, v)
    byId.set(v.id, v)
  }

  const out = [...byId.values()].sort(cmp)
  libraryCache.set(key, out)
  return out
}

export function filterLibrary(list: LibraryVoicing[], f: LibraryFilter): LibraryVoicing[] {
  return list.filter((v) => {
    if (f.stringSets?.length && !f.stringSets.includes(v.stringSet)) return false
    if (f.sizes?.length && !f.sizes.includes(v.size)) return false
    if (f.fretRange) {
      // the whole shape: every sounding string counts, open strings as fret 0
      const all = v.shape.frets.filter((x): x is number => x !== null)
      if (Math.min(...all) < f.fretRange[0] || Math.max(...all) > f.fretRange[1]) return false
    }
    if (f.barre === 'only' && !v.barre) return false
    if (f.barre === 'none' && v.barre) return false
    if (f.bass && f.bass !== 'any' && v.bassRole !== f.bass) return false
    if (f.sources?.length && !f.sources.includes(v.source)) return false
    if (f.noOpenStrings && v.hasOpenStrings) return false
    return true
  })
}




