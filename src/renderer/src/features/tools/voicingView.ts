// Pure helpers for displaying chord voicings: per-string tone labels and neck-position regions.
// Regions come from chordLibrary.positionRegions (single source of truth). voicingTones adds per-string
// detail the UI needs (midi, bass/root flags, fingers) on top of the same spelling rules as voicingNoteNames.
import { CHORDS, ChordType, buildChord } from '@/theory/chords'
import type { ChordShape } from '@/theory/guitar'
import { midiAt } from '@/theory/guitar'
import { mod, noteName, pcName, pitchClass } from '@/theory/notes'
import { intervalToDegree } from '@/theory/scales'
import type { LibraryVoicing } from './chordLibrary'
import { positionRegions, regionOf } from './chordLibrary'

export interface VoicingTone {
  /** 1 = high E ... 6 = low E */
  string: number
  fret: number
  midi: number
  pc: number
  /** deliberately spelled chord-tone name (e.g. F#), or a neutral name for a non-chord tone */
  note: string
  /** degree label relative to the root: "1", "♭3", "5", "9" ... */
  degree: string
  finger: number | null
  isRoot: boolean
  isBass: boolean
}

const SEMI_DEGREE = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']

/** Per-sounding-string tones (low string first). The lowest MIDI pitch is flagged as the bass. */
export function voicingTones(root: string, type: ChordType, shape: ChordShape): VoicingTone[] {
  const rootPc = pitchClass(root)
  const tones = buildChord(root, type)
  const byPc = new Map<number, { note: string; degree: string }>()
  tones.forEach((n, i) => {
    const pc = pitchClass(n)
    if (!byPc.has(pc)) byPc.set(pc, { note: noteName(n), degree: intervalToDegree(CHORDS[type].intervals[i]) })
  })
  const out: VoicingTone[] = []
  shape.frets.forEach((fret, i) => {
    if (fret === null) return
    const string = 6 - i
    const m = midiAt({ string, fret })
    const pc = mod(m, 12)
    const hit = byPc.get(pc)
    const f = shape.fingers?.[i]
    out.push({
      string,
      fret,
      midi: m,
      pc,
      note: hit?.note ?? pcName(pc),
      degree: hit?.degree ?? SEMI_DEGREE[mod(pc - rootPc, 12)],
      finger: f ? f : null,
      isRoot: pc === rootPc,
      isBass: false
    })
  })
  if (out.length) {
    const low = Math.min(...out.map((t) => t.midi))
    for (const t of out) t.isBass = t.midi === low
  }
  return out
}

// ---------- regions ----------
export interface VoicingRegion {
  id: string
  label: string
  /** fret columns covered by this region (for the header) */
  lo: number
  hi: number
  voicings: LibraryVoicing[]
}

/** Group voicings by neck region (the library's positionRegions, keyed on `position`). Empty regions are omitted. Input order is preserved inside a region. */
export function groupByRegion(list: LibraryVoicing[]): VoicingRegion[] {
  return positionRegions
    .map((r) => ({
      id: `r${r.min}`,
      label: r.min === 0 ? 'Open position, frets 0–4' : `Frets ${r.min}–${r.max}`,
      lo: r.min,
      hi: r.max,
      voicings: list.filter((v) => regionOf(v.position).id === r.id)
    }))
    .filter((r) => r.voicings.length > 0)
}

/** Text like "x 3 2 0 1 0" for a shape (low E first). */
export const fretText = (shape: ChordShape): string => shape.frets.map((f) => (f === null ? 'x' : f)).join(' ')

/** Plain-language list of what is left out: "no 5th". */
export function omittedText(omitted: string[]): string {
  return omitted.length ? 'no ' + omitted.join(', ') : ''
}
