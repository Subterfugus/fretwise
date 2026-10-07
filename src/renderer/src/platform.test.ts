import { describe, expect, it } from 'vitest'
import { isWindowsPlatform } from './platform'

describe('isWindowsPlatform', () => {
  it('accepts the values Windows browsers report', () => {
    for (const p of ['Windows', 'Win32', 'Win64']) expect(isWindowsPlatform(p)).toBe(true)
  })
  it('rejects other systems and missing values', () => {
    for (const p of ['macOS', 'MacIntel', 'Linux x86_64', 'Android', 'iPhone', 'Chrome OS', '', undefined]) expect(isWindowsPlatform(p)).toBe(false)
  })
})
