// Pure logic for the play-along exercises: generating challenges, matching detected notes
// against targets and tracking progress through a sequence. No React, no audio.
import { FretPos, openMidi, positionsOf, posKey, scaleBox, midiAt } from '@/theory/guitar'
import type { FretMark } from '@/content/types'
import { buildChord, CHORDS, ChordType } from '@/theory/chords'
import { buildScale, ScaleType } from '@/theory/scales'
import { parseInterval, transpose } from '@/theory/intervals'
import { fromMidi, midi as noteMidi, mod, noteName, parseNote, pcName } from '@/theory/notes'

export type ExerciseKind = 'note' | 'interval' | 'scale' | 'arpeggio' | 'memo'
export type Difficulty = 'easy' | 'medium' | 'hard'

export const KIND_INFO: Record<ExerciseKind, { title: string; blurb: string }> = {
  note: { title: 'Play a note', blurb: 'Find a named note on a given string, or anywhere.' },
  interval: { title: 'Play an interval', blurb: 'Play a note, then the note an interval above (or below) it.' },
  scale: { title: 'Play a scale', blurb: 'Play a scale note by note and watch the fretboard light up.' },
  arpeggio: { title: 'Play an arpeggio', blurb: 'Play the chord tones of a chord, one note at a time.' },
  memo: { title: 'Fretboard memory', blurb: 'Timed: a note name appears, play it anywhere. Score per minute.' }
}

export const DIFFICULTY_RULES: Record<Difficulty, { maxMistakes: number; hints: boolean; blurb: string }> = {
  easy: { maxMistakes: Infinity, hints: true, blurb: 'Targets are shown on the fretboard, wrong notes are only counted.' },
  medium: { maxMistakes: 8, hints: false, blurb: 'No hints. Too many wrong notes (8) ends the attempt.' },
  hard: { maxMistakes: 3, hints: false, blurb: 'No hints, harder material, 3 wrong notes ends the attempt.' }
}

/** A note the player has to produce. `midis` undefined = any octave. */
export interface NoteTarget {
  pc: number
  midis?: number[]
  /** spelled name, e.g. "F#" */
  label: string
  computed?: boolean
}

export function matchesTarget(midi: number, t: NoteTarget): boolean {
  if (t.midis) return t.midis.includes(midi)
  return mod(midi, 12) === t.pc
}

export interface Challenge {
  kind: Exclude<ExerciseKind, 'memo'>
  /** short name for the history, e.g. "A minor pentatonic, box 1" */
  title: string
  prompt: string
  targets: NoteTarget[]
  /** where each target can be played, for the fretboard */
  positions: FretPos[][]
  frets: [number, number]
}

type Rng = () => number
const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)]
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11]
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

export const ordinalString = (s: number): string => ORDINAL[s]

/** Position of a MIDI note near a previous position (display only). */
export function bestPosition(midi: number, prev?: FretPos, maxFret = 12): FretPos | null {
  let best: FretPos | null = null
  let bestCost = Infinity
  for (let s = 6; s >= 1; s--) {
    const f = midi - openMidi(s)
    if (f < 0 || f > maxFret) continue
    const cost = prev ? Math.abs(f - prev.fret) + (s === prev.string ? 0 : 0.4) : f
    if (cost < bestCost) {
      bestCost = cost
      best = { string: s, fret: f }
    }
  }
  return best
}

export function describePos(p: FretPos): string {
  return `${ORDINAL[p.string]} string, ${p.fret === 0 ? 'open' : 'fret ' + p.fret}`
}

const spell = (pc: number, flats: boolean) => pcName(pc, flats)

// ---------- single notes (also used by the memory drill) ----------

export interface NoteTargetOptions {
  accidentals: boolean
  /** restrict to one string (pitch range of that string, frets 0-12); null = anywhere */
  string: number | null
  anyOctave: boolean
  /** highest fret to choose from when picking a string/fret */
  maxFret?: number
}

