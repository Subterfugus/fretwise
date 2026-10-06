import { describe, expect, it } from 'vitest'
import { CHORDS, buildChord, type ChordType } from '@/theory/chords'
import { FLAT_NAMES, SHARP_NAMES, pitchClass } from '@/theory/notes'
import { analyzeVoicing, chordLibrary, type LibraryVoicing } from './chordLibrary'
import { VOICE_LEADING_TYPES, voiceLeadingCandidates, voiceLeadingPath, voiceLeadingTransition, type VoiceLeadingOptions } from './voiceLeading'

const ROOTS = [...new Set([...SHARP_NAMES, ...FLAT_NAMES])]
const OPEN = [40, 45, 50, 55, 59, 64]
const INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  dom7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9], minMaj7: [0, 3, 7, 11], aug7: [0, 4, 8, 10], augMaj7: [0, 4, 8, 11]
}
const options: VoiceLeadingOptions = { strings: [1, 2, 3], fretRange: [0, 9] }
const triad = (root: string) => ({ root, type: 'maj' as ChordType })
const sets: number[][] = []
for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) for (let c = b + 1; c <= 6; c++) {
  sets.push([a, b, c])
  for (let d = c + 1; d <= 6; d++) sets.push([a, b, c, d])
}
const movement = (a: LibraryVoicing, b: LibraryVoicing): number => a.shape.frets.reduce<number>((sum, f, i) =>
  f === null ? sum : sum + Math.abs(f - b.shape.frets[i]!), 0)

describe('voice-leading candidates', () => {
  it('includes every complete library candidate across roots, qualities, string sets and inclusive ranges', () => {
    const ranges: [number, number][] = [[0, 22], [0, 4], [5, 9], [18, 22], [0, 0], [22, 22]]
    for (const root of ROOTS) for (const type of Object.keys(INTERVALS) as ChordType[]) {
      const library = chordLibrary(root, type)
      const before = JSON.stringify(library)
      const chordPcs = INTERVALS[type].map((interval) => (pitchClass(root) + interval) % 12).sort((a, b) => a - b)
      for (const strings of sets) {
        for (const fretRange of ranges) {
          const result = voiceLeadingCandidates({ root, type }, { strings, fretRange })
          const expected = library.filter((v) => v.stringSet === strings.join('-') && !v.omitted.length &&
            v.shape.frets.every((f) => f === null || (f >= fretRange[0] && f <= fretRange[1])))
          expect(result.map((v) => v.id).sort(), `${root} ${type} ${strings} ${fretRange}`).toEqual(expected.map((v) => v.id).sort())
          for (const v of result) {
            expect(v.strings).toEqual(strings)
            expect(v.omitted).toEqual([])
            const actualPcs = [...new Set(v.shape.frets.flatMap((f, i) => f === null ? [] : [(OPEN[i] + f) % 12]))].sort((a, b) => a - b)
            expect(actualPcs).toEqual(chordPcs)
            expect(v.shape.frets.filter((f) => f !== null)).toHaveLength(strings.length)
          }
        }
      }
      expect(JSON.stringify(library)).toBe(before)
    }
  }, 60000)

  it('retains distinct inversions/alternatives and allows duplicated triad tones on four strings', () => {
    const candidates = voiceLeadingCandidates(triad('C'), { strings: [1, 2, 3, 4], fretRange: [0, 22] })
    expect(candidates.length).toBeGreaterThan(3)
    expect(new Set(candidates.map((v) => v.inversion))).toEqual(new Set([0, 1, 2]))
    expect(new Set(candidates.map((v) => v.id)).size).toBe(candidates.length)
    expect(voiceLeadingCandidates({ root: 'C', type: 'maj7' }, options)).toEqual([])
  })

  it('includes fret zero and 22 while excluding opens from positive windows', () => {
    const open = voiceLeadingCandidates(triad('C'), options).find((v) => v.id === 'x,x,x,0,1,0')
    expect(open).toBeTruthy()
    expect(voiceLeadingCandidates(triad('C'), { ...options, fretRange: [1, 9] }).some((v) => v.id === open!.id)).toBe(false)
    const high = ROOTS.flatMap((root) => voiceLeadingCandidates(triad(root), { strings: [1, 2, 3], fretRange: [18, 22] }))
    expect(high.some((v) => v.shape.frets.includes(22))).toBe(true)
    expect(high.every((v) => v.shape.frets.every((f) => f === null || f <= 22))).toBe(true)
  })

  it('safely rejects malformed/unsupported chords and options', () => {
    const badOptions = [
      null, {}, { strings: [1, 2], fretRange: [0, 22] }, { strings: [3, 2, 1], fretRange: [0, 22] },
      { strings: [1, 1, 2], fretRange: [0, 22] }, { strings: [0, 2, 3], fretRange: [0, 22] },
      { strings: [1, 2, 7], fretRange: [0, 22] }, { strings: [1, 2, 3], fretRange: [-1, 22] },
      { strings: [1, 2, 3], fretRange: [0, 23] }, { strings: [1, 2, 3], fretRange: [9, 4] },
      { strings: [1, 2, 3], fretRange: [0, NaN] }, { strings: [1, 2, 3], fretRange: [0, 3.5] }
    ]
    for (const invalid of badOptions) {
      expect(voiceLeadingCandidates(triad('C'), invalid as VoiceLeadingOptions)).toEqual([])
      expect(voiceLeadingPath([triad('C'), triad('G')], invalid as VoiceLeadingOptions)).toEqual({ voicings: [], totalMovement: 0, missing: [0, 1] })
    }
    for (const chord of [null, { root: 'H', type: 'maj' }, { root: 1, type: 'maj' }, { root: 'C', type: 'sus3' }, { root: 'C', type: '__proto__' }]) {
      expect(voiceLeadingCandidates(chord as { root: string; type: ChordType }, options)).toEqual([])
    }
  })
  it('keeps all nonextended chord tones and existing validated extended omissions', () => {
    expect(VOICE_LEADING_TYPES).toEqual(Object.keys(CHORDS))
    const strings = [1, 2, 3, 4]
    for (const type of VOICE_LEADING_TYPES) {
      const extended = CHORDS[type].intervals.length > 4
      const result = voiceLeadingCandidates({ root: 'C', type }, { strings, fretRange: [0, 22] })
      const expected = chordLibrary('C', type).filter((v) => v.stringSet === strings.join('-') && (extended || !v.omitted.length))
      expect(result.map((v) => v.id).sort(), type).toEqual(expected.map((v) => v.id).sort())
      for (const v of result) {
        const sounding = new Set(v.shape.frets.flatMap((f, i) => f === null ? [] : [(OPEN[i] + f) % 12]))
        expect([...sounding].every((pc) => buildChord('C', type).map(pitchClass).includes(pc))).toBe(true)
        if (!extended) expect(v.omitted).toEqual([])
      }
    }
    expect(voiceLeadingCandidates({ root: 'C', type: 'sus4' }, options).length).toBeGreaterThan(0)
    expect(voiceLeadingCandidates({ root: 'C', type: 'power' }, options).length).toBeGreaterThan(0)
    const extendedPath = voiceLeadingPath([{ root: 'D', type: 'min9' }, { root: 'G', type: 'dom13' }, { root: 'C', type: 'maj9' }], { strings, fretRange: [0, 22] })
    expect(extendedPath.missing).toEqual([])
    expect(extendedPath.voicings.map((v) => v.type)).toEqual(['min9', 'dom13', 'maj9'])
    expect(extendedPath.voicings.every((v) => v.omitted.length > 0)).toBe(true)
  })
})

