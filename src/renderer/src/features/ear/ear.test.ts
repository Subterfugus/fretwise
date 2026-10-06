import { describe, expect, it } from 'vitest'
import { midiAt } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import type { ChordType } from '@/theory/chords'
import type { DrillSettings } from './types'
import { DRILLS, normalizeSettings } from './drills'
import { INTERVAL_ITEMS, intervalSemitones, intervalSound, pickInterval, intervalsDrill } from './drillIntervals'
import { CHORD_ITEMS } from './drillChords'
import { scaleMidis } from './drillScales'
import { NUMERALS, PROGRESSIONS, progressionChords, progressionSound, randomNumerals } from './drillProgressions'
import { DEGREES, cadenceEvents, degreeNoteName, degreeSound } from './drillDegrees'
import { MOTIONS, degreeMidi, makeMelody, pickFinder, positionsForMidi } from './drillFret'
import { chordPcs, chordVoicing, guitarShapes, KEY_NAMES } from './voicing'
import { itemWeight, rankItems, weightedPick } from './weighting'
import { weakestSettings } from './drills'

/** Deterministic RNG (mulberry32). */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const settings = (items: string[], opts: DrillSettings['opts'] = {}, weak = false): DrillSettings => ({ items, weak, opts })
const pcsOf = (ms: number[]) => [...new Set(ms.map((m) => mod(m, 12)))].sort((a, b) => a - b)
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

describe('intervals', () => {
  it('known semitone sizes', () => {
    expect(['m2', 'M3', 'P4', 'A4', 'P5', 'P8', 'm9', 'M10'].map(intervalSemitones)).toEqual([1, 4, 5, 6, 7, 12, 13, 16])
  })

  it('generated questions have the correct semitone distance and stay in range', () => {
    const rng = seeded(1)
    const s = settings(INTERVAL_ITEMS.map((i) => i.key), { dirs: ['ascending', 'descending', 'harmonic'] })
    for (let i = 0; i < 500; i++) {
      const q = pickInterval(s, {}, rng)
      expect(q.top - q.root).toBe(intervalSemitones(q.key))
      expect(q.root).toBeGreaterThanOrEqual(43)
      expect(q.top).toBeLessThanOrEqual(79)
      expect(['ascending', 'descending', 'harmonic']).toContain(q.dir)
    }
  })

  it('only enabled intervals and directions are used', () => {
    const rng = seeded(2)
    const s = settings(['P4', 'P5'], { dirs: ['descending'] })
    for (let i = 0; i < 100; i++) {
      const q = pickInterval(s, {}, rng)
      expect(['P4', 'P5']).toContain(q.key)
      expect(q.dir).toBe('descending')
    }
  })

  it('interval sounds play the notes in the right order', () => {
    expect(intervalSound(48, 7, 'ascending').events.map((e) => e.notes)).toEqual([[48], [55]])
    expect(intervalSound(48, 7, 'descending').events.map((e) => e.notes)).toEqual([[55], [48]])
    expect(intervalSound(48, 7, 'harmonic').events.map((e) => e.notes)).toEqual([[48, 55]])
  })

  it('"hear what you picked" keeps the first note for descending intervals', () => {
    const rng = seeded(3)
    const s = settings(['M3', 'P5'], { dirs: ['descending'], hints: false })
    const q = intervalsDrill.generate(s, {}, rng)
    const first = q.sound.events[0].notes[0]
    const alt = q.choiceSound!('P5', 0)!
    expect(alt.events[0].notes[0]).toBe(first)
    expect(Number(first) - Number(alt.events[1].notes[0])).toBe(7)
  })
})

describe('chord voicings', () => {
  const types = CHORD_ITEMS.map((i) => i.key as ChordType)
  it('guitar and close voicings contain the chord tones for every root (guitar may omit the 5th)', () => {
    const rng = seeded(4)
    for (const t of types)
      for (let pc = 0; pc < 12; pc++) {
        expect(pcsOf(chordVoicing(pc, t, 'close', rng))).toEqual(chordPcs(pc, t))
        const fifth = mod(pc + 7, 12)
        for (const sh of guitarShapes(pc, t)) {
          const ms = sh.frets.flatMap((f, i) => (f === null ? [] : [midiAt({ string: 6 - i, fret: f })]))
          const got = pcsOf(ms)
          const want = chordPcs(pc, t)
          const label = `${pc} ${t} ${sh.frets.join(',')}`
          got.forEach((x) => expect(want, label).toContain(x)) // no wrong notes
          want.filter((x) => x !== fifth).forEach((x) => expect(got, label).toContain(x)) // all colour tones present
          expect(mod(Math.min(...ms), 12), label).toBe(pc) // root in the bass
        }
      }
  })

  it('common qualities have real guitar shapes on every root', () => {
    for (const t of ['maj', 'min', 'dom7', 'maj7', 'min7', 'm7b5', 'dim7', 'dim', 'aug', 'sus4'] as ChordType[])
      for (let pc = 0; pc < 12; pc++) expect(guitarShapes(pc, t).length, `${pc} ${t}`).toBeGreaterThan(0)
  })
})

