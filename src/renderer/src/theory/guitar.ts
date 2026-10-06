// Guitar-specific theory: tuning, fret <-> note math, chord shapes, CAGED and scale patterns.
// Strings are numbered the guitarist's way: 1 = high E ... 6 = low E.

import { fromMidi, midi, mod, noteName, Note, pcName, pitchClass, toNote } from './notes'
import { ChordType, CHORDS } from './chords'
import { buildScale, ScaleType } from './scales'
import { getNoteNameSetting, spellMidi, spellPc } from './spelling'
import { parseNote } from './notes'

export interface FretPos {
  string: number // 1..6
  fret: number // 0 = open
}

/** MIDI of open strings, indexed by string number - 1 (so [0] = string 1, high E). */
export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]
export const STRING_NAMES = ['E', 'B', 'G', 'D', 'A', 'E'] // string 1..6
export const MAX_FRET = 22

export const openMidi = (string: number, tuning = STANDARD_TUNING): number => tuning[string - 1]
export const midiAt = (p: FretPos, tuning = STANDARD_TUNING): number => openMidi(p.string, tuning) + p.fret
export const pcAt = (p: FretPos, tuning = STANDARD_TUNING): number => mod(midiAt(p, tuning), 12)
export const noteAt = (p: FretPos, preferFlats?: boolean, tuning = STANDARD_TUNING): Note =>
  preferFlats === undefined ? parseNote(spellMidi(midiAt(p, tuning), getNoteNameSetting())) : fromMidi(midiAt(p, tuning), preferFlats)
export const nameAt = (p: FretPos, preferFlats?: boolean, tuning = STANDARD_TUNING): string =>
  preferFlats === undefined ? spellPc(pcAt(p, tuning), getNoteNameSetting()) : pcName(pcAt(p, tuning), preferFlats)

/** Every position of a pitch class (or note name) between fret range (inclusive). */
export function positionsOf(note: number | Note | string, minFret = 0, maxFret = 12, tuning = STANDARD_TUNING): FretPos[] {
  const pc = typeof note === 'number' ? mod(note, 12) : pitchClass(note)
  const out: FretPos[] = []
  for (let s = 1; s <= 6; s++)
    for (let f = minFret; f <= maxFret; f++) if (pcAt({ string: s, fret: f }, tuning) === pc) out.push({ string: s, fret: f })
  return out
}

/** Positions playing an exact pitch (with octave). */
export function positionsOfPitch(note: Note | string, maxFret = MAX_FRET, tuning = STANDARD_TUNING): FretPos[] {
  const m = midi(note)
  const out: FretPos[] = []
  for (let s = 1; s <= 6; s++) {
    const f = m - openMidi(s, tuning)
    if (f >= 0 && f <= maxFret) out.push({ string: s, fret: f })
  }
  return out
}

// ---------- Chord shapes ----------

export interface ChordShape {
  name: string
  /** Low E (string 6) -> high E (string 1); null = muted */
  frets: (number | null)[]
  /** Fingering, same order; 0 = open/none, 'T' thumb shown as 5 */
  fingers?: (number | null)[]
  /** Fret where a barre is played, if any */
  barre?: number
}

/**
 * Build a shape from tab-ish text, low E first: "x32010", or space separated
 * when frets go past 9: "x 10 12 12 12 10". Optional finger string the same way.
 */
export function shape(name: string, frets: string, fingers?: string, barre?: number): ChordShape {
  const parse = (s: string, thumb = false) =>
    (s.includes(' ') ? s.trim().split(/\s+/) : s.split('')).map((t) =>
      t === 'x' || t === 'X' ? null : thumb && (t === 'T' || t === 't') ? 5 : Number(t)
    )
  const out: ChordShape = { name, frets: parse(frets) }
  if (out.frets.length !== 6) throw new Error(`Shape ${name} must have 6 strings: ${frets}`)
  if (fingers) out.fingers = parse(fingers, true)
  if (barre !== undefined) out.barre = barre
  return out
}

export function shapePositions(s: ChordShape): FretPos[] {
  const out: FretPos[] = []
  s.frets.forEach((f, i) => {
    if (f !== null) out.push({ string: 6 - i, fret: f })
  })
  return out
}

/** Sounding MIDI notes, low to high (strum order). */
export const shapeMidis = (s: ChordShape): number[] => shapePositions(s).map((p) => midiAt(p))

/** Sounding MIDI notes of a shape in any tuning, with an optional capo (shape frets are relative to the capo). Takes extra args, so don't pass it straight to .map(). */
export const shapeMidisIn = (s: ChordShape, tuning: readonly number[] = STANDARD_TUNING, capo = 0): number[] =>
  shapePositions(s).map((p) => midiAt(p, tuning as number[]) + capo)

