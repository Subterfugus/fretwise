// Pure progression logic: Roman numerals -> chords in any key, presets, "scales that fit".
import { CHORDS, ChordType, buildChord, chordSymbol } from '@/theory/chords'
import { transpose } from '@/theory/intervals'
import { noteName, pitchClass } from '@/theory/notes'
import { SCALES, ScaleType, buildScale } from '@/theory/scales'
import { rootName } from './names'

export interface RomanChord {
  /** Interval from the tonic to the chord root, e.g. "P5" or "m7" (for bVII). */
  interval: string
  type: ChordType
}

const DEGREE_IV: Record<string, string> = { I: 'M1', II: 'M2', III: 'M3', IV: 'P4', V: 'P5', VI: 'M6', VII: 'M7' }

const DEGREE_RE = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/

/** Interval from the tonic to a (possibly altered) degree of the MAJOR scale: bVII -> m7, #IV -> A4. */
function degreeInterval(acc: string, upper: string): string {
  const base = DEGREE_IV[upper]
  const q = base[0]
  const n = base.slice(1)
  const flat = acc === 'b' || acc === '♭'
  const sharp = acc === '#' || acc === '♯'
  if (!flat && !sharp) return q === 'M' && n === '1' ? 'P1' : base
  if (n === '1' || n === '4' || n === '5') return (flat ? 'd' : 'A') + n
  return (flat ? 'm' : 'A') + n
}

/** Parse a Roman-numeral chord such as "ii7", "bVII", "V7", "Imaj7", "vii°", "iiø7", "I7", "iv", "#ivø". */
export function parseRoman(token: string): RomanChord | null {
  const m = DEGREE_RE.exec(token.trim())
  if (!m) return null
  const [, acc, numeral, rawSuffix] = m
  const upper = numeral.toUpperCase()
  const isMinor = numeral !== upper
  if (/[()]/.test(rawSuffix) && !/^\((maj7|M7)\)$/.test(rawSuffix) && !/^m\(maj7\)$/.test(rawSuffix)) return null
  const suffix = rawSuffix.replace(/°/g, 'o').replace(/ø/g, 'h').replace(/Δ/g, 'maj').replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[()]/g, '')
  let type: ChordType | null = null
  switch (suffix) {
    case '':
      type = isMinor ? 'min' : 'maj'
      break
    case '7':
      type = isMinor ? 'min7' : 'dom7'
      break
    case 'maj7':
    case 'M7':
      type = isMinor ? 'minMaj7' : 'maj7'
      break
    case 'o':
    case 'dim':
      type = 'dim'
      break
    case 'o7':
    case 'dim7':
      type = 'dim7'
      break
    case 'h':
    case 'h7':
    case 'm7b5':
    case '7b5':
      type = 'm7b5'
      break
    case '+':
      type = 'aug'
      break
    case '+7':
      type = 'aug7'
      break
    case '+maj7':
    case '+M7':
    case 'maj7#5':
      type = 'augMaj7'
      break
    case 'sus4':
      type = 'sus4'
      break
    case 'sus2':
      type = 'sus2'
      break
    case '6':
      type = isMinor ? 'min6' : 'maj6'
      break
    case '9':
      type = isMinor ? 'min9' : 'dom9'
      break
    case 'maj9':
      type = 'maj9'
      break
    case 'add9':
      type = 'add9'
      break
    case '5':
      type = 'power'
      break
    case '7sus4':
      type = 'sus7'
      break
    case '7b9':
      type = 'dom7b9'
      break
    case '7#9':
      type = 'dom7s9'
      break
    case '11':
      type = isMinor ? 'min11' : 'dom11'
      break
    case '13':
      type = 'dom13'
      break
    case 'maj7#11':
      type = 'maj7s11'
      break
    case 'm':
      type = 'min'
      break
    case 'm6':
      type = 'min6'
      break
    case 'm7':
      type = 'min7'
      break
    case 'mmaj7':
      type = 'minMaj7'
      break
    case 'm9':
      type = 'min9'
      break
    case 'm11':
      type = 'min11'
      break
    default:
      type = Object.hasOwn(CHORDS, suffix) ? suffix as ChordType : null
  }
  if (!type) return null
  return { interval: degreeInterval(acc, upper), type }
}

export interface ProgChord {
  roman: string
  root: string
  type: ChordType
  symbol: string
}

/** Resolve numerals against a tonic. Unparseable numerals are dropped. */
export function progressionChords(tonic: string, romans: string[]): ProgChord[] {
  const out: ProgChord[] = []
  for (const r of romans) {
    const p = parseRoman(r)
    if (!p) continue
    const rt = noteName(transpose(tonic, p.interval))
    out.push({ roman: r, root: rt, type: p.type, symbol: chordSymbol(rt, p.type) })
  }
  return out
}

/** Tonic spelling for a pitch class in a major/minor context. */
export const keyTonic = (pc: number, minor: boolean): string => rootName(pc, minor)

export interface Preset {
  id: string
  name: string
  romans: string[]
  /** Tonic is a minor-ish centre (affects key spelling and scale suggestions). */
  minor: boolean
  /** Scale to suggest first (mode flavour). */
  scale?: ScaleType
  note?: string
}

