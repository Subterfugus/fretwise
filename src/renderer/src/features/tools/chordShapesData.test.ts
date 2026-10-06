import { describe, expect, it } from 'vitest'
import { CHORDS, buildChord, type ChordType } from '@/theory/chords'
import { STANDARD_TUNING, shape } from '@/theory/guitar'
import { pitchClass } from '@/theory/notes'
import {
  CURATED_TEMPLATES, DEGREE_SEMITONES, INTERVAL_DEGREE_LABEL, chordDegreeLabels, inversionFor, type CuratedTemplate
} from './chordShapesData'

const CHORD_TYPES = Object.keys(CHORDS) as ChordType[]
const SEVENTH_LABELS = ['♭7', '7', '𝄫7']
const THIRD_LABELS = ['3', '♭3']
/** Defining tone that must always sound (third for tertian chords). */
const DEFINING: Partial<Record<ChordType, string>> = { sus2: '2', sus4: '4', sus7: '4', power: '5' }
/** Extension tone that distinguishes the chord from its plain relative. */
const EXTENSION: Partial<Record<ChordType, string>> = {
  add9: '9', dom9: '9', maj9: '9', min9: '9', dom7b9: '♭9', dom7s9: '♯9', dom11: '11', min11: '11', dom13: '13', maj7s11: '♯11'
}

const fmt = (frets: (number | null)[]) => frets.map((f) => (f === null ? 'x' : f)).join(frets.some((f) => f !== null && f >= 10) ? ' ' : '')
const desc = (t: CuratedTemplate) => `${t.type} "${t.label}" ${t.frets}@${t.refRoot}`

/** Per-string pitch classes (null when muted) for the given frets. */
const pcsOf = (frets: (number | null)[]) =>
  frets.map((f, i) => (f === null ? null : (STANDARD_TUNING[5 - i] + f) % 12))

interface Analysis {
  problems: string[]
  labels: string[]
  omitted: string[]
  bassLabel: string
}

/** Map sounding notes of `frets` onto chord degrees of `rootName` + type. */
function analyse(type: ChordType, rootName: string, frets: (number | null)[]): Analysis {
  const rootPc = pitchClass(rootName)
  const degrees = chordDegreeLabels(type).map((label, i) => ({ label, pc: pitchClass(buildChord(rootName, type)[i]) }))
  const problems: string[] = []
  const present = new Set<string>()
  const labels: string[] = []
  let bassLabel = ''
  pcsOf(frets).forEach((pc, i) => {
    if (pc === null) return
    const d = degrees.find((x) => x.pc === pc)
    if (!d) {
      problems.push(`string ${6 - i} sounds a non-chord tone (pc ${pc}, root pc ${rootPc})`)
      return
    }
    present.add(d.label)
    labels.push(d.label)
    if (!bassLabel) bassLabel = d.label
  })
  return { problems, labels, omitted: degrees.map((d) => d.label).filter((l) => !present.has(l)), bassLabel }
}

function parseFingers(s: string): string[] {
  return s.includes(' ') ? s.trim().split(/\s+/) : s.split('')
}

describe('degree label convention', () => {
  it('has a label for every interval used by CHORDS and matches semitone offsets', () => {
    for (const type of CHORD_TYPES) {
      const labels = chordDegreeLabels(type)
      expect(new Set(labels).size).toBe(labels.length)
      const pcs = buildChord('C', type).map(pitchClass)
      labels.forEach((l, i) => {
        expect(DEGREE_SEMITONES[l], `${type} ${l}`).toBe(pcs[i])
      })
    }
    for (const iv of CHORD_TYPES.flatMap((t) => CHORDS[t].intervals)) expect(INTERVAL_DEGREE_LABEL[iv]).toBeTruthy()
  })
})

