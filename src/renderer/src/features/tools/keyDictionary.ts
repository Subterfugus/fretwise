// Pure data for the dictionary's KEY entries (scale notes, diatonic triads/sevenths with Roman numerals and
// function), the dictionary view model + query parsing, and a few voicing helpers. No React here.
import { CHORDS, ChordType, DiatonicChord, buildChord, diatonicChords, romanFor } from '@/theory/chords'
import { FLAT_NAMES, SHARP_NAMES, mod, noteName, pitchClass } from '@/theory/notes'
import { SCALES, ScaleType, buildScale, degreeLabels, scaleSemitones, stepPattern } from '@/theory/scales'
import { ParsedChord, ParsedName, ParsedScale, isMinorish, MAJOR_ROOTS, MINOR_ROOTS, parseChordName, parseQuery, parseScaleName, splitRoot } from './names'
import type { LibraryVoicing } from './chordLibrary'

// ---------- view model ----------
export interface KeyView {
  kind: 'key'
  root: string
  type: ScaleType
}
/** What the dictionary can show: a chord entry, a key entry (any 7-note scale/mode) or a plain scale entry. */
export type DictView = ParsedChord | ParsedScale | KeyView

const FLAT = '♭'
const SHARP = '♯'

/** Scales offered in the key picker (ionian/aeolian are the major and natural minor entries). */
export const KEY_SCALE_OPTIONS: ScaleType[] = ['major', 'naturalMinor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian']

const KEY_NAMES: Partial<Record<ScaleType, string>> = {
  major: 'major',
  naturalMinor: 'natural minor',
  harmonicMinor: 'harmonic minor',
  melodicMinor: 'melodic minor'
}
/** Short name used in titles and "Back to ..." links: "major", "natural minor", "dorian". */
export const keyScaleName = (type: ScaleType): string => KEY_NAMES[type] ?? SCALES[type].name.split(' (')[0].toLowerCase()

const capableCache = new Map<ScaleType, boolean>()
/** Can this scale be shown as a key entry (seven notes whose stacked thirds are all recognised chords)? */
export function isKeyScale(type: ScaleType): boolean {
  const hit = capableCache.get(type)
  if (hit !== undefined) return hit
  let ok = false
  try {
    ok = SCALES[type].intervals.length === 7 && diatonicChords('C', type, true).length === 7 && diatonicChords('C', type, false).length === 7
  } catch {
    ok = false
  }
  capableCache.set(type, ok)
  return ok
}

