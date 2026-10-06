import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loopTargetTiming, targetToneMarks, type TargetMode } from './targetTones'
import { looper, type LoopConfig } from './looper'

const audio = vi.hoisted(() => {
  const queue: { callback: () => void; time: number }[] = []
  let tick: ((time: number) => void) | null = null
  return {
    queue,
    transport: {
      PPQ: 192, position: 0,
      bpm: { value: 96, rampTo: vi.fn() },
      stop: vi.fn(), cancel: vi.fn(), start: vi.fn(), clear: vi.fn(),
      scheduleRepeat: vi.fn((callback: (time: number) => void, _interval: string, _start: number) => { tick = callback; return 71 })
    },
    runTick: (time: number) => tick?.(time),
    sampler: { triggerAttackRelease: vi.fn() },
    bus: { gain: { value: 0.8, rampTo: vi.fn() } },
    release: vi.fn(), stop: vi.fn(),
    kit: { hit: vi.fn(), setVolume: vi.fn(), release: vi.fn() }
  }
})

vi.mock('tone', () => ({
  getTransport: () => audio.transport,
  getDraw: () => ({ schedule: (callback: () => void, time: number) => audio.queue.push({ callback, time }) })
}))
vi.mock('@/audio/engine', () => ({ engine: {
  stop: audio.stop,
  registerStopHandler: () => () => {},
  createSampler: async () => ({ sampler: audio.sampler, bus: audio.bus, release: audio.release })
} }))
vi.mock('./kit', () => ({ createKit: () => audio.kit }))
vi.mock('./voicings', () => ({ bestVoicing: () => ({ name: 'Test', frets: [null, 3, 2, 0, 1, 0] }) }))

const standard = [64, 59, 55, 50, 45, 40]
const pc = (p: { string: number; fret: number }) => (standard[p.string - 1] + p.fret) % 12
const targetPcs = (marks: ReturnType<typeof targetToneMarks>) => [...new Set(marks.filter((m) => m.color !== 'ghost').map(pc))].sort((a, b) => a - b)

describe('target tone marks', () => {
  it.each<[TargetMode, number[]]>([
    ['all', [2, 5, 7, 11]], ['root', [7]], ['third', [11]], ['fifth', [2]], ['seventh', [5]], ['guide', [5, 11]]
  ])('selects the actual G7 degrees in %s mode', (mode, expected) => {
    const marks = targetToneMarks('G', 'dom7', 'C', 'major', 'degree', mode, [5, 8])
    expect(targetPcs(marks)).toEqual(expected)
    for (const m of marks) {
      expect(m.fret).toBeGreaterThanOrEqual(5)
      expect(m.fret).toBeLessThanOrEqual(8)
    }
    const positions = marks.map((m) => `${m.string}:${m.fret}`)
    expect(new Set(positions).size).toBe(positions.length)
    expect([...new Set(marks.filter((m) => m.color === 'ghost').map(pc))].sort((a, b) => a - b))
      .toEqual([0, 2, 4, 5, 7, 9, 11].filter((n) => !expected.includes(n)))
  })

  it('recognises altered fifths, diminished sevenths and missing thirds', () => {
    expect(targetPcs(targetToneMarks('B', 'dim7', null, null, 'degree', 'fifth', [0, 12]))).toEqual([5])
    const seventh = targetToneMarks('B', 'dim7', null, null, 'degree', 'seventh', [0, 12])
    expect(targetPcs(seventh)).toEqual([8])
    expect(seventh.every((m) => m.label === '𝄫7')).toBe(true)
    expect(targetPcs(targetToneMarks('C', 'aug', null, null, 'degree', 'fifth', [0, 12]))).toEqual([8])
    expect(targetPcs(targetToneMarks('C', 'sus7', null, null, 'degree', 'third', [0, 12]))).toEqual([])
    expect(targetPcs(targetToneMarks('C', 'sus7', null, null, 'degree', 'guide', [0, 12]))).toEqual([10])
    expect(targetPcs(targetToneMarks('C', 'dom7s9', null, null, 'degree', 'third', [0, 12]))).toEqual([4])
  })

  it('shows no invented seventh for triads or sixth chords', () => {
    for (const type of ['maj', 'min', 'maj6', 'min6'] as const) {
      expect(targetToneMarks('C', type, null, null, 'note', 'seventh', [0, 12])).toEqual([])
      const withScale = targetToneMarks('C', type, 'C', 'major', 'degree', 'seventh', [0, 12])
      expect(withScale.length).toBeGreaterThan(0)
      expect(withScale.every((m) => m.color === 'ghost')).toBe(true)
    }
  })

  it('keeps note labels reactive and degrees intentionally spelled', () => {
    const notes = targetToneMarks('Bb', 'dom7', 'Eb', 'major', 'note', 'guide', [0, 12])
    for (const m of notes) expect(m.computedNote).toEqual({ pc: pc(m), key: m.color === 'ghost' ? 'Eb' : 'Bb' })
    const degree = targetToneMarks('Bb', 'dom7', 'Eb', 'major', 'degree', 'guide', [0, 12])
    expect(new Set(degree.filter((m) => m.color !== 'ghost').map((m) => m.label))).toEqual(new Set(['3', '♭7']))
    expect(degree.filter((m) => m.color !== 'ghost').every((m) => m.computedNote === undefined)).toBe(true)
    expect(degree.filter((m) => m.color === 'ghost').every((m) => m.computedNote?.key === 'Eb')).toBe(true)
    expect(targetToneMarks('C', 'maj', 'C', 'major', 'none', 'all', [0, 12]).every((m) => m.label === undefined && m.computedNote === undefined)).toBe(true)
  })
})

