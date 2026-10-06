// The curriculum path: teaching order, quiz routing, lesson links and unlocking.
import { beforeEach, describe, expect, it } from 'vitest'
import { BANKS, LESSON_ORDER, UNITS } from './units'
import { buildCurriculum, forLesson, PATH, STAGES, taught, type PathUnit } from './curriculum'
import { lessonTokens } from '@/features/lessons/lessonLinks'
import type { Block, QuizQuestion, Unit } from './types'
import { mc } from './helpers'
import { getProgress, updateProgress } from '@/state/progress'
import { isPassed, isUnlocked, prerequisites } from '@/state/unlock'

/** Every string inside a value, with a path for messages. */
function strings(v: unknown, where: string, out: { where: string; text: string }[] = []) {
  if (typeof v === 'string') out.push({ where, text: v })
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${where}[${i}]`, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${where}.${k}`, out)
  return out
}

const markdownOf = (b: Block): string[] => (b.type === 'text' || b.type === 'tip' ? [b.md] : [])

describe('curriculum path', () => {
  it('places every bank lesson exactly once, in stage order', () => {
    const placed = UNITS.flatMap((u) => u.lessons.map((l) => l.id))
    const banked = BANKS.flatMap((u) => u.lessons.map((l) => l.id))
    expect([...placed].sort()).toEqual([...banked].sort())
    const stageIdx = UNITS.map((u) => STAGES.findIndex((s) => s.id === u.stage))
    expect(stageIdx.every((s, i) => s >= 0 && (i === 0 || s >= stageIdx[i - 1]))).toBe(true)
  })

  it('numbers core units 1..n in path order and electives after them', () => {
    const core = UNITS.filter((u) => !u.elective)
    expect(core.map((u) => u.number)).toEqual(core.map((_, i) => i + 1))
    const electives = UNITS.filter((u) => u.elective)
    expect(electives.map((u) => u.number)).toEqual(electives.map((_, i) => core.length + i + 1))
  })

  it('electives unlock from core units that come before them in the path', () => {
    for (const [i, u] of UNITS.entries()) {
      if (!u.elective) continue
      for (const r of u.requires ?? []) {
        const at = UNITS.findIndex((x) => x.id === r)
        expect(at, `${u.id} requires ${r}`).toBeGreaterThanOrEqual(0)
        expect(at, `${u.id} requires ${r}, which must come earlier`).toBeLessThan(i)
        expect(UNITS[at].elective, `${u.id} requires core unit ${r}`).toBeFalsy()
      }
    }
  })

  it('routes every quiz question and generator exactly once', () => {
    const total = (units: Unit[]) => units.reduce((n, u) => n + u.quiz.fixed.length + (u.quiz.generators?.length ?? 0), 0)
    expect(total(UNITS)).toBe(total(BANKS))
    for (const u of UNITS) expect(u.quiz.generators?.length, `${u.id} needs a generator`).toBeGreaterThan(0)
  })

  it('tagged questions land in the unit that holds their lesson', () => {
    for (const u of UNITS) {
      const ids = new Set(u.lessons.map((l) => l.id))
      for (const q of u.quiz.fixed) if (q.lesson) expect(ids.has(q.lesson), `${u.id}: ${q.prompt}`).toBe(true)
      for (const g of u.quiz.generators ?? []) if (g.lesson) expect(ids.has(g.lesson), `${u.id} generator`).toBe(true)
    }
  })

  it('the first stage teaches the minor pentatonic and the 12-bar blues', () => {
    const first = UNITS.filter((u) => u.stage === 'first-steps').flatMap((u) => u.lessons.map((l) => l.id))
    for (const id of ['u8l1', 'u8l4', 'u8l5', 'u3l6']) expect(first).toContain(id)
  })
})

