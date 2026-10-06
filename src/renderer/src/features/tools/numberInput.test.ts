import { describe, expect, it } from 'vitest'
import { commitNumberDraft } from './numberInput'

describe('number drafts at commit', () => {
  it('accepts multi-digit tempo values after partial typing', () => {
    expect(commitNumberDraft('120', 100, 60, 180)).toBe(120)
    expect(commitNumberDraft('105', 120, 60, 180)).toBe(105)
  })
  it('reverts empty or invalid edits instead of persisting a fallback', () => {
    for (const draft of ['', ' ', '-', '1e', 'NaN', 'Infinity']) {
      expect(commitNumberDraft(draft, 100, 60, 180)).toBe(100)
    }
  })
  it('validates bounds and integer fret/bar values only on commit', () => {
    expect(commitNumberDraft('1', 100, 60, 180)).toBe(60)
    expect(commitNumberDraft('999', 100, 60, 180)).toBe(180)
    expect(commitNumberDraft('12.7', 0, 0, 22)).toBe(13)
    expect(commitNumberDraft('-1', 12, 0, 22)).toBe(0)
    expect(commitNumberDraft('65', 4, 1, 64)).toBe(64)
  })
  it('supports fractional steps without storing floating point noise', () => {
    expect(commitNumberDraft('0.31', 0.8, 0, 1, 0.05)).toBe(0.3)
  })
})
