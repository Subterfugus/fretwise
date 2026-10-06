import { describe, expect, it } from 'vitest'
import { CHORDS } from '@/theory/chords'
import {
  DEFAULT_VOICE_LEADING,
  SUPPORTED_VOICE_CHORDS,
  VOICE_LEADING_PRESETS,
  VOICE_LEADING_STRING_SETS,
  parseVoiceLeadingInput,
  validVoiceLeadingConfig
} from './voiceLeadingConfig'

describe('voice-leading presets', () => {
  it('uses a valid default and valid, distinct presets', () => {
    expect(validVoiceLeadingConfig(DEFAULT_VOICE_LEADING)).toBe(true)
    expect(new Set(VOICE_LEADING_PRESETS.map((p) => p.id)).size).toBe(6)
    for (const p of VOICE_LEADING_PRESETS) {
      expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, romans: p.romans, minor: p.minor, stringSet: p.strings })).toBe(true)
    }
    expect(VOICE_LEADING_PRESETS.find((p) => p.id === 'cadence')?.romans).toEqual(DEFAULT_VOICE_LEADING.romans)
  })

  it('offers every adjacent three- and four-string group', () => {
    expect(VOICE_LEADING_STRING_SETS.map((s) => s.strings)).toEqual([
      [1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]
    ])
    for (const s of VOICE_LEADING_STRING_SETS) expect(s.id).toBe(s.strings.join('-'))
    expect(SUPPORTED_VOICE_CHORDS).toEqual(Object.keys(CHORDS))
  })
})

describe('strict voice-leading progression input', () => {
  it('preserves Roman tokens and accepts whitespace or commas as separators', () => {
    expect(parseVoiceLeadingInput('  I, IV\nV\tI  ')).toEqual({ romans: ['I', 'IV', 'V', 'I'], error: null })
    expect(parseVoiceLeadingInput('bVII #ivh7 i(maj7) I+7')).toEqual({
      romans: ['bVII', '#ivh7', 'i(maj7)', 'I+7'], error: null
    })
  })

  it.each(['', '  ', ',,,', 'I C V', 'I bogus V', 'I;IV', 'I/V', '__proto__', 'constructor', 'I)', '(I)', 'I((maj7))'])('rejects %j atomically', (input) => {
    const result = parseVoiceLeadingInput(input)
    expect(result.romans).toEqual([])
    expect(result.error).toEqual(expect.any(String))
    expect(result.error!.length).toBeGreaterThan(0)
  })

  it.each(['Isus4', 'Isus2', 'Iadd9', 'I6', 'iv6', 'V9', 'Imaj9', 'I5', 'V7b9', 'I+maj7', 'imin11'])('preserves chord quality %s', (input) => {
    expect(parseVoiceLeadingInput(`I ${input} V`)).toEqual({ romans: ['I', input, 'V'], error: null })
  })

  it('accepts sixty-four chords and rejects sixty-five', () => {
    expect(parseVoiceLeadingInput(Array(64).fill('I').join(' ')).error).toBeNull()
    expect(parseVoiceLeadingInput(Array(65).fill('I').join(' ')).error).toContain('64')
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, romans: Array(64).fill('I') })).toBe(true)
  })
})

describe('saved voice-leading config validation', () => {
  it.each([null, undefined, [], 'I IV V', 12, {}, { romans: ['I'] }])('rejects old or corrupt config %j', (raw) => {
    expect(validVoiceLeadingConfig(raw)).toBe(false)
  })

  it('requires every field rather than partially loading an older save', () => {
    for (const field of Object.keys(DEFAULT_VOICE_LEADING)) {
      const raw: Record<string, unknown> = { ...DEFAULT_VOICE_LEADING }
      delete raw[field]
      expect(validVoiceLeadingConfig(raw)).toBe(false)
    }
  })

  it.each([
    { romans: [] }, { romans: Array(65).fill('I') }, { romans: ['I', 'bad'] }, { romans: ['Isus3'] },
    { romans: [2] }, { romans: Array(2) }, { romans: [' I'] }, { romans: ['I IV'] },
    { keyPc: -1 }, { keyPc: 12 }, { keyPc: 0.5 }, { keyPc: '0' },
    { minor: 'false' }, { stringSet: '1-3-5' }, { stringSet: '__proto__' }, { stringSet: 'constructor' },
    { frets: [4, 3] }, { frets: [-1, 12] }, { frets: [0, 23] }, { frets: [0, 2.5] },
    { frets: [0] }, { frets: [0, 12, 22] }, { frets: ['0', 12] },
    { bpm: 39 }, { bpm: 221 }, { bpm: 90.5 }, { bpm: Infinity }, { bpm: NaN }, { bpm: '90' },
    { beats: 5 }, { beats: '4' }, { mode: 'pick' }, { labels: 'interval' },
    { startId: '' }, { startId: 'x,0,0,0,0' }, { startId: 'x,0,0,0,0,0,0' },
    { startId: 'x,0,0,0,0,23' }, { startId: 'x,0,0,0,0,-1' }, { startId: 'x,0,0,0,0,01' },
    { startId: 'x,0,0,0,0,1.5' }, { startId: 'X,0,0,0,0,0' }, { startId: 'x, 0,0,0,0,0' },
    { startId: '__proto__' }, { startId: 0 }
  ])('rejects invalid field values %j', (fields) => {
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, ...fields })).toBe(false)
  })

  it('accepts range boundaries, single-fret windows, and syntactically valid start IDs', () => {
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, frets: [22, 22], keyPc: 11, bpm: 220, startId: '22,22,22,22,22,22' })).toBe(true)
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, frets: [0, 0], bpm: 40, startId: 'x,x,x,0,1,22' })).toBe(true)
    for (const beats of [1, 2, 3, 4, 6, 8]) expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, beats })).toBe(true)
    for (const mode of ['block', 'strum', 'arpeggio']) expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, mode })).toBe(true)
    for (const labels of ['note', 'degree', 'finger']) expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, labels })).toBe(true)
  })

  it('rejects inherited fields without relying on object prototype methods', () => {
    expect(validVoiceLeadingConfig(Object.create(DEFAULT_VOICE_LEADING))).toBe(false)
    expect(validVoiceLeadingConfig(Object.assign(Object.create({ keyPc: 0 }), DEFAULT_VOICE_LEADING))).toBe(false)
    expect(validVoiceLeadingConfig(Object.assign(Object.create(null), DEFAULT_VOICE_LEADING))).toBe(true)
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, hasOwnProperty: null })).toBe(true)
    expect(validVoiceLeadingConfig({ ...DEFAULT_VOICE_LEADING, romans: ['constructor'] })).toBe(false)
  })
})
