// Helpers for writing lesson content concisely.
import {
  ChordShape,
  FretPos,
  midiAt,
  nameAt,
  pcAt,
  positionsOf,
  scaleBox,
  scalePositions,
  shapePositions
} from '@/theory/guitar'
import { buildScale, ScaleType, SCALES, intervalToDegree } from '@/theory/scales'
import { buildChord, ChordType, CHORDS } from '@/theory/chords'
import { intervalBetween, transpose } from '@/theory/intervals'
import { midi, mod, Note, noteName, pitchClass, toNote } from '@/theory/notes'
import type { FretMark, PlaySpec, QuizQuestion } from './types'

export type LabelMode = 'note' | 'degree' | 'interval' | 'none'

export const rand = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
export const randInt = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1))
export function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Build a multiple-choice question; correct answer is placed at a random index. */
export function mc(
  prompt: string,
  correct: string,
  wrong: string[],
  extra: Partial<Omit<Extract<QuizQuestion, { kind: 'mc' }>, 'kind' | 'prompt' | 'choices' | 'answer'>> = {}
): QuizQuestion {
  const distinct = [...new Set(wrong.filter((w) => w !== correct))]
  const choices = shuffle([correct, ...distinct])
  return { kind: 'mc', prompt, choices, answer: choices.indexOf(correct), ...extra }
}

/** Pick n distinct random items not equal to `exclude`. */
export function distractors<T>(pool: readonly T[], exclude: T, n = 3): T[] {
  return shuffle(pool.filter((p) => p !== exclude)).slice(0, n)
}

// ---------- marks ----------

function labelFor(pos: FretPos, root: Note | undefined, mode: LabelMode, spelled?: Map<number, string>): string | undefined {
  if (mode === 'none') return undefined
  const pc = pcAt(pos)
  if (mode === 'note') return spelled?.get(pc) ?? nameAt(pos)
  if (!root) return undefined
  const semis = mod(pc - pitchClass(root), 12)
  if (mode === 'interval') return INTERVAL_SHORT[semis]
  return DEGREE_BY_SEMI[semis]
}
const INTERVAL_SHORT = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7']
const DEGREE_BY_SEMI = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']

/** Map pitch class -> correctly spelled name for a set of spelled notes. */
function spellingMap(notes: Note[]): Map<number, string> {
  return new Map(notes.map((n) => [pitchClass(n), noteName(n)]))
}

/** Marks for a scale, either the whole neck range or one box pattern. Roots highlighted. */
export function scaleMarks(
  root: string,
  type: ScaleType,
  opts: { box?: number; perString?: number; frets?: [number, number]; label?: LabelMode } = {}
): FretMark[] {
  const r = toNote(root)
  const notes = buildScale(r, type)
  const spelled = spellingMap(notes)
  const label = opts.label ?? 'note'
  const degreeOf = new Map(notes.map((n, i) => [pitchClass(n), intervalToDegree(SCALES[type].intervals[i])]))
  const positions =
    opts.box !== undefined
      ? scaleBox(r, type, opts.box, opts.perString)
      : scalePositions(r, type, opts.frets?.[0] ?? 0, opts.frets?.[1] ?? 12)
  return positions.map((p) => ({
    ...p,
    toolExample: { kind: 'scale' as const, root, type, frets: opts.frets, box: opts.box },
    color: pcAt(p) === pitchClass(r) ? 'root' : 'tone',
    label: label === 'degree' ? degreeOf.get(pcAt(p)) : labelFor(p, r, label, spelled)
  }))
}

/** Marks for a chord shape; root coloured, labels by note/interval/finger. */
export function shapeMarks(shape: ChordShape, root?: string, label: LabelMode | 'finger' = 'note'): FretMark[] {
  const r = root ? toNote(root) : undefined
  return shapePositions(shape).map((p) => {
    const i = 6 - p.string
    return {
      ...p,
      color: r && pcAt(p) === pitchClass(r) ? 'root' : 'tone',
      computedNote: label === 'note' ? { pc: pcAt(p), key: root } : undefined,
      label: label === 'finger' ? (shape.fingers?.[i] ? String(shape.fingers[i]) : undefined) : labelFor(p, r, label)
    }
  })
}

/** Every chord tone of root+type on the neck within the fret range (an "arpeggio map"). */
export function chordToneMarks(root: string, type: ChordType, frets: [number, number] = [0, 12], label: LabelMode = 'degree'): FretMark[] {
  const r = toNote(root)
  const tones = buildChord(r, type)
  const spelled = spellingMap(tones)
  const degreeOf = new Map(tones.map((n, i) => [pitchClass(n), intervalToDegree(CHORDS[type].intervals[i]).replace(/^(9|11|13)$/, '$1')]))
  const out: FretMark[] = []
  for (const t of tones)
    for (const p of positionsOf(t, frets[0], frets[1]))
      out.push({
        ...p,
        toolExample: { kind: 'chord', root, type },
        color: pitchClass(t) === pitchClass(r) ? 'root' : 'tone',
        label: label === 'degree' ? degreeOf.get(pcAt(p)) : labelFor(p, r, label, spelled)
      })
  return out
}

/** All positions of one note name within a fret range. */
export function noteMarks(note: string, frets: [number, number] = [0, 12], color: FretMark['color'] = 'root'): FretMark[] {
  return positionsOf(note, frets[0], frets[1]).map((p) => ({ ...p, color, label: noteName(note) }))
}

/** Explicit marks: m(6, 3, 'G') */
export const m = (string: number, fret: number, label?: string, color: FretMark['color'] = 'tone'): FretMark => ({ string, fret, label, color })

// ---------- sound ----------

/** Play a shape as a strum. */
export const strum = (shape: ChordShape): PlaySpec => ({ kind: 'shape', shape, mode: 'strum' })

/** Play marks low->high once each (sorted by pitch) as an arpeggio. */
export function playMarks(marks: FretPos[], ascending = true, tuning?: number[]): PlaySpec {
  const midis = [...new Set(marks.map((p) => midiAt(p, tuning)))].sort((a, b) => a - b)
  return { kind: 'notes', notes: ascending ? midis : midis.reverse(), mode: 'arpeggio' }
}

/** Scale played up from root at a sensible guitar octave (root in octave 3 by default). */
export function playScale(root: string, type: ScaleType, octave = 3, andBack = false): PlaySpec {
  const r = toNote(root)
  r.octave = octave
  const notes = buildScale(r, type).map(midi)
  notes.push(midi(r) + 12)
  return { kind: 'notes', notes: andBack ? [...notes, ...notes.slice(0, -1).reverse()] : notes, mode: 'arpeggio', toolExample: { kind: 'scale', root, type } }
}

/** Chord voiced simply in close position from root at octave (default 3), strummed. */
export function playChord(root: string, type: ChordType, octave = 3, mode: 'strum' | 'block' | 'arpeggio' = 'strum'): PlaySpec {
  const r = toNote(root)
  r.octave = octave
  return { kind: 'notes', notes: buildChord(r, type).map(midi), mode, toolExample: { kind: 'chord', root, type } }
}

export function playInterval(root: string, interval: string, dir: 'ascending' | 'descending' | 'harmonic' = 'ascending'): PlaySpec {
  const r = toNote(root)
  if (r.octave === undefined) r.octave = 3
  return { kind: 'interval', a: midi(r), b: midi(transpose(r, interval)), dir }
}

export { intervalBetween, noteName }
