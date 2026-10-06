// Metronome runtime on Tone.Transport: one repeating callback every GRID_TICKS transport ticks. The bar position
// is counted in the callback, so time-signature / subdivision / accent changes apply live and the tempo trainer
// can change tempo exactly on a bar line (setValueAtTime at the scheduled audio time).
import * as Tone from 'tone'
import { engine } from '@/audio/engine'
import { createKit, Kit } from './kit'
import {
  GRID_TICKS,
  MetroTick,
  Subdivision,
  Trainer,
  TimeSig,
  barLengthTicks,
  barTicks,
  clampBpm,
  timeSigById,
  trainerBpm,
  transportBpm
} from './metro'

export interface MetroConfig {
  bpm: number
  sig: string
  sub: Subdivision
  accentFirst: boolean
  trainer: Trainer
  volume: number
}

export interface MetroState {
  status: 'idle' | 'loading' | 'playing'
  /** Pulse index within the bar, subdivision-free (for the beat dots). */
  pulse: number
  bar: number
  /** Tempo currently sounding (differs from the setting while the trainer runs). */
  bpm: number
  error?: string
}

class Metronome {
  private cfg: MetroConfig | null = null
  private token = 0
  private state: MetroState = { status: 'idle', pulse: -1, bar: 0, bpm: 120 }
  private listeners = new Set<() => void>()
  private kit: Kit | null = null
  private eventId: number | null = null
  private unregister: (() => void) | null = null
  private ts: TimeSig = timeSigById('4/4')
  private ticks = new Map<number, MetroTick>()
  private barLen = 0
  private tickInBar = 0
  private barIndex = 0
  /** Trainer baseline: BPM and the bar index it started at. */
  private trainBase = 120
  private trainBar0 = 0
  private lastTrainerEnabled = false

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): MetroState => this.state
  private set(s: Partial<MetroState>) {
    this.state = { ...this.state, ...s }
    this.listeners.forEach((f) => f())
  }

  private rebuild(cfg: MetroConfig) {
    this.ts = timeSigById(cfg.sig)
    this.ticks = new Map(barTicks(this.ts, cfg.sub, cfg.accentFirst).map((t) => [t.at, t]))
    this.barLen = barLengthTicks(this.ts)
  }

  setConfig(cfg: MetroConfig) {
    const prev = this.cfg
    this.cfg = { ...cfg, bpm: clampBpm(cfg.bpm) }
    this.rebuild(this.cfg)
    if (this.state.status !== 'playing') {
      this.set({ bpm: this.cfg.bpm })
      return
    }
    this.kit?.setVolume(cfg.volume)
    const tempoChanged = !prev || prev.bpm !== this.cfg.bpm || prev.sig !== this.cfg.sig || prev.trainer.enabled !== cfg.trainer.enabled
    if (tempoChanged) {
      // re-base the trainer on the newly chosen tempo
      this.trainBase = this.cfg.bpm
      this.trainBar0 = this.barIndex
      this.applyBpm(this.cfg.bpm, undefined)
    }
    if (prev && prev.sig !== this.cfg.sig) this.tickInBar = 0
  }

  private applyBpm(bpm: number, at: number | undefined) {
    const tr = Tone.getTransport()
    const v = transportBpm(this.ts, bpm)
    if (at === undefined) tr.bpm.value = v
    else tr.bpm.setValueAtTime(v, at)
  }

  async start(): Promise<void> {
    if (!this.cfg) return
    this.teardown()
    engine.stop()
    const tok = ++this.token
    this.unregister = engine.registerStopHandler(() => this.stop())
    this.set({ status: 'loading', error: undefined })
    try {
      await engine.unlock()
    } catch (e) {
      if (tok === this.token) {
        this.teardown()
        this.set({ status: 'idle', error: e instanceof Error ? e.message : String(e) })
      }
      return
    }
    if (tok !== this.token) return
    const cfg = this.cfg
    this.rebuild(cfg)
    this.kit = createKit(cfg.volume)
    this.tickInBar = 0
    this.barIndex = 0
    this.trainBase = cfg.bpm
    this.trainBar0 = 0
    this.lastTrainerEnabled = cfg.trainer.enabled
    const tr = Tone.getTransport()
    tr.stop()
    tr.cancel(0)
    tr.position = 0
    this.applyBpm(cfg.bpm, undefined)
    this.eventId = tr.scheduleRepeat((time) => this.tick(time, tok), `${GRID_TICKS}i`, 0)
    tr.start('+0.1')
    this.set({ status: 'playing', pulse: -1, bar: 0, bpm: cfg.bpm })
  }

  stop(): void {
    this.teardown()
    this.set({ status: 'idle', pulse: -1 })
  }

  private teardown() {
    this.token++
    this.unregister?.()
    this.unregister = null
    if (this.eventId !== null) {
      const tr = Tone.getTransport()
      try {
        tr.clear(this.eventId)
        tr.stop()
        tr.cancel(0)
      } catch {
        /* ignore */
      }
      this.eventId = null
    }
    this.kit?.release()
    this.kit = null
  }

  private tick(time: number, tok: number) {
    const cfg = this.cfg
    if (tok !== this.token || !cfg || !this.kit) return
    if (this.tickInBar >= this.barLen) {
      this.tickInBar = 0
      this.barIndex++
    }
    const pos = this.tickInBar
    this.tickInBar += GRID_TICKS
    if (pos === 0) {
      let bpm = cfg.bpm
      if (cfg.trainer.enabled) {
        bpm = trainerBpm(this.trainBase, cfg.trainer, this.barIndex - this.trainBar0)
        this.applyBpm(bpm, time)
      } else if (this.lastTrainerEnabled) {
        this.applyBpm(cfg.bpm, time)
      }
      this.lastTrainerEnabled = cfg.trainer.enabled
      const bar = this.barIndex
      Tone.getDraw().schedule(() => {
        if (tok === this.token) this.set({ bar, bpm })
      }, time)
    }
    const t = this.ticks.get(pos)
    if (!t) return
    if (t.level >= 0) {
      this.kit.hit(t.level === 2 ? 'clickAccent' : t.level === 1 ? 'clickMid' : 'click', time, t.level === 0 ? 0.75 : 1)
      const pulse = t.pulse
      Tone.getDraw().schedule(() => {
        if (tok === this.token) this.set({ pulse })
      }, time)
    } else {
      this.kit.hit('sub', time, 0.8)
    }
  }
}

export const metronome = new Metronome()
