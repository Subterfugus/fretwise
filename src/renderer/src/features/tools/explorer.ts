// Pure helpers behind the fretboard explorer, the dictionary and the looper's improvisation fretboard.
import type { FretMark } from '@/content/types'
import { LabelMode, chordToneMarks, scaleMarks } from '@/content/helpers'
import { CHORDS, ChordType, buildChord } from '@/theory/chords'
import { CagedForm, FretPos, cagedShape, pcAt, posKey, scaleBox } from '@/theory/guitar'
import { Note, mod, noteName, pitchClass } from '@/theory/notes'
import { MODE_ORDER, SCALES, ScaleType, buildScale, degreeLabels, scaleSemitones, stepPattern } from '@/theory/scales'
import { isMinorish, rootName } from './names'

export type PositionFilter =
  | { kind: 'all' }
  | { kind: 'caged'; form: CagedForm }
  | { kind: 'box'; degree: number; frets?: [number, number] }
  | { kind: 'window'; lo: number; hi: number }

export interface ExplorerSpec {
  mode: 'scale' | 'chord'
  rootPc: number
  scale: ScaleType
  chord: ChordType
  label: LabelMode
  maxFret: number
  position: PositionFilter
}

/** Spelled root for the current selection (flats for major-ish, sharps for some minor roots). */
export function explorerRoot(spec: Pick<ExplorerSpec, 'mode' | 'rootPc' | 'scale' | 'chord'>): string {
  const ivs = spec.mode === 'scale' ? SCALES[spec.scale].intervals : CHORDS[spec.chord].intervals
  return rootName(spec.rootPc, isMinorish(ivs))
}

/** Fret window [lo, hi] around the CAGED shape of the root's major chord. */
export function cagedWindow(root: string, form: CagedForm): [number, number] {
  const frets = cagedShape(root, form).frets.filter((f): f is number => f !== null)
  const fretted = frets.filter((f) => f > 0)
  const minF = fretted.length ? Math.min(...fretted) : 0
  const maxF = fretted.length ? Math.max(...fretted) : 0
  const lo = minF <= 1 || frets.includes(0) ? 0 : minF - 1
  return [lo, Math.max(maxF + 1, lo + 4)]
}

/** Number of 3-per-string (or pentatonic 2-per-string) boxes for a scale = its note count. */
export const boxCount = (type: ScaleType): number => SCALES[type].intervals.length

/** Octave copies (-12, 0, +12) of a set of positions that fit on a neck of `maxFret` frets. */
function withOctaves(ps: FretPos[], maxFret: number): Set<string> {
  const keys = new Set<string>()
  for (const p of ps) for (const d of [-12, 0, 12]) if (p.fret + d >= 0 && p.fret + d <= maxFret) keys.add(posKey({ string: p.string, fret: p.fret + d }))
  return keys
}

export function filterMarks(marks: FretMark[], root: string, type: ScaleType | null, pos: PositionFilter, maxFret: number): FretMark[] {
  switch (pos.kind) {
    case 'all':
      return marks
    case 'window':
      return marks.filter((m) => m.fret >= Math.min(pos.lo, pos.hi) && m.fret <= Math.max(pos.lo, pos.hi))
    case 'caged': {
      const [lo, hi] = cagedWindow(root, pos.form)
      return marks.filter((m) => (m.fret >= lo && m.fret <= hi) || (m.fret >= lo + 12 && m.fret <= hi + 12))
    }
    case 'box': {
      if (!type) return marks
      const keys = withOctaves(scaleBox(root, type, pos.degree % boxCount(type)), maxFret)
      return marks.filter((m) => keys.has(posKey(m)) && (!pos.frets || m.fret >= Math.min(...pos.frets) && m.fret <= Math.max(...pos.frets)))
    }
  }
}

export function explorerMarks(spec: ExplorerSpec): FretMark[] {
  const root = explorerRoot(spec)
  const frets: [number, number] = [0, spec.maxFret]
  if (spec.mode === 'scale') {
    return filterMarks(scaleMarks(root, spec.scale, { frets, label: spec.label }), root, spec.scale, spec.position, spec.maxFret)
  }
  return filterMarks(chordToneMarks(root, spec.chord, frets, spec.label), root, null, spec.position, spec.maxFret)
}

export interface ExplorerInfo {
  title: string
  notes: string[]
  formula: string
  steps?: string
  feel?: string
}

export function explorerInfo(spec: ExplorerSpec): ExplorerInfo {
  const root = explorerRoot(spec)
  if (spec.mode === 'scale') {
    const def = SCALES[spec.scale]
    return {
      title: `${root} ${def.name}`,
      notes: buildScale(root, spec.scale).map(noteName),
      formula: degreeLabels(spec.scale).join(' '),
      steps: stepPattern(spec.scale),
      feel: def.feel
    }
  }
  const def = CHORDS[spec.chord]
  return { title: `${root}${def.symbol} (${root} ${def.name})`, notes: buildChord(root, spec.chord).map(noteName), formula: def.formula }
}

// ---------- related modes ----------

const MODE_SEARCH: ScaleType[] = [
  ...MODE_ORDER,
  'harmonicMinor',
  'melodicMinor',
  'lydianDominant',
  'altered',
  'phrygianDominant',
  'majorPentatonic',
  'minorPentatonic',
  'wholeTone',
  'diminishedHW',
  'diminishedWH',
  'blues',
  'majorBlues'
]

export interface RelatedMode {
  /** 1-based degree of the parent scale this mode starts on. */
  degree: number
  root: string
  type: ScaleType | null
}

/** Every rotation of a scale (same notes, new tonic), named when it matches a known scale. */
export function relatedModes(root: Note | string, type: ScaleType): RelatedMode[] {
  const notes = buildScale(root, type)
  const pcs = notes.map(pitchClass)
  return notes.map((n, i) => {
    const rel = pcs.map((pc) => mod(pc - pcs[i], 12)).sort((a, b) => a - b)
    const match = MODE_SEARCH.find((t) => {
      const s = scaleSemitones(t).map((x) => mod(x, 12)).sort((a, b) => a - b)
      return s.length === rel.length && s.every((v, k) => v === rel[k])
    })
    return { degree: i + 1, root: noteName(n), type: match ?? null }
  })
}

// ---------- looper improvisation view ----------

/** Chord tones (root orange, others accent) over faint scale notes (ghost). */
export function improvMarks(chordRoot: string, chordType: ChordType, scaleRoot: string | null, scaleType: ScaleType | null, label: LabelMode, maxFret: number): FretMark[] {
  const frets: [number, number] = [0, maxFret]
  const chord = chordToneMarks(chordRoot, chordType, frets, label).map((m) => ({ ...m, color: m.color === 'root' ? ('root' as const) : ('accent' as const) }))
  if (!scaleRoot || !scaleType) return chord
  const have = new Set(chord.map(posKey))
  const chordPcs = new Set(buildChord(chordRoot, chordType).map(pitchClass))
  const scale = scaleMarks(scaleRoot, scaleType, { frets, label: label === 'degree' || label === 'interval' ? 'note' : label })
    .filter((m) => !have.has(posKey(m)) && !chordPcs.has(pcAt(m)))
    .map((m) => ({ ...m, color: 'ghost' as const }))
  return [...scale, ...chord]
}
