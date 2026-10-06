// Small per-device settings for the mic features (kept in localStorage, not in progress.json:
// a chosen input device is machine specific).
import { useSyncExternalStore } from 'react'
import type { Difficulty } from './exerciseLogic'

export interface MicSettings {
  /** tuning reference for A4 in Hz */
  a4: number
  deviceId: string | null
  /** noise gate as an RMS value */
  gate: number
  difficulty: Difficulty
  /** accept a target note in any octave */
  anyOctave: boolean
  /** length of the fretboard-memory drill in seconds */
  memoSeconds: number
  tunerMode: 'auto' | 'chromatic'
}

export const DEFAULT_MIC_SETTINGS: MicSettings = {
  a4: 440,
  deviceId: null,
  gate: 0.008,
  difficulty: 'easy',
  anyOctave: false,
  memoSeconds: 60,
  tunerMode: 'auto'
}

const KEY = 'fretwise-mic-settings'

function sanitize(raw: unknown): MicSettings {
  const out = { ...DEFAULT_MIC_SETTINGS }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (typeof r.a4 === 'number' && r.a4 >= 400 && r.a4 <= 480) out.a4 = Math.round(r.a4)
  if (typeof r.deviceId === 'string') out.deviceId = r.deviceId
  if (typeof r.gate === 'number' && r.gate >= 0.001 && r.gate <= 0.1) out.gate = r.gate
  if (r.difficulty === 'easy' || r.difficulty === 'medium' || r.difficulty === 'hard') out.difficulty = r.difficulty
  if (typeof r.anyOctave === 'boolean') out.anyOctave = r.anyOctave
  if (r.memoSeconds === 30 || r.memoSeconds === 60 || r.memoSeconds === 120) out.memoSeconds = r.memoSeconds
  if (r.tunerMode === 'auto' || r.tunerMode === 'chromatic') out.tunerMode = r.tunerMode
  return out
}

let state: MicSettings = (() => {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_MIC_SETTINGS }
  }
})()
const listeners = new Set<() => void>()

export function getMicSettings(): MicSettings {
  return state
}

export function updateMicSettings(patch: Partial<MicSettings>) {
  state = sanitize({ ...state, ...patch })
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useMicSettings(): MicSettings {
  return useSyncExternalStore(subscribe, getMicSettings)
}
