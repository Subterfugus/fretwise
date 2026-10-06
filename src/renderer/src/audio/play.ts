import { engine } from './engine'
import { shapeMidisIn } from '@/theory/guitar'
import type { PlaySpec } from '@/content/types'

/** Run a PlaySpec; resolves roughly when the sound finishes (or immediately when stopped/superseded). */
export async function runPlay(spec: PlaySpec): Promise<void> {
  engine.stop()
  switch (spec.kind) {
    case 'notes': {
      const secs = await engine.playNotes(spec.notes, spec.mode ?? 'arpeggio')
      return engine.wait(Math.min(secs ?? 1, 30))
    }
    case 'shape': {
      const secs = await engine.playNotes(shapeMidisIn(spec.shape, spec.tuning, spec.capo ?? 0), spec.mode ?? 'strum')
      return engine.wait(Math.min(secs ?? 1, 4))
    }
    case 'interval': {
      const secs = await engine.playInterval(spec.a, spec.b, spec.dir ?? 'ascending')
      return engine.wait(Math.min(secs ?? 1, 10))
    }
    case 'sequence':
      return engine.playSequence(spec.events, spec.bpm ?? 90)
    case 'rhythm':
      return engine.playRhythm(spec.pattern, spec.bpm ?? 80, { countIn: spec.countIn, pitch: spec.pitch })
  }
}
