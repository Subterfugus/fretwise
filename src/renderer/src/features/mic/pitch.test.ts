import { describe, expect, it } from 'vitest'
import { centsOff, detectPitch, freqToMidi, midiName, midiToFreq, nearestString, noteFromFreq, rms, TUNER_STRINGS } from './pitch'
import { NoteTracker, PitchFrame } from './onset'

// ---------- signal synthesis ----------

/** Deterministic PRNG so noisy tests never flake. */
function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SynthOpts {
  sr?: number
  n?: number
  /** harmonic amplitudes: [fundamental, 2nd, 3rd, ...] */
  harmonics?: number[]
  amp?: number
  /** start offset in samples (so windows land on different phases) */
  offset?: number
  /** noise RMS (absolute) */
  noise?: number
  /** exponential decay time constant in seconds (0 = none) */
  decay?: number
  seed?: number
  /** slight string stiffness: harmonic k is at k*f*sqrt(1 + b k^2) */
  inharmonicity?: number
}

function synth(freq: number, o: SynthOpts = {}): Float32Array {
  const { sr = 44100, n = 4096, harmonics = [1], amp = 0.3, offset = 0, noise = 0, decay = 0, seed = 1, inharmonicity = 0 } = o
  const out = new Float32Array(n)
  const rnd = prng(seed)
  const norm = harmonics.reduce((a, b) => a + Math.abs(b), 0) || 1
  for (let i = 0; i < n; i++) {
    const t = (i + offset) / sr
    let v = 0
    for (let k = 1; k <= harmonics.length; k++) {
      const fk = k * freq * Math.sqrt(1 + inharmonicity * k * k)
      if (fk > sr / 2) break
      v += harmonics[k - 1] * Math.sin(2 * Math.PI * fk * t + k * 0.7)
    }
    v = (v / norm) * amp * (decay ? Math.exp(-t / decay) : 1)
    if (noise) v += (rnd() + rnd() + rnd() - 1.5) * 2 * noise // roughly gaussian
    out[i] = v
  }
  return out
}

const GUITAR_HARMONICS = [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08]
const open = TUNER_STRINGS.map((s) => ({ ...s, freq: midiToFreq(s.midi) }))
const cents = (a: number, b: number) => Math.abs(centsOff(a, b))

describe('note math', () => {
  it('converts between frequency, MIDI and note names', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 9)
    expect(freqToMidi(261.6256)).toBeCloseTo(60, 3)
    expect(midiToFreq(40)).toBeCloseTo(82.4069, 3)
    expect(midiName(40)).toBe('E2')
    expect(midiName(61)).toBe('C#4')
  })

  it('noteFromFreq finds the nearest note and cents', () => {
    const e2 = noteFromFreq(82.41)
    expect(e2.name).toBe('E')
    expect(e2.octave).toBe(2)
    expect(e2.midi).toBe(40)
    expect(Math.abs(e2.cents)).toBeLessThan(0.5)
    const sharp = noteFromFreq(440 * Math.pow(2, 20 / 1200))
    expect(sharp.name).toBe('A')
    expect(sharp.cents).toBeCloseTo(20, 5)
    const flat = noteFromFreq(440 * Math.pow(2, -30 / 1200))
    expect(flat.cents).toBeCloseTo(-30, 5)
  })

  it('respects the A4 reference', () => {
    // 432 Hz is an in-tune A when A4 = 432, but 31.8 cents flat of A when A4 = 440
    expect(noteFromFreq(432, 432).cents).toBeCloseTo(0, 6)
    expect(noteFromFreq(432, 432).name).toBe('A')
    expect(noteFromFreq(432, 440).cents).toBeCloseTo(-31.77, 1)
    expect(midiToFreq(69, 415)).toBeCloseTo(415, 9)
    expect(noteFromFreq(midiToFreq(40, 442), 442).cents).toBeCloseTo(0, 6)
  })

  it('centsOff is signed', () => {
    expect(centsOff(440, 440)).toBe(0)
    expect(centsOff(880, 440)).toBeCloseTo(1200, 9)
    expect(centsOff(220, 440)).toBeCloseTo(-1200, 9)
  })

  it('nearestString picks the closest standard string', () => {
    for (const s of open) expect(nearestString(s.freq).string).toBe(s.string)
    const flatA = nearestString(open[1].freq * Math.pow(2, -25 / 1200))
    expect(flatA.string).toBe(5)
    expect(flatA.cents).toBeCloseTo(-25, 3)
    // a G# is closer to G than to anything else
    expect(nearestString(midiToFreq(56)).string).toBe(3)
  })
})

