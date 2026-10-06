// Regression tests for bugs found in the core review. Each block names the defect it guards.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intervalBetween, invert } from '@/theory/intervals'
import { describeKeySignature, keySignature } from '@/theory/keys'
import { pretty } from '@/theory/notes'
import { cagedShape, realBarre, shape } from '@/theory/guitar'
import { buildQuiz, grade, normaliseNote, splitNotes, textMatches } from '@/content/grading'
import type { QuizQuestion } from '@/content/types'
import { durationBeats, planBeats, tupletGroups } from '@/components/noteValues'
import { flushProgress, getProgress, mergeProgress, markLessonDone, resetProgress, updateProgress } from '@/state/progress'

describe('intervals', () => {
  it('Cb up to B is an augmented 7th, not a diminished one (semitones were reduced mod 12)', () => {
    expect(intervalBetween('Cb', 'B').short).toBe('A7')
    expect(intervalBetween('B', 'Cb').short).toBe('d2')
    expect(intervalBetween('C', 'C#').short).toBe('A1')
    expect(intervalBetween('E#', 'F').short).toBe('d2')
  })
  it('names descending pairs with octaves instead of throwing', () => {
    expect(intervalBetween('E4', 'C4').short).toBe('M3')
    expect(intervalBetween('C5', 'C4').short).toBe('P8')
    expect(intervalBetween('C5', 'D4').short).toBe('m7')
    expect(intervalBetween('C4', 'D5').short).toBe('M9')
  })
  it('inverts the octave to a unison', () => {
    expect(invert('P8')).toBe('P1')
    expect(invert('P1')).toBe('P8')
    expect(invert('M9')).toBe('m7')
  })
})

describe('key signatures', () => {
  it('counts double sharps/flats (G# major is 8 sharps, not 7)', () => {
    const k = keySignature('G#')
    expect(k.count).toBe(8)
    expect(k.accidentals).toHaveLength(8)
    expect(k.accidentals[7]).toBe('F##')
    expect(keySignature('Fb').count).toBe(-8)
    expect(describeKeySignature('C#')).toBe('7 sharps (F#, C#, G#, D#, A#, E#, B#)')
  })
  it('keeps normal keys unchanged', () => {
    expect(keySignature('F#').count).toBe(6)
    expect(keySignature('Db').count).toBe(-5)
    expect(keySignature('A', true).count).toBe(0)
  })
})

describe('pretty', () => {
  it('turns b between digits into a flat glyph in chord symbols', () => {
    expect(pretty('C7b9')).toBe('C7♭9')
    expect(pretty('Dm7b5')).toBe('Dm7♭5')
    expect(pretty('C7#9')).toBe('C7♯9')
  })
  it('leaves English prose alone', () => {
    const prose = 'About the Beginning: Bring a Big Book. Be able to play Abdul, Eb major and the Cbs.'
    expect(pretty(prose)).toBe(prose.replace('Eb major', 'E♭ major'))
    expect(pretty('Absolutely, Everything is fine')).toBe('Absolutely, Everything is fine')
  })
})

describe('caged shapes', () => {
  it('only reports a barre where the index finger really lies across two or more strings', () => {
    expect(cagedShape('C', 'C').barre).toBeUndefined() // open
    expect(cagedShape('F', 'E').barre).toBe(1)
    expect(cagedShape('C', 'A').barre).toBe(3)
    expect(cagedShape('C', 'D').frets).toEqual([null, null, 10, 12, 13, 12])
    expect(cagedShape('C', 'D').barre).toBeUndefined() // single string on the lowest fret
    expect(cagedShape('C', 'G').barre).toBe(5) // 3 strings at fret 5
    expect(cagedShape('G', 'D').barre).toBeUndefined()
  })
  it('realBarre needs unbroken fretting between the barre strings', () => {
    expect(realBarre([1, 3, 3, 2, 1, 1], 1)).toBe(1)
    expect(realBarre([2, null, 2], 2)).toBeUndefined()
    expect(realBarre([0, 0, 0], 0)).toBeUndefined()
  })
  it('thumb finger T parses to 5 rather than NaN', () => {
    expect(shape('x', 'x32010', 'T32010').fingers![0]).toBe(5)
  })
})

describe('grading', () => {
  it('distinguishes M3 from m3 in typed interval answers but not ordinary words', () => {
    const q: QuizQuestion = { kind: 'text', prompt: '', accept: ['m3', 'minor 3rd'] }
    expect(grade(q, { kind: 'text', text: 'm3' })).toBe(true)
    expect(grade(q, { kind: 'text', text: 'M3' })).toBe(false)
    expect(grade(q, { kind: 'text', text: 'Minor 3rd' })).toBe(true)
    const maj: QuizQuestion = { kind: 'text', prompt: '', accept: ['M6'] }
    expect(grade(maj, { kind: 'text', text: 'm6' })).toBe(false)
    expect(grade(maj, { kind: 'text', text: ' M6 ' })).toBe(true)
    expect(textMatches('P5', 'p5')).toBe(true)
  })
  it('ignores a trailing full stop in text answers', () => {
    expect(textMatches('three', 'Three.')).toBe(true)
  })
  it('accepts caps-lock flats and unicode accidentals when spelling', () => {
    expect(normaliseNote('EB')).toBe('Eb')
    expect(normaliseNote('BB')).toBe('Bb')
    expect(normaliseNote('B')).toBe('B')
    expect(normaliseNote('f♯')).toBe('F#')
    expect(normaliseNote('Fx')).toBe('F##')
    expect(normaliseNote('H')).toBeNull()
    expect(splitNotes('C/E/G')).toEqual(['C', 'E', 'G'])
    const q: QuizQuestion = { kind: 'spell', prompt: '', answer: ['E#', 'G#', 'B#'] }
    expect(grade(q, { kind: 'spell', text: 'E# G# B#' })).toBe(true)
    expect(grade(q, { kind: 'spell', text: 'F G# B#' })).toBe(false) // spelling counts
    expect(grade(q, { kind: 'spell', text: '' })).toBe(false)
  })
  it('does not shorten a quiz when generators repeat themselves', () => {
    const fixed: QuizQuestion[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'text', prompt: `fixed ${i}`, accept: ['x'] }))
    const same = (): QuizQuestion => ({ kind: 'text', prompt: 'always the same', accept: ['x'] })
    const q = buildQuiz({ count: 8, fixed, generators: [same] })
    expect(q).toHaveLength(8)
  })
  it('keeps generated questions that share a prompt but differ in content', () => {
    let n = 0
    const gen = (): QuizQuestion => ({
      kind: 'fretboard',
      prompt: 'Find the note',
      targets: [{ string: 1, fret: n++ % 12 }]
    })
    const q = buildQuiz({ count: 6, fixed: [], generators: [gen] })
    expect(q).toHaveLength(6)
  })
})

