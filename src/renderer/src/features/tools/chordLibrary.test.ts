import { describe, expect, it } from 'vitest'
import { CHORDS, buildChord } from '@/theory/chords'
import type { ChordType } from '@/theory/chords'
import type { ChordShape } from '@/theory/guitar'
import { shape } from '@/theory/guitar'
import { mod, noteName, pitchClass } from '@/theory/notes'
import {
  LIBRARY_QUALITIES,
  analyzeVoicing,
  chordLibrary,
  clearChordLibraryCache,
  degreeLabel,
  expandTemplate,
  filterLibrary,
  librarySummary,
  positionRegions,
  regionOf,
  stringSetLabel,
  voicingDegreeLabels,
  voicingNoteNames
} from './chordLibrary'
import type { LibraryVoicing } from './chordLibrary'
import { CURATED_TEMPLATES, chordDegreeLabels, inversionFor } from './chordShapesData'
import type { CuratedTemplate } from './chordShapesData'
import { generateVoicings, lowestSoundingIndex } from './voicings'

// ---- independent reference data (deliberately not derived from CHORDS) ----
const OPEN = [40, 45, 50, 55, 59, 64] // low E ... high E
const midisOf = (frets: (number | null)[]): number[] => frets.flatMap((f, i) => (f === null ? [] : [OPEN[i] + f]))
const F = '♭'
const S = '♯'
const DD = '\u{1D12B}'
const REF: Record<string, { semis: number[]; deg: string[] }> = {
  maj: { semis: [0, 4, 7], deg: ['1', '3', '5'] },
  min: { semis: [0, 3, 7], deg: ['1', F + '3', '5'] },
  dim: { semis: [0, 3, 6], deg: ['1', F + '3', F + '5'] },
  aug: { semis: [0, 4, 8], deg: ['1', '3', S + '5'] },
  sus2: { semis: [0, 2, 7], deg: ['1', '2', '5'] },
  sus4: { semis: [0, 5, 7], deg: ['1', '4', '5'] },
  power: { semis: [0, 7], deg: ['1', '5'] },
  add9: { semis: [0, 4, 7, 2], deg: ['1', '3', '5', '9'] },
  maj6: { semis: [0, 4, 7, 9], deg: ['1', '3', '5', '6'] },
  min6: { semis: [0, 3, 7, 9], deg: ['1', F + '3', '5', '6'] },
  dom7: { semis: [0, 4, 7, 10], deg: ['1', '3', '5', F + '7'] },
  maj7: { semis: [0, 4, 7, 11], deg: ['1', '3', '5', '7'] },
  min7: { semis: [0, 3, 7, 10], deg: ['1', F + '3', '5', F + '7'] },
  m7b5: { semis: [0, 3, 6, 10], deg: ['1', F + '3', F + '5', F + '7'] },
  dim7: { semis: [0, 3, 6, 9], deg: ['1', F + '3', F + '5', DD + '7'] },
  minMaj7: { semis: [0, 3, 7, 11], deg: ['1', F + '3', '5', '7'] },
  sus7: { semis: [0, 5, 7, 10], deg: ['1', '4', '5', F + '7'] },
  dom9: { semis: [0, 4, 7, 10, 2], deg: ['1', '3', '5', F + '7', '9'] },
  maj9: { semis: [0, 4, 7, 11, 2], deg: ['1', '3', '5', '7', '9'] },
  min9: { semis: [0, 3, 7, 10, 2], deg: ['1', F + '3', '5', F + '7', '9'] },
  dom13: { semis: [0, 4, 7, 10, 2, 9], deg: ['1', '3', '5', F + '7', '9', '13'] },
  aug7: { semis: [0, 4, 8, 10], deg: ['1', '3', S + '5', F + '7'] },
  augMaj7: { semis: [0, 4, 8, 11], deg: ['1', '3', S + '5', '7'] },
  dom7b9: { semis: [0, 4, 7, 10, 1], deg: ['1', '3', '5', F + '7', F + '9'] },
  dom7s9: { semis: [0, 4, 7, 10, 3], deg: ['1', '3', '5', F + '7', S + '9'] },
  dom11: { semis: [0, 4, 7, 10, 2, 5], deg: ['1', '3', '5', F + '7', '9', '11'] },
  min11: { semis: [0, 3, 7, 10, 2, 5], deg: ['1', F + '3', '5', F + '7', '9', '11'] },
  maj7s11: { semis: [0, 4, 7, 11, 6], deg: ['1', '3', '5', '7', S + '11'] }
}
const ROOTLESS_OK = new Set(['dom9', 'maj9', 'min9', 'dom13', 'dom11', 'min11', 'dom7b9', 'dom7s9', 'maj7s11'])
const NINTH_OMIT_OK = new Set(['dom13', 'dom11', 'min11'])
const NEED_ONE_OF: Record<string, string[]> = {
  third: ['3', F + '3'],
  sus: ['2', '4'],
  seventh: ['7', F + '7', DD + '7']
}
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C#', 'G#', 'D#', 'A#', 'Gb']
const TWELVE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const roleOfLabel = (d: string): string =>
  d === '1' ? 'root' : d === '3' || d === F + '3' ? 'third' : ['5', F + '5', S + '5'].includes(d) ? 'fifth' : ['7', F + '7', DD + '7'].includes(d) ? 'seventh' : 'other'
