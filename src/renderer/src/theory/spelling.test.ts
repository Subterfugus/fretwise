import { afterEach, describe, expect, it, vi } from 'vitest'
import { midi, parseNote, pitchClass, SHARP_NAMES, FLAT_NAMES } from './notes'
import { CIRCLE_MAJOR } from './keys'
import { buildScale } from './scales'
import { getNoteNameSetting, setNoteNameSetting, spellMidi, spellPc, validNoteNameSetting } from './spelling'
import { nameAt, noteAt } from './guitar'
import { chordToneMarks, noteMarks, scaleMarks, shapeMarks } from '@/content/helpers'
import { OPEN_CHORDS } from './guitar'
import { UNITS } from '@/content/units'
import type { NoteNameSetting } from './spelling'
import type { QuizQuestion } from '@/content/types'

afterEach(() => setNoteNameSetting('auto'))

describe('computed note spelling', () => {
  it('spells all twelve pitch classes in each chromatic mode', () => {
    expect(Array.from({ length: 12 }, (_, pc) => spellPc(pc))).toEqual(SHARP_NAMES)
    expect(Array.from({ length: 12 }, (_, pc) => spellPc(pc, 'sharps', { key: 'F' }))).toEqual(SHARP_NAMES)
    expect(Array.from({ length: 12 }, (_, pc) => spellPc(pc, 'flats', { key: 'D' }))).toEqual(FLAT_NAMES)
    expect(spellPc(-2, 'flats')).toBe('Bb')
    expect(spellPc(25)).toBe('C#')
  })
  it('uses F and D scale spelling and the appropriate chromatic direction', () => {
    expect(Array.from({ length: 12 }, (_, pc) => spellPc(pc, { key: 'F' }))).toEqual(FLAT_NAMES)
    expect(Array.from({ length: 12 }, (_, pc) => spellPc(pc, { key: 'D' }))).toEqual(SHARP_NAMES)
    expect(spellPc(10, 'auto', { key: 'F' })).toBe('Bb')
    expect(spellPc(6, 'auto', { key: 'D' })).toBe('F#')
    expect(spellPc(10, { key: 'F' }, { key: 'D' })).toBe('Bb')
  })
  it('keeps the scale spelling for every selectable key and pitch class', () => {
    for (const key of CIRCLE_MAJOR) {
      const scale = buildScale(key, 'major')
      for (let pc = 0; pc < 12; pc++) expect(pitchClass(spellPc(pc, { key }))).toBe(pc)
      for (const note of scale) expect(parseNote(spellPc(pitchClass(note), { key }))).toMatchObject({ letter: note.letter, acc: note.acc })
    }
    expect(spellPc(5, { key: 'F#' })).toBe('E#')
  })
  it('supports relative minor contexts and unknown-context fallback', () => {
    expect(spellPc(6, 'auto', { key: 'Bm' })).toBe('F#')
    expect(spellPc(10, 'auto', { key: 'Dm' })).toBe('Bb')
    expect(spellPc(10, 'auto', { key: 'unknown' })).toBe('A#')
    expect(() => spellPc(NaN)).toThrow(RangeError)
  })
  it('preserves sounding MIDI through enharmonic octave boundaries', () => {
    expect(spellMidi(60, 'auto', { key: 'C#' })).toBe('B#3')
    expect(spellMidi(59, 'auto', { key: 'Cb' })).toBe('Cb4')
    for (const key of [...CIRCLE_MAJOR, 'C#', 'Cb']) for (let value = 0; value <= 127; value++)
      expect(midi(spellMidi(value, 'auto', { key }))).toBe(value)
  })
  it('validates persisted settings', () => {
    for (const setting of ['auto', 'sharps', 'flats', ...CIRCLE_MAJOR.map((key) => ({ key }))]) expect(validNoteNameSetting(setting)).toBe(true)
    for (const bad of [null, [], {}, { key: 'wat' }, 'key', 1]) expect(validNoteNameSetting(bad)).toBe(false)
  })
  it('updates default guitar names while retaining explicit boolean overrides', () => {
    const pos = { string: 1, fret: 6 }
    setNoteNameSetting('flats')
    expect(getNoteNameSetting()).toBe('flats')
    expect(nameAt(pos)).toBe('Bb')
    expect(nameAt(pos, false)).toBe('A#')
    expect(nameAt(pos, true)).toBe('Bb')
    expect(midi(noteAt(pos))).toBe(70)
    expect(noteAt(pos)).toMatchObject({ letter: 'B', acc: -1, octave: 4 })
  })
  it('preserves deliberately spelled scale, chord and note marks', () => {
    const before = [scaleMarks('F', 'major'), chordToneMarks('C', 'aug', [0, 12], 'note'), noteMarks('A#')]
    setNoteNameSetting('flats')
    expect([scaleMarks('F', 'major'), chordToneMarks('C', 'aug', [0, 12], 'note'), noteMarks('A#')]).toEqual(before)
    expect(shapeMarks(OPEN_CHORDS.G, 'G').every((mark) => mark.computedNote)).toBe(true)
  })
  it('does not change generated quiz prompts, spellings or answers', () => {
    const fingerprint = (q: QuizQuestion) => {
      const { visual: _visual, ...rest } = q
      return JSON.stringify(rest)
    }
    const generate = (g: () => QuizQuestion, setting: NoteNameSetting) => {
      let seed = 417
      const random = vi.spyOn(Math, 'random').mockImplementation(() => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
      })
      setNoteNameSetting(setting)
      try { return fingerprint(g()) } finally { random.mockRestore() }
    }
    for (const unit of UNITS) for (const g of unit.quiz.generators ?? []) {
      const baseline = generate(g, 'auto')
      for (const setting of ['sharps', 'flats', { key: 'F' }, { key: 'F#' }] as NoteNameSetting[])
        expect(generate(g, setting), unit.id).toBe(baseline)
    }
  })
})
