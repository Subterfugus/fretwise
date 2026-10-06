import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FretboardProps } from '@/components/Fretboard'
import type { ExplorerPresetConfig } from '@/state/toolPresets'
import type { IdentifierInput } from './identifierInput'
import { ExplorerTab } from './ExplorerTab'
import { ChordIdentifierTab } from './ChordIdentifierTab'

const ui = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>, seeds: {} as Record<string, unknown>,
  board: null as FretboardProps | null, config: null as ExplorerPresetConfig | null,
  play: vi.fn(), stop: vi.fn()
}))
vi.mock('@/audio/engine', () => ({ engine: { stop: ui.stop, playNotes: ui.play, playNote: ui.play } }))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: { instrument: 'guitar-acoustic', noteNames: 'auto', leftHanded: false } }) }))
vi.mock('@/components/Fretboard', () => ({ Fretboard: (props: FretboardProps) => { ui.board = props; return null } }))
vi.mock('@/components/PlayButton', () => ({ PlayButton: () => null }))
vi.mock('./PresetControls', () => ({ PresetControls: (props: { config: ExplorerPresetConfig }) => { ui.config = props.config; return null } }))
vi.mock('./ui', async (original) => ({
  ...await original<typeof import('./ui')>(), useEngineReady: () => 'ready',
  usePref: <T,>(key: string, initial: T, valid?: (value: unknown) => boolean, seed?: T) => {
    ui.seeds[key] = seed
    return [seed !== undefined && (!valid || valid(seed)) ? seed : Object.hasOwn(ui.prefs, key) && (!valid || valid(ui.prefs[key])) ? ui.prefs[key] : initial, vi.fn()]
  }
}))
beforeEach(() => { ui.prefs = {}; ui.seeds = {}; ui.board = null; ui.config = null; vi.clearAllMocks() })

describe('lesson tool consumer seeds', () => {
  it('supplies every Explorer field before the initial render and preserves ordinary preferences without a seed', () => {
    ui.prefs = { 'ex.mode': 'chord', 'ex.chordRoot': 9, 'ex.chord': 'min' }
    const seed: ExplorerPresetConfig = { mode: 'scale', scaleRoot: 2, chordRoot: 7, scale: 'dorian', chord: 'dom13', label: 'degree', maxFret: 22, posKind: 'window', caged: 'D', box: 2, boxWindow: false, lo: 5, hi: 10 }
    renderToStaticMarkup(createElement(ExplorerTab, { initialConfig: seed }))
    expect(ui.config).toEqual(seed)
    expect(Object.keys(ui.seeds)).toHaveLength(Object.keys(seed).length)
    expect(Object.values(ui.seeds).every((value) => value !== undefined)).toBe(true)
    expect(ui.play).not.toHaveBeenCalled()
    renderToStaticMarkup(createElement(ExplorerTab))
    expect(ui.config).toMatchObject({ mode: 'chord', chordRoot: 9, chord: 'min' })
  })
  it('supplies exact alternate-tuning and capo input over persisted physical frets without auditioning', () => {
    ui.prefs['identifier.input'] = { tuningId: 'standard', capo: 0, frets: [null, 3, 2, 0, 1, 0] }
    const seed: IdentifierInput = { tuningId: 'dropD', capo: 2, frets: [0, 0, 0, 2, 3, 2] }
    const html = renderToStaticMarkup(createElement(ChordIdentifierTab, { onDictionaryEntry: vi.fn(), initialInput: seed }))
    expect(ui.seeds['identifier.input']).toEqual(seed)
    expect(ui.board).toMatchObject({ capo: 2 })
    expect(html).toContain('value="2"')
    expect(ui.play).not.toHaveBeenCalled()
  })
  it('seeds a constrained box over a persisted whole-neck box and exposes its fret controls', () => {
    ui.prefs['ex.boxWindow'] = false
    const seed: ExplorerPresetConfig = { mode: 'scale', scaleRoot: 9, chordRoot: 9, scale: 'minorPentatonic', chord: 'min', label: 'note', maxFret: 15, posKind: 'box', caged: 'E', box: 3, boxWindow: true, lo: 0, hi: 5 }
    const html = renderToStaticMarkup(createElement(ExplorerTab, { initialConfig: seed }))
    expect(ui.config).toEqual(seed)
    expect(ui.board!.marks!.length).toBeGreaterThan(0)
    expect(ui.board!.marks!.every((m) => m.fret >= 0 && m.fret <= 5)).toBe(true)
    expect(html).toContain('Limit box to fret window')
    expect(html).toContain('From fret')
    expect(html).toContain('To fret')
    const legacy = { ...seed }
    delete legacy.boxWindow
    renderToStaticMarkup(createElement(ExplorerTab, { initialConfig: legacy }))
    expect(ui.config!.boxWindow).toBe(false)
    expect(ui.board!.marks!.some((m) => m.fret >= 12)).toBe(true)
  })
})
