// Plays a Sound through the shared engine. Only the most recent call "owns" the
// busy state, so a replay mid-playback cleanly cuts the previous one off.
import { engine } from '@/audio/engine'
import type { Sound } from './types'

let token = 0

/** Resolves true when playback finished, false when superseded by another call. */
export async function playSound(s: Sound): Promise<boolean> {
  const mine = ++token
  engine.stop()
  await engine.playSequence(s.events, s.bpm)
  return mine === token
}

export function stopSound(): void {
  token++
  engine.stop()
}
