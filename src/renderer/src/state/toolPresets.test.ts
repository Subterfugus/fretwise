import { describe, expect, it } from 'vitest'
import { fitScales, progressionChords } from '@/features/tools/progressions'
import { isToolPresetConfig, normalizeToolPresets, type ToolPreset } from './toolPresets'

const explorer: ToolPreset = {
  id: 'explorer-1', name: 'Dorian window', tool: 'explorer', createdAt: 100, updatedAt: 200,
  config: { mode: 'scale', scaleRoot: 2, chordRoot: 7, scale: 'dorian', chord: 'min7', label: 'degree', maxFret: 22, posKind: 'window', caged: 'A', box: 3, lo: 5, hi: 12 }
}
const looper: ToolPreset = {
  id: 'looper-1', name: 'Jazz practice', tool: 'looper', createdAt: 100, updatedAt: 200,
  config: { presetId: 'custom', romans: ['ii7', 'V7', 'Imaj7'], keyPc: 5, bpm: 115, beats: 4, style: 'arpeggio', bass: 'root-fifth', drums: 'click', instrument: 'guitar-nylon', volume: 0.65, label: 'interval', selectedScale: 'major', showScale: true, viewIdx: 2 }
}
const metro: ToolPreset = {
  id: 'metronome-1', name: 'Triplets', tool: 'metronome', createdAt: 100, updatedAt: 200,
  config: { bpm: 90, sig: '3/4', sub: 'triplet', accentFirst: false, volume: 0.55, trOn: true, trStep: 3, trEvery: 8, trTarget: 160 }
}

