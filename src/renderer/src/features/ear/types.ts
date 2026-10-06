// Shared types for the ear-training drills. Everything here is pure data so
// question generation can be unit-tested without audio.
import type { SeqEvent } from '@/audio/engine'
import type { EarStat } from '@/state/progress'
import type { FretPos } from '@/theory/guitar'
import type { SpellingContext } from '@/theory/spelling'

export type DrillId = 'intervals' | 'chords' | 'scales' | 'progressions' | 'degrees' | 'melody' | 'notefinder'

/** A sound to play: a sequence of events at a tempo (rests = events with no notes). */
export interface Sound {
  events: SeqEvent[]
  bpm: number
}

export interface Item {
  key: string
  label: string
  /** Optional short sub-label shown under answer buttons */
  sub?: string
}

export interface Preset {
  id: string
  label: string
  items: string[]
}

export type OptValue = string | number | boolean | string[]

export type OptionDef =
  | { kind: 'multi'; id: string; label: string; choices: { value: string; label: string }[]; /** Minimum selected (default 1) */ min?: number }
  | { kind: 'select'; id: string; label: string; choices: { value: string; label: string }[] }
  | { kind: 'toggle'; id: string; label: string; help?: string }
  | { kind: 'range'; id: string; label: string; min: number; max: number; step: number; suffix?: string }

export interface DrillSettings {
  /** Enabled item keys */
  items: string[]
  /** Weight random selection toward low-accuracy items */
  weak: boolean
  opts: Record<string, OptValue>
}

export interface Choice {
  key: string
  label: string
  sub?: string
}

export interface ChoicePart {
  /** Key recorded with recordEar */
  itemKey: string
  /** Correct choice key */
  answer: string
  choices: Choice[]
  /** e.g. "Chord 2" for multi-part questions */
  prompt?: string
}

export interface FretTask {
  /** Note finder: only clicks on this string count */
  string?: number
  /** Melody: the given first note, shown on the neck */
  start?: FretPos
  /** MIDI pitches the user must find, in order */
  targets: number[]
  /** A sensible position for each target, shown when revealing */
  targetPositions: FretPos[]
  /** Item key recorded per target */
  itemKeys: string[]
  frets: [number, number]
}

export interface Question {
  prompt: string
  sound: Sound
  reference?: { label: string; sound: Sound }
  parts?: ChoicePart[]
  /** Sound of a given answer choice, for "hear what you picked" */
  choiceSound?: (key: string, part: number) => Sound | null
  /** Optional hint (e.g. song reference) shown before answering when enabled */
  hint?: string
  /** Explanation shown after answering */
  reveal: string
  /** Computed names resolve reactively; explicitly spelled theory stays in reveal. */
  displayReveal?: (spelling: {
    spellPc(pc: number, ctx?: SpellingContext): string
    spellMidi(midi: number, ctx?: SpellingContext): string
  }) => string
  keyContext?: string
  fret?: FretTask
}

export type Stats = Record<string, EarStat>
export type Rng = () => number

export interface DrillDef {
  id: DrillId
  title: string
  blurb: string
  glyph: string
  /** Heading for the item checkboxes */
  itemsLabel: string
  items: Item[]
  /** Extra keys that can appear in stats (e.g. Roman numerals) */
  extraItems?: Item[]
  presets: Preset[]
  options: OptionDef[]
  defaults: DrillSettings
  input: 'choice' | 'fret'
  /** Minimum number of enabled items */
  minItems: number
  /** Show tempo-related or other notes in the settings panel */
  note?: string
  generate(s: DrillSettings, stats: Stats, rng?: Rng): Question
}
