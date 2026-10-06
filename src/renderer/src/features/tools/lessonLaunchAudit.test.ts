import { it, expect } from 'vitest'
import { UNITS } from '@/content/units'
import { lessonToolActions, lessonToolExamples, validToolExample } from '@/features/lessons/lessonTools'
import { isToolPresetConfig } from '@/state/toolPresets'
import { validVoiceLeadingConfig } from './voiceLeadingConfig'
import { identifierMidis, isIdentifierInput } from './identifierInput'
import { buildChord } from '@/theory/chords'
import { pitchClass } from '@/theory/notes'
import { explorerMarks } from './explorer'

it('audits every authored curriculum example through concrete launch validators', () => {
  let examples = 0
  const errors: string[] = []
  for (const unit of UNITS) for (const lesson of unit.lessons) lesson.blocks.forEach((block, blockIndex) => {
    const location = `${lesson.id} block ${blockIndex}`
    const authored = [
      ...(block.toolExamples ?? []),
      ...(block.type === 'audio' && block.play.toolExample ? [block.play.toolExample] : []),
      ...(block.type === 'audioRow' ? block.items.flatMap((item) => item.play.toolExample ? [item.play.toolExample] : []) : []),
      ...(block.type === 'fretboard' ? block.marks.flatMap((mark) => mark.toolExample ? [mark.toolExample] : []) : [])
    ]
    for (const e of authored) if (!validToolExample(e)) errors.push(`${location}: invalid explicit ${JSON.stringify(e)}`)
    for (const e of lessonToolExamples(block)) {
      examples++
      const actions = lessonToolActions(e, 'guitar-acoustic')
      for (const a of actions) {
        const launch = a.launch
        if (launch.tab === 'looper' && !isToolPresetConfig('looper', launch.config)) errors.push(`${location}: invalid looper ${JSON.stringify(e)}`)
        if (launch.tab === 'voiceLeading' && !validVoiceLeadingConfig(launch.config)) errors.push(`${location}: invalid voiceLeading ${JSON.stringify(e)}`)
        if (launch.tab === 'explorer') {
          if (!isToolPresetConfig('explorer', launch.config)) errors.push(`${location}: invalid explorer ${JSON.stringify(e)}`)
          const c = launch.config
          const marks = explorerMarks({ mode: c.mode, rootPc: c.scaleRoot, scale: c.scale, chord: c.chord, label: c.label, maxFret: c.maxFret, position: c.posKind === 'box' ? { kind: 'box', degree: c.box, ...(c.boxWindow ? { frets: [c.lo, c.hi] as [number, number] } : {}) } : c.posKind === 'window' ? { kind: 'window', lo: c.lo, hi: c.hi } : { kind: 'all' } })
          if (e.kind === 'scale' && e.frets && marks.some((m) => m.fret < e.frets![0] || m.fret > e.frets![1])) errors.push(`${location}: scale window escaped ${JSON.stringify(e)} -> ${Math.min(...marks.map((m) => m.fret))}-${Math.max(...marks.map((m) => m.fret))}`)
        }
        if (launch.tab === 'identifier') {
          if (!isIdentifierInput(launch.input)) errors.push(`${location}: invalid identifier ${JSON.stringify(e)}`)
          if (e.kind === 'chord') {
            const expected = buildChord(e.root, e.type).map(pitchClass)
            if (identifierMidis(launch.input).some((m) => !expected.includes(m % 12))) errors.push(`${location}: physical chord mismatch ${JSON.stringify(e)}`)
          }
        }
      }
    }
  })
  expect(examples).toBeGreaterThan(500)
  expect(errors).toEqual([])
})
