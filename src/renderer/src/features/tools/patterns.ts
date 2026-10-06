// Pure rhythm patterns for the backing-track looper. Time is counted in "ticks": TICKS_PER_BEAT per beat,
// which divides evenly into eighths (6), sixteenths (3) and triplets (4), so one grid serves every style.

export const TICKS_PER_BEAT = 12

export type StrumStyle = 'strum' | 'strum8' | 'arpeggio' | 'shuffle' | 'ballad'
export type BassMode = 'off' | 'root' | 'root-fifth'
export type DrumMode = 'off' | 'click' | 'basic'

export const STYLES: { id: StrumStyle; label: string; hint: string }[] = [
  { id: 'strum', label: 'Straight strum', hint: 'One down-strum per beat' },
  { id: 'strum8', label: 'Eighth-note strum', hint: 'D  D U  _ U  D U' },
  { id: 'arpeggio', label: 'Arpeggio / fingerpick', hint: 'Picked eighth notes' },
  { id: 'shuffle', label: 'Shuffle / swing', hint: 'Long-short triplet feel' },
  { id: 'ballad', label: 'Ballad (whole notes)', hint: 'One slow strum per bar' }
]

export interface ChordHit {
  /** Ticks from the start of the chord. */
  tick: number
  kind: 'strum' | 'pick'
  dir?: 'down' | 'up'
  /** For 'pick': which voicing note (0 = lowest), taken from the arpeggio cycle. */
  pickIndex?: number
  vel: number
  /** Sustain in beats. */
  beats: number
}

const T = TICKS_PER_BEAT
const EIGHTH = T / 2

/** The strummed/picked hits of one chord lasting `beats` beats. Sorted by tick, all inside the chord. */
export function chordHits(style: StrumStyle, beats: number): ChordHit[] {
  const total = beats * T
  const out: ChordHit[] = []
  const push = (h: ChordHit) => {
    if (h.tick >= 0 && h.tick < total) out.push(h)
  }
  switch (style) {
    case 'strum':
      for (let b = 0; b < beats; b++) push({ tick: b * T, kind: 'strum', dir: 'down', vel: b === 0 ? 0.9 : 0.72, beats: 1 })
      break
    case 'strum8': {
      // "D  D U  _ U  D U" over four beats, in eighths
      const PATTERN: [number, 'down' | 'up'][] = [[0, 'down'], [2, 'down'], [3, 'up'], [5, 'up'], [6, 'down'], [7, 'up']]
      for (let bar = 0; bar * 4 < beats; bar++) {
        const barBeats = Math.min(4, beats - bar * 4)
        if (barBeats === 4) {
          for (const [e, dir] of PATTERN) push({ tick: bar * 4 * T + e * EIGHTH, kind: 'strum', dir, vel: dir === 'down' ? (e === 0 ? 0.92 : 0.75) : 0.55, beats: 0.5 })
        } else {
          // short remainder: down on each beat, up on the "and"
          for (let b = 0; b < barBeats; b++) {
            push({ tick: (bar * 4 + b) * T, kind: 'strum', dir: 'down', vel: b === 0 ? 0.9 : 0.72, beats: 0.5 })
            push({ tick: (bar * 4 + b) * T + EIGHTH, kind: 'strum', dir: 'up', vel: 0.55, beats: 0.5 })
          }
        }
      }
      break
    }
    case 'arpeggio': {
      const CYCLE = [0, 2, 3, 2, 1, 2, 3, 2]
      for (let e = 0; e * EIGHTH < total; e++) {
        push({ tick: e * EIGHTH, kind: 'pick', pickIndex: CYCLE[e % CYCLE.length], vel: e % 2 === 0 ? (e % 8 === 0 ? 0.85 : 0.7) : 0.55, beats: 2 })
      }
      break
    }
    case 'shuffle':
      // triplet feel: strike the first and third triplet of each beat
      for (let b = 0; b < beats; b++) {
        push({ tick: b * T, kind: 'strum', dir: 'down', vel: b === 0 ? 0.9 : 0.75, beats: 0.66 })
        push({ tick: b * T + (2 * T) / 3, kind: 'strum', dir: 'up', vel: 0.5, beats: 0.33 })
      }
      break
    case 'ballad':
      for (let bar = 0; bar * 4 < beats; bar++) {
        const len = Math.min(4, beats - bar * 4)
        push({ tick: bar * 4 * T, kind: 'strum', dir: 'down', vel: 0.85, beats: len })
      }
      break
  }
  return out.sort((a, b) => a.tick - b.tick)
}

