// SampleEngine: plays real recorded instrument samples via Tone.Sampler.
// Samples live in public/samples/<instrument>/ (fetched by scripts/fetch-samples.mjs).
//
// Stopping: Tone schedules notes on the audio clock, so once triggerAttackRelease()
// has been called for a future time there is no way to cancel that single note. To make
// stop() really silent we route every "session" of playback through its own Sampler
// (sharing the already-decoded buffers) and fade-out + dispose the whole sampler on
// stop(). Async entry points also capture an `epoch` that stop() bumps, so a call that
// was still waiting on Tone.start()/sample loading when stop() ran never schedules.
import * as Tone from 'tone'
import { midiToName } from '@/theory/notes'

export type InstrumentId = 'guitar-acoustic' | 'guitar-nylon' | 'guitar-electric' | 'piano'

export const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'guitar-acoustic', label: 'Acoustic guitar (steel)' },
  { id: 'guitar-nylon', label: 'Classical guitar (nylon)' },
  { id: 'guitar-electric', label: 'Electric guitar (clean)' },
  { id: 'piano', label: 'Piano' }
]

export type PlayMode = 'block' | 'strum' | 'arpeggio'

/** A note may be given as MIDI number or name with octave ("E2", "C#4"). */
export type Pitch = number | string

export interface SeqEvent {
  notes: Pitch[]
  /** Duration of this event in beats */
  beats: number
  mode?: PlayMode
}

type Manifest = Record<InstrumentId, Record<string, string>>

const toName = (p: Pitch): string => (typeof p === 'number' ? midiToName(p) : p)

interface Voice {
  sampler: Tone.Sampler
  fade: Tone.Gain
}

