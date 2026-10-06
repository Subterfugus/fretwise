import { midiAt, pcAt, type FretPos } from '@/theory/guitar'
import { mod } from '@/theory/notes'

export type TriadQuality = 'maj' | 'min' | 'dim'
export type TriadLevel = 'beginner' | 'intermediate' | 'advanced'
export type TriadInversion = 0 | 1 | 2
export const TRIAD_QUALITIES: Record<TriadQuality, { name: string; intervals: [number, number, number]; degrees: [string, string, string] }> = {
  maj: { name: 'major', intervals: [0, 4, 7], degrees: ['1', '3', '5'] },
  min: { name: 'minor', intervals: [0, 3, 7], degrees: ['1', 'b3', '5'] },
  dim: { name: 'diminished', intervals: [0, 3, 6], degrees: ['1', 'b3', 'b5'] }
}
export const TRIAD_STRING_SETS = [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]] as const
export const TRIAD_INVERSIONS = ['Root position', 'First inversion', 'Second inversion'] as const
export const BASS_ROLES = ['root', 'third', 'fifth'] as const
export const TRIAD_SESSION_LENGTH = 10

export interface TriadChallenge {
  rootPc: number
  quality: TriadQuality
  stringSet: number
  inversion: TriadInversion
  frets: [number, number]
}
export interface TriadQuestion extends TriadChallenge {
  solutions: FretPos[][]
}
export type TriadFailure = 'configuration' | 'strings' | 'range' | 'span' | 'tones' | 'bass'
export type TriadGrade = { correct: true } | { correct: false; reason: TriadFailure }

function validChallenge(c: TriadChallenge): boolean {
  return Number.isInteger(c.rootPc) && c.rootPc >= 0 && c.rootPc < 12 &&
    Object.hasOwn(TRIAD_QUALITIES, c.quality) && Number.isInteger(c.stringSet) && c.stringSet >= 0 && c.stringSet < 4 &&
    Number.isInteger(c.inversion) && c.inversion >= 0 && c.inversion <= 2 && Array.isArray(c.frets) && c.frets.length === 2 &&
    c.frets.every((f) => Number.isInteger(f) && f >= 0 && f <= 22) && c.frets[0] <= c.frets[1]
}

export function triadPcs(c: Pick<TriadChallenge, 'rootPc' | 'quality'>): number[] {
  return TRIAD_QUALITIES[c.quality].intervals.map((n) => mod(c.rootPc + n, 12))
}

export const triadItemKey = (c: TriadChallenge): string => `${c.rootPc}:${c.quality}:${c.stringSet}:${c.inversion}`

/** Grade the player's pitches, rather than matching a single suggested fingering. */
export function gradeTriad(c: TriadChallenge, picks: FretPos[]): TriadGrade {
  if (!validChallenge(c)) return { correct: false, reason: 'configuration' }
  const strings: readonly number[] = TRIAD_STRING_SETS[c.stringSet]
  if (picks.length !== 3 || new Set(picks.map((p) => p.string)).size !== 3 || picks.some((p) => !strings.includes(p.string)))
    return { correct: false, reason: 'strings' }
  if (picks.some((p) => !Number.isInteger(p.fret) || p.fret < c.frets[0] || p.fret > c.frets[1]))
    return { correct: false, reason: 'range' }
  if (Math.max(...picks.map((p) => p.fret)) - Math.min(...picks.map((p) => p.fret)) > 4)
    return { correct: false, reason: 'span' }
  const pcs = triadPcs(c)
  const chosen = picks.map((p) => pcAt(p))
  if (new Set(chosen).size !== 3 || chosen.some((pc) => !pcs.includes(pc))) return { correct: false, reason: 'tones' }
  const bass = Math.min(...picks.map((p) => midiAt(p)))
  if (mod(bass, 12) !== pcs[c.inversion]) return { correct: false, reason: 'bass' }
  return { correct: true }
}

/** Enumerate all three-tone compact voicings in this inclusive fret range. */
export function triadVoicings(c: TriadChallenge): FretPos[][] {
  if (!validChallenge(c)) return []
  const pcs = triadPcs(c)
  const candidates = TRIAD_STRING_SETS[c.stringSet].map((string) => {
    const positions: FretPos[] = []
    for (let fret = c.frets[0]; fret <= c.frets[1]; fret++) {
      const p = { string, fret }
      if (pcs.includes(pcAt(p))) positions.push(p)
    }
    return positions
  })
  const out: FretPos[][] = []
  for (const a of candidates[0]) for (const b of candidates[1]) for (const d of candidates[2]) {
    const picks = [a, b, d]
    if (gradeTriad(c, picks).correct) out.push(picks)
  }
  return out.sort((a, b) => Math.min(...a.map((p) => p.fret)) - Math.min(...b.map((p) => p.fret)) ||
    a.reduce((sum, p) => sum + p.fret, 0) - b.reduce((sum, p) => sum + p.fret, 0))
}

