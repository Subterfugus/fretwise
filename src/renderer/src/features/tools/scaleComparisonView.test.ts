import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FretboardProps } from '@/components/Fretboard'
import { ScaleComparisonTab } from './ScaleComparisonTab'
import { DEFAULT_COMPARISON, type ComparisonConfig } from './scaleComparison'

type Props = Record<string, unknown>
const ui = vi.hoisted(() => ({
  config: null as ComparisonConfig | null,
  board: null as FretboardProps | null,
  nodes: [] as { type: string; props: Props }[],
  effects: [] as (() => void | (() => void))[],
  handlers: new Set<() => void>(),
  settings: { instrument: 'guitar-acoustic', leftHanded: false, noteNames: 'auto', volume: 0.8 },
  play: vi.fn(async (_events: unknown, _bpm: number): Promise<void> => undefined),
  wait: vi.fn(async (_seconds: number): Promise<void> => undefined),
  stop: vi.fn()
}))

vi.mock('react/jsx-runtime', async (original) => {
  const actual = await original<typeof import('react/jsx-runtime')>()
  const wrap = (fn: typeof actual.jsx) => (type: unknown, props: Props, key?: string) => {
    if (typeof type === 'string') ui.nodes.push({ type, props })
    return fn(type as Parameters<typeof fn>[0], props, key)
  }
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) }
})
vi.mock('react/jsx-dev-runtime', async (original) => {
  const actual = await original<typeof import('react/jsx-dev-runtime')>()
  return { ...actual, jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
    if (typeof args[0] === 'string') ui.nodes.push({ type: args[0], props: args[1] as Props })
    return actual.jsxDEV(...args)
  } }
})
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { ui.effects.push(effect) }
}))
vi.mock('@/audio/engine', () => ({ engine: {
  playSequence: ui.play, wait: ui.wait, stop: ui.stop,
  registerStopHandler: (handler: () => void) => { ui.handlers.add(handler); return () => ui.handlers.delete(handler) }
} }))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: ui.settings }) }))
vi.mock('@/state/useSpelling', () => ({ useSpelling: () => ({
  spellPc: (pc: number) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pc],
  spellMidi: (midi: number) => `MIDI ${midi}`
}) }))
vi.mock('@/components/Fretboard', () => ({ Fretboard: (props: FretboardProps) => { ui.board = props; return null } }))
vi.mock('./ui', async (original) => ({
  ...await original<typeof import('./ui')>(),
  useEngineReady: () => 'ready',
  usePref: (_key: string, initial: ComparisonConfig, valid: (value: unknown) => boolean) => [
    ui.config && valid(ui.config) ? ui.config : initial,
    (next: ComparisonConfig) => { ui.config = JSON.parse(JSON.stringify(next)) as ComparisonConfig }
  ]
}))

const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as ReactElement<{ children?: unknown }>).props.children)
  return ''
}
const render = () => {
  ui.nodes = []
  ui.effects = []
  return renderToStaticMarkup(createElement(ScaleComparisonTab))
}
const button = (name: string) => ui.nodes.find((node) => node.type === 'button' && (node.props['aria-label'] === name || textOf(node.props.children) === name))!.props.onClick as () => Promise<void>
const checkbox = (name: string) => {
  const label = ui.nodes.find((node) => node.type === 'label' && textOf(node.props.children) === name)!
  const input = (label.props.children as ReactElement<Props>[]).find((child) => child?.type === 'input')!
  return input.props.onChange as (event: { target: { checked: boolean } }) => void
}
const choose = (name: string, value: string) => {
  const onChange = ui.nodes.find((node) => node.type === 'select' && node.props['aria-label'] === name)!.props.onChange as (event: { target: { value: string } }) => void
  onChange({ target: { value } })
}
const chooseRoot = (side: 'A' | 'B', pc: number) => {
  const group = ui.nodes.find((node) => node.type === 'div' && node.props['aria-label'] === `Root ${side}`)!
  const roots = group.props.children as ReactElement<Props>[]
  const onClick = roots[pc].props.onClick as () => void
  onClick()
}
const mountEffects = () => ui.effects.map((effect) => effect())
const deferred = () => {
  let resolve!: () => void
  let reject!: () => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  ui.config = { ...DEFAULT_COMPARISON, rootPc: 0, rootBPc: 0 }
  ui.board = null
  ui.handlers.clear()
  ui.settings.instrument = 'guitar-acoustic'
  vi.clearAllMocks()
  ui.play.mockImplementation(async () => undefined)
  ui.wait.mockImplementation(async () => undefined)
  ui.stop.mockImplementation(() => ui.handlers.forEach((handler) => handler()))
})