export interface BassHit {
  tick: number
  tone: 'root' | 'fifth'
  beats: number
  vel: number
}

/** Bass notes within one chord. */
export function bassHits(mode: BassMode, style: StrumStyle, beats: number): BassHit[] {
  if (mode === 'off') return []
  const out: BassHit[] = []
  if (style === 'ballad') {
    for (let bar = 0; bar * 4 < beats; bar++) out.push({ tick: bar * 4 * T, tone: 'root', beats: Math.min(4, beats - bar * 4), vel: 0.8 })
    return out
  }
  if (style === 'shuffle') {
    for (let b = 0; b < beats; b++) {
      const tone = mode === 'root-fifth' && b % 2 === 1 ? 'fifth' : 'root'
      out.push({ tick: b * T, tone, beats: 0.66, vel: b === 0 ? 0.9 : 0.75 })
    }
    return out
  }
  if (mode === 'root') {
    for (let b = 0; b < beats; b += 2) out.push({ tick: b * T, tone: 'root', beats: Math.min(2, beats - b), vel: b === 0 ? 0.9 : 0.75 })
  } else {
    for (let b = 0; b < beats; b++) out.push({ tick: b * T, tone: b % 2 === 0 ? 'root' : 'fifth', beats: 1, vel: b === 0 ? 0.9 : 0.72 })
  }
  return out
}

export interface DrumHit {
  tick: number
  drum: 'kick' | 'snare' | 'hat' | 'hatOpen' | 'click' | 'clickAccent'
  vel: number
}

/** Beats per drum bar for a chord length (so waltz-length chords keep a 3-beat feel). */
export const drumBarBeats = (chordBeats: number): number => (chordBeats % 4 === 0 || chordBeats % 4 === 2 ? 4 : chordBeats % 3 === 0 ? 3 : 4)

/** Drum hits for one bar (barBeats beats). */
export function drumBar(mode: DrumMode, style: StrumStyle, barBeats: number): DrumHit[] {
  if (mode === 'off') return []
  const out: DrumHit[] = []
  if (mode === 'click') {
    for (let b = 0; b < barBeats; b++) out.push({ tick: b * T, drum: b === 0 ? 'clickAccent' : 'click', vel: b === 0 ? 1 : 0.7 })
    return out
  }
  const kickBeats = barBeats === 3 ? [0] : [0, 2]
  const snareBeats = barBeats === 3 ? [1, 2] : [1, 3]
  if (style === 'ballad') {
    out.push({ tick: 0, drum: 'kick', vel: 0.9 })
    out.push({ tick: Math.floor(barBeats / 2) * T, drum: 'snare', vel: 0.6 })
    for (let b = 0; b < barBeats; b++) out.push({ tick: b * T, drum: 'hat', vel: 0.35 })
    return out
  }
  for (const b of kickBeats) out.push({ tick: b * T, drum: 'kick', vel: b === 0 ? 1 : 0.8 })
  for (const b of snareBeats) out.push({ tick: b * T, drum: 'snare', vel: 0.8 })
  if (style === 'shuffle') {
    for (let b = 0; b < barBeats; b++) {
      out.push({ tick: b * T, drum: 'hat', vel: 0.55 })
      out.push({ tick: b * T + (2 * T) / 3, drum: 'hat', vel: 0.35 })
    }
  } else if (style === 'strum' || style === 'arpeggio') {
    for (let b = 0; b < barBeats; b++) out.push({ tick: b * T, drum: 'hat', vel: 0.5 })
  } else {
    for (let e = 0; e < barBeats * 2; e++) out.push({ tick: e * EIGHTH, drum: 'hat', vel: e % 2 === 0 ? 0.55 : 0.35 })
  }
  return out.sort((a, b) => a.tick - b.tick)
}

/** Bass register: MIDI of the chord root placed in C2..B2 (36..47). */
export const bassMidi = (rootPc: number, fifth = false): number => 36 + ((rootPc + (fifth ? 7 : 0)) % 12)
