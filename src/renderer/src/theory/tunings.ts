// Common guitar tunings. `midi` uses the same convention as STANDARD_TUNING in ./guitar:
// index 0 = string 1 (highest) ... index 5 = string 6 (lowest).
import { STANDARD_TUNING } from './guitar'
import { mod, pcName } from './notes'

export interface TuningInfo {
  id: string
  name: string
  /** MIDI of the open strings, index 0 = string 1 (high) ... index 5 = string 6 (low) */
  midi: number[]
  /** Spelled note names of the open strings, LOW to HIGH (string 6 first), the way guitarists say them */
  letters: string[]
}

export const STANDARD: TuningInfo = { id: 'standard', name: 'Standard', midi: [...STANDARD_TUNING], letters: ['E', 'A', 'D', 'G', 'B', 'E'] }
export const DROP_D: TuningInfo = { id: 'dropD', name: 'Drop D', midi: [64, 59, 55, 50, 45, 38], letters: ['D', 'A', 'D', 'G', 'B', 'E'] }
export const DADGAD: TuningInfo = { id: 'dadgad', name: 'DADGAD', midi: [62, 57, 55, 50, 45, 38], letters: ['D', 'A', 'D', 'G', 'A', 'D'] }
export const OPEN_G: TuningInfo = { id: 'openG', name: 'Open G', midi: [62, 59, 55, 50, 43, 38], letters: ['D', 'G', 'D', 'G', 'B', 'D'] }
export const OPEN_D: TuningInfo = { id: 'openD', name: 'Open D', midi: [62, 57, 54, 50, 45, 38], letters: ['D', 'A', 'D', 'F#', 'A', 'D'] }
export const OPEN_E: TuningInfo = { id: 'openE', name: 'Open E', midi: [64, 59, 56, 52, 47, 40], letters: ['E', 'B', 'E', 'G#', 'B', 'E'] }
export const DOUBLE_DROP_D: TuningInfo = { id: 'doubleDropD', name: 'Double drop D', midi: [62, 59, 55, 50, 45, 38], letters: ['D', 'A', 'D', 'G', 'B', 'D'] }
export const HALF_STEP_DOWN: TuningInfo = { id: 'halfDown', name: 'Half step down', midi: [63, 58, 54, 49, 44, 39], letters: ['Eb', 'Ab', 'Db', 'Gb', 'Bb', 'Eb'] }
export const FULL_STEP_DOWN: TuningInfo = { id: 'fullDown', name: 'Whole step down', midi: [62, 57, 53, 48, 43, 38], letters: ['D', 'G', 'C', 'F', 'A', 'D'] }

export const TUNINGS: TuningInfo[] = [STANDARD, DROP_D, DADGAD, OPEN_G, OPEN_D, OPEN_E, DOUBLE_DROP_D, HALF_STEP_DOWN, FULL_STEP_DOWN]

export const sameTuning = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

export const findTuning = (t: readonly number[]): TuningInfo | undefined => TUNINGS.find((x) => sameTuning(x.midi, t))

/**
 * Open-string note names LOW to HIGH. Named tunings use their traditional spelling
 * (Open E has G#, half step down uses flats); anything else is spelled with sharps.
 */
export function tuningLetters(t: readonly number[]): string[] {
  const known = findTuning(t)
  if (known) return [...known.letters]
  return [...t].reverse().map((m) => pcName(mod(m, 12)))
}

/** Semitones each string must move (negative = down) to go from `from` to `to`, string 1 first. */
export const tuningShift = (from: readonly number[], to: readonly number[]): number[] => to.map((m, i) => m - from[i])

/** Semitone gaps between neighbouring strings, LOW to HIGH (5 numbers). */
export function stringGaps(t: readonly number[]): number[] {
  const low = [...t].reverse()
  return low.slice(1).map((m, i) => m - low[i])
}