class SampleEngine {
  private manifestPromise: Promise<Manifest> | null = null
  private manifestCache: Manifest | null = null
  private buffers = new Map<InstrumentId, Tone.ToneAudioBuffers>()
  private loading = new Map<InstrumentId, Promise<Tone.ToneAudioBuffers>>()
  private voices = new Map<InstrumentId, Voice>()
  private output: Tone.Gain | null = null
  private click: { synth: Tone.MembraneSynth; fade: Tone.Gain } | null = null
  private sleepers = new Set<() => void>()
  /** Bumped by stop(); async playback aborts when it changed while it was waiting. */
  private epoch = 0
  instrument: InstrumentId = 'guitar-acoustic'
  /** 0..1 */
  volume = 0.8
  private listeners = new Set<() => void>()

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    this.listeners.forEach((f) => f())
  }

  private getManifest(): Promise<Manifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch('./samples/manifest.json')
        .then((r) => {
          if (!r.ok) throw new Error('Sample manifest missing - run `npm run fetch-samples`')
          return r.json() as Promise<Manifest>
        })
        .catch((e) => {
          this.manifestPromise = null // allow a retry
          throw e
        })
    }
    return this.manifestPromise
  }

  private out(): Tone.Gain {
    if (!this.output) {
      const reverb = new Tone.Reverb({ decay: 1.6, wet: 0.15 }).toDestination()
      this.output = new Tone.Gain(this.volume).connect(reverb)
    }
    return this.output
  }

  setVolume(v: number) {
    this.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8
    if (this.output) this.output.gain.rampTo(this.volume, 0.05)
    this.emit()
  }

  isLoaded(id: InstrumentId = this.instrument): boolean {
    return this.buffers.has(id)
  }

  /** The (session) sampler for an instrument, built from its already-decoded buffers. */
  private voice(id: InstrumentId): Voice {
    let v = this.voices.get(id)
    if (!v) {
      const bufs = this.buffers.get(id)
      if (!bufs) throw new Error(`Samples for ${id} are not loaded`)
      const names = Object.keys(this.manifestCache?.[id] ?? {})
      const urls: Record<string, Tone.ToneAudioBuffer> = {}
      for (const n of names) urls[n] = bufs.get(n)
      const sampler = new Tone.Sampler({ urls: urls as never, release: 1.2 })
      const fade = new Tone.Gain(1).connect(this.out())
      sampler.connect(fade)
      v = { sampler, fade }
      this.voices.set(id, v)
    }
    return v
  }
  load(id: InstrumentId = this.instrument): Promise<Tone.Sampler> {
    const bufs = this.buffers.get(id)
    if (bufs) return Promise.resolve(this.voice(id).sampler)
    let p = this.loading.get(id)
    if (!p) {
      p = this.getManifest().then(
        (m) =>
          new Promise<Tone.ToneAudioBuffers>((resolve, reject) => {
            const urls = m[id]
            if (!urls || !Object.keys(urls).length) {
              reject(new Error(`No samples listed for ${id} - run \`npm run fetch-samples\``))
              return
            }
            this.manifestCache = m
            const b: Tone.ToneAudioBuffers = new Tone.ToneAudioBuffers({
              urls,
              baseUrl: `./samples/${id}/`,
              onload: () => {
                this.buffers.set(id, b)
                this.emit()
                resolve(b)
              },
              onerror: (e: Error) => reject(e)
            })
          })
      )
      p = p.catch((e) => {
        this.loading.delete(id) // allow a retry
        throw e
      })
      this.loading.set(id, p)
    }
    return p.then(() => this.voice(id).sampler)
  }

  async setInstrument(id: InstrumentId) {
    this.instrument = id
    this.emit()
    await this.load(id)
  }

  /** Must be called from a user gesture before the first sound (browser autoplay rule). */
  private async ready(): Promise<Tone.Sampler> {
    if (Tone.getContext().state !== 'running') await Tone.start()
    return this.load(this.instrument)
  }

  /** Cancellable sleep: stop() resolves every pending wait immediately. */
  wait(seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.sleepers.delete(done)
        resolve()
      }
      const timer = setTimeout(done, Math.max(0, seconds) * 1000)
      this.sleepers.add(done)
    })
  }

  /** Silence everything, including notes already scheduled for the future, and resolve pending waits. */
  stop() {
    this.epoch++
    const dying: Voice[] = [...this.voices.values()]
    this.voices.clear()
    const click = this.click
    this.click = null
    const now = Tone.getContext().state === 'closed' ? 0 : Tone.now()
    for (const v of dying) {
      try {
        v.fade.gain.cancelScheduledValues(now)
        v.fade.gain.rampTo(0, 0.02, now)
      } catch {
        /* context not running */
      }
      setTimeout(() => {
        try {
          v.sampler.dispose()
          v.fade.dispose()
        } catch {
          /* already disposed */
        }
      }, 2500)
    }
    if (click) {
      try {
        click.fade.gain.cancelScheduledValues(now)
        click.fade.gain.rampTo(0, 0.02, now)
      } catch {
        /* context not running */
      }
      setTimeout(() => {
        try {
          click.synth.dispose()
          click.fade.dispose()
        } catch {
          /* already disposed */
        }
      }, 500)
    }
    ;[...this.sleepers].forEach((f) => f())
    // Long-running players (backing-track looper, metronome) stop with everything else.
    ;[...this.stopHandlers].forEach((f) => {
      try {
        f()
      } catch (e) {
        console.error(e)
      }
    })
  }

  // ---------- additions for Transport-scheduled players (tools: looper, metronome) ----------

  private stopHandlers = new Set<() => void>()

  /** Run `fn` whenever stop() is called (including stop() issued by other features). Returns an unregister function. */
  registerStopHandler(fn: () => void): () => void {
    this.stopHandlers.add(fn)
    return () => this.stopHandlers.delete(fn)
  }

  /** Start the audio context if needed. Call from a user gesture. */
  async unlock(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start()
  }

  /** A fresh gain node feeding the shared output (volume + reverb). Caller owns and disposes it. */
  createBus(): Tone.Gain {
    return new Tone.Gain(1).connect(this.out())
  }

  /**
   * A private sampler (built from the shared decoded buffers) that engine.stop()'s fade-out does not
   * touch, for playback scheduled on Tone.Transport. `release()` fades it out and disposes it.
   */
  async createSampler(id: InstrumentId = this.instrument): Promise<{ sampler: Tone.Sampler; bus: Tone.Gain; release: () => void }> {
    await this.unlock()
    await this.load(id)
    const bufs = this.buffers.get(id)
    if (!bufs) throw new Error(`Samples for ${id} are not loaded`)
    const urls: Record<string, Tone.ToneAudioBuffer> = {}
    for (const n of Object.keys(this.manifestCache?.[id] ?? {})) urls[n] = bufs.get(n)
    const sampler = new Tone.Sampler({ urls: urls as never, release: 1.2 })
    const bus = this.createBus()
    sampler.connect(bus)
    let released = false
    return {
      sampler,
      bus,
      release: () => {
        if (released) return
        released = true
        try {
          bus.gain.cancelScheduledValues(Tone.now())
          bus.gain.rampTo(0, 0.03)
        } catch {
          /* context not running */
        }
        setTimeout(() => {
          try {
            sampler.dispose()
            bus.dispose()
          } catch {
            /* already disposed */
          }
        }, 1500)
      }
    }
  }

  private async playNoteAt(ep: number, p: Pitch, duration: number, delay: number): Promise<void> {
    const s = await this.ready()
    if (ep !== this.epoch) return
    s.triggerAttackRelease(toName(p), duration, Tone.now() + 0.02 + delay)
  }

  /** Play a single note. duration in seconds. */
  async playNote(p: Pitch, duration = 1.5, delay = 0) {
    return this.playNoteAt(this.epoch, p, duration, delay)
  }

  /**
   * Play several notes. 'block' = together, 'strum' = quick guitar strum (low->high),
   * 'arpeggio' = one by one with `gap` seconds between. Resolves with the seconds until the sound ends.
   */
  async playNotes(notes: Pitch[], mode: PlayMode = 'strum', opts: { gap?: number; duration?: number; delay?: number } = {}) {
    const ep = this.epoch
    const s = await this.ready()
    if (ep !== this.epoch) return 0
    const names = notes.map(toName)
    const t0 = Tone.now() + 0.02 + (opts.delay ?? 0)
    const gap = opts.gap ?? (mode === 'strum' ? 0.035 : mode === 'arpeggio' ? 0.45 : 0)
    const dur = opts.duration ?? (mode === 'arpeggio' ? 1.2 : 2.2)
    names.forEach((n, i) => {
      const at = t0 + i * gap
      s.triggerAttackRelease(n, Math.max(0.1, mode === 'arpeggio' ? dur : dur - i * gap), at, mode === 'strum' ? Math.max(0.3, 0.85 - i * 0.03) : 0.85)
    })
    return t0 + gap * Math.max(0, names.length - 1) + dur - Tone.now()
  }

  /** Melodic interval: a then b (or together if harmonic). */
  async playInterval(a: Pitch, b: Pitch, kind: 'ascending' | 'descending' | 'harmonic' = 'ascending', gap = 0.7) {
    if (kind === 'harmonic') return this.playNotes([a, b], 'block', { duration: 2 })
    const ep = this.epoch
    const [x, y] = kind === 'ascending' ? [a, b] : [b, a]
    await this.playNoteAt(ep, x, gap + 0.3, 0)
    if (ep !== this.epoch) return 0
    await this.playNoteAt(ep, y, 1.5, gap)
    return ep !== this.epoch ? 0 : gap + 1.5 + 0.02
  }

  /** Play a sequence of events (chord progression or melody) at a tempo. Resolves when finished (or stopped). */
  async playSequence(events: SeqEvent[], bpm = 90): Promise<void> {
    const ep = this.epoch
    const s = await this.ready()
    if (ep !== this.epoch) return
    const beat = 60 / bpm
    let t = Tone.now() + 0.05
    for (const ev of events) {
      const names = ev.notes.map(toName)
      const mode = ev.mode ?? (names.length > 1 ? 'strum' : 'block')
      const gap = mode === 'strum' ? 0.03 : mode === 'arpeggio' ? (ev.beats * beat) / names.length : 0
      const dur = ev.beats * beat * 0.95
      names.forEach((n, i) => s.triggerAttackRelease(n, Math.max(0.1, dur - i * gap), t + i * gap))
      t += ev.beats * beat
    }
    await this.wait(t - Tone.now())
  }

  /** Metronome / rhythm clicks. `pattern` is a list of note lengths in beats (negative = rest). */
  async playRhythm(pattern: number[], bpm = 80, opts: { countIn?: number; pitch?: Pitch } = {}): Promise<void> {
    const ep = this.epoch
    if (Tone.getContext().state !== 'running') await Tone.start()
    // Load first: computing start times before an awaited sample load would put them in the past.
    const s = opts.pitch !== undefined ? await this.load(this.instrument) : null
    if (ep !== this.epoch) return
    if (!this.click) {
      const fade = new Tone.Gain(1).connect(this.out())
      const synth = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } }).connect(fade)
      this.click = { synth, fade }
    }
    const click = this.click.synth
    const beat = 60 / bpm
    let t = Tone.now() + 0.05
    for (let i = 0; i < (opts.countIn ?? 0); i++) {
      click.triggerAttackRelease(i === 0 ? 'C5' : 'G4', 0.05, t)
      t += beat
    }
    for (const len of pattern) {
      if (len > 0) {
        if (s) s.triggerAttackRelease(toName(opts.pitch!), Math.max(0.08, len * beat * 0.9), t)
        else click.triggerAttackRelease('C4', 0.05, t)
      }
      t += Math.abs(len) * beat // negative length = rest
    }
    await this.wait(t - Tone.now())
  }
}

export const engine = new SampleEngine()