describe('named tool presets', () => {
  it('round trips every configuration including inactive options and stable selections', () => {
    const records = [explorer, looper, metro]
    expect(normalizeToolPresets(JSON.parse(JSON.stringify(records)))).toEqual(records)
    expect(normalizeToolPresets(records)[1].config).not.toBe(looper.config)
  })

  it('tolerates missing or corrupt storage and retains valid siblings', () => {
    expect(normalizeToolPresets(undefined)).toEqual([])
    expect(normalizeToolPresets({ presets: [metro] })).toEqual([])
    expect(normalizeToolPresets([null, 3, {}, { ...metro, config: { ...metro.config, bpm: NaN } }, explorer])).toEqual([explorer])
  })

  it('rejects invalid metadata, duplicate identifiers, and names that cannot be saved by the UI', () => {
    expect(normalizeToolPresets([
      { ...metro, id: '' }, { ...metro, name: ' ' }, { ...metro, name: 'x'.repeat(81) },
      { ...metro, createdAt: -1 }, { ...metro, updatedAt: Infinity }, { ...metro, tool: 'unknown' }
    ])).toEqual([])
    expect(normalizeToolPresets([metro, { ...metro, name: 'Duplicate' }, explorer])).toEqual([metro, explorer])
    expect(normalizeToolPresets([{ ...metro, name: '  Triplets  ' }])[0].name).toBe('Triplets')
  })

  it('validates Explorer pitch classes, catalog selections, labels, positions, and fret bounds', () => {
    for (const patch of [
      { scaleRoot: 12 }, { chordRoot: 0.5 }, { scale: 'toString' }, { chord: '__proto__' },
      { mode: 'unknown' }, { label: 'octave' }, { maxFret: 13 }, { posKind: 'unknown' },
      { caged: 'B' }, { box: -1 }, { lo: -1 }, { hi: 23 }, { boxWindow: 'yes' }
    ]) expect(isToolPresetConfig('explorer', { ...explorer.config, ...patch })).toBe(false)
    expect(isToolPresetConfig('explorer', { ...explorer.config, lo: 12, hi: 5 })).toBe(true)
  })
  it('round trips a constrained scale box while retaining legacy unrestricted boxes', () => {
    const record = { ...explorer, config: { ...explorer.config, posKind: 'box', boxWindow: true, lo: 9, hi: 18 } }
    expect(normalizeToolPresets(JSON.parse(JSON.stringify([record])))).toEqual([record])
    expect(isToolPresetConfig('explorer', explorer.config)).toBe(true)
  })

  it('validates Looper progressions and all playback and display selections', () => {
    for (const patch of [
      { presetId: 'missing' }, { romans: ['I', 'bad'] }, { romans: [1] }, { keyPc: -1 }, { bpm: 39 },
      { beats: 5 }, { style: 'salsa' }, { bass: 'walking' }, { drums: 'rock' }, { instrument: 'violin' },
      { volume: 1.1 }, { label: 'bad' }, { selectedScale: 'missing' }, { selectedScale: '__proto__' }, { showScale: 1 }, { viewIdx: 3 }, { keyMinor: 'false' }
    ]) expect(isToolPresetConfig('looper', { ...looper.config, ...patch })).toBe(false)
    expect(isToolPresetConfig('looper', { ...looper.config, romans: [], selectedScale: null, viewIdx: 0 })).toBe(true)
  })

  it('round trips an explicit lesson key centre and any valid selected scale while keeping old saves valid', () => {
    for (const selectedScale of ['ionian', 'aeolian', 'locrian', 'wholeTone']) {
      const record = { ...looper, config: { ...looper.config, selectedScale, keyMinor: false } }
      expect(normalizeToolPresets(JSON.parse(JSON.stringify([record])))).toEqual([record])
    }
    expect(isToolPresetConfig('looper', looper.config)).toBe(true)
  })

  it('validates metronome time signatures, subdivisions, volume, and trainer settings', () => {
    for (const patch of [
      { bpm: 301 }, { sig: '9/8' }, { sub: 'quarter' }, { accentFirst: 1 }, { volume: -0.1 },
      { trOn: 'yes' }, { trStep: 0 }, { trEvery: 65 }, { trTarget: Infinity }
    ]) expect(isToolPresetConfig('metronome', { ...metro.config, ...patch })).toBe(false)
  })

  it('round trips target-tone settings without rejecting legacy presets', () => {
    const record = { ...looper, config: { ...looper.config, targetOn: true, targetMode: 'guide', targetPreview: false, fretLo: 5, fretHi: 10 } }
    expect(normalizeToolPresets([record])).toEqual([record])
    expect(isToolPresetConfig('looper', looper.config)).toBe(true)
    for (const patch of [{ targetMode: 'bad' }, { targetOn: 1 }, { targetPreview: 1 }, { fretLo: -1 }, { fretHi: 23 }, { fretLo: 10, fretHi: 5 }]) {
      expect(isToolPresetConfig('looper', { ...looper.config, ...patch })).toBe(false)
    }
  })
  it('round trips unequal timing, count-in and inclusive section bounds', () => {
    const record = { ...looper, config: { ...looper.config, durations: [1.5, 0.25, 8], countInBeats: 4, loopSection: { start: 1, end: 2 } } }
    expect(normalizeToolPresets(JSON.parse(JSON.stringify([record])))).toEqual([record])
    expect(isToolPresetConfig('looper', looper.config)).toBe(true)
    for (const patch of [{ durations: [4] }, { durations: [1, 0, 4] }, { durations: [1, 1.3, 4] }, { durations: [1, 2, Infinity] }, { durations: [1, 2, 32.25] }, { loopSection: { start: 2, end: 1 } }, { loopSection: { start: 0, end: 3 } }, { loopSection: { start: -1, end: 1 } }, { loopSection: 'all' }, { countInBeats: 1 }, { countInBeats: '4' }]) {
      expect(isToolPresetConfig('looper', { ...looper.config, ...patch }), JSON.stringify(patch)).toBe(false)
    }
    expect(isToolPresetConfig('looper', { ...looper.config, loopSection: { start: 1, end: 1 } })).toBe(true)
    expect(isToolPresetConfig('looper', { ...looper.config, loopSection: null })).toBe(true)
  })

  it('stores a scale type that survives reordering of fitting-scale suggestions', () => {
    const source = fitScales('C', progressionChords('C', ['I', 'IV', 'V']))
    const changed = fitScales('C', progressionChords('C', ['i', 'bVII', 'bVI']))
    const selectedType = source[0].type
    expect(changed.find((f) => f.type === selectedType)?.type).toBe(selectedType)
    expect(changed.findIndex((f) => f.type === selectedType)).not.toBe(0)
    const saved = normalizeToolPresets([{ ...looper, config: { ...looper.config, selectedScale: selectedType } }])[0]
    expect(saved.tool === 'looper' && saved.config.selectedScale).toBe(selectedType)
  })
})
