// Content model for lessons and quizzes. Unit files in ./units build these
// objects (they may call theory helpers to generate fretboard marks etc).
import type { ChordShape, FretPos } from '@/theory/guitar'
import type { Pitch, PlayMode, SeqEvent } from '@/audio/engine'
import type { ToolExample } from './toolExamples'

// ---------- Sound ----------

export type PlaySpec = (
  | { kind: 'notes'; notes: Pitch[]; mode?: PlayMode }
  | { kind: 'interval'; a: Pitch; b: Pitch; dir?: 'ascending' | 'descending' | 'harmonic' }
  | { kind: 'sequence'; events: SeqEvent[]; bpm?: number }
  /** Rhythm in beats; negative numbers are rests. Clicks unless `pitch` given. */
  | { kind: 'rhythm'; pattern: number[]; bpm?: number; countIn?: number; pitch?: Pitch }
  /** `tuning`: MIDI of the open strings (index 0 = string 1). `capo`: capo fret; shape frets are relative to the capo. */
  | { kind: 'shape'; shape: ChordShape; mode?: PlayMode; tuning?: number[]; capo?: number }
) & { toolExample?: ToolExample }

// ---------- Fretboard marks ----------

/** 'muted' is the red "wrong answer" style; 'mute' is a neutral marker for a deadened (unplayed) string. */
export type MarkColor = 'root' | 'tone' | 'accent' | 'blue' | 'muted' | 'ghost' | 'mute'

export interface FretMark extends FretPos {
  toolExample?: ToolExample
  /** Text inside the dot: note name, interval, degree, finger number */
  label?: string
  /** Computed pitch labels resolve at render time; explicit lesson spellings use label only. */
  computedNote?: { pc: number; key?: string }
  color?: MarkColor
  /** Outline the lowest sounding note(s), independently of root/degree color. */
  bass?: boolean
  /** Scale Comparison tonic marker, independent of pitch membership colour. */
  comparisonTonic?: 'a' | 'b' | 'both'
}

// ---------- Lesson blocks ----------

export type Block = (
  /** Markdown subset: **bold**, *italic*, `code`, ### headings, - lists, 1. lists, blank-line paragraphs */
  | { type: 'text'; md: string }
  | { type: 'tip'; md: string; tone?: 'tip' | 'warning' | 'theory' | 'practice' }
  | {
      type: 'fretboard'
      marks: FretMark[]
      caption?: string
      /** Visible fret range, default [0, 12] */
      frets?: [number, number]
      /** Click a dot (or any fret) to hear it. Default true */
      playable?: boolean
      /** Optional "play all" button: plays marks low->high as a scale/arpeggio */
      playAll?: boolean
      /** Open-string MIDI notes, index 0 = string 1 (high) ... 5 = string 6. Default standard tuning. */
      tuning?: number[]
      /** Capo fret. Mark frets stay ABSOLUTE (counted from the nut); the capo is drawn at this fret and frets behind it are dead. */
      capo?: number
      /** Draw the open-string letters left of the nut. Default: true when `tuning` is not standard. */
      showTuning?: boolean
    }
  | {
      type: 'chords'
      shapes: ChordShape[]
      caption?: string
      /** Tuning the shapes are played in (default standard). Audio and string letters follow it. */
      tuning?: number[]
      /** Capo fret: shape frets are RELATIVE to the capo (a "G shape"), sounding pitch is raised by it. */
      capo?: number
      /** Draw string letters under each diagram. Default: true when `tuning` is not standard. */
      showTuning?: boolean
    }
  | {
      type: 'tab'
      caption?: string
      /** Tuning the fret numbers refer to (default standard); notation and playback use the tuned pitches. */
      tuning?: number[]
      /** Capo fret: tab frets are relative to the capo, sounding pitch is raised by it. */
      capo?: number
      /** Spell the notation with flats (for flat tunings such as half step down). */
      flats?: boolean
      /** Each event is one or more simultaneous fretted notes with a length in beats (default 1) */
      events: { pos: FretPos[]; beats?: number }[]
      bpm?: number
      /** Also draw standard notation above the tab. Default true */
      notation?: boolean
      /** e.g. "4/4": draws the time signature and a barline every bar. Default none (no barlines) */
      timeSig?: string
    }
  | {
      type: 'staff'
      caption?: string
      clef?: 'treble' | 'bass'
      /** VexFlow key signature, e.g. "G", "F", "Bb", "F#m" */
      keySig?: string
      timeSig?: string
      /** Notes as "C#/4" style keys; several keys = chord. duration: w h q 8 16, add "r" for rest ("qr"), "d" for dotted ("qd") */
      notes: { keys: string[]; duration: string }[]
      /** Guitar sounds an octave lower than written; set true to play at written pitch instead. */
      concertPitch?: boolean
      playable?: boolean
      bpm?: number
    }
  | { type: 'audio'; label: string; play: PlaySpec }
  /** Row of audio buttons for comparisons ("major vs minor") */
  | { type: 'audioRow'; items: { label: string; play: PlaySpec }[] }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { type: 'circleOfFifths'; highlight?: string }
  /** Ungraded practice question embedded in the lesson */
  | { type: 'tryIt'; question: QuizQuestion }
  /**
   * Play-along: the app listens to the player's guitar through the microphone.
   * `targets` are played in order (one note for "play a G", several for a scale / arpeggio).
   * A target with an octave ("A2", sounding pitch, low E string = E2) must be played at that
   * pitch; one without ("G") accepts any octave. `octaveAgnostic` makes every target accept any octave.
   */
  | {
      type: 'playIt'
      prompt: string
      targets: string[]
      octaveAgnostic?: boolean
      /** Extra hint line shown under the prompt */
      hint?: string
      /** Fretboard positions revealed after success / give-up. Default: computed from the targets. */
      show?: FretPos[]
      /** Visible fret range for the revealed fretboard, default [0, 12] */
      frets?: [number, number]
      /** Tuning for the revealed fretboard (targets are always SOUNDING pitches). Default standard. */
      tuning?: number[]
    }
) & { toolExamples?: ToolExample[] }

