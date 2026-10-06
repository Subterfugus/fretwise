import { describe, expect, it } from 'vitest'
import { CHORDS, buildChord, chordSymbol, type ChordType } from '@/theory/chords'
import { pitchClass } from '@/theory/notes'
import { buildScale } from '@/theory/scales'
import { isToolPresetConfig } from '@/state/toolPresets'
import { MAJOR_ROOTS } from './names'
import { parseRoman, progressionChords } from './progressions'
import { DEFAULT_REHARM, REHARM_PRESETS, parseReharmInput, reharmChords, reharmLooperConfig, suggestReharmonisations, validReharmConfig, type ReharmConfig, type ReharmProgression } from './reharmonisation'

function config(romans = ['I', 'vi', 'ii', 'V7', 'I'], minor = false, durations = romans.map(() => 4), keyPc = 0): ReharmConfig {
  const p = { romans, durations }
  return { ...DEFAULT_REHARM, keyPc, minor, original: structuredClone(p), working: structuredClone(p) }
}
const pcs = (keyPc: number, minor: boolean, p: ReharmProgression) => reharmChords(keyPc, minor, p).map((c) => pitchClass(c.root))
const sum = (p: ReharmProgression) => p.durations.reduce((a, b) => a + b, 0)
const kind = (c: ReharmConfig, type: string) => suggestReharmonisations(c).filter((s) => s.kind === type)