describe('scale comparison view and playback', () => {
  it('renders accessible independent root groups and shared notes with two tonic markers', () => {
    ui.config = { ...ui.config!, rootBPc: 9, sameRoot: false }
    const html = render()
    expect(html).toContain('aria-label="Root A"')
    expect(html).toContain('aria-label="Root B"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('A</span>C Major')
    expect(html).toContain('B</span>A Natural minor')
    expect(html).toContain('Same pitches; different tonics and degrees.')
    expect(html).toContain('Tonic reference before each scale')
    expect(ui.board!.marks!.some((mark) => mark.comparisonTonic === 'a')).toBe(true)
    expect(ui.board!.marks!.some((mark) => mark.comparisonTonic === 'b')).toBe(true)
    expect(ui.board!.marks!.every((mark) => mark.color === 'tone')).toBe(true)
    expect(ui.board!.selected).toBeUndefined()
  })
  it('materializes legacy B before unlinking and persists each root edit and full swap', () => {
    const { rootBPc: _b, sameRoot: _s, tonicReference: _r, ...legacy } = ui.config!
    ui.config = legacy
    render()
    expect(ui.play).not.toHaveBeenCalled()
    checkbox('Same root')({ target: { checked: false } })
    expect(ui.config).toMatchObject({ sameRoot: false, rootBPc: 0 })
    render()
    chooseRoot('A', 2)
    expect(ui.config).toMatchObject({ rootPc: 2, rootBPc: 0 })
    render()
    chooseRoot('B', 9)
    render()
    button('Swap scales and roots')()
    expect(ui.config).toMatchObject({ rootPc: 9, rootBPc: 2, a: 'naturalMinor', b: 'major', sameRoot: false })
    render()
    expect(ui.board!.ariaLabel).toContain('A Natural minor')
    checkbox('Same root')({ target: { checked: true } })
    render()
    chooseRoot('B', 5)
    expect(ui.config).toMatchObject({ rootPc: 5, rootBPc: 5, sameRoot: true })
    expect(ui.play).not.toHaveBeenCalled()
  })
  it('loads relative presets and restores parallel root linking', () => {
    render()
    choose('Quick comparison', 'relative-minor')
    expect(ui.config).toMatchObject({ rootPc: 0, rootBPc: 9, sameRoot: false })
    expect(render()).toContain('value="relative-minor" selected')
    choose('Quick comparison', 'relative-dorian')
    expect(ui.config).toMatchObject({ rootBPc: 2, b: 'dorian', sameRoot: false })
    render()
    choose('Quick comparison', 'major-minor')
    expect(ui.config).toMatchObject({ rootBPc: 0, sameRoot: true, b: 'naturalMinor' })
  })
  it('plays reference plus each actual root through the shared sequence engine', async () => {
    ui.config = { ...ui.config!, rootBPc: 9, sameRoot: false }
    render()
    mountEffects()
    await button('A then B')()
    expect(ui.play).toHaveBeenCalledTimes(2)
    expect(ui.play.mock.calls[0][0]).toEqual(expect.arrayContaining([{ notes: [48, 52, 55], beats: 2, mode: 'block' }]))
    expect(ui.play.mock.calls[1][0]).toEqual(expect.arrayContaining([{ notes: [57, 60, 64], beats: 2, mode: 'block' }]))
    expect((ui.play.mock.calls[1][0] as { notes: number[] }[])[4].notes).toEqual([57])
    expect(ui.wait).toHaveBeenCalledWith(0.6)
    expect(ui.settings).toMatchObject({ instrument: 'guitar-acoustic', volume: 0.8 })
  })
  it('plays tonic buttons separately and honors disabled pre-scale references', async () => {
    ui.config = { ...ui.config!, rootBPc: 9, sameRoot: false, tonicReference: false }
    render()
    mountEffects()
    await button('Tonic B')()
    expect(ui.play.mock.calls[0][0]).toHaveLength(3)
    expect((ui.play.mock.calls[0][0] as { notes: number[] }[])[0].notes).toEqual([57])
    await button('Tonic A')()
    expect((ui.play.mock.calls[1][0] as { notes: number[] }[])[0].notes).toEqual([48])
    await button('Play B')()
    expect(ui.play.mock.calls[2][0]).toHaveLength(8)
    expect((ui.play.mock.calls[2][0] as { notes: number[] }[])[0].notes).toEqual([57])
  })
  it('cancels B when a config edit stops A while startup is pending', async () => {
    render()
    mountEffects()
    const pending = deferred()
    ui.play.mockReturnValueOnce(pending.promise)
    const playback = button('A then B')()
    choose('Scale B', 'dorian')
    pending.resolve()
    await playback
    expect(ui.play).toHaveBeenCalledOnce()
    expect(ui.wait).not.toHaveBeenCalled()
    expect(ui.config!.b).toBe('dorian')
  })
  it('cancels B during the gap and on navigation cleanup', async () => {
    render()
    const cleanups = mountEffects()
    const gap = deferred()
    ui.wait.mockReturnValueOnce(gap.promise)
    const playback = button('A then B')()
    await Promise.resolve()
    expect(ui.wait).toHaveBeenCalledOnce()
    cleanups[0]?.()
    gap.resolve()
    await playback
    expect(ui.play).toHaveBeenCalledOnce()
  })
  it('stops on instrument changes and never autoplays on a mount', () => {
    render()
    mountEffects()
    expect(ui.stop).toHaveBeenCalledOnce()
    expect(ui.play).not.toHaveBeenCalled()
    ui.settings.instrument = 'piano'
    render()
    ui.effects[1]()
    expect(ui.stop).toHaveBeenCalledTimes(2)
    expect(ui.play).not.toHaveBeenCalled()
  })
})
