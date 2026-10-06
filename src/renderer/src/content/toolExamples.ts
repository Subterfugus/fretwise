import type { ChordType } from '@/theory/chords'
import type { ChordShape } from '@/theory/guitar'
import type { ScaleType } from '@/theory/scales'

/** Explicit musical context for lesson-to-tool navigation, never inferred from prose. */
export type ToolExample =
  | { kind: 'scale'; root: string; type: ScaleType; frets?: [number, number]; box?: number; label?: string }
  | { kind: 'chord'; root: string; type: ChordType; shape?: ChordShape; tuning?: number[]; capo?: number; label?: string }
  | { kind: 'progression'; root: string; romans: string[]; scale: ScaleType; bpm?: number; beats?: number; durations?: number[]; frets?: [number, number]; label?: string }

export const progressionExample = (root: string, romans: string[], scale: ScaleType, bpm = 90, beats = 4): ToolExample =>
  ({ kind: 'progression', root, romans, scale, bpm, beats })
