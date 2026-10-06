// Spelled notes: a letter plus an accidental offset, optionally with an octave.
// Spelling matters in theory (F# vs Gb), so we never reduce to pitch class
// unless we're comparing sounds.

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

export interface Note {
  letter: Letter
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp */
  acc: number
  octave?: number
}

export const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export const mod = (n: number, m: number): number => ((n % m) + m) % m

/** Parse "C", "F#", "Bb3", "Ebb", "C##5", also accepts unicode ♯/♭. */
export function parseNote(s: string): Note {
  const m = /^([A-Ga-g])([#♯x]{0,2}|[b♭]{0,2})(-?\d+)?$/.exec(s.trim())
  if (!m) throw new Error(`Bad note: ${s}`)
  const letter = m[1].toUpperCase() as Letter
  const accStr = m[2]
  let acc = 0
  for (const ch of accStr) acc += ch === 'x' ? 2 : ch === '#' || ch === '♯' ? 1 : -1
  return { letter, acc, octave: m[3] !== undefined ? Number(m[3]) : undefined }
}

export const toNote = (n: Note | string): Note => (typeof n === 'string' ? parseNote(n) : n)

export function accidentalString(acc: number): string {
  if (acc === 0) return ''
  return acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc)
}

/** "F#", "Bb" (no octave). */
export function noteName(n: Note | string): string {
  const x = toNote(n)
  return x.letter + accidentalString(x.acc)
}

/** "F#4" when octave is known. */
export function fullName(n: Note): string {
  return noteName(n) + (n.octave ?? '')
}

/** Display form with real sharp/flat glyphs. */
export function pretty(n: Note | string): string {
  // Only touch "b" directly after a note letter and not inside a word (so "About" stays intact).
  const after = '(?=$|[^a-z]|m|sus|add|dim|aug)'
  return (typeof n === 'string' ? n : fullName(n))
    .replace(/##/g, '𝄪')
    .replace(/#/g, '♯')
    .replace(new RegExp(`\\b([A-G])bb${after}`, 'g'), '$1𝄫')
    .replace(new RegExp(`\\b([A-G])b${after}`, 'g'), '$1♭')
    // chord-symbol alterations typed with a plain b between digits: "C7b9", "Cm7b5"
    .replace(/(?<=\d)b(?=\d)/g, '♭')
}

export function pitchClass(n: Note | string): number {
  const x = toNote(n)
  return mod(LETTER_PC[x.letter] + x.acc, 12)
}

/** MIDI number; C4 = 60. Octave follows the letter (so B#3 = C4 = 60). */
export function midi(n: Note | string): number {
  const x = toNote(n)
  if (x.octave === undefined) throw new Error(`midi() needs an octave: ${noteName(x)}`)
  return (x.octave + 1) * 12 + LETTER_PC[x.letter] + x.acc
}

export function fromMidi(m: number, preferFlats = false): Note {
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod(m, 12)]
  const n = parseNote(name)
  n.octave = Math.floor(m / 12) - 1
  return n
}

export function midiToName(m: number, preferFlats = false): string {
  return fullName(fromMidi(m, preferFlats))
}

/** Two notes sound the same (ignoring octave)? */
export const enharmonic = (a: Note | string, b: Note | string): boolean => pitchClass(a) === pitchClass(b)

export function letterIndex(l: Letter): number {
  return LETTERS.indexOf(l)
}

/** Name for a pitch class using sharps or flats. */
export function pcName(pc: number, preferFlats = false): string {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)]
}
