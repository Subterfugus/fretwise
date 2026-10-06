import type { SeqEvent } from '@/audio/engine'
import type { FretMark } from '@/content/types'
import { pcAt } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import { SCALES, degreeLabels, scaleNames, scaleSemitones, type ScaleType } from '@/theory/scales'
import { isMinorish, rootName } from './names'

export type ComparisonGroup = 'shared' | 'a' | 'b'
export type ComparisonView = 'overlay' | 'differences' | 'a' | 'b'
export type ComparisonLabels = 'note' | 'a' | 'b' | 'none'
export interface ComparisonConfig {
  rootPc: number
  /** Legacy saves omit B's root and use rootPc for both sides. */
  rootBPc?: number
  sameRoot?: boolean
  tonicReference?: boolean
  a: ScaleType
  b: ScaleType
  view: ComparisonView
  labels: ComparisonLabels
  frets: [number, number]
  bpm: number
  octave: number
  upAndBack: boolean
}
export const DEFAULT_COMPARISON: ComparisonConfig = {
  rootPc: 9, rootBPc: 9, sameRoot: true, tonicReference: true,
  a: 'major', b: 'naturalMinor', view: 'overlay', labels: 'note',
  frets: [0, 12], bpm: 100, octave: 3, upAndBack: false
}
export const COMPARISON_PAIRS: { id: string; label: string; a: ScaleType; b: ScaleType; rootBOffset?: number }[] = [
  { id: 'major-minor', label: 'Major / natural minor', a: 'major', b: 'naturalMinor' },
  { id: 'pent-blues', label: 'Minor pentatonic / blues', a: 'minorPentatonic', b: 'blues' },
  { id: 'minor-harmonic', label: 'Natural / harmonic minor', a: 'naturalMinor', b: 'harmonicMinor' },
  { id: 'minor-melodic', label: 'Natural / melodic minor', a: 'naturalMinor', b: 'melodicMinor' },
  { id: 'dorian-aeolian', label: 'Dorian / Aeolian', a: 'dorian', b: 'aeolian' },
  { id: 'major-lydian', label: 'Major / Lydian', a: 'major', b: 'lydian' },
  { id: 'relative-minor', label: 'Major / relative minor', a: 'major', b: 'naturalMinor', rootBOffset: 9 },
  { id: 'relative-dorian', label: 'Major / relative Dorian', a: 'major', b: 'dorian', rootBOffset: 2 }
]

export const comparisonRootB = (config: ComparisonConfig): number => config.rootBPc ?? config.rootPc
export const comparisonSameRoot = (config: ComparisonConfig): boolean => config.sameRoot ?? config.rootPc === comparisonRootB(config)

export function comparisonPreset(config: ComparisonConfig, id: string): ComparisonConfig {
  const pair = COMPARISON_PAIRS.find((p) => p.id === id)
  return pair ? { ...config, a: pair.a, b: pair.b, rootBPc: mod(config.rootPc + (pair.rootBOffset ?? 0), 12), sameRoot: !pair.rootBOffset } : config
}

export function swapComparison(config: ComparisonConfig): ComparisonConfig {
  return { ...config, rootPc: comparisonRootB(config), rootBPc: config.rootPc, a: config.b, b: config.a }
}

export function validComparisonConfig(raw: unknown): raw is ComparisonConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const c = raw as Record<string, unknown>
  const integer = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
  return integer(c.rootPc, 0, 11) &&
    (!Object.hasOwn(c, 'rootBPc') || integer(c.rootBPc, 0, 11)) &&
    (!Object.hasOwn(c, 'sameRoot') || typeof c.sameRoot === 'boolean') &&
    (!Object.hasOwn(c, 'tonicReference') || typeof c.tonicReference === 'boolean') &&
    (c.sameRoot !== true || c.rootBPc === undefined || c.rootBPc === c.rootPc) &&
    (c.sameRoot !== false || c.rootBPc !== undefined) &&
    typeof c.a === 'string' && Object.hasOwn(SCALES, c.a) &&
    typeof c.b === 'string' && Object.hasOwn(SCALES, c.b) &&
    ['overlay', 'differences', 'a', 'b'].includes(c.view as string) && ['note', 'a', 'b', 'none'].includes(c.labels as string) &&
    Array.isArray(c.frets) && c.frets.length === 2 && c.frets.every((f) => integer(f, 0, 22)) && c.frets[0] <= c.frets[1] &&
    integer(c.bpm, 60, 180) && integer(c.octave, 2, 4) && typeof c.upAndBack === 'boolean'
}

export interface ComparisonTone { pc: number; note: string; degree: string }
export interface ComparisonPitch { pc: number; offset: number; a?: ComparisonTone; b?: ComparisonTone; group: ComparisonGroup }
export interface ScaleComparison {
  root: string
  rootPc: number
  rootA: string
  rootB: string
  rootAPc: number
  rootBPc: number
  tonesA: ComparisonTone[]
  tonesB: ComparisonTone[]
  pitches: ComparisonPitch[]
  shared: ComparisonPitch[]
  onlyA: ComparisonPitch[]
  onlyB: ComparisonPitch[]
}

