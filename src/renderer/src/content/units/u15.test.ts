// Independent checks of Unit 15 (alternate tunings and capo): every tuned note, fret and generated answer
// is recomputed here from plain MIDI numbers, not from the helpers the unit uses.
import { describe, expect, it } from 'vitest'
import unit from './u15-tunings-capo'
import { buildQuiz, grade } from '../grading'
import type { Block, QuizQuestion } from '../types'
import { shapeMidisIn } from '@/theory/guitar'

const mod = (n: number, m: number) => ((n % m) + m) % m
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const pcOf = (name: string): number => {
  let pc = NOTE_PC[name[0]]
  for (const ch of name.slice(1)) pc += ch === '#' ? 1 : -1
  return mod(pc, 12)
}
const LABEL_PCS = (label: string): number[] => label.split('/').map((n) => pcOf(n.replace(/m$/, '')))

// Hand-written open strings (MIDI, string 1 first): E4 B3 G3 D3 A2 E2 ...
const STD = [64, 59, 55, 50, 45, 40]
const DROPD = [64, 59, 55, 50, 45, 38]
const DADGAD = [62, 57, 55, 50, 45, 38]
const OPENG = [62, 59, 55, 50, 43, 38]
const OPEND = [62, 57, 54, 50, 45, 38]
const HALF = [63, 58, 54, 49, 44, 39]

const allBlocks = unit.lessons.flatMap((l) => l.blocks)
const fretboards = allBlocks.filter((b): b is Extract<Block, { type: 'fretboard' }> => b.type === 'fretboard')

describe('unit 15 structure', () => {
  it('is an elective after unit 5 with 5-6 lessons', () => {
    expect(unit.id).toBe('u15')
    expect(unit.number).toBe(15)
    expect(unit.elective).toBe(true)
    expect(unit.requires).toEqual(['u5'])
    expect(unit.lessons.length).toBeGreaterThanOrEqual(5)
    expect(unit.lessons.length).toBeLessThanOrEqual(6)
  })
  it('every lesson has text, a try-it, sound and several visual blocks', () => {
    for (const l of unit.lessons) {
      const types = l.blocks.map((b) => b.type)
      expect(types.filter((t) => t === 'text').length, l.id).toBeGreaterThanOrEqual(2)
      expect(types, l.id).toContain('tryIt')
      expect(types.some((t) => ['audio', 'audioRow', 'tab', 'playIt'].includes(t)), l.id + ' sound').toBe(true)
      expect(types.filter((t) => ['fretboard', 'chords', 'tab'].includes(t)).length, l.id).toBeGreaterThanOrEqual(2)
    }
  })
  it('has a 12-question quiz with at least 14 fixed questions and 4-6 generators', () => {
    expect(unit.quiz.count).toBeGreaterThanOrEqual(10)
    expect(unit.quiz.count).toBeLessThanOrEqual(12)
    expect(unit.quiz.fixed.length).toBeGreaterThanOrEqual(14)
    expect(unit.quiz.generators!.length).toBeGreaterThanOrEqual(4)
    expect(unit.quiz.generators!.length).toBeLessThanOrEqual(6)
  })
})

