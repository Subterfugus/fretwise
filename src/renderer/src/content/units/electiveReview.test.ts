import { afterEach, describe, expect, it, vi } from 'vitest'
import u13 from './u13-arpeggios'
import u14 from './u14-rhythm-ii'
import u15 from './u15-tunings-capo'
import u16 from './u16-thirds-sixths'
import u17 from './u17-song-form'
import type { Block, QuizQuestion, Unit } from '../types'

const units = [u13, u14, u15, u16, u17]
const standard = [64, 59, 55, 50, 45, 40]
const pitch = (p: { string: number; fret: number }) => standard[p.string - 1] + p.fret
const blocks = (u: Unit) => u.lessons.flatMap((l) => l.blocks)
const questions = (u: Unit): QuizQuestion[] => [
  ...u.quiz.fixed,
  ...blocks(u).flatMap((b) => b.type === 'tryIt' ? [b.question] : [])
]

function seededRandom() {
  let seed = 7619
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  })
}

afterEach(() => vi.restoreAllMocks())

describe('elective review corrections', () => {
  it('does not tie instructional text to theme-specific colours', () => {
    const textKeys = new Set(['md', 'prompt', 'explain', 'caption', 'label'])
    const inspect = (value: unknown, key = '') => {
      if (typeof value === 'string' && textKeys.has(key)) {
        expect(value).not.toMatch(/\b(red|orange|white|purple|yellow|amber)\b/i)
        expect(value).not.toMatch(/\bblue\b(?! note| Rondo)/i)
      } else if (Array.isArray(value)) value.forEach((v) => inspect(v, key))
      else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => inspect(v, k))
    }
    units.forEach((u) => inspect(u))
  })

  it('covers all pitches of the C-major tenths diagram', () => {
    const board = blocks(u16).find((b): b is Extract<Block, { type: 'fretboard' }> =>
      b.type === 'fretboard' && b.caption?.startsWith('C major in 10ths:') === true)!
    expect(board.frets).toEqual([0, 16])
    const expectedLow = [48, 50, 52, 53, 55, 57, 59, 60]
    const expectedHigh = [64, 65, 67, 69, 71, 72, 74, 76]
    expect(board.marks.filter((p) => p.string === 5).map(pitch)).toEqual(expectedLow)
    expect(board.marks.filter((p) => p.string === 1).map(pitch)).toEqual(expectedHigh)
    for (const p of board.marks) expect(p.fret).toBeLessThanOrEqual(board.frets![1])
  })

  it('bounds arpeggio answers to their stated shape and string', () => {
    const q = questions(u13).find((q) => q.kind === 'fretboard' && q.prompt.includes('A shape'))!
    expect(q.prompt).toContain('2nd (B) string')
    if (q.kind === 'fretboard') {
      expect(q.targets).toEqual([{ string: 2, fret: 5 }])
      expect(pitch(q.targets[0])).toBe(64)
    }
    const third = u13.quiz.fixed.find((q) => q.prompt.includes('5th or 3rd string'))!
    if (third.kind !== 'fretboard') throw new Error('Expected fretboard question')
    expect(third.targets.map(pitch)).toEqual([47, 59])
    const seventh = u13.quiz.fixed.find((q) => q.prompt.includes('4th or 2nd string'))!
    if (seventh.kind !== 'fretboard') throw new Error('Expected fretboard question')
    expect(seventh.targets.map(pitch)).toEqual([55, 67])
    const forms = blocks(u13).find((b): b is Extract<Block, { type: 'chords' }> => b.type === 'chords' && b.caption?.startsWith('C major in the five shapes') === true)!
    expect(Math.max(...forms.shapes.flatMap((s) => s.frets.filter((f): f is number => f !== null)))).toBe(13)
    expect(forms.caption).toContain('13th fret')
    const text = blocks(u13).filter((b) => b.type === 'text').map((b) => b.md).join(' ')
    expect(text).toContain('down-up-down, **up**-down-up, down-up-down')
    expect(text).toContain('seventh arpeggio shapes shown earlier do not have three notes on a string')
    expect(blocks(u16).filter((b) => b.type === 'text').map((b) => b.md).join(' ')).toContain('degree 7 (B–D)')
  })

  it('states the exact interval and open-string target instead of its octave', () => {
    seededRandom()
    let openTargets = 0
    for (let i = 0; i < 600; i++) {
      const q = u16.quiz.generators![2]()
      expect(q.kind).toBe('fretboard')
      if (q.kind !== 'fretboard') continue
      const low = pitch(q.marks![0])
      const expected = q.prompt.includes('diatonic 3rd') ? [3, 4] : [8, 9]
      expect(expected, q.prompt).toContain(pitch(q.targets[0]) - low)
      expect(q.prompt).toContain('directly above this pitch')
      expect(q.prompt).toContain(`fret ${q.marks![0].fret}`)
      if (q.targets[0].fret === 0) {
        openTargets++
        expect(q.prompt).toContain('using the open string')
        expect(q.targets).toHaveLength(1)
        expect(expected).not.toContain(pitch({ ...q.targets[0], fret: 12 }) - low)
      }
    }
    expect(openTargets).toBeGreaterThan(0)
  })

  it('uses A, C and E for the Am triplet arpeggio', () => {
    const tab = blocks(u14).find((b): b is Extract<Block, { type: 'tab' }> =>
      b.type === 'tab' && b.caption?.startsWith('A triplet arpeggio on Am:') === true)!
    expect(tab.events.map((e) => e.pos.map(pitch))).toEqual(Array.from({ length: 4 }, () => [[45], [48], [52]]).flat())
    expect(tab.events.reduce((sum, e) => sum + (e.beats ?? 1), 0)).toBeCloseTo(4)
    const countQuestion = u14.quiz.fixed.find((q) => q.prompt.includes('rings across the missed downstroke'))!
    expect(countQuestion.kind).toBe('mc')
    if (countQuestion.kind === 'mc') expect(countQuestion.choices[countQuestion.answer]).toBe('2&')
    expect(countQuestion.prompt).not.toContain('second upstroke')
    const tab12 = blocks(u14).find((b) => b.type === 'tab' && b.caption?.startsWith('One bar of 12/8:'))!
    expect(tab12.type).toBe('tab')
    if (tab12.type === 'tab') {
      expect(tab12.caption).toContain('strings 3 and 2')
      for (let i = 0; i < tab12.events.length; i += 3) {
        expect(tab12.events[i + 1].pos[0].string).toBe(3)
        expect(tab12.events[i + 2].pos[0].string).toBe(2)
      }
    }
  })

  it('does not reveal the full tuning in open-string questions', () => {
    seededRandom()
    const tunings: Record<string, number[]> = {
      'Drop D': [64, 59, 55, 50, 45, 38], DADGAD: [62, 57, 55, 50, 45, 38],
      'Open G': [62, 59, 55, 50, 43, 38], 'Open D': [62, 57, 54, 50, 45, 38],
      'Open E': [64, 59, 56, 52, 47, 40], 'Double drop D': [62, 59, 55, 50, 45, 38],
      'Half step down': [63, 58, 54, 49, 44, 39], 'Whole step down': [62, 57, 53, 48, 43, 38]
    }
    const pcs: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
    const seen = new Set<string>()
    for (let i = 0; i < 350; i++) {
      const q = u15.quiz.generators![2]()
      if (q.kind !== 'mc') throw new Error('Expected multiple choice')
      const named = /in \*\*(.+)\*\* tuning\. What is the open \*\*(\d)/.exec(q.prompt)
      if (!named) continue
      seen.add(named[1])
      expect(q.prompt).not.toContain('low to high')
      const name = q.choices[q.answer]
      const actual = (pcs[name[0]] + [...name.slice(1)].reduce((n, a) => n + (a === '#' ? 1 : -1), 0) + 12) % 12
      expect(actual).toBe(tunings[named[1]][Number(named[2]) - 1] % 12)
    }
    expect([...seen].sort()).toEqual(Object.keys(tunings).sort())
  })

  it('uses two pre-chorus strums per bar and spells borrowed chord labels', () => {
    const intro = u17.lessons[0].blocks
    const row = intro.find((b): b is Extract<Block, { type: 'audioRow' }> =>
      b.type === 'audioRow' && b.items.some((item) => item.label.startsWith('Pre-chorus:')))!
    const pre = row.items.find((item) => item.label.startsWith('Pre-chorus:'))!.play
    expect(pre.kind).toBe('sequence')
    if (pre.kind === 'sequence') {
      expect(pre.events).toHaveLength(8)
      expect(pre.events.every((e) => e.beats === 2 && e.mode === 'strum')).toBe(true)
    }
    expect(intro.filter((b) => b.type === 'text').map((b) => b.md).join(' ')).toContain('pre-chorus strums twice per bar')
    const borrowed = blocks(u17).find((b): b is Extract<Block, { type: 'chords' }> =>
      b.type === 'chords' && b.caption?.startsWith('G, F (') === true)!
    expect(borrowed.shapes.at(-1)!.name).toBe('E♭')
    const table = blocks(u17).find((b) => b.type === 'table' && b.headers[0] === 'Borrowed chord')!
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.rows.find((r) => r[1] === 'iv')!.slice(2, 4)).toEqual(['Cm', 'Fm'])
      expect(table.caption).toContain('lowers its 3rd')
      expect(table.caption).not.toContain('root is not')
    }
  })

  it('describes the actual bar-3 variation and phrase endings', () => {
    const staves = u17.lessons[5].blocks.filter((b): b is Extract<Block, { type: 'staff' }> => b.type === 'staff')
    const first = staves.find((b) => b.caption?.startsWith('Phrase 1'))!
    const second = staves.find((b) => b.caption?.startsWith('Phrase 2'))!
    const durations: Record<string, number> = { q: 1, h: 2, '8': 0.5, qr: 1 }
    const bar = (staff: typeof first, index: number) => {
      let at = 0
      return staff.notes.filter((n) => {
        const start = at
        at += durations[n.duration]
        return start >= index * 4 && start < (index + 1) * 4
      })
    }
    expect(bar(first, 2).map((n) => [n.keys[0], n.duration])).toEqual([['G/4', 'q'], ['B/4', 'q'], ['D/5', 'h']])
    expect(bar(second, 2).map((n) => [n.keys[0], n.duration])).toEqual([['G/4', 'q'], ['B/4', 'q'], ['D/5', 'q'], ['B/4', 'q']])
    expect(bar(first, 3).at(-2)!.keys).toEqual(['D/4'])
    expect(bar(first, 3).at(-1)!.duration).toBe('qr')
    expect(bar(second, 3).at(-1)!.keys).toEqual(['A/4'])
    expect(second.caption).toContain('D is shortened and followed by B')
  })

  it('avoids a persistent longest-answer cue in rhythm, harmony and form quizzes', () => {
    for (const u of [u14, u16, u17]) {
      const qs = questions(u).filter((q): q is Extract<QuizQuestion, { kind: 'mc' }> => q.kind === 'mc')
      const uniqueLongest = qs.filter((q) => q.choices[q.answer].length > Math.max(...q.choices.filter((_, i) => i !== q.answer).map((c) => c.length)))
      expect(uniqueLongest.length / qs.length, u.id).toBeLessThan(0.4)
      for (const q of qs) {
        const maxWrong = Math.max(...q.choices.filter((_, i) => i !== q.answer).map((c) => c.length))
        expect(q.choices[q.answer].length - maxWrong, q.prompt).toBeLessThanOrEqual(10)
      }
    }
  })
})
