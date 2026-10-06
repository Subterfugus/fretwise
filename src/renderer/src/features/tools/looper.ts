// Backing-track looper runtime. Everything is scheduled on Tone.Transport with one repeating callback on a
// 12-ticks-per-beat grid, so timing is sample-accurate and the loop never drifts or glitches at the seam.
// Config changes (tempo, key/chords, style, bass, drums) are read by the callback on every step, so they
// apply live: tempo immediately, chord/style changes from the next grid step. Duration, section and
// chord-count edits stop/reset the session so previously scheduled sounds cannot use obsolete timing.
import * as Tone from 'tone'
import { engine, InstrumentId } from '@/audio/engine'
import { ChordType, buildChord } from '@/theory/chords'
import { midiToName, pitchClass } from '@/theory/notes'
import { shapeMidis } from '@/theory/guitar'
import { bestVoicing } from './voicings'
import { createKit, Kit } from './kit'
import { buildLoopTimeline, loopTimelineTiming, normalizeChordDurations, normalizeLoopSection, normalizeCountInBeats, type LoopSection, type LoopTimeline } from './looperTiming'
import {
  BassHit,
  BassMode,
  ChordHit,
  DrumHit,
  DrumMode,
  StrumStyle,
  TICKS_PER_BEAT,
  bassHits,
  bassMidi,
  chordHits,
  drumBar,
  drumBarBeats
} from './patterns'

export interface LoopChord {
  root: string
  type: ChordType
}

export interface LoopConfig {
  chords: LoopChord[]
  bpm: number
  beatsPerChord: number
  durations?: number[]
  loopSection?: LoopSection | null
  countInBeats?: number
  style: StrumStyle
  bass: BassMode
  drums: DrumMode
  instrument: InstrumentId
  /** 0..1 */
  volume: number
}

export interface LoopState {
  status: 'idle' | 'loading' | 'countIn' | 'playing'
  chordIndex: number
  nextChordIndex: number | null
  countInRemaining?: number | null
  error?: string
}

interface Plan {
  voicings: number[][]
  rootPcs: number[]
  drumAt: Map<number, DrumHit[]>
  drumBarTicks: number
  timeline: LoopTimeline
  durations: number[]
  chordHitsByIndex: Map<number, ChordHit[]>[]
  bassByIndex: Map<number, BassHit[]>[]
}

const group = <T extends { tick: number }>(xs: T[]): Map<number, T[]> => {
  const m = new Map<number, T[]>()
  for (const x of xs) m.set(x.tick, [...(m.get(x.tick) ?? []), x])
  return m
}

/** Pre-compute everything the audio callback needs. Pure apart from the voicing search (cached per chord). */
export function buildPlan(cfg: LoopConfig): Plan {
  const barBeats = drumBarBeats(cfg.beatsPerChord)
  const barTicks = barBeats * TICKS_PER_BEAT
  const durations = normalizeChordDurations(cfg.durations, cfg.chords.length, cfg.beatsPerChord)
  const timeline = buildLoopTimeline(durations, normalizeLoopSection(cfg.loopSection, cfg.chords.length))
  return {
    timeline, durations,
    chordHitsByIndex: durations.map((beats) => group(chordHits(cfg.style, beats))),
    bassByIndex: durations.map((beats) => group(bassHits(cfg.bass, cfg.style, beats))),
    voicings: cfg.chords.map((c) => voicingFor(c)),
    rootPcs: cfg.chords.map((c) => pitchClass(c.root)),
    drumAt: group(drumBar(cfg.drums, cfg.style, barBeats).filter((h) => h.tick < barTicks)),
    drumBarTicks: barTicks
  }
}

const voicingCache = new Map<string, number[]>()
export function voicingFor(c: LoopChord): number[] {
  const k = c.root + '|' + c.type
  let v = voicingCache.get(k)
  if (!v) {
    try {
      v = shapeMidis(bestVoicing(c.root, c.type))
    } catch {
      // unplayable on guitar: stack the chord tones above E2
      const root = buildChord(c.root, c.type).map(pitchClass)
      let m = 40 + ((root[0] - 4 + 12) % 12)
      v = root.map((pc) => {
        while (m % 12 !== pc) m++
        return m++
      })
    }
    voicingCache.set(k, v)
  }
  return v
}