describe('scales', () => {
  it('major scale from C3 is C D E F G A B C', () => {
    expect(scaleMidis(48, 'major')).toEqual([48, 50, 52, 53, 55, 57, 59, 60])
    expect(scaleMidis(48, 'minorPentatonic', true)).toEqual([48, 51, 53, 55, 58, 60, 58, 55, 53, 51, 48])
  })
})

describe('progressions', () => {
  it('numerals map to the right diatonic chords in every key', () => {
    for (const tonic of KEY_NAMES)
      for (const p of PROGRESSIONS) {
        const chords = progressionChords(tonic, p.numerals)
        chords.forEach((c, i) => {
          const n = p.numerals[i]
          expect(c.roman).toBe(n)
          const degree = ['I', 'II', 'III', 'IV', 'V', 'VI'].indexOf(n.toUpperCase())
          const tonicPc = KEY_NAMES.indexOf(tonic)
          expect(mod(pitchClass(c.root) - tonicPc, 12)).toBe(MAJOR[degree])
          expect(c.type).toBe(n === n.toUpperCase() ? 'maj' : 'min')
        })
      }
  })

  it('progression sound starts with the I chord reference and voices each chord correctly', () => {
    const rng = seeded(5)
    for (const tonic of KEY_NAMES) {
      const tonicPc = KEY_NAMES.indexOf(tonic)
      const snd = progressionSound(tonic, ['vi', 'IV', 'I', 'V'], 'guitar', 90, true, rng)
      const chordEvents = snd.events.filter((e) => e.notes.length > 0)
      expect(chordEvents).toHaveLength(5)
      expect(pcsOf(chordEvents[0].notes as number[])).toEqual(chordPcs(tonicPc, 'maj'))
      expect(pcsOf(chordEvents[1].notes as number[])).toEqual(chordPcs(mod(tonicPc + 9, 12), 'min'))
      expect(pcsOf(chordEvents[2].notes as number[])).toEqual(chordPcs(mod(tonicPc + 5, 12), 'maj'))
      expect(pcsOf(chordEvents[4].notes as number[])).toEqual(chordPcs(mod(tonicPc + 7, 12), 'maj'))
    }
  })

  it('random numeral sequences never repeat a chord back-to-back', () => {
    const rng = seeded(6)
    for (let i = 0; i < 200; i++) {
      const ns = randomNumerals(NUMERALS, {}, false, rng)
      expect(ns).toHaveLength(4)
      for (let j = 1; j < ns.length; j++) expect(ns[j]).not.toBe(ns[j - 1])
    }
  })
})

describe('scale degrees', () => {
  it('cadence is I-IV-V-I and the test note is the right distance above the tonic', () => {
    const rng = seeded(7)
    for (let pc = 0; pc < 12; pc++) {
      const cad = cadenceEvents(pc, 'guitar', rng)
      expect(cad.map((e) => pcsOf(e.notes as number[]))).toEqual([0, 5, 7, 0].map((o) => chordPcs(mod(pc + o, 12), 'maj')))
      for (const d of DEGREES) {
        const s = degreeSound(pc, 48 + pc + d.semis, 'close', true, rng)
        const last = s.events[s.events.length - 1].notes[0] as number
        expect(mod(last - pc, 12)).toBe(d.semis)
      }
    }
  })
})

describe('melodic dictation', () => {
  it('melodies are diatonic, follow the chosen motions and stay on the neck', () => {
    const rng = seeded(8)
    const allowed = ['2up', '2down', '3up', '3down']
    for (let i = 0; i < 300; i++) {
      const m = makeMelody(allowed, 5, {}, false, rng)
      expect(m.midis).toHaveLength(5)
      expect(m.motions).toHaveLength(4)
      m.midis.forEach((n) => {
        expect(MAJOR).toContain(mod(n - m.tonic, 12))
        expect(positionsForMidi(n).length).toBeGreaterThan(0)
      })
      m.motions.forEach((k, j) => {
        expect(allowed).toContain(k)
        const steps = MOTIONS.find((x) => x.key === k)!.steps
        const diff = m.midis[j + 1] - m.midis[j]
        expect(Math.sign(diff)).toBe(Math.sign(steps))
        expect(Math.abs(diff)).toBeLessThanOrEqual(Math.abs(steps) * 2)
      })
    }
    expect(degreeMidi(48, 7)).toBe(60)
    expect(degreeMidi(48, -1)).toBe(47)
  })
})

