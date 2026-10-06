import { describe, expect, it } from 'vitest'
import u13 from './u13-arpeggios'
import u14 from './u14-rhythm-ii'
import u15 from './u15-tunings-capo'
import u16 from './u16-thirds-sixths'
import u17 from './u17-song-form'
import type { Block, PlaySpec, Unit } from '../types'
import type { ToolExample } from '../toolExamples'
import { buildChord } from '@/theory/chords'
import { midiAt, shapeMidisIn } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import { buildScale } from '@/theory/scales'
import { progressionChords } from '@/features/tools/progressions'
import { lessonToolActions, lessonToolExamples } from '@/features/lessons/lessonTools'
import { isToolPresetConfig } from '@/state/toolPresets'

const blocks = (unit: Unit) => unit.lessons.flatMap((lesson) => lesson.blocks)
const plays = (block: Block): PlaySpec[] => block.type === 'audio' ? [block.play]
  : block.type === 'audioRow' ? block.items.map((item) => item.play) : []
const contexts = (block: Block): ToolExample[] => [
  ...(block.toolExamples ?? []),
  ...plays(block).flatMap((play) => play.toolExample ? [play.toolExample] : []),
  ...(block.type === 'fretboard' ? block.marks.flatMap((mark) => mark.toolExample ? [mark.toolExample] : []) : [])
]
const pcs = (midis: number[]) => [...new Set(midis.map((midi) => mod(midi, 12)))].sort((a, b) => a - b)

