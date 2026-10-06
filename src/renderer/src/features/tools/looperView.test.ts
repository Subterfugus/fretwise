import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FretboardProps } from '@/components/Fretboard'
import type { LooperPresetConfig } from '@/state/toolPresets'
import { isToolPresetConfig } from '@/state/toolPresets'
import type { NoteNameSetting } from '@/theory/spelling'
import { spellPc } from '@/theory/spelling'
import { LooperTab } from './LooperTab'

const ui = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  state: { status: 'idle', chordIndex: 0, nextChordIndex: null } as { status: 'idle' | 'playing' | 'loading' | 'countIn'; chordIndex: number; nextChordIndex: number | null; countInRemaining?: number | null },
  settings: { instrument: 'guitar-acoustic', noteNames: 'auto' as NoteNameSetting },
  board: null as FretboardProps | null,
  preset: null as { config: LooperPresetConfig; onLoad: (c: LooperPresetConfig) => void } | null,
  numbers: {} as Record<string, { value: number; min: number; max: number; onChange: (value: number) => void }>,
  fields: {} as Record<string, ReactElement<{ value: unknown; onChange: (event: { target: { value: string } }) => void }>>,
  segments: {} as Record<string, { value: string; onChange: (value: string) => void; options: { id: string; disabled?: boolean }[] }>,
  buttons: [] as { 'aria-label'?: string; title?: string; children?: ReactNode; onClick?: () => void }[],
  typedDraft: '',
  typedInput: null as { onChange: (event: { target: { value: string } }) => void } | null,
  effects: [] as (() => void | (() => void))[],
  setInstrument: vi.fn(async (_id: string) => undefined),
  stop: vi.fn(), start: vi.fn(), setConfig: vi.fn()
}))

vi.mock('react/jsx-runtime', async (original) => {
  const runtime = await original<typeof import('react/jsx-runtime')>()
  const capture = (type: Parameters<typeof runtime.jsx>[0], props: Parameters<typeof runtime.jsx>[1], key?: string) => {
    if (type === 'button') ui.buttons.push(props as typeof ui.buttons[number])
    if (type === 'input' && (props as { placeholder?: string }).placeholder === 'or type numerals: I vi ii7 V7') ui.typedInput = props as typeof ui.typedInput
    return runtime.jsx(type, props, key)
  }
  return { ...runtime, jsx: capture, jsxs: capture }
})

vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof import('react/jsx-dev-runtime')>()
  return {
    ...runtime,
    jsxDEV: (...args: Parameters<typeof runtime.jsxDEV>) => {
      const [type, props] = args
      if (type === 'button') ui.buttons.push(props as typeof ui.buttons[number])
      if (type === 'input' && (props as { placeholder?: string }).placeholder === 'or type numerals: I vi ii7 V7') ui.typedInput = props as typeof ui.typedInput
      return runtime.jsxDEV(...args)
    }
  }
})

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    useSyncExternalStore: () => ui.state,
    useEffect: (effect: () => void | (() => void)) => { ui.effects.push(effect) },
    useState: (initial: unknown) => initial === '' ? [ui.typedDraft, (value: string) => { ui.typedDraft = value }] : react.useState(initial)
  }
})
vi.mock('@/audio/engine', () => ({
  INSTRUMENTS: [{ id: 'guitar-acoustic', label: 'Acoustic guitar' }, { id: 'piano', label: 'Piano' }],
  engine: { stop: ui.stop, setInstrument: ui.setInstrument }
}))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: ui.settings, toolPresets: [] }) }))
vi.mock('./looper', () => ({ looper: { subscribe: () => () => {}, getState: () => ui.state, stop: ui.stop, start: ui.start, setConfig: ui.setConfig } }))
vi.mock('@/components/Fretboard', () => ({ Fretboard: (props: FretboardProps) => { ui.board = props; return null } }))
vi.mock('./PresetControls', () => ({ PresetControls: (props: typeof ui.preset) => { ui.preset = props; return null } }))
vi.mock('./ui', async (original) => ({
  ...await original<typeof import('./ui')>(),
  usePref: <T,>(key: string, initial: T, valid?: (v: unknown) => boolean, seed?: T) => {
    const value = seed !== undefined && (!valid || valid(seed)) ? seed : Object.hasOwn(ui.prefs, key) && (!valid || valid(ui.prefs[key])) ? ui.prefs[key] as T : initial
    return [value, (next: T) => { ui.prefs[key] = next }]
  },
  Field: ({ label, children }: { label: string; children: ReactElement }) => {
    ui.fields[label] = children as typeof ui.fields[string]
    return createElement('div', null, children)
  },
  Seg: (props: { label: string; value: string; onChange: (value: string) => void; options: { id: string; label: ReactNode; disabled?: boolean }[] }) => {
    ui.segments[props.label] = props
    return createElement('div', { 'aria-label': props.label }, props.options.map((option) => createElement('button', { key: option.id, 'aria-pressed': option.id === props.value, disabled: option.disabled, onClick: () => props.onChange(option.id) }, option.label)))
  },
  NumberInput: (props: { 'aria-label': string; value: number; min: number; max: number; onChange: (value: number) => void }) => {
    ui.numbers[props['aria-label']] = props
    return null
  }
}))

