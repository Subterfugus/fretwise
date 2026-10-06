// Integrity checks over all curriculum content and quiz generators.
import { describe, expect, it } from 'vitest'
import { UNITS } from './units'
import { grade, buildQuiz } from './grading'
import type { Block, QuizQuestion } from './types'
import { MAX_FRET } from '@/theory/guitar'

function checkQuestion(q: QuizQuestion, where: string) {
  expect(q.prompt, where).toBeTruthy()
  switch (q.kind) {
    case 'mc':
      expect(q.answer, where).toBeGreaterThanOrEqual(0)
      expect(q.answer, where).toBeLessThan(q.choices.length)
      expect(new Set(q.choices).size, where + ' distinct choices').toBe(q.choices.length)
      expect(grade(q, { kind: 'mc', choice: q.answer }), where).toBe(true)
      break
    case 'fretboard': {
      expect(q.targets.length, where).toBeGreaterThan(0)
      const [lo, hi] = q.frets ?? [0, 12]
      for (const t of q.targets) {
        expect(t.fret, where).toBeGreaterThanOrEqual(lo)
        expect(t.fret, where).toBeLessThanOrEqual(Math.min(hi, MAX_FRET))
        expect(t.string, where).toBeGreaterThanOrEqual(1)
        expect(t.string, where).toBeLessThanOrEqual(6)
      }
      const picks = q.mode === 'all' ? q.targets : [q.targets[0]]
      expect(grade(q, { kind: 'fretboard', picks }), where).toBe(true)
      break
    }
    case 'spell':
      expect(grade(q, { kind: 'spell', text: q.answer.join(' ') }), where).toBe(true)
      break
    case 'text':
      expect(grade(q, { kind: 'text', text: q.accept[0] }), where).toBe(true)
      break
  }
}

describe('curriculum', () => {
  it('has 13 core units plus 5 electives with unique lesson ids', () => {
    expect(UNITS).toHaveLength(18)
    expect(UNITS.filter((u) => !u.elective)).toHaveLength(13)
    for (const u of UNITS.filter((x) => x.elective)) {
      expect(u.requires?.length, u.id).toBeGreaterThan(0)
      for (const r of u.requires!) expect(UNITS.some((x) => x.id === r && !x.elective), `${u.id} requires ${r}`).toBe(true)
    }
    const ids = UNITS.flatMap((u) => u.lessons.map((l) => l.id))
    expect(new Set(ids).size).toBe(ids.length)
    // Composed path units (e.g. Pentatonics across the neck) may be short and focused.
    for (const u of UNITS) expect(u.lessons.length, u.id).toBeGreaterThanOrEqual(3)
  })

  for (const u of UNITS) {
    it(`unit ${u.number}: lesson try-its and quiz questions are valid`, () => {
      for (const l of u.lessons) {
        l.blocks
          .filter((b): b is Extract<Block, { type: 'tryIt' }> => b.type === 'tryIt')
          .forEach((b, i) => checkQuestion(b.question, `${l.id} tryIt ${i}`))
      }
      u.quiz.fixed.forEach((q, i) => checkQuestion(q, `${u.id} fixed ${i}`))
      for (const [gi, g] of (u.quiz.generators ?? []).entries())
        for (let n = 0; n < 40; n++) checkQuestion(g(), `${u.id} generator ${gi}`)
      expect(buildQuiz(u.quiz).length).toBe(u.quiz.count ?? 10)
    })
  }
})
