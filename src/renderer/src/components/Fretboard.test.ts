import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Fretboard } from './Fretboard'
import { RootPicker } from '@/features/tools/ui'

vi.mock('@/audio/engine', () => ({ engine: {} }))
vi.mock('@/state/progress', () => ({ useProgress: () => ({ settings: { leftHanded: true, noteNames: 'auto' } }) }))

describe('comparison tonic accessibility', () => {
  it('caps short boards and gives long boards enough intrinsic width for readable notes', () => {
    const short = renderToStaticMarkup(createElement(Fretboard, { frets: [0, 5] }))
    const long = renderToStaticMarkup(createElement(Fretboard, { frets: [0, 22] }))
    expect(short).toContain('max-height:240px')
    expect(long).toContain('max-height:240px')
    const width = (html: string) => Number(/min-width:(\d+)px/.exec(html)?.[1])
    expect(width(short)).toBeGreaterThanOrEqual(360)
    expect(width(long)).toBeGreaterThanOrEqual(1040)
    expect(long).toContain('scaleX(-1)')
  })
  it('renders independent tonic outlines and names without changing membership colours', () => {
    const html = renderToStaticMarkup(createElement(Fretboard, { frets: [0, 5], marks: [
      { string: 2, fret: 1, label: 'C', color: 'tone', comparisonTonic: 'a' },
      { string: 1, fret: 5, label: 'A', color: 'tone', comparisonTonic: 'b' }
    ] }))
    expect(html).toContain('fb-mark tone  tonic-a')
    expect(html).toContain('fb-mark tone  tonic-b')
    expect(html.match(/class="fb-comparison-tonic-ring"/g)).toHaveLength(2)
    expect(html).toContain('String 2, fret 1, tonic A')
    expect(html).toContain('String 1, fret 5, tonic B')
    expect(html).toContain('scaleX(-1)')
  })
  it('announces coincident tonics and leaves ordinary fretboards untouched', () => {
    const shared = renderToStaticMarkup(createElement(Fretboard, { frets: [0, 5], marks: [{ string: 2, fret: 1, label: 'C', comparisonTonic: 'both' }] }))
    expect(shared).toContain('tonic A and B')
    expect(shared).toContain('tonic-both')
    const ordinary = renderToStaticMarkup(createElement(Fretboard, { frets: [0, 5], marks: [{ string: 2, fret: 1, label: 'C' }] }))
    expect(ordinary).not.toContain('tonic-')
    expect(ordinary).not.toContain('fb-comparison-tonic-ring')
  })
  it('names root groups independently and exposes each selected pitch class', () => {
    const a = renderToStaticMarkup(createElement(RootPicker, { pc: 0, label: 'Root A', onChange: () => undefined }))
    const b = renderToStaticMarkup(createElement(RootPicker, { pc: 9, label: 'Root B', minor: true, onChange: () => undefined }))
    expect(a).toContain('aria-label="Root A"')
    expect(b).toContain('aria-label="Root B"')
    expect(a.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(b.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
})