export function pickNoteTarget(o: NoteTargetOptions, rng: Rng, avoidPc?: number): { target: NoteTarget; positions: FretPos[]; prompt: string } {
  const flats = rng() < 0.5
  let pc: number
  let string = o.string
  if (!o.anyOctave && string === null) string = 1 + Math.floor(rng() * 6)
  for (let tries = 0; ; tries++) {
    pc = o.accidentals ? Math.floor(rng() * 12) : pick(NATURAL_PCS, rng)
    if (string !== null) {
      // keep it within the chosen fret limit so beginners are not sent to the 12th fret
      const f = mod(pc - openMidi(string), 12)
      if (f > (o.maxFret ?? 12)) continue
    }
    if (pc !== avoidPc || tries > 30) break
  }
  const label = spell(pc, o.accidentals ? flats : false)
  if (string === null || o.anyOctave) {
    return {
      target: { pc, label, computed: true },
      positions: positionsOf(pc, 0, 12),
      prompt: `Play any ${label}`
    }
  }
  const open = openMidi(string)
  const midis: number[] = []
  for (let m = open; m <= open + 12; m++) if (mod(m, 12) === pc) midis.push(m)
  return {
    target: { pc, midis, label, computed: true },
    positions: midis.map((m) => ({ string: string as number, fret: m - open })),
    prompt: `Play ${label} on the ${ORDINAL[string]} string`
  }
}

// ---------- challenge generators ----------

export interface GenOptions {
  difficulty: Difficulty
  anyOctave: boolean
}

const levelOf = (d: Difficulty) => (d === 'easy' ? 0 : d === 'medium' ? 1 : 2)

function noteChallenge(o: GenOptions, rng: Rng): Challenge {
  const lvl = levelOf(o.difficulty)
  const r = pickNoteTarget({ accidentals: lvl >= 1, string: null, anyOctave: o.anyOctave, maxFret: lvl === 0 ? 5 : 12 }, rng)
  return {
    kind: 'note',
    title: r.target.label,
    prompt: r.prompt,
    targets: [r.target],
    positions: [r.positions],
    frets: [0, 12]
  }
}

const INTERVALS_BY_LEVEL: string[][] = [
  ['M2', 'm3', 'M3', 'P4', 'P5', 'P8'],
  ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'],
  ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']
]

function intervalChallenge(o: GenOptions, rng: Rng): Challenge {
  const lvl = levelOf(o.difficulty)
  const short = pick(INTERVALS_BY_LEVEL[lvl], rng)
  const info = parseInterval(short)
  const down = lvl === 2 && rng() < 0.5
  const semis = info.semitones
  const lo = down ? 40 + semis : 40
  const hi = down ? 76 : 76 - semis
  let rootMidi = lo
  for (let tries = 0; tries < 50; tries++) {
    rootMidi = lo + Math.floor(rng() * (hi - lo + 1))
    if (lvl >= 1 || NATURAL_PCS.includes(mod(rootMidi, 12))) break
  }
  const flats = rng() < 0.5
  const root = fromMidi(rootMidi, flats)
  const second = transpose(root, short, down)
  const secondMidi = down ? rootMidi - semis : rootMidi + semis
  const rootPos = bestPosition(rootMidi)
  const secondPos = bestPosition(secondMidi, rootPos ?? undefined)
  const a = noteName(root)
  const b = noteName(second)
  const dirWord = down ? 'below' : 'above'
  const mk = (m: number, label: string): NoteTarget => ({ pc: mod(m, 12), label, midis: o.anyOctave ? undefined : [m] })
  const targets = [mk(rootMidi, a), mk(secondMidi, b)]
  const rootDesc = o.anyOctave || !rootPos ? a : `${a}${root.octave} (${describePos(rootPos)})`
  return {
    kind: 'interval',
    title: `${info.long} ${dirWord}`,
    prompt: `Play ${rootDesc}, then the ${info.long} ${dirWord} it`,
    targets,
    positions: [o.anyOctave ? positionsOf(rootMidi, 0, 12) : rootPos ? [rootPos] : [], o.anyOctave ? positionsOf(secondMidi, 0, 12) : secondPos ? [secondPos] : []],
    frets: [0, 12]
  }
}