describe('lesson links', () => {
  const lessons = UNITS.flatMap((u) => u.lessons)

  it('every [[...]] link names a real lesson, and plain links only point backwards', () => {
    let links = 0
    for (const l of lessons) {
      for (const md of l.blocks.flatMap(markdownOf)) {
        for (const t of lessonTokens(md)) {
          links++
          expect(LESSON_ORDER.has(t.id), `${l.id} links to unknown ${t.id}`).toBe(true)
          const from = LESSON_ORDER.get(l.id)!
          const to = LESSON_ORDER.get(t.id)!
          if (t.preview) expect(to, `${l.id}: [[preview:${t.id}]] should be a plain link (it's earlier)`).toBeGreaterThan(from)
          else expect(to, `${l.id} links forward to ${t.id}; use [[preview:${t.id}]] or reorder`).toBeLessThan(from)
        }
      }
    }
    expect(links).toBeGreaterThan(20)
  })

  it('links only appear in lesson markdown (text and tip blocks)', () => {
    for (const l of lessons) {
      l.blocks.forEach((b, i) => {
        if (b.type === 'text' || b.type === 'tip') return
        for (const s of strings(b, `${l.id} block ${i}`)) expect(s.text, s.where).not.toMatch(/\[\[/)
      })
    }
  })

  it('no lesson or quiz text hard-codes a unit number (use [[lesson]] links)', () => {
    const found: string[] = []
    for (const u of BANKS) {
      for (const s of strings(u.lessons, u.id)) if (/\bUnit \d+\b/.test(s.text)) found.push(`${s.where}: ${s.text.match(/.{0,40}\bUnit \d+\b.{0,20}/)?.[0]}`)
      for (const s of strings(u.quiz.fixed, `${u.id} quiz`)) if (/\bUnit \d+\b/.test(s.text)) found.push(`${s.where}: ${s.text.match(/.{0,40}\bUnit \d+\b.{0,20}/)?.[0]}`)
    }
    expect(found).toEqual([])
  })
})

describe('buildCurriculum guards', () => {
  const q = (lesson?: string): QuizQuestion => ({ ...mc('Q?', 'a', ['b']), ...(lesson ? { lesson } : {}) })
  const bank = (id: string, lessons: string[], fixed: QuizQuestion[]): Unit => ({
    id, number: 0, title: id, summary: '', lessons: lessons.map((l) => ({ id: l, title: l, blocks: [] })),
    quiz: { fixed, generators: [forLesson(lessons[0], () => q())] }
  })
  const path = (units: PathUnit[]) => units

  it('rejects unplaced, duplicated and unknown lessons', () => {
    const banks = [bank('a', ['al1', 'al2'], [])]
    expect(() => buildCurriculum(banks, path([{ id: 'a', stage: 'first-steps', lessons: ['al1'] }]))).toThrow(/not in the path: al2/)
    expect(() => buildCurriculum(banks, path([{ id: 'a', stage: 'first-steps', lessons: ['al1', 'al2', 'al1'] }]))).toThrow(/both/)
    expect(() => buildCurriculum(banks, path([{ id: 'a', stage: 'first-steps', lessons: ['al1', 'al2', 'zz1'] }]))).toThrow(/unknown lesson zz1/)
  })

  it('a retired bank must tag its questions; tags move questions with their lesson', () => {
    const banks = [bank('a', ['al1'], [q()]), bank('b', ['bl1', 'bl2'], [q('bl1'), q('bl2')])]
    const layout = path([
      { id: 'a', stage: 'first-steps', lessons: ['al1', 'bl1'] },
      { id: 'x', stage: 'harmony', title: 'X', summary: '', lessons: ['bl2'] }
    ])
    const [a, x] = buildCurriculum(banks, layout)
    expect(a.quiz.fixed.map((f) => f.lesson)).toEqual([undefined, 'bl1'])
    expect(x.quiz.fixed.map((f) => f.lesson)).toEqual(['bl2'])
    expect(() => buildCurriculum([bank('a', ['al1'], []), bank('b', ['bl1'], [q()])], path([{ id: 'a', stage: 'first-steps', lessons: ['al1', 'bl1'] }]))).toThrow(/needs a lesson tag/)
  })

  it('taught() and forLesson() only add the tag', () => {
    const base = mc('Q?', 'a', ['b'])
    expect(taught('u1l1', base)).toEqual({ ...base, lesson: 'u1l1' })
    expect(forLesson('u1l1', () => base)()).toBe(base)
  })

  it('the real path has no duplicate ids', () => {
    expect(new Set(PATH.map((p) => p.id)).size).toBe(PATH.length)
  })
})

describe('unlocking along the path', () => {
  const unit = (id: string) => UNITS.find((u) => u.id === id)!
  beforeEach(() => {
    updateProgress((p) => {
      p.quizzes = {}
      p.lessonsDone = {}
      p.settings.unlockAll = false
    })
  })

  it('a core unit needs the previous core unit, skipping electives', () => {
    const core = UNITS.filter((u) => !u.elective)
    for (let i = 1; i < core.length; i++) expect(prerequisites(core[i]).map((u) => u.id)).toEqual([core[i - 1].id])
    expect(isUnlocked(core[1])).toBe(false)
    updateProgress((p) => void (p.quizzes[core[0].id] = { best: 1, last: 1, attempts: 1, passed: true }))
    expect(isUnlocked(core[1])).toBe(true)
  })

  it('an old pass of the retired Pentatonic and blues unit counts for both of its successors', () => {
    updateProgress((p) => void (p.quizzes.u8 = { best: 1, last: 1, attempts: 1, passed: true }))
    expect(isPassed(unit('blues1'))).toBe(true)
    expect(isPassed(unit('pent2'))).toBe(true)
  })

  it('never locks a unit with finished lessons', () => {
    const late = unit('u12')
    expect(isUnlocked(late)).toBe(false)
    updateProgress((p) => void (p.lessonsDone[late.lessons[0].id] = Date.now()))
    expect(isUnlocked(late)).toBe(true)
    expect(getProgress().settings.unlockAll).toBe(false)
  })
})
