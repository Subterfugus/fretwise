import { describe, expect, it } from 'vitest'
import { buildLoopTimeline, isChordDuration, loopTimelineTiming, normalizeChordDurations, normalizeCountInBeats, normalizeLoopSection, validLoopSection } from './looperTiming'

describe('looper timing validation', () => {
  it('accepts quarter-beat durations from a quarter beat through 32 beats', () => {
    for (let quarter = 1; quarter <= 128; quarter++) expect(isChordDuration(quarter / 4)).toBe(true)
    for (const bad of [0, -1, 0.1, 0.3, 32.25, NaN, Infinity, '4', null, undefined]) expect(isChordDuration(bad)).toBe(false)
  })

  it('normalizes each full-list duration and fills missing entries', () => {
    expect(normalizeChordDurations(undefined, 3, 6)).toEqual([6, 6, 6])
    expect(normalizeChordDurations([0.25, 0, 1.5, 32, 8], 4, 3)).toEqual([0.25, 3, 1.5, 32])
    expect(normalizeChordDurations([], 2, NaN)).toEqual([4, 4])
    expect(normalizeChordDurations(undefined, 0, 4)).toEqual([])
  })

  it('validates inclusive original-index sections and allowed count-ins', () => {
    expect(validLoopSection({ start: 1, end: 2 }, 3)).toBe(true)
    expect(validLoopSection({ start: 2, end: 2 }, 3)).toBe(true)
    for (const bad of [null, {}, { start: -1, end: 1 }, { start: 2, end: 1 }, { start: 0, end: 3 }, { start: 0.5, end: 1 }]) {
      expect(validLoopSection(bad, 3)).toBe(false)
      expect(normalizeLoopSection(bad, 3)).toBeNull()
    }
    expect(normalizeLoopSection({ start: 0, end: 0 }, 0)).toBeNull()
    expect(normalizeLoopSection({ start: 1, end: 2 }, 3)).toEqual({ start: 1, end: 2 })
    for (const good of [0, 2, 3, 4, 6, 8]) expect(normalizeCountInBeats(good)).toBe(good)
    for (const bad of [1, 5, 7, 9, NaN, '4', null]) expect(normalizeCountInBeats(bad)).toBe(0)
  })
})

describe('unequal section timeline', () => {
  it('uses each duration and wraps through the selected original indices', () => {
    const timeline = buildLoopTimeline([4, 0.25, 1.5, 3], { start: 1, end: 3 })
    expect(timeline.totalTicks).toBe(57)
    expect(timeline.chords.map((c) => [c.chordIndex, c.startTick, c.durationTicks, c.nextChordIndex])).toEqual([
      [1, 0, 3, 2], [2, 3, 18, 3], [3, 21, 36, 1]
    ])
    expect(loopTimelineTiming(0, timeline)).toMatchObject({ chordIndex: 1, tick: 0, atBoundary: true, nextChordIndex: null })
    expect(loopTimelineTiming(3, timeline)).toMatchObject({ chordIndex: 2, tick: 0, atBoundary: true })
    expect(loopTimelineTiming(21, timeline)).toMatchObject({ chordIndex: 3, tick: 0, atBoundary: true })
    expect(loopTimelineTiming(56, timeline).nextChordIndex).toBe(1)
    expect(loopTimelineTiming(57, timeline)).toEqual(loopTimelineTiming(0, timeline))
    expect(loopTimelineTiming(57 * 100 + 3, timeline)).toEqual(loopTimelineTiming(3, timeline))
  })

  it('previews for half a short chord or the last beat of a longer chord', () => {
    const timeline = buildLoopTimeline([0.25, 0.75, 1.5, 2.25, 4])
    expect(timeline.chords.map((c) => c.previewTick)).toEqual([1.5, 4.5, 9, 15, 36])
    expect(loopTimelineTiming(1, timeline)).toMatchObject({ chordIndex: 0, nextChordIndex: null, previewInTicks: 0.5 })
    expect(loopTimelineTiming(2, timeline)).toMatchObject({ chordIndex: 0, nextChordIndex: 1, atPreview: true })
    expect(loopTimelineTiming(7, timeline)).toMatchObject({ chordIndex: 1, nextChordIndex: null, previewInTicks: 0.5 })
    expect(loopTimelineTiming(8, timeline)).toMatchObject({ chordIndex: 1, nextChordIndex: 2, atPreview: true })
  })

  it('supports a single selected chord and an empty progression', () => {
    const timeline = buildLoopTimeline([4, 6, 0.5], { start: 2, end: 2 })
    expect(timeline.totalTicks).toBe(6)
    expect(loopTimelineTiming(3, timeline)).toMatchObject({ chordIndex: 2, nextChordIndex: 2, atPreview: true })
    expect(loopTimelineTiming(6, timeline)).toMatchObject({ chordIndex: 2, nextChordIndex: null, atBoundary: true })
    expect(loopTimelineTiming(0, buildLoopTimeline([]))).toMatchObject({ chordIndex: 0, nextChordIndex: null, atBoundary: false })
  })
})
