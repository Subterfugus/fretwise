import type { Block, Unit } from '@/content/types'
import { unitLabel } from '@/content/curriculum'
import { resolveLessonTokens } from './lessonLinks'

export interface LessonEntry {
  id: string
  title: string
  summary: string
  unitId: string
  unitNumber: number
  /** "Unit 3" or "Elective" */
  unitLabel: string
  /** Position of the unit along the curriculum path (sort key). */
  unitOrder: number
  unitTitle: string
  lessonNumber: number
  passages: string[]
  titleText: string
  summaryText: string
  unitText: string
  bodyText: string
}

export interface LibraryState {
  query: string
  unitId: string
  status: 'all' | 'completed' | 'incomplete'
  savedOnly: boolean
}
export const DEFAULT_LIBRARY: LibraryState = { query: '', unitId: '', status: 'all', savedOnly: false }

export const plainText = (text: string): string => text.replace(/[*`]/g, '').replace(/^\s*#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim()
const fold = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u266f/g, '#').replace(/\u266d/g, 'b').replace(/[^a-z0-9#]/g, ' ')
export const normalizeSearch = (text: string) => fold(text).replace(/\s+/g, ' ').trim()
export const searchTerms = (query: string) => [...new Set(normalizeSearch(query.slice(0, 240)).split(' ').filter(Boolean))].slice(0, 16)

function blockText(block: Block): string[] {
  switch (block.type) {
    case 'text': case 'tip': return [resolveLessonTokens(block.md)]
    case 'table': return [block.caption ?? '', ...block.headers, ...block.rows.map((r) => r.join(' '))]
    case 'audio': return [block.label]
    case 'audioRow': return block.items.map((x) => x.label)
    case 'chords': return [block.caption ?? '', ...block.shapes.map((s) => s.name)]
    case 'fretboard': case 'tab': case 'staff': return [block.caption ?? '']
    case 'playIt': return [block.prompt, block.hint ?? '']
    // Index the prompt, never hidden answers or answer explanations.
    case 'tryIt': return [block.question.prompt, ...(block.question.visual ? blockText(block.question.visual) : [])]
    case 'circleOfFifths': return ['Circle of fifths']
  }
}

export function buildLessonIndex(units: Unit[]): LessonEntry[] {
  return units.flatMap((unit, unitOrder) => unit.lessons.map((lesson, index) => {
    const passages = lesson.blocks.flatMap(blockText).map(plainText).filter(Boolean)
    return {
      id: lesson.id, title: lesson.title, summary: lesson.summary ?? '', unitId: unit.id,
      unitNumber: unit.number, unitLabel: unitLabel(unit), unitOrder, unitTitle: unit.title, lessonNumber: index + 1, passages,
      titleText: normalizeSearch(lesson.title), summaryText: normalizeSearch(lesson.summary ?? ''),
      unitText: normalizeSearch(`${unitLabel(unit)} ${unit.title}`), bodyText: normalizeSearch(passages.join(' '))
    }
  }))
}

export interface LessonResult { entry: LessonEntry; snippet: string; score: number }

export function searchLessons(index: LessonEntry[], state: LibraryState, done: Record<string, number>, bookmarks: string[]): LessonResult[] {
  const terms = searchTerms(state.query)
  const phrase = normalizeSearch(state.query)
  const saved = new Set(bookmarks)
  return index.flatMap((entry) => {
    if (state.unitId && state.unitId !== entry.unitId || state.savedOnly && !saved.has(entry.id)) return []
    if (state.status === 'completed' && !done[entry.id] || state.status === 'incomplete' && done[entry.id]) return []
    const all = `${entry.titleText} ${entry.summaryText} ${entry.unitText} ${entry.bodyText}`
    if (!terms.every((term) => all.includes(term))) return []
    const score = terms.reduce((n, term) => n + (entry.titleText.includes(term) ? 30 : 0) +
      (entry.summaryText.includes(term) ? 10 : 0) + (entry.unitText.includes(term) ? 3 : 0), 0) +
      (phrase && entry.titleText === phrase ? 100 : phrase && entry.titleText.includes(phrase) ? 50 : 0)
    const passage = terms.length ? [...entry.passages].sort((a, b) =>
      terms.filter((t) => normalizeSearch(b).includes(t)).length - terms.filter((t) => normalizeSearch(a).includes(t)).length)[0] : undefined
    const source = passage && terms.some((t) => normalizeSearch(passage).includes(t)) ? passage : plainText(entry.summary || entry.passages[0] || '')
    const first = highlightMatches(source, state.query).find((p) => p.match)
    const offset = first ? Math.max(0, source.indexOf(first.text) - 45) : 0
    const start = offset ? source.indexOf(' ', offset) + 1 || offset : 0
    const end = Math.min(source.length, start + 220)
    const snippet = (start ? '... ' : '') + source.slice(start, end).trim() + (end < source.length ? '...' : '')
    return [{ entry, snippet, score }]
  }).sort((a, b) => b.score - a.score ||
    (state.savedOnly && !terms.length ? bookmarks.indexOf(a.entry.id) - bookmarks.indexOf(b.entry.id) : 0) ||
    a.entry.unitOrder - b.entry.unitOrder || a.entry.lessonNumber - b.entry.lessonNumber)
}

/** Map normalized matches back to display text, including Unicode accidentals. */
export function highlightMatches(text: string, query: string): { text: string; match: boolean }[] {
  const offsets: number[] = []
  let normalized = ''
  for (let i = 0; i < text.length; i++) {
    const part = fold(text[i])
    normalized += part
    for (let j = 0; j < part.length; j++) offsets.push(i)
  }
  const hits = new Set<number>()
  for (const term of searchTerms(query)) {
    let start = normalized.indexOf(term)
    while (start >= 0) {
      for (let i = offsets[start]; i <= offsets[start + term.length - 1]; i++) hits.add(i)
      start = normalized.indexOf(term, start + term.length)
    }
  }
  const parts: { text: string; match: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const match = hits.has(i)
    if (parts.length && parts.at(-1)!.match === match) parts.at(-1)!.text += text[i]
    else parts.push({ text: text[i], match })
  }
  return parts
}
