import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Field, NumberInput, Seg } from './ui'

vi.mock('@/audio/engine', () => ({ engine: {} }))

describe('segmented choices', () => {
  it('names the semantic group and exposes the selected choice', () => {
    const html = renderToStaticMarkup(createElement(Seg, {
      label: 'Time signature', value: '4/4', onChange: () => undefined,
      options: [{ id: '4/4', label: '4/4' }, { id: '3/4', label: '3/4', disabled: true }]
    }))
    expect(html).toContain('role="group" aria-label="Time signature"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('disabled=""')
  })
})

describe('tool field labels', () => {
  const renderField = (children: Parameters<typeof Field>[0]['children']) =>
    renderToStaticMarkup(createElement(Field, { label: 'Labels', children }))

  it('keeps implicit labels on native inputs, selects and textareas', () => {
    for (const tag of ['input', 'select', 'textarea']) {
      const html = renderField(createElement(tag))
      expect(html).toMatch(/^<label class="tools-field">/)
      expect(html).toContain('<span class="muted">Labels</span>')
      expect(html).toContain('</label>')
    }
  })
  it('keeps the numeric draft input associated with its visible field label', () => {
    const html = renderField(createElement(NumberInput, { value: 100, min: 60, max: 180, onChange: () => undefined }))
    expect(html).toMatch(/^<label class="tools-field">/)
    expect(html).toContain('type="number"')
    expect(html).toContain('value="100"')
  })
  it('does not implicitly label the first button inside a segmented group', () => {
    const html = renderField(createElement(Seg, {
      label: 'Identifier labels', value: 'note', onChange: () => undefined,
      options: [{ id: 'note', label: 'Notes' }, { id: 'degree', label: 'Degrees' }]
    }))
    expect(html).toMatch(/^<div class="tools-field">/)
    expect(html).not.toContain('<label')
    expect(html).toContain('role="group" aria-label="Identifier labels"')
    expect(html).toContain('>Notes</button>')
  })
  it('uses a neutral wrapper for static content, custom controls and hidden inputs', () => {
    const CustomPicker = () => createElement('div', { role: 'group', 'aria-label': 'Root note' }, createElement('button', null, 'C'))
    for (const child of [createElement('span', null, 'Available scales'), createElement(CustomPicker), createElement('input', { type: 'hidden' })]) {
      const html = renderField(child)
      expect(html).toMatch(/^<div class="tools-field">/)
      expect(html).not.toContain('<label')
    }
  })
})