export const shapeNoteNames = (s: ChordShape, preferFlats = false, tuning = STANDARD_TUNING, capo = 0): string[] =>
  shapePositions(s).map((p) => (capo ? pcName(pcAt(p, tuning) + capo, preferFlats) : nameAt(p, preferFlats, tuning)))

export const OPEN_CHORDS: Record<string, ChordShape> = {
  C: shape('C', 'x32010', 'x32010'),
  A: shape('A', 'x02220', 'x01230'),
  G: shape('G', '320003', '210003'),
  E: shape('E', '022100', '023100'),
  D: shape('D', 'xx0232', 'xx0132'),
  Am: shape('Am', 'x02210', 'x02310'),
  Em: shape('Em', '022000', '023000'),
  Dm: shape('Dm', 'xx0231', 'xx0231'),
  F: shape('F', '133211', '134211', 1),
  Bm: shape('Bm', 'x24432', 'x13421', 2),
  'C7': shape('C7', 'x32310', 'x32410'),
  'A7': shape('A7', 'x02020', 'x02030'),
  'G7': shape('G7', '320001', '320001'),
  'E7': shape('E7', '020100', '020100'),
  'D7': shape('D7', 'xx0212', 'xx0213'),
  'B7': shape('B7', 'x21202', 'x21304'),
  Cmaj7: shape('Cmaj7', 'x32000', 'x32000'),
  Amaj7: shape('Amaj7', 'x02120', 'x02130'),
  Dmaj7: shape('Dmaj7', 'xx0222', 'xx0111'),
  Fmaj7: shape('Fmaj7', 'xx3210', 'xx3210'),
  Gmaj7: shape('Gmaj7', '3x443x', '2x341x'),
  Emaj7: shape('Emaj7', '021100', '031200'),
  Am7: shape('Am7', 'x02010', 'x02010'),
  Em7: shape('Em7', '022030', '012040'),
  Dm7: shape('Dm7', 'xx0211', 'xx0211'),
  Asus2: shape('Asus2', 'x02200', 'x01200'),
  Asus4: shape('Asus4', 'x02230', 'x01230'),
  Dsus2: shape('Dsus2', 'xx0230', 'xx0130'),
  Dsus4: shape('Dsus4', 'xx0233', 'xx0134'),
  Esus4: shape('Esus4', '022200', '023400'),
  Cadd9: shape('Cadd9', 'x32030', 'x21030'),
  E5: shape('E5', '022xxx', '011xxx'),
  A5: shape('A5', 'x022xx', 'x011xx')
}

// Movable shapes rooted on string 6 (E-form) or 5 (A-form), as fret offsets from the root fret.
const E_FORMS: Partial<Record<ChordType, number[]>> = {
  maj: [0, 2, 2, 1, 0, 0],
  min: [0, 2, 2, 0, 0, 0],
  dom7: [0, 2, 0, 1, 0, 0],
  maj7: [0, -99, 1, 1, 0, -99],
  min7: [0, 2, 0, 0, 0, 0],
  m7b5: [0, -99, 0, 0, -1, -99],
  dim7: [0, -99, -1, 0, -1, -99],
  power: [0, 2, 2, -99, -99, -99],
  sus4: [0, 2, 2, 2, 0, 0]
}
const A_FORMS: Partial<Record<ChordType, number[]>> = {
  maj: [-99, 0, 2, 2, 2, 0],
  min: [-99, 0, 2, 2, 1, 0],
  dom7: [-99, 0, 2, 0, 2, 0],
  maj7: [-99, 0, 2, 1, 2, 0],
  min7: [-99, 0, 2, 0, 1, 0],
  m7b5: [-99, 0, 1, 0, 1, -99],
  dim7: [-99, 0, 1, -1, 1, -99],
  power: [-99, 0, 2, 2, -99, -99],
  sus2: [-99, 0, 2, 2, 0, 0],
  sus4: [-99, 0, 2, 2, 3, 0],
  dom9: [-99, 0, -1, 0, 0, 0]
}

/** A barre/movable chord with its root on string 6 or 5. Returns null if no such form. */
export function movableChord(root: Note | string, type: ChordType, rootString: 5 | 6, minFret = 1): ChordShape | null {
  const forms = rootString === 6 ? E_FORMS : A_FORMS
  const offs = forms[type]
  if (!offs) return null
  let rf = mod(pitchClass(root) - pcAt({ string: rootString, fret: 0 }), 12)
  while (rf + Math.min(...offs.filter((o) => o > -99)) < minFret) rf += 12
  const frets = offs.map((o) => (o === -99 ? null : rf + o))
  // Only mark a barre when the index finger really lies across the neck: it holds the
  // root and also the high E string (so E-form maj7 / m7♭5 grips aren't drawn barred).
  const barred = frets[5] === rf && frets.filter((f) => f === rf).length >= 2
  return { name: noteName(root) + CHORDS[type].symbol, frets, barre: barred ? rf : undefined }
}