const sh = (s: string): ChordShape => shape('t', s)

describe('degree labels and helpers', () => {
  it('formats degrees with real flat/sharp/double-flat glyphs', () => {
    expect(degreeLabel('m3')).toBe(F + '3')
    expect(degreeLabel('d5')).toBe(F + '5')
    expect(degreeLabel('A5')).toBe(S + '5')
    expect(degreeLabel('d7')).toBe(DD + '7')
    expect(degreeLabel('M9')).toBe('9')
    expect(degreeLabel('A11')).toBe(S + '11')
    expect(degreeLabel('M13')).toBe('13')
  })
  it('string set convention: runs of 5-6 abbreviate, everything else lists', () => {
    expect(stringSetLabel([3, 1, 2])).toBe('1-2-3')
    expect(stringSetLabel([2, 3, 4, 5])).toBe('2-3-4-5')
    expect(stringSetLabel([1, 2, 4, 5])).toBe('1-2-4-5')
    expect(stringSetLabel([1, 2, 3, 4, 5])).toBe('1-5')
    expect(stringSetLabel([2, 3, 4, 5, 6])).toBe('2-6')
    expect(stringSetLabel([1, 2, 3, 4, 5, 6])).toBe('1-6')
    expect(stringSetLabel([1, 2, 3, 4, 6])).toBe('1-2-3-4-6')
  })
  it('regions tile 0-22 with no gaps', () => {
    expect(positionRegions[0].min).toBe(0)
    expect(positionRegions[positionRegions.length - 1].max).toBe(22)
    for (let i = 1; i < positionRegions.length; i++) expect(positionRegions[i].min).toBe(positionRegions[i - 1].max + 1)
    expect(regionOf(0).id).toBe('open')
    expect(regionOf(4).id).toBe('open')
    expect(regionOf(5).id).toBe('5-8')
    expect(regionOf(12).id).toBe('9-12')
    expect(regionOf(22).id).toBe('18-22')
  })
})

describe('bass uses the lowest sounding MIDI pitch (voicings.ts fix)', () => {
  it('lowestSoundingIndex ignores string order', () => {
    // low E fret 12 = E3 (52) sounds ABOVE the open A string (A2 = 45)
    expect(lowestSoundingIndex([12, 0, null, null, null, null])).toBe(1)
    expect(lowestSoundingIndex([null, null, 0, 0, 1, 0])).toBe(2)
    expect(lowestSoundingIndex([null, null, null, null, null, null])).toBe(-1)
  })
  it('generateVoicings no longer treats a high low-E note as the root bass', () => {
    // Bbmaj7 "6 0 3 3 3 x": low E fret 6 = Bb2 (46), but the open A string (A2 = 45) is lower, so A (the 7th) is the bass.
    const target = [6, 0, 3, 3, 3, null].join(',')
    const rootBass = generateVoicings('Bb', 'maj7', { limit: 5000 }).map((s) => s.frets.join(','))
    expect(rootBass).not.toContain(target)
    const anyBass = generateVoicings('Bb', 'maj7', { rootInBass: false, limit: 5000 }).map((s) => s.frets.join(','))
    expect(anyBass).toContain(target)
  })
  it('analyzeVoicing finds the real bass when string order and pitch order differ', () => {
    const v = analyzeVoicing('A', 'min', sh('12 0 2 2 1 0'))!
    expect(v).not.toBeNull()
    expect(v.bassMidi).toBe(45) // open A string, not the E3 on the low E string
    expect(v.bassRole).toBe('root')
    expect(v.slashName).toBeNull()
    expect(v.inversion).toBe(0)
    // the same shape for Em (5th of A in the low E string) must call the E3 bass only if it is the lowest pitch
    const e = analyzeVoicing('A', 'min', sh('12 x 2 2 1 0'))!
    expect(e.bassMidi).toBe(52)
    expect(e.bassRole).toBe('fifth')
    expect(e.slashName).toBe('Am/E')
  })
})

