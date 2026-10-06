import { describe, expect, it } from 'vitest'
import { effectiveCapo, effectiveTuning, isDeadFret, isStandardTuning, shouldShowTuning, soundingMidi, soundingPc, stringLetter, tuningCaption, writtenKey } from './tuning'
import { OPEN_CHORDS, STANDARD_TUNING, midiAt, nameAt, noteAt, positionsOf, positionsOfPitch, shapeMidis, shapeMidisIn, shapeNoteNames } from '@/theory/guitar'
import { DADGAD, DROP_D, HALF_STEP_DOWN, OPEN_G, TUNINGS, findTuning, sameTuning, stringGaps, tuningLetters, tuningShift } from '@/theory/tunings'
import { midiToName, mod, pcName } from '@/theory/notes'

describe('tunings constants', () => {
  it('each tuning has six strings whose letters match the MIDI pitch classes', () => {
    for (const t of TUNINGS) {
      expect(t.midi, t.id).toHaveLength(6)
      expect(t.letters, t.id).toHaveLength(6)
      const low = [...t.midi].reverse()
      t.letters.forEach((l, i) => {
        const flatSpelled = pcName(low[i], true) === l
        const sharpSpelled = pcName(low[i], false) === l
        expect(flatSpelled || sharpSpelled, `${t.id} string ${6 - i} ${l}`).toBe(true)
      })
      // strings get higher from 6 to 1 except the repeated octave-ish ones; at least non-decreasing
      for (let i = 1; i < 6; i++) expect(low[i], t.id).toBeGreaterThan(low[i - 1])
    }
  })

  it('has the exact open-string pitches (scientific names)', () => {
    const names = (t: number[]) => [...t].reverse().map((m) => midiToName(m, true)).join(' ')
    expect(names(STANDARD_TUNING)).toBe('E2 A2 D3 G3 B3 E4')
    expect(names(DROP_D.midi)).toBe('D2 A2 D3 G3 B3 E4')
    expect(names(DADGAD.midi)).toBe('D2 A2 D3 G3 A3 D4')
    expect(names(OPEN_G.midi)).toBe('D2 G2 D3 G3 B3 D4')
    expect(names(TUNINGS.find((t) => t.id === 'openD')!.midi)).toBe('D2 A2 D3 Gb3 A3 D4')
    expect(names(TUNINGS.find((t) => t.id === 'openE')!.midi)).toBe('E2 B2 E3 Ab3 B3 E4')
    expect(names(TUNINGS.find((t) => t.id === 'doubleDropD')!.midi)).toBe('D2 A2 D3 G3 B3 D4')
    expect(names(HALF_STEP_DOWN.midi)).toBe('Eb2 Ab2 Db3 Gb3 Bb3 Eb4')
  })

  it('moves from standard by the expected amounts', () => {
    expect(tuningShift(STANDARD_TUNING, DROP_D.midi)).toEqual([0, 0, 0, 0, 0, -2])
    expect(tuningShift(STANDARD_TUNING, DADGAD.midi)).toEqual([-2, -2, 0, 0, 0, -2])
    expect(tuningShift(STANDARD_TUNING, OPEN_G.midi)).toEqual([-2, 0, 0, 0, -2, -2])
    expect(tuningShift(STANDARD_TUNING, HALF_STEP_DOWN.midi)).toEqual([-1, -1, -1, -1, -1, -1])
  })

  it('stringGaps reads low to high', () => {
    expect(stringGaps(STANDARD_TUNING)).toEqual([5, 5, 5, 4, 5])
    expect(stringGaps(DROP_D.midi)).toEqual([7, 5, 5, 4, 5])
    expect(stringGaps(DADGAD.midi)).toEqual([7, 5, 5, 2, 5])
    expect(stringGaps(OPEN_G.midi)).toEqual([5, 7, 5, 4, 3])
  })

  it('finds and spells tunings', () => {
    expect(findTuning([...DADGAD.midi])?.id).toBe('dadgad')
    expect(findTuning([1, 2, 3, 4, 5, 6])).toBeUndefined()
    expect(tuningLetters(HALF_STEP_DOWN.midi)).toEqual(['Eb', 'Ab', 'Db', 'Gb', 'Bb', 'Eb'])
    expect(tuningLetters([64, 59, 55, 50, 45, 36])).toEqual(['C', 'A', 'D', 'G', 'B', 'E']) // unnamed: sharps fallback
    expect(sameTuning(STANDARD_TUNING, [64, 59, 55, 50, 45, 40])).toBe(true)
  })
})