describe('transport grid preview timing', () => {
  it.each([1, 2, 3, 4, 6, 8])('clears at boundaries and previews %i-beat chords before changing', (beats) => {
    const ticks = beats * 12
    const previewAt = beats === 1 ? 6 : ticks - 12
    for (let chord = 0; chord < 3; chord++) {
      const start = chord * ticks
      expect(loopTargetTiming(start, beats, 3)).toEqual({ chordIndex: chord, nextChordIndex: null, atBoundary: true, atPreview: false })
      expect(loopTargetTiming(start + previewAt - 1, beats, 3).nextChordIndex).toBeNull()
      expect(loopTargetTiming(start + previewAt, beats, 3)).toEqual({ chordIndex: chord, nextChordIndex: (chord + 1) % 3, atBoundary: false, atPreview: true })
      expect(loopTargetTiming(start + ticks - 1, beats, 3).nextChordIndex).toBe((chord + 1) % 3)
    }
    expect(loopTargetTiming(ticks * 3, beats, 3)).toEqual(loopTargetTiming(0, beats, 3))
    expect(loopTargetTiming(ticks * 9 + previewAt, beats, 3)).toEqual(loopTargetTiming(previewAt, beats, 3))
  })

  it('handles one-chord loops and an empty progression', () => {
    expect(loopTargetTiming(36, 4, 1).nextChordIndex).toBe(0)
    expect(loopTargetTiming(0, 4, 0)).toEqual({ chordIndex: 0, nextChordIndex: null, atBoundary: false, atPreview: false })
  })
})

const cfg = (extra: Partial<LoopConfig> = {}): LoopConfig => ({
  chords: [{ root: 'C', type: 'maj' }, { root: 'G', type: 'dom7' }], bpm: 96, beatsPerChord: 4,
  style: 'strum', bass: 'off', drums: 'off', instrument: 'guitar-acoustic', volume: 0.8, ...extra
})
const draw = () => audio.queue.splice(0).forEach((e) => e.callback())
const tick = (step: number) => { audio.runTick(100 + step / 24); draw() }

describe('looper target-tone runtime', () => {
  beforeEach(() => {
    looper.stop()
    audio.queue.length = 0
    vi.clearAllMocks()
  })
  afterEach(() => looper.stop())

  it('uses scheduled audio times for preview, changes and loop wrap', async () => {
    looper.setConfig(cfg())
    await looper.start()
    expect(audio.transport.scheduleRepeat.mock.calls[0][1]).toBe('16i')
    for (let step = 0; step < 36; step++) tick(step)
    expect(looper.getState()).toMatchObject({ status: 'playing', chordIndex: 0, nextChordIndex: null })
    audio.runTick(101.5)
    expect(looper.getState().nextChordIndex).toBeNull()
    expect(audio.queue.at(-1)!.time).toBe(101.5)
    draw()
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: 1 })
    for (let step = 37; step <= 48; step++) tick(step)
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
    for (let step = 49; step <= 84; step++) tick(step)
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: 0 })
    for (let step = 85; step <= 96; step++) tick(step)
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: null })
  })

  it('rejects queued draw callbacks after configuration changes', async () => {
    looper.setConfig(cfg())
    await looper.start()
    for (let step = 0; step < 36; step++) tick(step)
    audio.runTick(120)
    const oldPreview = audio.queue.splice(0)[0].callback
    looper.setConfig(cfg({ chords: [{ root: 'D', type: 'min7' }] }))
    oldPreview()
    expect(looper.getState()).toMatchObject({ status: 'idle', nextChordIndex: null })
    await looper.start()
    for (let step = 0; step < 48; step++) tick(step)
    audio.runTick(130)
    const oldBoundary = audio.queue.splice(0)[0].callback
    looper.setConfig(cfg())
    oldBoundary()
    expect(looper.getState()).toMatchObject({ status: 'idle', chordIndex: 0, nextChordIndex: null })
    await looper.start()
    for (let step = 0; step <= 48; step++) tick(step)
    expect(looper.getState()).toMatchObject({ status: 'playing', chordIndex: 1, nextChordIndex: null })
  })

  it('clears preview and rejects stale callbacks on stop and restart', async () => {
    looper.setConfig(cfg())
    await looper.start()
    for (let step = 0; step < 36; step++) tick(step)
    audio.runTick(150)
    const queued = audio.queue.splice(0)[0].callback
    looper.stop()
    queued()
    expect(looper.getState()).toMatchObject({ status: 'idle', nextChordIndex: null })
    await looper.start()
    queued()
    expect(looper.getState()).toMatchObject({ status: 'playing', chordIndex: 0, nextChordIndex: null })
    expect(audio.transport.clear).toHaveBeenCalledWith(71)
    expect(audio.release).toHaveBeenCalled()
  })
})
