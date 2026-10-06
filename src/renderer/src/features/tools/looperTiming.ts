import { TICKS_PER_BEAT } from './patterns'

export interface LoopSection { start: number; end: number }

export function isChordDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 32 && Number.isInteger(value * 4)
}

export function validLoopSection(value: unknown, chordCount: number): value is LoopSection {
  if (!value || typeof value !== 'object') return false
  const section = value as LoopSection
  return Number.isInteger(section.start) && Number.isInteger(section.end) && section.start >= 0 &&
    section.end >= section.start && section.end < chordCount
}

export function normalizeChordDurations(value: unknown, chordCount: number, beatsPerChord: number): number[] {
  const fallback = isChordDuration(beatsPerChord) ? beatsPerChord : 4
  const input = Array.isArray(value) ? value : []
  return Array.from({ length: chordCount }, (_, i) => isChordDuration(input[i]) ? input[i] : fallback)
}

export function normalizeLoopSection(value: unknown, chordCount: number): LoopSection | null {
  return validLoopSection(value, chordCount) ? { start: value.start, end: value.end } : null
}

export function normalizeCountInBeats(value: unknown): number {
  return typeof value === 'number' && [0, 2, 3, 4, 6, 8].includes(value) ? value : 0
}

export interface LoopTimelineChord {
  chordIndex: number
  nextChordIndex: number
  startTick: number
  durationTicks: number
  previewTick: number
}

export interface LoopTimeline {
  chords: LoopTimelineChord[]
  totalTicks: number
}

export function buildLoopTimeline(durations: number[], section: LoopSection | null = null): LoopTimeline {
  const selected = normalizeLoopSection(section, durations.length)
  const start = selected?.start ?? 0
  const end = selected?.end ?? durations.length - 1
  let totalTicks = 0
  const chords: LoopTimelineChord[] = []
  for (let i = start; i <= end; i++) {
    const durationTicks = durations[i] * TICKS_PER_BEAT
    chords.push({
      chordIndex: i, nextChordIndex: i === end ? start : i + 1,
      startTick: totalTicks, durationTicks,
      previewTick: durationTicks - Math.min(TICKS_PER_BEAT, durationTicks / 2)
    })
    totalTicks += durationTicks
  }
  return { chords, totalTicks }
}

export function loopTimelineTiming(step: number, timeline: LoopTimeline) {
  const pos = ((Math.floor(step) % timeline.totalTicks) + timeline.totalTicks) % timeline.totalTicks
  const chord = timeline.chords.find((c) => pos >= c.startTick && pos < c.startTick + c.durationTicks)
  if (!chord) return { chordIndex: 0, nextChordIndex: null, tick: 0, atBoundary: false, atPreview: false, previewInTicks: null }
  const tick = pos - chord.startTick
  return {
    chordIndex: chord.chordIndex,
    nextChordIndex: tick >= chord.previewTick ? chord.nextChordIndex : null,
    tick,
    atBoundary: tick === 0,
    atPreview: tick === Math.ceil(chord.previewTick),
    previewInTicks: tick === Math.floor(chord.previewTick) && !Number.isInteger(chord.previewTick)
      ? chord.previewTick - tick : null
  }
}
