import * as Tone from 'tone'
import { engine, type InstrumentId, type PlayMode } from '@/audio/engine'
import { midiToName } from '@/theory/notes'

export interface VoiceLeadingPlaybackState {
  status: 'stopped' | 'loading' | 'playing'
  /** -1 means no chord is currently sounding. */
  index: number
  error: string | null
}

type Voice = Awaited<ReturnType<typeof engine.createSampler>>
const INSTRUMENT_IDS: readonly InstrumentId[] = ['guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'piano']

export class VoiceLeadingPlayer {
  private state: VoiceLeadingPlaybackState = { status: 'stopped', index: -1, error: null }
  private listeners = new Set<() => void>()
  private token = 0
  private voice: Voice | null = null
  private unregister: (() => void) | null = null

  getState = (): VoiceLeadingPlaybackState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(state: VoiceLeadingPlaybackState) {
    if (this.state.status === state.status && this.state.index === state.index && this.state.error === state.error) return
    this.state = state
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
    this.set({ status: 'stopped', index: -1, error: null })
  }

  /** Resolves after scheduling; completion and cancellation are published through getState(). */
  async start(chords: number[][], bpm: number, beats: number, mode: PlayMode, instrument: InstrumentId): Promise<void> {
    this.teardown()
    if (Array.isArray(chords) && !chords.length) {
      this.set({ status: 'stopped', index: -1, error: null })
      return
    }

    let sequence: number[][]
    let seconds: number
    try {
      if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(beats) || beats <= 0) {
        throw new Error('Tempo and beats per chord must be positive numbers.')
      }
      seconds = beats * (60 / bpm)
      if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(seconds * chords.length)) {
        throw new Error('The sequence duration is invalid.')
      }
      if (!['block', 'strum', 'arpeggio'].includes(mode)) throw new Error('Choose a valid playback mode.')
      if (!INSTRUMENT_IDS.includes(instrument)) throw new Error('Choose a valid instrument.')
      if (!Array.isArray(chords) || chords.some((notes) => !Array.isArray(notes) || !notes.length ||
        notes.some((midi) => !Number.isInteger(midi) || midi < 0 || midi > 127))) {
        throw new Error('Every chord needs valid MIDI notes (0-127).')
      }
      sequence = chords.map((notes) => [...notes].sort((a, b) => a - b))
    } catch (error) {
      this.set({ status: 'stopped', index: -1, error: error instanceof Error ? error.message : String(error) })
      return
    }

    // Take over before registering our own handler, including while samples are still loading.
    engine.stop()
    const token = ++this.token
    this.unregister = engine.registerStopHandler(this.stop)
    this.set({ status: 'loading', index: -1, error: null })

    try {
      const created = await engine.createSampler(instrument)
      if (token !== this.token) {
        created.release()
        return
      }
      this.voice = created
      const start = Tone.now() + 0.05
      sequence.forEach((notes, index) => {
        const onset = start + index * seconds
        const gap = mode === 'arpeggio' ? seconds / notes.length :
          mode === 'strum' ? Math.min(0.035, seconds / notes.length) : 0
        notes.forEach((midi, noteIndex) => {
          const duration = Math.max(seconds / notes.length * 0.05, seconds * 0.95 - noteIndex * gap)
          created.sampler.triggerAttackRelease(midiToName(midi), duration, onset + noteIndex * gap,
            mode === 'strum' ? Math.max(0.3, 0.85 - noteIndex * 0.03) : 0.85)
        })
        Tone.getDraw().schedule(() => {
          if (token === this.token) this.set({ status: 'playing', index, error: null })
        }, onset)
      })
      this.set({ status: 'playing', index: -1, error: null })
      void this.complete(token, start + sequence.length * seconds)
    } catch (error) {
      if (token !== this.token) return
      this.teardown()
      this.set({ status: 'stopped', index: -1, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async complete(token: number, end: number) {
    try {
      await engine.wait(Math.max(0, end - Tone.now()))
      if (token !== this.token) return
      // release() fades the remaining sample tails and cancels all future notes on this voice.
      this.stop()
    } catch (error) {
      if (token !== this.token) return
      this.teardown()
      this.set({ status: 'stopped', index: -1, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export const voiceLeadingPlayer = new VoiceLeadingPlayer()