// ---------- CAGED ----------

export type CagedForm = 'C' | 'A' | 'G' | 'E' | 'D'
export const CAGED_ORDER: CagedForm[] = ['C', 'A', 'G', 'E', 'D']

const CAGED_TEMPLATES: Record<CagedForm, { root: string; frets: string }> = {
  C: { root: 'C', frets: 'x32010' },
  A: { root: 'A', frets: 'x02220' },
  G: { root: 'G', frets: '320003' },
  E: { root: 'E', frets: '022100' },
  D: { root: 'D', frets: 'xx0232' }
}

/** Major chord `root` played with the given CAGED form, placed lowest on the neck (open if possible). */
export function cagedShape(root: Note | string, form: CagedForm): ChordShape {
  const t = CAGED_TEMPLATES[form]
  const shift = mod(pitchClass(root) - pitchClass(t.root), 12)
  const base = shape('', t.frets)
  const frets = base.frets.map((f) => (f === null ? null : f + shift))
  return { name: `${noteName(root)} (${form} shape)`, frets, barre: realBarre(frets, shift) }
}

/**
 * The fret of a genuine barre, or undefined. The index finger lies across the lowest
 * fretted fret, so it needs >= 2 strings there with every string in between fretted at or
 * above it (a moved D shape "x x 10 12 13 12" has a single string on its lowest fret: no barre).
 */
export function realBarre(frets: (number | null)[], lowest: number): number | undefined {
  if (lowest <= 0) return undefined
  const idx = frets.map((f, i) => (f === lowest ? i : -1)).filter((i) => i >= 0)
  if (idx.length < 2) return undefined
  const span = frets.slice(idx[0], idx[idx.length - 1] + 1)
  return span.every((f) => f !== null && f >= lowest) ? lowest : undefined
}

/** All five CAGED shapes for a major chord, ordered up the neck. */
export function cagedSequence(root: Note | string): { form: CagedForm; shape: ChordShape }[] {
  return CAGED_ORDER.map((form) => ({ form, shape: cagedShape(root, form) })).sort(
    (a, b) => Math.min(...(a.shape.frets.filter((f) => f !== null) as number[])) - Math.min(...(b.shape.frets.filter((f) => f !== null) as number[]))
  )
}

// ---------- Scale patterns ----------

/** Every position on the neck belonging to the scale. */
export function scalePositions(root: Note | string, type: ScaleType, minFret = 0, maxFret = 15): FretPos[] {
  const pcs = new Set(buildScale(root, type).map(pitchClass))
  const out: FretPos[] = []
  for (let s = 1; s <= 6; s++)
    for (let f = minFret; f <= maxFret; f++) if (pcs.has(pcAt({ string: s, fret: f }))) out.push({ string: s, fret: f })
  return out
}

/**
 * A box pattern: starting from scale degree `startDegree` (0-based) on string 6,
 * play `perString` notes on each string ascending. 2 per string on a pentatonic
 * gives the classic five boxes; 3 per string on a 7-note scale gives 3NPS patterns.
 */
export function scaleBox(root: Note | string, type: ScaleType, startDegree = 0, perString?: number): FretPos[] {
  const scale = buildScale(toNote(root), type).map(pitchClass)
  const nps = perString ?? (scale.length <= 5 ? 2 : 3)
  const startPc = scale[startDegree % scale.length]
  let m = 40 + mod(startPc - 4, 12)
  // collect ascending scale midis from m
  const notes: number[] = []
  const pcset = new Set(scale)
  for (let x = m; notes.length < nps * 6; x++) if (pcset.has(mod(x, 12))) notes.push(x)
  let out: FretPos[] = []
  for (let i = 0; i < 6; i++) {
    const s = 6 - i
    for (let k = 0; k < nps; k++) out.push({ string: s, fret: notes[i * nps + k] - openMidi(s) })
  }
  if (out.some((p) => p.fret < 0)) out = out.map((p) => ({ ...p, fret: p.fret + 12 }))
  return out
}

/** Five pentatonic boxes (minor pentatonic numbering: box 1 starts on the root). */
export function pentatonicBoxes(root: Note | string, minor = true): FretPos[][] {
  const type: ScaleType = minor ? 'minorPentatonic' : 'majorPentatonic'
  return [0, 1, 2, 3, 4].map((d) => scaleBox(root, type, d, 2))
}

export const posKey = (p: FretPos): string => `${p.string}:${p.fret}`
export const samePos = (a: FretPos, b: FretPos): boolean => a.string === b.string && a.fret === b.fret
