import { describe, expect, it } from 'vitest'
import { pcAt } from '@/theory/guitar'
import { answerNoteFinder, gradeNoteFinder, NATURAL_PCS, nextNoteFinder, noteFinderDefaults, noteFinderPool, pickNoteFinderQuestion, startNoteFinder, validNoteFinderConfig } from './noteFinder'

describe('note finder configuration and targets', () => {
  it('uses the planned difficulty ranges and excludes unreachable natural notes', () => {
    const beginner = noteFinderDefaults()
    expect(beginner.strings).toEqual([1, 2])
    expect(beginner.frets).toEqual([0, 5])
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const cfg = noteFinderDefaults(level)
      const pool = noteFinderPool(cfg)
      expect(pool.length).toBeGreaterThan(0)
      for (const q of pool) {
        expect(q.positions.length).toBeGreaterThan(0)
        expect(q.positions.every((p) => p.string === q.string && p.fret >= cfg.frets[0] && p.fret <= cfg.frets[1] && pcAt(p) === q.pc)).toBe(true)
        if (level === 'beginner') expect(NATURAL_PCS).toContain(q.pc)
      }
    }
    expect(noteFinderDefaults('intermediate').frets).toEqual([0, 12])
    expect(noteFinderDefaults('advanced').frets).toEqual([0, 22])
  })

  it('supports a single boundary fret and rejects malformed stored preferences', () => {
    const cfg = { ...noteFinderDefaults('advanced'), strings: [6], frets: [22, 22] as [number, number] }
    expect(noteFinderPool(cfg)).toHaveLength(1)
    expect(noteFinderPool(cfg)[0].positions).toEqual([{ string: 6, fret: 22 }])
    for (const bad of [null, [], {}, { ...cfg, strings: [] }, { ...cfg, strings: [1, 1] }, { ...cfg, strings: [0] }, { ...cfg, frets: [4, 3] }, { ...cfg, frets: [-1, 23] }, { ...cfg, frets: [NaN, 22] }, { ...cfg, weak: 'true' }]) {
      expect(validNoteFinderConfig(bad)).toBe(false)
      expect(noteFinderPool(bad as typeof cfg)).toEqual([])
    }
  })

  it('accepts all octave-equivalent positions only on the requested string in range', () => {
    const cfg = { ...noteFinderDefaults('advanced'), strings: [1] }
    const q = noteFinderPool(cfg).find((x) => x.pc === 4)!
    expect(q.positions).toEqual([{ string: 1, fret: 0 }, { string: 1, fret: 12 }])
    q.positions.forEach((p) => expect(gradeNoteFinder(q, p)).toBe(true))
    expect(gradeNoteFinder(q, { string: 6, fret: 0 })).toBe(false)
    expect(gradeNoteFinder(q, { string: 1, fret: 24 })).toBe(false)
    expect(gradeNoteFinder(q, { string: 1, fret: 1 })).toBe(false)
    expect(gradeNoteFinder(q, { string: 1, fret: 0.5 })).toBe(false)
  })
})

describe('note finder selection', () => {
  it('excludes the previous target when an alternative exists', () => {
    const cfg = noteFinderDefaults('advanced')
    const previous = noteFinderPool(cfg)[0].key
    for (const rng of [() => 0, () => 0.5, () => 0.999999]) expect(pickNoteFinderQuestion(cfg, {}, previous, rng).key).not.toBe(previous)
    const single = { ...cfg, strings: [1], frets: [0, 0] as [number, number] }
    expect(pickNoteFinderQuestion(single, {}, '1:4', () => 0).key).toBe('1:4')
  })

  it('uses existing smoothed weak-item weighting instead of uniform selection', () => {
    const cfg = { ...noteFinderDefaults('intermediate'), strings: [1], frets: [0, 1] as [number, number] }
    const stats = { '1:4': { right: 100, total: 100 }, '1:5': { right: 0, total: 100 } }
    expect(pickNoteFinderQuestion(cfg, stats, undefined, () => 0.2).key).toBe('1:4')
    expect(pickNoteFinderQuestion({ ...cfg, weak: true }, stats, undefined, () => 0.2).key).toBe('1:5')
    expect(() => pickNoteFinderQuestion({ ...cfg, strings: [] })).toThrow('No notes')
  })
})

describe('note finder sessions', () => {
  it('scores only the first answer and never progresses an unanswered question', () => {
    const cfg = noteFinderDefaults()
    const initial = startNoteFinder(cfg, {}, 100, () => 0)
    expect(nextNoteFinder(initial, cfg, {}, 200)).toBe(initial)
    expect(answerNoteFinder(initial, { string: 6, fret: 0 }, 200)).toBe(initial)
    const answered = answerNoteFinder(initial, initial.question.positions[0], 600)
    expect(answered).toMatchObject({ right: 1, total: 1, assisted: 0, answer: { correct: true, responseMs: 500 } })
    expect(answerNoteFinder(answered, undefined, 700)).toBe(answered)
    expect(answerNoteFinder(answered, initial.question.positions[0], 700)).toBe(answered)
    const next = nextNoteFinder(answered, cfg, {}, 800, () => 0)
    expect(next.answer).toBeNull()
    expect(next.question.key).not.toBe(initial.question.key)
  })

  it('records reveals as assisted misses and completes exactly ten questions', () => {
    const cfg = noteFinderDefaults()
    let s = startNoteFinder(cfg, {}, 100, () => 0)
    for (let i = 1; i <= 10; i++) {
      s = answerNoteFinder(s, undefined, i * 1000)
      expect(s).toMatchObject({ right: 0, total: i, assisted: i, ended: false })
      s = nextNoteFinder(s, cfg, {}, i * 1000 + 100, () => 0)
    }
    expect(s).toMatchObject({ ended: true, total: 10, durationMs: 10000 })
    expect(nextNoteFinder(s, cfg, {}, 12000)).toBe(s)
    expect(answerNoteFinder(s, undefined, 12000)).toBe(s)
  })
})