interface ScaleChoice {
  root: string
  type: ScaleType
  /** 'box' = pentatonic box 1 from scaleBox; 'octave' = one octave from the lowest root */
  shape: 'box' | 'octave'
  level: 0 | 1 | 2
  label: string
}

const SCALE_CHOICES: ScaleChoice[] = [
  { root: 'A', type: 'minorPentatonic', shape: 'box', level: 0, label: 'A minor pentatonic, box 1' },
  { root: 'E', type: 'minorPentatonic', shape: 'box', level: 0, label: 'E minor pentatonic, box 1' },
  { root: 'G', type: 'major', shape: 'octave', level: 0, label: 'G major scale' },
  { root: 'C', type: 'major', shape: 'octave', level: 0, label: 'C major scale' },
  { root: 'A', type: 'naturalMinor', shape: 'octave', level: 0, label: 'A natural minor scale' },
  { root: 'D', type: 'minorPentatonic', shape: 'box', level: 1, label: 'D minor pentatonic, box 1' },
  { root: 'G', type: 'minorPentatonic', shape: 'box', level: 1, label: 'G minor pentatonic, box 1' },
  { root: 'D', type: 'major', shape: 'octave', level: 1, label: 'D major scale' },
  { root: 'A', type: 'major', shape: 'octave', level: 1, label: 'A major scale' },
  { root: 'E', type: 'major', shape: 'octave', level: 1, label: 'E major scale' },
  { root: 'E', type: 'naturalMinor', shape: 'octave', level: 1, label: 'E natural minor scale' },
  { root: 'F', type: 'major', shape: 'octave', level: 1, label: 'F major scale' },
  { root: 'B', type: 'minorPentatonic', shape: 'box', level: 2, label: 'B minor pentatonic, box 1' },
  { root: 'C', type: 'minorPentatonic', shape: 'box', level: 2, label: 'C minor pentatonic, box 1' },
  { root: 'F#', type: 'minorPentatonic', shape: 'box', level: 2, label: 'F♯ minor pentatonic, box 1' },
  { root: 'B', type: 'major', shape: 'octave', level: 2, label: 'B major scale' },
  { root: 'Bb', type: 'major', shape: 'octave', level: 2, label: 'B♭ major scale' },
  { root: 'E', type: 'dorian', shape: 'octave', level: 2, label: 'E dorian' },
  { root: 'A', type: 'mixolydian', shape: 'octave', level: 2, label: 'A mixolydian' },
  { root: 'E', type: 'harmonicMinor', shape: 'octave', level: 2, label: 'E harmonic minor' }
]

/** Lowest comfortable MIDI of a pitch class at or above E2 (open low E). */
const lowestMidi = (pc: number): number => 40 + mod(pc - 40, 12)

function scaleChallenge(o: GenOptions, rng: Rng, avoid?: string): Challenge {
  const lvl = levelOf(o.difficulty)
  const pool = SCALE_CHOICES.filter((c) => c.level <= lvl && c.label !== avoid)
  const c = pick(pool.length ? pool : SCALE_CHOICES, rng)
  const names = buildScale(c.root, c.type).map(noteName)
  let positions: FretPos[]
  let midis: number[]
  let labels: string[]
  if (c.shape === 'box') {
    positions = scaleBox(c.root, c.type, 0, 2)
    midis = positions.map((p) => midiAt(p))
    labels = midis.map((m) => names.find((n) => mod(noteMidi(n + '4'), 12) === mod(m, 12)) ?? pcName(mod(m, 12)))
  } else {
    const start = lowestMidi(mod(noteMidi(c.root + '4'), 12))
    const rootNote = { ...parseNote(c.root), octave: Math.floor(start / 12) - 1 }
    const scaleNotes = buildScale(rootNote, c.type)
    midis = scaleNotes.map((n) => noteMidi(n))
    midis.push(midis[0] + 12)
    labels = [...scaleNotes.map(noteName), noteName(rootNote)]
    positions = []
    let prev: FretPos | undefined
    for (const m of midis) {
      const p = bestPosition(m, prev) ?? { string: 1, fret: 12 }
      positions.push(p)
      prev = p
    }
  }
  let order = midis.map((_, i) => i)
  if (o.difficulty === 'hard') order = [...order, ...order.slice(0, -1).reverse()]
  const targets: NoteTarget[] = order.map((i) => ({ pc: mod(midis[i], 12), label: labels[i], midis: o.anyOctave ? undefined : [midis[i]] }))
  const first = positions[0]
  const maxFret = Math.max(...positions.map((p) => p.fret))
  const where = first ? ` Start on the ${ORDINAL[first.string]} string, ${first.fret === 0 ? 'open' : 'fret ' + first.fret}.` : ''
  return {
    kind: 'scale',
    title: c.label,
    prompt: `Play the ${c.label}${o.difficulty === 'hard' ? ' up and back down' : ' ascending'}, one note at a time.${o.anyOctave ? '' : where}`,
    targets,
    positions: order.map((i) => [positions[i]]),
    frets: [0, Math.max(12, maxFret + 1)]
  }
}

