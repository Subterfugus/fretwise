import { describe, expect, it } from 'vitest'
import { playChord, playScale, scaleMarks, chordToneMarks } from '@/content/helpers'
import type { Block } from '@/content/types'
import type { ToolExample } from '@/content/toolExamples'
import { progressionExample } from '@/content/toolExamples'
import { OPEN_CHORDS } from '@/theory/guitar'
import { DROP_D, OPEN_G } from '@/theory/tunings'
import { buildChord } from '@/theory/chords'
import { pitchClass } from '@/theory/notes'
import { identifierMidis } from '@/features/tools/identifierInput'
import { progressionChords } from '@/features/tools/progressions'
import { isToolPresetConfig } from '@/state/toolPresets'
import { validVoiceLeadingConfig } from '@/features/tools/voiceLeadingConfig'
import { lessonToolActions, lessonToolExamples, shapeToolExample, validToolExample } from './lessonTools'

describe('lesson tool context', () => {
  it('carries explicit helper scale context through display transformations and single-string filtering', () => {
    const marks = scaleMarks('G', 'major', { frets: [2, 5], label: 'degree' }).filter((m) => m.string === 2).map((m) => ({ ...m, label: '?' }))
    const examples = lessonToolExamples({ type: 'fretboard', marks, frets: [2, 5] })
    expect(examples).toEqual([{ kind: 'scale', root: 'G', type: 'major', frets: [2, 5], box: undefined }])
    const action = lessonToolActions(examples[0], 'piano')[0]
    expect(action.label).toBe('Explore this scale')
    expect(action.launch).toMatchObject({ tab: 'explorer', config: { mode: 'scale', scaleRoot: 7, scale: 'major', posKind: 'window', lo: 2, hi: 5 } })
  })
  it('preserves exact scale aliases and chooses scale-box mode when available', () => {
    const action = lessonToolActions({ kind: 'scale', root: 'D', type: 'dorian', box: 1 }, 'piano')[0]
    expect(action.launch).toMatchObject({ config: { scale: 'dorian', scaleRoot: 2, posKind: 'box', box: 1 } })
    const aeolian = lessonToolExamples({ type: 'audio', label: 'Minor', play: playScale('A', 'aeolian') })[0]
    expect(aeolian).toMatchObject({ root: 'A', type: 'aeolian' })
  })
  it('preserves the fret window alongside a selected scale box', () => {
    const action = lessonToolActions({ kind: 'scale', root: 'D', type: 'lydian', box: 2, frets: [9, 18] }, 'piano')[0]
    expect(action.launch).toMatchObject({ tab: 'explorer', config: { posKind: 'box', box: 2, boxWindow: true, lo: 9, hi: 18, maxFret: 22 } })
    if (action.launch.tab === 'explorer') expect(isToolPresetConfig('explorer', action.launch.config)).toBe(true)
  })
  it('derives chord actions from known chord helpers and pitch maps, without changing pitches', () => {
    const play = playChord('F#', 'min7')
    const notes = play.kind === 'notes' ? [...play.notes] : []
    const example = lessonToolExamples({ type: 'audio', label: 'F#m7', play })[0]
    expect(lessonToolActions(example, 'piano').map((a) => a.label)).toEqual(['Identify chord', 'See all shapes'])
    expect(play.kind === 'notes' && play.notes).toEqual(notes)
    expect(lessonToolExamples({ type: 'fretboard', marks: chordToneMarks('C', 'maj') })).toHaveLength(1)
  })
  it('preserves the physical capo shape and opens the sounding chord in the dictionary', () => {
    const e = shapeToolExample(OPEN_CHORDS.G, undefined, 2)!
    expect(e).toMatchObject({ kind: 'chord', root: 'A', type: 'maj', capo: 2 })
    const actions = lessonToolActions(e, 'guitar-acoustic')
    const identify = actions.find((a) => a.launch.tab === 'identifier')!.launch
    expect(identify.tab).toBe('identifier')
    if (identify.tab === 'identifier') {
      expect(identify.input).toEqual({ tuningId: 'standard', capo: 2, frets: OPEN_CHORDS.G.frets })
      expect(new Set(identifierMidis(identify.input).map((m) => m % 12))).toEqual(new Set(buildChord('A', 'maj').map(pitchClass)))
    }
    expect(actions.at(-1)!.launch).toEqual({ tab: 'dictionary', entry: { kind: 'chord', root: 'A', type: 'maj' } })
  })
  it('preserves alternate tuning rather than relabeling its frets as standard', () => {
    const shape = { name: 'D', frets: [0, 0, 0, 2, 3, 2] }
    const e = shapeToolExample(shape, DROP_D.midi)!
    const action = lessonToolActions(e, 'guitar-acoustic')[0]
    expect(action.launch).toMatchObject({ tab: 'identifier', input: { tuningId: 'dropD', frets: shape.frets, capo: 0 } })
  })
  it('uses standard tuning for a library-generated shape of an abstract sounding chord', () => {
    const action = lessonToolActions({ kind: 'chord', root: 'G', type: 'maj', tuning: OPEN_G.midi, capo: 3 }, 'piano')[0]
    expect(action.launch).toMatchObject({ tab: 'identifier', input: { tuningId: 'standard', capo: 0 } })
    if (action.launch.tab === 'identifier') expect(new Set(identifierMidis(action.launch.input).map((m) => m % 12))).toEqual(new Set(buildChord('G', 'maj').map(pitchClass)))
  })
  it('loads all three progression targets with exact chord qualities and explicit key context', () => {
    const e = progressionExample('Db', ['ii7', 'V7b9', 'Imaj7'], 'major', 100, 3)
    const actions = lessonToolActions(e, 'guitar-nylon')
    expect(actions.map((a) => a.label)).toEqual(['Loop this', 'See the voice leading', 'Explore this scale', 'Reharmonise this'])
    const loop = actions[0].launch
    expect(loop).toMatchObject({ tab: 'looper', config: { romans: ['ii7', 'V7b9', 'Imaj7'], keyPc: 1, keyMinor: false, targetOn: true, targetMode: 'all', targetPreview: true, selectedScale: 'major', bpm: 100, beats: 3, instrument: 'guitar-nylon' } })
    if (loop.tab === 'looper') expect(isToolPresetConfig('looper', loop.config)).toBe(true)
    const voice = actions[1].launch
    if (voice.tab === 'voiceLeading') expect(validVoiceLeadingConfig(voice.config)).toBe(true)
    expect(voice).toMatchObject({ config: { stringSet: '1-2-3-4', minor: false } })
    expect(progressionChords('Db', ['ii7', 'V7b9', 'Imaj7']).map((c) => c.type)).toEqual(['min7', 'dom7b9', 'maj7'])
  })
  it('carries source durations into Looper when each event matches its explicit chord context', () => {
    const block: Block = { type: 'audio', label: 'C to G', play: { kind: 'sequence', bpm: 90, events: [{ notes: [48, 52, 55], beats: 1.5 }, { notes: [43, 47, 50], beats: 3 }], toolExample: progressionExample('C', ['I', 'V'], 'major') } }
    const before = JSON.stringify(block)
    const example = lessonToolExamples(block)[0]
    expect(example).toMatchObject({ durations: [1.5, 3] })
    expect(lessonToolActions(example, 'piano')[0].launch).toMatchObject({ config: { durations: [1.5, 3], countInBeats: 0, loopSection: null } })
    expect(JSON.stringify(block)).toBe(before)
  })
  it('keeps an explicit harmonic practice grid when riff events do not match one-to-one', () => {
    const example = lessonToolExamples({ type: 'audio', label: 'Riff', play: { kind: 'sequence', events: [{ notes: [48], beats: 0.5 }, { notes: [50], beats: 0.5 }], toolExample: progressionExample('C', ['I', 'V'], 'major') } })[0]
    expect(example).not.toHaveProperty('durations')
  })
  it('validates full per-chord duration lists without silently dropping malformed timing', () => {
    const base = progressionExample('C', ['I', 'V'], 'major')
    expect(validToolExample({ ...base, durations: [0.25, 32] })).toBe(true)
    for (const durations of [[1], [0, 4], [1.3, 2], [1, Infinity], 'wrong']) expect(validToolExample({ ...base, durations })).toBe(false)
  })
  it('keeps minor/modal context and separate modulation sections', () => {
    const examples = lessonToolExamples({ type: 'text', md: 'A modulation', toolExamples: [progressionExample('C', ['I', 'V'], 'major'), progressionExample('A', ['i', 'V7'], 'harmonicMinor')] })
    expect(examples).toHaveLength(2)
    expect(lessonToolActions(examples[1], 'piano')[0].launch).toMatchObject({ config: { keyPc: 9, keyMinor: true, romans: ['i', 'V7'] } })
  })
  it('does not turn prose, scale-like guesses, quiz answers or microphone targets into links', () => {
    expect(lessonToolExamples({ type: 'text', md: 'Try G major and I IV V' })).toEqual([])
    expect(lessonToolExamples({ type: 'fretboard', marks: [{ string: 1, fret: 3, label: 'G' }] })).toEqual([])
    expect(lessonToolExamples({ type: 'tryIt', question: { kind: 'mc', prompt: 'Which chord?', choices: ['C', 'D'], answer: 0 }, toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }] })).toEqual([])
  })
  it('collects shape audio examples and deduplicates identical chord contexts', () => {
    const block: Block = { type: 'audioRow', items: [{ label: 'Strum C', play: { kind: 'shape', shape: OPEN_CHORDS.C } }, { label: 'C again', play: { kind: 'shape', shape: OPEN_CHORDS.C } }] }
    expect(lessonToolExamples(block)).toHaveLength(1)
  })
  it.each([null, {}, { kind: 'scale', root: 'H', type: 'major' }, { kind: 'scale', root: 'C', type: '__proto__' }, { kind: 'progression', root: 'C', romans: ['I', 'wrong'], scale: 'major' }, { kind: 'progression', root: 'C', romans: ['I'], scale: 'major', bpm: 0 }, { kind: 'scale', root: 'C', type: 'major', frets: [12, 0] }])('ignores malformed examples %j', (raw) => {
    expect(validToolExample(raw)).toBe(false)
    expect(lessonToolActions(raw as ToolExample, 'piano')).toEqual([])
  })
})
