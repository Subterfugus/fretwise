import type { FretMark } from '@/content/types'
import { chordToneMarks, scaleMarks, type LabelMode } from '@/content/helpers'
import { buildChord, CHORDS, type ChordType } from '@/theory/chords'
import { pcAt, posKey } from '@/theory/guitar'
import { parseInterval } from '@/theory/intervals'
import { pitchClass } from '@/theory/notes'
import type { ScaleType } from '@/theory/scales'
import { TICKS_PER_BEAT } from './patterns'

export type TargetMode = 'all' | 'root' | 'third' | 'fifth' | 'seventh' | 'guide'

const selectedDegrees: Record<TargetMode, number[]> = {
  all: [], root: [1], third: [3], fifth: [5], seventh: [7], guide: [3, 7]
}

/** Highlight actual chord degrees, including altered fifths and diminished sevenths. */
export function targetToneMarks(
  root: string,
  type: ChordType,
  scaleRoot: string | null,
  scaleType: ScaleType | null,
  label: LabelMode,
  mode: TargetMode,
  range: [number, number]
): FretMark[] {
  const tones = buildChord(root, type)
  const selected = new Set(tones.filter((_, i) =>
    mode === 'all' || selectedDegrees[mode].includes(((parseInterval(CHORDS[type].intervals[i]).number - 1) % 7) + 1)
  ).map(pitchClass))
  const targets = chordToneMarks(root, type, range, label)
    .filter((m) => selected.has(pcAt(m)))
    .map((m): FretMark => ({
      ...m,
      color: m.color === 'root' ? 'root' : 'accent',
      computedNote: label === 'note' ? { pc: pcAt(m), key: root } : undefined
    }))
  if (!scaleRoot || !scaleType) return targets
  const have = new Set(targets.map(posKey))
  const scaleLabel = label === 'degree' || label === 'interval' ? 'note' : label
  const background = scaleMarks(scaleRoot, scaleType, { frets: range, label: scaleLabel })
    .filter((m) => !have.has(posKey(m)))
    .map((m): FretMark => ({
      ...m,
      color: 'ghost',
      computedNote: scaleLabel === 'note' ? { pc: pcAt(m), key: scaleRoot } : undefined
    }))
  return [...background, ...targets]
}

export interface LoopTargetTiming {
  chordIndex: number
  nextChordIndex: number | null
  atBoundary: boolean
  atPreview: boolean
}

/** Preview during the last beat; one-beat chords use their last half beat. */
export function loopTargetTiming(step: number, beatsPerChord: number, chordCount: number): LoopTargetTiming {
  const chordTicks = beatsPerChord * TICKS_PER_BEAT
  if (!Number.isFinite(step) || !Number.isFinite(chordTicks) || chordTicks <= 0 || !Number.isInteger(chordCount) || chordCount < 1) {
    return { chordIndex: 0, nextChordIndex: null, atBoundary: false, atPreview: false }
  }
  const total = chordTicks * chordCount
  const pos = ((Math.floor(step) % total) + total) % total
  const chordIndex = Math.floor(pos / chordTicks)
  const tick = pos % chordTicks
  const previewTick = chordTicks - Math.min(TICKS_PER_BEAT, chordTicks / 2)
  return {
    chordIndex,
    nextChordIndex: tick >= previewTick ? (chordIndex + 1) % chordCount : null,
    atBoundary: tick === 0,
    atPreview: tick === previewTick
  }
}
