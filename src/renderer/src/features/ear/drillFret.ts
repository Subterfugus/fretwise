// Fretboard-answer drills: melodic dictation and note finder.
import { FretPos, STANDARD_TUNING, STRING_NAMES, midiAt } from '@/theory/guitar'
import { midiToName, mod, noteName, pitchClass, pretty } from '@/theory/notes'
import { buildScale } from '@/theory/scales'
import type { DrillDef, Item, Rng, Stats } from './types'
import { enabledItems, ev, optBool, optList, optNum, optStr, pick, randInt, rest, sound, weightedPick } from './weighting'
import { keyName } from './voicing'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MAX_FRET = 12
const LOWEST = 40 // E2
const HIGHEST = 76 // E5 (string 1, fret 12)

/** MIDI of an (unbounded) scale-degree index above a tonic in a major key. */
export const degreeMidi = (tonic: number, d: number): number => tonic + 12 * Math.floor(d / 7) + MAJOR[mod(d, 7)]

/** All positions (frets 0..maxFret) that play an exact MIDI pitch. */
export function positionsForMidi(m: number, maxFret = MAX_FRET): FretPos[] {
  const out: FretPos[] = []
  for (let s = 1; s <= 6; s++) {
    const f = m - STANDARD_TUNING[s - 1]
    if (f >= 0 && f <= maxFret) out.push({ string: s, fret: f })
  }
  return out
}

/** Position for a pitch closest to `near` (fret distance first, then string distance). */
export function nearestPosition(m: number, near?: FretPos): FretPos {
  const ps = positionsForMidi(m)
  if (!ps.length) throw new Error(`No position for MIDI ${m}`)
  if (!near) return ps[0]
  return [...ps].sort((a, b) => Math.abs(a.fret - near.fret) * 2 + Math.abs(a.string - near.string) - (Math.abs(b.fret - near.fret) * 2 + Math.abs(b.string - near.string)))[0]
}

// ---------- Melodic dictation ----------

/** Melodic motion items, in scale steps. */
export const MOTIONS: { key: string; steps: number; label: string }[] = [
  { key: 'repeat', steps: 0, label: 'Repeat' },
  { key: '2up', steps: 1, label: 'Step up' },
  { key: '2down', steps: -1, label: 'Step down' },
  { key: '3up', steps: 2, label: '3rd up' },
  { key: '3down', steps: -2, label: '3rd down' },
  { key: '4up', steps: 3, label: '4th up' },
  { key: '4down', steps: -3, label: '4th down' },
  { key: '5up', steps: 4, label: '5th up' },
  { key: '5down', steps: -4, label: '5th down' }
]
export const MOTION_ITEMS: Item[] = MOTIONS.map((m) => ({ key: m.key, label: m.label }))

export interface Melody {
  tonic: number
  midis: number[]
  motions: string[]
}

/** Diatonic melody of `length` notes starting on degree 1, 3 or 5, built from allowed motions. */
export function makeMelody(allowed: string[], length: number, stats: Stats, weak: boolean, rng: Rng = Math.random): Melody {
  const tonic = randInt(45, 57, rng) // A2..A3
  let d = pick([0, 2, 4], rng)
  const start = degreeMidi(tonic, d)
  const midis = [start]
  const motions: string[] = []
  for (let i = 1; i < length; i++) {
    const ok = MOTIONS.filter((m) => {
      if (!allowed.includes(m.key)) return false
      const n = degreeMidi(tonic, d + m.steps)
      return n >= LOWEST && n <= HIGHEST && Math.abs(n - start) <= 12
    })
    const chosen = ok.length ? weightedPick(ok.map((o) => o.key), stats, weak, rng) : 'repeat'
    const mv = MOTIONS.find((m) => m.key === chosen)!
    d += mv.steps
    midis.push(degreeMidi(tonic, d))
    motions.push(mv.key)
  }
  return { tonic, midis, motions }
}

export const melodySoundOf = (midis: number[], bpm: number) => sound(midis.map((m, i) => ev([m], i === midis.length - 1 ? 2 : 1)), bpm)

