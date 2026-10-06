import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { looper, type LoopConfig } from './looper'

const audio = vi.hoisted(() => {
  const draws: { callback: () => void; time: number }[] = []
  let tick: ((time: number) => void) | null = null
  const handlers = new Set<() => void>()
  return {
    draws, handlers,
    transport: {
      PPQ: 192, position: 0, bpm: { value: 96, rampTo: vi.fn() },
      stop: vi.fn(), cancel: vi.fn(), start: vi.fn(), clear: vi.fn(),
      scheduleRepeat: vi.fn((callback: (time: number) => void) => { tick = callback; return 71 })
    },
    runTick: (time: number) => tick?.(time),
    createSampler: vi.fn(),
    stop: vi.fn(() => [...handlers].forEach((fn) => fn())),
    kit: { hit: vi.fn(), setVolume: vi.fn(), release: vi.fn() }
  }
})

vi.mock('tone', () => ({
  getTransport: () => audio.transport,
  getDraw: () => ({ schedule: (callback: () => void, time: number) => audio.draws.push({ callback, time }) })
}))
vi.mock('@/audio/engine', () => ({ engine: {
  stop: audio.stop, createSampler: audio.createSampler,
  registerStopHandler: (fn: () => void) => { audio.handlers.add(fn); return () => audio.handlers.delete(fn) }
} }))
vi.mock('./kit', () => ({ createKit: () => audio.kit }))
vi.mock('./voicings', () => ({ bestVoicing: () => ({ name: 'Test', frets: [null, 3, 2, 0, 1, 0] }) }))

