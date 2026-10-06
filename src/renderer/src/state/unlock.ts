import { UNITS } from '@/content/units'
import type { Unit } from '@/content/types'
import { getProgress, type Progress } from './progress'

/** Units that must be passed before `u` opens: its explicit `requires`, else the previous core unit. */
export function prerequisites(u: Unit): Unit[] {
  if (u.requires) return u.requires.map((id) => UNITS.find((x) => x.id === id)).filter((x): x is Unit => !!x)
  if (u.elective || u.number === 1) return []
  const prev = UNITS.find((x) => !x.elective && x.number === u.number - 1)
  return prev ? [prev] : []
}

/** Passed this unit's quiz, or the quiz of a retired unit it replaced (see Unit.legacyPass). */
export function isPassed(u: Unit, p: Progress = getProgress()): boolean {
  return !!p.quizzes[u.id]?.passed || (u.legacyPass ?? []).some((id) => !!p.quizzes[id]?.passed)
}

/**
 * Open when every prerequisite is passed. A unit with any finished lesson also stays open, so
 * reordering the curriculum never locks work the learner has already started.
 */
export function isUnlocked(u: Unit): boolean {
  const p = getProgress()
  if (p.settings.unlockAll) return true
  if (u.lessons.some((l) => p.lessonsDone[l.id])) return true
  return prerequisites(u).every((x) => isPassed(x, p))
}
