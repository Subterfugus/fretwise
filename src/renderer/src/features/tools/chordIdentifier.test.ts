import { describe, expect, it } from 'vitest'
import { CHORDS, buildChord, type ChordType } from '@/theory/chords'
import { parseInterval } from '@/theory/intervals'
import { shapeMidis } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import { CURATED_TEMPLATES } from './chordShapesData'
import { expandTemplate } from './chordLibrary'
import { identifyVoicing } from './chordIdentifier'
import { ROOTLESS_TYPES, omittableIntervals } from './voicings'

describe('chord identifier', () => {
  it('recognizes complete chords for every chord type in all 12 keys', () => {
    for (const type of Object.keys(CHORDS) as ChordType[]) for (let rootPc = 0; rootPc < 12; rootPc++) {
      const input = CHORDS[type].intervals.map((iv) => 48 + rootPc + parseInterval(iv).semitones)
      const result = identifyVoicing(input)
      expect(result.kind).toBe('chord')
      expect(result.matches).toContainEqual(expect.objectContaining({ rootPc, type, omitted: [] }))
      expect(result.bassMidi).toBe(48 + rootPc)
      expect(result.bassPc).toBe(rootPc)
    }
  })

  it('keeps Am7 and C6/A as alternatives and prefers the bass-root reading', () => {
    const result = identifyVoicing([57, 60, 64, 67])
    expect(result.matches[0]).toMatchObject({ rootPc: 9, type: 'min7', bassPc: 9, omitted: [] })
    expect(result.matches).toContainEqual(expect.objectContaining({ rootPc: 0, type: 'maj6', bassPc: 9, omitted: [] }))
    expect(identifyVoicing([48, 52, 55, 57]).matches[0]).toMatchObject({ rootPc: 0, type: 'maj6' })
  })

  it('takes the bass from the actual lowest MIDI pitch, independent of input order', () => {
    const result = identifyVoicing([64, 55, 48, 40, 60])
    expect(result.bassMidi).toBe(40)
    expect(result.bassPc).toBe(4)
    expect(result.matches[0]).toMatchObject({ rootPc: 0, type: 'maj', bassPc: 4, bassMidi: 40 })
  })

  it('allows established omissions and marks their interval indices', () => {
    const dominantShell = identifyVoicing([48, 52, 58])
    expect(dominantShell.matches).toContainEqual(expect.objectContaining({ rootPc: 0, type: 'dom7', omitted: [2] }))
    const thirteenthShell = identifyVoicing([48, 52, 58, 69])
    expect(thirteenthShell.matches).toContainEqual(expect.objectContaining({ rootPc: 0, type: 'dom13', omitted: [2, 4] }))
    const rootlessNinth = identifyVoicing([52, 55, 58, 62])
    expect(rootlessNinth.matches).toContainEqual(expect.objectContaining({ rootPc: 0, type: 'dom9', omitted: [0] }))
    expect(rootlessNinth.matches.every((m) => m.type !== 'dom7' || m.rootPc !== 0)).toBe(true)
  })

  it('ranks complete simple names ahead of omitted or rootless interpretations', () => {
    const result = identifyVoicing([52, 55, 58, 62])
    expect(result.matches[0]).toMatchObject({ rootPc: 4, type: 'm7b5', omitted: [] })
    const ninth = result.matches.find((m) => m.rootPc === 0 && m.type === 'dom9')!
    expect(ninth.score).toBeGreaterThan(result.matches[0].score)
    for (let i = 1; i < result.matches.length; i++) expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i - 1].score)
  })

  it('shows altered-fifth shells as weaker alternatives to their ordinary seventh reading', () => {
    const result = identifyVoicing([48, 51, 58])
    expect(result.matches[0]).toMatchObject({ rootPc: 0, type: 'min7', omitted: [2] })
    const halfDiminished = result.matches.find((m) => m.rootPc === 0 && m.type === 'm7b5')!
    expect(halfDiminished.omitted).toEqual([2])
    expect(halfDiminished.score).toBeGreaterThan(result.matches[0].score)
  })

  it('recognizes fifth power chords and their fourth inversions', () => {
    expect(identifyVoicing([48, 55]).matches[0]).toMatchObject({ rootPc: 0, type: 'power', bassPc: 0 })
    expect(identifyVoicing([55, 60]).matches[0]).toMatchObject({ rootPc: 0, type: 'power', bassPc: 7 })
    expect(identifyVoicing([48, 60, 67]).matches[0]).toMatchObject({ rootPc: 0, type: 'power', bassPc: 0 })
  })

  it('reports two-note intervals, including compounds and same-pitch-class octaves', () => {
    expect(identifyVoicing([48, 52])).toMatchObject({ kind: 'interval', matches: [], interval: { semitones: 4, label: 'major 3rd' } })
    expect(identifyVoicing([48, 64])).toMatchObject({ kind: 'interval', interval: { semitones: 16, label: 'major 10th' } })
    expect(identifyVoicing([48, 54])).toMatchObject({ kind: 'interval', interval: { semitones: 6, label: 'tritone' } })
    expect(identifyVoicing([48, 60])).toMatchObject({ kind: 'interval', matches: [], interval: { semitones: 12, label: 'octave' } })
    expect(identifyVoicing([48, 72])).toMatchObject({ kind: 'interval', interval: { semitones: 24, label: 'perfect 15th' } })
    expect(identifyVoicing([40, 76])).toMatchObject({ kind: 'interval', interval: { semitones: 36, label: 'perfect 22nd' } })
  })

  it('keeps unrecognized sets available as notes and intervals from the bass', () => {
    expect(identifyVoicing([48, 49, 50])).toMatchObject({ kind: 'unknown', matches: [], pcs: [0, 1, 2], bassPc: 0 })
  })

  it('handles empty, repeated, invalid and single-note input without mutating it', () => {
    expect(identifyVoicing([])).toMatchObject({ kind: 'empty', bassMidi: null, bassPc: null, matches: [] })
    expect(identifyVoicing([NaN, Infinity, -1, 128, 60.5])).toMatchObject({ kind: 'empty' })
    expect(identifyVoicing([60, 60, 60])).toMatchObject({ kind: 'note', midis: [60], pcs: [0], matches: [] })
    const input = [67, 60, 64, 60]
    const copy = [...input]
    expect(identifyVoicing(input).midis).toEqual([60, 64, 67])
    expect(input).toEqual(copy)
  })

  it('includes each curated template among the first six names at every reference-root expansion', () => {
    let count = 0
    for (const template of CURATED_TEMPLATES) for (const voicing of expandTemplate(template, template.refRoot)) {
      const result = identifyVoicing(shapeMidis(voicing))
      const match = result.matches.find((m) => m.type === template.type && m.rootPc === pitchClass(template.refRoot))
      const rank = result.matches.findIndex((m) => m === match) + 1
      expect(match, `${template.type} ${template.label} ${template.frets} @${template.refRoot}`).toBeDefined()
      expect(rank, `${template.refRoot} ${template.type} ${template.label}`).toBeLessThanOrEqual(6)
      const sounding = new Set(result.pcs)
      const omitted = buildChord(template.refRoot, template.type).flatMap((note, i) => sounding.has(pitchClass(note)) ? [] : [i])
      expect(match!.omitted).toEqual(omitted)
      count++
    }
    expect(count).toBeGreaterThan(CURATED_TEMPLATES.length)
  })

  it('every returned name has all essential tones, no outside tones, and accurate omissions', () => {
    for (const template of CURATED_TEMPLATES) {
      const voicing = expandTemplate(template, template.refRoot)[0]
      const result = identifyVoicing(shapeMidis(voicing))
      for (const match of result.matches) {
        const pcs = result.pcs
        const intervals = CHORDS[match.type].intervals
        const allowedOmissions = new Set(omittableIntervals(match.type))
        const chordPcs = intervals.map((iv) => mod(match.rootPc + parseInterval(iv).semitones, 12))
        for (const pc of pcs) expect(chordPcs).toContain(pc)
        for (const i of match.omitted) {
          expect(pcs).not.toContain(chordPcs[i])
          const fifthShell = intervals.length >= 4 && parseInterval(intervals[i]).number === 5
          expect(allowedOmissions.has(intervals[i]) || fifthShell || (i === 0 && ROOTLESS_TYPES.has(match.type))).toBe(true)
        }
        for (let i = 0; i < intervals.length; i++) if (!match.omitted.includes(i)) expect(pcs).toContain(chordPcs[i])
      }
    }
  })
})
