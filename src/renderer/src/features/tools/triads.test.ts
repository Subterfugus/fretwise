import { describe, expect, it } from 'vitest'
import { midiAt, pcAt, type FretPos } from '@/theory/guitar'
import {
  answerTriadRun, chooseTriadQuestion, closestTriadVoicing, diagnoseTriad, gradeTriad, TRIAD_QUALITIES, TRIAD_STRING_SETS,
  triadItemKey, triadPcs, triadQuestionPool, triadVoicings,
  type TriadChallenge, type TriadInversion, type TriadQuality, type TriadRun
} from './triads'

const base: TriadChallenge = { rootPc: 0, quality: 'maj', stringSet: 0, inversion: 2, frets: [0, 12] }
const openC: FretPos[] = [{ string: 1, fret: 0 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }]
const positionKey = (shape: FretPos[]) => [...shape].sort((a, b) => a.string - b.string).map((p) => `${p.string}:${p.fret}`).join(',')

describe('compact triad voicings', () => {
  it('has valid solutions for all roots, qualities, string sets, and inversions', () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) for (const quality of Object.keys(TRIAD_QUALITIES) as TriadQuality[])
      for (let stringSet = 0; stringSet < 4; stringSet++) for (const inversion of [0, 1, 2] as TriadInversion[]) {
        const c: TriadChallenge = { rootPc, quality, stringSet, inversion, frets: [0, 22] }
        const shapes = triadVoicings(c)
        expect(shapes.length, triadItemKey(c)).toBeGreaterThan(0)
        expect(new Set(shapes.map(positionKey)).size).toBe(shapes.length)
        for (const shape of shapes) {
          expect(gradeTriad(c, shape)).toEqual({ correct: true })
          expect(shape.map((p) => p.string)).toEqual([...TRIAD_STRING_SETS[stringSet]])
          expect(new Set(shape.map((p) => pcAt(p)))).toEqual(new Set(triadPcs(c)))
          expect(Math.max(...shape.map((p) => p.fret)) - Math.min(...shape.map((p) => p.fret))).toBeLessThanOrEqual(4)
          expect(Math.min(...shape.map((p) => midiAt(p))) % 12).toBe(triadPcs(c)[inversion])
        }
      }
  })

  it('exhaustively includes every valid alternative in the displayed range', () => {
    // Independent pitch/fret oracle also checks that enumeration does not miss a voicing.
    for (const quality of ['maj', 'min', 'dim'] as TriadQuality[]) for (let stringSet = 0; stringSet < 4; stringSet++) {
      const c: TriadChallenge = { ...base, quality, stringSet, frets: [0, 12] }
      const expected: string[] = []
      const strings = TRIAD_STRING_SETS[stringSet]
      for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) for (let d = 0; d <= 12; d++) {
        const frets = [a, b, d]
        if (Math.max(...frets) - Math.min(...frets) > 4) continue
        const positions = strings.map((string, i) => ({ string, fret: frets[i] }))
        const midis = positions.map((p) => midiAt(p))
        const pcs = midis.map((m) => m % 12)
        const required = TRIAD_QUALITIES[quality].intervals
        if (new Set(pcs).size === 3 && pcs.every((pc) => required.includes(pc)) && Math.min(...midis) % 12 === required[2])
          expected.push(positionKey(positions))
      }
      expect(triadVoicings(c).map(positionKey).sort()).toEqual(expected.sort())
    }
  })

  it('grades alternate answers by pitch and accepts reordered selections', () => {
    const alternatives = triadVoicings({ ...base, frets: [0, 22] })
    expect(alternatives.length).toBeGreaterThan(1)
    alternatives.forEach((picks) => expect(gradeTriad({ ...base, frets: [0, 22] }, [...picks].reverse()).correct).toBe(true))
  })

  it('includes open and upper boundary frets and a four-fret stretch', () => {
    expect(gradeTriad(base, openC).correct).toBe(true)
    expect(triadVoicings(base).map(positionKey)).toContain(positionKey(openC))
    const shapes = triadQuestionPool('advanced').flatMap((q) => q.solutions)
    expect(shapes.some((shape) => shape.some((p) => p.fret === 22))).toBe(true)
    expect(shapes.some((shape) => Math.max(...shape.map((p) => p.fret)) - Math.min(...shape.map((p) => p.fret)) === 4)).toBe(true)
  })

  it('uses the actual lowest MIDI pitch, regardless of selection order', () => {
    expect(gradeTriad(base, openC)).toEqual({ correct: true })
    expect(gradeTriad({ ...base, inversion: 0 }, [...openC].reverse())).toEqual({ correct: false, reason: 'bass' })
    expect(gradeTriad({ ...base, inversion: 1 }, openC)).toEqual({ correct: false, reason: 'bass' })
  })

  it('rejects wrong or repeated tones, duplicates, inactive strings, range and span violations', () => {
    expect(gradeTriad(base, [{ string: 1, fret: 1 }, ...openC.slice(1)])).toEqual({ correct: false, reason: 'tones' })
    const repeated = [{ string: 1, fret: 3 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }]
    expect(gradeTriad(base, repeated)).toEqual({ correct: false, reason: 'tones' })
    expect(gradeTriad(base, [openC[0], openC[0], openC[2]])).toEqual({ correct: false, reason: 'strings' })
    expect(gradeTriad(base, [{ string: 4, fret: 0 }, ...openC.slice(1)])).toEqual({ correct: false, reason: 'strings' })
    expect(gradeTriad(base, openC.slice(0, 2))).toEqual({ correct: false, reason: 'strings' })
    expect(gradeTriad(base, [{ string: 1, fret: 13 }, ...openC.slice(1)])).toEqual({ correct: false, reason: 'range' })
    expect(gradeTriad(base, [{ string: 1, fret: 0.5 }, ...openC.slice(1)])).toEqual({ correct: false, reason: 'range' })
    expect(gradeTriad(base, [{ string: 1, fret: 12 }, ...openC.slice(1)])).toEqual({ correct: false, reason: 'span' })
  })

  it('returns no shapes for impossible or invalid configurations', () => {
    expect(triadVoicings({ ...base, frets: [0, 0] })).toEqual([])
    for (const c of [
      { ...base, rootPc: 12 }, { ...base, stringSet: 4 }, { ...base, frets: [12, 0] },
      { ...base, frets: [-1, 12] }, { ...base, frets: [0, 23] }, { ...base, inversion: 3 }
    ]) {
      expect(triadVoicings(c as TriadChallenge)).toEqual([])
      expect(gradeTriad(c as TriadChallenge, openC)).toEqual({ correct: false, reason: 'configuration' })
    }
  })
})

