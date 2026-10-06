import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Block } from '@/content/types'
import { LessonToolActions } from './LessonToolActions'
import type { ToolLaunch } from '@/features/tools/toolLaunch'

const ui = vi.hoisted(() => ({ index: 0, buttons: [] as { children: unknown; onClick: () => void }[] }))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useState: () => [ui.index, (n: number) => { ui.index = n }] }))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: { instrument: 'guitar-nylon' } }) }))
beforeEach(() => { ui.index = 0; ui.buttons = [] })
const progression: Block = { type: 'text', md: 'Cadence', toolExamples: [{ kind: 'progression', root: 'F', romans: ['ii7', 'V7', 'Imaj7'], scale: 'major' }] }
function render(block: Block, onOpen: (launch: ToolLaunch) => void) {
  function Capture() {
    const element = LessonToolActions({ block, onOpen })
    const visit = (node: ReactNode) => {
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (!isValidElement<{ children: ReactNode; onClick?: () => void }>(node)) return
      if (node.type === 'button' && node.props.onClick) ui.buttons.push({ children: node.props.children, onClick: node.props.onClick })
      visit(node.props.children)
    }
    visit(element)
    return element
  }
  return renderToStaticMarkup(createElement(Capture))
}

describe('lesson launch controls', () => {
  it('renders named keyboard-accessible commands and passes complete context on click without autoplay', () => {
    const onOpen = vi.fn<(launch: ToolLaunch) => void>()
    const html = render(progression, onOpen)
    expect(html).toContain('Loop this')
    expect(html).toContain('See the voice leading')
    expect(html).toContain('Explore this scale')
    expect(html).toContain('Reharmonise this')
    expect(html).toContain('aria-label="Open lesson example in a tool"')
    expect(onOpen).not.toHaveBeenCalled()
    ui.buttons[0].onClick()
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ tab: 'looper', config: expect.objectContaining({ keyPc: 5, keyMinor: false, romans: ['ii7', 'V7', 'Imaj7'], instrument: 'guitar-nylon', targetOn: true }) }))
    ui.buttons[1].onClick()
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'voiceLeading' }))
    ui.buttons[3].onClick()
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'reharmonisation', config: expect.objectContaining({ keyPc: 5, minor: false, original: { romans: ['ii7', 'V7', 'Imaj7'], durations: [4, 4, 4] } }) }))
  })
  it('uses an associated example selector and loads the selected modulation section', () => {
    ui.index = 1
    const onOpen = vi.fn()
    const block: Block = { ...progression, toolExamples: [progression.toolExamples![0], { kind: 'progression', root: 'G', romans: ['I', 'V'], scale: 'major', label: 'G section' }] }
    const html = render(block, onOpen)
    expect(html).toContain('<select')
    expect(html).toContain('for=')
    expect(html).toContain('G section')
    ui.buttons[0].onClick()
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ keyPc: 7, romans: ['I', 'V'] }) }))
  })
  it('does not add controls to unrelated prose or quiz content', () => {
    expect(render({ type: 'text', md: 'C major' }, vi.fn())).toBe('')
    expect(ui.buttons).toHaveLength(0)
  })
})
