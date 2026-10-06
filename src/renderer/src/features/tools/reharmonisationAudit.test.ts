import { describe, expect, it } from 'vitest'
import { UNITS } from '@/content/units'
import { lessonToolActions, lessonToolExamples } from '@/features/lessons/lessonTools'
import { isToolPresetConfig } from '@/state/toolPresets'
import { buildChord } from '@/theory/chords'
import { pitchClass } from '@/theory/notes'
import { keyTonic, progressionChords } from './progressions'
import { DEFAULT_REHARM, reharmChords, reharmLooperConfig, suggestReharmonisations, validReharmConfig, type ReharmConfig } from './reharmonisation'

const tones = (chords: ReturnType<typeof reharmChords>) => chords.map((chord) => ({
  root: pitchClass(chord.root), type: chord.type,
  tones: buildChord(chord.root, chord.type).map(pitchClass)
}))
const total = (config: ReharmConfig) => config.working.durations.reduce((sum, beats) => sum + beats, 0)

describe('independent reharmonisation integration audit', () => {
  it('keeps Unit 11 and 12 progression context and timing through lesson launches and Looper transfer', () => {
    let checked = 0
    for (const unit of UNITS.filter((unit) => unit.id === 'u11' || unit.id === 'u12')) {
      for (const lesson of unit.lessons) for (const block of lesson.blocks) {
        for (const example of lessonToolExamples(block)) {
          if (example.kind !== 'progression') continue
          const launch = lessonToolActions(example, 'guitar-nylon').find((action) => action.launch.tab === 'reharmonisation')?.launch
          expect(launch, `${lesson.id}: ${example.romans.join(' ')}`).toBeDefined()
          if (!launch || launch.tab !== 'reharmonisation') continue
          const config = launch.config
          expect(validReharmConfig(config)).toBe(true)
          expect(config.original).toEqual(config.working)
          expect(config.original.romans).not.toBe(config.working.romans)
          expect(config.original.durations).not.toBe(config.working.durations)
          expect(config.original.durations).toEqual(example.durations ?? example.romans.map(() => example.beats ?? 4))
          expect(config.bpm).toBe(example.bpm ?? 90)
          expect(tones(reharmChords(config.keyPc, config.minor, config.original))).toEqual(tones(progressionChords(example.root, example.romans)))
          const transfer = reharmLooperConfig(config, 'working', 'guitar-nylon')
          expect(isToolPresetConfig('looper', transfer)).toBe(true)
          expect(transfer.durations).toEqual(config.working.durations)
          expect(transfer.countInBeats).toBe(0)
          expect(transfer.keyMinor).toBe(config.minor)
          expect(tones(progressionChords(keyTonic(transfer.keyPc, transfer.keyMinor!), transfer.romans))).toEqual(tones(reharmChords(config.keyPc, config.minor, config.working)))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('takes explicit unequal lesson timings ahead of uniform defaults in a minor context', () => {
    const example = { kind: 'progression' as const, root: 'A', scale: 'harmonicMinor' as const,
      romans: ['i', 'iv', 'V7b9', 'i'], durations: [0.25, 2.75, 4.5, 8], beats: 4, bpm: 137 }
    const launch = lessonToolActions(example, 'piano').find((action) => action.launch.tab === 'reharmonisation')?.launch
    expect(launch).toBeDefined()
    if (!launch || launch.tab !== 'reharmonisation') return
    expect(launch.config).toMatchObject({ keyPc: 9, minor: true, bpm: 137,
      original: { romans: example.romans, durations: example.durations }, working: { romans: example.romans, durations: example.durations } })
    const transfer = reharmLooperConfig(launch.config, 'working', 'piano')
    expect(transfer).toMatchObject({ keyMinor: true, bpm: 137, durations: example.durations, countInBeats: 0 })
    expect(isToolPresetConfig('looper', transfer)).toBe(true)
    launch.config.working.durations[0] = 4
    expect(example.durations).toEqual([0.25, 2.75, 4.5, 8])
    expect(launch.config.original.durations).toEqual(example.durations)
  })

  it('keeps timing and isolated source state while all four techniques stack in every key', () => {
    for (let keyPc = 0; keyPc < 12; keyPc++) {
      const source = { romans: ['I', 'IV', 'vi', 'ii', 'V7', 'I'], durations: [1.25, 2.5, 4, 3.5, 8, 0.75] }
      let config: ReharmConfig = { ...structuredClone(DEFAULT_REHARM), keyPc, original: structuredClone(source), working: structuredClone(source) }
      const before = structuredClone(config.original)
      const sum = total(config)
      const techniques = ['borrowed', 'secondary', 'twoFive', 'tritone'] as const
      for (const kind of techniques) {
        const suggestions = suggestReharmonisations(config)
        const selected = suggestions.find((suggestion) => suggestion.kind === kind)
        expect(selected, `${keyPc}: ${kind}`).toBeDefined()
        if (!selected) continue
        config = { ...config, working: selected.result }
        expect(validReharmConfig(config)).toBe(true)
        expect(total(config)).toBe(sum)
        expect(config.original).toEqual(before)
        const transfer = reharmLooperConfig(config, 'working', 'piano')
        expect(isToolPresetConfig('looper', transfer)).toBe(true)
        expect(transfer.romans).toEqual(config.working.romans)
        expect(transfer.durations).toEqual(config.working.durations)
        expect(transfer.loopSection).toEqual({ start: 0, end: config.working.romans.length - 1 })
        expect(tones(progressionChords(keyTonic(keyPc, false), transfer.romans))).toEqual(tones(reharmChords(keyPc, false, config.working)))
        transfer.romans[0] = 'V'
        transfer.durations![0] = 32
        expect(config.original).toEqual(before)
        expect(total(config)).toBe(sum)
      }
    }
  })
})
