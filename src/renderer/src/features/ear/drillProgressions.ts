import { diatonicChords, DiatonicChord } from '@/theory/chords'
import { pitchClass, pretty } from '@/theory/notes'
import type { DrillDef, Item, Rng, Sound, Stats } from './types'
import { enabledItems, ev, optBool, optList, optNum, optStr, randInt, rest, sound, weightedPick } from './weighting'
import { keyName, voiceChords, VoicingStyle } from './voicing'

export interface ProgressionDef {
  id: string
  numerals: string[]
  note: string
}

export const PROGRESSIONS: ProgressionDef[] = [
  { id: 'I-IV-V-I', numerals: ['I', 'IV', 'V', 'I'], note: 'the classic cadence, folk and blues' },
  { id: 'I-V-vi-IV', numerals: ['I', 'V', 'vi', 'IV'], note: 'the "four chord" pop progression' },
  { id: 'I-IV-I-V', numerals: ['I', 'IV', 'I', 'V'], note: 'rock & roll / country back-and-forth' },
  { id: 'ii-V-I', numerals: ['ii', 'V', 'I'], note: 'the jazz cadence' },
  { id: 'I-vi-IV-V', numerals: ['I', 'vi', 'IV', 'V'], note: '50s doo-wop' },
  { id: 'vi-IV-I-V', numerals: ['vi', 'IV', 'I', 'V'], note: 'the pop progression starting on the minor' },
  { id: 'I-IV-vi-V', numerals: ['I', 'IV', 'vi', 'V'], note: 'anthemic pop/rock' },
  { id: 'I-V-IV-I', numerals: ['I', 'V', 'IV', 'I'], note: 'rock turnaround (V falls to IV)' },
  { id: 'I-vi-ii-V', numerals: ['I', 'vi', 'ii', 'V'], note: 'the jazz turnaround / rhythm changes' },
  { id: 'I-iii-IV-V', numerals: ['I', 'iii', 'IV', 'V'], note: 'stepwise climb to V' },
  { id: 'IV-V-iii-vi', numerals: ['IV', 'V', 'iii', 'vi'], note: 'the "royal road" (J-pop)' },
  { id: 'I-ii-IV-V', numerals: ['I', 'ii', 'IV', 'V'], note: 'gentle rising pre-chorus' }
]

export const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi']
const DEGREE: Record<string, number> = { I: 1, ii: 2, iii: 3, IV: 4, V: 5, vi: 6, 'vii°': 7 }

const progLabel = (p: ProgressionDef) => p.numerals.join('–')

export const PROGRESSION_ITEMS: Item[] = PROGRESSIONS.map((p) => ({ key: p.id, label: progLabel(p), sub: p.note }))
export const NUMERAL_ITEMS: Item[] = NUMERALS.map((n) => ({ key: n, label: n }))

/** The diatonic chords for Roman numerals in a major key. */
export function progressionChords(tonic: string, numerals: string[]): DiatonicChord[] {
  const dia = diatonicChords(tonic, 'major')
  return numerals.map((n) => {
    const d = DEGREE[n]
    if (!d) throw new Error(`Unknown numeral ${n}`)
    return dia[d - 1]
  })
}

/** Sound for a progression; optionally preceded by the I chord as a reference. */
export function progressionSound(tonic: string, numerals: string[], style: VoicingStyle, bpm: number, refFirst: boolean, rng: Rng = Math.random): Sound {
  const all = refFirst ? ['I', ...numerals] : numerals
  const chords = progressionChords(tonic, all).map((c) => ({ rootPc: pitchClass(c.root), type: c.type }))
  const voiced = voiceChords(chords, style, rng)
  const events = voiced.map((v) => ev(v, 2, 'strum'))
  if (refFirst) events.splice(1, 0, rest(2))
  events[events.length - 1] = { ...events[events.length - 1], beats: 4 }
  return sound(events, bpm)
}

/** Random 4-chord sequence for Roman-numeral mode, weighted toward weak numerals, no immediate repeats. */
export function randomNumerals(allowed: string[], stats: Stats, weak: boolean, rng: Rng = Math.random, n = 4): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const pool = allowed.length > 1 ? allowed.filter((x) => x !== out[i - 1]) : allowed
    out.push(weightedPick(pool, stats, weak, rng))
  }
  return out
}

let last: string | undefined

