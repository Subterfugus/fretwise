import { LETTERS, Note, letterIndex, midi, mod, pitchClass, toNote } from './notes'

export interface IntervalInfo {
  /** Short name, e.g. "m3", "P5", "A4", "d5", "M9" */
  short: string
  long: string
  semitones: number
  /** Generic size: 1 = unison, 3 = third, 9 = ninth */
  number: number
}

const Q_NAMES: Record<string, string> = { P: 'perfect', M: 'major', m: 'minor', A: 'augmented', d: 'diminished' }
const ORD = ['', 'unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave', '9th', '10th', '11th', '12th', '13th']
// Semitones of the major/perfect version of each generic interval (1..7)
const BASE = [0, 0, 2, 4, 5, 7, 9, 11]
const PERFECT = new Set([1, 4, 5, 8])

function ordinal(number: number): string {
  const lastTwo = number % 100
  const last = number % 10
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'
  return `${number}${suffix}`
}

export function parseInterval(short: string): IntervalInfo {
  const m = /^(P|M|m|A|d)(\d+)$/.exec(short)
  if (!m) throw new Error(`Bad interval: ${short}`)
  const q = m[1]
  const num = Number(m[2])
  const simple = ((num - 1) % 7) + 1
  const octaves = Math.floor((num - 1) / 7)
  let semis = BASE[simple] + octaves * 12
  const perfect = PERFECT.has(simple)
  if (perfect) {
    if (q === 'A') semis += 1
    else if (q === 'd') semis -= 1
    else if (q !== 'P') throw new Error(`Bad interval: ${short}`)
  } else {
    if (q === 'm') semis -= 1
    else if (q === 'A') semis += 1
    else if (q === 'd') semis -= 2
    else if (q !== 'M') throw new Error(`Bad interval: ${short}`)
  }
  const long =
    num === 1 && q === 'P' ? 'unison' : num === 8 && q === 'P' ? 'octave' : `${Q_NAMES[q]} ${ORD[num] ?? ordinal(num)}`
  return { short, long, semitones: semis, number: num }
}

/** The 13 simple intervals in the usual "one name per semitone" set (tritone as A4). */
export const SIMPLE_INTERVALS = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'].map(
  parseInterval
)

/** Common name by semitone count (0..12), tritone shown as "tritone". */
export function intervalNameBySemitones(semis: number): string {
  if (mod(semis, 12) === 6 && semis !== 0) return 'tritone'
  return SIMPLE_INTERVALS[semis]?.long ?? `${semis} semitones`
}

/** Transpose a spelled note up (or down, if `down`) by an interval, keeping correct spelling. */
export function transpose(note: Note | string, interval: string, down = false): Note {
  const n = toNote(note)
  const iv = parseInterval(interval)
  const steps = (iv.number - 1) * (down ? -1 : 1)
  const li = letterIndex(n.letter) + steps
  const letter = LETTERS[mod(li, 7)]
  const octaveShift = Math.floor(li / 7)
  const targetPc = mod(pitchClass(n) + (down ? -iv.semitones : iv.semitones), 12)
  const naturalPc = pitchClass({ letter, acc: 0 })
  let acc = mod(targetPc - naturalPc, 12)
  if (acc > 6) acc -= 12
  const out: Note = { letter, acc }
  if (n.octave !== undefined) out.octave = n.octave + octaveShift
  return out
}

/**
 * Spelled interval between a and b. Without octaves, b is taken to be above a within an
 * octave. With octaves on both notes the pair may be descending: the interval is then
 * named by size from the lower note up (E4 down to C4 gives M3, not a crash).
 */
export function intervalBetween(a: Note | string, b: Note | string): IntervalInfo {
  let x = toNote(a)
  let y = toNote(b)
  let generic = mod(letterIndex(y.letter) - letterIndex(x.letter), 7)
  let semis = mod(pitchClass(y) - pitchClass(x), 12)
  const hasOct = x.octave !== undefined && y.octave !== undefined
  if (hasOct) {
    const stepsOf = (n: Note) => n.octave! * 7 + letterIndex(n.letter)
    if (stepsOf(y) < stepsOf(x) || (stepsOf(y) === stepsOf(x) && midi(y) < midi(x))) [x, y] = [y, x]
    semis = midi(y) - midi(x)
    generic = stepsOf(y) - stepsOf(x)
  }
  const num = generic + 1
  const simple = ((num - 1) % 7) + 1
  const octaves = Math.floor((num - 1) / 7)
  let diff = semis - (BASE[simple] + octaves * 12)
  // Without octaves `semis` was reduced mod 12, so Cb up to B (really 12 semitones, an A7)
  // must be brought back near zero: take the representative of diff closest to 0.
  if (!hasOct) diff = mod(diff + 6, 12) - 6
  let q: string
  if (PERFECT.has(simple)) q = diff === 0 ? 'P' : diff > 0 ? 'A' : 'd'
  else q = diff === 0 ? 'M' : diff === -1 ? 'm' : diff > 0 ? 'A' : 'd'
  if (num === 8 && diff === 0) q = 'P'
  return parseInterval(q + num)
}

/** Invert a simple interval: M3 -> m6, P4 -> P5, A4 -> d5 */
export function invert(short: string): string {
  const iv = parseInterval(short)
  if (iv.number === 8 && short[0] === 'P') return 'P1'
  const q = short[0]
  const flip: Record<string, string> = { P: 'P', M: 'm', m: 'M', A: 'd', d: 'A' }
  return flip[q] + (9 - (((iv.number - 1) % 7) + 1))
}
