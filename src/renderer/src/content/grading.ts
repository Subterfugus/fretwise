import { posKey, type FretPos } from '@/theory/guitar'
import { parseNote, noteName } from '@/theory/notes'
import { shuffle } from './helpers'
import type { QuizQuestion, UnitQuiz } from './types'

export type Answer =
  | { kind: 'mc'; choice: number }
  | { kind: 'fretboard'; picks: FretPos[] }
  | { kind: 'spell'; text: string }
  | { kind: 'text'; text: string }

/** Normalise a typed note: "f#" "F♯" -> "F#", "bb" -> "Bb". Returns null if not a note. */
export function normaliseNote(s: string): string | null {
  const t = s.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, 'x').replace(/𝄫/g, 'bb')
  if (!t) return null
  // "EB" / "BBB" typed with caps lock on: the letter is first, any later capital B is a flat.
  const tail = /^[Bb]+$/.test(t.slice(1)) ? t.slice(1).toLowerCase() : t.slice(1)
  try {
    return noteName(parseNote(t[0].toUpperCase() + tail))
  } catch {
    return null
  }
}

export function splitNotes(text: string): string[] {
  return text
    .split(/[\s,;/–—\-]+/)
    .filter(Boolean)
    .map((t) => normaliseNote(t) ?? `?${t}`)
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/[.!]+$/, '') // a trailing full stop is not part of the answer
    .trim()

/**
 * Typed-answer match: case-insensitive for words, but interval abbreviations such as
 * "M3" vs "m3" (major vs minor) differ only by case, so those must match exactly.
 */
export function textMatches(accepted: string, typed: string): boolean {
  const acc = accepted.trim()
  if (/^[Mm]\d+$/.test(acc)) return typed.trim().replace(/[.!]+$/, '') === acc
  return norm(acc) === norm(typed)
}

export function grade(q: QuizQuestion, a: Answer): boolean {
  switch (q.kind) {
    case 'mc':
      return a.kind === 'mc' && a.choice === q.answer
    case 'fretboard': {
      if (a.kind !== 'fretboard') return false
      const targets = new Set(q.targets.map(posKey))
      if ((q.mode ?? 'any') === 'any') return a.picks.length > 0 && a.picks.every((p) => targets.has(posKey(p)))
      const picks = new Set(a.picks.map(posKey))
      return picks.size === targets.size && [...picks].every((k) => targets.has(k))
    }
    case 'spell': {
      if (a.kind !== 'spell') return false
      const got = splitNotes(a.text)
      const want = q.answer.map((n) => normaliseNote(n) ?? n)
      if (got.length !== want.length) return false
      if (q.ordered ?? true) return got.every((g, i) => g === want[i])
      return [...got].sort().join() === [...want].sort().join()
    }
    case 'text':
      return a.kind === 'text' && q.accept.some((x) => textMatches(x, a.text))
  }
}

/** Human-readable correct answer for the review screen. */
export function correctAnswerText(q: QuizQuestion): string {
  switch (q.kind) {
    case 'mc':
      return q.choices[q.answer]
    case 'fretboard':
      return q.mode === 'all' ? `${q.targets.length} positions (shown on the fretboard)` : 'the highlighted position(s)'
    case 'spell':
      return q.answer.join(' ')
    case 'text':
      return q.accept[0]
  }
}

/** Assemble a quiz attempt: mix fixed questions with freshly generated ones. */
export function buildQuiz(quiz: UnitQuiz): QuizQuestion[] {
  const count = quiz.count ?? 10
  const gens = quiz.generators ?? []
  // Aim for roughly 40% generated when generators exist
  const genTarget = gens.length ? Math.min(count, Math.max(Math.round(count * 0.4), count - quiz.fixed.length)) : 0
  const pool = shuffle(quiz.fixed)
  const fixed = pool.slice(0, count - genTarget)
  const generated: QuizQuestion[] = []
  const seen = new Set<string>()
  for (let tries = 0; generated.length < count - fixed.length && tries < 200 && gens.length; tries++) {
    const q = gens[tries % gens.length]()
    const key = questionKey(q)
    if (seen.has(key)) continue
    seen.add(key)
    generated.push(q)
  }
  // Generators that kept repeating themselves must not shorten the quiz: top up from unused fixed questions.
  const missing = count - fixed.length - generated.length
  if (missing > 0) fixed.push(...pool.slice(fixed.length, fixed.length + missing))
  return shuffle([...fixed, ...generated])
}

/**
 * Identity of a generated question for de-duplication. The prompt alone is not enough:
 * "Name the highlighted note" with a different fretboard is a different question, and
 * multiple-choice choices are shuffled so only the correct answer text is comparable.
 */
export function questionKey(q: QuizQuestion): string {
  const answer =
    q.kind === 'mc' ? q.choices[q.answer] : q.kind === 'fretboard' ? q.targets : q.kind === 'spell' ? q.answer : q.accept
  return JSON.stringify([q.kind, q.prompt, q.play ?? null, q.visual ?? null, answer])
}
