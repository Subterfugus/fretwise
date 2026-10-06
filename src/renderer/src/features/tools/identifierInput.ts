import { TUNINGS } from '@/theory/tunings'

export interface IdentifierInput {
  tuningId: string
  capo: number
  /** Relative to capo, low string first. null = muted, 0 = open. */
  frets: (number | null)[]
}

export const DEFAULT_IDENTIFIER: IdentifierInput = { tuningId: 'standard', capo: 0, frets: [null, 3, 2, 0, 1, 0] }

export function isIdentifierInput(raw: unknown): raw is IdentifierInput {
  if (!raw || typeof raw !== 'object') return false
  const c = raw as IdentifierInput
  return TUNINGS.some((t) => t.id === c.tuningId) && Number.isInteger(c.capo) && c.capo >= 0 && c.capo <= 12
    && Array.isArray(c.frets) && c.frets.length === 6
    && c.frets.every((f) => f === null || Number.isInteger(f) && f >= 0 && f <= 22 - c.capo)
}

export function identifierMidis(input: IdentifierInput): number[] {
  const tuning = TUNINGS.find((t) => t.id === input.tuningId) ?? TUNINGS[0]
  return input.frets.flatMap((f, i) => f === null ? [] : [tuning.midi[5 - i] + input.capo + f])
}

export function identifierString(input: IdentifierInput, index: number, fret: number | null): IdentifierInput {
  return input.frets[index] === fret ? input : { ...input, frets: input.frets.map((f, i) => i === index ? fret : f) }
}

export function identifierCapo(input: IdentifierInput, capo: number): IdentifierInput {
  const c = Math.min(12, Math.max(0, Math.round(capo)))
  return { ...input, capo: c, frets: input.frets.map((f) => f === null ? null : Math.min(f, 22 - c)) }
}