class Looper {
  private cfg: LoopConfig | null = null
  private plan: Plan | null = null
  private token = 0
  private planRevision = 0
  private step = 0
  private countInTicks = 0
  private state: LoopState = { status: 'idle', chordIndex: 0, nextChordIndex: null }
  private listeners = new Set<() => void>()
  private rt: { sampler: Tone.Sampler; bus: Tone.Gain; release: () => void; instrument: InstrumentId } | null = null
  private pendingInstrument: { id: InstrumentId } | null = null
  private kit: Kit | null = null
  private eventId: number | null = null
  private unregister: (() => void) | null = null

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): LoopState => this.state
  private set(s: Partial<LoopState>) {
    this.state = { ...this.state, ...s }
    this.listeners.forEach((f) => f())
  }

  /** Update the live configuration (cheap; call on every UI change). */
  setConfig(cfg: LoopConfig) {
    const old = this.cfg
    const oldPlan = this.plan
    const nextPlan = buildPlan(cfg)
    const structureChanged = !!old && (old.beatsPerChord !== cfg.beatsPerChord ||
      old.chords.length !== cfg.chords.length ||
      oldPlan?.durations.some((d, i) => d !== nextPlan.durations[i]) ||
      oldPlan?.timeline.chords.length !== nextPlan.timeline.chords.length ||
      oldPlan?.timeline.chords[0]?.chordIndex !== nextPlan.timeline.chords[0]?.chordIndex)
    const targetsChanged = !old || old.beatsPerChord !== cfg.beatsPerChord ||
      old.chords.length !== cfg.chords.length || old.chords.some((c, i) =>
        c.root !== cfg.chords[i].root || c.type !== cfg.chords[i].type)
    this.cfg = cfg
    this.plan = nextPlan
    if (targetsChanged || structureChanged) {
      this.planRevision++
      if (this.state.nextChordIndex !== null) this.set({ nextChordIndex: null })
    }
    if (!cfg.chords.length || structureChanged && (this.state.status === 'playing' || this.state.status === 'countIn')) {
      this.stop()
      return
    }
    if (this.state.status === 'idle' || this.state.status === 'loading') {
      this.set({ chordIndex: nextPlan.timeline.chords[0]?.chordIndex ?? 0 })
    }
    if (this.state.status === 'playing' || this.state.status === 'countIn') {
      const tr = Tone.getTransport()
      tr.bpm.rampTo(cfg.bpm, 0.05)
      this.rt?.bus.gain.rampTo(cfg.volume, 0.05)
      this.kit?.setVolume(cfg.volume)
      if (this.pendingInstrument?.id !== cfg.instrument) this.pendingInstrument = null
      if (this.rt && this.rt.instrument !== cfg.instrument && !this.pendingInstrument) void this.swapInstrument(cfg.instrument)
      if (this.state.chordIndex >= cfg.chords.length) this.set({ chordIndex: nextPlan.timeline.chords[0]?.chordIndex ?? 0 })
    }
  }

  private async swapInstrument(id: InstrumentId) {
    const tok = this.token
    const request = { id }
    this.pendingInstrument = request
    try {
      const next = await engine.createSampler(id)
      if (tok !== this.token || this.pendingInstrument !== request || !this.rt) {
        next.release()
        return
      }
      this.pendingInstrument = null
      next.bus.gain.value = this.cfg?.volume ?? 0.8
      const old = this.rt
      this.rt = { ...next, instrument: id }
      old.release()
      this.set({ error: undefined })
    } catch (e) {
      if (tok === this.token && this.pendingInstrument === request) {
        this.pendingInstrument = null
        this.set({ error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  async start(): Promise<void> {
    const cfg = this.cfg
    if (!cfg || !cfg.chords.length) return
    const countInBeats = normalizeCountInBeats(cfg.countInBeats)
    // Stop everything else (other playback, the metronome) and ourselves, then take over.
    this.teardown()
    engine.stop()
    const tok = ++this.token
    this.unregister = engine.registerStopHandler(() => this.stop())
    this.set({ status: 'loading', chordIndex: this.plan?.timeline.chords[0]?.chordIndex ?? 0, nextChordIndex: null, countInRemaining: countInBeats || null, error: undefined })
    let created: Awaited<ReturnType<typeof engine.createSampler>>
    let instrument: InstrumentId
    // Instrument selection can change while decoding samples. Only start with the latest choice.
    while (true) {
      instrument = this.cfg!.instrument
      try {
        created = await engine.createSampler(instrument)
      } catch (e) {
        if (tok !== this.token) return
        if (this.cfg?.instrument !== instrument) continue
        this.teardown()
        this.set({ status: 'idle', error: e instanceof Error ? e.message : String(e) })
        return
      }
      if (tok === this.token && this.cfg?.instrument === instrument) break
      created.release()
      if (tok !== this.token) return
    }
    const live = this.cfg ?? cfg
    this.rt = { ...created, instrument }
    created.bus.gain.value = live.volume
    this.kit = createKit(live.volume)
    this.step = 0
    this.countInTicks = countInBeats * TICKS_PER_BEAT
    const tr = Tone.getTransport()
    tr.stop()
    tr.cancel(0)
    tr.position = 0
    tr.bpm.value = live.bpm
    this.eventId = tr.scheduleRepeat((time) => this.tick(time, tok), `${Tone.getTransport().PPQ / TICKS_PER_BEAT}i`, 0)
    tr.start('+0.1')
    this.set({ status: this.countInTicks ? 'countIn' : 'playing', countInRemaining: this.countInTicks / TICKS_PER_BEAT || null })
  }

  stop(): void {
    this.teardown()
    this.set({ status: 'idle', chordIndex: this.plan?.timeline.chords[0]?.chordIndex ?? 0, nextChordIndex: null, countInRemaining: null })
  }

  private teardown() {
    this.token++
    this.pendingInstrument = null
    this.unregister?.()
    this.unregister = null
    const tr = Tone.getTransport()
    if (this.eventId !== null) {
      try {
        tr.clear(this.eventId)
      } catch {
        /* ignore */
      }
      this.eventId = null
      try {
        tr.stop()
        tr.cancel(0)
      } catch {
        /* ignore */
      }
    }
    this.rt?.release()
    this.rt = null
    this.kit?.release()
    this.kit = null
  }

  private tick(time: number, tok: number) {
    const cfg = this.cfg
    const plan = this.plan
    const rt = this.rt
    if (tok !== this.token || !cfg || !plan || !rt || !cfg.chords.length) return
    const revision = this.planRevision
    if (this.step < this.countInTicks) {
      if (this.step % TICKS_PER_BEAT === 0) {
        const remaining = (this.countInTicks - this.step) / TICKS_PER_BEAT
        this.kit?.hit(this.step === 0 ? 'clickAccent' : 'click', time, 1)
        Tone.getDraw().schedule(() => {
          if (tok === this.token && revision === this.planRevision) this.set({ status: 'countIn', countInRemaining: remaining })
        }, time)
      }
      this.step++
      return
    }
    const musicStep = this.step - this.countInTicks
    const timing = loopTimelineTiming(musicStep, plan.timeline)
    this.step++
    const ci = timing.chordIndex
    const t = timing.tick
    const spb = 60 / Tone.getTransport().bpm.value
    if (timing.previewInTicks !== null) {
      const next = plan.timeline.chords.find((c) => c.chordIndex === ci)!.nextChordIndex
      Tone.getDraw().schedule(() => {
        if (tok === this.token && revision === this.planRevision) this.set({ status: 'playing', countInRemaining: null, chordIndex: ci, nextChordIndex: next })
      }, time + timing.previewInTicks * spb / TICKS_PER_BEAT)
    }
    if (musicStep === 0 || timing.atBoundary || timing.atPreview || this.state.chordIndex !== ci || this.state.nextChordIndex !== timing.nextChordIndex) {
      Tone.getDraw().schedule(() => {
        if (tok === this.token && revision === this.planRevision &&
          (this.state.status !== 'playing' || this.state.chordIndex !== ci || this.state.nextChordIndex !== timing.nextChordIndex)) {
          this.set({ status: 'playing', countInRemaining: null, chordIndex: ci, nextChordIndex: timing.nextChordIndex })
        }
      }, time)
    }
    const notes = plan.voicings[ci] ?? []
    for (const h of plan.chordHitsByIndex[ci].get(t) ?? []) {
      if (!notes.length) break
      const dur = Math.max(0.1, h.beats * spb)
      if (h.kind === 'strum') {
        const order = h.dir === 'up' ? [...notes].reverse() : notes
        const gap = h.dir === 'up' ? 0.009 : 0.014
        order.forEach((m, i) => rt.sampler.triggerAttackRelease(midiToName(m), dur, time + i * gap, Math.max(0.25, h.vel - i * 0.02)))
      } else {
        const m = notes[Math.min(notes.length - 1, h.pickIndex ?? 0)]
        rt.sampler.triggerAttackRelease(midiToName(m), Math.max(0.3, h.beats * spb), time, h.vel)
      }
    }
    for (const b of plan.bassByIndex[ci].get(t) ?? []) {
      const m = bassMidi(plan.rootPcs[ci], b.tone === 'fifth')
      rt.sampler.triggerAttackRelease(midiToName(m), Math.max(0.15, b.beats * spb * 0.95), time, b.vel * 0.9)
    }
    if (this.kit) {
      for (const d of plan.drumAt.get(musicStep % plan.drumBarTicks) ?? []) this.kit.hit(d.drum, time, d.vel)
    }
  }
}

export const looper = new Looper()
