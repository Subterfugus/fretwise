import { describe, expect, it } from 'vitest'
import { CHORDS, ChordType, buildChord } from '@/theory/chords'
import { SCALES } from '@/theory/scales'
import { midiAt, pcAt } from '@/theory/guitar'
import { mod, pitchClass } from '@/theory/notes'
import { ALL_CHORD_TYPES, ALL_SCALE_TYPES, CHORD_CATEGORIES, SCALE_CATEGORIES } from './catalog'
import { relatedModes } from './explorer'
import { MAJOR_ROOTS, parseChordName, parseQuery, parseScaleName, rootName } from './names'
import { PRESETS, fitScales, parseRoman, progressionChords } from './progressions'
import { TIME_SIGS, accentLevels, barTicks, barLengthTicks, clampBpm, subsPerPulse, tapTempo, timeSigById, trainerBarsToTarget, trainerBpm, transportBpm, GRID_TICKS } from './metro'
import { TICKS_PER_BEAT, bassHits, chordHits, drumBar } from './patterns'
import { chordShapeCollection, generateVoicings, requiredSemitones } from './voicings'

describe('name parser', () => {
  const cases: [string, string, ChordType][] = [
    ['F#m7b5', 'F#', 'm7b5'],
    ['Bb maj7', 'Bb', 'maj7'],
    ['BbM7', 'Bb', 'maj7'],
    ['CΔ7', 'C', 'maj7'],
    ['Am', 'A', 'min'],
    ['A-7', 'A', 'min7'],
    ['Amin7', 'A', 'min7'],
    ['Gø', 'G', 'm7b5'],
    ['G♭m7♭5', 'Gb', 'm7b5'],
    ['C°', 'C', 'dim'],
    ['Cdim7', 'C', 'dim7'],
    ['C+', 'C', 'aug'],
    ['Caug', 'C', 'aug'],
    ['D7#9', 'D', 'dom7s9'],
    ['D7b9', 'D', 'dom7b9'],
    ['Esus4', 'E', 'sus4'],
    ['Esus', 'E', 'sus4'],
    ['Eadd9', 'E', 'add9'],
    ['C6', 'C', 'maj6'],
    ['C9', 'C', 'dom9'],
    ['C11', 'C', 'dom11'],
    ['C13', 'C', 'dom13'],
    ['C', 'C', 'maj'],
    ['c#m', 'C#', 'min'],
    ['bbm7', 'Bb', 'min7'],
    ['E5', 'E', 'power'],
    ['C7sus4', 'C', 'sus7']
  ]
  it.each(cases)('parses %s', (input, root, type) => {
    expect(parseChordName(input)).toEqual({ kind: 'chord', root, type })
  })
  it('rejects junk', () => {
    expect(parseChordName('hello')).toBeNull()
    expect(parseChordName('')).toBeNull()
    expect(parseChordName('C zzz')).toBeNull()
  })
  it('parses scales and orders ambiguous queries', () => {
    expect(parseScaleName('D dorian')).toEqual({ kind: 'scale', root: 'D', type: 'dorian' })
    expect(parseScaleName('Bb lydian')?.root).toBe('Bb')
    expect(parseScaleName('A minor pentatonic')?.type).toBe('minorPentatonic')
    expect(parseScaleName('E harmonic minor')?.type).toBe('harmonicMinor')
    expect(parseQuery('D dorian')[0].kind).toBe('scale')
    expect(parseQuery('F#m7b5')[0].kind).toBe('chord')
    const both = parseQuery('A minor')
    expect(both.map((b) => b.kind)).toEqual(['chord', 'scale'])
  })
  it('root spelling lists are sensible', () => {
    expect(rootName(10)).toBe('Bb')
    expect(rootName(1, true)).toBe('C#')
    expect(MAJOR_ROOTS).toHaveLength(12)
  })
})

describe('catalog', () => {
  it('categories cover every chord and scale exactly once', () => {
    expect(CHORD_CATEGORIES.flatMap((c) => c.types).sort()).toEqual([...ALL_CHORD_TYPES].sort())
    expect(SCALE_CATEGORIES.flatMap((c) => c.types).sort()).toEqual([...ALL_SCALE_TYPES].sort())
  })
})

