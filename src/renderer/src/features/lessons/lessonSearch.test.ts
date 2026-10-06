import { describe, expect, it } from 'vitest'
import type { Unit } from '@/content/types'
import { UNITS } from '@/content/units'
import { buildLessonIndex, DEFAULT_LIBRARY, highlightMatches, normalizeSearch, searchLessons } from './lessonSearch'

const units: Unit[] = [
  { id: 'u1', number: 1, title: 'Guitar basics', summary: '', quiz: { fixed: [] }, lessons: [
    { id: 'u1l1', title: 'The neck', summary: 'Get started', blocks: [{ type: 'text', md: '### Major scales\nThe **pentatonic** scale appears on this neck.' }] },
    { id: 'u1l2', title: 'Major scales', summary: 'Build a scale', blocks: [{ type: 'text', md: 'C major has seven notes.' }] },
    { id: 'u1l3', title: 'The open strings', blocks: [{ type: 'tryIt', question: { kind: 'text', prompt: 'Name this string', accept: ['SecretAnswer'], explain: 'HiddenExplanation' } },
      { type: 'table', headers: ['Note', 'Role'], rows: [['B\u266d', 'Flat seventh']] }, { type: 'playIt', prompt: 'Play a perfect fifth', targets: ['HiddenTarget'], hint: 'Use two strings' }] }
  ] },
  { id: 'u2', number: 2, title: 'Rhythm', summary: '', quiz: { fixed: [] }, lessons: [
    { id: 'u2l1', title: 'Triplets', blocks: [{ type: 'audioRow', items: [{ label: 'Swing rhythm', play: { kind: 'rhythm', pattern: [1] } }] }] }
  ] }
]
const index = buildLessonIndex(units)
const search = (query: string, extra = {}) => searchLessons(index, { ...DEFAULT_LIBRARY, query, ...extra }, { u1l1: 123 }, ['u2l1', 'u1l1'])

describe('lesson search', () => {
  it('lists every lesson in curriculum order without a query', () => {
    expect(search('').map((r) => r.entry.id)).toEqual(['u1l1', 'u1l2', 'u1l3', 'u2l1'])
  })
  it('ranks exact and partial title matches above body matches', () => {
    expect(search('MAJOR scales').map((r) => r.entry.id)).toEqual(['u1l2', 'u1l1'])
    expect(search('major')[0].entry.id).toBe('u1l2')
  })
  it('requires all query terms but permits them in different searchable fields', () => {
    expect(search('guitar pentatonic').map((r) => r.entry.id)).toEqual(['u1l1'])
    expect(search('major triplets')).toEqual([])
  })
  it('searches lesson prose, table values, audio labels and play prompts', () => {
    expect(search('pentatonic')[0].snippet).toContain('pentatonic')
    expect(search('flat seventh')[0].entry.id).toBe('u1l3')
    expect(search('swing')[0].entry.id).toBe('u2l1')
    expect(search('perfect fifth')[0].entry.id).toBe('u1l3')
  })
  it('never indexes hidden quiz answers, explanations or mic targets', () => {
    expect(search('Name this string')).toHaveLength(1)
    for (const query of ['SecretAnswer', 'HiddenExplanation', 'HiddenTarget']) expect(search(query)).toEqual([])
  })
  it('normalizes accidentals, diacritics, case and whitespace', () => {
    expect(normalizeSearch('  B\u266d  C\u266f Caf\u00e9 ')).toBe('bb c# cafe')
    expect(search('Bb')[0].entry.id).toBe('u1l3')
  })
  it('combines unit, completion and bookmark filters', () => {
    expect(search('', { status: 'completed' }).map((r) => r.entry.id)).toEqual(['u1l1'])
    expect(search('', { unitId: 'u1', status: 'incomplete', savedOnly: true })).toEqual([])
    expect(search('swing', { savedOnly: true, unitId: 'u2' })).toHaveLength(1)
  })
  it('orders bookmarks newest first when there is no search and ignores retired IDs', () => {
    expect(search('', { savedOnly: true }).map((r) => r.entry.id)).toEqual(['u2l1', 'u1l1'])
    expect(searchLessons(index, { ...DEFAULT_LIBRARY, savedOnly: true }, {}, ['u99l1'])).toEqual([])
  })
  it('highlights normalized and overlapping matches without inserting markup', () => {
    const parts = highlightMatches('B\u266d major <script>', 'Bb maj major')
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['B\u266d', 'major'])
    expect(parts.map((p) => p.text).join('')).toBe('B\u266d major <script>')
    expect(highlightMatches('hello', '[]')).toEqual([{ text: 'hello', match: false }])
  })
  it('bounds snippets and exposes a relevant passage near a distant match', () => {
    const long = buildLessonIndex([{ ...units[0], lessons: [{ id: 'u1l1', title: 'Test', blocks: [{ type: 'text', md: 'Intro '.repeat(100) + 'distantTarget ' + 'tail '.repeat(100) }] }] }])
    const result = searchLessons(long, { ...DEFAULT_LIBRARY, query: 'distantTarget' }, {}, [])[0]
    expect(result.snippet).toContain('distantTarget')
    expect(result.snippet.length).toBeLessThanOrEqual(227)
  })
  it('handles empty, punctuation-only and excessive queries safely', () => {
    expect(search('[].*')).toHaveLength(4)
    expect(() => search('a'.repeat(10000))).not.toThrow()
  })
  it('indexes the entire real curriculum and finds important topics', () => {
    const real = buildLessonIndex(UNITS)
    expect(real).toHaveLength(UNITS.reduce((n, u) => n + u.lessons.length, 0))
    for (const query of ['secondary dominants', 'CAGED', 'pentatonic', 'syncopation']) {
      expect(searchLessons(real, { ...DEFAULT_LIBRARY, query }, {}, []).length).toBeGreaterThan(0)
    }
  })
})
