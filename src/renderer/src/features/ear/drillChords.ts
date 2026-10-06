import type { ChordType } from '@/theory/chords'
import { CHORDS } from '@/theory/chords'
import type { PlayMode } from '@/audio/engine'
import type { DrillDef, Item, Sound } from './types'
import { enabledItems, ev, optStr, randInt, sound, weightedPick } from './weighting'
import { chordVoicing, pcLabel, VoicingStyle } from './voicing'

const TRIADS: ChordType[] = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4']
const SEVENTHS: ChordType[] = ['maj7', 'dom7', 'min7', 'm7b5', 'dim7']

const LABEL: Partial<Record<ChordType, [string, string]>> = {
  maj: ['Major', '1 3 5'],
  min: ['Minor', '1 ♭3 5'],
  dim: ['Diminished', '1 ♭3 ♭5'],
  aug: ['Augmented', '1 3 ♯5'],
  sus2: ['Sus2', '1 2 5'],
  sus4: ['Sus4', '1 4 5'],
  maj7: ['Major 7', '1 3 5 7'],
  dom7: ['Dominant 7', '1 3 5 ♭7'],
  min7: ['Minor 7', '1 ♭3 5 ♭7'],
  m7b5: ['Half-dim (m7♭5)', '1 ♭3 ♭5 ♭7'],
  dim7: ['Diminished 7', '1 ♭3 ♭5 𝄫7']
}

export const CHORD_ITEMS: Item[] = [...TRIADS, ...SEVENTHS].map((t) => ({ key: t, label: LABEL[t]![0], sub: LABEL[t]![1] }))

export function chordSound(notes: number[], mode: PlayMode): Sound {
  return sound([ev(notes, 3, mode)], mode === 'arpeggio' ? 60 : 70)
}

let last: string | undefined

export const chordsDrill: DrillDef = {
  id: 'chords',
  title: 'Chord quality',
  glyph: '♫',
  blurb: 'Major, minor, diminished, sus and seventh chords, strummed as real guitar shapes on a random root.',
  itemsLabel: 'Chord qualities',
  items: CHORD_ITEMS,
  presets: [
    { id: 'beginner', label: 'Beginner', items: ['maj', 'min'] },
    { id: 'intermediate', label: 'Triads', items: TRIADS },
    { id: 'sevenths', label: 'Sevenths', items: SEVENTHS },
    { id: 'advanced', label: 'Everything', items: [...TRIADS, ...SEVENTHS] }
  ],
  options: [
    {
      kind: 'select',
      id: 'mode',
      label: 'Playback',
      choices: [
        { value: 'strum', label: 'Strummed' },
        { value: 'arpeggio', label: 'Arpeggiated' },
        { value: 'block', label: 'Block (together)' }
      ]
    },
    {
      kind: 'select',
      id: 'voicing',
      label: 'Voicing',
      choices: [
        { value: 'guitar', label: 'Guitar shapes' },
        { value: 'close', label: 'Close position' }
      ]
    }
  ],
  defaults: { items: ['maj', 'min', 'dim', 'aug'], weak: false, opts: { mode: 'strum', voicing: 'guitar' } },
  input: 'choice',
  minItems: 2,
  generate(s, stats, rng = Math.random) {
    const keys = enabledItems(s, CHORD_ITEMS, 2)
    const type = weightedPick(keys, stats, s.weak, rng, last) as ChordType
    last = type
    const rootPc = randInt(0, 11, rng)
    const style = optStr(s, 'voicing', 'guitar') as VoicingStyle
    const mode = optStr(s, 'mode', 'strum') as PlayMode
    const notes = chordVoicing(rootPc, type, style, rng)
    const bass = Math.min(...notes.filter((n) => n % 12 === rootPc))
    const choices = keys.map((k) => ({ key: k, label: LABEL[k as ChordType]![0], sub: LABEL[k as ChordType]![1] }))
    return {
      prompt: 'What quality is this chord?',
      sound: chordSound(notes, mode),
      reference: { label: 'Root note', sound: sound([ev([bass], 2)], 60) },
      parts: [{ itemKey: type, answer: type, choices }],
      choiceSound: (k) => chordSound(chordVoicing(rootPc, k as ChordType, style, rng, notes.reduce((a, b) => a + b, 0) / notes.length), mode),
      reveal: `${pcLabel(rootPc, [1, 3, 8, 10].includes(rootPc))}${CHORDS[type].symbol} — ${CHORDS[type].name} (${CHORDS[type].formula}).`,
      displayReveal: ({ spellPc }) => `${spellPc(rootPc, { key: pcLabel(rootPc, [1, 3, 8, 10].includes(rootPc)) })}${CHORDS[type].symbol} — ${CHORDS[type].name} (${CHORDS[type].formula}).`
    }
  }
}