export const melodyDrill: DrillDef = {
  id: 'melody',
  title: 'Melodic dictation',
  glyph: '♬',
  blurb: 'A short melody plays from a reference note shown on the neck. Find the rest of the notes on the fretboard.',
  itemsLabel: 'Melodic motion',
  items: MOTION_ITEMS,
  presets: [
    { id: 'beginner', label: 'Steps', items: ['repeat', '2up', '2down'] },
    { id: 'intermediate', label: 'Steps + 3rds', items: ['repeat', '2up', '2down', '3up', '3down'] },
    { id: 'advanced', label: 'Leaps to 5ths', items: MOTIONS.map((m) => m.key) }
  ],
  options: [
    {
      kind: 'select',
      id: 'length',
      label: 'Notes',
      choices: [
        { value: '3', label: '3 notes' },
        { value: '4', label: '4 notes' },
        { value: '5', label: '5 notes' },
        { value: 'mix', label: '3–5 (random)' }
      ]
    },
    { kind: 'range', id: 'bpm', label: 'Tempo', min: 50, max: 160, step: 5, suffix: ' bpm' }
  ],
  defaults: { items: ['repeat', '2up', '2down', '3up', '3down'], weak: false, opts: { length: '3', bpm: 84 } },
  input: 'fret',
  minItems: 1,
  generate(s, stats, rng = Math.random) {
    const len = optStr(s, 'length', '3')
    const n = len === 'mix' ? randInt(3, 5, rng) : Math.max(2, Math.min(8, Number(len) || 3))
    const allowed = enabledItems(s, MOTION_ITEMS, 1)
    const mel = makeMelody(allowed, n, stats, s.weak, rng)
    const bpm = optNum(s, 'bpm', 84)
    const startOptions = positionsForMidi(mel.midis[0]).filter((p) => p.string >= 2 && p.string <= 5)
    const start = startOptions.length ? pick(startOptions, rng) : nearestPosition(mel.midis[0])
    const targetPositions: FretPos[] = []
    let prev = start
    for (const m of mel.midis.slice(1)) {
      prev = nearestPosition(m, prev)
      targetPositions.push(prev)
    }
    // spell every (diatonic) note from the key's own scale, e.g. E♯ not F in F♯ major
    const spell = new Map(buildScale(keyName(mel.tonic), 'major').map((n) => [pitchClass(n), noteName(n)]))
    const nameOf = (m: number) => spell.get(mod(m, 12)) ?? midiToName(m).replace(/-?\d+$/, '')
    return {
      prompt: `Click the next ${n - 1} notes in order on the fretboard`,
      sound: melodySoundOf(mel.midis, bpm),
      reference: { label: 'Start note', sound: sound([ev([mel.midis[0]], 2)], 60) },
      reveal: `Key of ${pretty(keyName(mel.tonic))} major: ${mel.midis.map((m) => pretty(nameOf(m))).join(' → ')}.`,
      keyContext: keyName(mel.tonic),
      fret: { start, targets: mel.midis.slice(1), targetPositions, itemKeys: mel.motions, frets: [0, MAX_FRET] }
    }
  }
}

// ---------- Note finder ----------

export const FRET_ITEMS: Item[] = Array.from({ length: MAX_FRET + 1 }, (_, f) => ({ key: `f${f}`, label: f === 0 ? 'Open' : `Fret ${f}` }))
const fretsUpTo = (n: number) => FRET_ITEMS.slice(0, n + 1).map((i) => i.key)
export const STRING_CHOICES = [6, 5, 4, 3, 2, 1].map((s) => ({ value: String(s), label: `${s} (${STRING_NAMES[s - 1]}${s === 6 ? ' low' : s === 1 ? ' high' : ''})` }))

export interface FinderQ {
  pos: FretPos
  midi: number
  key: string
}

export function pickFinder(strings: number[], frets: string[], stats: Stats, weak: boolean, rng: Rng = Math.random, avoid?: string): FinderQ {
  const key = weightedPick(frets, stats, weak, rng, avoid)
  const pos = { string: pick(strings, rng), fret: Number(key.slice(1)) }
  return { pos, midi: midiAt(pos), key }
}

let lastFret: string | undefined

export const noteFinderDrill: DrillDef = {
  id: 'notefinder',
  title: 'Note finder',
  glyph: '⌖',
  blurb: 'A note plays on a named string. Click the fret it was played at, linking your ear to the neck.',
  itemsLabel: 'Frets',
  items: FRET_ITEMS,
  presets: [
    { id: 'beginner', label: 'Frets 0–5', items: fretsUpTo(5) },
    { id: 'intermediate', label: 'Frets 0–7', items: fretsUpTo(7) },
    { id: 'advanced', label: 'Frets 0–12', items: fretsUpTo(12) }
  ],
  options: [
    { kind: 'multi', id: 'strings', label: 'Strings', choices: STRING_CHOICES },
    { kind: 'toggle', id: 'open', label: 'Play the open string first as a reference' }
  ],
  defaults: { items: fretsUpTo(5), weak: false, opts: { strings: ['6', '5', '4', '3', '2', '1'], open: true } },
  input: 'fret',
  minItems: 1,
  generate(s, stats, rng = Math.random) {
    const strings = optList(s, 'strings', ['6', '5', '4', '3', '2', '1']).map(Number).filter((x) => x >= 1 && x <= 6)
    const q = pickFinder(strings.length ? strings : [1, 2, 3, 4, 5, 6], enabledItems(s, FRET_ITEMS, 1), stats, s.weak, rng, lastFret)
    lastFret = q.key
    const open = STANDARD_TUNING[q.pos.string - 1]
    const withOpen = optBool(s, 'open', true)
    return {
      prompt: `Which fret on string ${q.pos.string} (${STRING_NAMES[q.pos.string - 1]})?`,
      sound: sound(withOpen ? [ev([open], 1), rest(0.5), ev([q.midi], 2)] : [ev([q.midi], 2)], 70),
      reference: { label: 'Open string', sound: sound([ev([open], 2)], 60) },
      reveal: `String ${q.pos.string}, ${q.pos.fret === 0 ? 'open' : 'fret ' + q.pos.fret} = ${pretty(midiToName(q.midi))}.`,
      displayReveal: ({ spellMidi }) => `String ${q.pos.string}, ${q.pos.fret === 0 ? 'open' : 'fret ' + q.pos.fret} = ${spellMidi(q.midi)}.`,
      fret: { string: q.pos.string, targets: [q.midi], targetPositions: [q.pos], itemKeys: [q.key], frets: [0, MAX_FRET] }
    }
  }
}
