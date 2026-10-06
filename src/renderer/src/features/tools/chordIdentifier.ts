import { CHORDS, type ChordType } from '@/theory/chords'
import { SIMPLE_INTERVALS, parseInterval } from '@/theory/intervals'
import { mod } from '@/theory/notes'
import { ROOTLESS_TYPES, omittableIntervals } from './voicings'

export interface IdentifierMatch {
  rootPc: number
  type: ChordType
  bassPc: number
  bassMidi: number
  /** Missing tones, indexed into CHORDS[type].intervals. */
  omitted: number[]
  /** Lower scores prefer complete, simple chords with their root in the bass. */
  score: number
}

export interface IdentifiedInterval {
  semitones: number
  label: string
}

export interface IdentifierResult {
  kind: 'empty' | 'note' | 'interval' | 'chord' | 'unknown'
  midis: number[]
  pcs: number[]
  bassMidi: number | null
  bassPc: number | null
  matches: IdentifierMatch[]
  interval: IdentifiedInterval | null
}

const PATTERNS = (Object.keys(CHORDS) as ChordType[]).map((type, order) => {
  const def = CHORDS[type]
  const semitones = def.intervals.map((iv) => mod(parseInterval(iv).semitones, 12))
  const optional = new Set(omittableIntervals(type))
  // The library's curated seventh shells can omit altered fifths; keep those readings as weaker alternatives.
  const alteredFifth = def.intervals.findIndex((iv) => def.intervals.length >= 4 && parseInterval(iv).number === 5 && iv !== 'P5')
  const omittable = def.intervals.map((iv, i) => optional.has(iv) || i === alteredFifth || (i === 0 && ROOTLESS_TYPES.has(type)))
  return { type, order, semitones, omittable, alteredFifth }
})

function describeInterval(semitones: number): IdentifiedInterval {
  const simple = SIMPLE_INTERVALS[mod(semitones, 12)]
  const number = simple.number + 7 * Math.floor(semitones / 12)
  const iv = parseInterval(simple.short[0] + number)
  return { semitones, label: semitones === 6 ? 'tritone' : iv.long }
}

/** Pitch-only matching; tuning, capo, note spelling and finger geometry belong to the caller. */
export function identifyVoicing(input: readonly number[]): IdentifierResult {
  const midis = [...new Set(input.filter((n) => Number.isInteger(n) && n >= 0 && n <= 127))].sort((a, b) => a - b)
  const pcs = [...new Set(midis.map((n) => mod(n, 12)))].sort((a, b) => a - b)
  const bassMidi = midis[0] ?? null
  const bassPc = bassMidi === null ? null : mod(bassMidi, 12)
  const base: IdentifierResult = { kind: 'empty', midis, pcs, bassMidi, bassPc, matches: [], interval: null }
  if (bassMidi === null || bassPc === null) return base
  if (midis.length === 1) return { ...base, kind: 'note' }
  if (pcs.length <= 2) {
    const upper = pcs.length === 1 ? midis.at(-1)! : midis.find((n) => mod(n, 12) !== bassPc)!
    base.interval = describeInterval(upper - bassMidi)
    if (pcs.length === 1) return { ...base, kind: 'interval' }
  }

  const matches: (IdentifierMatch & { order: number })[] = []
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const relative = new Set(pcs.map((pc) => mod(pc - rootPc, 12)))
    for (const pattern of PATTERNS) {
      if (pcs.length === 2 && pattern.type !== 'power') continue
      if (![...relative].every((pc) => pattern.semitones.includes(pc))) continue
      const omitted = pattern.semitones.flatMap((pc, index) => relative.has(pc) ? [] : [index])
      if (omitted.some((index) => !pattern.omittable[index])) continue
      const rootMissing = !relative.has(0)
      const score = omitted.length * 30 + Number(rootMissing) * 100
        + Number(rootPc !== bassPc) * 8 + pattern.semitones.length
        + Number(omitted.includes(pattern.alteredFifth)) * 40
      matches.push({ rootPc, type: pattern.type, bassPc, bassMidi, omitted, score, order: pattern.order })
    }
  }
  matches.sort((a, b) => a.score - b.score || a.order - b.order || a.rootPc - b.rootPc)
  return {
    ...base,
    kind: matches.length ? 'chord' : pcs.length <= 2 ? 'interval' : 'unknown',
    matches: matches.map(({ order: _order, ...match }) => match)
  }
}