const ARP_TYPES: ChordType[][] = [['maj', 'min'], ['maj', 'min', 'dom7', 'min7', 'maj7'], ['maj', 'min', 'dom7', 'min7', 'maj7', 'dim', 'm7b5', 'sus4']]
const ARP_ROOTS: string[][] = [
  ['C', 'G', 'D', 'A', 'E', 'F'],
  ['C', 'G', 'D', 'A', 'E', 'F', 'B', 'Bb'],
  ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
]

function arpeggioChallenge(o: GenOptions, rng: Rng, avoid?: string): Challenge {
  const lvl = levelOf(o.difficulty)
  let root = 'C'
  let type: ChordType = 'maj'
  let title = ''
  for (let i = 0; i < 20; i++) {
    root = pick(ARP_ROOTS[lvl], rng)
    type = pick(ARP_TYPES[lvl], rng)
    title = noteName(root) + CHORDS[type].symbol
    if (title !== avoid) break
  }
  const start = lowestMidi(mod(noteMidi(root + '4'), 12))
  const rootNote = { ...parseNote(root), octave: Math.floor(start / 12) - 1 }
  const tones = buildChord(rootNote, type)
  const midis = tones.map((n) => noteMidi(n))
  const names = tones.map(noteName)
  let prev: FretPos | undefined
  const positions = midis.map((m) => {
    const p = bestPosition(m, prev) ?? { string: 1, fret: 12 }
    prev = p
    return [p]
  })
  const rp = positions[0][0]
  return {
    kind: 'arpeggio',
    title,
    prompt: `Play the notes of ${title} (${CHORDS[type].formula}) one at a time, low to high.${o.anyOctave ? '' : ` Start on the ${ORDINAL[rp.string]} string, ${rp.fret === 0 ? 'open' : 'fret ' + rp.fret}.`}`,
    targets: midis.map((m, i) => ({ pc: mod(m, 12), label: names[i], midis: o.anyOctave ? undefined : [m] })),
    positions,
    frets: [0, Math.max(12, ...positions.map((p) => p[0].fret + 1))]
  }
}

export function generateChallenge(kind: Challenge['kind'], o: GenOptions, rng: Rng = Math.random, avoidTitle?: string): Challenge {
  switch (kind) {
    case 'note':
      for (let i = 0; i < 10; i++) {
        const c = noteChallenge(o, rng)
        if (c.title !== avoidTitle) return c
      }
      return noteChallenge(o, rng)
    case 'interval':
      return intervalChallenge(o, rng)
    case 'scale':
      return scaleChallenge(o, rng, avoidTitle)
    case 'arpeggio':
      return arpeggioChallenge(o, rng, avoidTitle)
  }
}

/** "Play C on the 5th string" style prompt on a given string, used by the string-specific note drill. */
export function stringNoteChallenge(string: number, o: GenOptions, rng: Rng = Math.random): Challenge {
  const r = pickNoteTarget({ accidentals: o.difficulty !== 'easy', string, anyOctave: false }, rng)
  return { kind: 'note', title: r.target.label, prompt: r.prompt, targets: [r.target], positions: [r.positions], frets: [0, 12] }
}