describe('detectPitch: pure tones', () => {
  for (const sr of [44100, 48000]) {
    for (const n of [2048, 4096]) {
      it(`every open string as a sine, sr=${sr} n=${n}`, () => {
        for (const s of open) {
          const r = detectPitch(synth(s.freq, { sr, n }), sr)
          expect(r, s.name + s.string).not.toBeNull()
          expect(cents(r!.freq, s.freq)).toBeLessThan(1.5)
          expect(r!.clarity).toBeGreaterThan(0.95)
        }
      })
    }
  }

  it('every chromatic note from E2 to E6 within 3 cents (sine)', () => {
    for (let m = 40; m <= 88; m++) {
      const f = midiToFreq(m)
      const r = detectPitch(synth(f, { n: 4096, offset: m * 37 }), 44100)
      expect(r, midiName(m)).not.toBeNull()
      expect(cents(r!.freq, f), midiName(m)).toBeLessThan(3)
    }
  })

  it('detects detuned notes accurately (tuner use)', () => {
    for (const dev of [-40, -15, -5, 0, 5, 15, 40]) {
      const f = open[2].freq * Math.pow(2, dev / 1200)
      const r = detectPitch(synth(f), 44100)!
      expect(centsOff(r.freq, f)).toBeCloseTo(0, 0)
      expect(noteFromFreq(r.freq).cents).toBeCloseTo(dev, 0)
    }
  })

  it('handles a DC offset', () => {
    const buf = synth(open[3].freq)
    for (let i = 0; i < buf.length; i++) buf[i] += 0.15
    const r = detectPitch(buf, 44100)!
    expect(cents(r.freq, open[3].freq)).toBeLessThan(1.5)
  })

  it('is independent of the window phase', () => {
    for (let off = 0; off < 700; off += 97) {
      const r = detectPitch(synth(open[0].freq, { offset: off, harmonics: GUITAR_HARMONICS }), 44100)!
      expect(cents(r.freq, open[0].freq)).toBeLessThan(2)
    }
  })
})

