import { transpose } from './intervals'
import { Note, noteName, pitchClass, toNote } from './notes'
import { SCALES, ScaleType, buildScale } from './scales'

export interface ChordDef {
  /** Suffix used in chord symbols: C + "m7" = Cm7 */
  symbol: string
  name: string
  intervals: string[]
  /** Chord-tone formula like "1 ♭3 5 ♭7" */
  formula: string
}

export const CHORDS = {
  maj: { symbol: '', name: 'major', intervals: ['P1', 'M3', 'P5'], formula: '1 3 5' },
  min: { symbol: 'm', name: 'minor', intervals: ['P1', 'm3', 'P5'], formula: '1 ♭3 5' },
  dim: { symbol: '°', name: 'diminished', intervals: ['P1', 'm3', 'd5'], formula: '1 ♭3 ♭5' },
  aug: { symbol: '+', name: 'augmented', intervals: ['P1', 'M3', 'A5'], formula: '1 3 ♯5' },
  sus2: { symbol: 'sus2', name: 'suspended 2nd', intervals: ['P1', 'M2', 'P5'], formula: '1 2 5' },
  sus4: { symbol: 'sus4', name: 'suspended 4th', intervals: ['P1', 'P4', 'P5'], formula: '1 4 5' },
  power: { symbol: '5', name: 'power chord', intervals: ['P1', 'P5'], formula: '1 5' },
  add9: { symbol: 'add9', name: 'added 9th', intervals: ['P1', 'M3', 'P5', 'M9'], formula: '1 3 5 9' },
  maj6: { symbol: '6', name: 'major 6th', intervals: ['P1', 'M3', 'P5', 'M6'], formula: '1 3 5 6' },
  min6: { symbol: 'm6', name: 'minor 6th', intervals: ['P1', 'm3', 'P5', 'M6'], formula: '1 ♭3 5 6' },
  dom7: { symbol: '7', name: 'dominant 7th', intervals: ['P1', 'M3', 'P5', 'm7'], formula: '1 3 5 ♭7' },
  maj7: { symbol: 'maj7', name: 'major 7th', intervals: ['P1', 'M3', 'P5', 'M7'], formula: '1 3 5 7' },
  min7: { symbol: 'm7', name: 'minor 7th', intervals: ['P1', 'm3', 'P5', 'm7'], formula: '1 ♭3 5 ♭7' },
  m7b5: { symbol: 'm7♭5', name: 'half-diminished 7th', intervals: ['P1', 'm3', 'd5', 'm7'], formula: '1 ♭3 ♭5 ♭7' },
  dim7: { symbol: '°7', name: 'diminished 7th', intervals: ['P1', 'm3', 'd5', 'd7'], formula: '1 ♭3 ♭5 𝄫7' },
  minMaj7: { symbol: 'm(maj7)', name: 'minor-major 7th', intervals: ['P1', 'm3', 'P5', 'M7'], formula: '1 ♭3 5 7' },
  aug7: { symbol: '+7', name: 'augmented 7th', intervals: ['P1', 'M3', 'A5', 'm7'], formula: '1 3 ♯5 ♭7' },
  augMaj7: { symbol: 'maj7♯5', name: 'augmented major 7th', intervals: ['P1', 'M3', 'A5', 'M7'], formula: '1 3 ♯5 7' },
  sus7: { symbol: '7sus4', name: 'dominant 7 sus4', intervals: ['P1', 'P4', 'P5', 'm7'], formula: '1 4 5 ♭7' },
  dom9: { symbol: '9', name: 'dominant 9th', intervals: ['P1', 'M3', 'P5', 'm7', 'M9'], formula: '1 3 5 ♭7 9' },
  maj9: { symbol: 'maj9', name: 'major 9th', intervals: ['P1', 'M3', 'P5', 'M7', 'M9'], formula: '1 3 5 7 9' },
  min9: { symbol: 'm9', name: 'minor 9th', intervals: ['P1', 'm3', 'P5', 'm7', 'M9'], formula: '1 ♭3 5 ♭7 9' },
  dom7b9: { symbol: '7♭9', name: 'dominant 7 flat 9', intervals: ['P1', 'M3', 'P5', 'm7', 'm9'], formula: '1 3 5 ♭7 ♭9' },
  dom7s9: { symbol: '7♯9', name: 'dominant 7 sharp 9 ("Hendrix")', intervals: ['P1', 'M3', 'P5', 'm7', 'A9'], formula: '1 3 5 ♭7 ♯9' },
  dom11: { symbol: '11', name: 'dominant 11th', intervals: ['P1', 'M3', 'P5', 'm7', 'M9', 'P11'], formula: '1 3 5 ♭7 9 11' },
  min11: { symbol: 'm11', name: 'minor 11th', intervals: ['P1', 'm3', 'P5', 'm7', 'M9', 'P11'], formula: '1 ♭3 5 ♭7 9 11' },
  dom13: { symbol: '13', name: 'dominant 13th', intervals: ['P1', 'M3', 'P5', 'm7', 'M9', 'M13'], formula: '1 3 5 ♭7 9 13' },
  maj7s11: { symbol: 'maj7♯11', name: 'major 7 sharp 11 (Lydian)', intervals: ['P1', 'M3', 'P5', 'M7', 'A11'], formula: '1 3 5 7 ♯11' }
} satisfies Record<string, ChordDef>