const cfg = (extra: Partial<LoopConfig> = {}): LoopConfig => ({
  chords: [{ root: 'C', type: 'maj' }, { root: 'G', type: 'dom7' }], bpm: 96, beatsPerChord: 4,
  style: 'strum', bass: 'off', drums: 'off', instrument: 'guitar-acoustic', volume: 0.8, ...extra
})
const voice = () => ({
  sampler: { triggerAttackRelease: vi.fn() },
  bus: { gain: { value: 0.8, rampTo: vi.fn() } }, release: vi.fn()
})
const deferred = () => {
  let resolve!: (value: ReturnType<typeof voice>) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ReturnType<typeof voice>>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
const draw = () => audio.draws.splice(0).forEach(({ callback }) => callback())
const run = (from: number, to: number) => {
  for (let step = from; step <= to; step++) { audio.runTick(100 + step / 24); draw() }
}

describe('looper async sessions', () => {
  beforeEach(() => {
    looper.stop()
    audio.draws.length = 0
    vi.clearAllMocks()
    audio.createSampler.mockReset().mockImplementation(async () => voice())
  })
  afterEach(() => looper.stop())

  it('stops and releases playback when the last chord is removed', async () => {
    const active = voice()
    audio.createSampler.mockResolvedValueOnce(active)
    looper.setConfig(cfg())
    await looper.start()
    run(0, 36)
    looper.setConfig(cfg({ chords: [] }))
    expect(looper.getState()).toMatchObject({ status: 'idle', chordIndex: 0, nextChordIndex: null })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.transport.clear).toHaveBeenCalledWith(71)
    expect(audio.handlers.size).toBe(0)
  })

  it('cancels startup if the progression is cleared while samples load', async () => {
    const pending = deferred()
    const loaded = voice()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg())
    const started = looper.start()
    looper.setConfig(cfg({ chords: [] }))
    pending.resolve(loaded)
    await started
    expect(looper.getState().status).toBe('idle')
    expect(audio.transport.start).not.toHaveBeenCalled()
    expect(loaded.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('loads the latest instrument before completing startup', async () => {
    const pending = deferred()
    const acoustic = voice()
    const piano = voice()
    audio.createSampler.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(piano)
    looper.setConfig(cfg())
    const started = looper.start()
    looper.setConfig(cfg({ instrument: 'piano', bpm: 140, volume: 0.4 }))
    pending.resolve(acoustic)
    await started
    expect(audio.createSampler.mock.calls.map(([id]) => id)).toEqual(['guitar-acoustic', 'piano'])
    expect(acoustic.release).toHaveBeenCalledOnce()
    expect(piano.bus.gain.value).toBe(0.4)
    expect(audio.transport.bpm.value).toBe(140)
    run(0, 0)
    expect(piano.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(acoustic.sampler.triggerAttackRelease).not.toHaveBeenCalled()
  })

  it('recovers when an obsolete startup instrument fails to load', async () => {
    const pending = deferred()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg())
    const started = looper.start()
    looper.setConfig(cfg({ instrument: 'piano' }))
    pending.reject(new Error('obsolete acoustic failure'))
    await started
    expect(audio.createSampler).toHaveBeenLastCalledWith('piano')
    expect(looper.getState()).toMatchObject({ status: 'playing', error: undefined })
  })

  it('keeps the newest instrument when two sample requests resolve in reverse order', async () => {
    looper.setConfig(cfg())
    await looper.start()
    const nylonLoad = deferred()
    const pianoLoad = deferred()
    const nylon = voice()
    const piano = voice()
    audio.createSampler.mockReturnValueOnce(nylonLoad.promise).mockReturnValueOnce(pianoLoad.promise)
    looper.setConfig(cfg({ instrument: 'guitar-nylon' }))
    looper.setConfig(cfg({ instrument: 'piano' }))
    pianoLoad.resolve(piano)
    await flush()
    nylonLoad.resolve(nylon)
    await flush()
    run(0, 0)
    expect(piano.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(piano.release).not.toHaveBeenCalled()
    expect(nylon.release).toHaveBeenCalledOnce()
  })

  it('cancels a pending swap when the user selects the active instrument again', async () => {
    const acoustic = voice()
    audio.createSampler.mockResolvedValueOnce(acoustic)
    looper.setConfig(cfg())
    await looper.start()
    const pending = deferred()
    const nylon = voice()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg({ instrument: 'guitar-nylon' }))
    looper.setConfig(cfg())
    pending.resolve(nylon)
    await flush()
    run(0, 0)
    expect(acoustic.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(acoustic.release).not.toHaveBeenCalled()
    expect(nylon.release).toHaveBeenCalledOnce()
  })

  it('does not duplicate a pending instrument load on a volume change', async () => {
    looper.setConfig(cfg())
    await looper.start()
    const pending = deferred()
    const piano = voice()
    audio.createSampler.mockReturnValue(pending.promise)
    looper.setConfig(cfg({ instrument: 'piano' }))
    looper.setConfig(cfg({ instrument: 'piano', volume: 0.3 }))
    pending.resolve(piano)
    await flush()
    expect(audio.createSampler).toHaveBeenCalledTimes(2)
    expect(piano.bus.gain.value).toBe(0.3)
  })

  it('does not publish a swap failure after stopping', async () => {
    looper.setConfig(cfg())
    await looper.start()
    const pending = deferred()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg({ instrument: 'piano' }))
    looper.stop()
    pending.reject(new Error('late piano failure'))
    await flush()
    expect(looper.getState()).toMatchObject({ status: 'idle', error: undefined })
  })

  it('does not publish an obsolete swap failure after a newer choice succeeds', async () => {
    looper.setConfig(cfg())
    await looper.start()
    const pending = deferred()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg({ instrument: 'guitar-nylon' }))
    looper.setConfig(cfg({ instrument: 'piano' }))
    await flush()
    pending.reject(new Error('late nylon failure'))
    await flush()
    expect(looper.getState()).toMatchObject({ status: 'playing', error: undefined })
  })

  it('keeps the active instrument on a real swap failure and clears the error after retry', async () => {
    const acoustic = voice()
    audio.createSampler.mockResolvedValueOnce(acoustic)
    looper.setConfig(cfg())
    await looper.start()
    audio.createSampler.mockRejectedValueOnce(new Error('piano samples missing'))
    looper.setConfig(cfg({ instrument: 'piano' }))
    await flush()
    expect(looper.getState()).toMatchObject({ status: 'playing', error: 'piano samples missing' })
    run(0, 0)
    expect(acoustic.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(acoustic.release).not.toHaveBeenCalled()
    looper.setConfig(cfg({ instrument: 'piano' }))
    await flush()
    expect(looper.getState().error).toBeUndefined()
    expect(acoustic.release).toHaveBeenCalledOnce()
  })

  it('discards an old startup after a stop and restart', async () => {
    const pending = deferred()
    const stale = voice()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg())
    const oldStart = looper.start()
    audio.stop()
    await looper.start()
    pending.resolve(stale)
    await oldStart
    expect(looper.getState().status).toBe('playing')
    expect(audio.transport.start).toHaveBeenCalledOnce()
    expect(stale.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(1)
  })

  it('keeps a queued chord boundary when only tempo, volume or accompaniment changes', async () => {
    looper.setConfig(cfg())
    await looper.start()
    run(0, 47)
    audio.runTick(102)
    expect(looper.getState().chordIndex).toBe(0)
    looper.setConfig(cfg({ bpm: 120, volume: 0.4, style: 'strum8', bass: 'root', drums: 'click' }))
    expect(looper.getState().nextChordIndex).toBe(1)
    draw()
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
  })

  it('stops safely on a beat-grid change and starts the new grid from its first chord', async () => {
    const active = voice()
    audio.createSampler.mockResolvedValueOnce(active)
    looper.setConfig(cfg({ bass: 'root' }))
    await looper.start()
    run(0, 47)
    audio.runTick(102)
    looper.setConfig(cfg({ beatsPerChord: 1, bass: 'root' }))
    draw()
    expect(looper.getState()).toMatchObject({ status: 'idle', chordIndex: 0, nextChordIndex: null })
    expect(active.release).toHaveBeenCalledOnce()
    const next = voice()
    audio.createSampler.mockResolvedValueOnce(next)
    await looper.start()
    run(0, 11)
    next.sampler.triggerAttackRelease.mockClear()
    audio.runTick(102.5)
    expect(next.sampler.triggerAttackRelease.mock.calls.some(([note, , time]) => note === 'G2' && time === 102.5)).toBe(true)
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: 1 })
    draw()
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
  })

  it('plays unequal fractional section chords using original indices and wraps only the section', async () => {
    const active = voice()
    audio.createSampler.mockResolvedValueOnce(active)
    looper.setConfig(cfg({
      chords: [{ root: 'C', type: 'maj' }, { root: 'D', type: 'min' }, { root: 'E', type: 'dom7' }],
      durations: [4, 0.5, 1.25], loopSection: { start: 1, end: 2 }, bass: 'root'
    }))
    expect(looper.getState().chordIndex).toBe(1)
    await looper.start()
    run(0, 5)
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: 2 })
    run(6, 20)
    expect(looper.getState()).toMatchObject({ chordIndex: 2, nextChordIndex: 1 })
    run(21, 21)
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
    const bass = active.sampler.triggerAttackRelease.mock.calls.filter(([, , , vel]) => vel === 0.81)
    expect(bass.map(([note]) => note)).toEqual(['D2', 'E2', 'D2'])
    looper.stop()
    expect(looper.getState().chordIndex).toBe(1)
  })

  it('schedules the half-chord preview at the exact audio time for a quarter-beat chord', async () => {
    looper.setConfig(cfg({ durations: [0.25, 4] }))
    await looper.start()
    for (let step = 0; step <= 3; step++) audio.runTick(100 + step * (60 / 96) / 12)
    const previewTime = 100 + 1.5 * (60 / 96) / 12
    expect(audio.draws.some(({ time }) => time === previewTime)).toBe(true)
    audio.draws.sort((a, b) => a.time - b.time)
    while (audio.draws[0]?.time < previewTime) audio.draws.shift()!.callback()
    expect(looper.getState().nextChordIndex).toBeNull()
    audio.draws.shift()!.callback()
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: 1 })
    draw()
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
  })

  it('keeps drum phase through unequal chords and the section wrap', async () => {
    looper.setConfig(cfg({ durations: [0.75, 1.25], drums: 'click' }))
    await looper.start()
    run(0, 48)
    expect(audio.kit.hit.mock.calls.map(([sound, time]) => [sound, time])).toEqual([
      ['clickAccent', 100], ['click', 100.5], ['click', 101], ['click', 101.5], ['clickAccent', 102]
    ])
  })

  it('counts in with audio-clock clicks even when drums are off, then starts the selected chord once', async () => {
    const active = voice()
    audio.createSampler.mockResolvedValueOnce(active)
    looper.setConfig(cfg({ countInBeats: 2, loopSection: { start: 1, end: 1 }, bass: 'root' }))
    await looper.start()
    expect(looper.getState()).toMatchObject({ status: 'countIn', countInRemaining: 2, chordIndex: 1, nextChordIndex: null })
    run(0, 11)
    expect(active.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    run(12, 23)
    expect(looper.getState()).toMatchObject({ status: 'countIn', countInRemaining: 1, nextChordIndex: null })
    expect(active.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    audio.runTick(101)
    expect(active.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(looper.getState().status).toBe('countIn')
    draw()
    expect(looper.getState()).toMatchObject({ status: 'playing', countInRemaining: null, chordIndex: 1 })
    run(25, 150)
    expect(audio.kit.hit.mock.calls).toEqual([['clickAccent', 100, 1], ['click', 100.5, 1]])
  })

  it('uses a count-in edit on the next explicit start, including changes while loading', async () => {
    const pending = deferred()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg({ countInBeats: 2 }))
    const started = looper.start()
    expect(looper.getState()).toMatchObject({ status: 'loading', countInRemaining: 2 })
    looper.setConfig(cfg({ countInBeats: 8 }))
    expect(looper.getState()).toMatchObject({ status: 'loading', countInRemaining: 2 })
    pending.resolve(voice())
    await started
    expect(looper.getState().countInRemaining).toBe(2)
    run(0, 24)
    expect(looper.getState().status).toBe('playing')
    looper.stop()
    await looper.start()
    expect(looper.getState().countInRemaining).toBe(8)
  })

  it.each(['playing', 'countIn'] as const)('releases scheduled audio and rejects Draws on duration/section edits during %s', async (status) => {
    const active = voice()
    audio.createSampler.mockResolvedValueOnce(active)
    looper.setConfig(cfg({ countInBeats: status === 'countIn' ? 2 : 0 }))
    await looper.start()
    for (let step = 0; step <= 36; step++) audio.runTick(100 + step / 24)
    const stale = audio.draws.splice(0)
    looper.setConfig(cfg({ durations: [0.25, 1.5], loopSection: { start: 1, end: 1 } }))
    stale.forEach(({ callback }) => callback())
    expect(looper.getState()).toMatchObject({ status: 'idle', chordIndex: 1, nextChordIndex: null, countInRemaining: null })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.kit.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('rejects stale countdown Draws after stop and rapid restart', async () => {
    looper.setConfig(cfg({ countInBeats: 4 }))
    await looper.start()
    for (let step = 0; step <= 12; step++) audio.runTick(100 + step / 24)
    const stale = audio.draws.splice(0)
    audio.stop()
    looper.setConfig(cfg({ countInBeats: 2, loopSection: { start: 1, end: 1 } }))
    await looper.start()
    stale.forEach(({ callback }) => callback())
    expect(looper.getState()).toMatchObject({ status: 'countIn', countInRemaining: 2, chordIndex: 1, nextChordIndex: null })
    run(0, 24)
    expect(looper.getState()).toMatchObject({ status: 'playing', countInRemaining: null, chordIndex: 1 })
    expect(audio.handlers.size).toBe(1)
  })

  it('adopts the latest durations and section while startup is loading', async () => {
    const pending = deferred()
    audio.createSampler.mockReturnValueOnce(pending.promise)
    looper.setConfig(cfg({ countInBeats: 2 }))
    const started = looper.start()
    looper.setConfig(cfg({ countInBeats: 2, durations: [4, 0.5], loopSection: { start: 1, end: 1 } }))
    pending.resolve(voice())
    await started
    expect(looper.getState()).toMatchObject({ status: 'countIn', chordIndex: 1, countInRemaining: 2 })
    run(0, 27)
    expect(looper.getState()).toMatchObject({ status: 'playing', chordIndex: 1, nextChordIndex: 1 })
    run(28, 30)
    expect(looper.getState()).toMatchObject({ status: 'playing', chordIndex: 1, nextChordIndex: null })
  })

  it('swaps to the latest requested instrument during counting without playing early', async () => {
    looper.setConfig(cfg({ countInBeats: 2 }))
    await looper.start()
    const oldRequest = deferred()
    const obsolete = voice()
    const piano = voice()
    audio.createSampler.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(piano)
    looper.setConfig(cfg({ countInBeats: 2, instrument: 'guitar-nylon' }))
    looper.setConfig(cfg({ countInBeats: 2, instrument: 'piano' }))
    await flush()
    oldRequest.resolve(obsolete)
    await flush()
    run(0, 23)
    expect(piano.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    run(24, 24)
    expect(piano.sampler.triggerAttackRelease).toHaveBeenCalled()
    expect(obsolete.release).toHaveBeenCalledOnce()
    expect(piano.release).not.toHaveBeenCalled()
  })

  it.each([1, 2, 3, 4, 6, 8])('keeps %i-beat target changes on their audio times when callbacks run ahead', async (beats) => {
    looper.setConfig(cfg({ beatsPerChord: beats }))
    await looper.start()
    const boundary = beats * 12
    const preview = boundary - Math.min(12, boundary / 2)
    for (let step = 0; step <= boundary; step++) audio.runTick(100 + step / 24)
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: null })
    const through = (time: number) => {
      while (audio.draws[0] && audio.draws[0].time <= time) audio.draws.shift()!.callback()
    }
    through(100 + (preview - 1) / 24)
    expect(looper.getState().nextChordIndex).toBeNull()
    through(100 + preview / 24)
    expect(looper.getState()).toMatchObject({ chordIndex: 0, nextChordIndex: 1 })
    through(100 + boundary / 24)
    expect(looper.getState()).toMatchObject({ chordIndex: 1, nextChordIndex: null })
  })
})
