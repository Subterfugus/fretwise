import { describe, expect, it } from 'vitest'
import { UNITS } from '@/content/units'
import type { Block } from '@/content/types'
import { midiAt, MAX_FRET } from '@/theory/guitar'
import { mergeProgress, getProgress, recordMic, recordMicMemo, resetProgress } from '@/state/progress'
import { Difficulty, SequenceRun, generateChallenge, matchesTarget, memoTarget, parsePlayIt, sequenceMarks } from './exerciseLogic'

const KINDS = ['note', 'interval', 'scale', 'arpeggio'] as const
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

describe('challenge generation', () => {
  for (const kind of KINDS)
    for (const difficulty of DIFFS)
      for (const anyOctave of [false, true])
        it(`${kind} / ${difficulty} / anyOctave=${anyOctave}: targets are playable and consistent`, () => {
          for (let i = 0; i < 60; i++) {
            const c = generateChallenge(kind, { difficulty, anyOctave })
            expect(c.prompt).toBeTruthy()
            expect(c.targets.length).toBeGreaterThan(0)
            expect(c.positions).toHaveLength(c.targets.length)
            c.targets.forEach((t, j) => {
              expect(c.positions[j].length, c.title).toBeGreaterThan(0)
              for (const p of c.positions[j]) {
                expect(p.fret).toBeGreaterThanOrEqual(0)
                expect(p.fret).toBeLessThanOrEqual(MAX_FRET)
                // every drawn position really produces an accepted note
                expect(matchesTarget(midiAt(p), t), `${c.title} ${j}`).toBe(true)
              }
              if (!anyOctave) expect(t.midis, c.title).toBeDefined()
              else expect(t.midis).toBeUndefined()
            })
          }
        })

  it('scales are ascending (hard goes back down) and arpeggios ascend', () => {
    for (let i = 0; i < 40; i++) {
      const c = generateChallenge('arpeggio', { difficulty: 'medium', anyOctave: false })
      const m = c.targets.map((t) => t.midis![0])
      expect([...m].sort((a, b) => a - b)).toEqual(m)
      const s = generateChallenge('scale', { difficulty: 'easy', anyOctave: false })
      const sm = s.targets.map((t) => t.midis![0])
      expect([...sm].sort((a, b) => a - b)).toEqual(sm)
    }
  })

  it('memo targets respect difficulty', () => {
    for (let i = 0; i < 100; i++) {
      const e = memoTarget('easy')
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(e.target.pc)
      const h = memoTarget('hard')
      expect(h.string).not.toBeNull()
      for (const p of h.positions) expect(p.string).toBe(h.string)
    }
  })
})

describe('SequenceRun', () => {
  const t = (pc: number, midi?: number) => ({ pc, label: String(pc), midis: midi === undefined ? undefined : [midi] })
  it('advances on correct notes and counts mistakes', () => {
    const r = new SequenceRun([t(9, 45), t(0, 48)], 2)
    expect(r.push(50)).toBe('miss')
    expect(r.push(45)).toBe('hit')
    expect(r.index).toBe(1)
    expect(r.push(57)).toBe('miss') // right letter, wrong octave in exact mode
    expect(r.push(48)).toBe('hit')
    expect(r.done).toBe(true)
    expect(r.mistakes).toBe(2)
    expect(r.failed).toBe(false)
    expect(r.push(1)).toBe('over')
  })
  it('fails after too many mistakes', () => {
    const r = new SequenceRun([t(9)], 1)
    r.push(40)
    expect(r.failed).toBe(false)
    r.push(41)
    expect(r.failed).toBe(true)
  })
  it('any-octave targets match every octave', () => {
    expect(matchesTarget(33, t(9))).toBe(true)
    expect(matchesTarget(81, t(9))).toBe(true)
    expect(matchesTarget(82, t(9))).toBe(false)
  })
})