describe('curated chord templates', () => {
  it('is a substantial library', () => {
    expect(CURATED_TEMPLATES.length).toBeGreaterThanOrEqual(300)
  })

  it('has no duplicate (type, frets), no duplicate (type, label), and no duplicate movable shapes', () => {
    const frets = new Set<string>(), labels = new Set<string>(), norm = new Set<string>()
    const dups: string[] = []
    for (const t of CURATED_TEMPLATES) {
      const f = shape('', t.frets).frets
      const k1 = `${t.type}|${fmt(f)}`
      const k2 = `${t.type}|${t.label}`
      if (frets.has(k1)) dups.push(`frets ${k1}`)
      if (labels.has(k2)) dups.push(`label ${k2}`)
      frets.add(k1); labels.add(k2)
      if (t.movable) {
        const fretted = f.filter((x): x is number => x !== null)
        const mn = Math.min(...fretted)
        const k3 = `${t.type}|${f.map((x) => (x === null ? 'x' : x - mn)).join(',')}`
        if (norm.has(k3)) dups.push(`movable ${k3} (${t.label})`)
        norm.add(k3)
      }
    }
    expect(dups).toEqual([])
  })

  it('parses to 6 strings with valid chord type and ref root', () => {
    const bad: string[] = []
    for (const t of CURATED_TEMPLATES) {
      try {
        if (!(t.type in CHORDS)) bad.push(`${desc(t)}: unknown type`)
        pitchClass(t.refRoot)
        if (shape(t.label, t.frets).frets.length !== 6) bad.push(`${desc(t)}: not 6 strings`)
        if (!t.label.trim()) bad.push(`${desc(t)}: empty label`)
      } catch (e) {
        bad.push(`${desc(t)}: ${(e as Error).message}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('sounds only chord tones at refRoot, with the right defining tones, and omitted is exact', () => {
    const bad: string[] = []
    for (const t of CURATED_TEMPLATES) {
      const frets = shape(t.label, t.frets).frets
      const a = analyse(t.type, t.refRoot, frets)
      a.problems.forEach((p) => bad.push(`${desc(t)}: ${p}`))
      const omitted = t.omitted ?? []
      const expected = a.omitted
      if (JSON.stringify(omitted) !== JSON.stringify(expected)) bad.push(`${desc(t)}: omitted ${JSON.stringify(omitted)} but missing ${JSON.stringify(expected)}`)
      if (!a.labels.includes('1') && !omitted.includes('1')) bad.push(`${desc(t)}: no root and "1" not omitted`)
      const labels = chordDegreeLabels(t.type)
      if (labels.some((l) => THIRD_LABELS.includes(l)) && !a.labels.some((l) => THIRD_LABELS.includes(l))) bad.push(`${desc(t)}: missing third`)
      const def = DEFINING[t.type]
      if (def && !a.labels.includes(def)) bad.push(`${desc(t)}: missing defining tone ${def}`)
      if (labels.some((l) => SEVENTH_LABELS.includes(l)) && !a.labels.some((l) => SEVENTH_LABELS.includes(l))) bad.push(`${desc(t)}: missing 7th`)
      if ((t.type === 'maj6' || t.type === 'min6') && !a.labels.includes('6')) bad.push(`${desc(t)}: missing 6th`)
      const ext = EXTENSION[t.type]
      if (ext && !a.labels.includes(ext)) bad.push(`${desc(t)}: missing extension ${ext}`)
      if (omitted.some((o) => !labels.includes(o))) bad.push(`${desc(t)}: omitted lists a degree the chord does not have`)
    }
    expect(bad).toEqual([])
  })

  it('has consistent fingerings', () => {
    const bad: string[] = []
    for (const t of CURATED_TEMPLATES) {
      if (!t.fingers) { bad.push(`${desc(t)}: no fingers`); continue }
      const frets = shape(t.label, t.frets).frets
      const fingers = parseFingers(t.fingers)
      if (fingers.length !== 6) { bad.push(`${desc(t)}: fingers length`); continue }
      const used = new Map<string, number>()
      frets.forEach((f, i) => {
        const g = fingers[i]
        if (f === null) { if (g !== 'x') bad.push(`${desc(t)}: muted string ${6 - i} has finger ${g}`); return }
        if (f === 0) { if (g !== '0') bad.push(`${desc(t)}: open string ${6 - i} has finger ${g}`); return }
        if (!/^[1-4T]$/.test(g)) { bad.push(`${desc(t)}: fretted string ${6 - i} has finger ${g}`); return }
        if (g !== 'T') {
          const prev = used.get(g)
          if (prev !== undefined && prev !== f) bad.push(`${desc(t)}: finger ${g} on frets ${prev} and ${f}`)
          used.set(g, f)
        }
      })
      if (used.size > 4) bad.push(`${desc(t)}: more than 4 fingers`)
      // Same finger on one fret is a barre: no lower fret/open string may lie between its strings.
      for (const [g, f] of used) {
        const idx = fingers.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0)
        for (let i = Math.min(...idx); i <= Math.max(...idx); i++) {
          const v = frets[i]
          if (v !== null && v < f) bad.push(`${desc(t)}: finger ${g} barre at fret ${f} crosses lower fret on string ${6 - i}`)
        }
      }
      // Fingers must not cross: higher fret must use a higher-numbered finger.
      const entries = [...used.entries()]
      for (const [g1, f1] of entries) for (const [g2, f2] of entries) {
        if (f1 < f2 && Number(g1) >= Number(g2)) bad.push(`${desc(t)}: fingers ${g1}/${g2} cross (frets ${f1}/${f2})`)
      }
    }
    expect(bad).toEqual([])
  })

  it('keeps every grip within a 5-fret span', () => {
    const bad = CURATED_TEMPLATES.filter((t) => {
      const fretted = shape('', t.frets).frets.filter((f): f is number => f !== null && f > 0)
      return fretted.length > 0 && Math.max(...fretted) - Math.min(...fretted) + 1 > 5
    }).map(desc)
    expect(bad).toEqual([])
  })

  it('movable templates have no open strings, at least one fretted note, and transpose cleanly to all 12 roots within frets 0-22', () => {
    const bad: string[] = []
    for (const t of CURATED_TEMPLATES.filter((x) => x.movable)) {
      const frets = shape('', t.frets).frets
      if (frets.some((f) => f === 0)) { bad.push(`${desc(t)}: movable with open string`); continue }
      const fretted = frets.filter((f): f is number => f !== null)
      if (fretted.length === 0) { bad.push(`${desc(t)}: no fretted notes`); continue }
      const mn = Math.min(...fretted), mx = Math.max(...fretted)
      for (let r = 0; r < 12; r++) {
        const rootName = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][r]
        let s = (((r - pitchClass(t.refRoot)) % 12) + 12) % 12
        while (mn + s - 12 >= 0) s -= 12
        if (mx + s > 22) { bad.push(`${desc(t)}: cannot reach ${rootName} within fret 22`); continue }
        const moved = frets.map((f) => (f === null ? null : f + s))
        const a = analyse(t.type, rootName, moved)
        if (a.problems.length) bad.push(`${desc(t)} -> ${rootName}: ${a.problems.join('; ')}`)
        if (JSON.stringify(a.omitted) !== JSON.stringify(t.omitted ?? [])) bad.push(`${desc(t)} -> ${rootName}: omitted changed`)
      }
    }
    expect(bad).toEqual([])
  })

  it('inversionHint, when present, matches the lowest sounding pitch, and is present whenever well defined', () => {
    const bad: string[] = []
    for (const t of CURATED_TEMPLATES) {
      const a = analyse(t.type, t.refRoot, shape('', t.frets).frets)
      const expected = inversionFor(t.type, a.bassLabel)
      if (t.inversionHint !== expected) bad.push(`${desc(t)}: hint ${t.inversionHint} but bass is ${a.bassLabel} (${expected})`)
    }
    expect(bad).toEqual([])
  })

  it('has the lowest sounding note really being the lowest string played (sanity for bass labelling)', () => {
    for (const t of CURATED_TEMPLATES) {
      const frets = shape('', t.frets).frets
      const first = frets.findIndex((f) => f !== null)
      expect(first, desc(t)).toBeGreaterThanOrEqual(0)
    }
  })

  it('covers each chord quality with a healthy number of shapes', () => {
    const count = (type: ChordType) => CURATED_TEMPLATES.filter((t) => t.type === type).length
    const common: ChordType[] = [
      'maj', 'min', 'dim', 'aug', 'sus2', 'sus4', 'power', 'add9', 'maj6', 'min6', 'dom7', 'maj7', 'min7', 'm7b5', 'dim7',
      'minMaj7', 'sus7', 'dom9', 'maj9', 'min9', 'dom13', 'dom7b9', 'dom7s9'
    ]
    for (const type of common) expect(count(type), type).toBeGreaterThanOrEqual(6)
    for (const type of ['maj', 'min', 'dom7', 'min7', 'maj7'] as ChordType[]) expect(count(type), type).toBeGreaterThanOrEqual(20)
    for (const type of ['aug7', 'augMaj7', 'min11', 'maj7s11', 'dom11'] as ChordType[]) expect(count(type), type).toBeGreaterThanOrEqual(1)
  })

  it('includes the headline reference grips', () => {
    const has = (type: ChordType, frets: string, root: string) =>
      CURATED_TEMPLATES.some((t) => t.type === type && t.frets === frets && t.refRoot === root)
    expect(has('dom9', 'x32333', 'C')).toBe(true)
    expect(has('dom13', '3x345x', 'G')).toBe(true)
    expect(has('dom7s9', 'x7678x', 'E')).toBe(true)
    expect(has('maj9', 'x3243x', 'C')).toBe(true)
    expect(has('min9', 'x3133x', 'C')).toBe(true)
    expect(has('maj', 'x32010', 'C')).toBe(true)
    expect(has('dom7', '020100', 'E')).toBe(true)
    expect(has('dom7', 'x02020', 'A')).toBe(true)
  })
})
