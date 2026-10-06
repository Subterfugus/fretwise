import { describe, expect, it } from 'vitest'
import { UNITS } from '.'
import { lessonToolActions, lessonToolExamples, validToolExample } from '@/features/lessons/lessonTools'
import { isIdentifierInput, identifierMidis } from '@/features/tools/identifierInput'
import { validVoiceLeadingConfig } from '@/features/tools/voiceLeadingConfig'
import { isToolPresetConfig } from '@/state/toolPresets'
import { buildChord } from '@/theory/chords'
import { pitchClass } from '@/theory/notes'
import { effectiveCapo, soundingMidi } from '@/components/tuning'
import { shapePositions } from '@/theory/guitar'
import { progressionChords } from '@/features/tools/progressions'
import { rootName } from '@/features/tools/names'
import { voiceLeadingPath } from '@/features/tools/voiceLeading'
import { VOICE_LEADING_STRING_SETS } from '@/features/tools/voiceLeadingConfig'
import { validReharmConfig } from '@/features/tools/reharmonisation'

describe('curriculum-wide lesson launch contracts', () => {
  it.each(UNITS.map((unit) => [unit.id, unit] as const))('%s has valid, pitch-correct tool launches', (_id, unit) => {
    for (const lesson of unit.lessons) for (const [index, block] of lesson.blocks.entries()) {
      const where = `${lesson.id} block ${index}`
      const examples = lessonToolExamples(block)
      if (block.type === 'tryIt' || block.type === 'playIt') {
        expect(examples, where).toEqual([])
        continue
      }
      for (const example of block.toolExamples ?? []) expect(validToolExample(example), where).toBe(true)
      for (const example of examples) {
        const actions = lessonToolActions(example, 'guitar-nylon')
        const tonal = example.kind === 'progression' && ['major', 'ionian', 'naturalMinor', 'aeolian', 'harmonicMinor', 'melodicMinor'].includes(example.scale)
        expect(actions.map((a) => a.id), where).toEqual(example.kind === 'scale' ? ['explore'] : example.kind === 'chord' ? ['identify', 'dictionary'] : ['loop', 'voiceLeading', 'explore', ...(tonal ? ['reharmonisation'] : [])])
        for (const { launch } of actions) {
          if (launch.tab === 'explorer' || launch.tab === 'looper') expect(isToolPresetConfig(launch.tab, launch.config), where).toBe(true)
          if (launch.tab === 'voiceLeading') expect(validVoiceLeadingConfig(launch.config), where).toBe(true)
          if (launch.tab === 'reharmonisation') expect(validReharmConfig(launch.config), where).toBe(true)
          if (launch.tab === 'looper') {
            expect(launch.config.targetOn, where).toBe(true)
            expect(launch.config.instrument, where).toBe('guitar-nylon')
          }
          if (launch.tab === 'identifier' && example.kind === 'chord') {
            expect(isIdentifierInput(launch.input), where).toBe(true)
            const midis = identifierMidis(launch.input)
            const pcs = new Set(buildChord(example.root, example.type).map(pitchClass))
            expect(midis.length, where).toBeGreaterThanOrEqual(2)
            expect(midis.every((m) => pcs.has(m % 12)), `${where} ${example.root} ${example.type}`).toBe(true)
            if (example.shape) expect(midis, where).toEqual(shapePositions(example.shape).map((p) => soundingMidi(p, example.tuning, effectiveCapo(example.capo))))
          }
        }
      }
    }
  })
  it('covers all units that teach chords/scales/progressions without guessing interval or rhythm exercises', () => {
    for (const unit of UNITS.filter((u) => !['u2', 'u3'].includes(u.id))) {
      expect(unit.lessons.some((lesson) => lesson.blocks.some((block) => lessonToolExamples(block).length)), unit.id).toBe(true)
    }
  })
  it('opens every authored progression with a playable voice-leading path', () => {
    const seen = new Set<string>()
    for (const unit of UNITS) for (const lesson of unit.lessons) for (const block of lesson.blocks) {
      for (const example of lessonToolExamples(block).filter((e) => e.kind === 'progression')) {
        const launch = lessonToolActions(example, 'piano').find((a) => a.id === 'voiceLeading')!.launch
        if (launch.tab !== 'voiceLeading') continue
        const config = launch.config
        const id = JSON.stringify(config)
        if (seen.has(id)) continue
        seen.add(id)
        const chords = progressionChords(rootName(config.keyPc, config.minor), config.romans)
        const strings = VOICE_LEADING_STRING_SETS.find((s) => s.id === config.stringSet)!.strings
        const path = voiceLeadingPath(chords, { strings, fretRange: config.frets })
        expect(path.missing, `${lesson.id}: ${example.root} ${example.romans.join(' ')}`).toEqual([])
        expect(path.voicings, lesson.id).toHaveLength(example.romans.length)
      }
    }
    expect(seen.size).toBeGreaterThan(100)
  })
})