export const progressionsDrill: DrillDef = {
  id: 'progressions',
  title: 'Chord progressions',
  glyph: '↻',
  blurb: 'Hear a progression in a random major key (I chord first as reference) and name it, or name every chord by numeral.',
  itemsLabel: 'Progressions (multiple-choice mode)',
  items: PROGRESSION_ITEMS,
  extraItems: NUMERAL_ITEMS,
  presets: [
    { id: 'beginner', label: 'Beginner', items: ['I-IV-V-I', 'I-V-vi-IV', 'I-IV-I-V', 'ii-V-I'] },
    { id: 'intermediate', label: 'Intermediate', items: ['I-IV-V-I', 'I-V-vi-IV', 'I-IV-I-V', 'ii-V-I', 'I-vi-IV-V', 'vi-IV-I-V', 'I-IV-vi-V', 'I-V-IV-I'] },
    { id: 'advanced', label: 'Everything', items: PROGRESSIONS.map((p) => p.id) }
  ],
  options: [
    {
      kind: 'select',
      id: 'mode',
      label: 'Mode',
      choices: [
        { value: 'whole', label: 'Name the progression' },
        { value: 'roman', label: 'Advanced: name each chord' }
      ]
    },
    {
      kind: 'multi',
      id: 'numerals',
      label: 'Numerals (name-each-chord mode)',
      choices: NUMERALS.map((n) => ({ value: n, label: n })),
      min: 2
    },
    { kind: 'toggle', id: 'ref', label: 'Play the I chord first as a reference' },
    {
      kind: 'select',
      id: 'voicing',
      label: 'Voicing',
      choices: [
        { value: 'guitar', label: 'Guitar shapes' },
        { value: 'close', label: 'Close position' }
      ]
    },
    { kind: 'range', id: 'bpm', label: 'Tempo', min: 50, max: 160, step: 5, suffix: ' bpm' }
  ],
  defaults: {
    items: ['I-IV-V-I', 'I-V-vi-IV', 'I-IV-I-V', 'ii-V-I'],
    weak: false,
    opts: { mode: 'whole', numerals: NUMERALS, ref: true, voicing: 'guitar', bpm: 90 }
  },
  input: 'choice',
  minItems: 2,
  generate(s, stats, rng = Math.random) {
    const tonic = keyName(randInt(0, 11, rng))
    const style = optStr(s, 'voicing', 'guitar') as VoicingStyle
    const bpm = optNum(s, 'bpm', 90)
    const ref = optBool(s, 'ref', true)
    const refSound = progressionSound(tonic, ['I'], style, bpm, false, rng)
    const keyLabel = `Key of ${pretty(tonic)} major`

    if (optStr(s, 'mode', 'whole') === 'roman') {
      const allowed = optList(s, 'numerals', NUMERALS).filter((n) => NUMERALS.includes(n))
      const pool = allowed.length >= 2 ? allowed : NUMERALS
      const nums = randomNumerals(pool, stats, s.weak, rng)
      const chords = progressionChords(tonic, nums)
      const choices = NUMERALS.filter((n) => pool.includes(n)).map((n) => ({ key: n, label: n }))
      return {
        prompt: 'Name each chord by its Roman numeral',
        sound: progressionSound(tonic, nums, style, bpm, ref, rng),
        reference: { label: 'I chord', sound: refSound },
        parts: nums.map((n, i) => ({ itemKey: n, answer: n, choices, prompt: `Chord ${i + 1}` })),
        choiceSound: (k) => progressionSound(tonic, [k], style, bpm, false, rng),
        reveal: `${keyLabel}: ${nums.join(' – ')} = ${chords.map((c) => pretty(c.symbol)).join(' – ')}.`
      }
    }

    const keys = enabledItems(s, PROGRESSION_ITEMS, 2)
    const id = weightedPick(keys, stats, s.weak, rng, last)
    last = id
    const prog = PROGRESSIONS.find((p) => p.id === id)!
    const chords = progressionChords(tonic, prog.numerals)
    return {
      prompt: 'Which progression is this?',
      sound: progressionSound(tonic, prog.numerals, style, bpm, ref, rng),
      reference: { label: 'I chord', sound: refSound },
      parts: [
        {
          itemKey: id,
          answer: id,
          choices: keys.map((k) => {
            const p = PROGRESSIONS.find((x) => x.id === k)!
            return { key: k, label: progLabel(p) }
          })
        }
      ],
      choiceSound: (k) => progressionSound(tonic, PROGRESSIONS.find((p) => p.id === k)!.numerals, style, bpm, ref, rng),
      reveal: `${keyLabel}: ${chords.map((c) => pretty(c.symbol)).join(' – ')} — ${prog.note}.`
    }
  }
}
