import { SCALES, ScaleType, scaleSemitones, stepPattern } from '@/theory/scales'
import type { DrillDef, Item, Sound } from './types'
import { enabledItems, ev, optNum, optStr, randInt, sound, weightedPick } from './weighting'
import { pcLabel } from './voicing'

const LABELS: [ScaleType, string][] = [
  ['major', 'Major (Ionian)'],
  ['naturalMinor', 'Natural minor (Aeolian)'],
  ['harmonicMinor', 'Harmonic minor'],
  ['melodicMinor', 'Melodic minor'],
  ['majorPentatonic', 'Major pentatonic'],
  ['minorPentatonic', 'Minor pentatonic'],
  ['blues', 'Blues'],
  ['dorian', 'Dorian'],
  ['phrygian', 'Phrygian'],
  ['lydian', 'Lydian'],
  ['mixolydian', 'Mixolydian'],
  ['locrian', 'Locrian']
]

export const SCALE_ITEMS: Item[] = LABELS.map(([k, label]) => ({ key: k, label, sub: SCALES[k].feel }))

/** MIDI notes of a scale from root up to the octave (optionally back down). */
export function scaleMidis(root: number, type: ScaleType, andBack = false): number[] {
  const up = [...scaleSemitones(type).map((s) => root + s), root + 12]
  return andBack ? [...up, ...up.slice(0, -1).reverse()] : up
}

export function scaleSound(notes: number[], bpm: number): Sound {
  return sound(
    notes.map((n, i) => ev([n], i === notes.length - 1 ? 2 : 1)),
    bpm
  )
}

let last: string | undefined

export const scalesDrill: DrillDef = {
  id: 'scales',
  title: 'Scales & modes',
  glyph: '♪',
  blurb: 'Major, minor, pentatonic, blues and the seven modes. Learn each one by its characteristic colour.',
  itemsLabel: 'Scales',
  items: SCALE_ITEMS,
  presets: [
    { id: 'beginner', label: 'Beginner', items: ['major', 'naturalMinor', 'majorPentatonic', 'minorPentatonic'] },
    { id: 'intermediate', label: 'Intermediate', items: ['major', 'naturalMinor', 'harmonicMinor', 'melodicMinor', 'majorPentatonic', 'minorPentatonic', 'blues'] },
    { id: 'modes', label: 'The 7 modes', items: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'naturalMinor', 'locrian'] },
    { id: 'advanced', label: 'Everything', items: LABELS.map(([k]) => k) }
  ],
  options: [
    {
      kind: 'select',
      id: 'dir',
      label: 'Direction',
      choices: [
        { value: 'up', label: 'Ascending' },
        { value: 'upDown', label: 'Ascending + descending' }
      ]
    },
    { kind: 'range', id: 'bpm', label: 'Tempo', min: 60, max: 240, step: 10, suffix: ' bpm' }
  ],
  defaults: { items: ['major', 'naturalMinor', 'majorPentatonic', 'minorPentatonic'], weak: false, opts: { dir: 'up', bpm: 150 } },
  input: 'choice',
  minItems: 2,
  generate(s, stats, rng = Math.random) {
    const keys = enabledItems(s, SCALE_ITEMS, 2)
    const type = weightedPick(keys, stats, s.weak, rng, last) as ScaleType
    last = type
    const root = randInt(45, 57, rng)
    const back = optStr(s, 'dir', 'up') === 'upDown'
    const bpm = optNum(s, 'bpm', 150)
    const choices = keys.map((k) => {
      const it = SCALE_ITEMS.find((i) => i.key === k)!
      return { key: k, label: it.label }
    })
    return {
      prompt: 'Which scale or mode is this?',
      sound: scaleSound(scaleMidis(root, type, back), bpm),
      reference: { label: 'Tonic', sound: sound([ev([root], 2)], 60) },
      parts: [{ itemKey: type, answer: type, choices }],
      choiceSound: (k) => scaleSound(scaleMidis(root, k as ScaleType, back), bpm),
      reveal: `${pcLabel(root % 12, [1, 3, 8, 10].includes(root % 12))} ${SCALE_ITEMS.find((i) => i.key === type)!.label}: ${stepPattern(type)} — ${SCALES[type].feel}.`,
      displayReveal: ({ spellPc }) => `${spellPc(root % 12, { key: pcLabel(root % 12, [1, 3, 8, 10].includes(root % 12)) })} ${SCALE_ITEMS.find((i) => i.key === type)!.label}: ${stepPattern(type)} — ${SCALES[type].feel}.`
    }
  }
}