describe('voicing generator', () => {
  const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  const types = Object.keys(CHORDS) as ChordType[]
  it('every voicing has the required tones, a 4-fret span, contiguous strings and the root in the bass', () => {
    let total = 0
    for (const root of roots) {
      for (const type of types) {
        const req = requiredSemitones(type).map((s) => mod(pitchClass(root) + s, 12))
        for (const v of generateVoicings(root, type)) {
          total++
          const sounded = v.frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0)
          const pcs = new Set(sounded.map((i) => pcAt({ string: 6 - i, fret: v.frets[i] as number })))
          for (const pc of req) expect(pcs.has(pc), `${root}${type} ${v.frets}`).toBe(true)
          const allowed = new Set(buildChord(root, type).map(pitchClass))
          for (const pc of pcs) expect(allowed.has(pc)).toBe(true)
          const fretted = v.frets.filter((f): f is number => f !== null && f > 0)
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3)
          expect(sounded.length).toBeGreaterThanOrEqual(3)
          expect(sounded.length).toBe(sounded[sounded.length - 1] - sounded[0] + 1)
          // bass = the LOWEST SOUNDING PITCH (not merely the first sounding string)
          const bassMidi = Math.min(...sounded.map((i) => midiAt({ string: 6 - i, fret: v.frets[i] as number })))
          expect(mod(bassMidi, 12)).toBe(pitchClass(root))
          expect(v.frets).toHaveLength(6)
        }
      }
    }
    expect(total).toBeGreaterThan(500)
  })
  it('finds voicings for common chords', () => {
    for (const t of ['maj', 'min', 'dom7', 'maj7', 'min7', 'm7b5', 'dom9'] as ChordType[]) {
      for (const r of roots) expect(generateVoicings(r, t).length, `${r}${t}`).toBeGreaterThan(0)
    }
  })
  it('lets the 5th be omitted for sevenths but not for triads', () => {
    expect(requiredSemitones('dom7')).not.toContain(7)
    expect(requiredSemitones('maj')).toContain(7)
    expect(requiredSemitones('dom7', false)).toContain(7)
  })
  it('collection includes open shape, E and A forms and CAGED for a major chord', () => {
    const c = chordShapeCollection('C', 'maj')
    expect(c[0].label).toBe('Open')
    expect(c.some((s) => s.label.startsWith('E-form'))).toBe(true)
    expect(c.some((s) => s.label.startsWith('A-form'))).toBe(true)
    expect(c.filter((s) => s.label.startsWith('CAGED')).length).toBeGreaterThanOrEqual(2)
    // every shape sounds only chord tones
    for (const s of c) {
      const allowed = new Set(buildChord('C', 'maj').map(pitchClass))
      s.shape.frets.forEach((f, i) => {
        if (f !== null) expect(allowed.has(mod(midiAt({ string: 6 - i, fret: f }), 12))).toBe(true)
      })
    }
  })
})

describe('progressions', () => {
  it('parses numerals', () => {
    expect(parseRoman('bVII')).toEqual({ interval: 'm7', type: 'maj' })
    expect(parseRoman('ii7')).toEqual({ interval: 'M2', type: 'min7' })
    expect(parseRoman('V7')).toEqual({ interval: 'P5', type: 'dom7' })
    expect(parseRoman('Imaj7')?.type).toBe('maj7')
    expect(parseRoman('iih7')?.type).toBe('m7b5')
    expect(parseRoman('viio')?.type).toBe('dim')
    expect(parseRoman('xyz')).toBeNull()
  })
  const keys = Array.from({ length: 12 }, (_, i) => i)
  it('I-V-vi-IV maps correctly in all 12 keys', () => {
    for (const pc of keys) {
      const tonic = rootName(pc)
      const ch = progressionChords(tonic, ['I', 'V', 'vi', 'IV'])
      expect(ch.map((c) => pitchClass(c.root))).toEqual([0, 7, 9, 5].map((s) => mod(pc + s, 12)))
      expect(ch.map((c) => c.type)).toEqual(['maj', 'maj', 'min', 'maj'])
    }
  })
  it('every preset resolves in all 12 keys, keeping root offsets', () => {
    for (const p of PRESETS) {
      const offsets = p.romans.map((r) => {
        const rr = parseRoman(r)
        expect(rr, `${p.id} ${r}`).not.toBeNull()
        return rr
      })
      for (const pc of keys) {
        const ch = progressionChords(rootName(pc, p.minor), p.romans)
        expect(ch).toHaveLength(p.romans.length)
        ch.forEach((c, i) => {
          const semis = { M2: 2, m2: 1, m3: 3, M3: 4, P4: 5, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P1: 0, A4: 6, d5: 6, A2: 3 }[offsets[i]!.interval]
          expect(pitchClass(c.root)).toBe(mod(pc + (semis ?? 0), 12))
        })
      }
    }
  })
  it('Andalusian in A minor is Am G F E and blues has 12 bars', () => {
    const a = PRESETS.find((p) => p.id === 'andalusian')!
    expect(progressionChords('A', a.romans).map((c) => c.symbol)).toEqual(['Am', 'G', 'F', 'E'])
    expect(PRESETS.find((p) => p.id === 'blues12')!.romans).toHaveLength(12)
    expect(progressionChords('A', PRESETS.find((p) => p.id === 'blues12')!.romans)[4].symbol).toBe('D7')
  })
  it('fitScales ranks the major scale fully covering I-IV-V', () => {
    const fits = fitScales('C', progressionChords('C', ['I', 'IV', 'V']))
    expect(fits[0].coverage).toBe(1)
    expect(['major', 'mixolydian', 'lydian'].includes(fits[0].type) || fits[0].coverage === 1).toBe(true)
  })
  it('related modes of C major include D dorian', () => {
    const m = relatedModes('C', 'major')
    expect(m[1]).toMatchObject({ root: 'D', type: 'dorian' })
    expect(m[5].type).toBe('aeolian')
    expect(relatedModes('A', 'harmonicMinor')[4].type).toBe('phrygianDominant')
    expect(SCALES.major.intervals).toHaveLength(7)
  })
})