/** Compare sounding pitch classes, not spelling or degree labels. */
export function compareScales(rootPc: number, a: ScaleType, b: ScaleType, rootBPc = rootPc): ScaleComparison {
  const rootA = rootName(rootPc, isMinorish(SCALES[a].intervals))
  const rootB = mod(rootPc, 12) === mod(rootBPc, 12) ? rootA : rootName(rootBPc, isMinorish(SCALES[b].intervals))
  const tones = (root: string, type: ScaleType): ComparisonTone[] => {
    const degrees = degreeLabels(type)
    return scaleNames(root, type).map((note, i) => ({ pc: pitchClass(note), note, degree: degrees[i] }))
  }
  const tonesA = tones(rootA, a), tonesB = tones(rootB, b)
  const pcs = new Set([...tonesA, ...tonesB].map((t) => t.pc))
  const pitches = [...pcs].map((pc): ComparisonPitch => {
    const toneA = tonesA.find((t) => t.pc === pc), toneB = tonesB.find((t) => t.pc === pc)
    return { pc, offset: mod(pc - rootPc, 12), a: toneA, b: toneB, group: toneA && toneB ? 'shared' : toneA ? 'a' : 'b' }
  }).sort((x, y) => x.offset - y.offset)
  return { root: rootA, rootPc: mod(rootPc, 12), rootA, rootB, rootAPc: mod(rootPc, 12), rootBPc: mod(rootBPc, 12), tonesA, tonesB, pitches,
    shared: pitches.filter((p) => p.group === 'shared'), onlyA: pitches.filter((p) => p.group === 'a'), onlyB: pitches.filter((p) => p.group === 'b') }
}

export function comparisonMarks(comparison: ScaleComparison, config: Pick<ComparisonConfig, 'view' | 'labels' | 'frets'>): FretMark[] {
  const visible = comparison.pitches.filter((p) => config.view === 'overlay' ||
    config.view === 'differences' && p.group !== 'shared' || config.view === 'a' && p.a || config.view === 'b' && p.b)
  const marks: FretMark[] = []
  for (let string = 1; string <= 6; string++) for (let fret = config.frets[0]; fret <= config.frets[1]; fret++) {
    const pos = { string, fret }, pitch = visible.find((p) => p.pc === pcAt(pos))
    if (!pitch) continue
    const tone = config.view === 'b' ? pitch.b! : (pitch.a ?? pitch.b)!
    // Scale labels are deliberate spellings, like the explorer's scale marks.
    marks.push({ ...pos, color: pitch.group === 'shared' ? 'tone' : pitch.group === 'a' ? 'accent' : 'root',
      comparisonTonic: pitch.pc === comparison.rootAPc && pitch.pc === comparison.rootBPc ? 'both' :
        pitch.pc === comparison.rootAPc ? 'a' : pitch.pc === comparison.rootBPc ? 'b' : undefined,
      label: config.labels === 'note' ? tone.note : config.labels === 'a' ? pitch.a?.degree ?? '-' : config.labels === 'b' ? pitch.b?.degree ?? '-' : undefined })
  }
  return marks
}

/** Lift sub-guitar roots by an octave while preserving their pitch class. */
export function comparisonRootMidi(rootPc: number, octave: number): number {
  const base = (octave + 1) * 12 + mod(rootPc, 12)
  return base < 40 ? base + 12 : base
}

/** Each scale starts and resolves at its own sounding tonic. */
export function comparisonSequence(rootPc: number, scale: ScaleType, octave: number, upAndBack: boolean): SeqEvent[] {
  const base = comparisonRootMidi(rootPc, octave)
  const ascending = [...scaleSemitones(scale).map((n) => base + n), base + 12]
  const notes = upAndBack ? [...ascending, ...ascending.slice(0, -1).reverse()] : ascending
  return notes.map((note, i) => ({ notes: [note], beats: i === notes.length - 1 ? 1.5 : 1, mode: 'block' }))
}

/** Use spelled scale intervals so an altered #2 is never treated as a minor third. */
export function tonicReferenceOffsets(intervals: readonly string[]): number[] {
  const has = (iv: string) => intervals.includes(iv)
  if (has('M3') && has('m3')) return [0, 12]
  if (has('M3') && has('P5')) return [0, 4, 7]
  if (has('m3') && has('P5')) return [0, 3, 7]
  if (has('m3') && has('d5')) return [0, 3, 6]
  if (has('M3') && has('A5')) return [0, 4, 8]
  if (!has('M3') && !has('m3') && has('P5')) {
    if (has('P4')) return [0, 5, 7]
    if (has('M2')) return [0, 2, 7]
  }
  return [0, 12]
}

export function comparisonTonicSequence(rootPc: number, scale: ScaleType, octave: number): SeqEvent[] {
  const base = comparisonRootMidi(rootPc, octave)
  return [
    { notes: [base], beats: 1, mode: 'block' },
    { notes: tonicReferenceOffsets(SCALES[scale].intervals).map((n) => base + n), beats: 2, mode: 'block' },
    { notes: [base], beats: 1.5, mode: 'block' }
  ]
}

/** Reference and scale share a cancellable engine session and the selected instrument. */
export function comparisonPlaybackSequence(rootPc: number, scale: ScaleType, octave: number, upAndBack: boolean, reference: boolean): SeqEvent[] {
  return [
    ...(reference ? [...comparisonTonicSequence(rootPc, scale, octave), { notes: [], beats: 0.5 }] : []),
    ...comparisonSequence(rootPc, scale, octave, upAndBack)
  ]
}
