import { describe, expect, it } from 'vitest'
import { explorerMarks, type ExplorerSpec } from './explorer'

const spec: ExplorerSpec = { mode: 'scale', rootPc: 9, scale: 'minorPentatonic', chord: 'min', label: 'note', maxFret: 15, position: { kind: 'box', degree: 3 } }

describe('Explorer box fret windows', () => {
  it('retains the complete ordinary box and octave copies without a window', () => {
    const whole = explorerMarks(spec)
    expect(whole.some((m) => m.fret === 0)).toBe(true)
    expect(whole.some((m) => m.fret >= 12)).toBe(true)
    expect(explorerMarks({ ...spec, position: { kind: 'box', degree: 3, frets: undefined } })).toEqual(whole)
  })
  it('intersects the exact box membership with inclusive bounds and preserves note labels', () => {
    const whole = explorerMarks(spec)
    const windowed = explorerMarks({ ...spec, position: { kind: 'box', degree: 3, frets: [0, 5] } })
    expect(windowed.length).toBeGreaterThan(0)
    expect(windowed).toEqual(whole.filter((m) => m.fret >= 0 && m.fret <= 5))
    expect(explorerMarks({ ...spec, position: { kind: 'box', degree: 3, frets: [5, 0] } })).toEqual(windowed)
    expect(explorerMarks({ ...spec, position: { kind: 'box', degree: 3, frets: [0, 0] } })).toEqual(whole.filter((m) => m.fret === 0))
  })
})