describe('triad repair feedback', () => {
  it('reports missing and duplicated chord tones and marks every duplicate', () => {
    const picks = [{ string: 1, fret: 3 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }]
    const diagnosis = diagnoseTriad(base, picks)
    expect(diagnosis.missing).toEqual([{ pc: 4, role: 1, count: 0 }])
    expect(diagnosis.duplicated).toEqual([{ pc: 7, role: 2, count: 2 }])
    expect(diagnosis.notes.filter((p) => p.duplicate).map((p) => p.string)).toEqual([1, 3])
    expect(diagnosis.outside).toEqual([])
    expect(diagnosis.bassMatches).toBe(true)
  })

  it('reports non-chord tones even when fret span is the first failure', () => {
    const picks = [{ string: 1, fret: 13 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }]
    const c: TriadChallenge = { ...base, frets: [0, 22] }
    expect(gradeTriad(c, picks)).toEqual({ correct: false, reason: 'span' })
    expect(diagnoseTriad(c, picks).outside).toEqual([{ pc: 5, role: null, count: 1 }])
    expect(diagnoseTriad(c, picks).notes[0].role).toBeNull()
    expect(diagnoseTriad(c, picks).missing.map((t) => t.pc)).toEqual([4])
  })

  it('finds actual bass on a higher string and handles tied lowest pitches', () => {
    const picks = [{ string: 3, fret: 12 }, { string: 1, fret: 3 }, { string: 2, fret: 1 }]
    const diagnosis = diagnoseTriad({ ...base, inversion: 0 }, picks)
    expect(diagnosis.notes.filter((p) => p.bass)).toEqual([
      { string: 2, fret: 1, pc: 0, role: 0, duplicate: false, bass: true }
    ])
    expect(diagnosis.bassMatches).toBe(true)
    const tied = diagnoseTriad(base, [{ string: 1, fret: 0 }, { string: 2, fret: 5 }, { string: 3, fret: 9 }])
    expect(tied.notes.every((p) => p.bass && p.duplicate)).toBe(true)
    expect(tied.bassMatches).toBe(false)
  })

  it('distinguishes a wrong inversion from missing tones', () => {
    const diagnosis = diagnoseTriad({ ...base, inversion: 0 }, openC)
    expect(diagnosis.missing).toEqual([])
    expect(diagnosis.duplicated).toEqual([])
    expect(diagnosis.outside).toEqual([])
    expect(diagnosis.bassMatches).toBe(false)
    expect(diagnosis.notes.find((p) => p.bass)?.role).toBe(2)
  })

  it('uses the quality-specific third and fifth for minor and diminished chords', () => {
    for (const quality of ['maj', 'min', 'dim'] as TriadQuality[]) {
      const c = { ...base, quality }
      const diagnosis = diagnoseTriad(c, [])
      expect(diagnosis.missing.map((t) => t.pc)).toEqual(TRIAD_QUALITIES[quality].intervals)
      expect(diagnosis.missing.map((t) => t.role)).toEqual([0, 1, 2])
      expect(diagnosis.bassMatches).toBe(false)
    }
  })

  it('suggests a minimal concrete change without mutating the selection', () => {
    const picks = [{ string: 1, fret: 3 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }]
    const before = structuredClone(picks)
    const correction = closestTriadVoicing(base, picks)!
    expect(correction.positions).toEqual(openC)
    expect(correction.changes).toEqual([{ string: 1, from: picks[0], to: openC[0] }])
    expect(correction.distance).toBe(3)
    expect(picks).toEqual(before)
    expect(closestTriadVoicing(base, [...picks].reverse())).toEqual(correction)
  })

  it('minimizes changed strings first, then total distance, across every supported challenge', () => {
    for (const q of triadQuestionPool('advanced')) {
      const picks = q.solutions.at(-1)!.map((p, i) => ({ ...p, fret: Math.max(0, p.fret - i - 1) }))
      const correction = closestTriadVoicing(q, picks)!
      expect(gradeTriad(q, correction.positions).correct).toBe(true)
      const cost = (shape: FretPos[]) => [
        shape.filter((p) => picks.find((x) => x.string === p.string)!.fret !== p.fret).length,
        shape.reduce((sum, p) => sum + Math.abs(p.fret - picks.find((x) => x.string === p.string)!.fret), 0)
      ]
      const best = cost(correction.positions)
      for (const shape of q.solutions) {
        const other = cost(shape)
        expect(best[0] < other[0] || (best[0] === other[0] && best[1] <= other[1]), triadItemKey(q)).toBe(true)
      }
      expect(correction.distance).toBe(best[1])
    }
  })

  it('keeps any valid alternative unchanged and produces deterministic ties', () => {
    const c: TriadChallenge = { ...base, frets: [0, 22] }
    for (const shape of triadVoicings(c)) {
      expect(closestTriadVoicing(c, shape)).toEqual({ positions: shape, changes: [], distance: 0 })
    }
    expect(closestTriadVoicing(c, [])?.positions).toEqual(triadVoicings(c)[0])
    expect(closestTriadVoicing(c, [])).toEqual(closestTriadVoicing(c, []))
  })

  it('handles partial reveals, impossible ranges, and invalid diagnosis inputs', () => {
    const partial = closestTriadVoicing(base, openC.slice(0, 1))!
    expect(partial.changes).toHaveLength(2)
    expect(partial.changes.every((change) => change.from === undefined)).toBe(true)
    expect(partial.distance).toBe(0)
    expect(closestTriadVoicing({ ...base, frets: [0, 0] }, openC)).toBeUndefined()
    expect(diagnoseTriad({ ...base, rootPc: 12 }, openC).notes).toEqual([])
    expect(diagnoseTriad(base, [{ string: 0, fret: 1 }, { string: 1, fret: NaN }]).notes).toEqual([])
  })

  it('leaves the original score intact through wrong and correct repair attempts', () => {
    const q = triadQuestionPool('beginner')[0]
    const answered = answerTriadRun({ questions: [q], index: 0, answers: [] }, openC)
    expect(answered.answers[0]).toMatchObject({ correct: false, assisted: false })
    expect(gradeTriad(q, q.solutions.at(-1)!).correct).toBe(true)
    expect(answerTriadRun(answered, [], true)).toBe(answered)
    expect(answerTriadRun(answered, q.solutions.at(-1)!)).toBe(answered)
    const assisted = answerTriadRun({ questions: [q], index: 0, answers: [] }, [], true)
    expect(answerTriadRun(assisted, q.solutions[0])).toBe(assisted)
    expect(assisted.answers[0]).toMatchObject({ correct: false, assisted: true })
  })
})

