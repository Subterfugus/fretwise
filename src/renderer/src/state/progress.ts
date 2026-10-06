// Persistent progress store. Saved as JSON in Electron's userData via the preload bridge
// (falls back to localStorage when run outside Electron, e.g. in tests).
import { useSyncExternalStore } from 'react'
import type { InstrumentId } from '@/audio/engine'
import { type NoteNameSetting, setNoteNameSetting, validNoteNameSetting } from '@/theory/spelling'
import { emptyPractice, normalizePractice, type PracticeDrill, type PracticeProgress, type PracticeSummary } from './practiceTypes'
import { normalizeToolPresets, type ToolPreset } from './toolPresets'
import { isLessonId, normalizeBookmarks } from './bookmarks'
import { applyTheme, DEFAULT_THEME, normalizeTheme, type ThemeId } from '@/themes'

export interface QuizRecord {
  best: number // 0..1
  last: number
  attempts: number
  passed: boolean
}

export interface EarStat {
  right: number
  total: number
}

/** Stats for one microphone play-along exercise (key like "scale:medium", "memo:easy", "playIt"). */
export interface MicStat {
  attempts: number
  completed: number
  /** wrong notes played, summed over all attempts */
  mistakes: number
  /** correct notes played, summed over all attempts */
  hits: number
  /** fastest completed attempt (ms) */
  bestTimeMs?: number
  /** memory drill: best correct-notes-per-minute */
  bestScore?: number
  lastAt: number
}

export interface MicProgress {
  stats: Record<string, MicStat>
  /** Recent memory-drill runs, newest last (max 30) */
  memoHistory: { at: number; correct: number; wrong: number; seconds: number; perMinute: number }[]
}

export interface Progress {
  version: 1
  lessonsDone: Record<string, number> // lessonId -> timestamp
  quizzes: Record<string, QuizRecord> // unitId -> record
  /** drillId -> itemKey -> stat */
  ear: Record<string, Record<string, EarStat>>
  /** Recent ear-training session scores per drill, newest last (max 30) */
  earHistory: Record<string, { at: number; right: number; total: number }[]>
  /** Microphone play-along stats (absent in files saved before the feature existed) */
  mic: MicProgress
  practice: PracticeProgress
  toolPresets: ToolPreset[]
  bookmarks: string[] // newest first; independent of learning progress
  settings: {
    instrument: InstrumentId
    unlockAll: boolean
    volume: number
    leftHanded: boolean
    noteNames: NoteNameSetting
    /** colour theme id (see themes.ts); unknown ids load as 'dark' */
    theme: ThemeId
  }
  lastLesson?: string
}

const DEFAULT: Progress = {
  version: 1,
  lessonsDone: {},
  quizzes: {},
  ear: {},
  earHistory: {},
  mic: { stats: {}, memoHistory: [] },
  practice: emptyPractice(),
  toolPresets: [],
  bookmarks: [],
  settings: { instrument: 'guitar-acoustic', unlockAll: false, volume: 0.8, leftHanded: false, noteNames: 'auto', theme: DEFAULT_THEME }
}

declare global {
  interface Window {
    fretwise?: {
      loadProgress(): Promise<unknown>
      saveProgress(d: unknown): Promise<void>
      /** Blocking save used only while the window is closing (async IPC would be cut off). */
      saveProgressSync?(d: unknown): void
    }
  }
}

let state: Progress = structuredClone(DEFAULT)
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined
let dirty = false

function write(sync: boolean) {
  dirty = false
  try {
    if (window.fretwise) {
      if (sync && window.fretwise.saveProgressSync) window.fretwise.saveProgressSync(state)
      else window.fretwise.saveProgress(state).catch((e) => console.error('Could not save progress', e))
    } else localStorage.setItem('fretwise-progress', JSON.stringify(state))
  } catch (e) {
    console.error('Could not save progress', e)
  }
}

function persist() {
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => write(false), 250)
}

/** Write any pending change immediately (the debounce would otherwise lose it on quit). */
export function flushProgress(sync = false): void {
  clearTimeout(saveTimer)
  if (dirty) write(sync)
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof document !== 'undefined') {
  window.addEventListener('beforeunload', () => flushProgress(true))
  window.addEventListener('pagehide', () => flushProgress(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProgress(false)
  })
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const safeKey = (key: string): boolean => !['__proto__', 'constructor', 'prototype'].includes(key)
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const count = (value: unknown): number => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(finite(value))))
const earCounts = (value: Record<string, unknown>): EarStat => {
  const total = count(value.total)
  return { total, right: Math.min(total, count(value.right)) }
}