describe('detectPitch: guitar-like signals', () => {
  it('every open string with harmonics, decay and stiffness', () => {
    for (const sr of [44100, 48000]) {
      for (const n of [2048, 4096]) {
        for (const s of open) {
          const r = detectPitch(synth(s.freq, { sr, n, harmonics: GUITAR_HARMONICS, decay: 0.6, inharmonicity: 0.00008, offset: 1500 }), sr)
          expect(r, `${s.name}${s.string} ${sr}/${n}`).not.toBeNull()
          expect(cents(r!.freq, s.freq), `${s.name}${s.string} ${sr}/${n}`).toBeLessThan(4)
        }
      }
    }
  })

  it('no octave error when the 2nd harmonic is stronger than the fundamental (low E)', () => {
    for (const weak of [0.5, 0.3, 0.2, 0.15, 0.1, 0.07]) {
      for (const sr of [44100, 48000]) {
        // weak odd harmonics too: a signal that is almost periodic at half the true period
        const r = detectPitch(synth(open[0].freq, { sr, harmonics: [weak, 1, weak, 0.6, weak / 2, 0.3] }), sr)
        expect(r, `weak=${weak}`).not.toBeNull()
        expect(cents(r!.freq, open[0].freq), `E2 weak=${weak} sr=${sr}`).toBeLessThan(5)
      }
    }
  })

  it('no octave error for a weak fundamental at 2048 samples too', () => {
    for (const weak of [0.3, 0.2, 0.15]) {
      const r = detectPitch(synth(open[0].freq, { n: 2048, harmonics: [weak, 1, 0.6, 0.4, 0.25] }), 44100)
      expect(r, `weak=${weak}`).not.toBeNull()
      expect(cents(r!.freq, open[0].freq), `weak=${weak}`).toBeLessThan(5)
    }
  })

  it('no octave error for a weak fundamental on the A and D strings', () => {
    for (const s of [open[1], open[2]]) {
      const r = detectPitch(synth(s.freq, { harmonics: [0.2, 1, 0.7, 0.4, 0.2] }), 44100)!
      expect(cents(r.freq, s.freq), s.name).toBeLessThan(5)
    }
  })

  it('finds the fundamental when it is completely missing (harmonics 2+ only)', () => {
    const r = detectPitch(synth(open[0].freq, { harmonics: [0, 1, 0.8, 0.6, 0.4, 0.3] }), 44100)
    expect(r).not.toBeNull()
    expect(cents(r!.freq, open[0].freq)).toBeLessThan(6)
  })

  it('does not report an octave too LOW for genuinely high notes with strong harmonics', () => {
    for (let m = 52; m <= 84; m++) {
      const f = midiToFreq(m)
      const r = detectPitch(synth(f, { harmonics: GUITAR_HARMONICS, offset: m * 13, noise: 0.004, seed: m }), 44100)
      expect(r, midiName(m)).not.toBeNull()
      expect(cents(r!.freq, f), midiName(m)).toBeLessThan(6)
    }
  })

  it('does not report an octave too high for notes with a strong 3rd harmonic', () => {
    for (const s of open.slice(0, 4)) {
      const r = detectPitch(synth(s.freq, { harmonics: [0.4, 0.5, 1, 0.4, 0.2] }), 44100)!
      expect(cents(r.freq, s.freq), s.name).toBeLessThan(5)
    }
  })

  it('works with added broadband noise (SNR ~ 20 dB)', () => {
    for (const s of open) {
      // amp 0.3 -> signal rms ~0.15; noise rms 0.015 -> 20 dB
      const r = detectPitch(synth(s.freq, { harmonics: GUITAR_HARMONICS, noise: 0.015, seed: s.midi }), 44100)
      expect(r, s.name + s.string).not.toBeNull()
      expect(cents(r!.freq, s.freq), s.name + s.string).toBeLessThan(6)
    }
  })

  it('works at ~10 dB SNR with a low E', () => {
    const r = detectPitch(synth(open[0].freq, { harmonics: [0.4, 1, 0.6, 0.4], noise: 0.05, seed: 7 }), 44100)
    expect(r).not.toBeNull()
    expect(cents(r!.freq, open[0].freq)).toBeLessThan(10)
  })

  it('works with a quiet but audible signal', () => {
    const r = detectPitch(synth(open[2].freq, { harmonics: GUITAR_HARMONICS, amp: 0.05 }), 44100)
    expect(r).not.toBeNull()
    expect(cents(r!.freq, open[2].freq)).toBeLessThan(4)
  })

  it('works in the middle of a long decay', () => {
    for (const s of open) {
      const r = detectPitch(synth(s.freq, { harmonics: GUITAR_HARMONICS, decay: 0.25, offset: 20000 }), 44100, { rmsGate: 0.002 })
      expect(r, s.name).not.toBeNull()
      expect(cents(r!.freq, s.freq), s.name).toBeLessThan(5)
    }
  })

  it('ignores 50 Hz mains hum under a played note', () => {
    const a = synth(open[2].freq, { harmonics: GUITAR_HARMONICS, amp: 0.3 })
    const hum = synth(50, { amp: 0.02 })
    for (let i = 0; i < a.length; i++) a[i] += hum[i]
    const r = detectPitch(a, 44100)!
    expect(cents(r.freq, open[2].freq)).toBeLessThan(4)
  })
})

describe('detectPitch: rejection', () => {
  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(4096), 44100)).toBeNull()
  })

  it('returns null below the noise gate', () => {
    expect(detectPitch(synth(open[3].freq, { amp: 0.004 }), 44100)).toBeNull()
    expect(detectPitch(synth(open[3].freq, { amp: 0.004 }), 44100, { rmsGate: 0.001 })).not.toBeNull()
  })

  it('returns null for white noise', () => {
    let nulls = 0
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = prng(seed)
      const buf = new Float32Array(4096)
      for (let i = 0; i < buf.length; i++) buf[i] = (rnd() - 0.5) * 0.4
      if (detectPitch(buf, 44100) === null) nulls++
    }
    expect(nulls).toBe(20)
  })

  it('returns null for very short or empty buffers', () => {
    expect(detectPitch(new Float32Array(0), 44100)).toBeNull()
    expect(detectPitch(new Float32Array(100), 44100)).toBeNull()
  })

  it('rejects pitches outside the guitar range', () => {
    expect(detectPitch(synth(30, { n: 4096 }), 44100)).toBeNull()
    // far above the guitar range: never reported as itself
    const hi = detectPitch(synth(3000), 44100)
    if (hi) expect(hi.freq).toBeLessThan(1470)
  })

  it('rms helper', () => {
    expect(rms(new Float32Array(10))).toBe(0)
    expect(rms(synth(440, { amp: 1 }))).toBeCloseTo(Math.SQRT1_2, 2)
  })
})

