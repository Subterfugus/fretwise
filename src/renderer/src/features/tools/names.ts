// Pure parsing of chord and scale names ("F#m7b5", "Bb maj7", "D dorian") plus root spelling helpers.
import { CHORDS, ChordType } from '@/theory/chords'
import { SCALES, ScaleType } from '@/theory/scales'
import { mod, pitchClass } from '@/theory/notes'

/** Sensible tonic spellings per pitch class (index = pitch class). */
export const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

export const rootName = (pc: number, minor = false): string => (minor ? MINOR_ROOTS : MAJOR_ROOTS)[mod(pc, 12)]

/** Does this chord/scale have a minor third? (decides sharp-or-flat root spelling) */
export function isMinorish(intervals: string[]): boolean {
  return intervals.includes('m3')
}

export interface ParsedChord {
  kind: 'chord'
  root: string
  type: ChordType
}
export interface ParsedScale {
  kind: 'scale'
  root: string
  type: ScaleType
}
export type ParsedName = ParsedChord | ParsedScale

// ---------- chord suffix aliases (case-sensitive; checked first) ----------
const CHORD_ALIASES: Record<ChordType, string[]> = {
  maj: ['', 'maj', 'major', 'M', 'ma'],
  min: ['m', 'min', 'minor', '-', 'mi'],
  dim: ['dim', 'o', 'dim5', 'diminished'],
  aug: ['aug', '+', 'augmented', 'aug5', '+5'],
  sus2: ['sus2', '2'],
  sus4: ['sus4', 'sus', '4'],
  power: ['5', 'power'],
  add9: ['add9', 'add2', '2add', 'majadd9', '(add9)'],
  maj6: ['6', 'maj6', 'M6', 'major6'],
  min6: ['m6', 'min6', '-6', 'minor6'],
  dom7: ['7', 'dom7', 'dom'],
  maj7: ['maj7', 'M7', 'ma7', 'major7', 'maj7th', 'major 7th', 'Δ', 'Δ7', 'j7'],
  min7: ['m7', 'min7', '-7', 'mi7', 'minor7', 'm7th'],
  m7b5: ['m7b5', 'ø', 'ø7', 'min7b5', '-7b5', 'm7-5', 'halfdim', 'halfdim7', 'm7(b5)', 'min7(b5)'],
  dim7: ['dim7', 'o7', 'dim7th', 'diminished 7', 'diminished 7th'],
  minMaj7: ['mmaj7', 'mM7', 'minmaj7', '-maj7', '-M7', 'mΔ', 'mΔ7', 'mmaj', 'minormajor7', 'mMaj7', 'm/maj7', 'm(maj7)', 'min(maj7)'],
  aug7: ['+7', 'aug7', '7#5', '7+5', '7aug', '7(#5)', '7(+5)'],
  augMaj7: ['maj7#5', 'maj7+5', 'M7#5', '+maj7', '+M7', 'augmaj7', 'maj7aug', 'Δ#5'],
  sus7: ['7sus4', '7sus', 'sus7', 'dom7sus4'],
  dom9: ['9', 'dom9'],
  maj9: ['maj9', 'M9', 'ma9', 'Δ9', 'major9'],
  min9: ['m9', 'min9', '-9', 'mi9', 'minor9'],
  dom7b9: ['7b9', '7-9', '7(b9)'],
  dom7s9: ['7#9', '7+9', '7(#9)'],
  dom11: ['11', 'dom11'],
  min11: ['m11', 'min11', '-11', 'mi11'],
  dom13: ['13', 'dom13'],
  maj7s11: ['maj7#11', 'M7#11', 'maj7(#11)', 'Δ#11', 'lydianchord', 'maj#11']
}

// Case-insensitive fallback (words only; "m" and "M" must not collapse here).
const CHORD_LOWER: Record<string, ChordType> = {}
const CHORD_EXACT = new Map<string, ChordType>()
for (const [type, list] of Object.entries(CHORD_ALIASES) as [ChordType, string[]][]) {
  for (const a of list) {
    const key = a.replace(/[()\s]/g, '')
    if (!CHORD_EXACT.has(key)) CHORD_EXACT.set(key, type)
    if (key.length > 2 && /[a-z]{3}/i.test(key)) CHORD_LOWER[key.toLowerCase()] ??= type
  }
}
// Fix up a few where the generic loop's first-wins ordering matters.
CHORD_EXACT.set('', 'maj')
CHORD_EXACT.set('2', 'sus2')

/** Normalise unicode and punctuation in a user-typed name. */
function normalise(s: string): string {
  return s
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/∆/g, 'Δ')
    .replace(/°/g, 'o')
    .replace(/[−–—]/g, '-')
}

