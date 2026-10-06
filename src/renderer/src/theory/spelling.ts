import { CIRCLE_MAJOR, keySignature, relativeMajor } from './keys'
import { FLAT_NAMES, SHARP_NAMES, midi, mod, noteName, parseNote, pitchClass } from './notes'
import { buildScale } from './scales'

export type NoteNameSetting = 'auto' | 'sharps' | 'flats' | { key: string }
export interface SpellingContext { key?: string }

export function validNoteNameSetting(value: unknown): value is NoteNameSetting {
  return value === 'auto' || value === 'sharps' || value === 'flats' ||
    (!!value && typeof value === 'object' && !Array.isArray(value) &&
      'key' in value && typeof value.key === 'string' && CIRCLE_MAJOR.includes(value.key))
}

let currentSetting: NoteNameSetting = 'auto'
export const getNoteNameSetting = (): NoteNameSetting => currentSetting
export function setNoteNameSetting(setting: NoteNameSetting): void {
  currentSetting = typeof setting === 'object' ? { ...setting } : setting
}

/** Spelling changes names, never pitch. Explicit theory spellings bypass this helper. */
export function spellPc(pc: number, setting: NoteNameSetting = 'auto', ctx: SpellingContext = {}): string {
  if (!Number.isFinite(pc)) throw new RangeError('Pitch class must be finite')
  const normalized = mod(Math.round(pc), 12)
  if (setting === 'sharps') return SHARP_NAMES[normalized]
  if (setting === 'flats') return FLAT_NAMES[normalized]
  let key = typeof setting === 'object' ? setting.key : ctx.key
  if (key) {
    try {
      if (key.endsWith('m')) key = relativeMajor(key.slice(0, -1))
      const scale = buildScale(key, 'major')
      const diatonic = scale.find((n) => pitchClass(n) === normalized)
      if (diatonic) return noteName(diatonic)
      return (keySignature(key).count < 0 ? FLAT_NAMES : SHARP_NAMES)[normalized]
    } catch {
      // Unknown contexts still have a usable chromatic display.
    }
  }
  return SHARP_NAMES[normalized]
}

export function spellMidi(value: number, setting: NoteNameSetting = 'auto', ctx: SpellingContext = {}): string {
  const rounded = Math.round(value)
  const name = spellPc(rounded, setting, ctx)
  const note = parseNote(name)
  const octave = Math.round((rounded - midi({ ...note, octave: 0 })) / 12)
  return name + octave
}
