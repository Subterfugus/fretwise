import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FretboardProps } from '@/components/Fretboard'
import type { NoteNameSetting } from '@/theory/spelling'
import { DEFAULT_VOICE_LEADING, type VoiceLeadingConfig } from './voiceLeadingConfig'
import { VoiceLeadingTab } from './VoiceLeadingTab'

const ui = vi.hoisted(() => ({
  config: undefined as unknown,
  settings: { instrument: 'guitar-acoustic', noteNames: 'auto' as NoteNameSetting },
  state: { status: 'stopped', index: -1, error: null } as { status: 'stopped' | 'loading' | 'playing'; index: number; error: string | null },
  board: null as FretboardProps | null,
  effects: [] as (() => void | (() => void))[],
  stop: vi.fn(), start: vi.fn()
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useSyncExternalStore: () => ui.state,
  useEffect: (effect: () => void | (() => void)) => { ui.effects.push(effect) }
}))
vi.mock('@/audio/engine', () => ({ engine: { stop: ui.stop } }))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: ui.settings }) }))
vi.mock('./voiceLeadingPlayer', () => ({ voiceLeadingPlayer: { subscribe: () => () => {}, getState: () => ui.state, stop: ui.stop, start: ui.start } }))
vi.mock('@/components/Fretboard', () => ({ Fretboard: (props: FretboardProps) => { ui.board = props; return null } }))
vi.mock('./ui', async (original) => ({
  ...await original<typeof import('./ui')>(),
  usePref: <T,>(_key: string, initial: T, valid?: (value: unknown) => boolean, seed?: T) => [seed !== undefined && (!valid || valid(seed)) ? seed : valid?.(ui.config) ? ui.config : initial, vi.fn()]
}))
const render = (initialConfig?: VoiceLeadingConfig) => renderToStaticMarkup(createElement(VoiceLeadingTab, { onDictionaryEntry: vi.fn(), initialConfig }))
beforeEach(() => {
  ui.config = structuredClone(DEFAULT_VOICE_LEADING)
  ui.settings.noteNames = 'auto'
  ui.state = { status: 'stopped', index: -1, error: null }
  ui.board = null
  ui.effects = []
  vi.clearAllMocks()
})

describe('voice-leading view', () => {
  it('seeds an extended lesson progression over stored config with visible omissions and no autoplay', () => {
    const seed: VoiceLeadingConfig = { ...DEFAULT_VOICE_LEADING, romans: ['iimin9', 'Vdom13', 'Imaj9'], keyPc: 2, stringSet: '1-2-3-4', frets: [0, 22], bpm: 118, beats: 2, mode: 'arpeggio', labels: 'degree' }
    const html = render(seed)
    expect(html.match(/class="vl-step"/g)).toHaveLength(3)
    expect(html).toContain('Omits ')
    expect(html).toContain('Omitted degrees: ')
    expect(html).toContain('Em9')
    expect(html).toContain('A13')
    expect(html).toContain('Dmaj9')
    expect(ui.board).toMatchObject({ frets: [0, 22], activeStrings: [1, 2, 3, 4] })
    expect(ui.start).not.toHaveBeenCalled()
  })
  it('renders a complete selectable progression and a playable, keyboard-enabled board without autoplay', () => {
    const html = render()
    expect(html).toContain('Voice Leading')
    expect(html.match(/class="vl-step"/g)).toHaveLength(4)
    expect(html).toContain('Play voice-leading sequence')
    expect(html).toContain('Select chord 1:')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('Open selected chord in dictionary')
    expect(ui.board).toMatchObject({ frets: [0, 12], activeStrings: [1, 2, 3], playable: true, ariaLabel: 'Voice-leading fretboard' })
    expect(ui.board!.marks!.filter((m) => m.color !== 'ghost')).toHaveLength(3)
    expect(ui.start).not.toHaveBeenCalled()
  })
  it('shows audio-clock-selected chord and correct upcoming transition', () => {
    ui.state = { status: 'playing', index: 1, error: null }
    const html = render()
    expect(html).toMatch(/Select chord 2:.*?aria-current="step"/)
    expect(html).toContain('held voices')
    expect(html).toContain('Next tone')
  })
  it('shows only current chord on the final step', () => {
    ui.state = { status: 'playing', index: 3, error: null }
    const html = render()
    expect(html).toContain('Final chord')
    expect(html).not.toContain('Next tone')
    expect(ui.board!.marks!.filter((m) => m.color === 'ghost')).toHaveLength(0)
  })
  it('reports impossible complete sevenths on three strings without partial boards or play controls', () => {
    (ui.config as VoiceLeadingConfig).romans = ['ii7', 'V7', 'Imaj7']
    const html = render()
    expect(html).toContain('No complete path in this range')
    expect(html).toContain('four strings')
    expect(html).not.toContain('Play voice-leading sequence')
    expect(ui.board).toBeNull()
  })
  it('renders mixed triads and seventh chords on four strings', () => {
    Object.assign(ui.config as VoiceLeadingConfig, { romans: ['iih7', 'V7', 'i'], minor: true, stringSet: '1-2-3-4' })
    expect(render()).not.toContain('No complete path')
    expect(ui.board!.activeStrings).toEqual([1, 2, 3, 4])
  })
  it('falls back from corrupt preferences to a usable complete default', () => {
    ui.config = { ...DEFAULT_VOICE_LEADING, stringSet: '__proto__', romans: ['wrong'], frets: [-1, 99] }
    const html = render()
    expect(html.match(/class="vl-step"/g)).toHaveLength(4)
    expect(ui.board!.frets).toEqual([0, 12])
  })
  it('resolves computed notes live while degree labels stay deliberate', () => {
    Object.assign(ui.config as VoiceLeadingConfig, { keyPc: 1 })
    ui.settings.noteNames = 'flats'
    const flat = render()
    const positions = ui.board!.marks!.map((m) => [m.string, m.fret])
    expect(flat).toContain('D♭')
    expect(ui.board!.marks!.every((m) => !!m.computedNote)).toBe(true)
    ui.settings.noteNames = 'sharps'
    expect(render()).toContain('C♯')
    expect(ui.board!.marks!.map((m) => [m.string, m.fret])).toEqual(positions)
    ;(ui.config as VoiceLeadingConfig).labels = 'degree'
    render()
    expect(ui.board!.marks!.every((m) => !m.computedNote)).toBe(true)
  })
  it('retains loading and sound errors visibly, and registers cleanup that stops audio', () => {
    ui.state = { status: 'loading', index: -1, error: 'Samples unavailable' }
    const html = render()
    expect(html).toContain('Loading sound...')
    expect(html).toContain('role="alert">Samples unavailable')
    const cleanup = ui.effects[0]()
    expect(typeof cleanup).toBe('function')
    if (typeof cleanup === 'function') cleanup()
    expect(ui.stop).toHaveBeenCalled()
  })
})
