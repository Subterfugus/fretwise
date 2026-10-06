import { describe, expect, it } from 'vitest'
import type { Block, PlaySpec } from '../types'
import type { ToolExample } from '../toolExamples'
import { progressionChords } from '@/features/tools/progressions'
import { chordNames } from '@/theory/chords'
import { midiAt } from '@/theory/guitar'
import { pitchClass } from '@/theory/notes'
import { scaleSemitones } from '@/theory/scales'
import { lessonToolExamples } from '@/features/lessons/lessonTools'
import u01 from './u01-notes'
import u02 from './u02-rhythm'
import u04 from './u04-major-scale'
import u05 from './u05-triads'
import u06 from './u06-caged'
import u07 from './u07-diatonic'
import u08 from './u08-pentatonic-blues'
import u09 from './u09-sevenths'
import u10 from './u10-modes'
import u11 from './u11-minor-modulation'
import u12 from './u12-jazz'

const units = [u01, u02, u04, u05, u06, u07, u08, u09, u10, u11, u12]
const blocks = units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.blocks))
const plays = (block: Block): PlaySpec[] => block.type === 'audio' ? [block.play] : block.type === 'audioRow' ? block.items.map((item) => item.play) : []
const examples = (block: Block): ToolExample[] => [
  ...(block.toolExamples ?? []),
  ...plays(block).flatMap((play) => play.toolExample ? [play.toolExample] : []),
  ...(block.type === 'fretboard' ? block.marks.flatMap((mark) => mark.toolExample ? [mark.toolExample] : []) : [])
]
const allExamples = blocks.flatMap(examples)
const progressions = allExamples.filter((example) => example.kind === 'progression')
const lesson = (id: string) => units.flatMap((unit) => unit.lessons).find((item) => item.id === id)!
const audio = (id: string, label: string): PlaySpec => {
  for (const block of lesson(id).blocks) {
    if (block.type === 'audio' && block.label === label) return block.play
    if (block.type === 'audioRow') {
      const item = block.items.find((item) => item.label === label)
      if (item) return item.play
    }
  }
  throw new Error(`Missing audio ${id}: ${label}`)
}