// ---------- root spelling ----------
const hasDouble = (names: string[]): boolean => names.some((n) => /^[A-G](##|bb)/.test(n))
const accCount = (names: string[]): number => names.reduce((a, n) => a + (n.length - 1), 0)

function bestRoot(pc: number, minorish: boolean, notesOf: (root: string) => string[]): string {
  const conv = (minorish ? MINOR_ROOTS : MAJOR_ROOTS)[mod(pc, 12)]
  const cands = [...new Set([conv, SHARP_NAMES[mod(pc, 12)], FLAT_NAMES[mod(pc, 12)]])]
  const scored = cands
    .map((r, i) => {
      let names: string[] = []
      try {
        names = notesOf(r)
      } catch {
        return null
      }
      return { r, i, bad: hasDouble(names), score: accCount(names) }
    })
    .filter((x): x is { r: string; i: number; bad: boolean; score: number } => x !== null)
    .sort((a, b) => Number(a.bad) - Number(b.bad) || a.score - b.score || a.i - b.i)
  return scored[0]?.r ?? conv
}

const scaleNotes = (root: string, type: ScaleType): string[] => buildScale(root, type).map(noteName)
const chordNotes = (root: string, type: ChordType): string[] => buildChord(root, type).map(noteName)

/** A conventional, double-accidental-free tonic name for a pitch class in this scale. */
export const keyRootFor = (pc: number, type: ScaleType): string => bestRoot(pc, isMinorish(SCALES[type].intervals), (r) => scaleNotes(r, type))
/** Same, for a chord root. */
export const chordRootFor = (pc: number, type: ChordType): string => bestRoot(pc, isMinorish(CHORDS[type].intervals), (r) => chordNotes(r, type))

/** Use the preferred spelling (e.g. from the global note-name setting) unless it forces double accidentals. */
export function resolveKeyRoot(pc: number, preferred: string, type: ScaleType): string {
  try {
    if (pitchClass(preferred) === mod(pc, 12) && !hasDouble(scaleNotes(preferred, type))) return preferred
  } catch {
    /* fall through */
  }
  return keyRootFor(pc, type)
}
export function resolveChordRoot(pc: number, preferred: string, type: ChordType): string {
  try {
    if (pitchClass(preferred) === mod(pc, 12) && !hasDouble(chordNotes(preferred, type))) return preferred
  } catch {
    /* fall through */
  }
  return chordRootFor(pc, type)
}

// ---------- key data ----------
export interface KeyChordRow {
  degree: number
  /** Roman numeral relative to the parallel major, e.g. "ii", "♭III", "vii°", "V7" */
  roman: string
  symbol: string
  root: string
  type: ChordType
  /** Harmonic function, e.g. "Tonic", "Subdominant", "Dominant"; '' when not meaningful (most modes) */
  fn: string
  /** The chord entry this row links to */
  link: ParsedChord
}

export interface KeyData {
  root: string
  type: ScaleType
  name: string
  notes: string[]
  degrees: string[]
  steps: string
  triads: KeyChordRow[]
  sevenths: KeyChordRow[]
}

const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11]

/** Roman numeral with an accidental when the degree differs from the parallel major: natural minor III -> "♭III". */
export function keyRoman(scale: ScaleType, degree: number, chordType: ChordType): string {
  const semis = scaleSemitones(scale)[degree - 1]
  const diff = semis - MAJOR_SEMIS[degree - 1]
  const acc = diff < 0 ? FLAT.repeat(-diff) : diff > 0 ? SHARP.repeat(diff) : ''
  return acc + romanFor(degree, chordType)
}

/** Function label for a diatonic chord. Only meaningful for the major/minor families; modes get "Tonic" on the I only. */
export function chordFunction(scale: ScaleType, degree: number): string {
  const minorFamily = scale === 'naturalMinor' || scale === 'aeolian' || scale === 'harmonicMinor' || scale === 'melodicMinor'
  const majorFamily = scale === 'major' || scale === 'ionian'
  if (!minorFamily && !majorFamily) return degree === 1 ? 'Tonic (home)' : ''
  if (degree === 1) return 'Tonic'
  if (degree === 2 || degree === 4) return 'Subdominant'
  if (scale === 'melodicMinor' && degree === 6) return 'Subdominant'
  if (degree === 3 || degree === 6) return 'Tonic (substitute)'
  if (degree === 5) return 'Dominant'
  if (degree === 7) return majorFamily || scale === 'harmonicMinor' || scale === 'melodicMinor' ? 'Dominant (leading tone)' : 'Subtonic'
  return ''
}

function rows(root: string, scale: ScaleType, sevenths: boolean): KeyChordRow[] {
  return diatonicChords(root, scale, sevenths).map((c: DiatonicChord) => ({
    degree: c.degree,
    roman: keyRoman(scale, c.degree, c.type),
    symbol: c.symbol,
    root: c.root,
    type: c.type,
    fn: chordFunction(scale, c.degree),
    link: { kind: 'chord', root: c.root, type: c.type }
  }))
}

export function keyData(root: string, type: ScaleType): KeyData {
  return {
    root,
    type,
    name: `${root} ${keyScaleName(type)}`,
    notes: scaleNotes(root, type),
    degrees: degreeLabels(type),
    steps: stepPattern(type),
    triads: rows(root, type, false),
    sevenths: rows(root, type, true)
  }
}

// ---------- view helpers ----------
const isScaleType = (t: unknown): t is ScaleType => typeof t === 'string' && Object.hasOwn(SCALES, t)
const isChordType = (t: unknown): t is ChordType => typeof t === 'string' && Object.hasOwn(CHORDS, t)

export const isDictionaryQuery = (v: unknown): v is string => typeof v === 'string'
export const isDictionaryRoot = (v: unknown): v is string => typeof v === 'string' && /^[A-G](?:#{1,2}|b{1,2})?$/.test(v)

export function isDictView(v: unknown): v is DictView {
  const o = v as DictView | null
  if (!o || typeof o !== 'object' || !isDictionaryRoot(o.root)) return false
  try {
    pitchClass(o.root)
  } catch {
    return false
  }
  if (o.kind === 'chord') return isChordType(o.type)
  return (o.kind === 'scale' || o.kind === 'key') && isScaleType(o.type)
}

export const sameView = (a: DictView, b: DictView): boolean => a.kind === b.kind && a.root === b.root && a.type === b.type

/** Seven-note scales open as key entries; everything else stays a scale entry. */
export function viewFor(p: ParsedName): DictView {
  return p.kind === 'scale' && isKeyScale(p.type) ? { kind: 'key', root: p.root, type: p.type } : p
}

/** Browse starts from a pitch-class picker; choose readable theory spelling for its target. */
export function resolveBrowseView(view: DictView): DictView {
  const pc = pitchClass(view.root)
  if (view.kind === 'chord') return { ...view, root: resolveChordRoot(pc, view.root, view.type) }
  const resolved = { ...view, root: resolveKeyRoot(pc, view.root, view.type) }
  return resolved.kind === 'scale' ? viewFor(resolved) : resolved
}

/** Short human label, e.g. "Bm", "D major", "A minor pentatonic". Used in titles and "Back to ..." links. */
export function viewLabel(v: DictView): string {
  if (v.kind === 'chord') return v.root + CHORDS[v.type].symbol
  if (v.kind === 'key') return `${v.root} ${keyScaleName(v.type)}`
  return `${v.root} ${SCALES[v.type].name.toLowerCase()}`
}

// ---------- query parsing ----------
const KEYISH = /\b(major|minor|ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian|harmonic|melodic|natural|mixo)\b/i

/** "key of Bb", "Bb key", "key of F#m" -> a key view. */
function parseKeyPhrase(q: string): KeyView | null {
  const m = /^\s*(?:the\s+)?key\s+(?:of\s+)?(.+?)\s*$/i.exec(q) ?? /^\s*(.+?)\s+key\s*$/i.exec(q)
  if (!m) return null
  const rest = m[1].trim()
  const sp = splitRoot(rest)
  if (!sp) return null
  if (sp.rest === '') return { kind: 'key', root: sp.root, type: 'major' }
  // Whole thing as a scale name ("Bb major", "E dorian", "A harmonic minor")
  const scale = parseScaleName(rest)
  if (scale && isKeyScale(scale.type)) return { kind: 'key', root: scale.root, type: scale.type }
  // Chord-style shorthand: "Bm", "F#min" -> minor key
  const chord = parseChordName(rest)
  if (chord && chord.type === 'min') return { kind: 'key', root: chord.root, type: 'naturalMinor' }
  if (chord && chord.type === 'maj') return { kind: 'key', root: chord.root, type: 'major' }
  return null
}

function dedupe(list: DictView[]): DictView[] {
  const out: DictView[] = []
  for (const v of list) if (!out.some((o) => sameView(o, v))) out.push(v)
  return out
}

/**
 * Every sensible reading of a typed query, best first. "Bm" and "F#m7b5" are chords; "D major", "E dorian" and
 * "key of Bb" are keys (a chord reading follows where one exists); 5-note and exotic scales stay scale entries.
 */
export function parseDictionaryQuery(input: string): DictView[] {
  const q = input.trim()
  if (!q) return []
  const keyPhrase = parseKeyPhrase(q)
  const base = parseQuery(q)
  const mapped = base.map(viewFor)
  if (keyPhrase) return dedupe([keyPhrase, ...mapped])
  if (KEYISH.test(q)) {
    // scale/key readings first, chord reading after
    const keys = mapped.filter((v) => v.kind !== 'chord')
    const chords = mapped.filter((v) => v.kind === 'chord')
    return dedupe([...keys, ...chords])
  }
  return dedupe(mapped)
}

// ---------- voicing helpers ----------
/**
 * The "common voicing" to play for a chord in a key list: a root-position shape on 4+ strings, lowest on the neck.
 * Falls back to progressively looser matches. Expects the list in chordLibrary order but does not rely on it.
 */
export function commonVoicing(list: LibraryVoicing[]): LibraryVoicing | null {
  const tiers: ((v: LibraryVoicing) => boolean)[] = [
    (v) => v.inversion === 0 && v.strings.length >= 4 && v.omitted.length === 0,
    (v) => v.inversion === 0 && v.strings.length >= 4,
    (v) => v.strings.length >= 4,
    () => true
  ]
  for (const ok of tiers) {
    const cands = list.filter(ok)
    if (cands.length) return [...cands].sort((a, b) => a.position - b.position || a.maxFret - b.maxFret || a.difficulty - b.difficulty || a.id.localeCompare(b.id))[0]
  }
  return null
}