describe('tuned fret math', () => {
  it('default arguments are unchanged for standard tuning', () => {
    expect(midiAt({ string: 6, fret: 0 })).toBe(40)
    expect(nameAt({ string: 3, fret: 0 }, false)).toBe('G')
    expect(positionsOf('A', 0, 5).map((q) => q.string + ':' + q.fret)).toEqual(['1:5', '3:2', '5:0', '6:5'])
    expect(shapeMidis(OPEN_CHORDS.G)).toEqual([43, 47, 50, 55, 59, 67])
  })

  it('midiAt / nameAt / noteAt follow the tuning', () => {
    expect(midiAt({ string: 6, fret: 0 }, DROP_D.midi)).toBe(38)
    expect(midiAt({ string: 6, fret: 7 }, DROP_D.midi)).toBe(midiAt({ string: 5, fret: 0 })) // fret 7 on the low D = open A
    expect(nameAt({ string: 6, fret: 2 }, false, DROP_D.midi)).toBe('E')
    expect(nameAt({ string: 1, fret: 0 }, true, HALF_STEP_DOWN.midi)).toBe('Eb')
    expect(noteAt({ string: 2, fret: 0 }, false, DADGAD.midi)).toMatchObject({ letter: 'A', octave: 3 })
  })

  it('positionsOf / positionsOfPitch accept a tuning', () => {
    // In Drop D the low string plays D at fret 0 and 12
    expect(positionsOf('D', 0, 12, DROP_D.midi).filter((p) => p.string === 6).map((p) => p.fret)).toEqual([0, 12])
    expect(positionsOfPitch('D2', 22, DROP_D.midi)).toContainEqual({ string: 6, fret: 0 })
    expect(positionsOfPitch('D2')).toEqual([]) // not reachable in standard tuning
    expect(positionsOfPitch('E2', 22, DROP_D.midi)).toContainEqual({ string: 6, fret: 2 })
  })

  it('shapeMidis adds tuning and capo', () => {
    // Em shape 022000 in Drop D: D B E G B E
    expect(shapeNoteNames(OPEN_CHORDS.Em, false, DROP_D.midi)).toEqual(['D', 'B', 'E', 'G', 'B', 'E'])
    // G shape with capo 3 sounds as Bb major: Bb D F Bb D Bb
    const g3 = shapeMidisIn(OPEN_CHORDS.G, STANDARD_TUNING, 3)
    expect(g3.map((m) => mod(m, 12))).toEqual([10, 2, 5, 10, 2, 10])
    expect(g3[0]).toBe(46)
    expect(shapeNoteNames(OPEN_CHORDS.G, true, STANDARD_TUNING, 3)).toEqual(['Bb', 'D', 'F', 'Bb', 'D', 'Bb'])
  })
})

describe('component helpers', () => {
  it('effectiveTuning falls back for bad input', () => {
    expect(effectiveTuning()).toEqual(STANDARD_TUNING)
    expect(effectiveTuning([1, 2, 3])).toEqual(STANDARD_TUNING)
    expect(effectiveTuning([64, 59, 55, 50, 45, NaN])).toEqual(STANDARD_TUNING)
    expect(effectiveTuning(DROP_D.midi)).toEqual(DROP_D.midi)
    expect(effectiveTuning(DROP_D.midi)).not.toBe(DROP_D.midi) // a copy
  })
  it('isStandardTuning / shouldShowTuning', () => {
    expect(isStandardTuning()).toBe(true)
    expect(isStandardTuning([...STANDARD_TUNING])).toBe(true)
    expect(isStandardTuning(DROP_D.midi)).toBe(false)
    expect(shouldShowTuning()).toBe(false)
    expect(shouldShowTuning(DROP_D.midi)).toBe(true)
    expect(shouldShowTuning(DROP_D.midi, false)).toBe(false)
    expect(shouldShowTuning(undefined, true)).toBe(true)
  })
  it('effectiveCapo clamps', () => {
    expect(effectiveCapo()).toBe(0)
    expect(effectiveCapo(-2)).toBe(0)
    expect(effectiveCapo(3)).toBe(3)
    expect(effectiveCapo(40)).toBe(12)
    expect(effectiveCapo(NaN)).toBe(0)
  })
  it('soundingMidi / soundingPc', () => {
    expect(soundingMidi({ string: 1, fret: 3 })).toBe(67)
    expect(soundingMidi({ string: 1, fret: 3 }, DADGAD.midi)).toBe(65)
    expect(soundingMidi({ string: 5, fret: 0 }, OPEN_G.midi, 2)).toBe(45)
    expect(soundingPc({ string: 6, fret: 5 }, DROP_D.midi)).toBe(7) // G
  })
  it('stringLetter names the open string', () => {
    expect(stringLetter(6)).toBe('E')
    expect(stringLetter(6, DROP_D.midi)).toBe('D')
    expect(stringLetter(2, DADGAD.midi)).toBe('A')
    expect(stringLetter(1, HALF_STEP_DOWN.midi)).toBe('Eb')
  })
  it('isDeadFret', () => {
    expect(isDeadFret(0, 0)).toBe(false)
    expect(isDeadFret(0, 3)).toBe(true)
    expect(isDeadFret(2, 3)).toBe(true)
    expect(isDeadFret(3, 3)).toBe(false)
  })
  it('writtenKey is an octave up and honours flats', () => {
    expect(writtenKey(40)).toBe('E/3')
    expect(writtenKey(39)).toBe('D#/3')
    expect(writtenKey(39, true)).toBe('Eb/3')
  })
  it('tuningCaption', () => {
    expect(tuningCaption()).toBe('')
    expect(tuningCaption(undefined, 2)).toBe('Capo 2')
    expect(tuningCaption(DROP_D.midi)).toBe('Tuning (low to high): D A D G B E')
    expect(tuningCaption(HALF_STEP_DOWN.midi, 1)).toBe('Tuning (low to high): Eb Ab Db Gb Bb Eb · Capo 1')
  })
})
