import * as Tone from 'tone'
import { engine, type InstrumentId, type PlayMode } from '@/audio/engine'
import { midiToName } from '@/theory/notes'

export interface ReharmPlaybackStep {
  notes: number[]
  beats: number
  side: 'original' | 'working' | null
  /** -1 denotes a silent comparison gap. */
  index: number
}

export interface ReharmonisationPlaybackState {
  status: 'stopped' | 'loading' | 'playing'
  side: 'original' | 'working' | null
  index: number
  error: string | null
}

type Voice = Awaited<ReturnType<typeof engine.createSampler>>
const INSTRUMENT_IDS: readonly InstrumentId[] = ['guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'piano']

function snapshot(steps: ReharmPlaybackStep[], bpm: number, mode: PlayMode, instrument: InstrumentId): ReharmPlaybackStep[] {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 220) throw new Error('Tempo must be between 40 and 220 BPM.')
  if (!['block', 'strum', 'arpeggio'].includes(mode)) throw new Error('Choose a valid playback mode.')
  if (!INSTRUMENT_IDS.includes(instrument)) throw new Error('Choose a valid instrument.')
  if (!Array.isArray(steps) || steps.length > 129) throw new Error('Choose a sequence of at most 129 steps.')
  const sequence: ReharmPlaybackStep[] = []
  for (let i = 0; i < steps.length; i++) {
    if (!Object.hasOwn(steps, i)) throw new Error('Every playback step must be present.')
    const step = steps[i]
    if (!step || typeof step !== 'object') throw new Error('Every playback step must be valid.')
    const { beats, side, index, notes } = step
    if (!Number.isFinite(beats) || beats < 0.25 || beats > 32 || !Number.isInteger(beats * 4)) {
      throw new Error('Step durations must be quarter-beat increments between 0.25 and 32 beats.')
    }
    if (!Array.isArray(notes) || notes.length > 128) throw new Error('Every chord needs valid MIDI notes (0-127).')
    if (side === null) {
      if (index !== -1 || notes.length !== 0) throw new Error('A silent gap must have no notes and index -1.')
    } else if ((side !== 'original' && side !== 'working') || !Number.isSafeInteger(index) || index < 0 || notes.length === 0) {
      throw new Error('Every chord needs a valid side, row index and MIDI notes.')
    }
    const copied: number[] = []
    for (let n = 0; n < notes.length; n++) {
      if (!Object.hasOwn(notes, n) || !Number.isInteger(notes[n]) || notes[n] < 0 || notes[n] > 127) {
        throw new Error('Every chord needs valid MIDI notes (0-127).')
      }
      copied.push(notes[n])
    }
    sequence.push({ notes: copied.sort((a, b) => a - b), beats, side, index })
  }
  return sequence
}

export class ReharmonisationPlayer {
  private state: ReharmonisationPlaybackState = Object.freeze({ status: 'stopped', side: null, index: -1, error: null })
  private listeners = new Set<() => void>()
  private token = 0
  private voice: Voice | null = null
  private unregister: (() => void) | null = null

  getState = (): ReharmonisationPlaybackState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(state: ReharmonisationPlaybackState) {
    if (this.state.status === state.status && this.state.side === state.side &&
      this.state.index === state.index && this.state.error === state.error) return
    this.state = Object.freeze(state)
    this.listeners.forEach((listener) => listener())
  }

  private teardown() {
    this.token++
    this.unregister?.()
    this.unregister = null
    this.voice?.release()
    this.voice = null
  }

  stop = (): void => {
    this.teardown()
    this.set({ status: 'stopped', side: null, index: -1, error: null })
  }

  /** Resolves after scheduling; completion and cancellation are published through getState(). */
  async start(steps: ReharmPlaybackStep[], bpm: number, mode: PlayMode, instrument: InstrumentId): Promise<void> {
    this.teardown()
    if (Array.isArray(steps) && steps.length === 0) {
      this.set({ status: 'stopped', side: null, index: -1, error: null })
      return
    }
    let sequence: ReharmPlaybackStep[]
    try {
      sequence = snapshot(steps, bpm, mode, instrument)
    } catch (error) {
      this.set({ status: 'stopped', side: null, index: -1, error: error instanceof Error ? error.message : String(error) })
      return
    }

    // Take over before registering, so other sampled players also stop during loading.
    engine.stop()
    const token = ++this.token
    this.unregister = engine.registerStopHandler(this.stop)
    this.set({ status: 'loading', side: null, index: -1, error: null })
    if (token !== this.token) return

    try {
      const created = await engine.createSampler(instrument)
      if (token !== this.token) {
        created.release()
        return
      }
      this.voice = created
      const beat = 60 / bpm
      let onset = Tone.now() + 0.05
      for (const step of sequence) {
        const seconds = step.beats * beat
        const gap = !step.notes.length ? 0 : mode === 'arpeggio' ? seconds / step.notes.length :
          mode === 'strum' ? Math.min(0.035, seconds / step.notes.length) : 0
        step.notes.forEach((midi, noteIndex) => {
          const duration = Math.max(seconds / step.notes.length * 0.05, seconds * 0.95 - noteIndex * gap)
          created.sampler.triggerAttackRelease(midiToName(midi), duration, onset + noteIndex * gap,
            mode === 'strum' ? Math.max(0.3, 0.85 - noteIndex * 0.03) : 0.85)
        })
        Tone.getDraw().schedule(() => {
          if (token === this.token) this.set({ status: 'playing', side: step.side, index: step.index, error: null })
        }, onset)
        onset += seconds
      }
      this.set({ status: 'playing', side: null, index: -1, error: null })
      if (token === this.token) void this.complete(token, onset)
    } catch (error) {
      if (token !== this.token) return
      this.teardown()
      this.set({ status: 'stopped', side: null, index: -1, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async complete(token: number, end: number) {
    try {
      await engine.wait(Math.max(0, end - Tone.now()))
      if (token !== this.token) return
      this.stop()
    } catch (error) {
      if (token !== this.token) return
      this.teardown()
      this.set({ status: 'stopped', side: null, index: -1, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export const reharmonisationPlayer = new ReharmonisationPlayer()
