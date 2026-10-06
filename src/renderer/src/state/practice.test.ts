import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProgress, mergeProgress, recordPracticeAnswer, recordPracticeSession, resetProgress, updateProgress } from './progress'
import { normalizePractice } from './practiceTypes'
import { getNoteNameSetting } from '@/theory/spelling'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  resetProgress()
})
afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('practice progress compatibility', () => {
  it('retains legacy practice counts and histories missing optional assistance or timing', () => {
    const p = mergeProgress({ practice: { triads: { stats: { old: { right: 2, total: 3 } }, history: [
      { at: 12, right: 2, total: 3 }, { at: 13, right: 1, total: 2, assisted: 1 }
    ] } } })
    expect(p.practice.triads.stats.old).toEqual({ right: 2, total: 3, assisted: 0 })
    expect(p.practice.triads.history).toEqual([
      { at: 12, right: 2, total: 3, assisted: 0, durationMs: 0 },
      { at: 13, right: 1, total: 2, assisted: 1, durationMs: 0 }
    ])
    const malformed = normalizePractice({ triads: { stats: { invalid: { total: 1, right: 0, assisted: 'oops' } },
      history: [{ at: 1, total: 1, right: 0, durationMs: -1 }] } })
    expect(malformed.triads).toEqual({ stats: {}, history: [] })
  })

  it('skips prototype-style keys throughout persisted dictionaries', () => {
    const keys = ['__proto__', 'prototype', 'constructor']
    const raw = JSON.parse('{"lessonsDone":{"__proto__":1,"prototype":2,"constructor":3},"quizzes":{"__proto__":{"best":1},"prototype":{},"constructor":{}},"ear":{"__proto__":{},"prototype":{},"constructor":{},"intervals":{"__proto__":{"right":1,"total":1},"prototype":{"right":1,"total":1},"constructor":{"right":1,"total":1}}},"earHistory":{"__proto__":[],"prototype":[],"constructor":[]},"mic":{"stats":{"__proto__":{},"prototype":{},"constructor":{}}}}')
    const p = mergeProgress(raw)
    for (const dict of [p.lessonsDone, p.quizzes, p.ear, p.ear.intervals, p.earHistory, p.mic.stats]) {
      keys.forEach((key) => expect(Object.hasOwn(dict, key)).toBe(false))
      expect(Object.getPrototypeOf(dict)).toBe(Object.prototype)
    }
  })

  it('clamps quiz and ear scores to finite valid ranges without changing valid records', () => {
    const p = mergeProgress({ quizzes: { invalid: { best: 8, last: -2, attempts: 3.9, passed: true },
      nonfinite: { best: NaN, last: Infinity, attempts: -5 } }, ear: { intervals: {
      invalid: { right: 12.8, total: 4.9 }, negative: { right: -5, total: -10 }, nonfinite: { right: NaN, total: Infinity }
    } }, earHistory: { intervals: [{ at: 123, right: 20, total: 4 }, { at: -1, right: 1, total: 1 }] } })
    expect(p.quizzes.invalid).toEqual({ best: 1, last: 0, attempts: 3, passed: true })
    expect(p.quizzes.nonfinite).toEqual({ best: 0, last: 0, attempts: 0, passed: false })
    expect(p.ear.intervals).toEqual({ invalid: { right: 4, total: 4 }, negative: { right: 0, total: 0 }, nonfinite: { right: 0, total: 0 } })
    expect(p.earHistory.intervals).toEqual([{ at: 123, right: 4, total: 4 }])
    expect(mergeProgress({ quizzes: { u1: { best: 0.9, last: 0.8, attempts: 2, passed: true } } }).quizzes.u1)
      .toEqual({ best: 0.9, last: 0.8, attempts: 2, passed: true })
  })
  it('loads old saves with empty additions and Auto note names', () => {
    const p = mergeProgress({ lessonsDone: { u1l1: 123 }, settings: { volume: 0.4 } })
    expect(p.lessonsDone.u1l1).toBe(123)
    expect(p.settings.noteNames).toBe('auto')
    expect(p.practice.noteFinder).toEqual({ stats: {}, history: [] })
    expect(p.toolPresets).toEqual([])
  })
  it('rejects corrupt settings and non-finite practice counts', () => {
    const p = mergeProgress({ settings: { noteNames: { key: 'garbage' } }, practice: { triads: { stats: { bad: { right: Infinity, total: 3, assisted: 0 }, valid: { right: 4, total: 2, assisted: 5 } } } } })
    expect(p.settings.noteNames).toBe('auto')
    expect(p.practice.triads.stats.bad).toBeUndefined()
    expect(p.practice.triads.stats.valid).toEqual({ right: 2, total: 2, assisted: 0 })
  })
  it('records assisted answers separately from unassisted success', () => {
    recordPracticeAnswer('noteFinder', '2:7', true)
    recordPracticeAnswer('noteFinder', '2:7', false)
    recordPracticeAnswer('noteFinder', '2:7', true, true)
    expect(getProgress().practice.noteFinder.stats['2:7']).toEqual({ right: 1, total: 3, assisted: 1 })
  })
  it('keeps only the newest thirty summaries in memory and after loading', () => {
    for (let i = 0; i < 35; i++) recordPracticeSession('triads', { right: 1, total: 2, assisted: 0, durationMs: i })
    const p = getProgress()
    expect(p.practice.triads.history).toHaveLength(30)
    expect(p.practice.triads.history[0].durationMs).toBe(5)
    expect(normalizePractice({ triads: { history: [...p.practice.triads.history, ...p.practice.triads.history] } }).triads.history).toHaveLength(30)
  })
  it('updates the guitar spelling snapshot when settings change', () => {
    updateProgress((p) => { p.settings.noteNames = { key: 'F' } })
    expect(getNoteNameSetting()).toEqual({ key: 'F' })
  })
  it('clears new drill progress while retaining settings and saved presets', () => {
    updateProgress((p) => {
      p.settings.noteNames = 'flats'
      p.toolPresets = [{ id: 'metro', name: 'Warmup', tool: 'metronome', config: {
        bpm: 100, sig: '4/4', sub: 'none', accentFirst: true, volume: 0.8,
        trOn: false, trStep: 5, trEvery: 4, trTarget: 160
      }, createdAt: 1, updatedAt: 1 }]
    })
    recordPracticeAnswer('triads', '0:maj:0:0', true)
    const saved = structuredClone(getProgress().toolPresets)
    resetProgress()
    expect(getProgress().toolPresets).toEqual(saved)
    expect(getProgress().practice.triads.stats).toEqual({})
    expect(getProgress().settings.noteNames).toBe('flats')
  })
})
