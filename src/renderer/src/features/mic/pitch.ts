// Monophonic pitch detection for guitar (about 70 Hz to 1.4 kHz). Pure TS: no React, no DOM.
//
// Algorithm: McLeod Pitch Method (normalised square difference function, key-maximum
// picking, parabolic interpolation) plus octave-error protection:
//   * the first key maximum that reaches `peakRatio` * the highest one is chosen, which
//     avoids "one octave too low" errors (2T, 3T are also peaks of a periodic signal);
//   * "one octave too high" errors (a weak fundamental under a strong 2nd/3rd harmonic,
//     typical of a low E through a laptop mic) are caught by checking the candidate's
//     sub-multiples: if a longer period fits the signal as well AND there is real spectral
//     energy at f/2 (or f/3), the lower frequency is the true fundamental. A real note has
//     no energy below its fundamental, so this does not misfire on genuinely high notes.

export interface PitchOptions {
  minFreq?: number
  maxFreq?: number
  /** Minimum NSDF peak height (0..1) to accept a pitch. */
  minClarity?: number
  /** Key maxima within this fraction of the highest are candidates (first wins). */
  peakRatio?: number
  /** RMS noise gate: quieter buffers return null. */
  rmsGate?: number
}

export interface PitchResult {
  freq: number
  /** NSDF peak height, 0..1 (1 = perfectly periodic). */
  clarity: number
  rms: number
}

export const DEFAULTS = { minFreq: 70, maxFreq: 1400, minClarity: 0.8, peakRatio: 0.9, rmsGate: 0.008 }

export function rms(buf: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return buf.length ? Math.sqrt(s / buf.length) : 0
}

interface Peak {
  tau: number
  val: number
}

/** Parabolic interpolation around index i. */
function interpolate(y: Float64Array, i: number): Peak {
  const a = y[i - 1]
  const b = y[i]
  const c = y[i + 1]
  const d = a - 2 * b + c
  if (d >= 0) return { tau: i, val: b } // not a maximum
  const shift = (0.5 * (a - c)) / d
  return { tau: i + shift, val: Math.min(1, b - 0.25 * (a - c) * shift) }
}

/** Highest local maximum within +-tol of `centre` (interpolated), or null. */
function peakNear(y: Float64Array, centre: number, tol: number, limit: number): Peak | null {
  const lo = Math.max(2, Math.floor(centre * (1 - tol)))
  const hi = Math.min(limit - 2, Math.ceil(centre * (1 + tol)))
  let best = -1
  for (let i = lo; i <= hi; i++) {
    if (y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > 0 && (best < 0 || y[i] > y[best])) best = i
  }
  return best < 0 ? null : interpolate(y, best)
}

/** Amplitude of the Hann-windowed buffer at a frequency (single-bin DFT). */
function amplitudeAt(x: Float64Array, sampleRate: number, freq: number): number {
  const n = x.length
  const w = (2 * Math.PI * freq) / sampleRate
  const cw = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    const s0 = x[i] * hann + cw * s1 - s2
    s2 = s1
    s1 = s0
  }
  const re = s1 - s2 * Math.cos(w)
  const im = s2 * Math.sin(w)
  return Math.sqrt(re * re + im * im)
}

/** Strongest amplitude within +-1.5% of freq (tolerates small pitch/tuning error). */
function bandAmplitude(x: Float64Array, sampleRate: number, freq: number): number {
  return Math.max(
    amplitudeAt(x, sampleRate, freq * 0.985),
    amplitudeAt(x, sampleRate, freq),
    amplitudeAt(x, sampleRate, freq * 1.015)
  )
}

