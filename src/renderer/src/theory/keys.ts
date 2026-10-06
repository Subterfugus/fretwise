import { transpose } from './intervals'
import { noteName, Note, toNote } from './notes'
import { buildScale } from './scales'

/** Circle of fifths, clockwise from C (major keys) with relative minors. */
export const CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
export const CIRCLE_MINOR = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D']

export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

export interface KeySignature {
  /** positive = sharps, negative = flats */
  count: number
  accidentals: string[]
}

export function keySignature(tonic: Note | string, minor = false): KeySignature {
  const major = minor ? transpose(tonic, 'm3') : toNote(tonic)
  const notes = buildScale(major, 'major')
  // Count accidental *steps* (a double sharp such as the F## of G# major counts twice), so
  // theoretical keys beyond seven sharps/flats are not under-counted.
  const sharps = notes.reduce((n, x) => n + Math.max(0, x.acc), 0)
  const flats = notes.reduce((n, x) => n + Math.max(0, -x.acc), 0)
  const list = (order: string[], n: number, mark: string) =>
    Array.from({ length: n }, (_, i) => order[i % 7] + mark.repeat(1 + Math.floor(i / 7)))
  if (sharps) return { count: sharps, accidentals: list(SHARP_ORDER, sharps, '#') }
  return { count: flats ? -flats : 0, accidentals: list(FLAT_ORDER, flats, 'b') }
}

export const relativeMinor = (major: Note | string): string => noteName(transpose(major, 'M6'))
export const relativeMajor = (minor: Note | string): string => noteName(transpose(minor, 'm3'))

/** Human description, e.g. "2 sharps (F#, C#)" */
export function describeKeySignature(tonic: Note | string, minor = false): string {
  const k = keySignature(tonic, minor)
  if (k.count === 0) return 'no sharps or flats'
  const n = Math.abs(k.count)
  const word = k.count > 0 ? (n === 1 ? 'sharp' : 'sharps') : n === 1 ? 'flat' : 'flats'
  return `${n} ${word} (${k.accidentals.join(', ')})`
}
