import { describe, expect, it } from 'vitest'
import { midi, midiToName, noteName, parseNote, pretty } from './notes'
import { intervalBetween, invert, parseInterval, transpose } from './intervals'
import { buildScale, scaleNames, scaleSemitones, stepPattern, degreeLabels } from './scales'
import { chordNames, diatonicChords, identifyChord } from './chords'
import { describeKeySignature, keySignature, relativeMinor } from './keys'
import {
  cagedSequence,
  midiAt,
  movableChord,
  nameAt,
  OPEN_CHORDS,
  pentatonicBoxes,
  positionsOf,
  scaleBox,
  shapeNoteNames
} from './guitar'
import { grade, buildQuiz, normaliseNote } from '@/content/grading'

describe('notes', () => {
  it('parses and names', () => {
    expect(noteName(parseNote('f#'))).toBe('F#')
    expect(midi('C4')).toBe(60)
    expect(midi('E2')).toBe(40)
    expect(midi('B#3')).toBe(60)
    expect(midiToName(61, true)).toBe('Db4')
    expect(pretty('Bb')).toBe('B♭')
    expect(pretty('F#4')).toBe('F♯4')
  })
})

describe('intervals', () => {
  it('uses correct ordinal suffixes for compound intervals beyond the named list', () => {
    for (const [interval, name] of [
      ['M14', 'major 14th'], ['P15', 'perfect 15th'], ['M21', 'major 21st'],
      ['P22', 'perfect 22nd'], ['M23', 'major 23rd'], ['M24', 'major 24th'],
      ['M111', 'major 111th'], ['M112', 'major 112th'], ['P113', 'perfect 113th']
    ]) expect(parseInterval(interval).long).toBe(name)
  })
  it('spells transpositions correctly', () => {
    expect(noteName(transpose('C', 'm3'))).toBe('Eb')
    expect(noteName(transpose('F#', 'M3'))).toBe('A#')
    expect(noteName(transpose('B', 'd5'))).toBe('F')
    expect(noteName(transpose('Eb', 'P5', true))).toBe('Ab')
    expect(transpose('A3', 'M9').octave).toBe(4)
  })
  it('names intervals between notes', () => {
    expect(intervalBetween('C', 'G').short).toBe('P5')
    expect(intervalBetween('E', 'C').short).toBe('m6')
    expect(intervalBetween('C', 'F#').short).toBe('A4')
    expect(intervalBetween('C4', 'D5').short).toBe('M9')
    expect(parseInterval('m7').semitones).toBe(10)
    expect(invert('M3')).toBe('m6')
  })
})