const render = (initialConfig?: LooperPresetConfig) => {
  ui.buttons = []
  ui.numbers = {}
  ui.fields = {}
  ui.segments = {}
  return renderToStaticMarkup(createElement(LooperTab, { initialConfig }))
}
const current = (html: string) => /<div class="looper-target-current".*?<\/div>/.exec(html)?.[0] ?? ''
const next = (html: string) => /<div class="looper-target-next".*?<\/div>/.exec(html)?.[0] ?? ''
const changeField = (label: string, value: string) => ui.fields[label].props.onChange({ target: { value } })
const clickButton = (label: string) => {
  const button = ui.buttons.find((button) => button['aria-label'] === label || button.children === label)
  expect(button, `Button ${label} should exist`).toBeDefined()
  button!.onClick!()
}

beforeEach(() => {
  ui.prefs = { 'lp.preset': 'custom', 'lp.romans': ['I', 'V7'], 'lp.targetOn': true, 'lp.targetMode': 'guide', 'lp.showScale': false }
  ui.state = { status: 'idle', chordIndex: 0, nextChordIndex: null }
  ui.settings.noteNames = 'auto'
  ui.numbers = {}
  ui.board = null
  ui.preset = null
  ui.effects = []
  ui.typedDraft = ''
  ui.typedInput = null
  vi.clearAllMocks()
})

