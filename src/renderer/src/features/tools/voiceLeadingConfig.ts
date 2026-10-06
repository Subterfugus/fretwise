import { CHORDS, type ChordType } from '@/theory/chords'
import { parseRoman } from './progressions'

export const VOICE_LEADING_PRESETS: { id: string; name: string; romans: string[]; minor: boolean; strings: string }[] = [
  { id: 'cadence', name: 'I - IV - V - I', romans: ['I', 'IV', 'V', 'I'], minor: false, strings: '1-2-3' },
  { id: 'pop', name: 'I - V - vi - IV', romans: ['I', 'V', 'vi', 'IV'], minor: false, strings: '1-2-3' },
  { id: 'jazz', name: 'ii7 - V7 - Imaj7', romans: ['ii7', 'V7', 'Imaj7'], minor: false, strings: '1-2-3-4' },
  { id: 'turnaround', name: 'Imaj7 - vi7 - ii7 - V7', romans: ['Imaj7', 'vi7', 'ii7', 'V7'], minor: false, strings: '1-2-3-4' },
  { id: 'minor', name: 'i - iv - V - i', romans: ['i', 'iv', 'V', 'i'], minor: true, strings: '1-2-3' },
  { id: 'minorJazz', name: 'iih7 - V7 - i', romans: ['iih7', 'V7', 'i'], minor: true, strings: '1-2-3-4' }
]

export const VOICE_LEADING_STRING_SETS: { id: string; label: string; strings: number[] }[] = [
  { id: '1-2-3', label: 'Strings 1-2-3', strings: [1, 2, 3] },
  { id: '2-3-4', label: 'Strings 2-3-4', strings: [2, 3, 4] },
  { id: '3-4-5', label: 'Strings 3-4-5', strings: [3, 4, 5] },
  { id: '4-5-6', label: 'Strings 4-5-6', strings: [4, 5, 6] },
  { id: '1-2-3-4', label: 'Strings 1-2-3-4', strings: [1, 2, 3, 4] },
  { id: '2-3-4-5', label: 'Strings 2-3-4-5', strings: [2, 3, 4, 5] },
  { id: '3-4-5-6', label: 'Strings 3-4-5-6', strings: [3, 4, 5, 6] }
]

export const SUPPORTED_VOICE_CHORDS = Object.keys(CHORDS) as ChordType[]
export const MAX_VOICE_LEADING_CHORDS = 64

export interface VoiceLeadingConfig {
  romans: string[]
  keyPc: number
  minor: boolean
  stringSet: string
  frets: [number, number]
  startId: string | null
  bpm: number
  beats: number
  mode: 'block' | 'strum' | 'arpeggio'
  labels: 'note' | 'degree' | 'finger'
}

export const DEFAULT_VOICE_LEADING: VoiceLeadingConfig = {
  romans: ['I', 'IV', 'V', 'I'],
  keyPc: 0,
  minor: false,
  stringSet: '1-2-3',
  frets: [0, 12],
  startId: null,
  bpm: 90,
  beats: 4,
  mode: 'strum',
  labels: 'note'
}

function romanError(token: string): string | null {
  // parseRoman accepts parentheses for minor-major sevenths; keep that wrapper balanced.
  if (token.length > 32 || /\s/.test(token) ||
    (/[()]/.test(token) && !/^[b#\u266d\u266f]?[ivIV]+m?\((maj7|M7)\)$/.test(token))) {
    return `Invalid Roman chord "${token}".`
  }
  const chord = parseRoman(token)
  if (!chord) return `Invalid Roman chord "${token}".`
  if (!SUPPORTED_VOICE_CHORDS.includes(chord.type)) {
    return `Chord "${token}" is not supported.`
  }
  return null
}

export function parseVoiceLeadingInput(input: string): { romans: string[]; error: string | null } {
  const trimmed = input.trim()
  if (!trimmed) return { romans: [], error: 'Enter at least one Roman chord.' }
  const romans = trimmed.split(/[\s,]+/)
  if (romans.length > MAX_VOICE_LEADING_CHORDS) return { romans: [], error: `Use no more than ${MAX_VOICE_LEADING_CHORDS} chords.` }
  for (const token of romans) {
    const error = romanError(token)
    if (error) return { romans: [], error }
  }
  return { romans, error: null }
}

const integer = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

const CONFIG_FIELDS = ['romans', 'keyPc', 'minor', 'stringSet', 'frets', 'startId', 'bpm', 'beats', 'mode', 'labels']
const FRET_ID = /^(?:x|0|[1-9]|1[0-9]|2[0-2])(?:,(?:x|0|[1-9]|1[0-9]|2[0-2])){5}$/

/** Saved preferences must contain a complete, usable config; callers can fall back to the default. */
export function validVoiceLeadingConfig(v: unknown): v is VoiceLeadingConfig {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  if (proto !== null && proto !== Object.prototype) return false
  if (!CONFIG_FIELDS.every((field) => Object.hasOwn(v, field))) return false
  const c = v as Record<string, unknown>
  return Array.isArray(c.romans) && c.romans.length >= 1 && c.romans.length <= MAX_VOICE_LEADING_CHORDS
    && Array.from(c.romans).every((r) => typeof r === 'string' && romanError(r) === null)
    && integer(c.keyPc, 0, 11) && typeof c.minor === 'boolean'
    && VOICE_LEADING_STRING_SETS.some((s) => s.id === c.stringSet)
    && Array.isArray(c.frets) && c.frets.length === 2
    && integer(c.frets[0], 0, 22) && integer(c.frets[1], 0, 22) && c.frets[0] <= c.frets[1]
    && (c.startId === null || typeof c.startId === 'string' && c.startId.length <= 17 && FRET_ID.test(c.startId))
    && integer(c.bpm, 40, 220) && [1, 2, 3, 4, 6, 8].includes(c.beats as number)
    && ['block', 'strum', 'arpeggio'].includes(c.mode as string)
    && ['note', 'degree', 'finger'].includes(c.labels as string)
}