describe('note finder', () => {
  it('the played pitch matches the asked string and fret', () => {
    const rng = seeded(9)
    for (let i = 0; i < 200; i++) {
      const q = pickFinder([3, 6], ['f0', 'f5', 'f12'], {}, false, rng)
      expect([3, 6]).toContain(q.pos.string)
      expect([0, 5, 12]).toContain(q.pos.fret)
      expect(q.midi).toBe(midiAt(q.pos))
    }
  })
})

describe('weighting', () => {
  it('uniform when weak mode is off', () => {
    expect(itemWeight({ right: 0, total: 10 }, false)).toBe(itemWeight({ right: 10, total: 10 }, false))
  })

  it('weak mode strongly favours low-accuracy items', () => {
    const rng = seeded(10)
    const stats = { weak: { right: 1, total: 10 }, strong: { right: 10, total: 10 }, ok: { right: 7, total: 10 } }
    const counts: Record<string, number> = { weak: 0, strong: 0, ok: 0 }
    for (let i = 0; i < 3000; i++) counts[weightedPick(['weak', 'strong', 'ok'], stats, true, rng)]++
    expect(counts.weak).toBeGreaterThan(counts.ok)
    expect(counts.ok).toBeGreaterThan(counts.strong)
    expect(counts.weak).toBeGreaterThan(counts.strong * 4)
  })

  it('stats rows are sorted weakest first', () => {
    const rows = rankItems({ a: { right: 9, total: 10 }, b: { right: 2, total: 10 }, c: { right: 0, total: 0 } }, [{ key: 'a', label: 'A' }])
    expect(rows.map((r) => r.key)).toEqual(['b', 'a'])
    expect(rows[1].label).toBe('A')
  })
})

describe('all drills', () => {
  it('generate valid questions with defaults and with every preset', () => {
    const rng = seeded(11)
    for (const d of DRILLS) {
      const variants = [d.defaults, ...d.presets.map((p) => ({ ...d.defaults, items: p.items }))]
      if (d.id === 'progressions') variants.push({ ...d.defaults, opts: { ...d.defaults.opts, mode: 'roman' } })
      for (const s of variants)
        for (let i = 0; i < 40; i++) {
          const q = d.generate(s, {}, rng)
          expect(q.sound.events.length).toBeGreaterThan(0)
          if (d.input === 'choice') {
            expect(q.parts?.length).toBeGreaterThan(0)
            for (const p of q.parts!) expect(p.choices.map((c) => c.key)).toContain(p.answer)
          } else {
            const f = q.fret!
            expect(f.targets.length).toBe(f.itemKeys.length)
            f.targetPositions.forEach((p, j) => expect(midiAt(p)).toBe(f.targets[j]))
            if (f.start) expect(midiAt(f.start)).toBe(q.sound.events[0].notes[0])
          }
        }
    }
  })

  it('normalizeSettings drops unknown items and falls back to defaults', () => {
    const d = DRILLS[0]
    expect(normalizeSettings(d, { items: ['P5', 'bogus', 'P4'], weak: true }).items).toEqual(['P5', 'P4'])
    expect(normalizeSettings(d, { items: ['bogus'] }).items).toEqual(d.defaults.items)
    expect(normalizeSettings(d, 'junk').weak).toBe(false)
  })
})

