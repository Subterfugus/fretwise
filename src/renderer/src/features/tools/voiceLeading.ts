import { CHORDS, buildChord, type ChordType } from '@/theory/chords'
import { MAX_FRET, midiAt } from '@/theory/guitar'
import { noteName, pitchClass } from '@/theory/notes'
import { chordLibrary, filterLibrary, type LibraryVoicing } from './chordLibrary'

export interface VoiceLeadingOptions {
  /** Exact sounding strings, ascending (1 = high E), with three or four voices. */
  strings: number[]
  /** Inclusive bounds for every sounding fret, including open strings. */
  fretRange: [number, number]
  startId?: string
}

export const VOICE_LEADING_TYPES = Object.keys(CHORDS) as ChordType[]

type Chord = { root: string; type: ChordType }

function validStrings(strings: unknown): strings is number[] {
  return Array.isArray(strings) && (strings.length === 3 || strings.length === 4) &&
    strings.every((s, i) => Number.isInteger(s) && s >= 1 && s <= 6 && (i === 0 || s > strings[i - 1]))
}

function validOptions(options: VoiceLeadingOptions): boolean {
  return !!options && validStrings(options.strings) && Array.isArray(options.fretRange) &&
    options.fretRange.length === 2 && options.fretRange.every((f) => Number.isInteger(f) && f >= 0 && f <= MAX_FRET) &&
    options.fretRange[0] <= options.fretRange[1]
}

const compareShapes = (a: LibraryVoicing, b: LibraryVoicing): number =>
  a.difficulty - b.difficulty || a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Complete small chords; extended chords retain the dictionary's validated omissions. */
export function voiceLeadingCandidates(chord: Chord, options: VoiceLeadingOptions): LibraryVoicing[] {
  if (!validOptions(options) || !chord || typeof chord.root !== 'string' || !VOICE_LEADING_TYPES.includes(chord.type)) return []
  try {
    const root = noteName(chord.root)
    const expected = new Set(buildChord(root, chord.type).map(pitchClass))
    const extended = expected.size > 4
    if (!extended && expected.size > options.strings.length) return []
    return filterLibrary(chordLibrary(root, chord.type), {
      stringSets: [options.strings.join('-')], fretRange: options.fretRange
    }).filter((v) => {
      if ((!extended && v.omitted.length) || v.strings.length !== options.strings.length || !v.strings.every((s, i) => s === options.strings[i])) return false
      const actual = new Set(v.strings.map((string) => midiAt({ string, fret: v.shape.frets[6 - string]! }) % 12))
      return extended ? [...actual].every((pc) => expected.has(pc)) : actual.size === expected.size && [...expected].every((pc) => actual.has(pc))
    }).sort(compareShapes)
  } catch {
    return []
  }
}

export interface VoiceLeadingMove {
  string: number
  fromFret: number
  toFret: number
  fromMidi: number
  toMidi: number
  /** Signed movement; positive rises in pitch. */
  semitones: number
}

function validVoicing(v: LibraryVoicing): boolean {
  return !!v && validStrings(v.strings) && !!v.shape && Array.isArray(v.shape.frets) && v.shape.frets.length === 6 &&
    v.shape.frets.every((f, i) => v.strings.includes(6 - i)
      ? Number.isInteger(f) && f !== null && f >= 0 && f <= MAX_FRET : f === null)
}

/** Voices remain on their original strings. Held means the exact MIDI pitch is retained. */
export function voiceLeadingTransition(from: LibraryVoicing, to: LibraryVoicing): {
  moves: VoiceLeadingMove[]; movement: number; held: number
} {
  if (!validVoicing(from) || !validVoicing(to) || !from.strings.every((s, i) => s === to.strings[i]) || from.strings.length !== to.strings.length) {
    return { moves: [], movement: 0, held: 0 }
  }
  const moves = from.strings.map((string) => {
    const fromFret = from.shape.frets[6 - string]!
    const toFret = to.shape.frets[6 - string]!
    const fromMidi = midiAt({ string, fret: fromFret })
    const toMidi = midiAt({ string, fret: toFret })
    return { string, fromFret, toFret, fromMidi, toMidi, semitones: toMidi - fromMidi }
  })
  return {
    moves,
    movement: moves.reduce((sum, move) => sum + Math.abs(move.semitones), 0),
    held: moves.filter((move) => move.fromMidi === move.toMidi).length
  }
}

interface PathState {
  movement: number
  difficulty: number
  previous: number
  rank: number
}

/** Globally minimizes summed same-string movement, then summed difficulty and stable shape order. */
export function voiceLeadingPath(chords: Chord[], options: VoiceLeadingOptions): {
  voicings: LibraryVoicing[]; totalMovement: number; missing: number[]
} {
  if (!Array.isArray(chords) || !chords.length) return { voicings: [], totalMovement: 0, missing: [] }
  const layers = Array.from(chords, (chord) => voiceLeadingCandidates(chord, options))
  const missing = layers.flatMap((layer, i) => layer.length ? [] : [i])
  if (missing.length) return { voicings: [], totalMovement: 0, missing }
  const start = layers[0].find((v) => v.id === options.startId)
  if (start) layers[0] = [start]
  const history: PathState[][] = [layers[0].map((v, rank) => ({
    movement: 0, difficulty: Math.round(v.difficulty * 100), previous: -1, rank
  }))]
  for (let step = 1; step < layers.length; step++) {
    const previous = history[step - 1]
    const states = layers[step].map((to): PathState => {
      let best: PathState = { movement: Infinity, difficulty: Infinity, previous: -1, rank: 0 }
      for (let i = 0; i < previous.length; i++) {
        // Standard tuning is unchanged, so MIDI differences equal fret differences on each string.
        const movement = previous[i].movement + options.strings.reduce((sum, string) =>
          sum + Math.abs(to.shape.frets[6 - string]! - layers[step - 1][i].shape.frets[6 - string]!), 0)
        const difficulty = previous[i].difficulty + Math.round(to.difficulty * 100)
        if (movement < best.movement || (movement === best.movement && (difficulty < best.difficulty ||
          (difficulty === best.difficulty && previous[i].rank < previous[best.previous]?.rank)))) {
          best = { movement, difficulty, previous: i, rank: 0 }
        }
      }
      return best
    })
    // Rank complete prefixes lexicographically without storing or comparing every full path.
    states.map((_, i) => i).sort((a, b) =>
      previous[states[a].previous].rank - previous[states[b].previous].rank || a - b
    ).forEach((index, rank) => { states[index].rank = rank })
    history.push(states)
  }
  const last = history[history.length - 1]
  let index = 0
  for (let i = 1; i < last.length; i++) {
    if (last[i].movement < last[index].movement || (last[i].movement === last[index].movement &&
      (last[i].difficulty < last[index].difficulty || (last[i].difficulty === last[index].difficulty && last[i].rank < last[index].rank)))) index = i
  }
  const totalMovement = last[index].movement
  const voicings: LibraryVoicing[] = Array(layers.length)
  for (let step = layers.length - 1; step >= 0; step--) {
    voicings[step] = layers[step][index]
    index = history[step][index].previous
  }
  return { voicings, totalMovement, missing: [] }
}
