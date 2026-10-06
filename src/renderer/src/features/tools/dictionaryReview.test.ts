import { describe, expect, it, vi } from 'vitest'
import { buildChord } from '@/theory/chords'
import { noteName, pitchClass } from '@/theory/notes'
import { buildScale, degreeLabels, scaleSemitones, stepPattern } from '@/theory/scales'
import { suggestScales } from './ChordEntry'
import { chordRootFor, isDictionaryQuery, isDictionaryRoot, isDictView, keyData, parseDictionaryQuery, resolveBrowseView, resolveChordRoot, viewLabel } from './keyDictionary'
import { parseChordName, parseScaleName } from './names'

vi.mock('@/audio/engine', () => ({ engine: {} }))

describe('dictionary review regressions', () => {
  it('uses practical roots for diminished triads without changing chord degrees', () => {
    const roots = [[3, 'D#', ['D#', 'F#', 'A']], [10, 'A#', ['A#', 'C#', 'E']]] as const
    for (const [pc, expected, notes] of roots) {
      const root = chordRootFor(pc, 'dim')
      expect(root).toBe(expected)
      expect(buildChord(root, 'dim').map(noteName)).toEqual(notes)
      expect(buildChord(root, 'dim').map(pitchClass)).toEqual([pc, (pc + 3) % 12, (pc + 6) % 12])
    }
  })

  it('resolves Browse keys, chords and scales for their own theory spelling', () => {
    expect(resolveBrowseView({ kind: 'key', root: 'Db', type: 'naturalMinor' })).toEqual({ kind: 'key', root: 'C#', type: 'naturalMinor' })
    expect(resolveBrowseView({ kind: 'chord', root: 'Eb', type: 'dim' })).toEqual({ kind: 'chord', root: 'D#', type: 'dim' })
    expect(resolveBrowseView({ kind: 'scale', root: 'G#', type: 'major' })).toEqual({ kind: 'key', root: 'Ab', type: 'major' })
    expect(resolveBrowseView({ kind: 'chord', root: 'Db', type: 'maj7' })).toEqual({ kind: 'chord', root: 'Db', type: 'maj7' })
  })

  it('preserves explicitly typed theory roots in search', () => {
    expect(parseDictionaryQuery('Db minor')[0]).toEqual({ kind: 'key', root: 'Db', type: 'naturalMinor' })
    expect(parseDictionaryQuery('Ebdim')[0]).toEqual({ kind: 'chord', root: 'Eb', type: 'dim' })
  })

  it.each([
    ['C diminished', 'dim'], ['F# DIMINISHED', 'dim'], ['Bb diminished 7', 'dim7'], ['D diminished 7th', 'dim7'], ['A major 7th', 'maj7']
  ] as const)('recognizes the chord alias %s', (query, type) => {
    expect(parseChordName(query)?.type).toBe(type)
    expect(parseDictionaryQuery(query)[0]).toMatchObject({ kind: 'chord', type })
  })

  it('adds the whole-half octatonic scale with alternating steps and diminished chord tones', () => {
    expect(scaleSemitones('diminishedWH')).toEqual([0, 2, 3, 5, 6, 8, 9, 11])
    expect(stepPattern('diminishedWH')).toBe('W H W H W H W H')
    expect(buildScale('C', 'diminishedWH').map(noteName)).toEqual(['C', 'D', 'Eb', 'F', 'Gb', 'Ab', 'A', 'B'])
    expect(degreeLabels('diminishedWH')).toEqual(['1', '2', '\u266d3', '4', '\u266d5', '\u266d6', '6', '7'])
    for (let pc = 0; pc < 12; pc++) {
      const root = resolveChordRoot(pc, 'C', 'dim7')
      const pcs = buildScale(root, 'diminishedWH').map(pitchClass)
      for (const type of ['dim', 'dim7'] as const) {
        expect(suggestScales(type)).toEqual(['diminishedWH'])
        for (const note of buildChord(root, type)) expect(pcs).toContain(pitchClass(note))
      }
    }
    expect(suggestScales('dom7b9')).toContain('diminishedHW')
  })

  it.each(['C whole-half diminished', 'C whole half diminished', 'C diminished whole-half', 'C Diminished (whole-half)', 'C whole-half diminished scale'])('parses %s', (query) => {
    expect(parseScaleName(query)).toEqual({ kind: 'scale', root: 'C', type: 'diminishedWH' })
    expect(parseDictionaryQuery(query)[0]).toEqual({ kind: 'scale', root: 'C', type: 'diminishedWH' })
  })

  it('distinguishes both octatonic forms in history labels', () => {
    expect(viewLabel({ kind: 'scale', root: 'C', type: 'diminishedWH' })).toBe('C diminished (whole-half)')
    expect(viewLabel({ kind: 'scale', root: 'C', type: 'diminishedHW' })).toBe('C diminished (half-whole)')
    expect(parseScaleName('C half-whole diminished')?.type).toBe('diminishedHW')
  })

  it('labels melodic minor vi and vi seventh as subdominant', () => {
    const data = keyData('C', 'melodicMinor')
    expect(data.triads[5]).toMatchObject({ type: 'dim', fn: 'Subdominant' })
    expect(data.sevenths[5]).toMatchObject({ type: 'm7b5', fn: 'Subdominant' })
    expect(keyData('C', 'major').triads[5].fn).toBe('Tonic (substitute)')
  })

  it('validates stored queries and roots before the dictionary consumes them', () => {
    for (const bad of [null, 1, [], {}, true]) expect(isDictionaryQuery(bad)).toBe(false)
    expect(isDictionaryQuery('')).toBe(true)
    expect(isDictionaryQuery('C diminished 7')).toBe(true)
    for (const bad of [null, [], {}, 3, 'H', 'C4', 'D minor', '__proto__', ' C ']) expect(isDictionaryRoot(bad)).toBe(false)
    for (const root of ['C', 'Db', 'F#', 'Bbb', 'C##']) expect(isDictionaryRoot(root)).toBe(true)
    for (const type of ['__proto__', 'constructor', 'toString']) {
      expect(isDictView({ kind: 'chord', root: 'C', type })).toBe(false)
      expect(isDictView({ kind: 'key', root: 'C', type })).toBe(false)
    }
    expect(isDictView({ kind: 'chord', root: 'C4', type: 'maj' })).toBe(false)
  })
})