describe('scales', () => {
  it('builds all twelve chromatic pitches in semitone order for every root', () => {
    expect(scaleSemitones('chromatic')).toEqual(Array.from({ length: 12 }, (_, i) => i))
    expect(stepPattern('chromatic')).toBe(Array(12).fill('H').join(' '))
    for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      const first = midi(root + '3')
      expect(buildScale(root + '3', 'chromatic').map(midi)).toEqual(Array.from({ length: 12 }, (_, i) => first + i))
    }
  })
  it('builds spelled scales', () => {
    expect(scaleNames('D', 'major')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#'])
    expect(scaleNames('F', 'major')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E'])
    expect(scaleNames('A', 'minorPentatonic')).toEqual(['A', 'C', 'D', 'E', 'G'])
    expect(scaleNames('E', 'phrygian')).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D'])
    expect(stepPattern('major')).toBe('W W H W W W H')
    expect(degreeLabels('dorian')).toEqual(['1', '2', '♭3', '4', '5', '6', '♭7'])
  })
})

describe('chords & keys', () => {
  it('spells chords', () => {
    expect(chordNames('G', 'dom7')).toEqual(['G', 'B', 'D', 'F'])
    expect(chordNames('B', 'm7b5')).toEqual(['B', 'D', 'F', 'A'])
    expect(chordNames('C', 'dim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb'])
    expect(identifyChord(['E', 'G#', 'B'])).toEqual({ root: 'E', type: 'maj' })
  })
  it('diatonic chords', () => {
    expect(diatonicChords('C').map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(diatonicChords('G', 'major', true).map((c) => c.symbol)).toEqual([
      'Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F#m7♭5'
    ])
    expect(diatonicChords('A', 'harmonicMinor').map((c) => c.roman)[4]).toBe('V')
    expect(diatonicChords('A', 'harmonicMinor', true).map((c) => c.symbol)).toEqual([
      'Am(maj7)', 'Bm7♭5', 'Cmaj7♯5', 'Dm7', 'E7', 'Fmaj7', 'G#°7'
    ])
  })
  it('key signatures', () => {
    expect(keySignature('A').count).toBe(3)
    expect(keySignature('Eb').accidentals).toEqual(['Bb', 'Eb', 'Ab'])
    expect(keySignature('E', true).count).toBe(1)
    expect(relativeMinor('C')).toBe('A')
    expect(describeKeySignature('C')).toBe('no sharps or flats')
  })
})

describe('guitar', () => {
  it('fret math', () => {
    expect(nameAt({ string: 6, fret: 5 })).toBe('A')
    expect(nameAt({ string: 2, fret: 1 })).toBe('C')
    expect(midiAt({ string: 1, fret: 0 })).toBe(64)
    expect(positionsOf('E', 0, 12).length).toBe(8)
  })
  it('open chord shapes contain the right notes', () => {
    expect(shapeNoteNames(OPEN_CHORDS.C)).toEqual(['C', 'E', 'G', 'C', 'E'])
    expect(new Set(shapeNoteNames(OPEN_CHORDS.G))).toEqual(new Set(['G', 'B', 'D']))
    expect(new Set(shapeNoteNames(OPEN_CHORDS.B7))).toEqual(new Set(['B', 'D#', 'A', 'F#']))
  })
  it('movable and CAGED shapes', () => {
    expect(movableChord('G', 'maj', 6)!.frets).toEqual([3, 5, 5, 4, 3, 3])
    expect(movableChord('C', 'min7', 5)!.frets).toEqual([null, 3, 5, 3, 4, 3])
    const seq = cagedSequence('C')
    expect(seq.map((s) => s.form)).toEqual(['C', 'A', 'G', 'E', 'D'])
    for (const { shape } of seq) expect(new Set(shapeNoteNames(shape))).toEqual(new Set(['C', 'E', 'G']))
  })
  it('scale boxes', () => {
    const boxes = pentatonicBoxes('A')
    expect(boxes[0].filter((p) => p.string === 6).map((p) => p.fret)).toEqual([5, 8])
    expect(boxes[0].filter((p) => p.string === 2).map((p) => p.fret)).toEqual([5, 8])
    expect(boxes).toHaveLength(5)
    const three = scaleBox('G', 'major', 0, 3)
    expect(three).toHaveLength(18)
    expect(three.every((p) => p.fret >= 0)).toBe(true)
  })
})

describe('grading', () => {
  it('normalises notes', () => {
    expect(normaliseNote('bb')).toBe('Bb')
    expect(normaliseNote('f♯')).toBe('F#')
  })
  it('grades question kinds', () => {
    expect(grade({ kind: 'spell', prompt: '', answer: ['C', 'E', 'G'] }, { kind: 'spell', text: 'c, e g' })).toBe(true)
    expect(grade({ kind: 'spell', prompt: '', answer: ['C', 'Eb', 'G'] }, { kind: 'spell', text: 'C D# G' })).toBe(false)
    expect(grade({ kind: 'mc', prompt: '', choices: ['a', 'b'], answer: 1 }, { kind: 'mc', choice: 1 })).toBe(true)
    const fb = { kind: 'fretboard' as const, prompt: '', targets: [{ string: 6, fret: 5 }, { string: 5, fret: 0 }], mode: 'all' as const }
    expect(grade(fb, { kind: 'fretboard', picks: [{ string: 5, fret: 0 }, { string: 6, fret: 5 }] })).toBe(true)
    expect(grade(fb, { kind: 'fretboard', picks: [{ string: 5, fret: 0 }] })).toBe(false)
    expect(grade({ kind: 'text', prompt: '', accept: ['3', 'three'] }, { kind: 'text', text: ' Three ' })).toBe(true)
  })
  it('builds quizzes of the right size', () => {
    let i = 0
    const q = buildQuiz({
      count: 6,
      fixed: [1, 2, 3].map((n) => ({ kind: 'text', prompt: `f${n}`, accept: ['x'] })),
      generators: [() => ({ kind: 'text', prompt: `g${i++}`, accept: ['x'] })]
    })
    expect(q).toHaveLength(6)
  })
})