export interface TriadToneDiagnosis {
  pc: number
  role: number | null
  count: number
}
export interface TriadNoteDiagnosis extends FretPos {
  pc: number
  role: number | null
  duplicate: boolean
  bass: boolean
}
export interface TriadDiagnosis {
  notes: TriadNoteDiagnosis[]
  missing: TriadToneDiagnosis[]
  duplicated: TriadToneDiagnosis[]
  outside: TriadToneDiagnosis[]
  bassMatches: boolean
}

/** Report all tone problems, even when the first grading failure is fret span. */
export function diagnoseTriad(c: TriadChallenge, picks: FretPos[]): TriadDiagnosis {
  const empty: TriadDiagnosis = { notes: [], missing: [], duplicated: [], outside: [], bassMatches: false }
  if (!validChallenge(c)) return empty
  const pcs = triadPcs(c)
  const valid = picks.filter((p) => Number.isInteger(p.string) && p.string >= 1 && p.string <= 6 &&
    Number.isInteger(p.fret) && p.fret >= 0 && p.fret <= 22)
  const counts = new Map<number, number>()
  valid.forEach((p) => counts.set(pcAt(p), (counts.get(pcAt(p)) ?? 0) + 1))
  const bassMidi = Math.min(...valid.map((p) => midiAt(p)))
  const tone = (pc: number): TriadToneDiagnosis => ({ pc, role: pcs.includes(pc) ? pcs.indexOf(pc) : null, count: counts.get(pc) ?? 0 })
  return {
    notes: valid.map((p) => ({ ...p, pc: pcAt(p), role: pcs.includes(pcAt(p)) ? pcs.indexOf(pcAt(p)) : null,
      duplicate: counts.get(pcAt(p))! > 1, bass: midiAt(p) === bassMidi })),
    missing: pcs.filter((pc) => !counts.has(pc)).map(tone),
    duplicated: [...counts.keys()].filter((pc) => counts.get(pc)! > 1).map(tone),
    outside: [...counts.keys()].filter((pc) => !pcs.includes(pc)).map(tone),
    bassMatches: valid.length > 0 && mod(bassMidi, 12) === pcs[c.inversion]
  }
}

export interface TriadCorrection {
  positions: FretPos[]
  changes: { string: number; from?: FretPos; to: FretPos }[]
  distance: number
}

/** Preserve as many selected strings as possible, then minimize total fret movement. */
export function closestTriadVoicing(c: TriadChallenge, picks: FretPos[]): TriadCorrection | undefined {
  const originals = new Map(picks.map((p) => [p.string, p]))
  let best: TriadCorrection | undefined
  for (const positions of triadVoicings(c)) {
    const changes = positions.filter((p) => originals.get(p.string)?.fret !== p.fret)
      .map((to) => ({ string: to.string, from: originals.get(to.string), to }))
    const distance = changes.reduce((sum, change) => sum + (change.from ? Math.abs(change.to.fret - change.from.fret) : 0), 0)
    if (!best || changes.length < best.changes.length || (changes.length === best.changes.length && distance < best.distance))
      best = { positions, changes, distance }
  }
  return best
}

export function triadQuestionPool(level: TriadLevel): TriadQuestion[] {
  const roots = level === 'beginner' ? [0, 7, 2] : Array.from({ length: 12 }, (_, i) => i)
  const qualities: TriadQuality[] = level === 'beginner' ? ['maj'] : level === 'intermediate' ? ['maj', 'min'] : ['maj', 'min', 'dim']
  const sets = level === 'beginner' ? [0] : level === 'intermediate' ? [0, 1] : [0, 1, 2, 3]
  const inversions: TriadInversion[] = level === 'beginner' ? [0] : [0, 1, 2]
  const out: TriadQuestion[] = []
  for (const rootPc of roots) for (const quality of qualities) for (const stringSet of sets) for (const inversion of inversions) {
    const c: TriadChallenge = { rootPc, quality, stringSet, inversion, frets: [0, level === 'advanced' ? 22 : 12] }
    const solutions = triadVoicings(c)
    if (solutions.length) out.push({ ...c, solutions })
  }
  return out
}

export function chooseTriadQuestion(pool: TriadQuestion[], previousKey?: string, random = Math.random): TriadQuestion | undefined {
  const alternatives = pool.filter((q) => triadItemKey(q) !== previousKey)
  const candidates = alternatives.length ? alternatives : pool
  if (!candidates.length) return undefined
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))]
}

export interface TriadAnswer {
  correct: boolean
  assisted: boolean
  grade: TriadGrade
}
export interface TriadRun {
  questions: TriadQuestion[]
  index: number
  answers: TriadAnswer[]
}

/** Duplicate submit/reveal events leave an already-scored question unchanged. */
export function answerTriadRun(run: TriadRun, picks: FretPos[], assisted = false): TriadRun {
  const q = run.questions[run.index]
  if (!q || run.answers.length > run.index) return run
  const grade = gradeTriad(q, picks)
  return { ...run, answers: [...run.answers, { correct: !assisted && grade.correct, assisted, grade }] }
}