describe('voice-leading transitions', () => {
  const from = analyzeVoicing('C', 'maj', { name: '', frets: [null, null, null, 0, 1, 0] })!
  const to = analyzeVoicing('F', 'maj', { name: '', frets: [null, null, null, 2, 1, 1] })!
  it('reports signed same-string movement using actual standard-tuning MIDI', () => {
    expect(voiceLeadingTransition(from, to)).toEqual({
      moves: [
        { string: 1, fromFret: 0, toFret: 1, fromMidi: 64, toMidi: 65, semitones: 1 },
        { string: 2, fromFret: 1, toFret: 1, fromMidi: 60, toMidi: 60, semitones: 0 },
        { string: 3, fromFret: 0, toFret: 2, fromMidi: 55, toMidi: 57, semitones: 2 }
      ], movement: 3, held: 1
    })
    expect(voiceLeadingTransition(to, from).moves.map((m) => m.semitones)).toEqual([-1, 0, -2])
    expect(voiceLeadingTransition(from, from).held).toBe(3)
  })
  it('does not call octave-displaced pitch classes held', () => {
    const up = analyzeVoicing('C', 'maj', { name: '', frets: [null, null, null, 12, 13, 12] })!
    const transition = voiceLeadingTransition(from, up)
    expect(transition.held).toBe(0)
    expect(transition.movement).toBe(36)
    expect(transition.moves.map((m) => m.semitones)).toEqual([12, 12, 12])
  })
  it('returns safe empty transitions for malformed shapes or changed string sets', () => {
    const other = voiceLeadingCandidates(triad('C'), { strings: [2, 3, 4], fretRange: [0, 22] })[0]
    for (const v of [null, other, { ...from, shape: { name: '', frets: [] } }, { ...from, shape: { name: '', frets: [null, null, null, 0, 1, 23] } }]) {
      expect(voiceLeadingTransition(from, v as LibraryVoicing)).toEqual({ moves: [], movement: 0, held: 0 })
    }
  })
})

