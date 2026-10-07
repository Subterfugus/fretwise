import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProgress, importProgress, markLessonDone, resetProgress, updateProgress } from './progress'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn() })
  resetProgress()
  updateProgress((p) => { p.bookmarks = [] })
})
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('importProgress', () => {
  it('round-trips an export, replacing what was there', () => {
    markLessonDone('u1l1')
    updateProgress((p) => { p.settings.leftHanded = true; p.bookmarks = ['u2l3'] })
    const exported: unknown = JSON.parse(JSON.stringify(getProgress()))

    resetProgress()
    markLessonDone('u1l2')
    updateProgress((p) => { p.settings.leftHanded = false; p.bookmarks = [] })

    expect(importProgress(exported)).toBe(true)
    expect(getProgress()).toEqual(exported)
    expect(getProgress().lessonsDone.u1l2).toBeUndefined()
  })
  it('clears lastLesson when the file has none', () => {
    const empty: unknown = JSON.parse(JSON.stringify(getProgress()))
    markLessonDone('u1l1')
    expect(importProgress(empty)).toBe(true)
    expect('lastLesson' in getProgress()).toBe(false)
  })
  it('rejects files that are not progress exports and leaves progress alone', () => {
    markLessonDone('u1l1')
    const before = getProgress()
    for (const bad of [null, 'text', [], {}, { version: 2, settings: {} }, { version: 1 }, { name: 'fretwise', version: '0.1.0' }])
      expect(importProgress(bad)).toBe(false)
    expect(getProgress()).toBe(before)
  })
  it('saves the imported progress', () => {
    const exported: unknown = JSON.parse(JSON.stringify(getProgress()))
    vi.mocked(localStorage.setItem).mockClear()
    importProgress(exported)
    vi.runAllTimers()
    expect(vi.mocked(localStorage.setItem).mock.calls.at(-1)![0]).toBe('fretwise-progress')
  })
})
