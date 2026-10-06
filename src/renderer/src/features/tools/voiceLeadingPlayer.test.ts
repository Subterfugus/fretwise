import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceLeadingPlayer } from './voiceLeadingPlayer'
import type { InstrumentId, PlayMode } from '@/audio/engine'

const audio = vi.hoisted(() => {
  const handlers = new Set<() => void>()
  const draws: { callback: () => void; time: number }[] = []
  return {
    handlers, draws, now: 100,
    createSampler: vi.fn(), wait: vi.fn(),
    stop: vi.fn(() => [...handlers].forEach((handler) => handler())),
    register: vi.fn((handler: () => void) => {
      handlers.add(handler)
      return vi.fn(() => handlers.delete(handler))
    })
  }
})

vi.mock('tone', () => ({
  now: () => audio.now,
  getDraw: () => ({ schedule: (callback: () => void, time: number) => audio.draws.push({ callback, time }) })
}))
vi.mock('@/audio/engine', () => ({ engine: {
  stop: audio.stop, createSampler: audio.createSampler, wait: audio.wait, registerStopHandler: audio.register
} }))

const voice = () => ({ sampler: { triggerAttackRelease: vi.fn() }, bus: {}, release: vi.fn() })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('voice leading sequence playback', () => {
  let player: VoiceLeadingPlayer
  let active: ReturnType<typeof voice>
  let end: ReturnType<typeof deferred<void>>
  const start = (mode: PlayMode = 'block', chords = [[67, 60, 64], [62, 65, 69]]) =>
    player.start(chords, 120, 4, mode, 'guitar-acoustic')

  beforeEach(() => {
    audio.handlers.clear()
    audio.draws.length = 0
    audio.now = 100
    vi.clearAllMocks()
    player = new VoiceLeadingPlayer()
    active = voice()
    end = deferred<void>()
    audio.createSampler.mockReset().mockResolvedValue(active)
    audio.wait.mockReset().mockReturnValue(end.promise)
  })
  afterEach(() => { player.stop(); end.resolve() })

  it('keeps snapshots stable and subscriptions removable', async () => {
    const initial = player.getState()
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    expect(player.getState()).toBe(initial)
    player.stop()
    expect(listener).not.toHaveBeenCalled()
    await start()
    expect(listener).toHaveBeenCalledTimes(2)
    const playing = player.getState()
    expect(player.getState()).toBe(playing)
    unsubscribe()
    player.stop()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops other tools before registering, and loads only the selected instrument', async () => {
    const other = vi.fn()
    audio.handlers.add(other)
    await player.start([[60]], 90, 2, 'block', 'piano')
    expect(other).toHaveBeenCalledOnce()
    expect(audio.stop.mock.invocationCallOrder[0]).toBeLessThan(audio.register.mock.invocationCallOrder[0])
    expect(audio.createSampler).toHaveBeenCalledWith('piano')
    expect(player.getState()).toEqual({ status: 'playing', index: -1, error: null })
  })

  it('schedules finite block chords by MIDI pitch on the audio clock', async () => {
    await start()
    expect(active.sampler.triggerAttackRelease.mock.calls).toEqual([
      ['C4', 1.9, 100.05, 0.85], ['E4', 1.9, 100.05, 0.85], ['G4', 1.9, 100.05, 0.85],
      ['D4', 1.9, 102.05, 0.85], ['F4', 1.9, 102.05, 0.85], ['A4', 1.9, 102.05, 0.85]
    ])
    expect(audio.wait).toHaveBeenCalledOnce()
    expect(audio.wait.mock.calls[0][0]).toBeCloseTo(4.05)
    expect(audio.draws.map(({ time }) => time)).toEqual([100.05, 102.05])
  })

  it('strums low to high with a short stagger and one shared chord boundary', async () => {
    await start('strum', [[67, 60, 64]])
    const calls = active.sampler.triggerAttackRelease.mock.calls
    calls.forEach((call, index) => {
      expect(call[2]).toBeCloseTo(100.05 + index * 0.035)
      expect(call[1]).toBeCloseTo(1.9 - index * 0.035)
      expect(call[3]).toBeCloseTo(0.85 - index * 0.03)
    })
    expect(calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4'])
    expect(audio.draws).toHaveLength(1)
  })

  it('spaces arpeggio pitches evenly across the chord duration', async () => {
    await start('arpeggio', [[60, 64, 67, 72]])
    const calls = active.sampler.triggerAttackRelease.mock.calls
    expect(calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4', 'C5'])
    calls.forEach((call, index) => {
      expect(call[2]).toBeCloseTo(100.05 + index * 0.5)
      expect(call[1]).toBeCloseTo(1.9 - index * 0.5)
    })
  })

  it('keeps a fast strum inside the chord duration', async () => {
    await player.start([[60, 64, 67, 72]], 300, 0.25, 'strum', 'piano')
    const calls = active.sampler.triggerAttackRelease.mock.calls
    expect(calls.every(([, duration, time]) => duration > 0 && time < 100.1)).toBe(true)
  })

  it('highlights only when each audio-clock Draw callback fires', async () => {
    await start()
    expect(player.getState().index).toBe(-1)
    audio.draws[0].callback()
    expect(player.getState().index).toBe(0)
    audio.draws[1].callback()
    expect(player.getState().index).toBe(1)
  })

  it('copies input before loading so edits do not change the scheduled sequence', async () => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const chords = [[60, 64, 67]]
    const pending = start('block', chords)
    chords[0][0] = 62
    chords.push([72])
    load.resolve(active)
    await pending
    expect(active.sampler.triggerAttackRelease.mock.calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4'])
    expect(audio.draws).toHaveLength(1)
  })

  it('finishes once, fades remaining tails, unregisters and ignores late Draw callbacks', async () => {
    await start()
    audio.draws[1].callback()
    end.resolve()
    await flush()
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: null })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
    audio.draws.forEach(({ callback }) => callback())
    player.stop()
    expect(player.getState().index).toBe(-1)
    expect(active.release).toHaveBeenCalledOnce()
  })

  it('stops on external engine.stop including navigation', async () => {
    await start()
    audio.stop()
    expect(player.getState().status).toBe('stopped')
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
    audio.draws[1].callback()
    expect(player.getState().index).toBe(-1)
  })

  it.each(['local', 'external'])('cancels a loading sequence through %s stop', async (method) => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start()
    expect(player.getState().status).toBe('loading')
    if (method === 'local') player.stop()
    else audio.stop()
    load.resolve(active)
    await pending
    expect(active.release).toHaveBeenCalledOnce()
    expect(active.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    expect(audio.draws).toHaveLength(0)
    expect(audio.wait).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: null })
  })

  it('repeated starts keep the latest request when sample loads finish out of order', async () => {
    const oldLoad = deferred<ReturnType<typeof voice>>()
    const stale = voice()
    audio.createSampler.mockReturnValueOnce(oldLoad.promise)
    const oldStart = start()
    await player.start([[72]], 60, 1, 'block', 'piano')
    oldLoad.resolve(stale)
    await oldStart
    expect(stale.release).toHaveBeenCalledOnce()
    expect(stale.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    expect(active.sampler.triggerAttackRelease).toHaveBeenCalledWith('C5', 0.95, 100.05, 0.85)
    expect(player.getState().status).toBe('playing')
    expect(audio.handlers.size).toBe(1)
  })

  it('an old completion or Draw callback cannot stop or change a new sequence', async () => {
    await start()
    const oldDraw = audio.draws[1].callback
    const nextVoice = voice()
    const nextEnd = deferred<void>()
    audio.createSampler.mockResolvedValueOnce(nextVoice)
    audio.wait.mockReturnValueOnce(nextEnd.promise)
    await player.start([[72]], 60, 1, 'block', 'piano')
    expect(active.release).toHaveBeenCalledOnce()
    oldDraw()
    end.resolve()
    await flush()
    expect(player.getState()).toEqual({ status: 'playing', index: -1, error: null })
    expect(nextVoice.release).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(1)
    player.stop()
    nextEnd.resolve()
  })

  it('shows loading failures and clears the error on retry', async () => {
    audio.createSampler.mockRejectedValueOnce(new Error('Samples missing'))
    await start()
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: 'Samples missing' })
    expect(audio.handlers.size).toBe(0)
    await start()
    expect(player.getState()).toEqual({ status: 'playing', index: -1, error: null })
  })

  it('ignores errors from an obsolete load after a successful retry', async () => {
    const oldLoad = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(oldLoad.promise)
    const oldStart = start()
    await start()
    oldLoad.reject(new Error('Obsolete failure'))
    await oldStart
    expect(player.getState()).toEqual({ status: 'playing', index: -1, error: null })
    expect(audio.handlers.size).toBe(1)
  })

  it('ignores a load failure after stopping', async () => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start()
    player.stop()
    load.reject(new Error('Late failure'))
    await pending
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: null })
  })

  it('releases and unregisters when scheduling fails', async () => {
    active.sampler.triggerAttackRelease.mockImplementationOnce(() => { throw new Error('Audio failure') })
    await start()
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: 'Audio failure' })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('clears an active sequence on empty input without loading again', async () => {
    await start()
    await start('block', [])
    expect(player.getState()).toEqual({ status: 'stopped', index: -1, error: null })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.createSampler).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it.each([
    { chords: [[]], bpm: 120, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[NaN]], bpm: 120, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[128]], bpm: 120, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[60.5]], bpm: 120, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[60]], bpm: 0, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[60]], bpm: Infinity, beats: 4, mode: 'block', instrument: 'piano' },
    { chords: [[60]], bpm: 120, beats: -1, mode: 'block', instrument: 'piano' },
    { chords: [[60]], bpm: 120, beats: NaN, mode: 'block', instrument: 'piano' },
    { chords: [[60]], bpm: 120, beats: 4, mode: 'invalid', instrument: 'piano' },
    { chords: [[60]], bpm: 120, beats: 4, mode: 'block', instrument: 'invalid' }
  ])('rejects invalid configuration without sound: %j', async ({ chords, bpm, beats, mode, instrument }) => {
    await player.start(chords, bpm, beats, mode as PlayMode, instrument as InstrumentId)
    expect(player.getState().status).toBe('stopped')
    expect(player.getState().error).toBeTruthy()
    expect(audio.createSampler).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
  })
})
