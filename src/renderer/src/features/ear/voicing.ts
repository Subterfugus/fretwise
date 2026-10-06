// Chord voicings for ear training: real guitar shapes where we have them
// (open chords + movable E/A-form barres), otherwise a close voicing.
import { ChordShape, OPEN_CHORDS, movableChord, shapeMidis } from '@/theory/guitar'
import { CHORDS, ChordType } from '@/theory/chords'
import { parseInterval } from '@/theory/intervals'
import { FLAT_NAMES, SHARP_NAMES, mod } from '@/theory/notes'
import { pick } from './weighting'
import type { Rng } from './types'

export type VoicingStyle = 'guitar' | 'close'

/** Tonic spellings for random major keys (conventional key names). */
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const keyName = (pc: number): string => KEY_NAMES[mod(pc, 12)]
export const pcLabel = (pc: number, preferFlats = false): string => (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)]

export const chordSemis = (type: ChordType): number[] => CHORDS[type].intervals.map((iv) => parseInterval(iv).semitones)

/** Pitch classes of a chord (sorted, unique). */
export const chordPcs = (rootPc: number, type: ChordType): number[] =>
  [...new Set(chordSemis(type).map((s) => mod(rootPc + s, 12)))].sort((a, b) => a - b)

/** Close voicing with the root between A2 and G#3. */
export function closeVoicing(rootPc: number, type: ChordType): number[] {
  const root = 45 + mod(rootPc - 9, 12)
  return chordSemis(type).map((s) => root + s)
}

const OPEN_SUFFIX: Partial<Record<ChordType, string>> = {
  maj: '',
  min: 'm',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  sus2: 'sus2',
  sus4: 'sus4'
}

// Movable forms the shared library lacks, rooted on string 5 (offsets low E -> high E; null = muted).
// dim: x r r+1 r+2 r+1 x (e.g. Cdim x3454x) · aug: x r r-1 r-2 r-2 x (e.g. C+ x3211x)
const EXTRA_A_FORMS: Partial<Record<ChordType, (number | null)[]>> = {
  dim: [null, 0, 1, 2, 1, null],
  aug: [null, 0, -1, -2, -2, null]
}

function extraShape(rootPc: number, type: ChordType): ChordShape | null {
  const offs = EXTRA_A_FORMS[type]
  if (!offs) return null
  const lowest = Math.min(...(offs.filter((o) => o !== null) as number[]))
  let rf = mod(rootPc - 9, 12) // fret of root on the A string
  while (rf + lowest < 1) rf += 12
  return { name: pcLabel(rootPc) + CHORDS[type].symbol, frets: offs.map((o) => (o === null ? null : rf + o)) }
}

/** All guitar shapes we know for this chord (open + movable), within the first 14 frets. */
export function guitarShapes(rootPc: number, type: ChordType): ChordShape[] {
  const out: ChordShape[] = []
  const suffix = OPEN_SUFFIX[type]
  if (suffix !== undefined) {
    const open = OPEN_CHORDS[SHARP_NAMES[mod(rootPc, 12)] + suffix]
    if (open) out.push(open)
  }
  for (const s of [6, 5] as const) {
    const m = movableChord(SHARP_NAMES[mod(rootPc, 12)], type, s, 1)
    if (m) out.push(m)
  }
  const x = extraShape(rootPc, type)
  if (x) out.push(x)
  return out.filter((sh) => Math.max(...(sh.frets.filter((f) => f !== null) as number[])) <= 14)
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * MIDI notes for a chord. With style 'guitar' a real shape is used when available.
 * `near` (average pitch of the previous chord) picks the closest shape for smooth voice leading.
 */
export function chordVoicing(rootPc: number, type: ChordType, style: VoicingStyle, rng: Rng = Math.random, near?: number): number[] {
  if (style === 'guitar') {
    const shapes = guitarShapes(rootPc, type).map(shapeMidis)
    if (shapes.length) {
      if (near === undefined) return pick(shapes, rng)
      return [...shapes].sort((a, b) => Math.abs(mean(a) - near) - Math.abs(mean(b) - near))[0]
    }
  }
  return closeVoicing(rootPc, type)
}

/** Voice a list of chords with smooth movement between guitar shapes. */
export function voiceChords(chords: { rootPc: number; type: ChordType }[], style: VoicingStyle, rng: Rng = Math.random): number[][] {
  const out: number[][] = []
  let near: number | undefined
  for (const c of chords) {
    const v = chordVoicing(c.rootPc, c.type, style, rng, near)
    out.push(v)
    near ??= mean(v) // keep anchored to the first chord's register
  }
  return out
}
