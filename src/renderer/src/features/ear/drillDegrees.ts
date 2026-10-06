import { midiToName, noteName, pretty } from '@/theory/notes'
import { buildScale } from '@/theory/scales'
import type { DrillDef, Item, Rng, Sound } from './types'
import { enabledItems, ev, optBool, optStr, pick, randInt, rest, sound, weightedPick } from './weighting'
import { keyName, voiceChords, VoicingStyle } from './voicing'

export const DEGREES: { key: string; semis: number; label: string; solfege: string }[] = [
  { key: '1', semis: 0, label: '1', solfege: 'Do' },
  { key: 'b2', semis: 1, label: '♭2', solfege: 'Ra' },
  { key: '2', semis: 2, label: '2', solfege: 'Re' },
  { key: 'b3', semis: 3, label: '♭3', solfege: 'Me' },
  { key: '3', semis: 4, label: '3', solfege: 'Mi' },
  { key: '4', semis: 5, label: '4', solfege: 'Fa' },
  { key: '#4', semis: 6, label: '♯4', solfege: 'Fi' },
  { key: '5', semis: 7, label: '5', solfege: 'Sol' },
  { key: 'b6', semis: 8, label: '♭6', solfege: 'Le' },
  { key: '6', semis: 9, label: '6', solfege: 'La' },
  { key: 'b7', semis: 10, label: '♭7', solfege: 'Te' },
  { key: '7', semis: 11, label: '7', solfege: 'Ti' }
]
export const degreeSemis = (key: string): number => DEGREES.find((d) => d.key === key)!.semis

export const DEGREE_ITEMS: Item[] = DEGREES.map((d) => ({ key: d.key, label: d.label, sub: d.solfege }))
const DIATONIC = ['1', '2', '3', '4', '5', '6', '7']

/** I–IV–V–I cadence in the key of `tonicMidi`'s pitch class. */
export function cadenceEvents(tonicPc: number, style: VoicingStyle, rng: Rng = Math.random) {
  const chords = [
    { rootPc: tonicPc, type: 'maj' as const },
    { rootPc: (tonicPc + 5) % 12, type: 'maj' as const },
    { rootPc: (tonicPc + 7) % 12, type: 'maj' as const },
    { rootPc: tonicPc, type: 'maj' as const }
  ]
  return voiceChords(chords, style, rng).map((v, i) => ev(v, i === 3 ? 2 : 1, 'strum'))
}

export function degreeSound(tonicPc: number, note: number, style: VoicingStyle, withCadence: boolean, rng: Rng = Math.random): Sound {
  const events = withCadence ? [...cadenceEvents(tonicPc, style, rng), rest(1)] : []
  events.push(ev([note], 3))
  return sound(events, 92)
}

/**
 * Spell the answer note: ♭ degrees with flats, ♯4 with sharps, diatonic degrees by key
 * (so ♭2 in G is A♭, not G♯).
 */
export const degreeFlats = (degreeKey: string, keyName: string): boolean =>
  degreeKey.startsWith('b') ? true : degreeKey.startsWith('#') ? false : keyName.includes('b') || keyName === 'F'

/**
 * Note name (no octave) of a scale degree in a major key: diatonic degrees are spelled from the
 * key's own scale (7 in F♯ major is E♯, never F); chromatic ones use `degreeFlats`.
 */
export function degreeNoteName(degreeKey: string, keyNm: string, midi: number): string {
  const diatonic = DIATONIC.indexOf(degreeKey)
  if (diatonic >= 0) return noteName(buildScale(keyNm, 'major')[diatonic])
  return midiToName(midi, degreeFlats(degreeKey, keyNm)).replace(/-?\d+$/, '')
}

let last: string | undefined

export const degreesDrill: DrillDef = {
  id: 'degrees',
  title: 'Scale degrees',
  glyph: '①',
  blurb: 'A cadence sets the key, then one note plays. Name its scale degree: functional ear training.',
  itemsLabel: 'Scale degrees',
  items: DEGREE_ITEMS,
  presets: [
    { id: 'beginner', label: 'Beginner (1 3 5)', items: ['1', '3', '5'] },
    { id: 'intermediate', label: 'Diatonic 1–7', items: DIATONIC },
    { id: 'advanced', label: 'Chromatic', items: DEGREES.map((d) => d.key) }
  ],
  options: [
    { kind: 'toggle', id: 'cadence', label: 'Play the I–IV–V–I cadence before every note' },
    { kind: 'toggle', id: 'wide', label: 'Wide range (note may be an octave above or below)' },
    {
      kind: 'select',
      id: 'voicing',
      label: 'Cadence voicing',
      choices: [
        { value: 'guitar', label: 'Guitar shapes' },
        { value: 'close', label: 'Close position' }
      ]
    }
  ],
  defaults: { items: DIATONIC, weak: false, opts: { cadence: true, wide: false, voicing: 'guitar' } },
  input: 'choice',
  minItems: 2,
  generate(s, stats, rng = Math.random) {
    const keys = enabledItems(s, DEGREE_ITEMS, 2)
    const key = weightedPick(keys, stats, s.weak, rng, last)
    last = key
    const tonicPc = randInt(0, 11, rng)
    const tonicMidi = 48 + tonicPc // C3..B3
    let note = tonicMidi + degreeSemis(key)
    if (optBool(s, 'wide', false)) {
      const shift = pick([-12, 0, 12], rng)
      if (note + shift >= 40 && note + shift <= 79) note += shift
    }
    const style = optStr(s, 'voicing', 'guitar') as VoicingStyle
    const withCad = optBool(s, 'cadence', true)
    const tName = keyName(tonicPc)
    return {
      prompt: 'Which scale degree is the last note?',
      sound: degreeSound(tonicPc, note, style, withCad, rng),
      reference: { label: 'Cadence', sound: degreeSound(tonicPc, tonicMidi, style, true, rng) },
      parts: [{ itemKey: key, answer: key, choices: keys.map((k) => ({ key: k, label: DEGREES.find((d) => d.key === k)!.label, sub: DEGREES.find((d) => d.key === k)!.solfege })) }],
      choiceSound: (k) => sound([ev([tonicMidi], 1), ev([tonicMidi + degreeSemis(k) + (note - tonicMidi - degreeSemis(key))], 2)], 80),
      reveal: `Key of ${pretty(tName)} major: ${pretty(degreeNoteName(key, tName, note))} is degree ${DEGREES.find((d) => d.key === key)!.label} (${DEGREES.find((d) => d.key === key)!.solfege}).`
    }
  }
}
