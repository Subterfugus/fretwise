import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReharmonisationPlayer, type ReharmPlaybackStep } from './reharmonisationPlayer'
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
const chord = (notes = [67, 60, 64], beats = 4, side: 'original' | 'working' = 'original', index = 0): ReharmPlaybackStep =>
  ({ notes, beats, side, index })
const silent = (beats = 1): ReharmPlaybackStep => ({ notes: [], beats, side: null, index: -1 })
const stopped = { status: 'stopped', side: null, index: -1, error: null }
const playing = { status: 'playing', side: null, index: -1, error: null }

describe('reharmonisation sequence playback', () => {
  let player: ReharmonisationPlayer
  let active: ReturnType<typeof voice>
  let end: ReturnType<typeof deferred<void>>
  const start = (steps = [chord()], mode: PlayMode = 'block') => player.start(steps, 120, mode, 'guitar-acoustic')

  beforeEach(() => {
    audio.handlers.clear()
    audio.draws.length = 0
    audio.now = 100
    vi.clearAllMocks()
    player = new ReharmonisationPlayer()
    active = voice()
    end = deferred<void>()
    audio.createSampler.mockReset().mockResolvedValue(active)
    audio.wait.mockReset().mockReturnValue(end.promise)
  })
  afterEach(() => { player.stop(); end.resolve() })

  it('does not autoplay and keeps stable, immutable state snapshots', async () => {
    expect(audio.createSampler).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    const initial = player.getState()
    expect(player.getState()).toBe(initial)
    expect(Object.isFrozen(initial)).toBe(true)
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    player.stop()
    expect(listener).not.toHaveBeenCalled()
    await start()
    expect(listener).toHaveBeenCalledTimes(2)
    const scheduled = player.getState()
    expect(player.getState()).toBe(scheduled)
    unsubscribe()
    player.stop()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('takes shared audio ownership before loading the selected instrument', async () => {
    const other = vi.fn()
    audio.handlers.add(other)
    await player.start([chord()], 90, 'block', 'piano')
    expect(other).toHaveBeenCalledOnce()
    expect(audio.stop.mock.invocationCallOrder[0]).toBeLessThan(audio.register.mock.invocationCallOrder[0])
    expect(audio.createSampler).toHaveBeenCalledWith('piano')
    expect(player.getState()).toEqual(playing)
  })

  it('exchanges shared audio ownership with the existing Voice Leading player', async () => {
    const other = new VoiceLeadingPlayer()
    const otherVoice = voice()
    audio.createSampler.mockResolvedValueOnce(otherVoice)
    await other.start([[60]], 120, 4, 'block', 'piano')
    await start()
    expect(other.getState().status).toBe('stopped')
    expect(otherVoice.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(1)
    audio.createSampler.mockResolvedValueOnce(voice())
    await other.start([[72]], 120, 4, 'block', 'piano')
    expect(player.getState()).toEqual(stopped)
    expect(active.release).toHaveBeenCalledOnce()
    other.stop()
  })

  it('uses cumulative variable beat durations and leaves a silent comparison gap', async () => {
    await start([chord([67, 60, 64], 1.5), chord([62], 0.25, 'original', 1), silent(0.5), chord([72], 3, 'working', 0)])
    const calls = active.sampler.triggerAttackRelease.mock.calls
    expect(calls).toHaveLength(5)
    expect(calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4', 'D4', 'C5'])
    calls.forEach(([, duration, time], i) => {
      expect(duration).toBeCloseTo(i < 3 ? 0.7125 : i === 3 ? 0.11875 : 1.425)
      expect(time).toBeCloseTo(i < 3 ? 100.05 : i === 3 ? 100.8 : 101.175)
    })
    expect(audio.draws.map(({ time }) => time)).toEqual([100.05, 100.8, 100.925, 101.175])
    expect(audio.wait.mock.calls[0][0]).toBeCloseTo(2.675)
  })

  it('changes side and row only at the audio-clock step callbacks', async () => {
    await start([chord([60], 1, 'original', 3), silent(), chord([62], 1, 'working', 5)])
    expect(player.getState()).toEqual(playing)
    audio.draws[0].callback()
    expect(player.getState()).toEqual({ ...playing, side: 'original', index: 3 })
    audio.draws[1].callback()
    expect(player.getState()).toEqual(playing)
    audio.draws[2].callback()
    expect(player.getState()).toEqual({ ...playing, side: 'working', index: 5 })
  })

  it('strums sorted pitches with staggered velocities and a shared chord boundary', async () => {
    await start([chord([67, 60, 64], 2), chord([72], 0.25, 'working', 0)], 'strum')
    const calls = active.sampler.triggerAttackRelease.mock.calls
    expect(calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4', 'C5'])
    calls.slice(0, 3).forEach((call, index) => {
      expect(call[2]).toBeCloseTo(100.05 + index * 0.035)
      expect(call[1]).toBeCloseTo(0.95 - index * 0.035)
      expect(call[3]).toBeCloseTo(0.85 - index * 0.03)
    })
    expect(calls[3][2]).toBeCloseTo(101.05)
  })

  it('spaces arpeggio notes across each individual step duration', async () => {
    await start([chord([72, 67, 64, 60], 2), silent(0.25), chord([62, 65], 0.5, 'working', 0)], 'arpeggio')
    const calls = active.sampler.triggerAttackRelease.mock.calls
    expect(calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4', 'C5', 'D4', 'F4'])
    calls.slice(0, 4).forEach((call, index) => {
      expect(call[2]).toBeCloseTo(100.05 + index * 0.25)
      expect(call[1]).toBeCloseTo(0.95 - index * 0.25)
    })
    expect(calls[4][2]).toBeCloseTo(101.175)
    expect(calls[5][2]).toBeCloseTo(101.3)
    expect(calls[4][1]).toBeCloseTo(0.2375)
    expect(calls[5][1]).toBeCloseTo(0.1125)
  })

  it.each(['block', 'strum', 'arpeggio'] as PlayMode[])('bounds all attacks and releases within a fastest quarter beat in %s mode', async (mode) => {
    const notes = Array.from({ length: 128 }, (_, i) => 127 - i)
    await player.start([chord(notes, 0.25), silent(0.25), chord([72], 0.25, 'working', 0)], 220, mode, 'piano')
    const seconds = 0.25 * 60 / 220
    const calls = active.sampler.triggerAttackRelease.mock.calls
    calls.slice(0, 128).forEach(([, duration, at, velocity]) => {
      expect(Number.isFinite(duration)).toBe(true)
      expect(Number.isFinite(at)).toBe(true)
      expect(duration).toBeGreaterThan(0)
      expect(at).toBeGreaterThanOrEqual(100.05)
      expect(at).toBeLessThan(100.05 + seconds)
      expect(at + duration).toBeLessThanOrEqual(100.05 + seconds)
      expect(velocity).toBeGreaterThan(0)
    })
    expect(calls[128][2]).toBeCloseTo(100.05 + seconds * 2)
  })

  it('copies notes, beats and row metadata before asynchronous loading', async () => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const steps = [chord()]
    const pending = start(steps)
    steps[0].notes[0] = 72
    steps[0].beats = 1
    steps[0].side = 'working'
    steps[0].index = 12
    steps.push(chord([62]))
    load.resolve(active)
    await pending
    expect(active.sampler.triggerAttackRelease.mock.calls.map(([note]) => note)).toEqual(['C4', 'E4', 'G4'])
    expect(active.sampler.triggerAttackRelease.mock.calls[0][1]).toBeCloseTo(1.9)
    expect(audio.draws).toHaveLength(1)
    audio.draws[0].callback()
    expect(player.getState()).toEqual({ ...playing, side: 'original', index: 0 })
  })

  it('bases onsets on the audio clock after samples finish loading', async () => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start([chord([60], 1), silent(0.5), chord([62], 0.25, 'working', 0)])
    audio.now = 180
    load.resolve(active)
    await pending
    expect(active.sampler.triggerAttackRelease.mock.calls[0][2]).toBeCloseTo(180.05)
    expect(active.sampler.triggerAttackRelease.mock.calls[1][2]).toBeCloseTo(180.8)
    expect(audio.wait.mock.calls[0][0]).toBeCloseTo(0.925)
  })

  it('honours stop requested by a loading-state subscriber before creating a sampler', async () => {
    player.subscribe(() => {
      if (player.getState().status === 'loading') player.stop()
    })
    await start()
    expect(player.getState()).toEqual(stopped)
    expect(audio.createSampler).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
  })

  it('resolves start after scheduling and publishes completion once with late callbacks ignored', async () => {
    await start()
    audio.draws[0].callback()
    expect(player.getState().status).toBe('playing')
    end.resolve()
    await flush()
    expect(player.getState()).toEqual(stopped)
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
    audio.draws[0].callback()
    player.stop()
    expect(player.getState()).toEqual(stopped)
    expect(active.release).toHaveBeenCalledOnce()
  })

  it.each(['local', 'external'])('cancels scheduled notes and highlights through %s stop', async (method) => {
    await start([chord(), chord([62], 4, 'working', 0)])
    audio.draws[0].callback()
    if (method === 'local') player.stop()
    else audio.stop()
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
    audio.draws.forEach(({ callback }) => callback())
    end.resolve()
    await flush()
    expect(player.getState()).toEqual(stopped)
  })

  it.each(['local', 'external'])('cancels a pending sampler through %s stop', async (method) => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start()
    expect(player.getState()).toEqual({ ...playing, status: 'loading' })
    if (method === 'local') player.stop()
    else audio.stop()
    load.resolve(active)
    await pending
    expect(active.release).toHaveBeenCalledOnce()
    expect(active.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    expect(audio.draws).toHaveLength(0)
    expect(audio.wait).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
    expect(player.getState()).toEqual(stopped)
  })

  it('keeps the latest instrument start when earlier loads succeed out of order', async () => {
    const load = deferred<ReturnType<typeof voice>>()
    const stale = voice()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start()
    await player.start([chord([72], 1, 'working', 2)], 60, 'block', 'piano')
    load.resolve(stale)
    await pending
    expect(stale.release).toHaveBeenCalledOnce()
    expect(stale.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    expect(active.sampler.triggerAttackRelease).toHaveBeenCalledWith('C5', 0.95, 100.05, 0.85)
    expect(audio.createSampler.mock.calls.map(([instrument]) => instrument)).toEqual(['guitar-acoustic', 'piano'])
    expect(player.getState()).toEqual(playing)
    expect(audio.handlers.size).toBe(1)
  })

  it('survives repeated rapid start and stop while every sampler is loading', async () => {
    const requests = Array.from({ length: 8 }, () => ({ load: deferred<ReturnType<typeof voice>>(), created: voice() }))
    const pending = requests.map(({ load }) => {
      audio.createSampler.mockReturnValueOnce(load.promise)
      const request = start()
      player.stop()
      return request
    })
    for (const request of [...requests].reverse()) request.load.resolve(request.created)
    await Promise.all(pending)
    requests.forEach(({ created }) => {
      expect(created.release).toHaveBeenCalledOnce()
      expect(created.sampler.triggerAttackRelease).not.toHaveBeenCalled()
    })
    expect(audio.handlers.size).toBe(0)
    expect(audio.draws).toHaveLength(0)
    expect(player.getState()).toEqual(stopped)
  })

  it('ignores stale Draw callbacks and completion after a superseding start', async () => {
    await start()
    const oldDraw = audio.draws[0].callback
    const nextVoice = voice()
    const nextEnd = deferred<void>()
    audio.createSampler.mockResolvedValueOnce(nextVoice)
    audio.wait.mockReturnValueOnce(nextEnd.promise)
    await start([chord([72], 1, 'working', 4)])
    audio.draws[1].callback()
    oldDraw()
    end.resolve()
    await flush()
    expect(player.getState()).toEqual({ ...playing, side: 'working', index: 4 })
    expect(active.release).toHaveBeenCalledOnce()
    expect(nextVoice.release).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(1)
    player.stop()
    nextEnd.resolve()
  })

  it('publishes a load failure and clears the error on retry', async () => {
    audio.createSampler.mockRejectedValueOnce(new Error('Samples missing'))
    await start()
    expect(player.getState()).toEqual({ ...stopped, error: 'Samples missing' })
    expect(audio.handlers.size).toBe(0)
    await start()
    expect(player.getState()).toEqual(playing)
  })

  it.each(['stopped', 'superseded'])('ignores a sampler failure after the request was %s', async (scenario) => {
    const load = deferred<ReturnType<typeof voice>>()
    audio.createSampler.mockReturnValueOnce(load.promise)
    const pending = start()
    if (scenario === 'stopped') player.stop()
    else await start([chord([72], 1, 'working', 1)])
    load.reject(new Error('Stale failure'))
    await pending
    expect(player.getState()).toEqual(scenario === 'stopped' ? stopped : playing)
    expect(audio.handlers.size).toBe(scenario === 'stopped' ? 0 : 1)
  })

  it('releases and unregisters when scheduling fails', async () => {
    active.sampler.triggerAttackRelease.mockImplementationOnce(() => { throw new Error('Audio failure') })
    await start()
    expect(player.getState()).toEqual({ ...stopped, error: 'Audio failure' })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('releases and publishes a completion-wait failure', async () => {
    await start()
    end.reject(new Error('Clock failure'))
    await flush()
    expect(player.getState()).toEqual({ ...stopped, error: 'Clock failure' })
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('ignores a stale completion-wait failure', async () => {
    await start()
    const nextEnd = deferred<void>()
    audio.wait.mockReturnValueOnce(nextEnd.promise)
    await start()
    end.reject(new Error('Stale clock failure'))
    await flush()
    expect(player.getState()).toEqual(playing)
    player.stop()
    nextEnd.resolve()
  })

  it('clears playback on empty input without loading again', async () => {
    await start()
    await start([])
    expect(player.getState()).toEqual(stopped)
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.createSampler).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
  })

  it('accepts the bounded maximum comparison and duration limits', async () => {
    const steps = [
      ...Array.from({ length: 64 }, (_, i) => chord([0, 127], 32, 'original', i)), silent(32),
      ...Array.from({ length: 64 }, (_, i) => chord([60], 32, 'working', i))
    ]
    await player.start(steps, 40, 'block', 'guitar-electric')
    expect(audio.draws).toHaveLength(129)
    expect(active.sampler.triggerAttackRelease).toHaveBeenCalledTimes(192)
    expect(audio.wait.mock.calls[0][0]).toBeCloseTo(129 * 48 + 0.05)
    expect(player.getState()).toEqual(playing)
  })

  const invalidSteps: [string, unknown][] = [
    ['missing sequence', undefined], ['null sequence', null], ['array-like sequence', { 0: chord(), length: 1 }],
    ['sparse steps', new Array(2)], ['missing step', [undefined]], ['null step', [null]],
    ['too many steps', Array.from({ length: 130 }, () => chord())],
    ['inherited sparse step', Object.setPrototypeOf(new Array(1), { 0: chord() })],
    ['empty notes', [chord([])]], ['sparse notes', [chord(new Array(3))]],
    ['too many notes', [chord(new Array(129).fill(60))]],
    ['non-array notes', [{ ...chord(), notes: 'C4' }]],
    ['NaN MIDI', [chord([NaN])]], ['negative MIDI', [chord([-1])]], ['high MIDI', [chord([128])]],
    ['fractional MIDI', [chord([60.5])]], ['string MIDI', [{ ...chord(), notes: ['60'] }]],
    ['NaN beats', [chord([60], NaN)]], ['infinite beats', [chord([60], Infinity)]],
    ['zero beats', [chord([60], 0)]], ['negative beats', [chord([60], -1)]],
    ['non-quarter beats', [chord([60], 0.3)]], ['too many beats', [chord([60], 32.25)]],
    ['invalid side', [{ ...chord(), side: 'other' }]], ['missing side', [{ notes: [60], beats: 1, index: 0 }]],
    ['negative row', [chord([60], 1, 'original', -1)]], ['fractional row', [chord([60], 1, 'working', 0.5)]],
    ['NaN row', [chord([60], 1, 'working', NaN)]], ['unsafe row', [chord([60], 1, 'working', Number.MAX_SAFE_INTEGER + 1)]],
    ['sounding gap', [{ ...silent(), notes: [60] }]], ['gap row', [{ ...silent(), index: 0 }]],
    ['throwing input', [Object.defineProperty({}, 'beats', { get: () => { throw new Error('Bad accessor') } })]]
  ]
  it.each(invalidSteps)('rejects malformed input without sound: %s', async (_label, steps) => {
    await player.start(steps as ReharmPlaybackStep[], 120, 'block', 'piano')
    expect(player.getState().status).toBe('stopped')
    expect(player.getState().error).toBeTruthy()
    expect(audio.createSampler).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
  })

  it.each([
    { bpm: 0, mode: 'block', instrument: 'piano' }, { bpm: 39, mode: 'block', instrument: 'piano' },
    { bpm: 221, mode: 'block', instrument: 'piano' }, { bpm: NaN, mode: 'block', instrument: 'piano' },
    { bpm: Infinity, mode: 'block', instrument: 'piano' }, { bpm: 120, mode: 'other', instrument: 'piano' },
    { bpm: 120, mode: 'block', instrument: 'other' }
  ])('rejects invalid playback controls: %j', async ({ bpm, mode, instrument }) => {
    await player.start([chord()], bpm, mode as PlayMode, instrument as InstrumentId)
    expect(player.getState().status).toBe('stopped')
    expect(player.getState().error).toBeTruthy()
    expect(audio.createSampler).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    expect(audio.handlers.size).toBe(0)
  })

  it('stops an existing sequence when a replacement is invalid', async () => {
    await start()
    await start([chord([NaN])])
    expect(active.release).toHaveBeenCalledOnce()
    expect(audio.handlers.size).toBe(0)
    audio.draws[0].callback()
    expect(player.getState().status).toBe('stopped')
    expect(player.getState().error).toBeTruthy()
  })
})
