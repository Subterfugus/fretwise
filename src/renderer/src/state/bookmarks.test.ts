import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeBookmarks } from './bookmarks'
import { flushProgress, getProgress, loadProgress, mergeProgress, resetProgress, toggleLessonBookmark, updateProgress } from './progress'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn() })
  resetProgress()
  updateProgress((p) => { p.bookmarks = [] })
})
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('lesson bookmarks', () => {
  it('gives old saves an empty default', () => {
    expect(mergeProgress({ lessonsDone: { u1l1: 123 } }).bookmarks).toEqual([])
  })
  it('rejects malformed entries and duplicates without losing valid ordering', () => {
    expect(normalizeBookmarks(['u2l3', null, {}, 'u1l1', 'u2l3', '__proto__', 'bad', 1])).toEqual(['u2l3', 'u1l1'])
    expect(mergeProgress({ bookmarks: { u1l1: true } }).bookmarks).toEqual([])
  })
  it('adds newest first, removes individually, and does not record lesson completion', () => {
    toggleLessonBookmark('u1l1'); toggleLessonBookmark('u2l3')
    expect(getProgress().bookmarks).toEqual(['u2l3', 'u1l1'])
    expect(getProgress().lessonsDone).toEqual({})
    toggleLessonBookmark('u1l1')
    expect(getProgress().bookmarks).toEqual(['u2l3'])
  })
  it('rejects invalid mutation IDs', () => {
    toggleLessonBookmark('constructor')
    expect(getProgress().bookmarks).toEqual([])
  })
  it('retains bookmarks when resetting learning progress', () => {
    toggleLessonBookmark('u1l1')
    updateProgress((p) => { p.lessonsDone.u1l1 = 123 })
    resetProgress()
    expect(getProgress().bookmarks).toEqual(['u1l1'])
    expect(getProgress().lessonsDone).toEqual({})
  })
  it('round trips through persistence and flushes immediately on close', async () => {
    toggleLessonBookmark('u1l1')
    flushProgress(true)
    const saved = vi.mocked(localStorage.setItem).mock.calls.at(-1)![1]
    updateProgress((p) => { p.bookmarks = [] })
    vi.mocked(localStorage.getItem).mockReturnValue(saved)
    await loadProgress()
    expect(getProgress().bookmarks).toEqual(['u1l1'])
  })
})
