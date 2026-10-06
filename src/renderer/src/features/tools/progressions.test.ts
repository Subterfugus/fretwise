import { describe, expect, it } from 'vitest'
import { CHORDS, type ChordType } from '@/theory/chords'
import { fitScales, parseRoman, progressionChords } from './progressions'

describe('Roman chord quality preservation', () => {
  it('accepts every explicit chord type without changing its quality', () => {
    for (const type of Object.keys(CHORDS) as ChordType[]) {
      expect(parseRoman(`V${type}`), type).toEqual({ interval: 'P5', type })
      expect(progressionChords('C', [`V${type}`])[0]).toMatchObject({ root: 'G', type })
    }
  })
  it.each([
    ['V7b9', 'dom7b9'], ['V7\u266d9', 'dom7b9'], ['V7#9', 'dom7s9'], ['V7\u266f9', 'dom7s9'],
    ['I+maj7', 'augMaj7'], ['Imaj7#5', 'augMaj7'], ['V11', 'dom11'], ['i11', 'min11'],
    ['V13', 'dom13'], ['Imaj7#11', 'maj7s11'], ['Imin11', 'min11'], ['IminMaj7', 'minMaj7'],
    ['i(maj7)', 'minMaj7'], ['Im(maj7)', 'minMaj7'], ['Imaj', 'maj'], ['ii7', 'min7'],
    ['ii7b5', 'm7b5'], ['vii7b5', 'm7b5']
  ])('parses %s as %s', (roman, type) => expect(parseRoman(roman)?.type).toBe(type))
  it.each(['Vbogus', 'V)', '(V)', 'V((maj7))', 'Vconstructor', 'V__proto__'])('rejects malformed %s', (roman) => expect(parseRoman(roman)).toBeNull())
  it('retains a requested scale beyond the ordinary suggestions', () => {
    expect(fitScales('C', progressionChords('C', ['I', 'V']), 'ionian').some((fit) => fit.type === 'ionian')).toBe(true)
    expect(fitScales('C', [], 'locrian').some((fit) => fit.type === 'locrian')).toBe(true)
    expect(fitScales('C', []).some((fit) => fit.type === 'ionian')).toBe(false)
  })
})
