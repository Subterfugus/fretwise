import { CHORDS, buildChord, chordSymbol, romanFor, type ChordType } from '@/theory/chords'
import { mod, noteName, pitchClass } from '@/theory/notes'
import { buildScale } from '@/theory/scales'
import type { InstrumentId } from '@/audio/engine'
import type { LooperPresetConfig } from '@/state/toolPresets'
import { resolveChordRoot } from './keyDictionary'
import { parseChordName } from './names'
import { keyTonic, parseRoman, progressionChords, type ProgChord } from './progressions'
import { parseVoiceLeadingInput } from './voiceLeadingConfig'

export interface ReharmProgression { romans: string[]; durations: number[] }
export interface ReharmConfig {
  keyPc: number
  minor: boolean
  original: ReharmProgression
  working: ReharmProgression
  bpm: number
  mode: 'block' | 'strum' | 'arpeggio'
  inputMode: 'romans' | 'names'
}
export interface ReharmSuggestion {
  id: string
  kind: 'tritone' | 'secondary' | 'borrowed' | 'twoFive'
  index: number
  title: string
  explanation: string
  result: ReharmProgression
  changedIndices: number[]
}

export const REHARM_PRESETS = [
  { id: 'turnaround', name: 'I - vi - ii - V7 - I', romans: ['I', 'vi', 'ii', 'V7', 'I'], minor: false },
  { id: 'cadence', name: 'I - IV - V - I', romans: ['I', 'IV', 'V', 'I'], minor: false },
  { id: 'jazz', name: 'ii7 - V7 - Imaj7', romans: ['ii7', 'V7', 'Imaj7'], minor: false },
  { id: 'pop', name: 'I - V - vi - IV', romans: ['I', 'V', 'vi', 'IV'], minor: false },
  { id: 'minor', name: 'i - iv - V7 - i', romans: ['i', 'iv', 'V7', 'i'], minor: true },
  { id: 'minorJazz', name: 'ii half-diminished - V7 - i', romans: ['iih7', 'V7', 'i'], minor: true }
]
const defaultProgression = (): ReharmProgression => ({ romans: [...REHARM_PRESETS[0].romans], durations: [4, 4, 4, 4, 4] })
export const DEFAULT_REHARM: ReharmConfig = {
  keyPc: 0, minor: false, original: defaultProgression(), working: defaultProgression(),
  bpm: 90, mode: 'strum', inputMode: 'romans'
}

const integer = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
const duration = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0.25 && v <= 32 && Number.isInteger(v * 4)
function record(v: unknown, fields: string[]): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return (proto === null || proto === Object.prototype) && fields.every((f) => Object.hasOwn(v, f))
}
function validProgression(v: unknown): v is ReharmProgression {
  if (!record(v, ['romans', 'durations'])) return false
  return Array.isArray(v.romans) && v.romans.length >= 1 && v.romans.length <= 64
    && Array.from(v.romans).every((r) => typeof r === 'string' && r.trim() === r && parseVoiceLeadingInput(r).error === null && !/[\s,]/.test(r))
    && Array.isArray(v.durations) && v.durations.length === v.romans.length && Array.from(v.durations).every(duration)
}
export function validReharmConfig(v: unknown): v is ReharmConfig {
  try {
    if (!record(v, ['keyPc', 'minor', 'original', 'working', 'bpm', 'mode', 'inputMode'])) return false
    return integer(v.keyPc, 0, 11) && typeof v.minor === 'boolean' && validProgression(v.original) && validProgression(v.working)
      && integer(v.bpm, 40, 220) && ['block', 'strum', 'arpeggio'].includes(v.mode as string)
      && ['romans', 'names'].includes(v.inputMode as string)
  } catch { return false }
}

const ROOT_DEGREES = [1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7]
const ROOT_ALTERATIONS = ['', 'b', '', 'b', '', '', 'b', '', 'b', '', 'b', '']
const EXTRA_SUFFIXES: Partial<Record<ChordType, string>> = {
  sus2: 'sus2', sus4: 'sus4', power: '5', add9: 'add9', maj6: '6', min6: 'm6', sus7: '7sus4',
  dom9: '9', maj9: 'maj9', min9: 'm9', dom7b9: '7b9', dom7s9: '7#9', dom11: '11', min11: 'm11', dom13: '13', maj7s11: 'maj7#11'
}
/** Degrees stay relative to the major scale even when the key centre is minor. */
function romanAt(keyPc: number, rootPc: number, type: ChordType): string {
  const offset = mod(rootPc - keyPc, 12)
  const degree = ROOT_DEGREES[offset]
  const extra = EXTRA_SUFFIXES[type]
  const numeral = extra === undefined ? romanFor(degree, type) : romanFor(degree, 'maj') + extra
  return ROOT_ALTERATIONS[offset] + numeral
}