describe('reharmonisation input and validation', () => {
  it('has complete defaults and distinct A/B arrays, and usable presets', () => {
    expect(validReharmConfig(DEFAULT_REHARM)).toBe(true)
    expect(DEFAULT_REHARM).toMatchObject({ keyPc: 0, bpm: 90, mode: 'strum' })
    expect(DEFAULT_REHARM.original.romans).toEqual(['I', 'vi', 'ii', 'V7', 'I'])
    expect(DEFAULT_REHARM.original).not.toBe(DEFAULT_REHARM.working)
    expect(DEFAULT_REHARM.original.romans).not.toBe(DEFAULT_REHARM.working.romans)
    for (const p of REHARM_PRESETS) expect(validReharmConfig(config(p.romans, p.minor))).toBe(true)
  })
  it('parses only complete atomic Roman tokens and preserves order', () => {
    expect(parseReharmInput(' I, vi\nii7\tV7 I ', 'romans', 0, false, 1.25)).toEqual({
      progression: { romans: ['I', 'vi', 'ii7', 'V7', 'I'], durations: Array(5).fill(1.25) }, error: null
    })
    for (const input of ['', 'I nope V', 'I-V-I', 'I/V', 'I ii nonsense', 'I((maj7))', 'I,', ',I', 'I , , V', Array(65).fill('I').join(' ')]) {
      const parsed = parseReharmInput(input, 'romans', 0, false)
      // Repeated separator runs are valid, but edge commas produce an empty atomic token.
      if (input === 'I , , V') expect(parsed.error).toBeNull()
      else { expect(parsed.progression, input).toBeNull(); expect(parsed.error, input).toBeTruthy() }
    }
  })
  it('materializes single-level applied Roman dominants without altering global parsing', () => {
    expect(parseRoman('V7/ii')).toBeNull()
    expect(parseReharmInput('I V7/ii ii V/V V7/vi vi', 'romans', 0, false).progression?.romans).toEqual(['I', 'VI7', 'ii', 'II', 'III7', 'vi'])
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const minor of [false, true]) {
      expect(parseReharmInput('V7/iv V7/bVI V7/V', 'romans', keyPc, minor).progression?.romans).toEqual(['I7', 'bIII7', 'II7'])
    }
    for (const input of ['V7/viio', 'V7/ii7', 'V7/V7/V', 'V/V/ii', 'v7/ii', 'V9/ii', 'V7/viii', 'V7/', '/ii', 'V7/iiø', 'V7/ii/V']) {
      expect(parseReharmInput(input, 'romans', 0, false).progression).toBeNull()
    }
  })
  it('supports minor-symbol hyphens and rejects slash bass with an explicit message', () => {
    const p = parseReharmInput('C A- D-7 G7', 'names', 0, false)
    expect(p.progression?.romans).toEqual(['I', 'vi', 'ii7', 'V7'])
    expect(parseReharmInput('Cm/maj7', 'names', 0, false).progression?.romans).toEqual(['i(maj7)'])
    for (const input of ['C/G', 'Am/E', 'C7/G#', 'C7/G\u266f']) {
      const result = parseReharmInput(input, 'names', 0, false)
      expect(result.progression).toBeNull()
      expect(result.error).toContain('Slash bass')
    }
    for (const input of ['', 'C blah G7', 'C-A-D-G', 'C,', ',C']) expect(parseReharmInput(input, 'names', 0, false).progression).toBeNull()
  })
  it('uses major-relative degrees in minor and preserves every quality at every root/key', () => {
    expect(parseReharmInput('Cm Eb Ab Bb', 'names', 0, true).progression?.romans).toEqual(['i', 'bIII', 'bVI', 'bVII'])
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const minor of [false, true]) {
      for (const root of MAJOR_ROOTS) for (const type of Object.keys(CHORDS) as ChordType[]) {
        const input = chordSymbol(root, type)
        const parsed = parseReharmInput(input, 'names', keyPc, minor)
        expect(parsed.error, `${keyPc} ${minor} ${input}`).toBeNull()
        const p = parsed.progression!
        const actual = reharmChords(keyPc, minor, p)
        expect(actual).toHaveLength(1)
        expect(actual[0].type).toBe(type)
        expect(pitchClass(actual[0].root)).toBe(pitchClass(root))
        expect(parseRoman(p.romans[0])?.type).toBe(type)
        expect(buildChord(actual[0].root, type).map(pitchClass)).toEqual(buildChord(root, type).map(pitchClass))
        expect(progressionChords(MAJOR_ROOTS[keyPc], p.romans)[0].type).toBe(type)
        expect(actual[0].root).not.toMatch(/##|bb/)
      }
    }
  })
  it('rejects incomplete, inherited, sparse, invalid and nonplain configs', () => {
    for (const field of Object.keys(DEFAULT_REHARM)) {
      const c = structuredClone(DEFAULT_REHARM) as unknown as Record<string, unknown>
      delete c[field]
      expect(validReharmConfig(c), field).toBe(false)
    }
    const invalid = [null, [], new Date(), Object.create(DEFAULT_REHARM),
      { ...config(), keyPc: 12 }, { ...config(), keyPc: 0.5 }, { ...config(), minor: 1 },
      { ...config(), bpm: 39 }, { ...config(), bpm: 220.5 }, { ...config(), bpm: NaN },
      { ...config(), mode: 'shuffle' }, { ...config(), inputMode: 'chords' },
      { ...config(), working: { romans: ['I'], durations: [] } },
      { ...config(), original: { romans: [], durations: [] } },
      { ...config(), working: { romans: Array(1), durations: [4] } },
      { ...config(), working: { romans: ['I'], durations: Array(1) } },
      { ...config(), working: { romans: ['I V'], durations: [4] } },
      { ...config(), working: { romans: [' I'], durations: [4] } },
      { ...config(), working: { romans: ['invalid'], durations: [4] } },
      { ...config(), working: Object.create({ romans: ['I'], durations: [4] }) },
      { ...config(), working: { romans: Array(65).fill('I'), durations: Array(65).fill(4) } }]
    for (const c of invalid) { expect(validReharmConfig(c)).toBe(false); expect(suggestReharmonisations(c as ReharmConfig)).toEqual([]) }
    for (const d of [0, 0.125, 0.3, 32.25, Infinity, '4']) {
      expect(validReharmConfig({ ...config(), working: { romans: ['I'], durations: [d] } })).toBe(false)
    }
    expect(validReharmConfig(Object.assign(Object.create(null), config()))).toBe(true)
    for (const bpm of [40, 220]) expect(validReharmConfig({ ...config(), bpm })).toBe(true)
    const throws = { ...config(), get working() { throw new Error('corrupt') } }
    expect(validReharmConfig(throws)).toBe(false)
    expect(suggestReharmonisations(throws as unknown as ReharmConfig)).toEqual([])
  })
  it('never silently drops bad chords or accepts invalid parsing parameters', () => {
    expect(reharmChords(0, false, { romans: ['I', 'oops', 'V'], durations: [4, 4, 4] })).toEqual([])
    expect(reharmChords(12, false, DEFAULT_REHARM.working)).toEqual([])
    for (const beats of [0, 0.3, 33, NaN]) expect(parseReharmInput('I', 'romans', 0, false, beats).progression).toBeNull()
    expect(parseReharmInput('I', 'romans', -1, false).progression).toBeNull()
    expect(parseReharmInput('I', 'bogus' as 'romans', 0, false).progression).toBeNull()
  })
})

