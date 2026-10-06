// Note-value arithmetic shared by the notation renderers (pure, no VexFlow import so it can be unit tested).

export function durationBeats(d: string): number {
  const base = d.replace(/[rd]/g, '')
  const b = ({ w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 } as Record<string, number>)[base] ?? 1
  return d.includes('d') ? b * 1.5 : b
}

const PLAIN: [number, string][] = [[4, 'w'], [3, 'hd'], [2, 'h'], [1.5, 'qd'], [1, 'q'], [0.75, '8d'], [0.5, '8'], [0.375, '16d'], [0.25, '16'], [0.125, '32']]
// Triplet values: [actual beats, written duration]. Three in the time of two, so written = actual * 1.5.
const TRIPLET: [number, string][] = [[4 / 3, 'h'], [2 / 3, 'q'], [1 / 3, '8'], [1 / 6, '16']]

export interface PlannedDuration {
  /** VexFlow duration string, e.g. "qd" (dotted quarter) */
  duration: string
  /** True for triplet values: the note must be inside a 3:2 tuplet */
  tuplet: boolean
  /** Beats actually written (before the 3:2 scaling for tuplets) */
  written: number
}

/**
 * Turn a length in beats into something drawable. Plain and dotted values and triplets
 * (1/3, 2/3, 1/6, 4/3 of a beat) are exact; anything else (2.5 beats, 5 beats, ...) is drawn
 * as the longest plain value that fits, with a console warning in development.
 */
export function planBeats(beats: number): PlannedDuration {
  const plain = PLAIN.find(([b]) => Math.abs(b - beats) < 0.005)
  if (plain) return { duration: plain[1], tuplet: false, written: plain[0] }
  const trip = TRIPLET.find(([b]) => Math.abs(b - beats) < 0.005)
  if (trip) return { duration: trip[1], tuplet: true, written: trip[0] * 1.5 }
  if (import.meta.env?.DEV) console.warn(`Notation: ${beats} beats has no single note value; drawn shorter.`)
  const below = PLAIN.find(([b]) => b <= beats + 0.005) ?? PLAIN[PLAIN.length - 1]
  return { duration: below[1], tuplet: false, written: below[0] }
}

/**
 * Group consecutive triplet notes into tuplet brackets (indices into `plans`). A group
 * closes once it spans three of its first note's value (three eighths, three 16ths...).
 */
export function tupletGroups(plans: PlannedDuration[]): number[][] {
  const groups: number[][] = []
  let i = 0
  while (i < plans.length) {
    if (!plans[i].tuplet) {
      i++
      continue
    }
    const w0 = plans[i].written
    // two quarter-triplets in a row mean "three quarters in two beats", otherwise quarter + eighth fill a beat
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
    const target =
      w0 < 0.25 + 1e-6 ? 0.75 : w0 < 0.5 + 1e-6 ? 1.5 : w0 < 1 + 1e-6 ? (plans[i + 1]?.tuplet && near(plans[i + 1].written, 1) ? 3 : 1.5) : w0 < 2 + 1e-6 ? 3 : 6
    const group: number[] = []
    let sum = 0
    while (i < plans.length && plans[i].tuplet && sum < target - 1e-6) {
      group.push(i)
      sum += plans[i].written
      i++
    }
    if (group.length >= 2) groups.push(group)
  }
  return groups
}