describe('note values', () => {
  it('plans plain, dotted and triplet beat lengths', () => {
    expect(planBeats(1)).toMatchObject({ duration: 'q', tuplet: false })
    expect(planBeats(1.5)).toMatchObject({ duration: 'qd', tuplet: false })
    expect(planBeats(1 / 3)).toMatchObject({ duration: '8', tuplet: true })
    expect(planBeats(2 / 3)).toMatchObject({ duration: 'q', tuplet: true })
    expect(planBeats(1 / 6)).toMatchObject({ duration: '16', tuplet: true })
  })
  it('never silently turns an odd length into a quarter note', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(planBeats(2.5).duration).toBe('h')
    expect(planBeats(5).duration).toBe('w')
    expect(planBeats(0.6).duration).toBe('8')
  })
  it('groups triplets into brackets', () => {
    const plans = [1 / 3, 1 / 3, 1 / 3, 1, 2 / 3, 1 / 3, 1].map(planBeats)
    expect(tupletGroups(plans)).toEqual([[0, 1, 2], [4, 5]])
    expect(tupletGroups([2 / 3, 2 / 3, 2 / 3].map(planBeats))).toEqual([[0, 1, 2]])
    expect(tupletGroups([1].map(planBeats))).toEqual([])
  })
  it('reads durations with rests and dots', () => {
    expect(durationBeats('qdr')).toBe(1.5)
    expect(durationBeats('8')).toBe(0.5)
    expect(durationBeats('h')).toBe(2)
  })
})

describe('progress persistence', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as { window?: unknown }).window
  })

  it('merges saved data over defaults and drops fields of the wrong shape', () => {
    const p = mergeProgress({
      lessonsDone: { a: 1, b: 'bad' },
      quizzes: { u1: { best: 0.9, passed: true }, u2: 'nope' },
      ear: { d: { k: { right: 1, total: 2 }, bad: 5 }, junk: 7 },
      earHistory: { d: [{ at: 1, right: 1, total: 2 }, 'x'] },
      settings: { instrument: 'kazoo', volume: 7, leftHanded: true },
      lastLesson: 5
    })
    expect(p.lessonsDone).toEqual({ a: 1 })
    expect(p.quizzes.u1).toEqual({ best: 0.9, last: 0, attempts: 0, passed: true })
    expect(p.quizzes.u2).toBeUndefined()
    expect(p.ear).toEqual({ d: { k: { right: 1, total: 2 } } })
    expect(p.earHistory.d).toHaveLength(1)
    expect(p.settings).toEqual({ instrument: 'guitar-acoustic', unlockAll: false, volume: 1, leftHanded: true, noteNames: 'auto', theme: 'dark' })
    expect(p.lastLesson).toBeUndefined()
    expect(mergeProgress(null).version).toBe(1)
    expect(mergeProgress('garbage').lessonsDone).toEqual({})
  })

  it('flushes a pending debounced save synchronously (quit within 250ms must not lose progress)', () => {
    vi.useFakeTimers()
    const saveProgress = vi.fn(() => Promise.resolve())
    const saveProgressSync = vi.fn()
    ;(globalThis as { window?: unknown }).window = { fretwise: { loadProgress: vi.fn(), saveProgress, saveProgressSync } }
    markLessonDone('u1l1')
    expect(saveProgress).not.toHaveBeenCalled() // still debounced
    flushProgress(true)
    expect(saveProgressSync).toHaveBeenCalledTimes(1)
    expect((saveProgressSync.mock.calls[0] as unknown[])[0]).toMatchObject({ lessonsDone: { u1l1: expect.any(Number) } })
    vi.advanceTimersByTime(1000)
    expect(saveProgress).not.toHaveBeenCalled() // timer was cancelled by the flush
    flushProgress(true) // nothing dirty: no second write
    expect(saveProgressSync).toHaveBeenCalledTimes(1)
  })

  it('reset clears the last-visited lesson and keeps settings', () => {
    vi.useFakeTimers()
    updateProgress((p) => void (p.settings.leftHanded = true))
    markLessonDone('u2l3')
    expect(getProgress().lastLesson).toBe('u2l3')
    resetProgress()
    expect(getProgress().lastLesson).toBeUndefined()
    expect(getProgress().lessonsDone).toEqual({})
    expect(getProgress().settings.leftHanded).toBe(true)
  })
})
