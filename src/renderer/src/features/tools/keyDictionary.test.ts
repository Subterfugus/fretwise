import { describe, expect, it } from 'vitest'
import { CHORDS } from '@/theory/chords'
import { SCALES } from '@/theory/scales'
import { pitchClass } from '@/theory/notes'
import { KEY_SCALE_OPTIONS, chordRootFor, commonVoicing, isDictView, isKeyScale, keyData, keyRootFor, keyRoman, parseDictionaryQuery, resolveChordRoot, resolveKeyRoot, viewFor, viewLabel } from './keyDictionary'
import { LIBRARY_QUALITIES, chordLibrary } from './chordLibrary'
import { groupByRegion, voicingTones } from './voicingView'

const FLAT = '♭'
const noDouble = (names: string[]) => names.every((n) => !/^[A-G](##|bb)/.test(n))

describe('key data: major', () => {
  it('spells D major and its chords', () => {
    const k = keyData('D', 'major')
    expect(k.notes).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#'])
    expect(k.degrees).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(k.triads.map((r) => r.symbol)).toEqual(['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#°'])
    expect(k.triads.map((r) => r.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(k.sevenths.map((r) => r.symbol)).toEqual(['Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'A7', 'Bm7', 'C#m7♭5'])
    expect(k.sevenths.map((r) => r.roman)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'])
    expect(k.triads.map((r) => r.fn)).toEqual(['Tonic', 'Subdominant', 'Tonic (substitute)', 'Subdominant', 'Dominant', 'Tonic (substitute)', 'Dominant (leading tone)'])
  })

  it('spells Bb major with flats', () => {
    const k = keyData('Bb', 'major')
    expect(k.notes).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'])
    expect(k.triads.map((r) => r.symbol)).toEqual(['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'A°'])
  })

  it('every root gives correctly spelled, correctly built major keys', () => {
    for (let pc = 0; pc < 12; pc++) {
      const root = keyRootFor(pc, 'major')
      expect(pitchClass(root)).toBe(pc)
      const k = keyData(root, 'major')
      expect(noDouble(k.notes)).toBe(true)
      // one note per letter
      expect(new Set(k.notes.map((n) => n[0])).size).toBe(7)
      expect(k.triads.map((r) => r.type)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'])
      expect(k.sevenths.map((r) => r.type)).toEqual(['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'm7b5'])
      expect(k.triads.map((r) => r.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
      expect(k.triads.map((r) => r.root)).toEqual(k.notes)
    }
  })
})

describe('key data: minor families and modes', () => {
  it('natural minor uses flat Roman numerals relative to the parallel major', () => {
    const k = keyData('A', 'naturalMinor')
    expect(k.notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(k.triads.map((r) => r.symbol)).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G'])
    expect(k.triads.map((r) => r.roman)).toEqual(['i', 'ii°', `${FLAT}III`, 'iv', 'v', `${FLAT}VI`, `${FLAT}VII`])
    expect(k.sevenths.map((r) => r.roman)).toEqual(['i7', 'iiø7', `${FLAT}IIImaj7`, 'iv7', 'v7', `${FLAT}VImaj7`, `${FLAT}VII7`])
  })

  it('all 12 natural minor keys are well spelled', () => {
    for (let pc = 0; pc < 12; pc++) {
      const root = keyRootFor(pc, 'naturalMinor')
      const k = keyData(root, 'naturalMinor')
      expect(noDouble(k.notes)).toBe(true)
      expect(new Set(k.notes.map((n) => n[0])).size).toBe(7)
      expect(k.triads.map((r) => r.type)).toEqual(['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'])
      expect(k.sevenths.map((r) => r.type)).toEqual(['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', 'dom7'])
    }
  })

  it('harmonic and melodic minor, and modes', () => {
    const h = keyData('A', 'harmonicMinor')
    expect(h.notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#'])
    expect(h.triads.map((r) => r.roman)).toEqual(['i', 'ii°', `${FLAT}III+`, 'iv', 'V', `${FLAT}VI`, 'vii°'])
    expect(h.sevenths[0].symbol).toBe('Am(maj7)')
    const m = keyData('C', 'melodicMinor')
    expect(m.notes).toEqual(['C', 'D', 'Eb', 'F', 'G', 'A', 'B'])
    expect(m.sevenths.map((r) => r.type)).toEqual(['minMaj7', 'min7', 'augMaj7', 'dom7', 'dom7', 'm7b5', 'm7b5'])
    const d = keyData('E', 'dorian')
    expect(d.notes).toEqual(['E', 'F#', 'G', 'A', 'B', 'C#', 'D'])
    expect(d.triads.map((r) => r.symbol)).toEqual(['Em', 'F#m', 'G', 'A', 'Bm', 'C#°', 'D'])
    expect(d.triads[0].fn).toBe('Tonic (home)')
    expect(keyRoman('dorian', 3, 'maj')).toBe(`${FLAT}III`)
  })

  it('every offered key scale is key-capable and works for all 12 roots', () => {
    for (const t of KEY_SCALE_OPTIONS) {
      expect(isKeyScale(t)).toBe(true)
      for (let pc = 0; pc < 12; pc++) {
        const k = keyData(keyRootFor(pc, t), t)
        expect(k.notes).toHaveLength(7)
        expect(k.triads).toHaveLength(7)
        expect(k.sevenths).toHaveLength(7)
        expect(noDouble(k.notes)).toBe(true)
      }
    }
    expect(isKeyScale('majorPentatonic')).toBe(false)
  })
})

describe('key -> chord link targets', () => {
  it('D major vi links to the Bm chord entry', () => {
    const k = keyData('D', 'major')
    expect(k.triads[5].link).toEqual({ kind: 'chord', root: 'B', type: 'min' })
    expect(k.sevenths[5].link).toEqual({ kind: 'chord', root: 'B', type: 'min7' })
    expect(viewLabel(k.triads[5].link)).toBe('Bm')
    expect(viewLabel({ kind: 'key', root: 'D', type: 'major' })).toBe('D major')
  })

  it('every link is a valid dictionary view whose chord type is in CHORDS', () => {
    for (const t of KEY_SCALE_OPTIONS) {
      const k = keyData(keyRootFor(7, t), t)
      for (const r of [...k.triads, ...k.sevenths]) {
        expect(isDictView(r.link)).toBe(true)
        expect(r.link.type in CHORDS).toBe(true)
      }
    }
  })
})

describe('dictionary query parsing', () => {
  it('opens keys', () => {
    expect(parseDictionaryQuery('key of Bb')[0]).toEqual({ kind: 'key', root: 'Bb', type: 'major' })
    expect(parseDictionaryQuery('Key of F#m')[0]).toEqual({ kind: 'key', root: 'F#', type: 'naturalMinor' })
    expect(parseDictionaryQuery('key of A minor')[0]).toEqual({ kind: 'key', root: 'A', type: 'naturalMinor' })
    expect(parseDictionaryQuery('D key')[0]).toEqual({ kind: 'key', root: 'D', type: 'major' })
    expect(parseDictionaryQuery('D major')[0]).toEqual({ kind: 'key', root: 'D', type: 'major' })
    expect(parseDictionaryQuery('E dorian')[0]).toEqual({ kind: 'key', root: 'E', type: 'dorian' })
    expect(parseDictionaryQuery('A harmonic minor')[0]).toEqual({ kind: 'key', root: 'A', type: 'harmonicMinor' })
  })
  it('"D major" still offers the D major chord', () => {
    expect(parseDictionaryQuery('D major')).toContainEqual({ kind: 'chord', root: 'D', type: 'maj' })
  })
  it('opens chords', () => {
    expect(parseDictionaryQuery('Bm')[0]).toEqual({ kind: 'chord', root: 'B', type: 'min' })
    expect(parseDictionaryQuery('F#m7b5')[0]).toEqual({ kind: 'chord', root: 'F#', type: 'm7b5' })
    expect(parseDictionaryQuery('Bb maj7')[0]).toEqual({ kind: 'chord', root: 'Bb', type: 'maj7' })
    expect(parseDictionaryQuery('C7#9')[0]).toEqual({ kind: 'chord', root: 'C', type: 'dom7s9' })
  })
  it('keeps non-key scales as scales and ignores nonsense', () => {
    expect(parseDictionaryQuery('A minor pentatonic')[0]).toEqual({ kind: 'scale', root: 'A', type: 'minorPentatonic' })
    expect(parseDictionaryQuery('zzz')).toEqual([])
    expect(parseDictionaryQuery('  ')).toEqual([])
  })
  it('viewFor maps seven-note scales to keys only', () => {
    expect(viewFor({ kind: 'scale', root: 'G', type: 'mixolydian' })).toEqual({ kind: 'key', root: 'G', type: 'mixolydian' })
    expect(viewFor({ kind: 'scale', root: 'G', type: 'blues' }).kind).toBe('scale')
    expect(viewFor({ kind: 'chord', root: 'G', type: 'maj' }).kind).toBe('chord')
  })
  it('validates stored views', () => {
    expect(isDictView({ kind: 'key', root: 'D', type: 'major' })).toBe(true)
    expect(isDictView({ kind: 'key', root: 'H', type: 'major' })).toBe(false)
    expect(isDictView({ kind: 'chord', root: 'D', type: 'nope' })).toBe(false)
    expect(isDictView(null)).toBe(false)
  })
})

describe('root spelling helpers', () => {
  it('keeps valid preferred spelling', () => {
    expect(resolveKeyRoot(6, 'Gb', 'major')).toBe('Gb')
    expect(resolveKeyRoot(6, 'F#', 'major')).toBe('F#')
    expect(resolveChordRoot(1, 'Db', 'maj7')).toBe('Db')
  })
  it('rejects spellings that need double accidentals', () => {
    // G# major needs F##; fall back to Ab major
    expect(resolveKeyRoot(8, 'G#', 'major')).toBe('Ab')
    for (const t of LIBRARY_QUALITIES) for (let pc = 0; pc < 12; pc++) expect(pitchClass(chordRootFor(pc, t))).toBe(pc)
  })
})

describe('voicing view helpers', () => {
  it('labels tones with the chord spelling and flags root and bass', () => {
    // Bm barre: x 2 4 4 3 2 -> B F# B D F#
    const tones = voicingTones('B', 'min', { name: 'Bm', frets: [null, 2, 4, 4, 3, 2] })
    expect(tones.map((t) => t.note)).toEqual(['B', 'F#', 'B', 'D', 'F#'])
    expect(tones.map((t) => t.degree)).toEqual(['1', '5', '1', '♭3', '5'])
    expect(tones.filter((t) => t.isBass).map((t) => t.string)).toEqual([5])
    expect(tones.filter((t) => t.isRoot)).toHaveLength(2)
  })
  it('bass is the lowest MIDI pitch even in an inversion', () => {
    // D/F# : 2 x 0 2 3 2 -> F# A? low E fret 2 = F#
    const tones = voicingTones('D', 'maj', { name: 'D/F#', frets: [2, null, 0, 2, 3, 2] })
    const bass = tones.find((t) => t.isBass)!
    expect(bass.note).toBe('F#')
    expect(bass.degree).toBe('3')
  })
  it('groups voicings by lowest fret and skips empty regions', () => {
    const lib = chordLibrary('C', 'maj')
    const regions = groupByRegion(lib)
    expect(regions.reduce((n, r) => n + r.voicings.length, 0)).toBe(lib.length)
    for (const r of regions) for (const v of r.voicings) expect(v.position >= r.lo && v.position <= r.hi).toBe(true)
  })
  it('commonVoicing prefers a low root-position shape', () => {
    const lib = chordLibrary('G', 'maj')
    const v = commonVoicing(lib)
    expect(v).not.toBeNull()
    const rootPos = lib.filter((x) => x.inversion === 0 && x.strings.length >= 4)
    if (rootPos.length) expect(v!.position).toBe(Math.min(...rootPos.map((x) => x.position)))
    expect(commonVoicing([])).toBeNull()
  })
  it('scales exist for the keys used by key pages', () => {
    for (const t of KEY_SCALE_OPTIONS) expect(t in SCALES).toBe(true)
  })
})
