import { parseInterval } from '@/theory/intervals'
import { midiToName } from '@/theory/notes'
import type { DrillDef, DrillSettings, Item, Rng, Sound, Stats } from './types'
import { enabledItems, ev, optBool, optList, pick, randInt, sound, weightedPick } from './weighting'

export type IntervalDir = 'ascending' | 'descending' | 'harmonic'
const DIRS: IntervalDir[] = ['ascending', 'descending', 'harmonic']

/** Playable range for answer playback (E2..E6). */
const LOW = 40
const HIGH = 88

const SIMPLE = ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']
const COMPOUND = ['m9', 'M9', 'm10', 'M10']

const LONG: Record<string, string> = {
  m2: 'Minor 2nd', M2: 'Major 2nd', m3: 'Minor 3rd', M3: 'Major 3rd', P4: 'Perfect 4th', A4: 'Tritone',
  P5: 'Perfect 5th', m6: 'Minor 6th', M6: 'Major 6th', m7: 'Minor 7th', M7: 'Major 7th', P8: 'Octave',
  m9: 'Minor 9th', M9: 'Major 9th', m10: 'Minor 10th', M10: 'Major 10th'
}

export const INTERVAL_ITEMS: Item[] = [...SIMPLE, ...COMPOUND].map((k) => ({
  key: k,
  label: k === 'A4' ? 'TT' : k,
  sub: LONG[k]
}))

export const intervalSemitones = (key: string): number => parseInterval(key).semitones

/** Song references (song titles only), ascending / descending. */
export const SONG_HINTS: Record<string, { up: string; down: string; harmonic: string }> = {
  m2: { up: 'Jaws theme', down: 'Für Elise (opening)', harmonic: 'very tense, grinding' },
  M2: { up: 'Happy Birthday', down: 'Mary Had a Little Lamb', harmonic: 'mild rub, open' },
  m3: { up: 'Greensleeves / Smoke on the Water', down: 'Hey Jude (opening)', harmonic: 'sweet, sad' },
  M3: { up: 'When the Saints Go Marching In', down: 'Swing Low, Sweet Chariot', harmonic: 'bright, happy' },
  P4: { up: 'Here Comes the Bride', down: 'O Come, All Ye Faithful', harmonic: 'hollow, wants to resolve' },
  A4: { up: 'The Simpsons theme / Maria', down: 'Black Sabbath (riff)', harmonic: 'unstable, eerie' },
  P5: { up: 'Star Wars main theme', down: 'The Flintstones', harmonic: 'open, power chord' },
  m6: { up: 'The Entertainer', down: 'Love Story theme', harmonic: 'bittersweet' },
  M6: { up: 'My Bonnie Lies Over the Ocean', down: 'Nobody Knows the Trouble I’ve Seen', harmonic: 'warm, sweet' },
  m7: { up: 'Star Trek (original theme)', down: 'An American in Paris', harmonic: 'bluesy, dominant 7th' },
  M7: { up: 'Take On Me (chorus)', down: 'I Love You (Cole Porter)', harmonic: 'jazzy, sharp tension' },
  P8: { up: 'Somewhere Over the Rainbow', down: 'Willow Weep for Me', harmonic: 'same note, doubled' },
  m9: { up: 'an octave plus a minor 2nd', down: 'an octave plus a minor 2nd', harmonic: 'very dissonant, spread out' },
  M9: { up: 'an octave plus a major 2nd', down: 'an octave plus a major 2nd', harmonic: 'lush, open add9 colour' },
  m10: { up: 'an octave plus a minor 3rd', down: 'an octave plus a minor 3rd', harmonic: 'spread-out minor' },
  M10: { up: 'an octave plus a major 3rd', down: 'an octave plus a major 3rd', harmonic: 'spread-out major, very sweet' }
}

/** Sound for an interval from a root, in the given direction (root is always the lower note). */
export function intervalSound(root: number, semis: number, dir: IntervalDir): Sound {
  const top = root + semis
  if (dir === 'harmonic') return sound([ev([root, top], 3, 'block')], 70)
  const [a, b] = dir === 'ascending' ? [root, top] : [top, root]
  return sound([ev([a], 1), ev([b], 2)], 72)
}

/**
 * "Hear what you picked": the chosen interval from the same first note when possible
 * (bottom note for ascending/harmonic, top note for descending), moved by octaves if
 * that would leave the playable range (e.g. a M10 below a high m2).
 */
