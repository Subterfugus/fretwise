import type { ChordShape } from '@/theory/guitar'
import type { ChordType } from '@/theory/chords'
import { bestVoicing } from './voicings'

/** bestVoicing that returns null instead of throwing for chords with no playable guitar shape. */
export function safeVoicing(root: string, type: ChordType): ChordShape | null {
  try {
    return bestVoicing(root, type)
  } catch {
    return null
  }
}
