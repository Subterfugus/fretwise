import { describe, expect, it } from 'vitest'
import { DEFAULT_IDENTIFIER, identifierCapo, identifierMidis, identifierString, isIdentifierInput } from './identifierInput'

describe('identifier physical input', () => {
  it('preserves selected interpretations and playback on already-open, muted or fretted string edits', () => {
    for (const [index, fret] of DEFAULT_IDENTIFIER.frets.entries()) {
      expect(identifierString(DEFAULT_IDENTIFIER, index, fret)).toBe(DEFAULT_IDENTIFIER)
    }
  })
  it('replaces only the edited string without mutating the previous physical input', () => {
    const changed = identifierString(DEFAULT_IDENTIFIER, 0, 0)
    expect(changed).not.toBe(DEFAULT_IDENTIFIER)
    expect(changed.frets).toEqual([0, 3, 2, 0, 1, 0])
    expect(identifierMidis(changed)).toEqual([40, 48, 52, 55, 60, 64])
    expect(DEFAULT_IDENTIFIER.frets).toEqual([null, 3, 2, 0, 1, 0])
    expect(identifierString(changed, 0, null).frets).toEqual(DEFAULT_IDENTIFIER.frets)
  })
  it('keeps physical string order and transposes capo without changing geometry', () => {
    expect(identifierMidis(DEFAULT_IDENTIFIER)).toEqual([48, 52, 55, 60, 64])
    expect(identifierMidis(identifierCapo(DEFAULT_IDENTIFIER, 2))).toEqual([50, 54, 57, 62, 66])
  })
  it('uses actual alternate tuning, including reentrant bass', () => {
    expect(identifierMidis({ tuningId: 'openG', capo: 0, frets: [0, 0, 0, 0, 0, 0] })).toEqual([38, 43, 50, 55, 59, 62])
    expect(identifierMidis({ tuningId: 'dropD', capo: 2, frets: [0, null, null, null, null, 0] })).toEqual([40, 66])
  })
  it('validates persisted shapes and clamps frets when adding a capo', () => {
    expect(isIdentifierInput(DEFAULT_IDENTIFIER)).toBe(true)
    for (const bad of [null, {}, { ...DEFAULT_IDENTIFIER, tuningId: 'fake' }, { ...DEFAULT_IDENTIFIER, capo: 13 }, { ...DEFAULT_IDENTIFIER, frets: [0] }, { ...DEFAULT_IDENTIFIER, frets: [0, 0, 0, 0, 0, -1] }, { ...DEFAULT_IDENTIFIER, frets: [0, 0, 0, 0, 0, 1.5] }, { ...DEFAULT_IDENTIFIER, capo: 12, frets: [0, 0, 0, 0, 0, 11] }]) expect(isIdentifierInput(bad)).toBe(false)
    expect(identifierCapo({ ...DEFAULT_IDENTIFIER, frets: [22, null, 12, 0, 1, 2] }, 12).frets).toEqual([10, null, 10, 0, 1, 2])
  })
})