export interface Lesson {
  id: string // "u1l2"
  title: string
  summary?: string
  blocks: Block[]
}

// ---------- Quiz ----------

interface QBase {
  prompt: string
  /** Shown after answering (markdown) */
  explain?: string
  /** Optional sound for listen-and-identify questions */
  play?: PlaySpec
  /** Optional visual shown with the question (fretboard, chords, staff, tab) */
  visual?: Extract<Block, { type: 'fretboard' | 'chords' | 'staff' | 'tab' | 'table' }>
  /**
   * Lesson id that teaches this question. The curriculum path (content/curriculum.ts) uses it to
   * send the question to whichever unit now holds that lesson; untagged questions stay with
   * their own unit.
   */
  lesson?: string
}

export type QuizQuestion =
  | (QBase & { kind: 'mc'; choices: string[]; answer: number })
  /**
   * Click on the fretboard. mode 'any': clicking any one target is correct.
   * mode 'all': select every target then submit (extra/missing = wrong).
   */
  | (QBase & {
      kind: 'fretboard'
      targets: FretPos[]
      mode?: 'any' | 'all'
      frets?: [number, number]
      marks?: FretMark[]
      /** Tuning of the clickable fretboard (clicks sound at the tuned pitch). Default standard. */
      tuning?: number[]
      capo?: number
      showTuning?: boolean
    })
  /** Type note names separated by spaces/commas. Spelling must match (F# != Gb). */
  | (QBase & { kind: 'spell'; answer: string[]; ordered?: boolean })
  /** Short typed answer, case-insensitive, any of `accept` */
  | (QBase & { kind: 'text'; accept: string[] })

/** `lesson`: as on QBase, the lesson that teaches what this generator asks (see `forLesson`). */
export type QuestionGenerator = (() => QuizQuestion) & { lesson?: string }

export interface UnitQuiz {
  /** Number of questions per attempt (default 10) */
  count?: number
  fixed: QuizQuestion[]
  /** Called repeatedly to create fresh randomised questions */
  generators?: QuestionGenerator[]
}

export interface Unit {
  id: string // "u1"
  number: number
  title: string
  summary: string
  lessons: Lesson[]
  quiz: UnitQuiz
  /**
   * Elective units sit outside the linear 1..12 path: they unlock when every unit in
   * `requires` has its quiz passed (instead of "the previous-numbered unit").
   */
  elective?: boolean
  /** Unit ids whose quizzes unlock this unit (only used when set). */
  requires?: string[]
  /** Curriculum stage id (set by the curriculum path). */
  stage?: string
  /** Retired unit ids whose passed quiz also counts as passing this one (saved progress from older layouts). */
  legacyPass?: string[]
}

export const PASS_MARK = 0.8
