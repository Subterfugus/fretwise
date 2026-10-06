import { useMemo } from 'react'
import { spellMidi, spellPc, type SpellingContext } from '@/theory/spelling'
import { useProgress } from './progress'

export function useSpelling() {
  const setting = useProgress().settings.noteNames
  return useMemo(() => ({
    spellPc: (pc: number, ctx?: SpellingContext) => spellPc(pc, setting, ctx),
    spellMidi: (value: number, ctx?: SpellingContext) => spellMidi(value, setting, ctx)
  }), [setting])
}
