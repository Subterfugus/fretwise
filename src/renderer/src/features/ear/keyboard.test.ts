import { describe, expect, it } from 'vitest'
import { controlOwnsDrillKey } from './keyboard'

function keyAt(key: string, matchingSelector?: string, defaultPrevented = false) {
  const target = { closest: (selector: string) => matchingSelector && selector.split(', ').includes(matchingSelector) ? target : null }
  return { key, target: target as unknown as EventTarget, defaultPrevented }
}

describe('ear keyboard shortcut ownership', () => {
  it('preserves native and SVG control activation across the entire drill', () => {
    for (const key of [' ', 'Enter']) for (const control of ['button', 'a[href]', 'summary', '[role="button"]', '[role="checkbox"]', '[role="radio"]']) {
      expect(controlOwnsDrillKey(keyAt(key, control))).toBe(true)
    }
  })
  it('leaves all typing and selector keys to editable controls', () => {
    for (const key of [' ', 'Enter', '1', 'R']) for (const control of ['input', 'select', 'textarea', '[contenteditable]:not([contenteditable="false"])']) {
      expect(controlOwnsDrillKey(keyAt(key, control))).toBe(true)
    }
  })
  it('does not replay or advance after the fretboard already handled a key', () => {
    expect(controlOwnsDrillKey(keyAt('Enter', undefined, true))).toBe(true)
  })
  it('keeps global replay/next and numeric/reference shortcuts on non-editable focus', () => {
    expect(controlOwnsDrillKey(keyAt(' '))).toBe(false)
    expect(controlOwnsDrillKey(keyAt('Enter'))).toBe(false)
    expect(controlOwnsDrillKey(keyAt('1', 'button'))).toBe(false)
    expect(controlOwnsDrillKey(keyAt('R', 'button'))).toBe(false)
  })
})