describe('authored core lesson tool contexts', () => {
  it('launches the chromatic diagram and audio in their authored roots and retains every source pitch', () => {
    const diagram = u01.lessons.flatMap((lesson) => lesson.blocks).find((block) => block.type === 'fretboard' && block.caption === 'The chromatic scale on the A string, fret by fret. Sharps are grey.')!
    expect(diagram.toolExamples).toEqual([{ kind: 'scale', root: 'A', type: 'chromatic', frets: [0, 12] }])
    if (diagram.type !== 'fretboard') throw new Error('Expected chromatic fretboard')
    expect(diagram.marks.map((mark) => midiAt(mark))).toEqual(Array.from({ length: 13 }, (_, index) => 45 + index))
    const chromatic = u01.lessons.flatMap((lesson) => lesson.blocks).flatMap(plays).find((play) => play.toolExample?.kind === 'scale' && play.toolExample.type === 'chromatic')!
    expect(chromatic.toolExample).toEqual({ kind: 'scale', root: 'E', type: 'chromatic', frets: [0, 12] })
    if (chromatic.kind !== 'notes') throw new Error('Expected chromatic audio notes')
    expect(chromatic.notes).toEqual(Array.from({ length: 13 }, (_, index) => 52 + index))
    expect(scaleSemitones('chromatic')).toEqual(Array.from({ length: 12 }, (_, index) => index))
  })

  it('launches original fractional diatonic timing while preserving the source audio', () => {
    const block = u07.lessons.flatMap((lesson) => lesson.blocks).find((block) => block.type === 'audio' && block.label === 'The seven chords of C major, up the scale')!
    const example = block.toolExamples?.[0]
    expect(example).toEqual({ kind: 'progression', root: 'C', romans: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'I'], scale: 'major', bpm: 90, beats: 2, label: 'C major diatonic chords' })
    expect(lessonToolExamples(block)[0]).toMatchObject({ durations: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 3] })
    if (block.type !== 'audio' || block.play.kind !== 'sequence' || example?.kind !== 'progression') throw new Error('Expected diatonic audio and progression context')
    expect(block.play.bpm).toBe(90)
    expect(block.play.events.map((event) => event.beats)).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 3])
    const chords = progressionChords(example.root, example.romans)
    expect(chords).toHaveLength(block.play.events.length)
    for (let index = 0; index < chords.length; index++) {
      const tones = chordNames(chords[index].root, chords[index].type).map(pitchClass).sort((a, b) => a - b)
      const played = [...new Set(block.play.events[index].notes.map((note) => typeof note === 'number' ? note % 12 : pitchClass(note)))].sort((a, b) => a - b)
      expect(played).toEqual(tones)
    }
  })

  it('resolves every authored progression without dropping any chord or unsupported launch settings', () => {
    expect(progressions.length).toBeGreaterThan(75)
    for (const example of progressions) {
      expect(progressionChords(example.root, example.romans), `${example.root}: ${example.romans.join(' ')}`).toHaveLength(example.romans.length)
      expect([1, 2, 3, 4, 6, 8]).toContain(example.beats ?? 4)
      expect(example.bpm ?? 90).toBeGreaterThanOrEqual(40)
      expect(example.bpm ?? 90).toBeLessThanOrEqual(220)
    }
  })

  it('preserves the sounding pitches of every chord-by-chord helper progression', () => {
    let checked = 0
    for (const block of blocks) {
      for (const play of plays(block)) {
        const example = play.toolExample
        if (play.kind !== 'sequence' || example?.kind !== 'progression' || play.events.length !== example.romans.length) continue
        const chords = progressionChords(example.root, example.romans)
        expect(chords).toHaveLength(play.events.length)
        for (let index = 0; index < chords.length; index++) {
          const chord = chords[index]
          const tones = chordNames(chord.root, chord.type).map(pitchClass)
          for (const note of play.events[index].notes) {
            expect(tones, `${example.root} ${example.romans[index]} event ${index}`).toContain(typeof note === 'number' ? note % 12 : pitchClass(note))
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('carries pop, cadence, borrowing, suspended and altered jazz qualities from real lesson examples', () => {
    const authored = progressions.map((example) => `${example.root}/${example.scale}:${example.romans.join(' ')}`)
    expect(authored).toContain('C/major:I V vi IV')
    expect(authored).toContain('G/major:I IV V vi')
    expect(authored).toContain('C/major:I IV iv I')
    expect(authored).toContain('A/harmonicMinor:i bVII bVI V i')
    expect(authored).toContain('D/major:I Isus4 I Isus2 I')
    expect(authored).toContain('A/harmonicMinor:ii7b5 V7b9 i7')
    expect(authored).toContain('C/major:ii7 bII9 Imaj7')
    expect(authored).toContain('Bb/major:III7 VI7 II7 V7 Imaj7')
  })

  it('keeps the full twelve-bar form and resolution for both blues examples', () => {
    const blues = progressions.filter((example) => example.root === 'A' && example.romans.length === 13)
    expect(blues.map((example) => example.romans.join(' '))).toContain('I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7 I7')
    expect(blues.map((example) => example.romans.join(' '))).toContain('I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7 I7')
  })

  it('keeps each modal vamp in its own tonal center, including the sounding E/D seventh', () => {
    for (const mode of ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']) {
      expect(progressions.some((example) => example.scale === mode)).toBe(true)
    }
    const lydian = audio('u10l3', 'D Lydian: Dmaj7 – E/D').toolExample
    expect(lydian).toMatchObject({ kind: 'progression', root: 'D', scale: 'lydian', bpm: 84, beats: 2 })
    expect(lydian?.kind === 'progression' && lydian.romans).toEqual(['Imaj7', 'Imaj7', 'II7', 'II7', 'Imaj7', 'Imaj7', 'II7', 'II7', 'Imaj7'])
  })

  it('splits modulation examples into explicit old and new key contexts', () => {
    const pivot = lesson('u11l5').blocks.find((block) => block.type === 'audio' && block.label === 'Pivot modulation C → G')!
    expect(pivot.toolExamples).toMatchObject([
      { kind: 'progression', root: 'C', scale: 'major', romans: ['I', 'IV', 'vi'] },
      { kind: 'progression', root: 'G', scale: 'major', romans: ['ii', 'V7', 'I', 'IV', 'V7', 'I'] }
    ])
    const changes = lesson('u11l6').blocks.flatMap((block) => block.toolExamples ?? [])
    expect(changes).toContainEqual(expect.objectContaining({ root: 'Db', scale: 'major', romans: ['I', 'IV', 'V', 'I'] }))
    expect(changes).toContainEqual(expect.objectContaining({ root: 'A', scale: 'harmonicMinor', romans: ['V7', 'i', 'iv', 'V7', 'i'] }))
    expect(changes).toContainEqual(expect.objectContaining({ root: 'C', scale: 'harmonicMinor', romans: ['i', 'iv', 'V7', 'i'] }))
  })

  it('keeps drone and chord-scale demonstrations in the authored scale context', () => {
    const scales = allExamples.filter((example) => example.kind === 'scale')
    expect(scales).toContainEqual(expect.objectContaining({ root: 'A', type: 'melodicMinor' }))
    expect(scales).toContainEqual(expect.objectContaining({ root: 'E', type: 'altered' }))
    expect(scales).toContainEqual(expect.objectContaining({ root: 'G', type: 'diminishedHW' }))
    expect(scales).toContainEqual(expect.objectContaining({ root: 'A', type: 'minorPentatonic', box: 0, frets: [5, 8] }))
  })

  it('does not author navigation actions on practice question blocks', () => {
    for (const unit of units) {
      for (const block of unit.lessons.flatMap((lesson) => lesson.blocks).filter((block) => block.type === 'tryIt')) {
        expect(block.toolExamples).toBeUndefined()
      }
    }
  })
})