export function detectPitch(buf: ArrayLike<number>, sampleRate: number, opts: PitchOptions = {}): PitchResult | null {
  const o = { ...DEFAULTS, ...opts }
  const n = buf.length
  if (n < 256 || !(sampleRate > 0)) return null

  const level = rms(buf)
  if (!(level >= o.rmsGate)) return null

  // remove DC offset
  let mean = 0
  for (let i = 0; i < n; i++) mean += buf[i]
  mean /= n
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = buf[i] - mean

  const minLag = Math.max(2, Math.floor(sampleRate / o.maxFreq))
  const limit = Math.min(Math.ceil(sampleRate / o.minFreq) + 2, n >> 1) // exclusive upper bound for tau
  if (limit <= minLag + 4) return null

  // Normalised square difference function
  const nsdf = new Float64Array(limit + 1)
  let m = 0
  for (let i = 0; i < n; i++) m += x[i] * x[i]
  m *= 2
  for (let tau = 0; tau <= limit; tau++) {
    if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[n - tau] * x[n - tau]
    let r = 0
    const end = n - tau
    for (let j = 0; j < end; j++) r += x[j] * x[j + tau]
    nsdf[tau] = m > 1e-12 ? (2 * r) / m : 0
  }

  // Key maxima: highest point of each positive lobe (after the first, zero-lag lobe)
  const peaks: Peak[] = []
  let tau = 1
  while (tau < limit && nsdf[tau] > 0) tau++
  while (tau < limit) {
    while (tau < limit && nsdf[tau] <= 0) tau++
    let best = -1
    while (tau < limit && nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau
      tau++
    }
    if (best >= minLag && best < limit - 1 && nsdf[best] > nsdf[best - 1] && nsdf[best] >= nsdf[best + 1]) {
      peaks.push(interpolate(nsdf, best))
    }
  }
  if (!peaks.length) return null

  const top = peaks.reduce((a, p) => Math.max(a, p.val), 0)
  if (top < o.minClarity) return null
  let chosen = peaks.find((p) => p.val >= o.peakRatio * top)!

  // Octave-too-high protection: examine 2x and 3x the chosen period.
  for (const mult of [2, 3]) {
    const f = sampleRate / chosen.tau
    if (f / mult < o.minFreq) continue
    const longer = peakNear(nsdf, chosen.tau * mult, 0.03, limit)
    if (!longer) continue
    const better = longer.val >= chosen.val + 0.04
    let fits = false
    if (!better && longer.val >= chosen.val - 0.04) {
      // Same-quality longer period: only trust it if the spectrum really has energy there.
      const sub = bandAmplitude(x, sampleRate, f / mult)
      const fund = bandAmplitude(x, sampleRate, f)
      fits = sub >= 0.05 * fund
    }
    if (better || fits) {
      chosen = longer
      break
    }
  }

  const freq = sampleRate / chosen.tau
  if (freq < o.minFreq * 0.95 || freq > o.maxFreq * 1.05) return null
  if (chosen.val < o.minClarity) return null
  return { freq, clarity: chosen.val, rms: level }
}

// ---------- note math ----------

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Fractional MIDI number of a frequency (A4 = 69). */
export const freqToMidi = (freq: number, a4 = 440): number => 69 + 12 * Math.log2(freq / a4)

/** Frequency of a (possibly fractional) MIDI number. */
export const midiToFreq = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12)

/** Signed distance in cents from `ref` to `freq` (positive = sharp). */
export const centsOff = (freq: number, ref: number): number => 1200 * Math.log2(freq / ref)

export interface NoteInfo {
  /** nearest integer MIDI note */
  midi: number
  /** "F#" (sharps; run through pretty() for display) */
  name: string
  octave: number
  /** deviation from the nearest note, -50..+50 */
  cents: number
  /** exact frequency of the nearest note at this A4 reference */
  target: number
}

export function noteFromFreq(freq: number, a4 = 440): NoteInfo {
  const fm = freqToMidi(freq, a4)
  const midi = Math.round(fm)
  return {
    midi,
    name: NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: (fm - midi) * 100,
    target: midiToFreq(midi, a4)
  }
}

export const midiName = (midi: number): string => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)

/** Standard tuning, low to high. */
export const TUNER_STRINGS = [
  { string: 6, name: 'E', midi: 40 },
  { string: 5, name: 'A', midi: 45 },
  { string: 4, name: 'D', midi: 50 },
  { string: 3, name: 'G', midi: 55 },
  { string: 2, name: 'B', midi: 59 },
  { string: 1, name: 'E', midi: 64 }
] as const

/** The standard-tuning string whose pitch is closest to freq, with cents relative to it. */
export function nearestString(freq: number, a4 = 440): { string: number; name: string; midi: number; cents: number; target: number } {
  let best = TUNER_STRINGS[0] as (typeof TUNER_STRINGS)[number]
  let bestAbs = Infinity
  for (const s of TUNER_STRINGS) {
    const c = Math.abs(centsOff(freq, midiToFreq(s.midi, a4)))
    if (c < bestAbs) {
      bestAbs = c
      best = s
    }
  }
  const target = midiToFreq(best.midi, a4)
  return { string: best.string, name: best.name, midi: best.midi, cents: centsOff(freq, target), target }
}

