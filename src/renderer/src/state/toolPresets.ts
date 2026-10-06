import type { InstrumentId } from '@/audio/engine'
import type { LabelMode } from '@/content/helpers'
import { CHORDS, type ChordType } from '@/theory/chords'
import type { CagedForm } from '@/theory/guitar'
import { SCALES, type ScaleType } from '@/theory/scales'
import { MAX_BPM, MIN_BPM, SUBDIVISIONS, TIME_SIGS, type Subdivision } from '@/features/tools/metro'
import { STYLES, type BassMode, type DrumMode, type StrumStyle } from '@/features/tools/patterns'
import { PRESETS, parseRoman } from '@/features/tools/progressions'
import type { TargetMode } from '@/features/tools/targetTones'
import { isChordDuration, validLoopSection, type LoopSection } from '@/features/tools/looperTiming'

export interface ExplorerPresetConfig {
  mode: 'scale' | 'chord'
  scaleRoot: number
  chordRoot: number
  scale: ScaleType
  chord: ChordType
  label: LabelMode
  maxFret: number
  posKind: 'all' | 'caged' | 'box' | 'window'
  caged: CagedForm
  box: number
  boxWindow?: boolean
  lo: number
  hi: number
}

export interface LooperPresetConfig {
  keyMinor?: boolean
  presetId: string
  romans: string[]
  keyPc: number
  bpm: number
  beats: number
  durations?: number[]
  loopSection?: LoopSection | null
  countInBeats?: number
  style: StrumStyle
  bass: BassMode
  drums: DrumMode
  instrument: InstrumentId
  volume: number
  label: LabelMode
  selectedScale: ScaleType | null
  showScale: boolean
  viewIdx: number
  targetOn?: boolean
  targetMode?: TargetMode
  targetPreview?: boolean
  fretLo?: number
  fretHi?: number
}

export interface MetronomePresetConfig {
  bpm: number
  sig: string
  sub: Subdivision
  accentFirst: boolean
  volume: number
  trOn: boolean
  trStep: number
  trEvery: number
  trTarget: number
}

export interface ToolPresetConfigs {
  explorer: ExplorerPresetConfig
  looper: LooperPresetConfig
  metronome: MetronomePresetConfig
}
export type ToolPresetKind = keyof ToolPresetConfigs
export type ToolPreset = { [K in ToolPresetKind]: {
  id: string
  name: string
  tool: K
  config: ToolPresetConfigs[K]
  createdAt: number
  updatedAt: number
} }[ToolPresetKind]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const integer = (v: unknown, lo: number, hi: number) => num(v, lo, hi) && Number.isInteger(v)
const member = (v: unknown, list: readonly unknown[]) => list.includes(v)
const label = (v: unknown) => member(v, ['note', 'interval', 'degree', 'none'])
const scale = (v: unknown) => typeof v === 'string' && Object.hasOwn(SCALES, v)

export function isToolPresetConfig<K extends ToolPresetKind>(tool: K, raw: unknown): raw is ToolPresetConfigs[K] {
  if (!isObj(raw)) return false
  const c = raw
  if (tool === 'explorer') return member(c.mode, ['scale', 'chord']) && integer(c.scaleRoot, 0, 11) && integer(c.chordRoot, 0, 11)
    && scale(c.scale) && typeof c.chord === 'string' && Object.hasOwn(CHORDS, c.chord) && label(c.label)
    && member(c.maxFret, [15, 22]) && member(c.posKind, ['all', 'caged', 'box', 'window'])
    && member(c.caged, ['C', 'A', 'G', 'E', 'D']) && integer(c.box, 0, 11) && integer(c.lo, 0, 22) && integer(c.hi, 0, 22)
    && (c.boxWindow === undefined || typeof c.boxWindow === 'boolean')
  if (tool === 'looper') return typeof c.presetId === 'string' && (c.presetId === 'custom' || PRESETS.some((p) => p.id === c.presetId))
    && (c.keyMinor === undefined || typeof c.keyMinor === 'boolean')
    && Array.isArray(c.romans) && c.romans.every((r) => typeof r === 'string' && !!parseRoman(r))
    && integer(c.keyPc, 0, 11) && integer(c.bpm, 40, 220) && member(c.beats, [1, 2, 3, 4, 6, 8])
    && (c.durations === undefined || Array.isArray(c.durations) && c.durations.length === c.romans.length && c.durations.every(isChordDuration))
    && (c.loopSection === undefined || c.loopSection === null || validLoopSection(c.loopSection, c.romans.length))
    && (c.countInBeats === undefined || member(c.countInBeats, [0, 2, 3, 4, 6, 8]))
    && STYLES.some((s) => s.id === c.style) && member(c.bass, ['off', 'root', 'root-fifth']) && member(c.drums, ['off', 'click', 'basic'])
    && member(c.instrument, ['guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'piano']) && num(c.volume, 0, 1) && label(c.label)
    && (c.selectedScale === null || scale(c.selectedScale)) && typeof c.showScale === 'boolean'
    && integer(c.viewIdx, 0, Math.max(0, c.romans.length - 1))
    && (c.targetOn === undefined || typeof c.targetOn === 'boolean')
    && (c.targetMode === undefined || member(c.targetMode, ['all', 'root', 'third', 'fifth', 'seventh', 'guide']))
    && (c.targetPreview === undefined || typeof c.targetPreview === 'boolean')
    && (c.fretLo === undefined || integer(c.fretLo, 0, 22)) && (c.fretHi === undefined || integer(c.fretHi, 0, 22))
    && (c.fretLo === undefined || c.fretHi === undefined || typeof c.fretLo === 'number' && typeof c.fretHi === 'number' && c.fretLo <= c.fretHi)
  return integer(c.bpm, MIN_BPM, MAX_BPM) && TIME_SIGS.some((s) => s.id === c.sig) && SUBDIVISIONS.some((s) => s.id === c.sub)
    && typeof c.accentFirst === 'boolean' && num(c.volume, 0, 1) && typeof c.trOn === 'boolean'
    && integer(c.trStep, 1, 50) && integer(c.trEvery, 1, 64) && integer(c.trTarget, MIN_BPM, MAX_BPM)
}

/** Invalid records and duplicate IDs cannot break a tool or its preset picker. */
export function normalizeToolPresets(raw: unknown): ToolPreset[] {
  if (!Array.isArray(raw)) return []
  const out: ToolPreset[] = []
  const ids = new Set<string>()
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id)
      || typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 80
      || !member(p.tool, ['explorer', 'looper', 'metronome']) || !num(p.createdAt, 0, Number.MAX_SAFE_INTEGER)
      || !num(p.updatedAt, 0, Number.MAX_SAFE_INTEGER)) continue
    const tool = p.tool as ToolPresetKind
    if (!isToolPresetConfig(tool, p.config)) continue
    out.push({ id: p.id, name: p.name.trim(), tool, config: structuredClone(p.config), createdAt: p.createdAt, updatedAt: p.updatedAt } as ToolPreset)
    ids.add(p.id)
  }
  return out
}
