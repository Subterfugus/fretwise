import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Tools, type ToolTab } from './Tools'
import type { DictView } from './keyDictionary'
import type { ToolLaunch } from './toolLaunch'
import { lessonToolActions } from '@/features/lessons/lessonTools'

const ui = vi.hoisted(() => ({
  requested: 'dictionary' as ToolTab | undefined,
  saved: 'explorer' as ToolTab,
  entry: undefined as DictView | undefined,
  selectTab: null as ((tab: ToolTab) => void) | null,
  seed: undefined as unknown
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: () => [ui.requested, (value: ToolTab | undefined) => { ui.requested = value }]
}))
vi.mock('@/audio/engine', () => ({ engine: { stop: vi.fn() } }))
vi.mock('./ui', () => ({
  usePref: () => [ui.saved, (value: ToolTab) => { ui.saved = value }],
  Seg: ({ onChange }: { onChange: (tab: ToolTab) => void }) => { ui.selectTab = onChange; return null }
}))
vi.mock('./DictionaryTab', () => ({ DictionaryTab: ({ entry }: { entry?: DictView }) => { ui.entry = entry; return null } }))
vi.mock('./ExplorerTab', () => ({ ExplorerTab: ({ initialConfig }: { initialConfig?: unknown }) => { ui.seed = initialConfig; return null } }))
vi.mock('./LooperTab', () => ({ LooperTab: ({ initialConfig }: { initialConfig?: unknown }) => { ui.seed = initialConfig; return null } }))
vi.mock('./MetronomeTab', () => ({ MetronomeTab: () => null }))
vi.mock('./TriadsTab', () => ({ TriadsTab: () => null }))
vi.mock('./NoteFinderTab', () => ({ NoteFinderTab: () => null }))
vi.mock('./ScaleComparisonTab', () => ({ ScaleComparisonTab: () => null }))
vi.mock('./ChordIdentifierTab', () => ({ ChordIdentifierTab: ({ initialInput }: { initialInput?: unknown }) => { ui.seed = initialInput; return null } }))
vi.mock('./VoiceLeadingTab', () => ({ VoiceLeadingTab: ({ initialConfig }: { initialConfig?: unknown }) => { ui.seed = initialConfig; return null } }))
vi.mock('./ReharmonisationTab', () => ({ ReharmonisationTab: ({ initialConfig }: { initialConfig?: unknown }) => { ui.seed = initialConfig; return null } }))

beforeEach(() => {
  ui.requested = 'dictionary'
  ui.saved = 'explorer'
  ui.entry = undefined
  ui.selectTab = null
  ui.seed = undefined
})

describe('lesson tool launch consumption', () => {
  it('groups all tools behind one named native switcher', () => {
    const html = renderToStaticMarkup(createElement(Tools, { onDictionaryEntry: () => {}, onToolLaunch: () => {} }))
    expect(html).toContain('aria-label="Choose tool: Chord &amp; scale dictionary"')
    expect(html).toContain('tools-switcher-heading">Explore')
    expect(html).toContain('tools-switcher-heading">Harmony')
    expect(html).toContain('tools-switcher-heading">Practise')
    expect(html).not.toContain('<details open')
  })
  const launches: ToolLaunch[] = [
    ...lessonToolActions({ kind: 'progression', root: 'D', romans: ['ii7', 'V7', 'Imaj7'], scale: 'major' }, 'guitar-acoustic').map((a) => a.launch),
    ...lessonToolActions({ kind: 'chord', root: 'C', type: 'maj' }, 'guitar-acoustic').map((a) => a.launch)
  ]
  it.each(launches)('applies $tab launch once without replaying it after manual tool navigation', (launch) => {
    ui.requested = launch.tab
    const render = () => renderToStaticMarkup(createElement(Tools, { launch, onDictionaryEntry: () => {}, onToolLaunch: () => {} }))
    render()
    if (launch.tab === 'dictionary') expect(ui.entry).toEqual(launch.entry)
    else expect(ui.seed).toEqual(launch.tab === 'identifier' ? launch.input : launch.config)
    ui.selectTab!('metronome')
    render()
    ui.selectTab!(launch.tab)
    render()
    if (launch.tab === 'dictionary') expect(ui.entry).toBeUndefined()
    else expect(ui.seed).toBeUndefined()
  })
  it('keeps the lesson return link through tool switches', () => {
    ui.requested = 'explorer'
    const render = () => renderToStaticMarkup(createElement(Tools, { lessonOrigin: { lessonId: 'u5l5', from: 'library', blockIndex: 2 }, onReturnToLesson: () => {}, onDictionaryEntry: () => {}, onToolLaunch: () => {} }))
    expect(render()).toContain('Back to Inversions and small triad shapes')
    ui.selectTab!('metronome')
    expect(render()).toContain('Back to Inversions and small triad shapes')
  })
})

describe('identifier dictionary navigation', () => {
  it('applies the initial deep link without replaying it after switching tools', () => {
    const entry: DictView = { kind: 'chord', root: 'C', type: 'maj' }
    const render = () => renderToStaticMarkup(createElement(Tools, { initialTab: 'dictionary', dictionaryEntry: entry, onDictionaryEntry: () => {}, onToolLaunch: () => {} }))
    render()
    expect(ui.entry).toEqual(entry)
    ui.selectTab!('metronome')
    render()
    ui.selectTab!('dictionary')
    render()
    expect(ui.entry).toBeUndefined()
  })
  it('does not reapply the original link when the current dictionary tab is selected again', () => {
    const entry: DictView = { kind: 'chord', root: 'A', type: 'min7' }
    const render = () => renderToStaticMarkup(createElement(Tools, { initialTab: 'dictionary', dictionaryEntry: entry, onDictionaryEntry: () => {}, onToolLaunch: () => {} }))
    render()
    ui.selectTab!('dictionary')
    render()
    expect(ui.entry).toBeUndefined()
  })
})
