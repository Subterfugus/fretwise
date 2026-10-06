import { describe, expect, it } from 'vitest'
import { SCALES, scaleSemitones, type ScaleType } from '@/theory/scales'
import { pcAt, posKey } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import { compareScales, comparisonMarks, comparisonRootMidi, comparisonSequence, comparisonTonicSequence, comparisonPlaybackSequence, tonicReferenceOffsets, comparisonPreset, comparisonRootB, comparisonSameRoot, swapComparison, DEFAULT_COMPARISON, validComparisonConfig } from './scaleComparison'

describe('scale comparison', () => {
  it('compares major and natural minor over the same root', () => {
    const c = compareScales(9, 'major', 'naturalMinor')
    expect(c.shared.map((p) => p.a!.note)).toEqual(['A', 'B', 'D', 'E'])
    expect(c.onlyA.map((p) => p.a!.note)).toEqual(['C#', 'F#', 'G#'])
    expect(c.onlyB.map((p) => p.b!.note)).toEqual(['C', 'F', 'G'])
    expect(c.pitches[0].pc).toBe(9)
  })
  it('compares relative minor and Dorian by identical pitches with independent degrees and roots', () => {
    for (const [b, rootB] of [['naturalMinor', 9], ['dorian', 2]] as [ScaleType, number][]) {
      const c = compareScales(0, 'major', b, rootB)
      expect(c).toMatchObject({ root: 'C', rootPc: 0, rootA: 'C', rootAPc: 0, rootBPc: rootB })
      expect(c.shared).toHaveLength(7)
      expect(c.onlyA).toEqual([])
      expect(c.onlyB).toEqual([])
      expect(c.pitches.find((p) => p.pc === rootB)!.b!.degree).toBe('1')
      expect(c.pitches.find((p) => p.pc === rootB)!.a!.degree).toBe(rootB === 9 ? '6' : '2')
      expect(c.pitches.find((p) => p.pc === 0)!.b!.degree).toBe(rootB === 9 ? '\u266d3' : '\u266d7')
    }
  })
  it('keeps absolute membership correct for every pair of roots and partial overlaps', () => {
    for (let aRoot = 0; aRoot < 12; aRoot++) for (let bRoot = 0; bRoot < 12; bRoot++) {
      const c = compareScales(aRoot, 'major', 'harmonicMinor', bRoot)
      const aPcs = scaleSemitones('major').map((n) => mod(aRoot + n, 12))
      const bPcs = scaleSemitones('harmonicMinor').map((n) => mod(bRoot + n, 12))
      expect(new Set(c.shared.map((p) => p.pc))).toEqual(new Set(aPcs.filter((pc) => bPcs.includes(pc))))
      expect(new Set(c.onlyB.map((p) => p.pc))).toEqual(new Set(bPcs.filter((pc) => !aPcs.includes(pc))))
      expect(c.tonesA.map((p) => p.pc)).toEqual(aPcs)
      expect(c.tonesB.map((p) => p.pc)).toEqual(bPcs)
    }
    const partial = compareScales(0, 'major', 'major', 1)
    expect(partial.shared).toHaveLength(2)
    expect(partial.onlyA).toHaveLength(5)
    expect(partial.onlyB).toHaveLength(5)
  })
  it('preserves exotic enharmonic spellings across different roots', () => {
    const c = compareScales(0, 'blues', 'major', 11)
    const shared = c.shared.find((p) => p.pc === 6)!
    expect(shared.a).toMatchObject({ note: 'Gb', degree: '\u266d5' })
    expect(shared.b).toMatchObject({ note: 'F#', degree: '5' })
    expect(compareScales(4, 'major', 'naturalMinor', 1).rootB).toBe('C#')
    const exotic = compareScales(1, 'locrian', 'altered', 6)
    for (const p of exotic.shared) {
      expect(pitchClass(p.a!.note)).toBe(p.pc)
      expect(pitchClass(p.b!.note)).toBe(p.pc)
    }
  })
  it('swaps both roots and scales and reverses side membership', () => {
    const config = { ...DEFAULT_COMPARISON, rootPc: 0, rootBPc: 2, sameRoot: false, a: 'major' as const, b: 'harmonicMinor' as const }
    const swapped = swapComparison(config)
    expect(swapped).toMatchObject({ rootPc: 2, rootBPc: 0, a: 'harmonicMinor', b: 'major' })
    expect(swapComparison(swapped)).toEqual(config)
    const a = compareScales(config.rootPc, config.a, config.b, config.rootBPc)
    const b = compareScales(swapped.rootPc, swapped.a, swapped.b, swapped.rootBPc)
    expect(new Set(a.onlyA.map((p) => p.pc))).toEqual(new Set(b.onlyB.map((p) => p.pc)))
    expect(new Set(a.shared.map((p) => p.pc))).toEqual(new Set(b.shared.map((p) => p.pc)))
  })
  it('retains distinct tonic markers independently of membership and labels', () => {
    const c = compareScales(0, 'major', 'naturalMinor', 9)
    const marks = comparisonMarks(c, { ...DEFAULT_COMPARISON, labels: 'none' })
    for (const mark of marks) {
      expect(mark.color).toBe('tone')
      expect(mark.label).toBeUndefined()
      expect(mark.comparisonTonic).toBe(pcAt(mark) === 0 ? 'a' : pcAt(mark) === 9 ? 'b' : undefined)
    }
    expect(comparisonMarks(compareScales(0, 'major', 'naturalMinor'), DEFAULT_COMPARISON).filter((m) => pcAt(m) === 0).every((m) => m.comparisonTonic === 'both')).toBe(true)
  })
  it('applies relative and parallel presets to the existing A root', () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const config = { ...DEFAULT_COMPARISON, rootPc }
      expect(comparisonPreset(config, 'relative-minor')).toMatchObject({ rootPc, rootBPc: mod(rootPc + 9, 12), sameRoot: false, a: 'major', b: 'naturalMinor' })
      expect(comparisonPreset(config, 'relative-dorian')).toMatchObject({ rootPc, rootBPc: mod(rootPc + 2, 12), sameRoot: false })
      expect(comparisonPreset(config, 'major-minor')).toMatchObject({ rootPc, rootBPc: rootPc, sameRoot: true })
    }
  })
  it('identifies subset scales and the additional blue note', () => {
    const c = compareScales(9, 'minorPentatonic', 'blues')
    expect(c.shared).toHaveLength(5)
    expect(c.onlyA).toEqual([])
    expect(c.onlyB.map((p) => p.b!.note)).toEqual(['Eb'])
    expect(c.onlyB[0].b!.degree).toBe('\u266d5')
  })
  it('recognizes aliases and identical scales without inventing differences', () => {
    for (const [a, b] of [['major', 'ionian'], ['naturalMinor', 'aeolian'], ['dorian', 'dorian']] as [ScaleType, ScaleType][]) {
      const c = compareScales(6, a, b)
      expect(c.onlyA).toEqual([])
      expect(c.onlyB).toEqual([])
      expect(c.shared).toHaveLength(7)
    }
  })
  it('compares every root and every scale pair by sounding pitches', () => {
    const types = Object.keys(SCALES) as ScaleType[]
    for (let root = 0; root < 12; root++) for (const a of types) for (const b of types) {
      const c = compareScales(root, a, b)
      const aPcs = scaleSemitones(a).map((n) => mod(root + n, 12))
      const bPcs = scaleSemitones(b).map((n) => mod(root + n, 12))
      expect(c.shared.map((p) => p.pc)).toEqual(aPcs.filter((pc) => bPcs.includes(pc)))
      expect(c.onlyA.map((p) => p.pc)).toEqual(aPcs.filter((pc) => !bPcs.includes(pc)))
      expect(c.onlyB.map((p) => p.pc)).toEqual(bPcs.filter((pc) => !aPcs.includes(pc)))
      expect(new Set(c.pitches.map((p) => p.pc)).size).toBe(new Set([...aPcs, ...bPcs]).size)
      for (const p of c.pitches) {
        if (p.a) expect(pitchClass(p.a.note)).toBe(p.pc)
        if (p.b) expect(pitchClass(p.b.note)).toBe(p.pc)
      }
    }
  })
  it('keeps both spellings and degrees when an enharmonic pitch is shared', () => {
    const c = compareScales(0, 'blues', 'lydian')
    const tone = c.shared.find((p) => p.pc === 6)!
    expect(tone.a).toMatchObject({ note: 'Gb', degree: '\u266d5' })
    expect(tone.b).toMatchObject({ note: 'F#', degree: '\u266f4' })
  })
  it('swaps unique membership without changing shared sounding pitches', () => {
    const a = compareScales(2, 'dorian', 'major'), b = compareScales(2, 'major', 'dorian')
    expect(a.onlyA.map((p) => p.pc)).toEqual(b.onlyB.map((p) => p.pc))
    expect(a.shared.map((p) => p.pc)).toEqual(b.shared.map((p) => p.pc))
  })
  it('marks inclusive boundary frets once each and grades membership correctly', () => {
    const c = compareScales(9, 'major', 'naturalMinor')
    const marks = comparisonMarks(c, { ...DEFAULT_COMPARISON, frets: [0, 22] })
    expect(new Set(marks.map(posKey)).size).toBe(marks.length)
    expect(marks.some((m) => m.fret === 0)).toBe(true)
    expect(marks.some((m) => m.fret === 22)).toBe(true)
    for (const m of marks) {
      const p = c.pitches.find((p) => p.pc === pcAt(m))!
      expect(m.color).toBe(p.group === 'shared' ? 'tone' : p.group === 'a' ? 'accent' : 'root')
      expect(m.fret).toBeGreaterThanOrEqual(0)
      expect(m.fret).toBeLessThanOrEqual(22)
    }
  })
  it('filters overlays, differences, and individual scales', () => {
    const c = compareScales(9, 'minorPentatonic', 'blues')
    const differences = comparisonMarks(c, { ...DEFAULT_COMPARISON, view: 'differences' })
    expect(differences.length).toBeGreaterThan(0)
    expect(differences.every((m) => pcAt(m) === 3)).toBe(true)
    const a = comparisonMarks(c, { ...DEFAULT_COMPARISON, view: 'a' })
    expect(a.every((m) => c.tonesA.some((t) => t.pc === pcAt(m)))).toBe(true)
    expect(comparisonMarks(compareScales(0, 'major', 'ionian'), { ...DEFAULT_COMPARISON, view: 'differences' })).toEqual([])
  })
  it('keeps theoretical note spelling and supports either scale degree labels', () => {
    const c = compareScales(0, 'blues', 'lydian')
    const options = { ...DEFAULT_COMPARISON, frets: [0, 12] as [number, number] }
    expect(comparisonMarks(c, { ...options, view: 'b' }).find((m) => pcAt(m) === 6)!.label).toBe('F#')
    expect(comparisonMarks(c, options).find((m) => pcAt(m) === 6)!.label).toBe('Gb')
    expect(comparisonMarks(c, { ...options, labels: 'a' }).find((m) => pcAt(m) === 6)!.label).toBe('\u266d5')
    expect(comparisonMarks(c, { ...options, labels: 'b' }).find((m) => pcAt(m) === 6)!.label).toBe('\u266f4')
    expect(comparisonMarks(c, { ...options, labels: 'none' }).every((m) => m.label === undefined)).toBe(true)
    expect(comparisonMarks(c, options).every((m) => m.computedNote === undefined)).toBe(true)
  })
  it('uses an absent-degree marker for notes outside the selected scale', () => {
    const c = compareScales(9, 'minorPentatonic', 'blues')
    expect(comparisonMarks(c, { ...DEFAULT_COMPARISON, labels: 'a' }).find((m) => pcAt(m) === 3)!.label).toBe('-')
  })
  it('uses one identical sounding root and octave for both playback sequences', () => {
    for (let root = 0; root < 12; root++) for (const octave of [2, 3, 4]) {
      const a = comparisonSequence(root, 'major', octave, false), b = comparisonSequence(root, 'naturalMinor', octave, false)
      expect(a[0].notes).toEqual(b[0].notes)
      expect(a.at(-1)!.notes).toEqual([comparisonRootMidi(root, octave) + 12])
      expect(a.map((e) => e.beats)).toEqual(b.map((e) => e.beats))
    }
  })
  it('keeps every octave-2 root, reference and scale at or above standard low E', () => {
    for (let root = 0; root < 12; root++) {
      const base = comparisonRootMidi(root, 2)
      expect(base).toBeGreaterThanOrEqual(40)
      expect(base % 12).toBe(root)
      expect(base).toBe(root < 4 ? 48 + root : 36 + root)
      for (const scale of Object.keys(SCALES) as ScaleType[]) {
        const notes = comparisonSequence(root, scale, 2, true).flatMap((e) => e.notes)
        expect(notes[0]).toBe(base)
        const midis = notes.filter((note): note is number => typeof note === 'number')
        expect(midis).toHaveLength(notes.length)
        expect(Math.min(...midis)).toBeGreaterThanOrEqual(40)
      }
    }
  })
  it('returns to the root without duplicating the top note on up-and-back playback', () => {
    const seq = comparisonSequence(9, 'minorPentatonic', 3, true)
    expect(seq).toHaveLength(11)
    expect(seq[0].notes).toEqual([57])
    expect(seq.at(-1)!.notes).toEqual([57])
    expect(seq.filter((e) => e.notes[0] === 69)).toHaveLength(1)
  })
  it('round trips valid settings and rejects malformed saved preferences', () => {
    expect(validComparisonConfig(JSON.parse(JSON.stringify(DEFAULT_COMPARISON)))).toBe(true)
    for (const bad of [null, [], {}, { ...DEFAULT_COMPARISON, a: '__proto__' }, { ...DEFAULT_COMPARISON, bpm: Infinity },
      { ...DEFAULT_COMPARISON, frets: [5, 2] }, { ...DEFAULT_COMPARISON, frets: [0, 23] }, { ...DEFAULT_COMPARISON, rootPc: 12 },
      { ...DEFAULT_COMPARISON, view: 'invalid' }, { ...DEFAULT_COMPARISON, labels: 'invalid' }, { ...DEFAULT_COMPARISON, octave: 9 },
      { ...DEFAULT_COMPARISON, upAndBack: 'yes' }, { ...DEFAULT_COMPARISON, rootBPc: 12 }, { ...DEFAULT_COMPARISON, rootBPc: -1 },
      { ...DEFAULT_COMPARISON, rootBPc: NaN }, { ...DEFAULT_COMPARISON, rootBPc: 1.5 }, { ...DEFAULT_COMPARISON, rootBPc: 'A' },
      { ...DEFAULT_COMPARISON, rootBPc: undefined }, { ...DEFAULT_COMPARISON, tonicReference: 'true' },
      { ...DEFAULT_COMPARISON, tonicReference: undefined }, { ...DEFAULT_COMPARISON, sameRoot: 'yes' },
      { ...DEFAULT_COMPARISON, sameRoot: true, rootBPc: 0 }]) expect(validComparisonConfig(bad)).toBe(false)
    const { rootBPc: _b, sameRoot: _s, tonicReference: _r, ...legacy } = DEFAULT_COMPARISON
    expect(validComparisonConfig(legacy)).toBe(true)
    expect(validComparisonConfig({ ...legacy, sameRoot: false })).toBe(false)
    expect(comparisonRootB(legacy)).toBe(legacy.rootPc)
    expect(comparisonSameRoot(legacy)).toBe(true)
    expect(validComparisonConfig({ ...legacy, rootBPc: 0 })).toBe(true)
    expect(comparisonSameRoot({ ...legacy, rootBPc: 0 })).toBe(false)
  })
  it('builds scale-contained major, minor, diminished and suspended tonic references', () => {
    expect(tonicReferenceOffsets(SCALES.major.intervals)).toEqual([0, 4, 7])
    expect(tonicReferenceOffsets(SCALES.naturalMinor.intervals)).toEqual([0, 3, 7])
    expect(tonicReferenceOffsets(SCALES.locrian.intervals)).toEqual([0, 3, 6])
    expect(tonicReferenceOffsets(['P1', 'M2', 'P5'])).toEqual([0, 2, 7])
    expect(tonicReferenceOffsets(['P1', 'P4', 'P5'])).toEqual([0, 5, 7])
    expect(tonicReferenceOffsets(SCALES.chromatic.intervals)).toEqual([0, 12])
    expect(tonicReferenceOffsets(SCALES.altered.intervals)).toEqual([0, 4, 8])
    for (let root = 0; root < 12; root++) for (const scale of Object.keys(SCALES) as ScaleType[]) {
      const reference = comparisonTonicSequence(root, scale, 2)
      const pitches = reference.flatMap((e) => e.notes) as number[]
      expect(reference[0].notes).toEqual([comparisonRootMidi(root, 2)])
      expect(reference.at(-1)!.notes).toEqual(reference[0].notes)
      expect(pitches.every((midi) => midi >= 40)).toBe(true)
      expect(pitches.every((midi) => scaleSemitones(scale).includes(mod(midi - root, 12)))).toBe(true)
    }
  })
  it('schedules the tonic reference and scale as one sequence, with an optional gap', () => {
    const scale = comparisonSequence(9, 'naturalMinor', 3, true)
    expect(comparisonPlaybackSequence(9, 'naturalMinor', 3, true, false)).toEqual(scale)
    expect(comparisonPlaybackSequence(9, 'naturalMinor', 3, true, true)).toEqual([
      ...comparisonTonicSequence(9, 'naturalMinor', 3), { notes: [], beats: 0.5 }, ...scale
    ])
    expect(comparisonPlaybackSequence(0, 'major', 3, false, true)[0].notes).toEqual([48])
    expect(comparisonPlaybackSequence(9, 'naturalMinor', 3, false, true)[0].notes).toEqual([57])
  })
})