describe('authored elective tool examples', () => {
  it('preserves the exact chord qualities and bar order of every song sketch', () => {
    let checked = 0
    for (const block of blocks(u17)) for (const play of plays(block)) {
      if (play.kind !== 'sequence') continue
      const context = play.toolExample
      if (!context) {
        expect(block.type).toBe('audioRow')
        if (block.type !== 'audioRow') continue
        expect(block.items.find((item) => item.play === play)?.label).toBe('Key change up a step: chorus in G, then A')
        expect(block.toolExamples?.map((example) => example.root)).toEqual(['G', 'A'])
        continue
      }
      expect(context.kind).toBe('progression')
      if (context.kind !== 'progression') continue
      const chords = progressionChords(context.root, context.romans)
      expect(chords).toHaveLength(context.romans.length)
      const beats = context.beats ?? 4
      let elapsed = 0
      for (const event of play.events) {
        const chord = chords[Math.floor((elapsed + 1e-6) / beats)]
        expect(chord).toBeDefined()
        expect(pcs(event.notes as number[])).toEqual(buildChord(chord.root, chord.type).map(pitchClass).sort((a, b) => a - b))
        elapsed += event.beats
      }
      expect(elapsed).toBe(context.romans.length * beats)
      expect(context.bpm).toBe(play.bpm)
      checked++
    }
    expect(checked).toBeGreaterThan(30)
  })

  it('keeps the full form sections, borrowed chords and dominant chains', () => {
    const formTables = u17.lessons[1].blocks.filter((block) => block.type === 'table')
    expect(formTables).toHaveLength(5)
    for (const table of formTables) expect(table.toolExamples?.length).toBeGreaterThan(0)
    const all = blocks(u17).flatMap(contexts).filter((context) => context.kind === 'progression')
    expect(all.some((context) => context.root === 'C' && context.romans.join(' ') === 'III7 III7 VI7 VI7 II7 II7 V7 V7')).toBe(true)
    expect(all.some((context) => context.romans.join(' ') === 'I IV iv I')).toBe(true)
    expect(all.some((context) => context.romans.join(' ') === 'I bVI bVII I')).toBe(true)
    expect(all.some((context) => context.romans.join(' ') === 'I iii IV V ii IV V V I V vi IV')).toBe(true)
    expect(Math.max(...all.map((context) => context.romans.length))).toBe(12)
  })

  it('opens capo progressions in their sounding keys', () => {
    const capoRow = blocks(u17).find((block): block is Extract<Block, { type: 'audioRow' }> =>
      block.type === 'audioRow' && block.items.some((item) => item.label === 'Same shapes, capo 4 (sounds in B)'))!
    expect(capoRow.items.map((item) => item.play.toolExample?.root)).toEqual(['G', 'A', 'B'])
    for (const item of capoRow.items) expect(item.play.toolExample).toMatchObject({ romans: ['I', 'vi', 'IV', 'V'], scale: 'major', beats: 3 })
    const capoTab = blocks(u15).find((block) => block.type === 'tab' && block.capo === 2)!
    expect(capoTab.toolExamples?.[0]).toMatchObject({ kind: 'chord', root: 'A', type: 'maj', capo: 2 })
    const capoBoard = blocks(u15).find((block) => block.type === 'fretboard' && block.capo === 3)!
    expect(capoBoard.toolExamples?.[0]).toMatchObject({ kind: 'chord', root: 'Bb', type: 'maj', capo: 3 })
  })

  it('preserves jazz seventh qualities, rhythm accompaniment and actual harmonised chords', () => {
    const jazz = blocks(u13).flatMap(contexts).filter((context): context is Extract<ToolExample, { kind: 'progression' }> => context.kind === 'progression' && context.root === 'C')
    expect(jazz.length).toBeGreaterThanOrEqual(3)
    for (const context of jazz) expect(context.romans).toEqual(['ii7', 'V7', 'Imaj7'])
    const accompaniment = blocks(u14).flatMap(contexts).filter((context) => context.kind === 'progression')
    expect(accompaniment.map((context) => context.romans)).toContainEqual(['I', 'IV', 'V', 'I'])
    const harmony = blocks(u16).flatMap(contexts).filter((context) => context.kind === 'progression')
    expect(harmony).toHaveLength(3)
    for (const context of harmony) expect(context).toMatchObject({ root: 'C', romans: ['I', 'IV', 'V', 'I'], bpm: 72, beats: 2 })
  })

  it('attaches truthful chord and scale contexts to authored notes and marks', () => {
    for (const unit of [u13, u16]) for (const block of blocks(unit)) {
      if (block.type === 'fretboard') for (const mark of block.marks) {
        const context = mark.toolExample
        if (!context || context.kind === 'progression') continue
        const allowed = (context.kind === 'scale' ? buildScale(context.root, context.type) : buildChord(context.root, context.type)).map(pitchClass)
        expect(allowed).toContain(mod(midiAt(mark), 12))
      }
      for (const play of plays(block)) {
        const context = play.toolExample
        if (!context || context.kind === 'progression' || play.kind !== 'sequence') continue
        const allowed = (context.kind === 'scale' ? buildScale(context.root, context.type) : buildChord(context.root, context.type)).map(pitchClass)
        for (const event of play.events) for (const note of event.notes) expect(allowed).toContain(mod(note as number, 12))
      }
    }
  })

  it('does not mislabel alternate tuning shapes as standard tuning chords', () => {
    for (const block of blocks(u15)) for (const context of contexts(block)) {
      if (context.kind !== 'chord' || !context.shape) continue
      expect(pcs(shapeMidisIn(context.shape, context.tuning, context.capo))).toEqual(buildChord(context.root, context.type).map(pitchClass).sort((a, b) => a - b))
    }
    const downTab = blocks(u15).find((block) => block.type === 'tab' && block.flats)!
    expect(downTab.toolExamples?.[0]).toMatchObject({ root: 'Eb', type: 'min' })
    const dropDRiff = blocks(u15).find((block) => block.type === 'tab' && block.caption?.startsWith('A Drop D riff'))!
    expect(dropDRiff.toolExamples?.[0]).toMatchObject({ root: 'D', romans: ['I5', 'I5', 'I5', 'bIII5', 'IV5', 'I5', 'I5', 'V5', 'IV5'], scale: 'naturalMinor' })
    if (dropDRiff.type === 'tab') {
      const context = dropDRiff.toolExamples![0]
      if (context.kind !== 'progression') throw new Error('Expected a progression')
      const chords = progressionChords(context.root, context.romans)
      dropDRiff.events.forEach((event, index) => expect(pcs(event.pos.map((pos) => midiAt(pos, dropDRiff.tuning)))).toEqual(buildChord(chords[index].root, chords[index].type).map(pitchClass).sort((a, b) => a - b)))
      const before = JSON.stringify(dropDRiff)
      const collected = lessonToolExamples(dropDRiff)[0]
      expect(collected).toMatchObject({ durations: [1, 0.5, 0.5, 1, 1, 1, 1, 1, 1] })
      const launch = lessonToolActions(collected, 'guitar-acoustic')[0].launch
      if (launch.tab !== 'looper') throw new Error('Expected Looper')
      expect(isToolPresetConfig('looper', launch.config)).toBe(true)
      expect(launch.config.durations).toEqual(dropDRiff.events.map((event) => event.beats))
      expect(JSON.stringify(dropDRiff)).toBe(before)
    }
    for (const unit of [u13, u14, u15, u16, u17]) for (const block of blocks(unit)) {
      if (block.type === 'tryIt') expect(block.toolExamples).toBeUndefined()
    }
  })
})