// ---------- memory drill ----------

export function memoTarget(difficulty: Difficulty, rng: Rng = Math.random, avoidPc?: number) {
  const lvl = levelOf(difficulty)
  const string = lvl === 2 ? 1 + Math.floor(rng() * 6) : null
  const r = pickNoteTarget({ accidentals: lvl >= 1, string, anyOctave: string === null }, rng, avoidPc)
  return { target: r.target, positions: r.positions, prompt: string === null ? `Play ${r.target.label}` : `Find ${r.target.label} on the ${ORDINAL[string]} string`, string }
}

// ---------- progress through a sequence ----------

export type PushResult = 'hit' | 'miss' | 'over'

export class SequenceRun {
  index = 0
  mistakes = 0
  /** detected notes accepted so far (MIDI) */
  hits: number[] = []
  /** wrong notes played, in order (MIDI) */
  wrong: number[] = []

  constructor(
    readonly targets: NoteTarget[],
    readonly maxMistakes = Infinity
  ) {}

  get done(): boolean {
    return this.index >= this.targets.length
  }
  get failed(): boolean {
    return this.mistakes > this.maxMistakes
  }
  get finished(): boolean {
    return this.done || this.failed
  }
  get current(): NoteTarget | undefined {
    return this.targets[this.index]
  }

  push(midi: number): PushResult {
    if (this.finished) return 'over'
    if (matchesTarget(midi, this.targets[this.index])) {
      this.hits.push(midi)
      this.index++
      return 'hit'
    }
    this.mistakes++
    this.wrong.push(midi)
    return 'miss'
  }
}

// ---------- lesson "playIt" blocks ----------

export interface ParsedPlayIt {
  targets: NoteTarget[]
  positions: FretPos[][]
  /** MIDI notes to play for "hear it" (octave-less targets are placed ascending) */
  audible: number[]
}

/** Turn a playIt block's note strings ("A2", "G") into targets. Throws on a bad note name. */
export function parsePlayIt(notes: string[], octaveAgnostic = false): ParsedPlayIt {
  const targets: NoteTarget[] = []
  const positions: FretPos[][] = []
  const audible: number[] = []
  let prevPos: FretPos | undefined
  let prevMidi = -1
  for (const s of notes) {
    const n = parseNote(s)
    const pc = mod(noteMidi({ ...n, octave: 4 }), 12)
    const label = noteName(n)
    if (n.octave !== undefined) {
      const m = noteMidi(n)
      audible.push(m)
      const p = bestPosition(m, prevPos)
      if (p) prevPos = p
      targets.push({ pc, label, midis: octaveAgnostic ? undefined : [m] })
      positions.push(octaveAgnostic ? positionsOf(pc, 0, 12) : p ? [p] : [])
      prevMidi = m
    } else {
      let m = prevMidi < 0 ? lowestMidi(pc) : prevMidi + 1
      while (mod(m, 12) !== pc) m++
      audible.push(m)
      targets.push({ pc, label })
      positions.push(positionsOf(pc, 0, 12))
      prevMidi = m
    }
  }
  return { targets, positions, audible }
}

export type MarkMode = 'hidden' | 'hints' | 'reveal'

/**
 * Fretboard marks for a sequence: notes already played, the current one, the rest.
 * 'hidden' shows only what was played, 'hints' also draws the upcoming notes, 'reveal' shows everything (after success / give-up).
 */
export function sequenceMarks(positions: FretPos[][], labels: string[], index: number, mode: MarkMode): FretMark[] {
  const out = new Map<string, FretMark>()
  positions.forEach((ps, i) => {
    const played = i < index
    if (!played && mode === 'hidden') return
    const color: FretMark['color'] = played ? 'tone' : i === index ? 'accent' : mode === 'reveal' ? 'accent' : 'ghost'
    for (const p of ps) {
      const k = posKey(p)
      const prev = out.get(k)
      if (prev && prev.color === 'tone') continue // a played mark wins over later targets on the same spot
      out.set(k, { ...p, color, label: labels[i] })
    }
  })
  return [...out.values()]
}