export function choiceIntervalSound(q: IntervalQ, key: string): Sound {
  const semis = intervalSemitones(key)
  let lo = q.dir === 'descending' ? q.top - semis : q.root
  while (lo < LOW) lo += 12
  while (lo + semis > HIGH && lo - 12 >= LOW) lo -= 12
  return intervalSound(lo, semis, q.dir)
}

export interface IntervalQ {
  key: string
  root: number
  top: number
  dir: IntervalDir
}

/** Pure core: choose interval, root and direction. Notes stay within G2..G5. */
export function pickInterval(s: DrillSettings, stats: Stats, rng: Rng = Math.random, avoid?: string): IntervalQ {
  const keys = enabledItems(s, INTERVAL_ITEMS, 2)
  const key = weightedPick(keys, stats, s.weak, rng, avoid)
  const semis = intervalSemitones(key)
  const valid = optList(s, 'dirs', ['ascending']).filter((d): d is IntervalDir => (DIRS as string[]).includes(d))
  const dir = pick(valid.length ? valid : (['ascending'] as IntervalDir[]), rng)
  const root = randInt(43, 79 - semis, rng)
  return { key, root, top: root + semis, dir }
}

let last: string | undefined

export const intervalsDrill: DrillDef = {
  id: 'intervals',
  title: 'Intervals',
  glyph: '↕',
  blurb: 'Hear two notes and name the distance between them: ascending, descending or together.',
  itemsLabel: 'Intervals',
  items: INTERVAL_ITEMS,
  presets: [
    { id: 'beginner', label: 'Beginner', items: ['m3', 'M3', 'P4', 'P5', 'P8'] },
    { id: 'intermediate', label: 'Intermediate', items: SIMPLE },
    { id: 'advanced', label: 'Advanced', items: [...SIMPLE, ...COMPOUND] }
  ],
  options: [
    {
      kind: 'multi',
      id: 'dirs',
      label: 'Direction',
      choices: [
        { value: 'ascending', label: 'Ascending' },
        { value: 'descending', label: 'Descending' },
        { value: 'harmonic', label: 'Harmonic' }
      ]
    },
    { kind: 'toggle', id: 'hints', label: 'Show song-reference hints', help: 'A well-known tune that starts with the interval appears after answering (and on demand before).' }
  ],
  defaults: { items: ['m3', 'M3', 'P4', 'P5', 'P8'], weak: false, opts: { dirs: ['ascending'], hints: true } },
  input: 'choice',
  minItems: 2,
  generate(s, stats, rng = Math.random) {
    const q = pickInterval(s, stats, rng, last)
    last = q.key
    const choices = enabledItems(s, INTERVAL_ITEMS, 2).map((k) => {
      const it = INTERVAL_ITEMS.find((i) => i.key === k)!
      return { key: k, label: it.label, sub: it.sub }
    })
    const hint = SONG_HINTS[q.key]
    const hintText = q.dir === 'harmonic' ? hint.harmonic : q.dir === 'ascending' ? hint.up : hint.down
    const showHints = optBool(s, 'hints', true)
    const firstHeard = q.dir === 'descending' ? q.top : q.root
    return {
      prompt: q.dir === 'harmonic' ? 'Which interval do you hear (played together)?' : `Which ${q.dir} interval do you hear?`,
      sound: intervalSound(q.root, q.top - q.root, q.dir),
      reference: { label: q.dir === 'harmonic' ? 'Lower note' : 'First note', sound: sound([ev([q.dir === 'harmonic' ? q.root : firstHeard], 2)], 60) },
      parts: [{ itemKey: q.key, answer: q.key, choices }],
      choiceSound: (k) => choiceIntervalSound(q, k),
      hint: showHints ? hintText : undefined,
      reveal: `${LONG[q.key]} (${q.key}) ${q.dir}: ${midiToName(q.dir === 'descending' ? q.top : q.root)} → ${midiToName(q.dir === 'descending' ? q.root : q.top)}.${showHints ? ' Think: ' + hintText + '.' : ''}`,
      displayReveal: ({ spellMidi }) => `${LONG[q.key]} (${q.key}) ${q.dir}: ${spellMidi(q.dir === 'descending' ? q.top : q.root)} → ${spellMidi(q.dir === 'descending' ? q.root : q.top)}.${showHints ? ' Think: ' + hintText + '.' : ''}`
    }
  }
}