describe('triad sessions', () => {
  it('uses only solvable questions and implements the requested levels', () => {
    const beginner = triadQuestionPool('beginner')
    expect(beginner).toHaveLength(3)
    expect(new Set(beginner.map((q) => q.rootPc))).toEqual(new Set([0, 7, 2]))
    expect(beginner.every((q) => q.quality === 'maj' && q.stringSet === 0 && q.inversion === 0 && q.frets[1] === 12)).toBe(true)
    const intermediate = triadQuestionPool('intermediate')
    expect(new Set(intermediate.map((q) => q.quality))).toEqual(new Set(['maj', 'min']))
    expect(new Set(intermediate.map((q) => q.stringSet))).toEqual(new Set([0, 1]))
    expect(new Set(intermediate.map((q) => q.inversion))).toEqual(new Set([0, 1, 2]))
    expect(intermediate.every((q) => q.frets[1] === 12 && q.solutions.length > 0)).toBe(true)
    const advanced = triadQuestionPool('advanced')
    expect(advanced).toHaveLength(432)
    expect(advanced.every((q) => q.frets[1] === 22 && q.solutions.length > 0)).toBe(true)
  })

  it('avoids consecutive identical prompts when possible and handles tiny/empty pools', () => {
    const pool = triadQuestionPool('beginner')
    expect(triadItemKey(chooseTriadQuestion(pool, triadItemKey(pool[0]), () => 0)!)).not.toBe(triadItemKey(pool[0]))
    expect(chooseTriadQuestion([pool[0]], triadItemKey(pool[0]), () => 0)).toBe(pool[0])
    expect(chooseTriadQuestion([], undefined, () => 0)).toBeUndefined()
    expect(chooseTriadQuestion(pool, undefined, () => 1)).toBe(pool.at(-1))
  })

  it('records an answer once and classifies reveals as assisted, never correct', () => {
    const q = triadQuestionPool('beginner')[0]
    const run: TriadRun = { questions: [q], index: 0, answers: [] }
    const answered = answerTriadRun(run, q.solutions[0])
    expect(answered.answers).toEqual([{ correct: true, assisted: false, grade: { correct: true } }])
    expect(answerTriadRun(answered, [], true)).toBe(answered)
    const revealed = answerTriadRun(run, q.solutions[0], true)
    expect(revealed.answers[0]).toMatchObject({ correct: false, assisted: true })
    expect(answerTriadRun(revealed, q.solutions[0])).toBe(revealed)
    expect(answerTriadRun({ ...run, index: 1 }, [])).toEqual({ ...run, index: 1 })
  })
})