export type ChordType = keyof typeof CHORDS

export function buildChord(root: Note | string, type: ChordType): Note[] {
  const r = toNote(root)
  return CHORDS[type].intervals.map((iv) => transpose(r, iv))
}

export function chordNames(root: Note | string, type: ChordType): string[] {
  return buildChord(root, type).map(noteName)
}

export function chordSymbol(root: Note | string, type: ChordType): string {
  return noteName(root) + CHORDS[type].symbol
}

/** Identify a chord from a set of note names (any order/octave). Returns best match or null. */
export function identifyChord(notes: (Note | string)[]): { root: string; type: ChordType } | null {
  const pcs = new Set(notes.map(pitchClass))
  for (const n of notes) {
    for (const type of Object.keys(CHORDS) as ChordType[]) {
      const tones = buildChord(n, type).map(pitchClass)
      if (tones.length === pcs.size && tones.every((t) => pcs.has(t))) return { root: noteName(n), type }
    }
  }
  return null
}

// ---------- Diatonic harmony ----------

export interface DiatonicChord {
  degree: number // 1..7
  roman: string // "ii", "V7", "vii°"
  root: string
  type: ChordType
  symbol: string
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function qualityFromStack(third: number, fifth: number, seventh?: number): ChordType {
  if (seventh === undefined) {
    if (third === 4 && fifth === 7) return 'maj'
    if (third === 3 && fifth === 7) return 'min'
    if (third === 3 && fifth === 6) return 'dim'
    if (third === 4 && fifth === 8) return 'aug'
  } else {
    if (third === 4 && fifth === 7 && seventh === 11) return 'maj7'
    if (third === 4 && fifth === 7 && seventh === 10) return 'dom7'
    if (third === 3 && fifth === 7 && seventh === 10) return 'min7'
    if (third === 3 && fifth === 6 && seventh === 10) return 'm7b5'
    if (third === 3 && fifth === 6 && seventh === 9) return 'dim7'
    if (third === 3 && fifth === 7 && seventh === 11) return 'minMaj7'
    if (third === 4 && fifth === 8 && seventh === 10) return 'aug7'
    if (third === 4 && fifth === 8 && seventh === 11) return 'augMaj7'
  }
  throw new Error(`Unrecognised stack ${third}/${fifth}/${seventh}`)
}

export function romanFor(degree: number, type: ChordType): string {
  const base = ROMAN[degree - 1]
  switch (type) {
    case 'maj': return base
    case 'min': return base.toLowerCase()
    case 'dim': return base.toLowerCase() + '°'
    case 'aug': return base + '+'
    case 'maj7': return base + 'maj7'
    case 'dom7': return base + '7'
    case 'min7': return base.toLowerCase() + '7'
    case 'm7b5': return base.toLowerCase() + 'ø7'
    case 'dim7': return base.toLowerCase() + '°7'
    case 'minMaj7': return base.toLowerCase() + '(maj7)'
    case 'aug7': return base + '+7'
    case 'augMaj7': return base + '+maj7'
    default: return base
  }
}

/** Chords built by stacking thirds on each degree of a 7-note scale. */
export function diatonicChords(tonic: Note | string, scale: ScaleType = 'major', sevenths = false): DiatonicChord[] {
  const notes = buildScale(tonic, scale)
  if (notes.length !== 7) throw new Error('diatonicChords needs a 7-note scale')
  const pcs = notes.map(pitchClass)
  return notes.map((root, i) => {
    const d = (k: number) => (pcs[(i + k) % 7] - pcs[i] + 12) % 12
    const type = qualityFromStack(d(2), d(4), sevenths ? d(6) : undefined)
    return { degree: i + 1, roman: romanFor(i + 1, type), root: noteName(root), type, symbol: chordSymbol(root, type) }
  })
}

export const SCALE_KEYS = Object.keys(SCALES) as ScaleType[]