describe('contextual reharmonisation suggestions', () => {
  it('offers all four techniques in the default, deterministically without mutation', () => {
    const c = config()
    const before = structuredClone(c)
    const suggestions = suggestReharmonisations(c)
    expect(new Set(suggestions.map((s) => s.kind))).toEqual(new Set(['tritone', 'secondary', 'borrowed', 'twoFive']))
    expect(suggestReharmonisations(c)).toEqual(suggestions)
    expect(c).toEqual(before)
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(suggestions.length)
    for (const suggestion of suggestions) {
      expect(validReharmConfig({ ...c, working: suggestion.result })).toBe(true)
      expect(sum(suggestion.result)).toBe(sum(c.working))
      expect(suggestion.result.romans).not.toBe(c.working.romans)
      expect(suggestion.result.durations).not.toBe(c.working.durations)
      expect(suggestion.explanation).toContain('melody')
    }
  })
  it('shares swapped guide tones for all actual dominant qualities in all keys', () => {
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const roman of ['V7', 'V9', 'V7b9', 'V7#9', 'V11', 'V13', 'V+7']) {
      const c = config([roman, 'Imaj7'], false, [3.5, 4], keyPc)
      const sub = kind(c, 'tritone')[0]
      expect(sub.result.romans).toEqual(['bII7', 'Imaj7'])
      expect(sub.result.durations).toEqual([3.5, 4])
      const original = reharmChords(keyPc, false, c.working)[0]
      const replacement = reharmChords(keyPc, false, sub.result)[0]
      const ivs: readonly string[] = CHORDS[original.type].intervals
      const tones = buildChord(original.root, original.type).map(pitchClass)
      const newTones = buildChord(replacement.root, replacement.type).map(pitchClass)
      expect(newTones[1]).toBe(tones[ivs.indexOf('m7')])
      expect(newTones[3]).toBe(tones[ivs.indexOf('M3')])
      expect(sub.explanation).toContain('semitone above')
      expect(sub.changedIndices).toEqual([0])
    }
  })
  it('does not label chords without the dominant guide-tone tritone as candidates', () => {
    for (const roman of ['V', 'Vmaj7', 'Vmaj9', 'Vmaj7#11', 'V7sus4', 'v7', 'viih7', 'viio7']) expect(kind(config([roman, 'I']), 'tritone')).toEqual([])
    const nonResolution = kind(config(['V7', 'IV']), 'tritone')[0]
    expect(nonResolution.explanation).toContain('not a usual fifth-down resolution')
    expect(nonResolution.explanation).not.toContain('semitone above')
  })
  it('secondary dominants actually precede suitable targets and replace the same incoming root', () => {
    const c = config()
    const replace = kind(c, 'secondary').find((s) => s.index === 1 && s.result.romans.length === 5)!
    expect(replace.result.romans).toEqual(['I', 'VI7', 'ii', 'V7', 'I'])
    expect(replace.result.durations).toEqual([4, 4, 4, 4, 4])
    const insert = kind(c, 'secondary').find((s) => s.index === 1 && s.result.romans.length === 6)!
    expect(insert.result.romans).toEqual(['I', 'III7', 'vi', 'ii', 'V7', 'I'])
    expect(insert.result.durations).toEqual([4, 2, 2, 4, 4, 4])
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const target of ['ii', 'iii7', 'IVmaj7', 'V7', 'vi', 'bIII', 'bVI', 'iv']) {
      const c2 = config([target], false, [1.5], keyPc)
      const applied = kind(c2, 'secondary')[0]
      expect(applied).toBeDefined()
      const roots = pcs(keyPc, false, applied.result)
      expect((roots[0] - roots[1] + 12) % 12).toBe(7)
      expect(applied.result.durations).toEqual([0.75, 0.75])
      const tones = reharmChords(keyPc, false, applied.result).map((ch) => buildChord(ch.root, ch.type).map(pitchClass))
      expect((tones[1][0] - tones[0][1] + 12) % 12).toBe(1)
    }
  })
  it('excludes home tonic, unsuited targets, and an already present incoming dominant', () => {
    for (const target of ['I', 'i', 'Imaj7', 'I7', 'iihoops', 'iio', 'viio7', 'II+', 'Vsus4', 'V5']) expect(kind(config([target]), 'secondary')).toEqual([])
    for (const dominant of ['VI7', 'VI9', 'VI13', 'VI7b9']) {
      const suggestions = kind(config([dominant, 'ii']), 'secondary')
      expect(suggestions.some((s) => s.index === 1)).toBe(false)
    }
    expect(kind(config(['i'], true), 'secondary')).toEqual([])
  })
  it('adds the correct ii quality according to the actual target and skips duplicates', () => {
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const minor of [false, true]) {
      for (const [target, ii] of [['I', 'ii7'], ['i', 'ii\u00f87'], ['vi', 'vii\u00f87'], ['IV', 'v7']]) {
        const dominant = target === 'vi' ? 'III7' : target === 'IV' ? 'I7' : 'V7'
        const c = config([dominant, target], minor, [2.5, 6], keyPc)
        const related = kind(c, 'twoFive')[0]
        expect(related.result.romans).toEqual([ii, dominant, target])
        expect(related.result.durations).toEqual([1.25, 1.25, 6])
        expect(kind(config([ii, dominant, target], minor), 'twoFive')).toEqual([])
      }
    }
    expect(kind(config(['V', 'I']), 'twoFive')[0].result.romans).toEqual(['ii7', 'V', 'I'])
    for (const v of ['v', 'Vmaj7', 'V7sus4', 'V+7']) expect(kind(config([v, 'I']), 'twoFive')).toEqual([])
    expect(kind(config(['V7', 'IV']), 'twoFive')).toEqual([])
    expect(kind(config(['V7']), 'twoFive')).toEqual([])
  })
  it('borrows only notes belonging to the actual parallel scale', () => {
    for (let keyPc = 0; keyPc < 12; keyPc++) for (const minor of [false, true]) {
      const c = config(minor ? ['i', 'iv', 'v', 'bVI', 'bIII', 'ii\u00f87'] : ['IV', 'vi', 'iii', 'V', 'ii7'], minor, undefined, keyPc)
      const borrowed = kind(c, 'borrowed')
      expect(borrowed).toHaveLength(minor ? 6 : 5)
      const parallel = buildScale(MAJOR_ROOTS[keyPc], minor ? 'major' : 'naturalMinor').map(pitchClass)
      const home = buildScale(MAJOR_ROOTS[keyPc], minor ? 'naturalMinor' : 'major').map(pitchClass)
      for (const s of borrowed) {
        const changed = reharmChords(keyPc, minor, s.result)[s.index]
        const tones = buildChord(changed.root, changed.type).map(pitchClass)
        expect(tones.every((pc) => parallel.includes(pc))).toBe(true)
        expect(tones.some((pc) => !home.includes(pc))).toBe(true)
      }
    }
    expect(kind(config(['IV', 'vi', 'iii', 'V', 'ii7']), 'borrowed').map((s) => s.result.romans[s.index])).toEqual(['iv', 'bVI', 'bIII', 'bVII', 'ii\u00f87'])
    expect(kind(config(['V7', 'i'], true), 'borrowed').some((s) => s.index === 0)).toBe(false)
  })
  it('preserves the finite pass, timing, insertion order and capacity limits', () => {
    for (const beats of [0.25, 0.75, 1.25, 31.75]) {
      expect(kind(config(['vi'], false, [beats]), 'secondary')).toEqual([])
      expect(kind(config(['V7', 'I'], false, [beats, 4]), 'twoFive')).toEqual([])
    }
    expect(kind(config(['V7', 'I'], false, [0.5, 4]), 'twoFive')[0].result.durations).toEqual([0.25, 0.25, 4])
    const c = config([...Array(62).fill('I'), 'V7', 'I'])
    expect(suggestReharmonisations(c).every((s) => s.result.romans.length === 64)).toBe(true)
    expect(kind(config(['vi', 'I', 'III7']), 'secondary')[0].result.romans).toEqual(['III7', 'vi', 'I', 'III7'])
    expect(kind(config(['I', 'V7']), 'twoFive')).toEqual([])
    expect(kind(config(['vi', 'ii'], false, [0.25, 0.25]), 'secondary').some((s) => s.result.romans.join() === 'VI7,ii')).toBe(true)
  })
  it('invalidates stale source identities and gives isolated result arrays', () => {
    const original = config()
    const old = suggestReharmonisations(original)
    const altered = config(['I', 'vi', 'ii', 'V7', 'I'], false, [4, 4, 4, 2, 4])
    for (const next of [altered, { ...original, keyPc: 1 }, { ...original, minor: true }, config(['I', 'vi', 'ii7', 'V7', 'I'])]) {
      expect(suggestReharmonisations(next).some((s) => old.some((o) => o.id === s.id))).toBe(false)
    }
    old[0].result.romans[0] = 'V'
    old[0].result.durations[0] = 1
    expect(original.working.romans[0]).toBe('I')
    expect(original.working.durations[0]).toBe(4)
    expect(old[1].result.romans[0]).toBe('I')
  })
})

