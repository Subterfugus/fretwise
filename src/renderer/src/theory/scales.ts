import { parseInterval, transpose } from './intervals'
import { Note, noteName, toNote } from './notes'

export interface ScaleDef {
  name: string
  intervals: string[]
  /** Short description of its sound/use, shown in lessons and ear training */
  feel?: string
}

export const SCALES = {
  major: { name: 'Major (Ionian)', intervals: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'], feel: 'bright, resolved' },
  naturalMinor: { name: 'Natural minor (Aeolian)', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7'], feel: 'sad, dark' },
  harmonicMinor: { name: 'Harmonic minor', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'M7'], feel: 'exotic, classical tension' },
  melodicMinor: { name: 'Melodic minor', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'M7'], feel: 'smooth, jazzy minor' },
  ionian: { name: 'Ionian', intervals: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'], feel: 'bright, happy' },
  dorian: { name: 'Dorian', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'm7'], feel: 'minor with a hopeful raised 6th' },
  phrygian: { name: 'Phrygian', intervals: ['P1', 'm2', 'm3', 'P4', 'P5', 'm6', 'm7'], feel: 'dark, Spanish/metal flavour from the ♭2' },
  lydian: { name: 'Lydian', intervals: ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'M7'], feel: 'dreamy, floating ♯4' },
  mixolydian: { name: 'Mixolydian', intervals: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'm7'], feel: 'bluesy major, rock ♭7' },
  aeolian: { name: 'Aeolian', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7'], feel: 'natural minor, sad' },
  locrian: { name: 'Locrian', intervals: ['P1', 'm2', 'm3', 'P4', 'd5', 'm6', 'm7'], feel: 'unstable, diminished ♭5' },
  majorPentatonic: { name: 'Major pentatonic', intervals: ['P1', 'M2', 'M3', 'P5', 'M6'], feel: 'open, country/pop' },
  minorPentatonic: { name: 'Minor pentatonic', intervals: ['P1', 'm3', 'P4', 'P5', 'm7'], feel: 'rock and blues staple' },
  blues: { name: 'Blues scale', intervals: ['P1', 'm3', 'P4', 'd5', 'P5', 'm7'], feel: 'minor pentatonic + ♭5 "blue note"' },
  majorBlues: { name: 'Major blues', intervals: ['P1', 'M2', 'm3', 'M3', 'P5', 'M6'], feel: 'major pentatonic + ♭3' },
  wholeTone: { name: 'Whole tone', intervals: ['P1', 'M2', 'M3', 'A4', 'A5', 'm7'], feel: 'dreamlike, no centre' },
  diminishedHW: { name: 'Diminished (half-whole)', intervals: ['P1', 'm2', 'A2', 'M3', 'A4', 'P5', 'M6', 'm7'], feel: 'tense, over dominant 7♭9' },
  diminishedWH: { name: 'Diminished (whole-half)', intervals: ['P1', 'M2', 'm3', 'P4', 'd5', 'm6', 'M6', 'M7'], feel: 'symmetric tension over diminished and diminished seventh chords' },
  lydianDominant: { name: 'Lydian dominant', intervals: ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'm7'], feel: 'dominant with ♯11' },
  altered: { name: 'Altered (super-Locrian)', intervals: ['P1', 'm2', 'A2', 'M3', 'A4', 'A5', 'm7'], feel: 'maximum tension on V7' },
  phrygianDominant: { name: 'Phrygian dominant', intervals: ['P1', 'm2', 'M3', 'P4', 'P5', 'm6', 'm7'], feel: 'flamenco / Middle-Eastern' },
  chromatic: { name: 'Chromatic', intervals: ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'], feel: 'all twelve pitches, one fret at a time' }
} satisfies Record<string, ScaleDef>

export type ScaleType = keyof typeof SCALES

export const MODE_ORDER: ScaleType[] = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']

/** Spelled scale notes (no octave unless root has one). */
export function buildScale(root: Note | string, type: ScaleType): Note[] {
  const r = toNote(root)
  return SCALES[type].intervals.map((iv) => transpose(r, iv))
}

export function scaleNames(root: Note | string, type: ScaleType): string[] {
  return buildScale(root, type).map(noteName)
}

export function scaleSemitones(type: ScaleType): number[] {
  return SCALES[type].intervals.map((iv) => parseInterval(iv).semitones)
}

/** Whole/half step pattern, e.g. major -> "W W H W W W H" */
export function stepPattern(type: ScaleType): string {
  const s = [...scaleSemitones(type), 12]
  const out: string[] = []
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1]
    out.push(d === 1 ? 'H' : d === 2 ? 'W' : d === 3 ? 'W+H' : String(d))
  }
  return out.join(' ')
}

/** Degree labels relative to major, e.g. dorian -> ["1","2","♭3","4","5","6","♭7"] */
export function degreeLabels(type: ScaleType): string[] {
  return SCALES[type].intervals.map(intervalToDegree)
}

export function intervalToDegree(iv: string): string {
  const { number } = parseInterval(iv)
  const q = iv[0]
  const simple = ((number - 1) % 7) + 1
  const perfect = [1, 4, 5].includes(simple)
  const n = String(number)
  if (q === 'P' || q === 'M') return n
  if (q === 'm') return '♭' + n
  if (q === 'A') return '♯' + n
  if (q === 'd') return perfect ? '♭' + n : '𝄫' + n
  return n
}
