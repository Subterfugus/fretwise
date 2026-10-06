// The engine is tested against a fake Tone: what matters here is *when* notes get scheduled
// relative to stop() / repeated play clicks, not the audio itself.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  triggers: [] as string[],
  disposed: 0,
  rampedToZero: 0,
  started: 0,
  failManifest: 0
}))

vi.mock('tone', () => {
  class Node {
    gain = {
      rampTo: (v: number) => {
        if (v === 0) h.rampedToZero++
      },
      cancelScheduledValues: () => undefined
    }
    connect() {
      return this
    }
    disconnect() {
      return this
    }
    toDestination() {
      return this
    }
    dispose() {
      h.disposed++
    }
  }
  class Gain extends Node {}
  class Reverb extends Node {}
  class Sampler extends Node {
    triggerAttackRelease(n: string) {
      h.triggers.push(n)
    }
  }
  class MembraneSynth extends Node {
    triggerAttackRelease(n: string) {
      h.triggers.push('click:' + n)
    }
  }
  class ToneAudioBuffers {
    constructor(o: { urls: Record<string, string>; onload?: () => void }) {
      queueMicrotask(() => o.onload?.())
    }
    get() {
      return {}
    }
  }
  return {
    Gain,
    Reverb,
    Sampler,
    MembraneSynth,
    ToneAudioBuffers,
    now: () => 0,
    start: async () => {
      h.started++
    },
    getContext: () => ({ state: 'running' })
  }
})

import { engine } from './engine'

const events = [
  { notes: ['C4'], beats: 1 },
  { notes: ['E4'], beats: 1 },
  { notes: ['G4'], beats: 1 }
]

beforeEach(() => {
  h.triggers.length = 0
  h.failManifest = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (h.failManifest-- > 0) return { ok: false, json: async () => ({}) }
      return { ok: true, json: async () => ({ 'guitar-acoustic': { C4: 'C4.mp3' }, piano: { C4: 'C4.mp3' } }) }
    })
  )
})

describe('engine stop()', () => {
  it('a play call that was still waiting for samples never schedules once stop() ran', async () => {
    engine.stop()
    const p = engine.playSequence(events, 120)
    engine.stop() // before Tone.start()/sample loading finished
    await p
    expect(h.triggers).toEqual([])
  })

  it('two rapid plays: only the later one sounds (first-call race on Tone.start + load)', async () => {
    engine.stop()
    const p1 = engine.playSequence(events, 120)
    engine.stop()
    const p2 = engine.playSequence(events, 120)
    await p1
    expect(h.triggers).toEqual(['C4', 'E4', 'G4']) // exactly one run's worth, from p2
    engine.stop()
    await p2
    expect(h.triggers).toHaveLength(3)
  })

  it('stop() resolves a playSequence that is waiting out its own length', async () => {
    engine.stop()
    const p = engine.playSequence(events, 1) // 3 seconds long
    await vi.waitFor(() => expect(h.triggers).toHaveLength(3))
    const t0 = Date.now()
    engine.stop()
    await p
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('stop() silences already-scheduled notes by fading out and disposing the session sampler', async () => {
    engine.stop()
    const p = engine.playSequence(events, 1)
    await vi.waitFor(() => expect(h.triggers).toHaveLength(3))
    const before = h.rampedToZero
    engine.stop()
    expect(h.rampedToZero).toBeGreaterThan(before)
    await p
    // the next play uses a fresh sampler, not the faded one
    const q = engine.playSequence([{ notes: ['A4'], beats: 0.01 }], 600)
    await q
    expect(h.triggers.at(-1)).toBe('A4')
  })

  it('playInterval does not play its second note when stopped between the two', async () => {
    engine.stop()
    const p = engine.playInterval('C4', 'G4', 'ascending', 0)
    engine.stop()
    await p
    expect(h.triggers).toEqual([])
  })

  it('wait() resolves immediately on stop() and leaves no pending timers behind', async () => {
    const w = engine.wait(60)
    engine.stop()
    await w
    expect((engine as unknown as { sleepers: Set<unknown> }).sleepers.size).toBe(0)
  })

  it('playRhythm click track is cancellable and can be restarted without reusing the old synth', async () => {
    engine.stop()
    const p1 = engine.playRhythm([1, 1, -1, 1], 600, { countIn: 1 })
    await vi.waitFor(() => expect(h.triggers.some((t) => t.startsWith('click:'))).toBe(true))
    const n1 = h.triggers.length
    engine.stop()
    await p1
    const p2 = engine.playRhythm([1], 600)
    await p2
    expect(h.triggers.length).toBeGreaterThan(n1)
  })
})

describe('engine loading', () => {
  it('can retry after the manifest request failed (the rejection used to be cached forever)', async () => {
    ;(engine as unknown as { manifestPromise: unknown }).manifestPromise = null // earlier tests cached a good manifest
    h.failManifest = 1
    await expect(engine.load('piano')).rejects.toThrow(/manifest/i)
    await expect(engine.load('piano')).resolves.toBeDefined()
    expect(engine.isLoaded('piano')).toBe(true)
  })

  it('rejects instruments missing from the manifest instead of hanging', async () => {
    await expect(engine.load('guitar-nylon')).rejects.toThrow(/No samples listed/)
  })
})
