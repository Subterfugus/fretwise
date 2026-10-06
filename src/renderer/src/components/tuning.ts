// Pure helpers shared by the tuning-aware Fretboard / ChordDiagram / Tab components (React-free, tested).
import { FretPos, STANDARD_TUNING, midiAt } from '@/theory/guitar'
import { sameTuning, tuningLetters } from '@/theory/tunings'
import { fromMidi, mod, noteName } from '@/theory/notes'

/** A usable tuning: six integer MIDI numbers. Anything else (undefined, wrong length, NaN) falls back to standard. */
export function effectiveTuning(t?: readonly number[]): number[] {
  if (t && t.length === 6 && t.every((x) => Number.isInteger(x))) return [...t]
  return [...STANDARD_TUNING]
}

export const isStandardTuning = (t?: readonly number[]): boolean => sameTuning(effectiveTuning(t), STANDARD_TUNING)

/** Capo fret clamped to a sane integer 0..12. */
export const effectiveCapo = (capo?: number): number => (capo && Number.isFinite(capo) ? Math.max(0, Math.min(12, Math.round(capo))) : 0)

/** Draw string letters? Explicit setting wins; otherwise only for non-standard tunings. */
export const shouldShowTuning = (tuning?: readonly number[], explicit?: boolean): boolean => explicit ?? !isStandardTuning(tuning)

/** Sounding MIDI of a position. `capo` is only added for capo-relative frets (chord diagrams / tab). */
export const soundingMidi = (p: FretPos, tuning?: readonly number[], capo = 0): number => midiAt(p, effectiveTuning(tuning)) + capo

/** Pitch class heard at a position (absolute fret numbers, no capo offset). */
export const soundingPc = (p: FretPos, tuning?: readonly number[]): number => mod(midiAt(p, effectiveTuning(tuning)), 12)

/** Letters of the open strings for the string `string` (1..6) in this tuning. */
export function stringLetter(string: number, tuning?: readonly number[]): string {
  const low = tuningLetters(effectiveTuning(tuning)) // string 6 first
  return low[6 - string]
}

/** A fret behind the capo cannot be played (fret 0 included once a capo is on). */
export const isDeadFret = (fret: number, capo: number): boolean => capo > 0 && fret < capo

/** Written pitch for guitar notation is an octave above sounding pitch: VexFlow key like "Bb/4". */
export function writtenKey(m: number, flats = false): string {
  const n = fromMidi(m + 12, flats)
  return `${noteName(n)}/${n.octave}`
}

/** "Tuning (low to high): D A D G B E · Capo 2" for captions. */
export function tuningCaption(tuning?: readonly number[], capo?: number): string {
  const parts: string[] = []
  if (!isStandardTuning(tuning)) parts.push('Tuning (low to high): ' + tuningLetters(effectiveTuning(tuning)).join(' '))
  const c = effectiveCapo(capo)
  if (c) parts.push(`Capo ${c}`)
  return parts.join(' · ')
}