describe('analyzeVoicing fixtures (pitches computed by hand)', () => {
  it('Bm barre x24432 in root position', () => {
    // A2 fret2 = B2 (47), D3 fret4 = F#3 (54), G3 fret4 = B3 (59), B3 fret3 = D4 (62), E4 fret2 = F#4 (66)
    const v = analyzeVoicing('B', 'min', sh('x24432'))!
    expect(midisOf(v.shape.frets)).toEqual([47, 54, 59, 62, 66])
    expect(v.bassMidi).toBe(47)
    expect(v.bassRole).toBe('root')
    expect(v.bassDegree).toBe('1')
    expect(v.inversion).toBe(0)
    expect(v.symbol).toBe('Bm')
    expect(v.slashName).toBeNull()
    expect(v.strings).toEqual([1, 2, 3, 4, 5])
    expect(v.stringSet).toBe('1-5')
    expect(v.size).toBe('full')
    expect(v.minFret).toBe(2)
    expect(v.maxFret).toBe(4)
    expect(v.position).toBe(2)
    expect(v.barre).toBe(true)
    expect(v.shape.barre).toBe(2)
    expect(v.hasOpenStrings).toBe(false)
    expect(v.omitted).toEqual([])
    expect(v.id).toBe('x,2,4,4,3,2')
    expect(voicingDegreeLabels(v)).toEqual([null, '1', '5', '1', F + '3', '5'])
    expect(voicingNoteNames(v)).toEqual([null, 'B', 'F#', 'B', 'D', 'F#'])
  })
  it('Bm/D xx0432: third in the bass', () => {
    // D3 open (50), G3 fret4 = B3 (59), B3 fret3 = D4 (62), E4 fret2 = F#4 (66)
    const v = analyzeVoicing('B', 'min', sh('xx0432'))!
    expect(midisOf(v.shape.frets)).toEqual([50, 59, 62, 66])
    expect(v.bassRole).toBe('third')
    expect(v.bassDegree).toBe(F + '3')
    expect(v.inversion).toBe(1)
    expect(v.slashName).toBe('Bm/D')
    expect(v.stringSet).toBe('1-2-3-4')
    expect(v.size).toBe('four')
    expect(v.hasOpenStrings).toBe(true)
    expect(v.position).toBe(0)
    expect(v.barre).toBe(false)
  })
  it('Ebmaj7/G with a muted string between sounding strings, spelled with flats', () => {
    // G2 fret3 (43), D3 fret1 = Eb3 (51), G3 fret3 = Bb3 (58), B3 fret3 = D4 (62)
    const v = analyzeVoicing('Eb', 'maj7', sh('3x133x'))!
    expect(midisOf(v.shape.frets)).toEqual([43, 51, 58, 62])
    expect(v.slashName).toBe('Ebmaj7/G')
    expect(v.bassDegree).toBe('3')
    expect(v.inversion).toBe(1)
    expect(v.strings).toEqual([2, 3, 4, 6])
    expect(v.stringSet).toBe('2-3-4-6')
    expect(voicingNoteNames(v)).toEqual(['G', null, 'Eb', 'Bb', 'D', null])
    expect(voicingDegreeLabels(v)).toEqual(['3', null, '1', '5', '7', null])
  })
  it('F#m7b5/A: 5th spelled, open strings, flat-5 present', () => {
    // A2 open (45), D3 fret4 = F#3 (54), G3 fret2 = A3 (57), B3 fret1 = C4 (60), E4 open (64)
    const v = analyzeVoicing('F#', 'm7b5', sh('x04210'))!
    expect(midisOf(v.shape.frets)).toEqual([45, 54, 57, 60, 64])
    expect(v.slashName).toBe('F#' + CHORDS.m7b5.symbol + '/A')
    expect(v.bassRole).toBe('third')
    expect(v.inversion).toBe(1)
    expect(voicingNoteNames(v)).toEqual([null, 'A', 'F#', 'A', 'C', 'E'])
    expect(v.hasOpenStrings).toBe(true)
  })
  it('dim7: the double-flat 7th is a seventh, spelled Bbb', () => {
    // A2 open (45) = Bbb in C dim7, Eb3 (51), A3 (57), C4 (60), F#4 (66)
    const v = analyzeVoicing('C', 'dim7', sh('x01212'))!
    expect(midisOf(v.shape.frets)).toEqual([45, 51, 57, 60, 66])
    expect(v.bassRole).toBe('seventh')
    expect(v.bassDegree).toBe(DD + '7')
    expect(v.inversion).toBe(3)
    expect(v.slashName).toBe('C' + CHORDS.dim7.symbol + '/Bbb')
  })
  it('sus2 with the 2nd in the bass is "other"; maj6 with the 6th in the bass is "other"', () => {
    // D3 open (50), G3 open (55), C4 (60), G4 (67)
    const s = analyzeVoicing('C', 'sus2', sh('xx0013'))!
    expect(midisOf(s.shape.frets)).toEqual([50, 55, 60, 67])
    expect(s.bassRole).toBe('other')
    expect(s.bassDegree).toBe('2')
    expect(s.inversion).toBeNull()
    expect(s.slashName).toBe('Csus2/D')
    // A2 open, E3, A3, C4, G4
    const six = analyzeVoicing('C', 'maj6', sh('x02213'))!
    expect(midisOf(six.shape.frets)).toEqual([45, 52, 57, 60, 67])
    expect(six.bassRole).toBe('other')
    expect(six.bassDegree).toBe('6')
    expect(six.inversion).toBeNull()
    expect(six.slashName).toBe('C6/A')
  })
  it('5th may be omitted from sevenths and is recorded; root may be omitted only from 9/13 chords', () => {
    const c7 = analyzeVoicing('C', 'dom7', sh('x3x35x'))! // C3 (48), Bb3 (58), E4 (64)
    expect(c7).not.toBeNull()
    expect(c7.omitted).toEqual(['5'])
    const c9 = analyzeVoicing('C', 'dom9', sh('xx2333'))! // E3 G... E3 (52), Bb3 (58), D4 (62), G4 (67)
    expect(midisOf(c9.shape.frets)).toEqual([52, 58, 62, 67])
    expect(c9.omitted).toEqual(['1'])
    expect(c9.slashName).toBe('C9/E')
    expect(c9.bassRole).toBe('third')
    // not rootless-capable
    expect(analyzeVoicing('C', 'maj7', sh('xx2000'))).toBeNull()
    expect(analyzeVoicing('C', 'dom7', sh('xx2333'))).toBeNull() // also has a 9th that C7 lacks
  })
  it('rejects non-chord tones, missing essentials, bad input', () => {
    expect(analyzeVoicing('C', 'maj', sh('x32011'))).toBeNull() // F is not in C major
    expect(analyzeVoicing('C', 'maj7', sh('x32010'))).toBeNull() // no B
    expect(analyzeVoicing('C', 'maj', sh('x3xxx0'))).toBeNull() // two notes
    expect(analyzeVoicing('C', 'maj', sh('xxxxxx'))).toBeNull()
    expect(analyzeVoicing('C', 'dim7', sh('x3x24x'))).toBeNull() // missing b5
    expect(analyzeVoicing('C', 'maj', { name: 'x', frets: [0, 1, 2] })).toBeNull()
    expect(analyzeVoicing('C', 'maj', { name: 'x', frets: [null, 3, 2, 0, 1, 23] })).toBeNull()
  })
  it('power chords may have two strings; the 5th is required there', () => {
    expect(analyzeVoicing('C', 'power', sh('x35xxx'))).not.toBeNull()
    expect(analyzeVoicing('C', 'power', sh('x3xxxx'))).toBeNull()
    expect(analyzeVoicing('C', 'power', sh('x355xx'))!.stringSet).toBe('3-4-5')
  })
  it('assigns fingers deterministically when absent and keeps given ones', () => {
    const a = analyzeVoicing('C', 'maj', sh('x32010'))!
    expect(a.shape.fingers).toEqual([null, 3, 2, 0, 1, 0])
    const b = analyzeVoicing('B', 'min', sh('x24432'))!
    expect(b.shape.fingers).toEqual([null, 1, 3, 4, 2, 1])
    const given = analyzeVoicing('C', 'maj', { ...sh('x32010'), fingers: [null, 4, 3, 0, 2, 0] })!
    expect(given.shape.fingers).toEqual([null, 4, 3, 0, 2, 0])
  })
  it('only reports a barre when one is required', () => {
    expect(analyzeVoicing('A', 'maj', sh('x02220'))!.barre).toBe(false) // three separate fingers
    expect(analyzeVoicing('F', 'maj', sh('133211'))!.barre).toBe(true)
  })
})