describe('looper target-tone view integration', () => {
  it('defaults to uniform beats, a full progression and no count-in', () => {
    render()
    expect(ui.segments['Chord timing'].value).toBe('uniform')
    expect(ui.segments['Loop section'].value).toBe('whole')
    expect(ui.preset!.config).toMatchObject({ durations: undefined, loopSection: null, countInBeats: 0 })
    expect(ui.numbers['Looper chord 1 duration']).toBeUndefined()
  })

  it('edits quarter-beat chord lengths independently of the uniform default', () => {
    render()
    ui.segments['Chord timing'].onChange('perChord')
    render()
    expect(ui.preset!.config.durations).toEqual([4, 4])
    expect(ui.numbers['Looper chord 1 duration']).toMatchObject({ min: 0.25, max: 32 })
    ui.numbers['Looper chord 1 duration'].onChange(1.25)
    render()
    changeField('Default beats', '6')
    render()
    expect(ui.preset!.config).toMatchObject({ beats: 6, durations: [1.25, 4] })
    ui.segments['Chord timing'].onChange('perChord')
    render()
    expect(ui.preset!.config.durations).toEqual([1.25, 4])
    ui.segments['Chord timing'].onChange('uniform')
    render()
    expect(ui.preset!.config.durations).toBeUndefined()
    ui.segments['Chord timing'].onChange('perChord')
    render()
    expect(ui.preset!.config.durations).toEqual([6, 6])
  })

  it('appends the default duration and preserves previous lengths and selected section', () => {
    ui.prefs['lp.durations'] = [1.25, 3]
    ui.prefs['lp.loopSection'] = { start: 0, end: 1 }
    ui.prefs['lp.beats'] = 2
    render()
    ui.buttons.find((button) => button.title === 'Add to the end')!.onClick!()
    render()
    expect(ui.preset!.config).toMatchObject({ durations: [1.25, 3, 2], loopSection: { start: 0, end: 1 } })
    clickButton('Remove last')
    render()
    expect(ui.preset!.config).toMatchObject({ durations: [1.25, 3], loopSection: { start: 0, end: 1 } })
  })

  it.each([
    ['Remove C', [2.25, 3.5, 4], { start: 0, end: 1 }],
    ['Remove Dm', [1, 3.5, 4], { start: 1, end: 1 }],
    ['Remove G7', [1, 2.25, 4], { start: 1, end: 1 }],
    ['Remove Cmaj7', [1, 2.25, 3.5], { start: 1, end: 2 }]
  ])('keeps original duration and section mapping after %s', (button, durations, loopSection) => {
    ui.prefs['lp.romans'] = ['I', 'ii', 'V7', 'Imaj7']
    ui.prefs['lp.durations'] = [1, 2.25, 3.5, 4]
    ui.prefs['lp.loopSection'] = { start: 1, end: 2 }
    render()
    clickButton(button as string)
    render()
    expect(ui.preset!.config).toMatchObject({ durations, loopSection })
    expect(isToolPresetConfig('looper', ui.preset!.config)).toBe(true)
  })

  it('keeps a valid single-chord section when its chord is removed and clears the section on empty', () => {
    ui.prefs['lp.durations'] = [2, 3]
    ui.prefs['lp.loopSection'] = { start: 1, end: 1 }
    render()
    clickButton('Remove G7')
    render()
    expect(ui.preset!.config).toMatchObject({ durations: [2], loopSection: { start: 0, end: 0 } })
    clickButton('Remove C')
    const empty = render()
    expect(ui.preset!.config).toMatchObject({ durations: [], loopSection: null })
    expect(empty).toContain('disabled="">Play loop')
    expect(ui.segments['Loop section'].options.find((option) => option.id === 'section')!.disabled).toBe(true)
  })

  it('replaces typed and built-in progressions with uniform full loops while retaining target choices', () => {
    ui.prefs['lp.durations'] = [2, 3]
    ui.prefs['lp.loopSection'] = { start: 1, end: 1 }
    ui.prefs['lp.countInBeats'] = 4
    render()
    ui.typedInput!.onChange({ target: { value: 'ii7 V7 Imaj7' } })
    render()
    clickButton('Set')
    render()
    expect(ui.preset!.config).toMatchObject({ romans: ['ii7', 'V7', 'Imaj7'], durations: undefined, loopSection: null, countInBeats: 4, targetOn: true, targetMode: 'guide' })
    ui.segments['Chord timing'].onChange('perChord')
    render()
    ui.segments['Loop section'].onChange('section')
    render()
    changeField('Progression', 'minor-V')
    render()
    expect(ui.preset!.config).toMatchObject({ presetId: 'minor-V', romans: ['i', 'iv', 'V7', 'i'], durations: undefined, loopSection: null, targetOn: true, targetMode: 'guide' })
  })

  it('keeps inclusive section endpoints valid and dims excluded full-list chords', () => {
    ui.prefs['lp.romans'] = ['I', 'ii', 'V7', 'Imaj7']
    render()
    ui.segments['Loop section'].onChange('section')
    render()
    changeField('Section start', '2')
    render()
    expect(ui.preset!.config.loopSection).toEqual({ start: 2, end: 3 })
    changeField('Section end', '1')
    const html = render()
    expect(ui.preset!.config.loopSection).toEqual({ start: 1, end: 1 })
    expect(html.match(/looper-excluded/g)).toHaveLength(3)
    expect(html).toContain('2: Dm')
    ui.segments['Loop section'].onChange('section')
    render()
    expect(ui.preset!.config.loopSection).toEqual({ start: 1, end: 1 })
    ui.segments['Loop section'].onChange('whole')
    expect(render()).not.toContain('looper-excluded')
  })

  it('keeps Stop available during the count-in without current or next chord highlights', () => {
    ui.prefs['lp.countInBeats'] = 4
    ui.state = { status: 'countIn', chordIndex: 1, nextChordIndex: 0, countInRemaining: 3 }
    const html = render()
    expect(html).toContain('Count-in: 3 beats remaining')
    expect(html).not.toContain('class="tools-now"')
    expect(html).not.toContain('tools-prog-chord now')
    expect(html).not.toContain('tools-prog-chord sel')
    expect(next(html)).not.toContain('<b>')
    expect(ui.board!.marks).toEqual([])
    clickButton('Stop')
    expect(ui.stop).toHaveBeenCalledOnce()
    ui.state.countInRemaining = 1
    expect(render()).toContain('Count-in: 1 beat remaining')
    ui.state.status = 'loading'
    expect(render()).not.toContain('class="tools-now"')
  })

  it('uses full progression indices for a selected-section target preview wrapping to its start', () => {
    ui.prefs['lp.romans'] = ['I', 'ii7', 'V7', 'Imaj7']
    ui.prefs['lp.loopSection'] = { start: 1, end: 2 }
    ui.state = { status: 'playing', chordIndex: 2, nextChordIndex: 1 }
    const html = render()
    expect(current(html)).toContain('<b>G7</b>')
    expect(next(html)).toContain('<b>Dm7</b>')
    expect(next(html)).toContain('<small>♭7</small>C')
  })

  it('hides loading targets using the captured count rather than a next-start setting edit', () => {
    ui.prefs['lp.countInBeats'] = 0
    ui.state = { status: 'loading', chordIndex: 0, nextChordIndex: null, countInRemaining: 2 }
    expect(render()).not.toContain('class="tools-now"')
    expect(ui.board!.marks).toEqual([])
    ui.prefs['lp.countInBeats'] = 8
    ui.state.countInRemaining = null
    expect(render()).toContain('class="tools-now"')
    expect(ui.board!.marks!.length).toBeGreaterThan(0)
  })

  it('round-trips and seeds every timing field together with existing lesson targets', () => {
    render()
    const saved: LooperPresetConfig = { ...ui.preset!.config, durations: [0.25, 7.75], loopSection: { start: 1, end: 1 }, countInBeats: 6, targetOn: true, targetMode: 'seventh', fretLo: 5, fretHi: 9 }
    ui.preset!.onLoad(saved)
    render()
    expect(ui.preset!.config).toEqual(saved)
    expect(isToolPresetConfig('looper', saved)).toBe(true)
    ui.effects = []
    render(saved)
    ui.effects.forEach((effect) => effect())
    expect(ui.setConfig).toHaveBeenLastCalledWith(expect.objectContaining({ durations: [0.25, 7.75], loopSection: { start: 1, end: 1 }, countInBeats: 6 }))
    expect(ui.start).not.toHaveBeenCalled()
  })

  it('resets stale timing when loading or launching a legacy preset', () => {
    render()
    const legacy = { ...ui.preset!.config }
    delete legacy.durations
    delete legacy.loopSection
    delete legacy.countInBeats
    ui.prefs['lp.durations'] = [2, 3]
    ui.prefs['lp.loopSection'] = { start: 1, end: 1 }
    ui.prefs['lp.countInBeats'] = 8
    render(legacy)
    expect(ui.preset!.config).toMatchObject({ durations: undefined, loopSection: null, countInBeats: 0, targetOn: true, targetMode: 'guide' })
    render()
    ui.preset!.onLoad(legacy)
    render()
    expect(ui.preset!.config).toMatchObject({ durations: undefined, loopSection: null, countInBeats: 0 })
    expect(ui.stop).toHaveBeenCalledOnce()
    expect(ui.start).not.toHaveBeenCalled()
  })

  it.each([
    { durations: [2], loopSection: { start: 1, end: 0 }, countInBeats: 1 },
    { durations: [0, 4], loopSection: { start: 0, end: 2 }, countInBeats: -1 },
    { durations: [2.1, 4], loopSection: [], countInBeats: '4' },
    { durations: [2, Infinity], loopSection: { start: 0.5, end: 1 }, countInBeats: Infinity }
  ])('rejects invalid stored timing %j', (stored) => {
    ui.prefs['lp.durations'] = stored.durations
    ui.prefs['lp.loopSection'] = stored.loopSection
    ui.prefs['lp.countInBeats'] = stored.countInBeats
    render()
    expect(ui.preset!.config).toMatchObject({ durations: undefined, loopSection: null, countInBeats: 0 })
    expect(isToolPresetConfig('looper', ui.preset!.config)).toBe(true)
  })

  it('uses every lesson seed before configuring playback, preserving explicit major context and scale', () => {
    render()
    const seed: LooperPresetConfig = {
      ...ui.preset!.config, presetId: 'custom', romans: ['ii7', 'V7', 'Imaj7'], keyPc: 1, keyMinor: false,
      bpm: 122, beats: 2, style: 'ballad', bass: 'off', drums: 'off', instrument: 'piano', volume: 0.4,
      label: 'note', selectedScale: 'ionian', showScale: true, viewIdx: 1,
      targetOn: true, targetMode: 'all', targetPreview: false, fretLo: 5, fretHi: 10
    }
    ui.effects = []
    render(seed)
    expect(ui.preset!.config).toEqual({ ...seed, durations: undefined, loopSection: null, countInBeats: 0 })
    expect(ui.board).toMatchObject({ frets: [5, 10], noteContext: { key: 'Db' } })
    ui.effects.forEach((effect) => effect())
    expect(ui.setConfig).toHaveBeenCalledWith(expect.objectContaining({ bpm: 122, beatsPerChord: 2, instrument: 'piano', volume: 0.4 }))
    expect(ui.start).not.toHaveBeenCalled()
    expect(ui.settings.instrument).toBe('guitar-acoustic')
  })

  it('round-trips an explicit key context for custom ii-V-I and clears it on legacy load', () => {
    ui.prefs = { ...ui.prefs, 'lp.romans': ['ii7', 'V7', 'Imaj7'], 'lp.key': 1, 'lp.keyMinor': false }
    render()
    const saved = structuredClone(ui.preset!.config)
    expect(saved.keyMinor).toBe(false)
    expect(isToolPresetConfig('looper', saved)).toBe(true)
    ui.prefs['lp.keyMinor'] = true
    ui.preset!.onLoad(saved)
    render()
    expect(ui.board!.noteContext).toEqual({ key: 'Db' })
    delete saved.keyMinor
    ui.preset!.onLoad(saved)
    expect(ui.prefs['lp.keyMinor']).toBeNull()
    render()
    expect(ui.board!.noteContext).toEqual({ key: 'C#m' })
    expect(ui.start).not.toHaveBeenCalled()
  })

  it('falls back from corrupt stored playback and display settings to a usable, saveable configuration', () => {
    ui.prefs = {
      'lp.preset': 'missing', 'lp.romans': ['I', 'bad', 'V7'], 'lp.key': 1.5, 'lp.bpm': 0,
      'lp.beats': -4, 'lp.style': 'missing', 'lp.bass': 'walking', 'lp.drums': 'rock', 'lp.inst': 'violin',
      'lp.vol': Infinity, 'lp.label': 'bad', 'lp.scaleIdx': -1, 'lp.selectedScale': 'toString', 'lp.showScale': 'false',
      'lp.targetOn': 'true', 'lp.targetMode': 'bad', 'lp.targetPreview': 1, 'lp.fretLo': -1, 'lp.fretHi': 99
    }
    expect(render()).toContain('Improvise over it')
    expect(ui.preset!.config).toMatchObject({
      presetId: 'pop', romans: ['I', 'V', 'vi', 'IV'], keyPc: 0, bpm: 90, beats: 4,
      style: 'strum8', bass: 'root', drums: 'basic', instrument: 'guitar-acoustic', volume: 0.8,
      label: 'degree', showScale: true, targetOn: false, targetMode: 'guide', targetPreview: true, fretLo: 0, fretHi: 15
    })
    expect(isToolPresetConfig('looper', ui.preset!.config)).toBe(true)
    expect(ui.board!.marks!.length).toBeGreaterThan(0)
  })

  it.each([null, {}, 'wrong', -1, 12, 0.5, Infinity, NaN])('rejects invalid stored key %s before resolving chords', (key) => {
    ui.prefs['lp.key'] = key
    expect(current(render())).toContain('<b>C</b>')
    expect(ui.preset!.config.keyPc).toBe(0)
  })

  it('uses the major naming context of a built-in ii-V-I rather than its first minor chord', () => {
    ui.prefs['lp.preset'] = 'ii-V-I'
    ui.prefs['lp.romans'] = ['ii7', 'V7', 'Imaj7']
    ui.prefs['lp.key'] = 1
    render()
    expect(ui.board!.noteContext).toEqual({ key: 'Db' })
    ui.prefs['lp.preset'] = 'ii-V-i'
    ui.prefs['lp.romans'] = ['iih7', 'V7', 'i']
    render()
    expect(ui.board!.noteContext).toEqual({ key: 'C#m' })
    ui.prefs['lp.preset'] = 'custom'
    ui.prefs['lp.romans'] = [' ♭i', 'V7']
    render()
    expect(ui.board!.noteContext).toEqual({ key: 'C#m' })
  })

  it('auditions fretboard notes with the Looper instrument and restores the global choice on exit', () => {
    ui.prefs['lp.inst'] = 'piano'
    render()
    const cleanups = ui.effects.map((effect) => effect())
    expect(ui.setInstrument).toHaveBeenCalledExactlyOnceWith('piano')
    expect(ui.setConfig).toHaveBeenCalledWith(expect.objectContaining({ instrument: 'piano' }))
    for (const cleanup of cleanups) cleanup?.()
    expect(ui.setInstrument).toHaveBeenLastCalledWith('guitar-acoustic')
    expect(ui.stop).toHaveBeenCalledOnce()
  })

  it('shows the available third in guide mode and states that the seventh is missing', () => {
    const html = render()
    expect(current(html)).toContain('<small>3</small>E')
    expect(current(html)).toContain('No 7th in this chord.')
    expect(ui.board!.marks!.length).toBeGreaterThan(0)
    expect(ui.board!.marks!.every((m) => m.label === '3')).toBe(true)
    ui.prefs['lp.targetMode'] = 'seventh'
    const seventh = render()
    expect(current(seventh)).toContain('No 7th in this chord.')
    expect(ui.board!.marks).toEqual([])
  })

  it('uses the progression key consistently for live note dots, chips and hover names', () => {
    ui.prefs['lp.romans'] = ['i', 'V7']
    ui.prefs['lp.label'] = 'note'
    const html = render()
    expect(current(html)).toContain('<small>♭3</small>E♭')
    expect(ui.board!.noteContext).toEqual({ key: 'Cm' })
    for (const m of ui.board!.marks!) {
      expect(m.computedNote!.key).toBe('Cm')
      expect(spellPc(m.computedNote!.pc, ui.settings.noteNames, { key: m.computedNote!.key })).toBe('Eb')
    }
    ui.settings.noteNames = 'sharps'
    expect(current(render())).toContain('<small>♭3</small>D♯')
    ui.settings.noteNames = 'flats'
    expect(current(render())).toContain('<small>♭3</small>E♭')
    ui.settings.noteNames = { key: 'C' }
    expect(current(render())).toContain('<small>♭3</small>D♯')
    ui.prefs['lp.label'] = 'degree'
    render()
    expect(ui.board!.marks!.every((m) => m.label === '♭3' && !m.computedNote)).toBe(true)
  })

  it('follows the current Transport index and hides next preview whenever playback is stopped', () => {
    ui.state = { status: 'playing', chordIndex: 1, nextChordIndex: 0 }
    const html = render()
    expect(current(html)).toContain('<b>G7</b>')
    expect(current(html)).toContain('<small>3</small>B')
    expect(current(html)).toContain('<small>♭7</small>F')
    expect(next(html)).toContain('<b>C</b>')
    expect(next(html)).toContain('No 7th in this chord.')
    ui.state.status = 'idle'
    expect(next(render())).not.toContain('<b>')
    ui.state.status = 'loading'
    expect(next(render())).not.toContain('<b>')
    ui.state.status = 'playing'
    ui.prefs['lp.targetPreview'] = false
    expect(next(render())).not.toContain('<b>')
  })

  it('normalizes reversed stored fret bounds before editing either endpoint', () => {
    ui.prefs['lp.fretLo'] = 12
    ui.prefs['lp.fretHi'] = 5
    render()
    expect(ui.board!.frets).toEqual([5, 12])
    expect(ui.preset!.config).toMatchObject({ fretLo: 5, fretHi: 12 })
    ui.numbers['Looper first fret'].onChange(7)
    render()
    expect(ui.board!.frets).toEqual([7, 12])
    ui.numbers['Looper last fret'].onChange(10)
    render()
    expect(ui.board!.frets).toEqual([7, 10])
    expect(ui.board!.marks!.every((m) => m.fret >= 7 && m.fret <= 10)).toBe(true)
  })

  it('loads legacy preset defaults while stopping playback and requiring an explicit restart', () => {
    render()
    const legacy = { ...ui.preset!.config }
    delete legacy.targetOn
    delete legacy.targetMode
    delete legacy.targetPreview
    delete legacy.fretLo
    delete legacy.fretHi
    ui.preset!.onLoad(legacy)
    expect(ui.stop).toHaveBeenCalledOnce()
    expect(ui.start).not.toHaveBeenCalled()
    render()
    expect(ui.preset!.config).toMatchObject({ targetOn: false, targetMode: 'guide', targetPreview: true, fretLo: 0, fretHi: 15 })
  })
})