export function parseReharmInput(input: string, format: 'romans' | 'names', keyPc: number, minor: boolean, beats = 4): { progression: ReharmProgression | null; error: string | null } {
  const fail = (error: string) => ({ progression: null, error })
  if (!integer(keyPc, 0, 11) || typeof minor !== 'boolean' || !duration(beats)) return fail('Choose a valid key and quarter-beat duration from 0.25 to 32.')
  if (typeof input !== 'string' || !['romans', 'names'].includes(format)) return fail('Choose Roman numerals or chord symbols.')
  if (format === 'romans') {
    if (!input.trim()) return fail('Enter at least one Roman chord.')
    const tokens = input.trim().split(/[\s,]+/)
    if (tokens.length > 64) return fail('Use no more than 64 chords.')
    const materialized: string[] = []
    for (const token of tokens) {
      if (!token) return fail('Invalid empty Roman chord.')
      if (!token.includes('/')) { materialized.push(token); continue }
      const applied = /^(V7?)\/([b#\u266d\u266f]?[ivIV]+)$/.exec(token)
      const target = applied && parseRoman(applied[2])
      if (!applied || !target || !['maj', 'min'].includes(target.type)) return fail(`Invalid applied Roman chord "${token}". Use V/x or V7/x with one major or minor target degree.`)
      const targetRoot = progressionChords(keyTonic(keyPc, minor), [applied[2]])[0].root
      materialized.push(romanAt(keyPc, mod(pitchClass(targetRoot) + 7, 12), applied[1] === 'V7' ? 'dom7' : 'maj'))
    }
    const parsed = parseVoiceLeadingInput(materialized.join(' '))
    return parsed.error ? fail(parsed.error) : { progression: { romans: parsed.romans, durations: parsed.romans.map(() => beats) }, error: null }
  }
  const tokens = input.trim().split(/[\s,]+/)
  if (!input.trim()) return fail('Enter at least one chord symbol.')
  if (tokens.length > 64) return fail('Use no more than 64 chords.')
  const romans: string[] = []
  for (const token of tokens) {
    const chord = parseChordName(token)
    if (token.includes('/') && (!chord || chord.type !== 'minMaj7')) return fail(`Slash bass chords are not supported: "${token}".`)
    if (!chord) return fail(`Invalid chord symbol "${token}".`)
    romans.push(romanAt(keyPc, pitchClass(chord.root), chord.type))
  }
  return { progression: { romans, durations: romans.map(() => beats) }, error: null }
}

export function reharmChords(keyPc: number, minor: boolean, progression: ReharmProgression): ProgChord[] {
  try {
    if (!integer(keyPc, 0, 11) || typeof minor !== 'boolean' || !validProgression(progression)) return []
    return progressionChords(keyTonic(keyPc, minor), progression.romans).map((chord) => {
      const root = resolveChordRoot(pitchClass(chord.root), chord.root, chord.type)
      return { ...chord, root, symbol: chordSymbol(root, chord.type) }
    })
  } catch { return [] }
}

const dominant = (type: ChordType): boolean => CHORDS[type].intervals.some((iv) => iv === 'M3') && CHORDS[type].intervals.some((iv) => iv === 'm7')
const targetKind = (type: ChordType): 'major' | 'minor' | null => {
  const ivs: readonly string[] = CHORDS[type].intervals
  if (!ivs.includes('P5')) return null
  return ivs.includes('M3') ? 'major' : ivs.includes('m3') ? 'minor' : null
}
const copy = (p: ReharmProgression): ReharmProgression => ({ romans: [...p.romans], durations: [...p.durations] })
const melodyAdvice = 'Check the melody against the new chord tones; a held note may need a different voicing or colour.'

export function suggestReharmonisations(config: ReharmConfig): ReharmSuggestion[] {
  if (!validReharmConfig(config)) return []
  const { keyPc, minor, working } = config
  const chords = reharmChords(keyPc, minor, working)
  const suggestions: ReharmSuggestion[] = []
  // Include the complete source in each identity so a cached choice cannot match a later edit.
  const sourceId = JSON.stringify([keyPc, minor, working.romans, working.durations])
  function add(kind: ReharmSuggestion['kind'], index: number, roman: string, insert: boolean, title: string, explanation: string) {
    const result = copy(working)
    if (insert) {
      const half = result.durations[index] / 2
      if (result.romans.length >= 64 || !duration(half)) return
      result.romans.splice(index, 0, roman)
      result.durations.splice(index, 1, half, half)
    } else {
      if (result.romans[index] === roman) return
      result.romans[index] = roman
    }
    suggestions.push({ id: JSON.stringify([sourceId, kind, index, roman, insert]), kind, index, title, explanation,
      result, changedIndices: insert ? [index, index + 1] : [index] })
  }
  function symbol(rootPc: number, type: ChordType): string {
    const roman = romanAt(keyPc, rootPc, type)
    return reharmChords(keyPc, minor, { romans: [roman], durations: [4] })[0].symbol
  }
  const tonic = keyTonic(keyPc, minor)
  for (let index = 0; index < chords.length; index++) {
    const chord = chords[index]
    const pc = pitchClass(chord.root)
    const next = chords[index + 1]
    if (dominant(chord.type)) {
      const subPc = mod(pc + 6, 12)
      const sub = symbol(subPc, 'dom7')
      const tones = buildChord(chord.root, chord.type)
      const intervals: readonly string[] = CHORDS[chord.type].intervals
      const third = noteName(tones[intervals.indexOf('M3')])
      const seventh = noteName(tones[intervals.indexOf('m7')])
      const resolves = next && mod(pc - pitchClass(next.root), 12) === 7 && targetKind(next.type)
      const bass = resolves ? `Its root is a semitone above ${next.symbol}, so the bass can descend a half step into that chord.`
        : next ? `The root moves a tritone from ${chord.root}; the following ${next.symbol} is not a usual fifth-down resolution, so audition the new bass connection.`
          : `The root moves a tritone from ${chord.root}; there is no following resolution in this finite progression.`
      add('tritone', index, romanAt(keyPc, subPc, 'dom7'), false, `${chord.symbol} to ${sub}`,
        `${sub} shares the guide-tone pitch classes ${third} and ${seventh} with ${chord.symbol}, with 3rd and flat 7th exchanged enharmonically. ${bass} Extensions and altered fifths are not retained in this dominant seventh substitution. ${melodyAdvice}`)
    }
    // An applied dominant is meaningful only when its next chord can act as a major/minor home.
    if (pc !== keyPc && targetKind(chord.type)) {
      const domPc = mod(pc + 7, 12)
      const prev = chords[index - 1]
      if (!(prev && pitchClass(prev.root) === domPc && dominant(prev.type))) {
        const replace = !!prev && pitchClass(prev.root) === domPc
        const at = replace ? index - 1 : index
        const applied = symbol(domPc, 'dom7')
        const leadingTone = noteName(buildChord(resolveChordRoot(domPc, keyTonic(domPc, false), 'dom7'), 'dom7')[1])
        add('secondary', at, romanAt(keyPc, domPc, 'dom7'), !replace, `${applied} into ${chord.symbol}`,
          `${applied} is V7 of ${chord.roman}: its root is a perfect fifth above ${chord.root}, and its 3rd (${leadingTone}) can rise a semitone to the target root. ${replace ? 'Change the preceding chord on that root to dominant quality.' : 'Share the target slot equally between the dominant and target.'} This briefly tonicizes ${chord.symbol}. ${melodyAdvice}`)
      }
    }
    if (next && (dominant(chord.type) && chord.type !== 'aug7' || chord.type === 'maj') && mod(pc - pitchClass(next.root), 12) === 7 && targetKind(next.type)) {
      const iiPc = mod(pitchClass(next.root) + 2, 12)
      const iiType = targetKind(next.type) === 'minor' ? 'm7b5' : 'min7'
      const prev = chords[index - 1]
      if (!(prev && pitchClass(prev.root) === iiPc && prev.type === iiType)) {
        const ii = symbol(iiPc, iiType)
        add('twoFive', index, romanAt(keyPc, iiPc, iiType), true, `${ii} - ${chord.symbol} into ${next.symbol}`,
          `${ii} is the related ${iiType === 'm7b5' ? 'half-diminished ii7 for this minor target' : 'minor ii7 for this major target'}. Its root moves up a fourth to ${chord.root}, then ${chord.symbol} resolves down a fifth to ${next.root}. The ii root becomes the V fifth; the ii seventh can move to the V third. Share the V slot equally between ii and V. ${melodyAdvice}`)
      }
    }
    const offset = mod(pc - keyPc, 12)
    const borrowed = borrowedReplacement(offset, chord.type, minor)
    if (borrowed) {
      const replacementPc = mod(keyPc + borrowed.offset, 12)
      const replacement = symbol(replacementPc, borrowed.type)
      const parallel = buildScale(tonic, minor ? 'major' : 'naturalMinor').map(pitchClass)
      const home = buildScale(tonic, minor ? 'naturalMinor' : 'major').map(pitchClass)
      const notes = buildChord(resolveChordRoot(replacementPc, keyTonic(replacementPc, false), borrowed.type), borrowed.type)
      const newNotes = notes.filter((n) => !home.includes(pitchClass(n)))
      if (newNotes.length && notes.every((n) => parallel.includes(pitchClass(n)))) {
        add('borrowed', index, romanAt(keyPc, replacementPc, borrowed.type), false, `${chord.symbol} to ${replacement}`,
          `Borrow ${replacement} from parallel ${tonic} ${minor ? 'major' : 'natural minor'}: ${newNotes.map(noteName).join(', ')} ${newNotes.length === 1 ? 'is' : 'are'} outside the home ${minor ? 'natural minor' : 'major'} scale. ${pc === replacementPc ? 'The bass root stays in place while the chord colour changes.' : 'The bass root also changes, so listen to its connection to the neighbouring chords.'} ${melodyAdvice}`)
      }
    }
  }
  return suggestions
}

function borrowedReplacement(offset: number, type: ChordType, minor: boolean): { offset: number; type: ChordType } | null {
  const rows: [number, ChordType, number, ChordType][] = minor ? [
    [0, 'min', 0, 'maj'], [0, 'min7', 0, 'maj7'], [5, 'min', 5, 'maj'], [5, 'min7', 5, 'maj7'],
    [7, 'min', 7, 'maj'], [7, 'min7', 7, 'dom7'], [8, 'maj', 9, 'min'], [8, 'maj7', 9, 'min7'],
    [3, 'maj', 4, 'min'], [3, 'maj7', 4, 'min7'], [2, 'm7b5', 2, 'min7']
  ] : [
    [5, 'maj', 5, 'min'], [5, 'maj7', 5, 'min7'], [9, 'min', 8, 'maj'], [9, 'min7', 8, 'maj7'],
    [4, 'min', 3, 'maj'], [4, 'min7', 3, 'maj7'], [7, 'maj', 10, 'maj'], [7, 'dom7', 10, 'dom7'],
    [2, 'min7', 2, 'm7b5']
  ]
  const row = rows.find(([root, quality]) => root === offset && quality === type)
  return row ? { offset: row[2], type: row[3] } : null
}

export function reharmLooperConfig(config: ReharmConfig, side: 'original' | 'working', instrument: InstrumentId): LooperPresetConfig {
  const safe = validReharmConfig(config) ? config : DEFAULT_REHARM
  const progression = safe[side === 'original' ? 'original' : 'working']
  return {
    presetId: 'custom', romans: [...progression.romans], durations: [...progression.durations], keyPc: safe.keyPc,
    keyMinor: safe.minor, bpm: safe.bpm, beats: 4, loopSection: { start: 0, end: progression.romans.length - 1 }, countInBeats: 0,
    style: safe.mode === 'arpeggio' ? 'arpeggio' : 'strum', bass: 'root', drums: 'off', instrument,
    volume: 0.8, label: 'note', selectedScale: null, showScale: false, viewIdx: 0,
    targetOn: true, targetMode: 'guide', targetPreview: true, fretLo: 0, fretHi: 12
  }
}
