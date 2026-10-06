// Turns a stream of per-frame pitch readings into discrete "note played" events.
// Pure TS (time is passed in), so it is fully unit-testable.
//
//  * A note only counts after it has been stable (same pitch, confident, loud enough) for
//    `minStableMs` and at least `minFrames` frames. Pluck transients and half-detected
//    attacks are therefore ignored.
//  * Holding a note produces ONE event. A repeat of the same note needs a new pluck:
//    an RMS rise (`onsetRatio` x the quietest level since the last event) or a gap in the
//    signal (`releaseMs` of silence / no confident pitch).
//  * Different notes need no gap (hammer-ons, slides, fast runs).

export interface PitchFrame {
  /** timestamp in ms (monotonic) */
  t: number
  /** fractional MIDI number of the detected pitch, or null when nothing was detected */
  midi: number | null
  clarity: number
  rms: number
}

export interface NoteEvent {
  /** nearest integer MIDI note */
  midi: number
  /** mean deviation in cents over the stable window */
  cents: number
  /** time the note started being stable */
  t: number
}

export interface TrackerOptions {
  minStableMs?: number
  minFrames?: number
  /** tolerated gap of unusable frames inside a note */
  dropoutMs?: number
  minClarity?: number
  rmsGate?: number
  /** how far (semitones) a frame may drift from the candidate's mean and still belong to it */
  driftSemitones?: number
  /** silence / no-pitch time after which the same note may be played again */
  releaseMs?: number
  /** RMS rise (relative to the quietest level since the last event) that counts as a new pluck */
  onsetRatio?: number
}

const DEFAULT_OPTS: Required<TrackerOptions> = {
  minStableMs: 90,
  minFrames: 3,
  dropoutMs: 70,
  minClarity: 0.85,
  rmsGate: 0.008,
  driftSemitones: 0.6,
  releaseMs: 150,
  onsetRatio: 1.5
}

interface Candidate {
  startT: number
  lastT: number
  sum: number
  frames: number
  emitted: boolean
}

export class NoteTracker {
  private o: Required<TrackerOptions>
  private cand: Candidate | null = null
  /** MIDI of the last emitted note while it is considered to still be ringing */
  private latched: number | null = null
  private minRms = Infinity
  private lastValidT = -Infinity
  /** a new pluck of the latched note was seen: the same note may be emitted again */
  private rearmed = false

  constructor(opts: TrackerOptions = {}) {
    this.o = { ...DEFAULT_OPTS, ...opts }
  }

  reset() {
    this.cand = null
    this.latched = null
    this.minRms = Infinity
    this.lastValidT = -Infinity
    this.rearmed = false
  }

  push(f: PitchFrame): NoteEvent | null {
    const o = this.o
    const valid = f.midi !== null && Number.isFinite(f.midi) && f.clarity >= o.minClarity && f.rms >= o.rmsGate
    if (valid) this.lastValidT = f.t

    // the previous note has died away: it may be played again
    if (this.latched !== null && f.t - this.lastValidT > o.releaseMs) {
      this.latched = null
      this.minRms = Infinity
      this.rearmed = false
    }

    // re-pluck detection: RMS jumps well above the quietest level since the last event
    if (this.latched !== null) {
      if (f.rms < this.minRms) this.minRms = f.rms
      else if (valid && f.rms >= Math.max(o.onsetRatio * this.minRms, o.rmsGate * 2) && !this.rearmed) {
        this.rearmed = true
        this.cand = null // restart stability counting from the new attack
      }
    }

    if (!valid) {
      if (this.cand && f.t - this.cand.lastT > o.dropoutMs) this.cand = null
      return null
    }

    const midi = f.midi as number
    let c = this.cand
    if (c && f.t - c.lastT <= o.dropoutMs && Math.abs(midi - c.sum / c.frames) <= o.driftSemitones) {
      c.lastT = f.t
      c.sum += midi
      c.frames++
    } else {
      c = this.cand = { startT: f.t, lastT: f.t, sum: midi, frames: 1, emitted: false }
    }

    if (!c.emitted && f.t - c.startT >= o.minStableMs && c.frames >= o.minFrames) {
      c.emitted = true
      const mean = c.sum / c.frames
      const note = Math.round(mean)
      if (this.latched === note && !this.rearmed) return null // still the same ringing note
      this.latched = note
      this.rearmed = false
      this.minRms = f.rms
      return { midi: note, cents: (mean - note) * 100, t: c.startT }
    }
    return null
  }
}