describe('chordLibrary: every root x every quality', () => {
  const failures: string[] = []
  for (const type of LIBRARY_QUALITIES) {
    it(`${type}: all voicings are valid, correct and consistent`, () => {
      const ref = REF[type]
      expect(ref, `reference for ${type}`).toBeTruthy()
      for (const root of ROOTS) {
        const lib = chordLibrary(root, type)
        expect(lib.length, `${root}${type} not empty`).toBeGreaterThan(0)
        const rootPc = pitchClass(root)
        const chordPcs = ref.semis.map((s) => mod(rootPc + s, 12))
        const names = buildChord(root, type).map(noteName)
        const symbol = noteName(root) + CHORDS[type].symbol
        const ids = new Set<string>()
        let prev: LibraryVoicing | null = null
        for (const v of lib) {
          const ctx = `${root}${type} ${v.id} [${v.source}/${v.label}]`
          // ids unique, match the frets, frets in range
          expect(ids.has(v.id), `dup ${ctx}`).toBe(false)
          ids.add(v.id)
          const frets = v.shape.frets
          expect(frets).toHaveLength(6)
          expect(v.id).toBe(frets.map((f) => (f === null ? 'x' : f)).join(','))
          for (const f of frets) if (f !== null) expect(f >= 0 && f <= 22 && Number.isInteger(f), ctx).toBe(true)
          // independent pitches
          const midis = midisOf(frets)
          expect(midis.length).toBeGreaterThanOrEqual(type === 'power' ? 2 : 3)
          const pcs = new Set(midis.map((m) => mod(m, 12)))
          for (const pc of pcs) expect(chordPcs.includes(pc), `non-chord tone ${ctx}`).toBe(true)
          // missing degrees === omitted, in chord order
          const missing = ref.deg.filter((_, i) => !pcs.has(chordPcs[i]))
          expect(v.omitted, `omitted ${ctx}`).toEqual(missing)
          for (const m of missing) {
            const okOmit = (m === '5' && ref.deg.length >= 4) || (v.source === 'curated' && [F + '5', S + '5'].includes(m) && ref.deg.length >= 4) || (m === '9' && NINTH_OMIT_OK.has(type)) || (m === '1' && ROOTLESS_OK.has(type))
            expect(okOmit, `illegal omission ${m} ${ctx}`).toBe(true)
          }
          // essentials
          if (!ROOTLESS_OK.has(type)) expect(pcs.has(chordPcs[0]), `root ${ctx}`).toBe(true)
          const hasAny = (labels: string[]) => ref.deg.some((d, i) => labels.includes(d) && pcs.has(chordPcs[i]))
          if (ref.deg.some((d) => NEED_ONE_OF.third.includes(d))) expect(hasAny(NEED_ONE_OF.third), `3rd ${ctx}`).toBe(true)
          if (ref.deg.some((d) => NEED_ONE_OF.sus.includes(d))) expect(hasAny(NEED_ONE_OF.sus), `sus ${ctx}`).toBe(true)
          if (ref.deg.some((d) => NEED_ONE_OF.seventh.includes(d))) expect(hasAny(NEED_ONE_OF.seventh), `7th ${ctx}`).toBe(true)
          // bass, inversion, slash name from independent computation
          const bassMidi = Math.min(...midis)
          expect(v.bassMidi, ctx).toBe(bassMidi)
          expect(v.bassPc).toBe(mod(bassMidi, 12))
          const bi = chordPcs.indexOf(mod(bassMidi, 12))
          expect(bi).toBeGreaterThanOrEqual(0)
          expect(v.bassDegree, ctx).toBe(ref.deg[bi])
          const role = roleOfLabel(ref.deg[bi])
          expect(v.bassRole, ctx).toBe(role)
          const hasThird = ref.deg.some((d) => NEED_ONE_OF.third.includes(d))
          expect(v.inversion, ctx).toBe(role === 'root' ? 0 : !hasThird ? null : role === 'third' ? 1 : role === 'fifth' ? 2 : role === 'seventh' ? 3 : null)
          expect(v.symbol).toBe(symbol)
          expect(v.slashName, ctx).toBe(role === 'root' ? null : `${symbol}/${names[bi]}`)
          expect(v.rootPc).toBe(rootPc)
          expect(v.type).toBe(type)
          // strings / size / frets summary
          const strings = frets.flatMap((f, i) => (f === null ? [] : [6 - i])).sort((a, b) => a - b)
          expect(v.strings).toEqual(strings)
          expect(v.stringSet).toBe(stringSetLabel(strings))
          expect(v.size).toBe(strings.length <= 3 ? 'three' : strings.length === 4 ? 'four' : 'full')
          const fretted = frets.filter((f): f is number => f !== null && f > 0)
          expect(v.minFret).toBe(fretted.length ? Math.min(...fretted) : 0)
          expect(v.maxFret).toBe(fretted.length ? Math.max(...fretted) : 0)
          expect(v.hasOpenStrings).toBe(frets.some((f) => f === 0))
          expect(v.position).toBe(v.hasOpenStrings && v.maxFret <= 4 ? 0 : v.minFret)
          // spans
          const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0
          if (v.source === 'generated') expect(span, `span ${ctx}`).toBeLessThanOrEqual(strings.length <= 3 ? 4 : 3)
          else expect(span, `span ${ctx}`).toBeLessThanOrEqual(5)
          // fingers
          expect(v.shape.fingers).toHaveLength(6)
          v.shape.fingers!.forEach((fg, i) => {
            if (frets[i] === null) expect(fg).toBeNull()
            else if (frets[i] === 0) expect(fg).toBe(0)
            else expect(fg !== null && fg >= 1 && fg <= 5, `finger ${ctx}`).toBe(true)
          })
          if (fretted.length > 4) expect(v.barre, `needs barre ${ctx}`).toBe(true)
          expect(v.barre).toBe(v.shape.barre !== undefined)
          // generated shapes keep to the simple rules: contiguous strings
          if (v.source === 'generated') expect(strings[strings.length - 1] - strings[0] + 1, ctx).toBe(strings.length)
          // degree labels / note names agree with pitches
          const dl = voicingDegreeLabels(v)
          const nn = voicingNoteNames(v)
          frets.forEach((f, i) => {
            if (f === null) {
              expect(dl[i]).toBeNull()
              expect(nn[i]).toBeNull()
            } else {
              const k = chordPcs.indexOf(mod(OPEN[i] + f, 12))
              expect(dl[i]).toBe(ref.deg[k])
              expect(nn[i]).toBe(names[k])
            }
          })
          // ordering
          if (prev) {
            const ok = prev.position < v.position || (prev.position === v.position && (prev.difficulty < v.difficulty || (prev.difficulty === v.difficulty && prev.id < v.id)))
            if (!ok) failures.push(`order ${ctx} after ${prev.id}`)
          }
          prev = v
          // re-analysing the shape reproduces the entry
          const again = analyzeVoicing(root, type, v.shape, v.source, v.label)
          expect(again, ctx).toEqual(v)
        }
      }
      expect(failures).toEqual([])
      // Exhaustive (12 roots × up to ~350 voicings); can exceed the 5 s default when the full suite runs in parallel.
    }, 60_000)
  }

  it('covers every ChordType in CHORDS, and degree labels agree with the data module', () => {
    expect([...LIBRARY_QUALITIES].sort()).toEqual((Object.keys(CHORDS) as ChordType[]).sort())
    for (const type of LIBRARY_QUALITIES) {
      expect(CHORDS[type].intervals.map(degreeLabel), type).toEqual(chordDegreeLabels(type))
      expect(REF[type].deg, type).toEqual(chordDegreeLabels(type))
    }
  })

  it('is deterministic and memoized', () => {
    const a = chordLibrary('Bb', 'dom7')
    expect(chordLibrary('Bb', 'dom7')).toBe(a)
    const snapshot = JSON.stringify(a)
    clearChordLibraryCache()
    expect(JSON.stringify(chordLibrary('Bb', 'dom7'))).toBe(snapshot)
  })

  it('respects the given spelling', () => {
    const sharp = chordLibrary('F#', 'maj')
    const flat = chordLibrary('Gb', 'maj')
    expect(sharp.map((v) => v.id)).toEqual(flat.map((v) => v.id))
    expect(sharp[0].symbol).toBe('F#')
    expect(flat[0].symbol).toBe('Gb')
    const inv = flat.find((v) => v.slashName)!
    expect(inv.slashName).toMatch(/^Gb\/(Bb|Db)$/)
    expect(sharp.find((v) => v.id === inv.id)!.slashName).toMatch(/^F#\/(A#|C#)$/)
  })

  it('library has a substantial number of shapes for common chords in every root', () => {
    for (const root of TWELVE) {
      for (const t of ['maj', 'min', 'dom7'] as ChordType[]) {
        expect(chordLibrary(root, t).length, `${root}${t}`).toBeGreaterThanOrEqual(12)
      }
      for (const t of ['maj7', 'min7', 'sus4', 'sus2', 'dom9'] as ChordType[]) {
        expect(chordLibrary(root, t).length, `${root}${t}`).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it('includes the classic open and barre shapes', () => {
    const c = chordLibrary('C', 'maj')
    const open = c.find((v) => v.id === 'x,3,2,0,1,0')!
    expect(['open', 'curated']).toContain(open.source)
    expect(open.position).toBe(0)
    expect(c.some((v) => v.id === '8,10,10,9,8,8' && ['barre', 'curated'].includes(v.source) && v.barre)).toBe(true) // E-shape at 8
    expect(c.some((v) => v.id === 'x,3,5,5,5,3' && ['barre', 'curated'].includes(v.source) && v.barre)).toBe(true) // A-shape at 3
    expect(c.some((v) => v.id === 'x,15,17,17,17,15')).toBe(true) // octave-up A-shape
    const bm = chordLibrary('B', 'min')
    expect(bm.some((v) => v.id === 'x,2,4,4,3,2')).toBe(true)
    expect(bm.some((v) => v.id === '7,9,9,7,7,7')).toBe(true)
    const f = chordLibrary('F', 'maj')
    expect(f.some((v) => v.id === '1,3,3,2,1,1')).toBe(true)
  })

  it('has every inversion of maj/min/dim/aug triads on every adjacent 3-string set, for all 12 roots', () => {
    const sets = ['1-2-3', '2-3-4', '3-4-5', '4-5-6']
    for (const type of ['maj', 'min', 'dim', 'aug'] as ChordType[]) {
      for (const root of TWELVE) {
        const lib = chordLibrary(root, type)
        for (const set of sets) {
          for (const inv of [0, 1, 2]) {
            const hit = lib.some((v) => v.size === 'three' && v.stringSet === set && v.inversion === inv)
            expect(hit, `${root}${type} strings ${set} inversion ${inv}`).toBe(true)
          }
        }
      }
    }
  })

  it('7th chords have root position and all three inversions', () => {
    for (const type of ['dom7', 'maj7', 'min7', 'm7b5', 'dim7', 'minMaj7', 'aug7', 'augMaj7', 'dom7b9', 'dom7s9'] as ChordType[]) {
      for (const root of TWELVE) {
        const lib = chordLibrary(root, type)
        for (const inv of [0, 1, 2, 3]) {
          expect(lib.some((v) => v.inversion === inv), `${root}${type} inversion ${inv}`).toBe(true)
        }
        // four-note, one-tone-per-string shapes on each adjacent 4-string set
        for (const set of ['1-2-3-4', '2-3-4-5', '3-4-5-6']) {
          if (ref4(type)) expect(lib.some((v) => v.stringSet === set && v.omitted.length === 0), `${root}${type} ${set}`).toBe(true)
        }
      }
    }
  })

  it('labels drop-2 style four-string voicings and triads', () => {
    const lib = chordLibrary('C', 'maj7')
    expect(lib.some((v) => /^Drop 2 \(strings \d-\d\)/.test(v.label))).toBe(true)
    expect(lib.some((v) => /^Closed/.test(v.label))).toBe(true)
    expect(chordLibrary('C', 'maj').some((v) => v.size === 'three' && v.inversion === 1 && /triad/i.test(v.label))).toBe(true)
  })

  it('library computation is fast', () => {
    clearChordLibraryCache()
    const times: number[] = []
    for (const type of LIBRARY_QUALITIES) {
      const t0 = performance.now()
      chordLibrary('Gb', type)
      times.push(performance.now() - t0)
    }
    expect(Math.max(...times)).toBeLessThan(250)
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeLessThan(50)
  })
})

describe('filters and summaries', () => {
  const lib = chordLibrary('G', 'maj')
  it('fretRange uses the whole shape, open strings counting as fret 0', () => {
    const g = lib.find((v) => v.id === '3,2,0,0,0,3')!
    expect(g).toBeTruthy()
    expect(filterLibrary(lib, { fretRange: [1, 5] }).some((v) => v.id === g.id)).toBe(false)
    expect(filterLibrary(lib, { fretRange: [0, 5] }).some((v) => v.id === g.id)).toBe(true)
    for (const v of filterLibrary(lib, { fretRange: [5, 9] })) {
      const all = v.shape.frets.filter((f): f is number => f !== null)
      expect(Math.min(...all)).toBeGreaterThanOrEqual(5)
      expect(Math.max(...all)).toBeLessThanOrEqual(9)
    }
  })
  it('keeps the other filter semantics', () => {
    expect(filterLibrary(lib, { barre: 'only' }).every((v) => v.barre)).toBe(true)
    expect(filterLibrary(lib, { barre: 'none' }).every((v) => !v.barre)).toBe(true)
    expect(filterLibrary(lib, { bass: 'third' }).every((v) => v.bassRole === 'third')).toBe(true)
    expect(filterLibrary(lib, { bass: 'any' })).toHaveLength(lib.length)
    expect(filterLibrary(lib, { sizes: ['three'] }).every((v) => v.size === 'three')).toBe(true)
    expect(filterLibrary(lib, { stringSets: ['1-2-3'] }).every((v) => v.stringSet === '1-2-3')).toBe(true)
    expect(filterLibrary(lib, { sources: ['open'] }).every((v) => v.source === 'open')).toBe(true)
    expect(filterLibrary(lib, { noOpenStrings: true }).every((v) => !v.hasOpenStrings)).toBe(true)
    expect(filterLibrary(lib, {})).toHaveLength(lib.length)
  })
  it('librarySummary counts add up', () => {
    const s = librarySummary(lib)
    expect(s.total).toBe(lib.length)
    expect(Object.values(s.byRegion).reduce((a, b) => a + b, 0)).toBe(lib.length)
    expect(Object.values(s.byBass).reduce((a, b) => a + b, 0)).toBe(lib.length)
    expect(Object.values(s.bySize).reduce((a, b) => a + b, 0)).toBe(lib.length)
    expect(Object.values(s.bySource).reduce((a, b) => a + b, 0)).toBe(lib.length)
    expect(Object.keys(s.byRegion)).toEqual(positionRegions.map((r) => r.id))
    expect(s.byBass.root).toBe(lib.filter((v) => v.bassRole === 'root').length)
    expect(librarySummary([]).total).toBe(0)
  })
})

const ref4 = (type: ChordType): boolean => REF[type].deg.length === 4

describe('curated templates', () => {
  const fixture = (over: Partial<CuratedTemplate> = {}): CuratedTemplate => ({
    type: 'maj',
    label: 'Fixture E-shape barre',
    refRoot: 'F',
    frets: '133211',
    fingers: '134211',
    movable: true,
    ...over
  })
  it('movable templates transpose to every octave that fits in 0-22', () => {
    // F = fret 1 on low E. G: +2 (3,5,5,4,3,3); +14 would pass fret 22; Eb (delta 10) also at -2 -> 10 and 22? check bounds
    const g = expandTemplate(fixture(), 'G').map((s) => s.frets.join(','))
    expect(g).toEqual(['3,5,5,4,3,3', '15,17,17,16,15,15'])
    const e = expandTemplate(fixture(), 'E').map((s) => s.frets.join(','))
    // delta 11: 12,14,14,13,12,12 ; delta -1 gives 0,2,2,1,0,0 (the open E shape)
    expect(e).toEqual(['0,2,2,1,0,0', '12,14,14,13,12,12'])
    for (const root of TWELVE) for (const s of expandTemplate(fixture(), root)) for (const f of s.frets) expect(f !== null && f >= 0 && f <= 22).toBe(true)
  })
  it('keeps fingers and detects the declared barre; drops fingers when a note becomes open', () => {
    const g = expandTemplate(fixture(), 'G')[0]
    expect(g.fingers).toEqual([1, 3, 4, 2, 1, 1])
    expect(g.barre).toBe(3)
    const e = expandTemplate(fixture(), 'E')[0]
    expect(e.fingers).toBeUndefined()
  })
  it('non-movable templates only exist at their reference root', () => {
    const open = fixture({ label: 'Fixture open', refRoot: 'C', frets: 'x32010', fingers: 'x32010', movable: false })
    expect(expandTemplate(open, 'C').map((s) => s.frets)).toEqual([[null, 3, 2, 0, 1, 0]])
    expect(expandTemplate(open, 'D')).toEqual([])
    expect(expandTemplate(fixture({ refRoot: 'Db', movable: false, frets: 'x43121' }), 'C#')).toHaveLength(1)
  })
  it('bad template data is ignored, not thrown', () => {
    expect(expandTemplate(fixture({ frets: '1331' }), 'G')).toEqual([])
  })
  it('every shipped template validates at its refRoot, transposes validly, and matches its declared omissions', () => {
    for (const t of CURATED_TEMPLATES) {
      const base = expandTemplate(t, t.refRoot)
      expect(base.length, `${t.type} ${t.label} ${t.frets}`).toBeGreaterThan(0)
      for (const s of base) {
        const v = analyzeVoicing(t.refRoot, t.type, s, 'curated', t.label)
        expect(v, `${t.type} ${t.label} ${t.frets} @${t.refRoot}`).not.toBeNull()
        if (t.omitted) expect(v!.omitted, `${t.type} ${t.label} omitted`).toEqual(t.omitted)
      }
      if (t.movable) {
        for (const root of TWELVE) {
          for (const s of expandTemplate(t, root)) {
            expect(analyzeVoicing(root, t.type, s, 'curated', t.label), `${t.type} ${t.label} @${root}`).not.toBeNull()
          }
        }
      }
    }
  })
  it('curated shapes appear in the library with source curated', () => {
    for (const t of CURATED_TEMPLATES) {
      const lib = chordLibrary(t.refRoot, t.type)
      for (const s of expandTemplate(t, t.refRoot)) {
        const id = s.frets.map((f) => (f === null ? 'x' : f)).join(',')
        const hit = lib.find((v) => v.id === id)
        expect(hit, `${t.type} ${t.label} ${id}`).toBeTruthy()
        expect(hit!.source).toBe('curated')
        // fingers come from the template
        if (s.fingers) expect(hit!.shape.fingers).toEqual(s.fingers)
      }
    }
  })
  it('curated inversionHints agree with the computed inversion', () => {
    const hint = { root: 0, first: 1, second: 2, third: 3 } as const
    for (const t of CURATED_TEMPLATES) {
      if (!t.inversionHint) continue
      for (const s of expandTemplate(t, t.refRoot)) {
        const v = analyzeVoicing(t.refRoot, t.type, s, 'curated', t.label)!
        expect(v.inversion, `${t.type} ${t.label} ${t.frets}`).toBe(hint[t.inversionHint])
        expect(inversionFor(t.type, v.bassDegree), t.label).toBe(t.inversionHint)
      }
    }
  })

  it('curated shapes may contain muted strings between sounding strings', () => {
    // C7 shell R-b7-3: low E fret 8 = C3 (48), D string fret 8 = Bb3 (58), G string fret 9 = E4 (64)
    const shell = analyzeVoicing('C', 'dom7', { name: 's', frets: [8, null, 8, 9, null, null] }, 'curated', 'Shell')!
    expect(midisOf(shell.shape.frets)).toEqual([48, 58, 64])
    expect(shell.omitted).toEqual(['5'])
    expect(shell.stringSet).toBe('3-4-6')
    expect(shell.inversion).toBe(0)
  })
})