describe('Looper transfer', () => {
  it('transfers the selected side, durations, key context, current BPM and instrument completely', () => {
    const c = config(['i', 'bVI', 'V7', 'i'], true, [0.25, 2.75, 4.5, 8], 9)
    c.bpm = 127
    c.working = { romans: ['i', 'iv', 'bII7', 'i'], durations: [1, 2, 3, 4] }
    for (const side of ['original', 'working'] as const) {
      const transfer = reharmLooperConfig(c, side, 'piano')
      expect(isToolPresetConfig('looper', transfer)).toBe(true)
      expect(transfer).toMatchObject({ romans: c[side].romans, durations: c[side].durations, keyPc: 9, keyMinor: true,
        bpm: 127, instrument: 'piano', targetOn: true, targetMode: 'guide', loopSection: { start: 0, end: 3 }, countInBeats: 0 })
      expect(transfer.romans).not.toBe(c[side].romans)
      expect(transfer.durations).not.toBe(c[side].durations)
    }
    c.mode = 'arpeggio'
    expect(reharmLooperConfig(c, 'working', 'guitar-nylon').style).toBe('arpeggio')
    expect(isToolPresetConfig('looper', reharmLooperConfig(null as unknown as ReharmConfig, 'working', 'piano'))).toBe(true)
  })
})