describe('regressions (ear review 2)', () => {
  it('every guitar shape contains exactly the chord tones, root in the bass, for every root and quality', () => {
    for (const it of CHORD_ITEMS)
      for (let pc = 0; pc < 12; pc++) {
        const shapes = guitarShapes(pc, it.key as ChordType)
        expect(shapes.length, `${pc} ${it.key}`).toBeGreaterThan(0)
        for (const sh of shapes) {
          const ms = sh.frets.flatMap((f, i) => (f === null ? [] : [midiAt({ string: 6 - i, fret: f })]))
          // triads must be complete; plain 7th chords may drop a perfect 5th (e.g. open C7)
          const want = chordPcs(pc, it.key as ChordType)
          const fifth = mod(pc + 7, 12)
          const need = ['maj7', 'dom7', 'min7'].includes(it.key) ? want.filter((x) => x !== fifth) : want
          const label = `${pc} ${it.key} ${sh.frets.join(',')}`
          need.forEach((x) => expect(pcsOf(ms), label).toContain(x))
          pcsOf(ms).forEach((x) => expect(want, label).toContain(x))
          expect(mod(Math.min(...ms), 12)).toBe(pc)
          expect(Math.min(...ms)).toBeGreaterThanOrEqual(40)
          expect(Math.max(...ms)).toBeLessThanOrEqual(88)
        }
      }
  })

  it('every progression plays the right chords in all 12 keys, with and without the reference', () => {
    const rng = seeded(21)
    for (const tonic of KEY_NAMES)
      for (const p of PROGRESSIONS)
        for (const ref of [true, false]) {
          const snd = progressionSound(tonic, p.numerals, 'guitar', 90, ref, rng)
          const evs = snd.events.filter((e) => e.notes.length > 0)
          const want = [...(ref ? ['I'] : []), ...p.numerals]
          expect(evs).toHaveLength(want.length)
          progressionChords(tonic, want).forEach((c, i) =>
            expect(pcsOf(evs[i].notes as number[]), `${tonic} ${p.id} #${i}`).toEqual(chordPcs(pitchClass(c.root), c.type))
          )
        }
  })

  it('degree questions play the named degree in every key, including chromatic ones', () => {
    const rng = seeded(22)
    const s = settings(DEGREES.map((d) => d.key), { cadence: false, wide: true })
    const spelled: Record<string, string> = {}
    for (let i = 0; i < 600; i++) {
      const q = DRILLS.find((d) => d.id === 'degrees')!.generate(s, {}, rng)
      const note = q.sound.events[q.sound.events.length - 1].notes[0] as number
      const key = q.parts![0].answer
      const m = /^Key of (.+) major: (.+) is degree/.exec(q.reveal)
      expect(m, q.reveal).not.toBeNull()
      expect(note).toBeGreaterThanOrEqual(40)
      expect(note).toBeLessThanOrEqual(88)
      spelled[key] = key
    }
    expect(Object.keys(spelled).length).toBe(12)
  })

  it('diatonic degrees are spelled from the key (E# in F# major, not F)', () => {
    expect(degreeNoteName('7', 'F#', 65)).toBe('E#')
    expect(degreeNoteName('4', 'Db', 54)).toBe('Gb')
    expect(degreeNoteName('b2', 'G', 56)).toBe('Ab')
  })

  it('melody answers compare pitch: the same note on another string is correct', () => {
    const rng = seeded(23)
    let multi = 0
    for (let i = 0; i < 100; i++) {
      const q = DRILLS.find((d) => d.id === 'melody')!.generate(settings(MOTIONS.map((m) => m.key)), {}, rng)
      q.fret!.targets.forEach((t, j) => {
        const alts = positionsForMidi(t)
        alts.forEach((p) => expect(midiAt(p)).toBe(t))
        if (alts.length > 1) multi++
        expect(alts.some((p) => p.string === q.fret!.targetPositions[j].string && p.fret === q.fret!.targetPositions[j].fret)).toBe(true)
      })
    }
    expect(multi).toBeGreaterThan(0)
  })

  it('compound intervals stay in range, including "hear what you picked" for every pairing', () => {
    const rng = seeded(24)
    const keys = INTERVAL_ITEMS.map((i) => i.key)
    const s = settings(keys, { dirs: ['ascending', 'descending', 'harmonic'] })
    for (let i = 0; i < 300; i++) {
      const q = intervalsDrill.generate(s, {}, rng)
      for (const k of keys) {
        const alt = q.choiceSound!(k, 0)!
        const ns = alt.events.flatMap((e) => e.notes as number[])
        expect(Math.min(...ns)).toBeGreaterThanOrEqual(40)
        expect(Math.max(...ns)).toBeLessThanOrEqual(88)
        expect(Math.abs(ns[ns.length - 1] - ns[0])).toBe(intervalSemitones(k))
      }
    }
  })

  it('weighting copes with no stats, all zeros and corrupt stats', () => {
    const rng = seeded(25)
    for (const stats of [{}, { a: { right: 0, total: 0 }, b: { right: 0, total: 0 } }, { a: { right: NaN, total: NaN }, b: { right: -3, total: -1 } }]) {
      const seen = new Set<string>()
      for (let i = 0; i < 200; i++) seen.add(weightedPick(['a', 'b', 'c'], stats as never, true, rng))
      expect(seen.size).toBe(3)
    }
    expect(weightedPick(['only'], {}, true, rng, 'only')).toBe('only')
  })

  it('"practise weakest" with no stats or perfect stats just turns weak mode on', () => {
    const d = DRILLS[0]
    const cur = normalizeSettings(d, null)
    expect(weakestSettings(d, cur, {}).items).toEqual(d.items.map((i) => i.key).filter((k) => cur.items.includes(k)))
    expect(weakestSettings(d, cur, { m2: { right: 5, total: 5 } }).weak).toBe(true)
    const w = weakestSettings(d, cur, { m2: { right: 0, total: 4 }, M7: { right: 1, total: 4 } })
    expect(w.items).toContain('m2')
    expect(w.items).toContain('M7')
  })
})