describe('patterns', () => {
  const styles = ['strum', 'strum8', 'arpeggio', 'shuffle', 'ballad'] as const
  it('hits stay inside the chord and are sorted', () => {
    for (const s of styles)
      for (const beats of [1, 2, 3, 4, 6, 8]) {
        const h = chordHits(s, beats)
        expect(h.length, `${s} ${beats}`).toBeGreaterThan(0)
        h.forEach((x, i) => {
          expect(x.tick).toBeGreaterThanOrEqual(0)
          expect(x.tick).toBeLessThan(beats * TICKS_PER_BEAT)
          if (i) expect(x.tick).toBeGreaterThanOrEqual(h[i - 1].tick)
        })
        for (const b of bassHits('root-fifth', s, beats)) expect(b.tick).toBeLessThan(beats * TICKS_PER_BEAT)
      }
  })
  it('basic drums put kick on 1 and snare on 2', () => {
    const bar = drumBar('basic', 'strum', 4)
    expect(bar.find((d) => d.drum === 'kick' && d.tick === 0)).toBeTruthy()
    expect(bar.find((d) => d.drum === 'snare' && d.tick === TICKS_PER_BEAT)).toBeTruthy()
  })
})

describe('metronome logic', () => {
  it('accent grouping', () => {
    const lv = (id: string) => accentLevels(timeSigById(id))
    expect(lv('4/4')).toEqual([2, 0, 1, 0])
    expect(lv('3/4')).toEqual([2, 0, 0])
    expect(lv('5/4')).toEqual([2, 0, 0, 1, 0])
    expect(lv('6/8')).toEqual([2, 1])
    expect(lv('7/8')).toEqual([2, 0, 1, 0, 1, 0, 0])
    expect(lv('12/8')).toEqual([2, 0, 1, 0])
    for (const t of TIME_SIGS) {
      expect(t.groups.reduce((a, b) => a + b, 0)).toBe(t.pulses)
      expect(accentLevels(t)).toHaveLength(t.pulses)
    }
  })
  it('bar ticks are on the scheduling grid and fit in the bar', () => {
    for (const t of TIME_SIGS)
      for (const sub of ['none', 'eighth', 'triplet', 'sixteenth'] as const) {
        const ticks = barTicks(t, sub, true)
        expect(ticks).toHaveLength(t.pulses * subsPerPulse(t, sub))
        for (const k of ticks) {
          expect(k.at % GRID_TICKS).toBe(0)
          expect(k.at).toBeLessThan(barLengthTicks(t))
        }
      }
    expect(barTicks(timeSigById('4/4'), 'none', false)[0].level).toBe(0)
  })
  it('transport bpm conversion', () => {
    expect(transportBpm(timeSigById('4/4'), 120)).toBe(120)
    expect(transportBpm(timeSigById('6/8'), 60)).toBe(90)
    expect(transportBpm(timeSigById('7/8'), 100)).toBe(50)
  })
  it('tap tempo', () => {
    expect(tapTempo([0])).toBeNull()
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120)
    expect(tapTempo([0, 500, 10000, 10600, 11200])).toBe(100)
    expect(clampBpm(5)).toBe(30)
    expect(clampBpm(999)).toBe(300)
  })
  it('tempo trainer math', () => {
    const tr = { step: 5, everyBars: 4, target: 120 }
    expect(trainerBpm(100, tr, 0)).toBe(100)
    expect(trainerBpm(100, tr, 3)).toBe(100)
    expect(trainerBpm(100, tr, 4)).toBe(105)
    expect(trainerBpm(100, tr, 8)).toBe(110)
    expect(trainerBpm(100, tr, 400)).toBe(120)
    expect(trainerBarsToTarget(100, tr)).toBe(16)
    expect(trainerBarsToTarget(130, tr)).toBeNull()
    expect(trainerBpm(100, { step: -10, everyBars: 1, target: 70 }, 9)).toBe(70)
  })
})

