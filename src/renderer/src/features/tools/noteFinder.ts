import type { FretPos } from '@/theory/guitar'
import { MAX_FRET, pcAt } from '@/theory/guitar'
import { weightedPick } from '@/features/ear/weighting'

export type NoteFinderLevel = 'beginner' | 'intermediate' | 'advanced' | 'custom'
export interface NoteFinderConfig {
  level: NoteFinderLevel
  strings: number[]
  frets: [number, number]
  naturalOnly: boolean
  weak: boolean
}
export interface NoteFinderStat { right: number; total: number; assisted?: number }
export interface NoteFinderQuestion {
  key: string
  string: number
  pc: number
  frets: [number, number]
  positions: FretPos[]
}
export const NOTE_FINDER_LENGTH = 10
export const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11]

export function noteFinderDefaults(level: Exclude<NoteFinderLevel, 'custom'> = 'beginner', weak = false): NoteFinderConfig {
  return {
    level, strings: level === 'beginner' ? [1, 2] : [1, 2, 3, 4, 5, 6],
    frets: [0, level === 'beginner' ? 5 : level === 'intermediate' ? 12 : 22],
    naturalOnly: level === 'beginner', weak
  }
}

export function validNoteFinderConfig(raw: unknown): raw is NoteFinderConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const v = raw as Record<string, unknown>
  return ['beginner', 'intermediate', 'advanced', 'custom'].includes(String(v.level)) &&
    Array.isArray(v.strings) && v.strings.length > 0 && v.strings.length <= 6 &&
    v.strings.every((s) => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 6) &&
    new Set(v.strings).size === v.strings.length &&
    Array.isArray(v.frets) && v.frets.length === 2 &&
    v.frets.every((f) => typeof f === 'number' && Number.isInteger(f) && f >= 0 && f <= MAX_FRET) &&
    v.frets[0] <= v.frets[1] && typeof v.naturalOnly === 'boolean' && typeof v.weak === 'boolean'
}

export function noteFinderPool(config: NoteFinderConfig): NoteFinderQuestion[] {
  if (!validNoteFinderConfig(config)) return []
  const questions: NoteFinderQuestion[] = []
  for (const string of config.strings) {
    const byPc = new Map<number, FretPos[]>()
    for (let fret = config.frets[0]; fret <= config.frets[1]; fret++) {
      const pc = pcAt({ string, fret })
      if (config.naturalOnly && !NATURAL_PCS.includes(pc)) continue
      const positions = byPc.get(pc) ?? []
      positions.push({ string, fret })
      byPc.set(pc, positions)
    }
    for (const [pc, positions] of byPc) questions.push({ key: `${string}:${pc}`, string, pc, frets: [...config.frets], positions })
  }
  return questions
}

export function pickNoteFinderQuestion(
  config: NoteFinderConfig, stats: Record<string, NoteFinderStat> = {}, previous?: string, rng = Math.random
): NoteFinderQuestion {
  const pool = noteFinderPool(config)
  if (!pool.length) throw new Error('No notes are available in this fret range.')
  const alternatives = pool.filter((q) => q.key !== previous)
  const candidates = alternatives.length ? alternatives : pool
  const key = weightedPick(candidates.map((q) => q.key), stats, config.weak, rng)
  return candidates.find((q) => q.key === key)!
}

export function gradeNoteFinder(question: NoteFinderQuestion, pick: FretPos): boolean {
  return pick.string === question.string && Number.isInteger(pick.fret) &&
    pick.fret >= question.frets[0] && pick.fret <= question.frets[1] && pcAt(pick) === question.pc
}

export interface NoteFinderAnswer {
  pick?: FretPos
  correct: boolean
  assisted: boolean
  responseMs: number
}
export interface NoteFinderSession {
  question: NoteFinderQuestion
  answer: NoteFinderAnswer | null
  right: number
  total: number
  assisted: number
  startedAt: number
  questionStartedAt: number
  ended: boolean
  durationMs: number
}

export function startNoteFinder(config: NoteFinderConfig, stats: Record<string, NoteFinderStat>, now: number, rng = Math.random): NoteFinderSession {
  return { question: pickNoteFinderQuestion(config, stats, undefined, rng), answer: null, right: 0, total: 0, assisted: 0, startedAt: now, questionStartedAt: now, ended: false, durationMs: 0 }
}

/** Returning the same state makes a repeated click/reveal a no-op for persistence too. */
export function answerNoteFinder(session: NoteFinderSession, pick: FretPos | undefined, now: number): NoteFinderSession {
  if (session.ended || session.answer) return session
  if (pick && pick.string !== session.question.string) return session
  const assisted = !pick
  const correct = !!pick && gradeNoteFinder(session.question, pick)
  return { ...session, answer: { pick, correct, assisted, responseMs: Math.max(0, now - session.questionStartedAt) },
    right: session.right + Number(correct), total: session.total + 1, assisted: session.assisted + Number(assisted) }
}

export function nextNoteFinder(session: NoteFinderSession, config: NoteFinderConfig, stats: Record<string, NoteFinderStat>, now: number, rng = Math.random): NoteFinderSession {
  if (session.ended || !session.answer) return session
  if (session.total >= NOTE_FINDER_LENGTH) return { ...session, ended: true, durationMs: Math.max(0, now - session.startedAt) }
  return { ...session, question: pickNoteFinderQuestion(config, stats, session.question.key, rng), answer: null, questionStartedAt: now }
}