/** Merge saved data over the defaults, dropping fields of the wrong shape (a corrupt file must not crash the app). */
export function mergeProgress(raw: unknown): Progress {
  const out = structuredClone(DEFAULT)
  if (!isObj(raw)) return out
  if (isObj(raw.lessonsDone)) {
    for (const [k, v] of Object.entries(raw.lessonsDone)) if (safeKey(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out.lessonsDone[k] = v
  }
  if (isObj(raw.quizzes)) {
    for (const [k, v] of Object.entries(raw.quizzes)) {
      if (!safeKey(k) || !isObj(v)) continue
      out.quizzes[k] = { best: Math.max(0, Math.min(1, finite(v.best))), last: Math.max(0, Math.min(1, finite(v.last))), attempts: count(v.attempts), passed: v.passed === true }
    }
  }
  if (isObj(raw.ear)) {
    for (const [drill, items] of Object.entries(raw.ear)) {
      if (!safeKey(drill) || !isObj(items)) continue
      const d: Record<string, EarStat> = {}
      for (const [key, s] of Object.entries(items))
        if (safeKey(key) && isObj(s) && typeof s.right === 'number' && typeof s.total === 'number') d[key] = earCounts(s)
      out.ear[drill] = d
    }
  }
  if (isObj(raw.earHistory)) {
    for (const [drill, list] of Object.entries(raw.earHistory)) {
      if (!safeKey(drill) || !Array.isArray(list)) continue
      out.earHistory[drill] = list.filter((h) => isObj(h) && typeof h.at === 'number' && Number.isFinite(h.at) && h.at >= 0 &&
        typeof h.right === 'number' && typeof h.total === 'number')
        .map((h) => ({ at: h.at as number, ...earCounts(h) })).slice(-30)
    }
  }
  if (isObj(raw.mic)) {
    const nonNeg = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined)
    if (isObj(raw.mic.stats)) {
      for (const [k, v] of Object.entries(raw.mic.stats)) {
        if (!safeKey(k) || !isObj(v)) continue
        const stat: MicStat = {
          attempts: nonNeg(v.attempts) ?? 0,
          completed: nonNeg(v.completed) ?? 0,
          mistakes: nonNeg(v.mistakes) ?? 0,
          hits: nonNeg(v.hits) ?? 0,
          lastAt: nonNeg(v.lastAt) ?? 0
        }
        const t = nonNeg(v.bestTimeMs)
        if (t !== undefined) stat.bestTimeMs = t
        const b = nonNeg(v.bestScore)
        if (b !== undefined) stat.bestScore = b
        out.mic.stats[k] = stat
      }
    }
    if (Array.isArray(raw.mic.memoHistory)) {
      for (const h of raw.mic.memoHistory) {
        if (!isObj(h)) continue
        const at = nonNeg(h.at)
        const correct = nonNeg(h.correct)
        const wrong = nonNeg(h.wrong)
        const seconds = nonNeg(h.seconds)
        const perMinute = nonNeg(h.perMinute)
        if (at !== undefined && correct !== undefined && wrong !== undefined && seconds !== undefined && perMinute !== undefined)
          out.mic.memoHistory.push({ at, correct, wrong, seconds, perMinute })
      }
      out.mic.memoHistory = out.mic.memoHistory.slice(-30)
    }
  }
  if (isObj(raw.settings)) {
    const s = raw.settings
    if (typeof s.instrument === 'string' && ['guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'piano'].includes(s.instrument))
      out.settings.instrument = s.instrument as InstrumentId
    if (typeof s.unlockAll === 'boolean') out.settings.unlockAll = s.unlockAll
    if (typeof s.leftHanded === 'boolean') out.settings.leftHanded = s.leftHanded
    if (validNoteNameSetting(s.noteNames)) out.settings.noteNames = s.noteNames
    out.settings.theme = normalizeTheme(s.theme)
    if (typeof s.volume === 'number' && Number.isFinite(s.volume)) out.settings.volume = Math.min(1, Math.max(0, s.volume))
  }
  if (typeof raw.lastLesson === 'string') out.lastLesson = raw.lastLesson
  out.practice = normalizePractice(raw.practice)
  out.toolPresets = normalizeToolPresets(raw.toolPresets)
  out.bookmarks = normalizeBookmarks(raw.bookmarks)
  return out
}

export async function loadProgress(): Promise<void> {
  let raw: unknown = null
  try {
    raw = window.fretwise ? await window.fretwise.loadProgress() : JSON.parse(localStorage.getItem('fretwise-progress') ?? 'null')
  } catch {
    raw = null
  }
  if (raw && typeof raw === 'object') state = mergeProgress(raw)
  setNoteNameSetting(state.settings.noteNames)
  applyTheme(state.settings.theme)
  listeners.forEach((l) => l())
}

export function getProgress(): Progress {
  return state
}

export function updateProgress(fn: (draft: Progress) => void) {
  const next = structuredClone(state)
  fn(next)
  state = next
  setNoteNameSetting(state.settings.noteNames)
  applyTheme(state.settings.theme)
  listeners.forEach((l) => l())
  persist()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, getProgress)
}

// ---------- convenience mutators ----------

export const toggleLessonBookmark = (id: string) => {
  if (!isLessonId(id)) return
  updateProgress((p) => {
    p.bookmarks = p.bookmarks.includes(id) ? p.bookmarks.filter((x) => x !== id) : [id, ...p.bookmarks]
  })
}

export const recordPracticeAnswer = (drill: PracticeDrill, itemKey: string, correct: boolean, assisted = false) =>
  updateProgress((p) => {
    if (['__proto__', 'constructor', 'prototype'].includes(itemKey)) return
    const stat = (p.practice[drill].stats[itemKey] ??= { right: 0, total: 0, assisted: 0 })
    stat.total++
    if (assisted) stat.assisted++
    else if (correct) stat.right++
  })

export const recordPracticeSession = (drill: PracticeDrill, summary: PracticeSummary) =>
  updateProgress((p) => {
    const history = p.practice[drill].history
    history.push({ ...summary, at: Date.now() })
    if (history.length > 30) history.splice(0, history.length - 30)
  })

export const markLessonDone = (id: string) =>
  updateProgress((p) => {
    p.lessonsDone[id] ??= Date.now()
    p.lastLesson = id
  })

export const recordQuiz = (unitId: string, score: number, passMark: number) =>
  updateProgress((p) => {
    const prev = p.quizzes[unitId]
    p.quizzes[unitId] = {
      best: Math.max(prev?.best ?? 0, score),
      last: score,
      attempts: (prev?.attempts ?? 0) + 1,
      passed: (prev?.passed ?? false) || score >= passMark
    }
  })

/** Record one ear-training answer. */
export const recordEar = (drillId: string, itemKey: string, correct: boolean) =>
  updateProgress((p) => {
    const d = (p.ear[drillId] ??= {})
    const s = (d[itemKey] ??= { right: 0, total: 0 })
    s.total++
    if (correct) s.right++
  })

/** Record a finished ear-training session. */
export const recordEarSession = (drillId: string, right: number, total: number) =>
  updateProgress((p) => {
    const h = (p.earHistory[drillId] ??= [])
    h.push({ at: Date.now(), right, total })
    if (h.length > 30) h.splice(0, h.length - 30)
  })

/** Record one finished (or abandoned) microphone exercise attempt. */
export const recordMic = (key: string, r: { completed: boolean; hits: number; mistakes: number; timeMs?: number; score?: number }) =>
  updateProgress((p) => {
    const s = (p.mic.stats[key] ??= { attempts: 0, completed: 0, mistakes: 0, hits: 0, lastAt: 0 })
    s.attempts++
    if (r.completed) s.completed++
    s.hits += r.hits
    s.mistakes += r.mistakes
    s.lastAt = Date.now()
    if (r.completed && r.timeMs !== undefined && (s.bestTimeMs === undefined || r.timeMs < s.bestTimeMs)) s.bestTimeMs = r.timeMs
    if (r.score !== undefined && (s.bestScore === undefined || r.score > s.bestScore)) s.bestScore = r.score
  })

/** Record a finished fretboard-memory run (also updates the "memo:<difficulty>" stat). */
export const recordMicMemo = (difficulty: string, correct: number, wrong: number, seconds: number) => {
  const perMinute = seconds > 0 ? (correct * 60) / seconds : 0
  recordMic(`memo:${difficulty}`, { completed: correct > 0, hits: correct, mistakes: wrong, score: perMinute })
  updateProgress((p) => {
    p.mic.memoHistory.push({ at: Date.now(), correct, wrong, seconds, perMinute })
    if (p.mic.memoHistory.length > 30) p.mic.memoHistory.splice(0, p.mic.memoHistory.length - 30)
  })
}

export const resetProgress = () =>
  updateProgress((p) => {
    const keep = p.settings
    const toolPresets = p.toolPresets
    const bookmarks = p.bookmarks
    Object.assign(p, structuredClone(DEFAULT), { settings: keep, toolPresets, bookmarks })
    delete p.lastLesson // Object.assign leaves keys DEFAULT doesn't have
  })