export const PRESETS: Preset[] = [
  { id: 'I-IV-V', name: 'I – IV – V', romans: ['I', 'IV', 'V', 'I'], minor: false, note: 'Three-chord rock, country and folk.' },
  { id: 'pop', name: 'I – V – vi – IV', romans: ['I', 'V', 'vi', 'IV'], minor: false, note: 'The pop progression.' },
  { id: '50s', name: 'I – vi – IV – V', romans: ['I', 'vi', 'IV', 'V'], minor: false, note: "'50s doo-wop." },
  { id: 'ii-V-I', name: 'ii – V – I', romans: ['ii7', 'V7', 'Imaj7', 'Imaj7'], minor: false, note: 'The basic jazz cadence.' },
  { id: 'jazz', name: 'Jazz I – vi – ii – V', romans: ['Imaj7', 'vi7', 'ii7', 'V7'], minor: false, note: 'Turnaround in sevenths.' },
  {
    id: 'blues12',
    name: '12-bar blues',
    romans: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    minor: false,
    scale: 'blues',
    note: 'One chord per bar: set beats per chord to 4.'
  },
  { id: 'minor', name: 'Minor i – iv – v', romans: ['i', 'iv', 'v', 'i'], minor: true, scale: 'naturalMinor', note: 'Natural minor.' },
  { id: 'minor-V', name: 'Minor i – iv – V', romans: ['i', 'iv', 'V7', 'i'], minor: true, scale: 'harmonicMinor', note: 'Harmonic minor flavour: the V is major.' },
  { id: 'ii-V-i', name: 'Minor ii° – V – i', romans: ['iih7', 'V7', 'i', 'i'], minor: true, scale: 'harmonicMinor', note: 'Minor jazz cadence.' },
  { id: 'andalusian', name: 'Andalusian i – ♭VII – ♭VI – V', romans: ['i', 'bVII', 'bVI', 'V'], minor: true, scale: 'phrygianDominant', note: 'Flamenco cadence.' },
  { id: 'dorian', name: 'Dorian vamp i – IV', romans: ['i7', 'IV7'], minor: true, scale: 'dorian', note: 'Santana / So What colour.' },
  { id: 'mixo', name: 'Mixolydian vamp I – ♭VII', romans: ['I', 'bVII'], minor: false, scale: 'mixolydian', note: 'Classic rock vamp.' },
  { id: 'lydian', name: 'Lydian vamp I – II', romans: ['Imaj7', 'II'], minor: false, scale: 'lydian', note: 'Floating, dreamy.' },
  { id: 'phrygian', name: 'Phrygian vamp i – ♭II', romans: ['i', 'bII'], minor: true, scale: 'phrygian', note: 'Dark, metal / flamenco.' }
]

/** Numeral chips offered when building a custom progression. */
export const NUMERAL_PALETTE: { group: string; romans: string[] }[] = [
  { group: 'Major key', romans: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio', 'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'I7', 'IV7'] },
  { group: 'Minor / modal', romans: ['i', 'iio', 'iih7', 'bIII', 'iv', 'v', 'V7', 'bVI', 'bVII', 'i7', 'iv7', 'v7', 'bII', 'II', 'bVImaj7'] },
  { group: 'Colour', romans: ['Isus4', 'Isus2', 'Iadd9', 'IV6', 'I6', 'V9', 'I9', 'vi9'] }
]

/** Pretty form of a numeral for display. */
export function prettyRoman(r: string): string {
  return r.replace(/^b/, '♭').replace(/^#/, '♯').replace(/o7$/, '°7').replace(/o$/, '°').replace(/h7?$/, 'ø7')
}

// ---------- scales that fit ----------

export interface ScaleFit {
  type: ScaleType
  root: string
  /** Fraction (0..1) of the progression's chord tones that lie inside the scale. */
  coverage: number
  allChordRoots: boolean
}

const CANDIDATES: ScaleType[] = [
  'majorPentatonic',
  'minorPentatonic',
  'major',
  'naturalMinor',
  'dorian',
  'mixolydian',
  'lydian',
  'phrygian',
  'harmonicMinor',
  'blues',
  'majorBlues',
  'melodicMinor'
]

/** Rank scales rooted on the tonic by how many of the progression's chord tones they contain. */
export function fitScales(tonic: string, chords: ProgChord[], preferred?: ScaleType): ScaleFit[] {
  const tones = chords.flatMap((c) => buildChord(c.root, c.type).map(pitchClass))
  const roots = chords.map((c) => pitchClass(c.root))
  const candidates = preferred && !CANDIDATES.includes(preferred) && Object.hasOwn(SCALES, preferred) ? [...CANDIDATES, preferred] : CANDIDATES
  const fits: ScaleFit[] = candidates.map((type) => {
    const pcs = new Set(buildScale(tonic, type).map(pitchClass))
    const inside = tones.filter((t) => pcs.has(t)).length
    return {
      type,
      root: noteName(tonic),
      coverage: tones.length ? inside / tones.length : 0,
      allChordRoots: roots.every((r) => pcs.has(r))
    }
  })
  const rank = (f: ScaleFit) => f.coverage * 100 + (f.allChordRoots ? 8 : 0) + (f.type === preferred ? 6 : 0) - SCALES[f.type].intervals.length * 0.05
  return fits.sort((a, b) => rank(b) - rank(a))
}

/** The scale for a progression that is the clean "home" choice: preset hint, else major/minor pentatonic. */
export function defaultFit(fits: ScaleFit[], minor: boolean): ScaleFit {
  const want: ScaleType = minor ? 'minorPentatonic' : 'majorPentatonic'
  return fits.find((f) => f.type === want) ?? fits[0]
}

/** Chord definition guard for UI code. */
export const isChordType = (s: string): s is ChordType => s in CHORDS