describe('voice-leading paths', () => {
  it('finds a strictly better whole path than nearest-next-shape greedy search', () => {
    const window: VoiceLeadingOptions = { strings: [1, 2, 3, 4], fretRange: [0, 12] }
    const chords: { root: string; type: ChordType }[] = [
      { root: 'C', type: 'maj7' }, { root: 'C', type: 'min' }, { root: 'G', type: 'augMaj7' }
    ]
    const startId = 'x,x,9,9,8,8'
    let current = voiceLeadingCandidates(chords[0], window).find((v) => v.id === startId)!
    let greedy = 0
    for (const chord of chords.slice(1)) {
      const next = voiceLeadingCandidates(chord, window).reduce((best, v) =>
        movement(current, v) < movement(current, best) ? v : best)
      greedy += movement(current, next)
      current = next
    }
    expect(greedy).toBe(9)
    expect(voiceLeadingPath(chords, { ...window, startId }).totalMovement).toBe(7)
  })
  it('matches an independent exhaustive oracle for whole-progression movement and difficulty ties', () => {
    const chords = [triad('C'), triad('F'), triad('G'), triad('C')]
    const window = { ...options, fretRange: [0, 5] as [number, number] }
    const layers = chords.map((chord) => voiceLeadingCandidates(chord, window))
    let minimum = Infinity
    let easiest = Infinity
    function enumerate(step: number, path: LibraryVoicing[], total: number, difficulty: number): void {
      if (step === layers.length) {
        if (total < minimum || (total === minimum && difficulty < easiest)) {
          minimum = total
          easiest = difficulty
        }
        return
      }
      for (const v of layers[step]) enumerate(step + 1, [...path, v], total + (step ? movement(path[step - 1], v) : 0), difficulty + Math.round(v.difficulty * 100))
    }
    enumerate(0, [], 0, 0)
    const result = voiceLeadingPath(chords, window)
    expect(result.missing).toEqual([])
    expect(result.totalMovement).toBe(minimum)
    expect(result.voicings.reduce((sum, v) => sum + Math.round(v.difficulty * 100), 0)).toBe(easiest)
    expect(result.voicings.reduce((sum, v, i) => i ? sum + movement(result.voicings[i - 1], v) : sum, 0)).toBe(result.totalMovement)
  })

  it('pins any eligible starting alternative and ignores stale or ineligible ids', () => {
    const chords = [triad('C'), triad('G'), triad('F')]
    for (const v of voiceLeadingCandidates(chords[0], options)) {
      const result = voiceLeadingPath(chords, { ...options, startId: v.id })
      expect(result.voicings[0].id).toBe(v.id)
      expect(result.totalMovement).toBe(Math.min(...voiceLeadingCandidates(chords[1], options).flatMap((middle) =>
        voiceLeadingCandidates(chords[2], options).map((end) => movement(v, middle) + movement(middle, end)))))
    }
    const unpinned = voiceLeadingPath(chords, options)
    expect(voiceLeadingPath(chords, { ...options, startId: 'stale' })).toEqual(unpinned)
    expect(voiceLeadingPath(chords, { ...options, startId: '3,2,0,0,0,3' })).toEqual(unpinned)
  })

  it('returns no partial path and reports every impossible chord index', () => {
    expect(voiceLeadingPath([], options)).toEqual({ voicings: [], totalMovement: 0, missing: [] })
    expect(voiceLeadingPath([triad('C'), { root: 'G', type: 'dom7' }, triad('H'), { root: 'F', type: 'maj7' }], options))
      .toEqual({ voicings: [], totalMovement: 0, missing: [1, 2, 3] })
    expect(voiceLeadingPath([triad('C')], { ...options, fretRange: [22, 22] }))
      .toEqual({ voicings: [], totalMovement: 0, missing: [0] })
    const singleton = voiceLeadingPath([triad('C')], options)
    expect(singleton.totalMovement).toBe(0)
    expect(singleton.voicings).toHaveLength(1)
    expect(singleton.voicings[0].id).toBe(voiceLeadingCandidates(triad('C'), options)[0].id)
  })

  it('is deterministic for symmetric chords and longer repeated progressions', () => {
    const chords = Array.from({ length: 12 }, (_, i) => ({ root: ['C', 'F', 'G'][i % 3], type: 'aug' as ChordType }))
    const first = voiceLeadingPath(chords, options)
    expect(first.voicings).toHaveLength(chords.length)
    for (let i = 0; i < 5; i++) expect(voiceLeadingPath(chords, options)).toEqual(first)
  })
})