// ---------- note tracker ----------

const FRAME_MS = 25

/** Build frames: [midi|null, rms] per frame at FRAME_MS spacing. */
function frames(spec: [number | null, number][], t0 = 0): PitchFrame[] {
  return spec.map(([midi, level], i) => ({ t: t0 + i * FRAME_MS, midi, clarity: midi === null ? 0 : 0.95, rms: level }))
}
const run = (tr: NoteTracker, fs: PitchFrame[]) => fs.map((f) => tr.push(f)).filter((e) => e !== null)
const hold = (midi: number | null, n: number, level = 0.1, decayPerFrame = 1): [number | null, number][] =>
  Array.from({ length: n }, (_, i) => [midi, level * Math.pow(decayPerFrame, i)])

describe('NoteTracker', () => {
  it('needs the note to be stable before it counts', () => {
    const tr = new NoteTracker()
    expect(run(tr, frames(hold(45, 2)))).toHaveLength(0) // 25 ms is too short
    const tr2 = new NoteTracker()
    const ev = run(tr2, frames(hold(45, 8)))
    expect(ev).toHaveLength(1)
    expect(ev[0]!.midi).toBe(45)
  })

  it('does not fire at all when the pitch keeps jumping around (pluck noise)', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = []
    for (let i = 0; i < 20; i++) spec.push([40 + (i % 5) * 3, 0.1])
    expect(run(tr, frames(spec))).toHaveLength(0)
  })

  it('ignores low-clarity and quiet frames', () => {
    const tr = new NoteTracker()
    const fs = frames(hold(50, 20)).map((f) => ({ ...f, clarity: 0.5 }))
    expect(run(tr, fs)).toHaveLength(0)
    const tr2 = new NoteTracker()
    expect(run(tr2, frames(hold(50, 20, 0.002)))).toHaveLength(0)
  })

  it('holding a note counts once', () => {
    const tr = new NoteTracker()
    const ev = run(tr, frames(hold(52, 120, 0.2, 0.985))) // 3 seconds of ringing, smooth decay
    expect(ev).toHaveLength(1)
  })

  it('tolerates pitch wobble (vibrato / drift) within the note', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = Array.from({ length: 40 }, (_, i) => [47 + 0.3 * Math.sin(i), 0.1 * Math.pow(0.99, i)])
    const ev = run(tr, frames(spec))
    expect(ev).toHaveLength(1)
    expect(ev[0]!.midi).toBe(47)
  })

  it('reports the cents deviation of the stable note', () => {
    const tr = new NoteTracker()
    const ev = run(tr, frames(hold(47.2, 10)))
    expect(ev[0]!.midi).toBe(47)
    expect(ev[0]!.cents).toBeCloseTo(20, 5)
  })

  it('a sequence of different notes yields each once, in order, without gaps between them', () => {
    const tr = new NoteTracker()
    const spec = [...hold(40, 8), ...hold(42, 8), ...hold(44, 8), ...hold(45, 8)]
    expect(run(tr, frames(spec)).map((e) => e!.midi)).toEqual([40, 42, 44, 45])
  })

  it('survives short detection dropouts inside a note', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = [...hold(55, 3), [null, 0.1], ...hold(55, 6)]
    expect(run(tr, frames(spec))).toHaveLength(1)
  })

  it('does not double count when a dropout happens after the note counted', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = [...hold(55, 8, 0.1, 0.97), [null, 0.05], [null, 0.05], ...hold(55, 10, 0.05, 0.97)]
    expect(run(tr, frames(spec))).toHaveLength(1)
  })

  it('a repeated note needs a new pluck: RMS dip then rise', () => {
    const tr = new NoteTracker()
    const first = hold(45, 14, 0.2, 0.93) // decays to ~0.07
    const second = hold(45, 14, 0.2, 0.93) // re-pluck back at 0.2
    const ev = run(tr, frames([...first, ...second]))
    expect(ev).toHaveLength(2)
  })

  it('a repeated note after silence counts again', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = [...hold(45, 8), ...hold(null, 8, 0.0005), ...hold(45, 8)]
    expect(run(tr, frames(spec))).toHaveLength(2)
  })

  it('three plucks of the same note in a row count three times', () => {
    const tr = new NoteTracker()
    const pluck = hold(43, 12, 0.25, 0.9)
    expect(run(tr, frames([...pluck, ...pluck, ...pluck]))).toHaveLength(3)
  })

  it('ripple in the decay of a sustained note does not count as a re-pluck', () => {
    const tr = new NoteTracker()
    const spec: [number | null, number][] = Array.from({ length: 80 }, (_, i) => [50, 0.2 * Math.pow(0.97, i) * (1 + 0.15 * Math.sin(i * 1.3))])
    expect(run(tr, frames(spec))).toHaveLength(1)
  })

  it('a different note while the first still rings counts immediately', () => {
    const tr = new NoteTracker()
    const spec = [...hold(45, 8, 0.2, 0.95), ...hold(47, 8, 0.15, 0.95), ...hold(45, 8, 0.12, 0.95)]
    expect(run(tr, frames(spec)).map((e) => e!.midi)).toEqual([45, 47, 45])
  })

  it('reset() clears state', () => {
    const tr = new NoteTracker()
    expect(run(tr, frames(hold(45, 8)))).toHaveLength(1)
    tr.reset()
    expect(run(tr, frames(hold(45, 8), 1000))).toHaveLength(1)
  })
})