describe('unit 15 tuned fretboards', () => {
  it('every note-name label matches the pitch the position really plays', () => {
    let checked = 0
    for (const b of fretboards) {
      const tuning = b.tuning ?? STD
      for (const mk of b.marks) {
        if (!mk.label || !/^[A-G][#b]?$/.test(mk.label)) continue
        expect(mod(tuning[mk.string - 1] + mk.fret, 12), `${b.caption} string ${mk.string} fret ${mk.fret}`).toBe(pcOf(mk.label))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('has tuned boards in each non-standard tuning used', () => {
    const tunings = new Set(fretboards.map((b) => JSON.stringify(b.tuning ?? STD)))
    for (const t of [DROPD, DADGAD, OPENG, OPEND, HALF]) expect(tunings.has(JSON.stringify(t))).toBe(true)
  })

  it('degree labels are relative to the right root', () => {
    const open = (tuning: number[], root: number) => tuning.map((m) => mod(m - root, 12))
    // DADGAD relative to D: R 5 R 4 5 R (string 6 -> 1)
    expect(open(DADGAD, 2).reverse()).toEqual([0, 7, 0, 5, 7, 0])
    // Open G relative to G: 5 R 5 R 3 5
    expect(open(OPENG, 7).reverse()).toEqual([7, 0, 7, 0, 4, 7])
    // Open D relative to D: R 5 R 3 5 R
    expect(open(OPEND, 2).reverse()).toEqual([0, 7, 0, 4, 7, 0])
    const og = fretboards.find((b) => b.caption?.startsWith('Open G open strings'))!
    expect(og.marks.map((m) => m.label).reverse()).toEqual(['5', 'R', '5', 'R', '3', '5'])
    const dg = fretboards.find((b) => b.caption?.startsWith('DADGAD open strings'))!
    expect(dg.marks.map((m) => m.label).reverse()).toEqual(['R', '5', 'R', '4', '5', 'R'])
  })

  it('the capo example boards use absolute frets', () => {
    const capoBoard = fretboards.find((b) => b.capo === 3)!
    // G shape 320003 +3 on the fretboard: 6,5 / 5,5 / 4,3 / 3,3 / 2,3 / 1,6
    expect(capoBoard.marks.map((m) => `${m.string}:${m.fret}:${m.label}`).sort()).toEqual(['1:6:Bb', '2:3:D', '3:3:Bb', '4:3:F', '5:5:D', '6:6:Bb'].sort())
    const c2 = fretboards.find((b) => b.capo === 2 && b.marks.length === 6)!
    expect(c2.marks.map((m) => m.label)).toEqual(['F#', 'C#', 'A', 'E', 'B', 'F#'])
  })
})

describe('unit 15 chord and tab sounds', () => {
  const chordBlocks = allBlocks.filter((b): b is Extract<Block, { type: 'chords' }> => b.type === 'chords')
  const pcsOf = (b: Extract<Block, { type: 'chords' }>, i: number) =>
    shapeMidisIn(b.shapes[i], b.tuning ?? STD, b.capo ?? 0).map((m) => mod(m, 12))

  it('Drop D power chords are root-fifth-octave', () => {
    const b = chordBlocks.find((c) => c.shapes[0].name === 'D5')!
    expect(b.tuning).toEqual(DROPD)
    expect(shapeMidisIn(b.shapes[0], DROPD)).toEqual([38, 45, 50]) // D2 A2 D3
    expect(shapeMidisIn(b.shapes[1], DROPD)).toEqual([41, 48, 53]) // F2 C3 F3
    expect(shapeMidisIn(b.shapes[2], DROPD)).toEqual([43, 50, 55]) // G2 D3 G3
  })

  it('Drop D D and Dm use all six strings', () => {
    const b = chordBlocks.find((c) => c.shapes[0].name === 'D' && c.tuning && c.tuning[5] === 38 && c.shapes.length === 2)!
    expect(shapeMidisIn(b.shapes[0], DROPD)).toEqual([38, 45, 50, 57, 62, 66]) // D A D A D F#
    expect(shapeMidisIn(b.shapes[1], DROPD)).toEqual([38, 45, 50, 57, 62, 65]) // D A D A D F
  })

  it('the Em shape in three tunings', () => {
    const [std, drop, dad] = chordBlocks.filter((c) => c.shapes[0].name === 'Em shape')
    expect(pcsOf(std, 0)).toEqual([4, 11, 4, 7, 11, 4]) // E B E G B E
    expect(pcsOf(drop, 0)).toEqual([2, 11, 4, 7, 11, 4]) // D B E G B E
    expect(pcsOf(dad, 0)).toEqual([2, 11, 4, 7, 9, 2]) // D B E G A D
  })

  it('DADGAD chords', () => {
    const b = chordBlocks.find((c) => c.shapes[0].name === 'Dsus4')!
    const [sus4, sus2, major, minor] = [0, 1, 2, 3].map((i) => shapeMidisIn(b.shapes[i], DADGAD))
    expect(sus4).toEqual([38, 45, 50, 55, 57, 62]) // D A D G A D
    expect(sus2).toEqual([38, 45, 52, 57, 62]) // D A E A D (no G)
    expect(major).toEqual([38, 45, 54, 57, 62]) // D A F# A D
    expect(minor).toEqual([38, 45, 53, 57, 62]) // D A F A D
    const barres = chordBlocks.find((c) => c.shapes[0].name === 'Esus4')!
    // Esus4 E B E A B E; Gsus4 G D G C D G; Asus4 A E A D E A
    expect(shapeMidisIn(barres.shapes[0], DADGAD).map((m) => mod(m, 12))).toEqual([4, 11, 4, 9, 11, 4])
    expect(shapeMidisIn(barres.shapes[1], DADGAD).map((m) => mod(m, 12))).toEqual([7, 2, 7, 0, 2, 7])
    expect(shapeMidisIn(barres.shapes[2], DADGAD).map((m) => mod(m, 12))).toEqual([9, 4, 9, 2, 4, 9])
  })

  it('Open G and Open D chords', () => {
    const g = chordBlocks.find((c) => c.shapes[0].name === 'G' && c.tuning && c.tuning[4] === 43 && c.shapes.length === 3)!
    expect(shapeMidisIn(g.shapes[0], OPENG)).toEqual([38, 43, 50, 55, 59, 62]) // D G D G B D
    expect(shapeMidisIn(g.shapes[1], OPENG).map((m) => mod(m, 12))).toEqual([7, 0, 7, 0, 4, 7]) // G C G C E G
    expect(shapeMidisIn(g.shapes[2], OPENG).map((m) => mod(m, 12))).toEqual([9, 2, 9, 2, 6, 9]) // A D A D F# A
    const ext = chordBlocks.find((c) => c.shapes[0].name === 'Gm')!
    expect(shapeMidisIn(ext.shapes[0], OPENG)).toEqual([38, 46, 50, 55, 62]) // D Bb D G D
    expect(shapeMidisIn(ext.shapes[1], OPENG)).toEqual([38, 43, 50, 55, 59, 65]) // ... B F  (G7)
    expect(shapeMidisIn(ext.shapes[2], OPENG)).toEqual([38, 43, 50, 55, 59, 66]) // ... B F# (Gmaj7)
    const d = chordBlocks.find((c) => c.shapes[0].name === 'D' && c.tuning && c.tuning[2] === 54 && c.shapes.length === 3)!
    expect(shapeMidisIn(d.shapes[0], OPEND)).toEqual([38, 45, 50, 54, 57, 62])
    expect(shapeMidisIn(d.shapes[1], OPEND).map((m) => mod(m, 12))).toEqual([7, 2, 7, 11, 2, 7]) // G D G B D G
    expect(shapeMidisIn(d.shapes[2], OPEND).map((m) => mod(m, 12))).toEqual([9, 4, 9, 1, 4, 9]) // A E A C# E A
    const m7 = chordBlocks.find((c) => c.shapes[0].name === 'Dm' && c.tuning && c.tuning[2] === 54)!
    expect(shapeMidisIn(m7.shapes[0], OPEND)).toEqual([38, 45, 53, 57, 62]) // D A F A D
    expect(shapeMidisIn(m7.shapes[1], OPEND)).toEqual([38, 45, 50, 54, 60, 62]) // D A D F# C D (D7)
  })

  it('capo 3 shapes sound B-flat, E-flat, F, G minor', () => {
    const b = chordBlocks.find((c) => c.capo === 3)!
    const midis = (i: number) => shapeMidisIn(b.shapes[i], STD, 3)
    expect(midis(0)).toEqual([46, 50, 53, 58, 62, 70]) // Bb D F Bb D Bb
    expect(midis(1)).toEqual([51, 55, 58, 63, 67]) // Eb G Bb Eb G
    expect(midis(2)).toEqual([53, 60, 65, 69]) // F C F A
    expect(midis(3)).toEqual([43, 50, 55, 58, 62, 67]) // G D G Bb D G
  })

  it('tab events sound the expected pitches', () => {
    const tabs = allBlocks.filter((b): b is Extract<Block, { type: 'tab' }> => b.type === 'tab')
    const drop = tabs.find((t) => t.tuning && t.tuning[5] === 38 && t.tuning[0] === 64)!
    const midi = (t: typeof drop, i: number) => t.events[i].pos.map((p) => (t.tuning ?? STD)[p.string - 1] + p.fret + (t.capo ?? 0)).sort((a, b) => a - b)
    expect(midi(drop, 0)).toEqual([38, 45, 50])
    expect(midi(drop, 3)).toEqual([41, 48, 53])
    expect(midi(drop, 4)).toEqual([43, 50, 55])
    expect(midi(drop, 7)).toEqual([45, 52, 57]) // A5
    const og = tabs.find((t) => t.tuning && t.tuning[4] === 43)!
    // 3rd bar: D chord arpeggio strings 5,3,2,1 at fret 7 -> D3 D4 F#4 A4
    expect(midi(og, 14)).toEqual([50, 62, 66, 69])
    const capoTab = tabs.find((t) => t.capo === 2)!
    expect(midi(capoTab, 0)).toEqual([40 + 3 + 2]) // low E string fret 3 + capo 2 = A2
    const hs = tabs.find((t) => t.tuning && t.tuning[0] === 63)!
    expect(midi(hs, 0)).toEqual([39])
  })

  it('shape audio carries the tuning and capo', () => {
    const specs: unknown[] = []
    for (const b of allBlocks) {
      if (b.type === 'audio') specs.push(b.play)
      if (b.type === 'audioRow') specs.push(...b.items.map((i) => i.play))
    }
    const shapes = specs.filter((s): s is Extract<import('../types').PlaySpec, { kind: 'shape' }> => (s as { kind: string }).kind === 'shape')
    expect(shapes.length).toBeGreaterThan(10)
    const capoSpec = shapes.find((s) => s.capo === 3)!
    expect(shapeMidisIn(capoSpec.shape, capoSpec.tuning, capoSpec.capo)).toEqual([46, 50, 53, 58, 62, 70])
  })
})

describe('unit 15 generators', () => {
  const gens = unit.quiz.generators!
  const parseCapoPrompt = /fret (\d+)\*\* and play the open \*\*(\w+)\*\* chord shape/

  it('capo forward answers are shape + capo', () => {
    const SHAPE_PC: Record<string, number> = { C: 0, D: 2, E: 4, G: 7, A: 9, Am: 9, Em: 4, Dm: 2 }
    for (let n = 0; n < 200; n++) {
      const q = gens[0]() as Extract<QuizQuestion, { kind: 'mc' }>
      const m = parseCapoPrompt.exec(q.prompt)!
      const capo = Number(m[1])
      const expectPc = mod(SHAPE_PC[m[2]] + capo, 12)
      expect(LABEL_PCS(q.choices[q.answer]), q.prompt).toContain(expectPc)
      expect(q.choices[q.answer].endsWith('m') || q.choices[q.answer].includes('m/')).toBe(m[2].endsWith('m'))
      expect(q.choices).toHaveLength(4)
      // no other choice shares the pitch class
      q.choices.forEach((c, i) => i !== q.answer && expect(LABEL_PCS(c)).not.toContain(expectPc))
    }
  })

  it('capo reverse answers satisfy shape + capo = target', () => {
    const SHAPE_PC: Record<string, number> = { C: 0, D: 2, E: 4, G: 7, A: 9 }
    const KEYS: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }
    for (let n = 0; n < 200; n++) {
      const q = gens[1]() as Extract<QuizQuestion, { kind: 'mc' }>
      const m = /in \*\*([A-G][#b]?)\*\*, and you want to play \*\*(\w)\*\*-shape/.exec(q.prompt)!
      const capo = Number(q.choices[q.answer])
      expect(mod(SHAPE_PC[m[2]] + capo, 12), q.prompt).toBe(KEYS[m[1]])
      expect(q.choices).toHaveLength(4)
    }
  })

  it('open string note answers match the tuning', () => {
    const TUNINGS: Record<string, number[]> = {
      'Drop D': DROPD,
      DADGAD,
      'Open G': OPENG,
      'Open D': OPEND,
      'Open E': [64, 59, 56, 52, 47, 40],
      'Double drop D': [62, 59, 55, 50, 45, 38],
      'Half step down': HALF,
      'Whole step down': [62, 57, 53, 48, 43, 38]
    }
    const ORD: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6 }
    let named = 0
    let retune = 0
    for (let n = 0; n < 300; n++) {
      const q = gens[2]() as Extract<QuizQuestion, { kind: 'mc' }>
      const a = q.choices[q.answer]
      const byName = /in \*\*(.+)\*\* tuning\. What is the open \*\*(\w+)\*\* string/.exec(q.prompt)
      if (byName) {
        named++
        expect(mod(TUNINGS[byName[1]][ORD[byName[2]] - 1], 12), q.prompt).toBe(pcOf(a))
      } else {
        retune++
        const r = /tune the \*\*(\w+)\*\* string \(open (\w#?)\) \*\*(up|down) (\d) semitone/.exec(q.prompt)!
        const s = ORD[r[1]]
        const shift = (r[3] === 'down' ? -1 : 1) * Number(r[4])
        expect(LABEL_PCS(a), q.prompt).toContain(mod(STD[s - 1] + shift, 12))
        expect(mod(STD[s - 1], 12)).toBe(pcOf(r[2]))
      }
      expect(new Set(q.choices).size).toBe(q.choices.length)
    }
    expect(named).toBeGreaterThan(50)
    expect(retune).toBeGreaterThan(50)
  })

  it('fret on retuned string answers are right', () => {
    const TUNINGS: Record<string, number[]> = {
      'Drop D': DROPD,
      DADGAD,
      'Open G': OPENG,
      'Open D': OPEND,
      'Open E': [64, 59, 56, 52, 47, 40],
      'Double drop D': [62, 59, 55, 50, 45, 38],
      'Half step down': HALF,
      'Whole step down': [62, 57, 53, 48, 43, 38]
    }
    const ORD: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6 }
    for (let n = 0; n < 200; n++) {
      const q = gens[3]() as Extract<QuizQuestion, { kind: 'mc' }>
      const m = /In \*\*(.+)\*\* tuning the (\w+) string is tuned to \*\*(\w#?b?)\*\*\. Which fret on that string plays \*\*([^*]+)\*\*/.exec(q.prompt)!
      const open = TUNINGS[m[1]][ORD[m[2]] - 1]
      expect(mod(open, 12), q.prompt).toBe(pcOf(m[3]))
      const fret = Number(q.choices[q.answer])
      expect(LABEL_PCS(m[4]), q.prompt).toContain(mod(open + fret, 12))
      expect(fret).toBeGreaterThanOrEqual(1)
      expect(fret).toBeLessThanOrEqual(11)
    }
  })

  it('click-a-note targets sound the named note on the named string', () => {
    for (let n = 0; n < 200; n++) {
      const q = gens[4]() as Extract<QuizQuestion, { kind: 'fretboard' }>
      const m = /Click \*\*([^*]+)\*\* on the \*\*(\w+)\*\* string/.exec(q.prompt)!
      const s = Number(m[2][0])
      expect(q.tuning).toBeTruthy()
      for (const t of q.targets) {
        expect(t.string).toBe(s)
        expect(LABEL_PCS(m[1])).toContain(mod(q.tuning![t.string - 1] + t.fret, 12))
      }
      // and no other fret in range is missed
      const all = Array.from({ length: 13 }, (_, f) => f).filter((f) => LABEL_PCS(m[1]).includes(mod(q.tuning![s - 1] + f, 12)))
      expect(q.targets.map((t) => t.fret)).toEqual(all)
    }
  })

  it('capo plus tuning answers use net shift = capo - tuned down', () => {
    const SHAPE_PC: Record<string, number> = { C: 0, D: 2, E: 4, G: 7, A: 9, Am: 9, Em: 4, Dm: 2 }
    for (let n = 0; n < 200; n++) {
      const q = gens[5]() as Extract<QuizQuestion, { kind: 'mc' }>
      const down = q.prompt.includes('a whole step') ? 2 : 1
      const capo = /capo on fret (\d)/.exec(q.prompt)?.[1] ?? '0'
      const shapeName = /open \*\*(\w+)\*\* shape/.exec(q.prompt)![1]
      const expectPc = mod(SHAPE_PC[shapeName] + Number(capo) - down, 12)
      expect(LABEL_PCS(q.choices[q.answer]), q.prompt).toContain(expectPc)
    }
  })

  it('built quizzes grade', () => {
    for (let n = 0; n < 20; n++) {
      const quiz = buildQuiz(unit.quiz)
      expect(quiz).toHaveLength(12)
      for (const q of quiz) if (q.kind === 'mc') expect(grade(q, { kind: 'mc', choice: q.answer })).toBe(true)
    }
  })
})