/** Split a leading note letter + accidental off a string. Root letters may be lower case. */
export function splitRoot(s: string): { root: string; rest: string } | null {
  const m = /^([A-Ga-g])([#b]?)/.exec(s)
  if (!m) return null
  const root = m[1].toUpperCase() + m[2]
  const rest = s.slice(m[0].length).replace(/^\s+/, '')
  return { root, rest }
}

function chordTypeFor(suffixRaw: string): ChordType | null {
  const suffix = suffixRaw.replace(/[()\s,]/g, '').replace(/^dominant/i, 'dom')
  const exact = CHORD_EXACT.get(suffix)
  if (exact) return exact
  const lower = CHORD_LOWER[suffix.toLowerCase()]
  if (lower) return lower
  return null
}

/** Parse a chord symbol such as "F#m7b5", "Bb maj7", "CΔ7", "D7#9", "Gsus4". Returns null if unrecognised. */
export function parseChordName(input: string): ParsedChord | null {
  const s = normalise(input)
  const sp = splitRoot(s)
  if (!sp) return null
  const type = chordTypeFor(sp.rest)
  if (type) return { kind: 'chord', root: sp.root, type }
  // "Bm7b5" style where the root letter B swallowed a flat that belonged to the suffix? handled by trying B + "b..."
  if (sp.root.endsWith('b') && sp.root.length === 2) {
    const alt = chordTypeFor('b' + sp.rest)
    if (alt) return { kind: 'chord', root: sp.root[0], type: alt }
  }
  return null
}

// ---------- scales ----------
const SCALE_ALIASES: Record<ScaleType, string[]> = {
  major: ['major', 'maj', 'major scale', 'maj scale', 'major (ionian)'],
  naturalMinor: ['minor', 'natural minor', 'min', 'minor scale', 'nat minor', 'natural minor (aeolian)'],
  harmonicMinor: ['harmonic minor', 'harm minor', 'harmonic min', 'minor harmonic'],
  melodicMinor: ['melodic minor', 'mel minor', 'melodic min', 'jazz minor', 'minor melodic'],
  ionian: ['ionian'],
  dorian: ['dorian'],
  phrygian: ['phrygian'],
  lydian: ['lydian'],
  mixolydian: ['mixolydian', 'mixo', 'dominant scale'],
  aeolian: ['aeolian'],
  locrian: ['locrian'],
  majorPentatonic: ['major pentatonic', 'maj pentatonic', 'major pent', 'maj pent', 'pentatonic major'],
  minorPentatonic: ['minor pentatonic', 'min pentatonic', 'minor pent', 'min pent', 'pentatonic', 'pentatonic minor', 'pent'],
  blues: ['blues', 'blues scale', 'minor blues', 'minor blues scale'],
  majorBlues: ['major blues', 'major blues scale', 'maj blues'],
  wholeTone: ['whole tone', 'whole-tone', 'wholetone'],
  diminishedHW: ['diminished', 'half-whole', 'half whole', 'half-whole diminished', 'diminished half-whole', 'octatonic'],
  diminishedWH: ['whole-half', 'whole half', 'whole-half diminished', 'whole half diminished', 'diminished whole-half', 'diminished whole half', 'whole half octatonic'],
  lydianDominant: ['lydian dominant', 'lydian dom', 'lydian b7', 'overtone', 'acoustic'],
  altered: ['altered', 'super locrian', 'superlocrian', 'altered scale'],
  phrygianDominant: ['phrygian dominant', 'phrygian dom', 'spanish', 'spanish phrygian', 'freygish'],
  chromatic: ['chromatic', 'chromatic scale']
}
const SCALE_MAP = new Map<string, ScaleType>()
for (const [type, list] of Object.entries(SCALE_ALIASES) as [ScaleType, string[]][]) {
  for (const a of [...list, SCALES[type].name.toLowerCase()]) SCALE_MAP.set(a.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(), type)
}

/** Words that mark a name as a scale (not a chord) when present. */
const SCALE_ONLY = /(dorian|phrygian|lydian|mixolydian|aeolian|locrian|ionian|scale|pentatonic|pent\b|blues|harmonic|melodic|whole.?tone|diminished|altered|mode|half.?whole|spanish|mixo|natural|chromatic)/i

export function parseScaleName(input: string): ParsedScale | null {
  const s = normalise(input)
  const sp = splitRoot(s)
  if (!sp) return null
  const tries = [sp]
  if (sp.root.length === 2 && sp.root.endsWith('b')) tries.push({ root: sp.root[0], rest: 'b' + sp.rest })
  for (const t of tries) {
    let words = t.rest.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    words = words.replace(/\b(scale|mode)$/, '').trim()
    const direct = SCALE_MAP.get(words) ?? SCALE_MAP.get(words.replace(/-/g, ' '))
    if (direct) return { kind: 'scale', root: t.root, type: direct }
    const noScale = SCALE_MAP.get(words.replace(/ scale$/, ''))
    if (noScale) return { kind: 'scale', root: t.root, type: noScale }
  }
  return null
}

/**
 * Parse a free-text query into every sensible reading, best first. "D dorian" is a scale, "F#m7b5" a chord,
 * "C major" / "A minor" are both (chord first).
 */
export function parseQuery(input: string): ParsedName[] {
  const out: ParsedName[] = []
  const q = input.trim()
  if (!q) return out
  const chord = parseChordName(q)
  const scale = parseScaleName(q)
  const scaleFirst = SCALE_ONLY.test(q) && !(chord && /diminished/i.test(q))
  if (scaleFirst) {
    if (scale) out.push(scale)
    if (chord) out.push(chord)
  } else {
    if (chord) out.push(chord)
    if (scale) out.push(scale)
  }
  return out
}

/** Spelled root string -> pitch class (convenience for UI). */
export const rootPc = (root: string): number => pitchClass(root)

/** The standard display symbol for a chord (root + CHORDS suffix), e.g. "Bbmaj7". */
export const chordLabel = (root: string, type: ChordType): string => root + CHORDS[type].symbol