describe('sequenceMarks', () => {
  const pos = [[{ string: 6, fret: 3 }], [{ string: 5, fret: 0 }], [{ string: 5, fret: 2 }]]
  it('hidden shows only played notes; hints add the rest; reveal shows everything', () => {
    expect(sequenceMarks(pos, ['G', 'A', 'B'], 1, 'hidden')).toHaveLength(1)
    const hints = sequenceMarks(pos, ['G', 'A', 'B'], 1, 'hints')
    expect(hints).toHaveLength(3)
    expect(hints.map((m) => m.color)).toEqual(['tone', 'accent', 'ghost'])
    expect(sequenceMarks(pos, ['G', 'A', 'B'], 1, 'reveal').every((m) => m.color)).toBe(true)
  })
})

describe('lesson playIt blocks', () => {
  const blocks = UNITS.flatMap((u) => u.lessons.flatMap((l) => l.blocks.filter((b): b is Extract<Block, { type: 'playIt' }> => b.type === 'playIt').map((b) => ({ l: l.id, b }))))
  it('exist in several lessons', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(4)
  })
  for (const { l, b } of blocks)
    it(`${l}: "${b.targets.join(' ')}" parses and the shown positions match`, () => {
      const p = parsePlayIt(b.targets, b.octaveAgnostic)
      expect(p.targets).toHaveLength(b.targets.length)
      expect(p.audible).toHaveLength(b.targets.length)
      if (b.show) {
        const sounding = new Set(b.show.map((x) => midiAt(x, b.tuning)))
        for (const t of p.targets) expect(b.show.some((x) => matchesTarget(midiAt(x, b.tuning), t)), t.label).toBe(true)
        expect(sounding.size).toBeGreaterThan(0)
        // exact-octave targets: each target's note must be reachable at one of the shown positions
        p.targets.forEach((t, i) => {
          if (t.midis) expect(sounding.has(t.midis[0]), `${l} target ${i}`).toBe(true)
        })
      }
    })
  it('parsePlayIt places octave-less targets ascending', () => {
    const p = parsePlayIt(['C', 'E', 'G'])
    expect(p.audible[1]).toBeGreaterThan(p.audible[0])
    expect(p.audible[2]).toBeGreaterThan(p.audible[1])
    expect(() => parsePlayIt(['H'])).toThrow()
  })
})

describe('progress: mic record', () => {
  it('old saved files without `mic` load with defaults', () => {
    const p = mergeProgress({ version: 1, lessonsDone: { u1l1: 5 }, quizzes: {}, ear: {}, earHistory: {}, settings: {} })
    expect(p.mic).toEqual({ stats: {}, memoHistory: [] })
    expect(p.lessonsDone.u1l1).toBe(5)
  })
  it('drops malformed mic data and keeps valid entries', () => {
    const p = mergeProgress({
      mic: {
        stats: { 'scale:easy': { attempts: 3, completed: 2, mistakes: 1, hits: 20, lastAt: 9, bestTimeMs: 4000 }, bad: 'x', neg: { attempts: -4 } },
        memoHistory: [{ at: 1, correct: 5, wrong: 1, seconds: 60, perMinute: 5 }, 'x', { at: 'a' }]
      }
    })
    expect(p.mic.stats['scale:easy'].bestTimeMs).toBe(4000)
    expect(p.mic.stats.bad).toBeUndefined()
    expect(p.mic.stats.neg.attempts).toBe(0)
    expect(p.mic.memoHistory).toHaveLength(1)
    expect(mergeProgress({ mic: 5 }).mic.stats).toEqual({})
  })
  it('recordMic accumulates and keeps best values', () => {
    resetProgress()
    recordMic('scale:easy', { completed: true, hits: 8, mistakes: 1, timeMs: 9000 })
    recordMic('scale:easy', { completed: true, hits: 8, mistakes: 0, timeMs: 7000 })
    recordMic('scale:easy', { completed: false, hits: 3, mistakes: 2 })
    const s = getProgress().mic.stats['scale:easy']
    expect(s).toMatchObject({ attempts: 3, completed: 2, hits: 19, mistakes: 3, bestTimeMs: 7000 })
    recordMicMemo('easy', 12, 2, 60)
    recordMicMemo('easy', 6, 0, 30)
    expect(getProgress().mic.stats['memo:easy'].bestScore).toBeCloseTo(12)
    expect(getProgress().mic.memoHistory).toHaveLength(2)
    resetProgress()
  })
})