describe('end to end: synthesised plucks through detector and tracker', () => {
  it('detects a played E-A-D-G-B-E run once each, with correct cents', () => {
    const sr = 44100
    const hop = 1102 // ~25 ms
    const tr = new NoteTracker()
    const events: number[] = []
    let t = 0
    for (const s of open) {
      // each string rings for 0.6 s with a pluck decay, then 0.15 s of near-silence
      const long = synth(s.freq, { sr, n: 2048 + 26500, harmonics: GUITAR_HARMONICS, decay: 0.5, amp: 0.4 })
      for (let start = 0; start + 2048 <= 26500; start += hop) {
        const buf = long.subarray(start, start + 2048)
        const r = detectPitch(buf, sr, { rmsGate: 0.008 })
        const ev = tr.push({ t, midi: r ? freqToMidi(r.freq) : null, clarity: r?.clarity ?? 0, rms: rms(buf) })
        if (ev) {
          events.push(ev.midi)
          expect(Math.abs(ev.cents)).toBeLessThan(6)
        }
        t += 25
      }
      for (let i = 0; i < 6; i++) {
        tr.push({ t, midi: null, clarity: 0, rms: 0.0002 })
        t += 25
      }
    }
    expect(events).toEqual(open.map((s) => s.midi))
  })
})


describe('detectPitch: randomised robustness sweep', () => {
  it('300 random guitar-ish notes: correct octave and within 8 cents', () => {
    const rnd = prng(2024)
    const failures: string[] = []
    let worst = 0
    for (let i = 0; i < 300; i++) {
      const m = 40 + Math.floor(rnd() * 37) // E2..E5
      const f = midiToFreq(m) * Math.pow(2, ((rnd() - 0.5) * 30) / 1200) // up to +-15 cents off
      const sr = rnd() < 0.5 ? 44100 : 48000
      const n = rnd() < 0.5 ? 2048 : 4096
      const fund = m < 52 ? 0.12 + rnd() * 0.5 : 0.3 + rnd() * 0.7 // low strings often have a weak fundamental
      const harmonics = [fund, 1, 0.1 + rnd() * 0.6, 0.1 + rnd() * 0.5, rnd() * 0.3, rnd() * 0.2]
      const snr = 15 + rnd() * 20
      const amp = 0.1 + rnd() * 0.5
      const noise = (amp * 0.45) / Math.pow(10, snr / 20)
      const r = detectPitch(synth(f, { sr, n, harmonics, amp, noise, seed: i + 1, offset: Math.floor(rnd() * 5000), decay: rnd() < 0.5 ? 0.3 + rnd() : 0 }), sr)
      const err = r ? cents(r.freq, f) : Infinity
      if (Number.isFinite(err)) worst = Math.max(worst, err)
      if (err > 8) failures.push(`${midiName(m)} f=${f.toFixed(1)} sr=${sr} n=${n} fund=${fund.toFixed(2)} snr=${snr.toFixed(0)} -> ${r ? r.freq.toFixed(1) : 'null'}`)
    }
    expect(failures).toEqual([])
    expect(worst).toBeLessThan(8)
  })
})