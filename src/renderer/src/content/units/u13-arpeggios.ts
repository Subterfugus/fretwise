import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { chordToneMarks, mc, playChord, playMarks, playScale, rand, randInt } from '../helpers'
import {
  FretPos,
  OPEN_CHORDS,
  cagedSequence,
  midiAt,
  movableChord,
  nameAt,
  openMidi,
  pcAt,
  positionsOf,
  shapeMidis,
  shapePositions
} from '@/theory/guitar'
import { CHORDS, ChordType, buildChord, chordNames, chordSymbol, diatonicChords } from '@/theory/chords'
import { midiToName, mod, pitchClass, pretty } from '@/theory/notes'
import { progressionExample, type ToolExample } from '../toolExamples'

// ---------- local helpers ----------

const pr = (s: string) => pretty(s)
const spelled = (root: string, type: ChordType) => chordNames(root, type).map(pr).join(' ')
const P = (string: number, fret: number): FretPos => ({ string, fret })

type ArpType = 'maj' | 'min' | 'dim' | 'aug' | 'maj7' | 'dom7' | 'min7' | 'm7b5' | 'dim7'

/** Chord-tone labels in formula order. */
const DEG: Record<ArpType, string[]> = {
  maj: ['R', '3', '5'],
  min: ['R', '♭3', '5'],
  dim: ['R', '♭3', '♭5'],
  aug: ['R', '3', '♯5'],
  maj7: ['R', '3', '5', '7'],
  dom7: ['R', '3', '5', '♭7'],
  min7: ['R', '♭3', '5', '♭7'],
  m7b5: ['R', '♭3', '♭5', '♭7'],
  dim7: ['R', '♭3', '♭5', '♭♭7']
}

/**
 * Arpeggio templates, written as "semitones-above-root:string". The fret of every note is
 * worked out from the tuning, so a template is correct for any root. Ascending order.
 */
const TEMPLATES = {
  // one octave, R 3 5 R
  one: {
    6: { maj: '0:6 4:5 7:5 12:4', min: '0:6 3:6 7:5 12:4', dim: '0:6 3:6 6:5 12:4', aug: '0:6 4:5 8:5 12:4' },
    5: { maj: '0:5 4:4 7:4 12:3', min: '0:5 3:5 7:4 12:3', dim: '0:5 3:5 6:4 12:3', aug: '0:5 4:4 8:4 12:3' }
  },
  // two octaves, R 3 5 R 3 5 R
  two: {
    6: {
      maj: '0:6 4:5 7:5 12:4 16:3 19:2 24:1',
      min: '0:6 3:6 7:5 12:4 15:3 19:2 24:1',
      dim: '0:6 3:6 6:5 12:4 15:3 18:2 24:1',
      aug: '0:6 4:5 8:5 12:4 16:3 20:2 24:1'
    },
    5: {
      maj: '0:5 4:4 7:4 12:3 16:2 19:1 24:1',
      min: '0:5 3:5 7:4 12:3 15:2 19:1 24:1',
      dim: '0:5 3:5 6:4 12:3 15:2 18:2 24:1',
      aug: '0:5 4:4 8:4 12:3 16:2 20:1 24:1'
    }
  },
  // seventh chords: two octaves from a 6th-string root, R 3 5 7 R (one octave plus) from a 5th-string root
  sev: {
    6: {
      maj7: '0:6 4:5 7:5 11:4 12:4 16:3 19:2 23:1 24:1',
      dom7: '0:6 4:5 7:5 10:4 12:4 16:3 19:2 22:2 24:1',
      min7: '0:6 3:6 7:5 10:4 12:4 15:3 19:2 22:2 24:1',
      m7b5: '0:6 3:6 6:5 10:4 12:4 15:3 18:2 22:2 24:1',
      dim7: '0:6 3:6 6:5 9:4 12:4 15:3 18:2 21:2 24:1'
    },
    5: {
      maj7: '0:5 4:4 7:4 11:3 12:3',
      dom7: '0:5 4:4 7:4 10:3 12:3',
      min7: '0:5 3:5 7:4 10:3 12:3',
      m7b5: '0:5 3:5 6:4 10:3 12:3',
      dim7: '0:5 3:5 6:4 9:3 12:3'
    }
  }
} as const

type TemplateSet = keyof typeof TEMPLATES

interface ArpNote extends FretPos {
  toolExample: ToolExample
  /** semitones above the root (0..24) */
  k: number
  /** chord-tone label: R 3 5 ♭7 ... */
  deg: string
  midi: number
}

/**
 * The notes of a movable arpeggio shape for `root`, ascending. Unless `rootFret` is given the
 * lowest position without open strings is used.
 */
function arp(root: string, type: ArpType, rootString: 5 | 6, set: TemplateSet, rootFret?: number): ArpNote[] {
  const group = TEMPLATES[set][rootString] as Record<string, string>
  const tpl = group[type]
  if (!tpl) throw new Error(`No ${set} template for ${type} on string ${rootString}`)
  const parsed = tpl.split(' ').map((t) => {
    const [k, string] = t.split(':').map(Number)
    return { k, string }
  })
  const rootPc = pitchClass(root)
  const semis = buildChord(root, type).map((n) => mod(pitchClass(n) - rootPc, 12))
  const build = (r: number): ArpNote[] =>
    parsed.map(({ k, string }) => {
      const midi = openMidi(rootString) + r + k
      const idx = semis.indexOf(mod(k, 12))
      return { string, fret: midi - openMidi(string), k, deg: DEG[type][idx], midi, toolExample: { kind: 'chord', root, type } }
    })
  let r = rootFret ?? mod(rootPc - mod(openMidi(rootString), 12), 12)
  if (rootFret === undefined) while (build(r).some((n) => n.fret < 1)) r += 12
  return build(r)
}

/** "6: +0, +3 · 5: −1 …" fret offsets from the root fret, per string, for the one-octave shapes. */
function offsetText(type: ArpType, rs: 5 | 6): string {
  const ns = arp('A', type, rs, 'one', 12)
  const strings = [...new Set(ns.map((n) => n.string))]
  const sign = (d: number) => (d >= 0 ? `+${d}` : `−${-d}`)
  return strings.map((s) => `${s}: ${ns.filter((n) => n.string === s).map((n) => sign(n.fret - 12)).join(', ')}`).join(' · ')
}

const marksOf = (ns: ArpNote[], accentSeventh = false): FretMark[] =>
  ns.map((n) => ({
    string: n.string,
    fret: n.fret,
    label: n.deg,
    toolExample: n.toolExample,
    color: n.deg === 'R' ? 'root' : accentSeventh && /7$/.test(n.deg) ? 'accent' : 'tone'
  }))

const span = (ns: FretPos[], pad = 1): [number, number] => [Math.max(0, Math.min(...ns.map((n) => n.fret)) - pad), Math.max(...ns.map((n) => n.fret)) + pad]

const tabOf = (ns: FretPos[], beats = 0.5, lastBeats = 2) => ns.map((n, i) => ({ pos: [P(n.string, n.fret)], beats: i === ns.length - 1 ? lastBeats : beats }))
const upDown = <T,>(ns: T[]): T[] => [...ns, ...ns.slice(0, -1).reverse()]

/** Tab from compact text: "3:5 3:7 4:7/2" = string:fret, "/n" = beats. */
function tab(spec: string, beats = 1): { pos: FretPos[]; beats: number }[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [notes, len] = tok.split('/')
      return {
        pos: notes.split('+').map((n) => {
          const [s, f] = n.split(':').map(Number)
          return P(s, f)
        }),
        beats: len ? Number(len) : beats
      }
    })
}

/** Single notes in order (MIDI numbers). */
const noteSeq = (midis: number[], beats = 0.5, bpm = 100, lastBeats = 2): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: midis.map((n, i) => ({ notes: [n], beats: i === midis.length - 1 ? lastBeats : beats }))
})
const playArp = (ns: ArpNote[], dir: 'up' | 'updown' = 'up', bpm = 100): PlaySpec => {
  const mids = ns.map((n) => n.midi)
  return { ...noteSeq(dir === 'up' ? mids : upDown(mids), 0.5, bpm), toolExample: ns[0]?.toolExample }
}
const tabSpec = (events: { pos: FretPos[]; beats?: number }[], bpm = 90): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: events.map((e) => ({ notes: e.pos.map((p) => midiAt(p)), beats: e.beats ?? 1, mode: e.pos.length > 1 ? ('strum' as const) : ('block' as const) }))
})
const targetsOf = (ns: ArpNote[]): string[] => ns.map((n) => midiToName(n.midi))

/** Movable chord shape (with a clear failure if the form does not exist). */
function mvShape(root: string, type: ChordType, rs: 5 | 6) {
  const s = movableChord(root, type, rs)
  if (!s) throw new Error(`No ${type} form on string ${rs}`)
  return s
}
const chordSeq = (shapes: { frets: (number | null)[] }[], context: ToolExample, beats = 2, bpm = 80): PlaySpec => ({
  kind: 'sequence',
  toolExample: context,
  bpm,
  events: shapes.map((s) => ({
    notes: shapeMidis({ name: '', frets: s.frets }),
    beats,
    mode: 'strum' as const
  }))
})

const TYPE_NAME: Record<ArpType, string> = {
  maj: 'major triad',
  min: 'minor triad',
  dim: 'diminished triad',
  aug: 'augmented triad',
  maj7: 'major 7th',
  dom7: 'dominant 7th',
  min7: 'minor 7th',
  m7b5: 'half-diminished (m7♭5)',
  dim7: 'diminished 7th'
}
const arpSymbol = (root: string, type: ArpType) => pr(chordSymbol(root, type))
const TRIADS: ArpType[] = ['maj', 'min', 'dim', 'aug']
const SEVENTHS: ArpType[] = ['maj7', 'dom7', 'min7', 'm7b5', 'dim7']
const ordinal = (n: number) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][n]
const hasDouble = (names: string[]) => names.some((n) => /##|bb/.test(n.slice(1)))

/** All chord-tone positions of root+type inside a fret window. */
function toneTargets(root: string, type: ChordType, lo: number, hi: number): FretPos[] {
  return buildChord(root, type).flatMap((t) => positionsOf(t, lo, hi))
}

// ---------- shapes used in the lessons ----------

const A_MIN_ONE = arp('A', 'min', 6, 'one') // 6:5 6:8 5:7 4:7
const G_MAJ_ONE = arp('G', 'maj', 6, 'one')
const G_MIN_ONE = arp('G', 'min', 6, 'one')
const B_DIM_ONE = arp('B', 'dim', 6, 'one')
const G_AUG_ONE = arp('G', 'aug', 6, 'one')
const C_MAJ_ONE5 = arp('C', 'maj', 5, 'one')
const D_MIN_ONE5 = arp('D', 'min', 5, 'one')

const G_MAJ_TWO = arp('G', 'maj', 6, 'two')
const G_MIN_TWO = arp('G', 'min', 6, 'two')
const B_DIM_TWO = arp('B', 'dim', 6, 'two')
const G_AUG_TWO = arp('G', 'aug', 6, 'two')
const C_MAJ_TWO5 = arp('C', 'maj', 5, 'two')
const D_MIN_TWO5 = arp('D', 'min', 5, 'two')
const A_MIN_TWO = arp('A', 'min', 6, 'two')

const A_SEV = Object.fromEntries(SEVENTHS.map((t) => [t, arp('A', t, 6, 'sev')])) as Record<ArpType, ArpNote[]>
const C_MAJ7_5 = arp('C', 'maj7', 5, 'sev')

const C_FORMS = cagedSequence('C')
const FORM_ARPS = C_FORMS.map((f) =>
  shapePositions(f.shape)
    .map((p) => ({ ...p, midi: midiAt(p) }))
    .sort((a, b) => a.midi - b.midi)
)

// progression lines (tab text: string:fret)
const II_V_I_LINE = '4:7 4:10 3:7 3:10 3:10 3:7 4:9 5:10 5:10 4:9 4:10 3:9 4:10/4'
const I_VI_IV_V_LINE = '6:3 5:2 5:5 4:5 3:4 4:5 4:2/2 4:2 4:5 3:5 2:5 2:3 3:2 4:4 5:5 4:5/4'

// ---------- generated questions ----------

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab', 'F#', 'C#', 'Db']
const ALL_TYPES: ArpType[] = [...TRIADS, ...SEVENTHS]

const spellArp = (): QuizQuestion => {
  let root = 'C'
  let type: ArpType = 'maj'
  let names: string[] = []
  do {
    root = rand(ROOTS)
    type = rand(ALL_TYPES)
    names = chordNames(root, type)
  } while (hasDouble(names))
  return {
    kind: 'spell',
    prompt: `Spell the **${arpSymbol(root, type)}** arpeggio (${TYPE_NAME[type]}), root first, low to high.`,
    answer: names,
    explain: `Formula **${CHORDS[type].formula}** from ${pr(root)}: **${names.map(pr).join(' ')}**. An arpeggio plays exactly these chord tones one at a time.`
  }
}

const windowTones = (): QuizQuestion => {
  const type = rand(['maj', 'min', 'dim'] as ArpType[])
  for (;;) {
    const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb'])
    const lo = randInt(2, 10)
    const hi = lo + 3
    const targets = toneTargets(root, type, lo, hi)
    if (targets.length < 5 || targets.length > 9) continue
    const names = chordNames(root, type).map(pr).join(' ')
    return {
      kind: 'fretboard',
      mode: 'all',
      prompt: `Select **every** note of the **${arpSymbol(root, type)}** arpeggio (${names}) between frets **${lo} and ${hi}**, on all six strings.`,
      frets: [lo, hi],
      targets,
      explain: `${arpSymbol(root, type)} contains **${names}**. There are ${targets.length} places for those notes in this four-fret window. Check each string in turn.`
    }
  }
}

const hearTriad = (): QuizQuestion => {
  const type = rand(TRIADS)
  const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'])
  const LABEL: Record<string, string> = { maj: 'Major', min: 'Minor', dim: 'Diminished', aug: 'Augmented' }
  const FEEL: Record<string, string> = {
    maj: 'bright and settled',
    min: 'darker and more serious',
    dim: 'tense and compressed, with a sinking ♭5',
    aug: 'bright but unsettled, with a stretched ♯5'
  }
  return mc('Listen to this arpeggio. What kind of triad is it?', LABEL[type], TRIADS.filter((t) => t !== type).map((t) => LABEL[t]), {
    play: playChord(root, type, 3, 'arpeggio'),
    explain: `That was **${arpSymbol(root, type)}** (${CHORDS[type].formula}): ${FEEL[type]}.`
  })
}

const hearSeventh = (): QuizQuestion => {
  const type = rand(SEVENTHS)
  const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'])
  const LABEL: Partial<Record<ArpType, string>> = { maj7: 'Major 7th', dom7: 'Dominant 7th', min7: 'Minor 7th', m7b5: 'Half-diminished (m7♭5)', dim7: 'Diminished 7th' }
  const FEEL: Partial<Record<ArpType, string>> = {
    maj7: 'soft and dreamy',
    dom7: 'bluesy and restless',
    min7: 'mellow',
    m7b5: 'dark and unresolved',
    dim7: 'tense and symmetrical'
  }
  return mc('Listen to this seventh-chord arpeggio. Which quality is it?', LABEL[type]!, SEVENTHS.filter((t) => t !== type).map((t) => LABEL[t]!), {
    play: playChord(root, type, 3, 'arpeggio'),
    explain: `That was **${arpSymbol(root, type)}** (${CHORDS[type].formula}): ${FEEL[type]}.`
  })
}

const KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb']
const whichArpFits = (): QuizQuestion => {
  const key = rand(KEYS)
  const c = rand(diatonicChords(key, 'major', true))
  const choices = (['maj7', 'dom7', 'min7', 'm7b5'] as ChordType[]).map((t) => pr(chordSymbol(c.root, t)))
  return mc(`You are soloing in **${pr(key)} major** over the **${c.roman}** chord, built on ${pr(c.root)}. Which seventh-chord arpeggio fits?`, pr(c.symbol), choices, {
    explain: `Stacking thirds from ${pr(c.root)} using only notes of ${pr(key)} major gives **${pr(c.symbol)}** (${CHORDS[c.type].formula}). Its arpeggio is **${spelled(c.root, c.type)}**.`
  })
}

const shapeFret = (): QuizQuestion => {
  const type = rand(['maj', 'min'] as ArpType[])
  const root = rand(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'Bb', 'C#', 'F#'])
  const rf = mod(pitchClass(root) - 4, 12) || 12
  const choices = type === 'maj'
    ? [
        { label: '3rd', pos: P(5, rf - 1), where: 'one fret below the root fret' },
        { label: '5th', pos: P(5, rf + 2), where: 'two frets above the root fret' },
        { label: 'octave root', pos: P(4, rf + 2), where: 'two frets above the root fret' }
      ]
    : [
        { label: '♭3', pos: P(6, rf + 3), where: 'three frets above the root, on the same string' },
        { label: '5th', pos: P(5, rf + 2), where: 'two frets above the root fret' },
        { label: 'octave root', pos: P(4, rf + 2), where: 'two frets above the root fret' }
      ]
  const t = rand(choices)
  const notes = chordNames(root, type)
  const name = t.label === '5th' ? notes[2] : t.label === 'octave root' ? notes[0] : notes[1]
  return {
    kind: 'fretboard',
    prompt: `The root of an **${arpSymbol(root, type)}** arpeggio is marked on the 6th string, fret ${rf}. Using the standard movable shape, click its **${t.label}** on the **${ordinal(t.pos.string)} string**.`,
    marks: [{ string: 6, fret: rf, label: 'R', color: 'root' }],
    frets: [Math.max(0, rf - 3), rf + 6],
    targets: [t.pos],
    explain: `The ${t.label} is **${pr(name)}**: ${t.where} (${ordinal(t.pos.string)} string, fret ${t.pos.fret}). Shape: ${type === 'maj' ? '6th string R, then 3 and 5 on the 5th string, then R on the 4th' : '6th string R and ♭3, then 5 on the 5th string, then R on the 4th'}.`
  }
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u13',
  number: 13,
  title: 'Arpeggios across the neck',
  summary: 'Chord tones one at a time: triad and seventh-chord arpeggio shapes, how they grow out of your chord shapes, soloing over changes, sweep and economy picking, and practice patterns.',
  elective: true,
  requires: ['u9'],
  lessons: [
    // ======================================================== 1
    {
      id: 'u13l1',
      title: 'What an arpeggio is, and why it matters',
      summary: 'Arpeggio versus scale, and how chord tones turn a solo into something that fits the chord.',
      blocks: [
        {
          type: 'text',
          md: `An **arpeggio** is a chord played **one note at a time**. Instead of strumming A–C–E together, you play A, then C, then E. The word comes from the Italian *arpeggiare*, "to play like a harp".

You already know the ingredients. A triad is **root, 3rd, 5th**; a seventh chord adds the **7th**. An arpeggio is just those **chord tones**, in order, across the strings.

How is that different from a scale? Compare **A minor** in both forms:`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Am chord (strummed)', play: playChord('A', 'min', 3, 'strum') },
            { label: 'Am arpeggio', play: playChord('A', 'min', 3, 'arpeggio') },
            { label: 'A natural minor scale', play: playScale('A', 'aeolian', 3) }
          ]
        },
        {
          type: 'table',
          headers: ['', 'A natural minor scale', 'Am arpeggio'],
          rows: [
            ['Notes', 'A B C D E F G (7 notes)', 'A C E (3 notes)'],
            ['Formula', '1 2 ♭3 4 5 ♭6 ♭7', '1 ♭3 5 (every other scale note)'],
            ['Steps', 'neighbouring notes, mostly steps', 'leaps of a 3rd or more'],
            ['Sound', 'flowing, melodic, fits the key', 'outlines the chord itself']
          ],
          caption: 'An arpeggio is the scale with every other note kept: degrees 1, 3, 5 (and 7 for a seventh chord).'
        },
        {
          type: 'fretboard',
          marks: [...arp('A', 'min', 6, 'two').map((n) => ({ string: n.string, fret: n.fret, label: n.deg, toolExample: n.toolExample, color: (n.deg === 'R' ? 'root' : 'tone') as FretMark['color'] }))],
          frets: [3, 10],
          caption: 'The Am arpeggio low to high: R ♭3 5 R ♭3 5 R. Seven notes cover two octaves between frets 5 and 8.',
          playAll: true
        },
        {
          type: 'text',
          md: `### Why soloists care
Over an Am chord, every note of A minor "works" in the loose sense of being in the key. But the notes do not all feel the same:
- **Chord tones (A, C, E)** sound *at home*. They agree with the chord underneath.
- **The other scale notes (B, D, F, G)** sound like *passing* notes: tension that needs to go somewhere.

A solo that lands on **chord tones on the strong beats** and uses scale notes in between sounds like it knows where the harmony is. This is called **targeting chord tones**, and the arpeggio is how you learn where they live on the neck.`
        },
        {
          type: 'fretboard',
          marks: [
            ...(['A', 'C', 'E'] as const).flatMap((n) =>
              positionsOf(n, 4, 9).map((p) => ({ ...p, label: n, color: (n === 'A' ? 'root' : 'tone') as FretMark['color'] }))
            ),
            ...(['B', 'D', 'F', 'G'] as const).flatMap((n) => positionsOf(n, 4, 9).map((p) => ({ ...p, label: n, color: 'ghost' as FretMark['color'] })))
          ],
          frets: [3, 10],
          caption: 'A natural minor, frets 4 to 9. The labelled A, C and E dots are chord tones of Am. Faint dots (B D F G) are the other scale notes.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'naturalMinor', frets: [4, 9] }, { kind: 'chord', root: 'A', type: 'min' }]
        },
        {
          type: 'text',
          md: `Here is the idea in tab. The line below walks down the A minor scale, but the note on **each beat** (beats 1, 2, 3 and 4) is a chord tone of Am: **E, C, A, E**. The notes in between are passing notes.`
        },
        {
          type: 'tab',
          caption: 'Scale line over Am, E D C B A G E. Beats fall on E, C, A, E (chord tones); D, B and G pass between them. The last bar lands on the root, A.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'naturalMinor' }, { kind: 'chord', root: 'A', type: 'min' }],
          bpm: 80,
          timeSig: '4/4',
          events: tab('2:5/0.5 3:7/0.5 3:5/0.5 3:4/0.5 3:2/0.5 4:5/0.5 4:2/1 4:7/4')
        },
        {
          type: 'audio',
          label: 'Am chord, then the line',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'naturalMinor' }, { kind: 'chord', root: 'A', type: 'min' }],
          play: {
            kind: 'sequence',
            bpm: 80,
            events: [
              { notes: shapeMidis(OPEN_CHORDS.Am), beats: 3, mode: 'strum' },
              ...tab('2:5/0.5 3:7/0.5 3:5/0.5 3:4/0.5 3:2/0.5 4:5/0.5 4:2/1 4:7/4').map((e) => ({ notes: e.pos.map((p) => midiAt(p)), beats: e.beats }))
            ]
          }
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Strong beats get chord tones.** Beats 1 and 3 (and the downbeat of a new chord) are where the ear checks the harmony. Land a chord tone there and the passing notes in between sound intentional. The 3rd and 7th are the most revealing: they tell the listener whether the chord is major, minor or dominant.`
        },
        {
          type: 'text',
          md: `### Your first arpeggio
Put your index finger on the 5th fret of the 6th string (A) and play the shape on the diagram: **A** (6th string, fret 5), **C** (6th string, fret 8), **E** (5th string, fret 7), then the octave **A** (4th string, fret 7). That is an A minor arpeggio, and the next lessons will make it a movable shape that you can slide anywhere.`
        },
        {
          type: 'playIt',
          prompt: 'Play an **A minor arpeggio**, low to high: A, C, E, A.',
          targets: targetsOf(A_MIN_ONE),
          hint: 'Index finger on the 6th string, 5th fret (A). Then 6th string fret 8 (C), 5th string fret 7 (E), 4th string fret 7 (A).',
          show: A_MIN_ONE.map((n) => P(n.string, n.fret)),
          frets: [3, 10]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **Am** arpeggio, root first.',
            answer: chordNames('A', 'min'),
            explain: 'A minor triad = 1 ♭3 5 = **A C E**. The arpeggio plays those three notes (and their octaves) one at a time.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Over an **Am** chord, which of these A natural minor scale notes is **not** a chord tone?', 'D', ['A', 'C', 'E'], {
            explain: 'Am contains A, C and E. D (the 4th of A minor) is a scale note but not a chord tone, so it works as a passing note, not as a landing note.'
          })
        },
        {
          type: 'tryIt',
          question: mc('How is an arpeggio different from a strummed chord?', 'It plays the same chord tones one at a time', ['It uses different notes', 'It only works on open strings', 'It always has seven notes'], {
            explain: 'The notes are the chord tones. Only the timing changes: one at a time instead of together.'
          })
        }
      ]
    },

    // ======================================================== 2
    {
      id: 'u13l2',
      title: 'Triad arpeggios: four qualities, two sizes',
      summary: 'Major, minor, diminished and augmented arpeggios in one- and two-octave movable shapes, with the root on the 6th or 5th string.',
      blocks: [
        {
          type: 'text',
          md: `You met four triads in [[u5l2]]. Each has an arpeggio, and each shape is **movable**: the shape contains no open strings, so wherever your index finger lands on the root, that note names the arpeggio.

On the diagrams, every dot is labelled with its **chord-tone degree** and **R** marks the root. Below, "6:5" means *string 6, fret 5*.`
        },
        {
          type: 'table',
          headers: ['Triad', 'Formula', 'Notes from A', 'Sound'],
          rows: [
            ['Major', '1 3 5', spelled('A', 'maj'), 'bright, settled'],
            ['Minor', '1 ♭3 5', spelled('A', 'min'), 'darker, serious'],
            ['Diminished', '1 ♭3 ♭5', spelled('A', 'dim'), 'tense, compressed'],
            ['Augmented', '1 3 ♯5', spelled('A', 'aug'), 'bright but unsettled']
          ]
        },
        {
          type: 'audioRow',
          items: TRIADS.map((t) => ({ label: `${arpSymbol('A', t)} arpeggio`, play: playChord('A', t, 3, 'arpeggio') }))
        },
        {
          type: 'text',
          md: `### One octave, root on the 6th string
The shortest useful shape is **root, 3rd, 5th, octave root** (R 3 5 R). With the root on the **6th string** it grows out of your E-form barre chord: the 6th string root, the 5th and root on the next strings, and the 3rd tucked in beside them.

**Major:** the 3rd sits *one fret behind* the root fret, on the 5th string.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_MAJ_ONE),
          frets: span(G_MAJ_ONE, 2),
          caption: `G major, one octave: ${G_MAJ_ONE.map((n) => `${n.string}:${n.fret}`).join('  ')} (G B D G). R 6th string, 3 and 5 on the 5th, R on the 4th.`
        },
        {
          type: 'text',
          md: `**Minor:** the ♭3 is **three frets above** the root, on the same 6th string. Everything else is the same, so minor differs from major by one note.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_MIN_ONE),
          frets: span(G_MIN_ONE, 2),
          caption: `G minor, one octave: ${G_MIN_ONE.map((n) => `${n.string}:${n.fret}`).join('  ')} (G B♭ D G).`
        },
        {
          type: 'text',
          md: `**Diminished and augmented** move the 5th: down a fret for diminished (♭5), up a fret for augmented (♯5).`
        },
        {
          type: 'fretboard',
          marks: marksOf(B_DIM_ONE),
          frets: span(B_DIM_ONE, 2),
          caption: `B diminished: ${B_DIM_ONE.map((n) => `${n.string}:${n.fret}`).join('  ')} (B D F B). The ♭5 is one fret below the major 5th position.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_AUG_ONE),
          frets: span(G_AUG_ONE, 2),
          caption: `G augmented: ${G_AUG_ONE.map((n) => `${n.string}:${n.fret}`).join('  ')} (G B D♯ G). The ♯5 is one fret above the major 5th position.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G major', play: playArp(G_MAJ_ONE, 'up', 100) },
            { label: 'G minor', play: playArp(G_MIN_ONE, 'up', 100) },
            { label: 'B diminished', play: playArp(B_DIM_ONE, 'up', 100) },
            { label: 'G augmented', play: playArp(G_AUG_ONE, 'up', 100) }
          ]
        },
        {
          type: 'tab',
          caption: 'G major arpeggio, one octave, up and back down.',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj' }],
          bpm: 90,
          events: tabOf(upDown(G_MAJ_ONE), 0.5, 2)
        },
        {
          type: 'text',
          md: `### One octave, root on the 5th string
Move the root to the **5th string** and the shape grows out of your A-form barre chord. It is the same idea one string lower: root, then the 3rd *behind* it on the 4th string, the 5th, and the octave root on the 3rd string. For **minor**, the ♭3 is again three frets above the root on the same string.`
        },
        {
          type: 'fretboard',
          marks: marksOf(C_MAJ_ONE5),
          frets: span(C_MAJ_ONE5, 2),
          caption: `C major, root on the 5th string: ${C_MAJ_ONE5.map((n) => `${n.string}:${n.fret}`).join('  ')} (C E G C).`
        },
        {
          type: 'fretboard',
          marks: marksOf(D_MIN_ONE5),
          frets: span(D_MIN_ONE5, 2),
          caption: `D minor, root on the 5th string: ${D_MIN_ONE5.map((n) => `${n.string}:${n.fret}`).join('  ')} (D F A D).`
        },
        {
          type: 'table',
          headers: ['Quality', '6th-string root (offsets from root fret)', '5th-string root (offsets)'],
          rows: TRIADS.map((t) => [TYPE_NAME[t], offsetText(t, 6), offsetText(t, 5)]),
          caption: 'Each entry is "string: frets relative to the root fret". For example "5: −1, +2" means the 5th string at one fret below the root fret, and at two frets above it.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Find the root, then place the shape.** To play C major with the root on the 6th string, the root is at the 8th fret, so the shape sits at frets 7 to 10. With the root on the 5th string, C is at the 3rd fret. Choose whichever root string is **closest to where your hand already is**. Both shapes give the same notes in different places.`
        },
        {
          type: 'text',
          md: `### Two octaves: R 3 5 R 3 5 R
Continue the pattern up the neck and you reach the **octave above**: seven notes, two octaves. With the root on the 6th string the whole shape sits inside **four or five frets**, which is why this is the most useful arpeggio shape of all.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_MAJ_TWO),
          frets: span(G_MAJ_TWO, 2),
          caption: `G major, two octaves: ${G_MAJ_TWO.map((n) => `${n.string}:${n.fret}`).join('  ')}. Compare it with the G barre chord: the 3rd and 5th come from the same shape, with the high strings added.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_MIN_TWO),
          frets: span(G_MIN_TWO, 2),
          caption: `G minor, two octaves: ${G_MIN_TWO.map((n) => `${n.string}:${n.fret}`).join('  ')}. Two notes on the 6th string, then the same 5th-string, 4th-string and high-string notes as the major shape, except the ♭3 on the 3rd string drops one fret.`
        },
        {
          type: 'fretboard',
          marks: marksOf(B_DIM_TWO),
          frets: span(B_DIM_TWO, 2),
          caption: `B diminished, two octaves: ${B_DIM_TWO.map((n) => `${n.string}:${n.fret}`).join('  ')}. The ♭5 on the 2nd string sits one fret below the root fret.`
        },
        {
          type: 'fretboard',
          marks: marksOf(G_AUG_TWO),
          frets: span(G_AUG_TWO, 2),
          caption: `G augmented, two octaves: ${G_AUG_TWO.map((n) => `${n.string}:${n.fret}`).join('  ')}. Every note is four semitones above the last, so the same shape repeats from each chord tone.`
        },
        {
          type: 'tab',
          caption: 'G major, two octaves, up and back. Try to keep your hand in one position (frets 2 to 5).',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj' }],
          bpm: 100,
          events: tabOf(upDown(G_MAJ_TWO), 0.5, 2)
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G major, two octaves up', play: playArp(G_MAJ_TWO, 'up', 110) },
            { label: 'G minor, up and down', play: playArp(G_MIN_TWO, 'updown', 110) },
            { label: 'B diminished', play: playArp(B_DIM_TWO, 'up', 110) },
            { label: 'G augmented', play: playArp(G_AUG_TWO, 'up', 110) }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play a **G major arpeggio** over two octaves, low to high (7 notes).',
          targets: targetsOf(G_MAJ_TWO),
          hint: `Frets: ${G_MAJ_TWO.map((n) => `${n.string}:${n.fret}`).join(', ')}.`,
          show: G_MAJ_TWO.map((n) => P(n.string, n.fret)),
          frets: [1, 7]
        },
        {
          type: 'text',
          md: `### Two octaves from the 5th string
The 5th-string root shapes are the same idea with the root one string lower. They begin on the 5th string and finish on the 1st string, so the top note falls **five frets above the root fret**: the last move is a small **shift up the first string**.`
        },
        {
          type: 'fretboard',
          marks: marksOf(C_MAJ_TWO5),
          frets: span(C_MAJ_TWO5, 1),
          caption: `C major, two octaves from the 5th string: ${C_MAJ_TWO5.map((n) => `${n.string}:${n.fret}`).join('  ')}. Play 1:3 (the 5th, G) and then slide up to 1:8 (the top C).`
        },
        {
          type: 'fretboard',
          marks: marksOf(D_MIN_TWO5),
          frets: span(D_MIN_TWO5, 1),
          caption: `D minor, two octaves from the 5th string: ${D_MIN_TWO5.map((n) => `${n.string}:${n.fret}`).join('  ')}.`
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Diminished and augmented from the 5th string** work the same way (move the 5th by a fret), but the 6th-string shapes are friendlier. Learn those first.

**Symmetry:** an augmented triad splits the octave into three equal parts of four semitones, so the same notes form the arpeggio of three roots: G+, B+ and D♯+ contain the same pitches.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This is a **G major** arpeggio (one octave, root on the 6th string). Click the **5th** (D) on the 5th string.',
            frets: span(G_MAJ_ONE, 2),
            marks: marksOf(G_MAJ_ONE).filter((x) => x.label !== '5'),
            targets: [P(5, 5)],
            explain: 'The 5th of G is D, on the 5th string, fret 5. It is two frets above the root fret (3).'
          }
        },
        {
          type: 'tryIt',
          question: mc('To turn the G major arpeggio (6th-string root, fret 3) into G **minor**, you…', 'replace the 3rd (5th string, fret 2) with the ♭3 (6th string, fret 6)', ['raise the 5th by one fret', 'lower the root by one fret', 'move the whole shape up one fret'], {
            explain: 'Minor differs from major only in the 3rd: B (fret 2 on the 5th string) becomes B♭, which sits on the 6th string, fret 6.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **B diminished** arpeggio, root first.',
            answer: chordNames('B', 'dim'),
            explain: 'Diminished = 1 ♭3 ♭5: **B D F**.'
          }
        }
      ]
    },

    // ======================================================== 3
    {
      id: 'u13l3',
      title: 'Linking arpeggios with your chord shapes',
      summary: 'Each of the five major chord shapes holds an arpeggio, and neighbouring shapes overlap, so one chord becomes a map of the whole neck.',
      blocks: [
        {
          type: 'text',
          md: `In [[u6l3]] you learned that any major chord can be played in **five shapes** (the C, A, G, E and D forms), stacked up the neck. Every one of those shapes is a handful of chord tones, so **each shape already contains an arpeggio**: pick the notes one at a time, from low to high.

Here are the five shapes of C major:`
        },
        { type: 'chords', shapes: C_FORMS.map((f) => ({ ...f.shape, name: `C (${f.form} shape)` })), caption: 'C major in the five shapes, from the open position up to the 13th fret.' },
        {
          type: 'table',
          headers: ['Shape', 'Frets', 'Arpeggio, low to high (string:fret)', 'Notes'],
          rows: C_FORMS.map((f, i) => [
            `${f.form} shape`,
            `${Math.min(...FORM_ARPS[i].map((p) => p.fret))} to ${Math.max(...FORM_ARPS[i].map((p) => p.fret))}`,
            FORM_ARPS[i].map((p) => `${p.string}:${p.fret}`).join('  '),
            FORM_ARPS[i].map((p) => pr(nameAt(p))).join(' ')
          ]),
          caption: 'The arpeggio inside each C major chord shape.'
        },
        {
          type: 'audioRow',
          items: C_FORMS.map((f, i) => ({ label: `${f.form} shape`, play: { ...playMarks(FORM_ARPS[i]), toolExample: { kind: 'chord' as const, root: 'C', type: 'maj' as const, shape: f.shape } } }))
        },
        {
          type: 'tab',
          caption: 'All five shapes, one after another, climbing the neck: C-form, A-form, G-form, E-form, D-form.',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }],
          bpm: 100,
          events: FORM_ARPS.flatMap((notes) => notes.map((p, i) => ({ pos: [P(p.string, p.fret)], beats: i === notes.length - 1 ? 1 : 0.5 })))
        },
        {
          type: 'fretboard',
          marks: [
            ...chordToneMarks('C', 'maj', [0, 15]),
          ],
          frets: [0, 15],
          caption: 'Every C major chord tone from the open strings to the 15th fret. The five shapes are simply five neighbouring slices of this one map.',
          playAll: true
        },
        {
          type: 'text',
          md: `### Same notes, bigger picture
Because the shapes **overlap**, you can chain them. The **A shape** (x 3 5 5 5 3) and the **G shape** (8 7 5 5 5 8) share three positions: **4:5, 3:5 and 2:5**. Those shared notes are the hinge: play up through one shape, and the notes you land on are *already part of the next one*.`
        },
        {
          type: 'fretboard',
          marks: [
            ...FORM_ARPS[1].map((p) => ({ ...P(p.string, p.fret), label: pr(nameAt(p)), color: (pcAt(p) === pitchClass('C') ? 'root' : 'tone') as FretMark['color'] })),
            ...FORM_ARPS[2].filter((p) => !FORM_ARPS[1].some((q) => q.string === p.string && q.fret === p.fret)).map((p) => ({ ...P(p.string, p.fret), label: pr(nameAt(p)), color: 'accent' as FretMark['color'] }))
          ],
          frets: [1, 10],
          caption: 'The A-form and the extra notes of the G-form, labelled by note name. Shared dots on the 4th, 3rd and 2nd strings at fret 5 are the hinge between the two shapes.',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }]
        },
        {
          type: 'tab',
          caption: 'Up through the A-form, shift on the 1st string, then down through the G-form: C G C E G | C E C G E C.',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }],
          bpm: 90,
          events: tab('5:3/0.5 4:5/0.5 3:5/0.5 2:5/0.5 1:3/0.5 1:8/0.5 2:5/0.5 3:5/0.5 4:5/0.5 5:7/0.5 6:8/2')
        },
        {
          type: 'audio',
          label: 'Play that path',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }],
          play: tabSpec(tab('5:3/0.5 4:5/0.5 3:5/0.5 2:5/0.5 1:3/0.5 1:8/0.5 2:5/0.5 3:5/0.5 4:5/0.5 5:7/0.5 6:8/2'), 90)
        },
        {
          type: 'text',
          md: `### Connect to the two-octave shapes
The two-octave shapes from the last lesson are those chord shapes with the **missing strings filled in**:
- The **6th-string-root** shape is the **E shape** region. For C major, root on the 6th string at the 8th fret: frets 7 to 10.
- The **5th-string-root** shape is the **A shape** region. For C major, root on the 5th string at the 3rd fret: frets 2 to 5.

Slide each shape up or down by the number of frets between roots and it becomes any other major arpeggio. Here are the chord tones of C major in each region:`
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('C', 'maj', [7, 10]),
          frets: [6, 11],
          caption: 'E-shape region, frets 7 to 10: this is the two-octave "6th-string root" shape for C major.'
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('C', 'maj', [2, 5]),
          frets: [1, 6],
          caption: 'A-shape region, frets 2 to 5: the two-octave "5th-string root" shape for C major (plus the 6th-string G).'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Not a new system, just a better view.** You are not memorising extra shapes. Every arpeggio position is **a slice of the chord tones on the neck**. If you forget a shape, rebuild it from the chord grip you know and fill in the other strings from the chord tones (R 3 5).

The same works for minor (the m shapes), and for seventh chords once you add the 7th.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Climb with one chord.** Pick a chord (say, C major) and play its arpeggio in all five regions, from open position up to the 12th fret and back. Then repeat for a different key. Within a week you will see the chord tones appear before you think about the shape.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This is the **A shape** C major chord (x 3 5 5 5 3). Click the **3rd** (E) on the **2nd (B) string**.',
            frets: [1, 7],
            marks: FORM_ARPS[1].map((p) => ({ ...P(p.string, p.fret), color: (pcAt(p) === pitchClass('C') ? 'root' : 'tone') as FretMark['color'] })),
            targets: [P(2, 5)],
            explain: 'The 3rd of C is **E**, on the 2nd string at the 5th fret. G (the 5th) is on the 4th string at fret 5 and on the 1st string at fret 3.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Why do the A shape and the G shape of the same major chord feel like "neighbours"?', 'They share chord tones on the 4th, 3rd and 2nd strings (the 5th fret in C)', ['They use the same open strings', 'They have the same fingering', 'They start on the same string'], {
            explain: 'In C major, A shape x35553 and G shape 875558 both use frets 5, 5 and 5 on strings 4, 3 and 2. That overlap makes it easy to move from one to the other.'
          })
        },
        {
          type: 'tryIt',
          question: mc('A C major arpeggio with its root on the 6th string uses which fret for the root?', '8th fret', ['3rd fret', '5th fret', '10th fret'], {
            explain: 'C is on the 8th fret of the 6th string (eight semitones above the open E) and on the 3rd fret of the 5th string.'
          })
        }
      ]
    },

    // ======================================================== 4
    {
      id: 'u13l4',
      title: 'Seventh-chord arpeggios',
      summary: 'Maj7, 7, m7, m7♭5 and °7 arpeggios in two-octave shapes: a triad shape plus one extra note.',
      blocks: [
        {
          type: 'text',
          md: `A seventh chord is a triad plus the **7th**, so its arpeggio has four notes per octave: **R 3 5 7**. The new note adds colour and, more importantly, makes the arpeggio **say exactly which chord is underneath**. A C major triad arpeggio sounds the same over Cmaj7, C7 and C6, so only the 7th tells the listener which chord you are outlining.

Every shape here is derived from the triad shapes of the last lesson. The 7th is simply added:`
        },
        {
          type: 'table',
          headers: ['Arpeggio', 'Formula', 'Notes from A', 'Built from'],
          rows: [
            ['Amaj7', '1 3 5 7', spelled('A', 'maj7'), 'major triad + M7'],
            ['A7', '1 3 5 ♭7', spelled('A', 'dom7'), 'major triad + m7'],
            ['Am7', '1 ♭3 5 ♭7', spelled('A', 'min7'), 'minor triad + m7'],
            ['Am7♭5', '1 ♭3 ♭5 ♭7', spelled('A', 'm7b5'), 'diminished triad + m7'],
            ['A°7', '1 ♭3 ♭5 𝄫7', spelled('A', 'dim7'), 'diminished triad + d7']
          ]
        },
        {
          type: 'audioRow',
          items: SEVENTHS.map((t) => ({ label: `${arpSymbol('A', t)} arpeggio`, play: playChord('A', t, 3, 'arpeggio') }))
        },
        {
          type: 'text',
          md: `### Two octaves, root on the 6th string
All five shapes below use the **A on the 6th string, 5th fret** as the root, so you can compare them directly. The added seventh is labelled **♭7** or **7**. Look at what changes from one shape to the next.`
        },
        ...(SEVENTHS.map((t) => ({
          type: 'fretboard' as const,
          marks: marksOf(A_SEV[t], true),
          frets: span(A_SEV[t], 2),
          caption: `${arpSymbol('A', t)}: ${A_SEV[t].map((n) => `${n.string}:${n.fret}`).join('  ')} (${spelled('A', t)}).`
        }))),
        {
          type: 'tab',
          caption: 'Am7 across two octaves, up and back (A C E G A C E G A).',
          toolExamples: [{ kind: 'chord', root: 'A', type: 'min7' }],
          bpm: 100,
          events: tabOf(upDown(A_SEV.min7), 0.5, 2)
        },
        {
          type: 'audioRow',
          items: SEVENTHS.map((t) => ({ label: `${arpSymbol('A', t)} up and down`, play: playArp(A_SEV[t], 'updown', 110) }))
        },
        {
          type: 'table',
          headers: ['Change from', 'To', 'What moves'],
          rows: [
            ['Amaj7', 'A7', 'every 7th (G♯) drops one fret to G'],
            ['A7', 'Am7', 'every 3rd (C♯) drops one fret to C'],
            ['Am7', 'Am7♭5', 'every 5th (E) drops one fret to E♭'],
            ['Am7♭5', 'A°7', 'every ♭7 (G) drops one fret to G♭ (𝄫7)']
          ],
          caption: 'Four steps, one note flattened each time: the same shape, four chords.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**The diminished 7th is symmetrical.** A°7 is all minor 3rds, so the shape repeats every three frets. A°7, C°7, E♭°7 and G♭°7 contain the **same four pitches**. One shape, four names. You never need more than three versions of it to cover every key.`
        },
        {
          type: 'text',
          md: `### Root on the 5th string
Move the root to the 5th string and the A-form chord grips give a compact **R 3 5 7 R** shape. The 7th lands on the 3rd string.`
        },
        {
          type: 'fretboard',
          marks: marksOf(C_MAJ7_5, true),
          frets: span(C_MAJ7_5, 2),
          caption: `Cmaj7, root on the 5th string: ${C_MAJ7_5.map((n) => `${n.string}:${n.fret}`).join('  ')} (C E G B C).`
        },
        {
          type: 'table',
          headers: ['Seventh', 'Notes (string:fret) with the root on the 5th string, fret 5 (D)', 'Notes'],
          rows: SEVENTHS.map((t) => {
            const ns = arp('D', t, 5, 'sev', 5)
            return [arpSymbol('D', t), ns.map((n) => `${n.string}:${n.fret}`).join('  '), spelled('D', t)]
          })
        },
        {
          type: 'playIt',
          prompt: 'Play a **Cmaj7 arpeggio** with the root on the 5th string: C, E, G, B, C.',
          targets: targetsOf(C_MAJ7_5),
          hint: 'Index finger on the 5th string, 3rd fret (C). Then 4th string fret 2 (E), 4th string fret 5 (G), 3rd string fret 4 (B), 3rd string fret 5 (C).',
          show: C_MAJ7_5.map((n) => P(n.string, n.fret)),
          frets: [1, 7]
        },
        {
          type: 'text',
          md: `### Which seventh arpeggio goes where?
In the diatonic harmony of a major key, each of the seven chords takes its own seventh-chord arpeggio:`
        },
        {
          type: 'table',
          headers: ['Degree', 'Chord in C', 'Arpeggio quality', 'Notes'],
          rows: diatonicChords('C', 'major', true).map((c) => [c.roman, pr(c.symbol), CHORDS[c.type].name, spelled(c.root, c.type)]),
          caption: 'The diatonic seventh chords of C major, each with its own arpeggio. Imaj7 and IVmaj7: major 7th; ii7, iii7, vi7: minor 7th; V7: dominant 7th; viiø7: half-diminished.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**One note at a time.** To move from Am7 to A7, change only the 3rds (C to C♯). If you can do this fluently in both directions, you can adapt an arpeggio to any chord change without relearning a shape.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **Dm7** arpeggio, root first.',
            answer: chordNames('D', 'min7'),
            explain: 'Dm7 = 1 ♭3 5 ♭7 from D: **D F A C**.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Which arpeggio would you play over **G7** in the key of C major (the V chord)?', 'G7 (G B D F)', ['Gmaj7 (G B D F♯)', 'Gm7 (G B♭ D F)', 'G°7 (G B♭ D♭ F♭)'], {
            explain: 'V is the one diatonic dominant chord, and the F is a note of C major: G B D F = **G7**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which seventh arpeggio is this?', 'Minor 7th', ['Major 7th', 'Dominant 7th', 'Half-diminished'], {
            play: playChord('D', 'min7', 3, 'arpeggio'),
            explain: 'That was **Dm7** (D F A C): a minor third at the bottom and a minor 7th at the top.'
          })
        }
      ]
    },

    // ======================================================== 5
    {
      id: 'u13l5',
      title: 'Soloing over changes with chord tones',
      summary: 'Switch arpeggios with each chord, connect the nearest chord tones, and keep the line smooth: ii–V–I and I–vi–IV–V.',
      blocks: [
        {
          type: 'text',
          md: `With one chord, a scale is plenty. With **changes**, the notes that work over bar 1 may clash in bar 2. **Chord-tone soloing** solves that: use the arpeggio of whatever chord is sounding, and **switch** when the chord switches.

The skill is not just knowing the shapes. It is **choosing the nearest chord tone** at each change, so the line moves smoothly instead of jumping around the neck.`
        },
        {
          type: 'text',
          md: `### The key trick: voice leading
Look at the chords of the most common jazz progression, **ii–V–I in C**: Dm7, G7, Cmaj7. (There's more on this progression in [[preview:u12l1]].)

- **Dm7 → G7:** the **F** (3rd of Dm7) is also the **♭7 of G7**: a common tone. The **C** (♭7 of Dm7) falls a half step to **B** (3rd of G7).
- **G7 → Cmaj7:** the **F** (♭7) falls a half step to **E** (3rd of Cmaj7). The **B** (3rd of G7) either stays put as the 7th of Cmaj7 or rises a half step to **C** (root). The **G** (root of G7) is a common tone: it is the 5th of Cmaj7.

The 3rds and 7ths ("guide tones") move by the smallest steps. Hitting them at the chord change is what makes a solo sound like it follows the harmony.`
        },
        {
          type: 'table',
          headers: ['Chord', 'Notes', 'Guide tones (3rd, 7th)'],
          rows: [
            ['Dm7', spelled('D', 'min7'), 'F, C'],
            ['G7', spelled('G', 'dom7'), 'B, F'],
            ['Cmaj7', spelled('C', 'maj7'), 'E, B']
          ],
          caption: 'Guide tones in the ii–V–I: F→F (stays), C→B (half step), F→E (half step), B→B (stays).'
        },
        {
          type: 'text',
          md: `### One position, three arpeggios
Stay with your hand around **frets 7 to 10**. All three chords have chord tones there, so you never have to jump:`
        },
        {
          type: 'fretboard',
          marks: toneTargets('D', 'min7', 7, 10).map((p) => ({ ...p, label: pr(nameAt(p)), color: (pcAt(p) === pitchClass('D') ? 'root' : 'tone') as FretMark['color'] })),
          frets: [6, 11],
          caption: 'Dm7 chord tones in frets 7 to 10 (D F A C).',
          toolExamples: [{ kind: 'chord', root: 'D', type: 'min7' }]
        },
        {
          type: 'fretboard',
          marks: toneTargets('G', 'dom7', 7, 10).map((p) => ({ ...p, label: pr(nameAt(p)), color: (pcAt(p) === pitchClass('G') ? 'root' : 'tone') as FretMark['color'] })),
          frets: [6, 11],
          caption: 'G7 chord tones in the same frets (G B D F).',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'dom7' }]
        },
        {
          type: 'fretboard',
          marks: toneTargets('C', 'maj7', 7, 10).map((p) => ({ ...p, label: pr(nameAt(p)), color: (pcAt(p) === pitchClass('C') ? 'root' : 'tone') as FretMark['color'] })),
          frets: [6, 11],
          caption: 'Cmaj7 chord tones in the same frets (C E G B).',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj7' }]
        },
        {
          type: 'tab',
          caption: 'ii–V–I line: Dm7 (A C D F) | G7 (F D B G) | Cmaj7 (G B C E) | C. The F stays across the first change; the line lands on C.',
          toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80)],
          bpm: 80,
          timeSig: '4/4',
          events: tab(II_V_I_LINE)
        },
        {
          type: 'audioRow',
          items: [
            {
              label: 'Chords alone (Dm7 G7 Cmaj7)',
              play: chordSeq([mvShape('D', 'min7', 5), mvShape('G', 'dom7', 6), mvShape('C', 'maj7', 5)], progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80), 4, 80)
            },
            {
              label: 'Chords, then the line',
              play: {
                kind: 'sequence',
                toolExample: progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80),
                bpm: 80,
                events: [
                  ...[mvShape('D', 'min7', 5), mvShape('G', 'dom7', 6), mvShape('C', 'maj7', 5)].map((s) => ({ notes: shapeMidis(s), beats: 2, mode: 'strum' as const })),
                  ...tab(II_V_I_LINE).map((e) => ({ notes: e.pos.map((p) => midiAt(p)), beats: e.beats }))
                ]
              }
            }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the **G7 bar** from the line, descending: F, D, B, G.',
          targets: ['F4', 'D4', 'B3', 'G3'],
          hint: 'Frets: 3rd string 10 (F), 3rd string 7 (D), 4th string 9 (B), 5th string 10 (G). Keep your hand around the 7th to 10th frets.',
          show: [P(3, 10), P(3, 7), P(4, 9), P(5, 10)],
          frets: [5, 12]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Start from where you are.** At each chord change, ask: "Which chord tone of the new chord is *closest* to the note I just played?" Often it is only a fret or two away. Then play the new chord's arpeggio *from that note*, up or down, not always from the root.`
        },
        {
          type: 'text',
          md: `### I–vi–IV–V in G
Four chords in a pop progression: **G, Em, C, D**. The triad arpeggios fit in one small region (frets 2 to 5):`
        },
        {
          type: 'tab',
          caption: 'G (G B D G) | Em (B G E) | C (E G C E) | D (D A F♯ D) | G. The E at the end of the Em bar becomes the 3rd of C; the E at the end of the C bar steps down to D.',
          toolExamples: [progressionExample('G', ['I', 'vi', 'IV', 'V', 'I'], 'major', 80)],
          bpm: 80,
          timeSig: '4/4',
          events: tab(I_VI_IV_V_LINE)
        },
        {
          type: 'audioRow',
          items: [
            {
              label: 'Chords alone (G Em C D)',
              play: chordSeq([OPEN_CHORDS.G, OPEN_CHORDS.Em, OPEN_CHORDS.C, OPEN_CHORDS.D], progressionExample('G', ['I', 'vi', 'IV', 'V'], 'major', 80), 4, 80)
            },
            {
              label: 'Chords, then the line',
              play: {
                kind: 'sequence',
                toolExample: progressionExample('G', ['I', 'vi', 'IV', 'V'], 'major', 80),
                bpm: 80,
                events: [
                  ...[OPEN_CHORDS.G, OPEN_CHORDS.Em, OPEN_CHORDS.C, OPEN_CHORDS.D].map((s) => ({ notes: shapeMidis(s), beats: 2, mode: 'strum' as const })),
                  ...tab(I_VI_IV_V_LINE).map((e) => ({ notes: e.pos.map((p) => midiAt(p)), beats: e.beats }))
                ]
              }
            }
          ]
        },
        {
          type: 'table',
          headers: ['Chord', 'Notes', 'Nearest tone from the previous bar'],
          rows: [
            ['G', 'G B D', 'start on the root, low G'],
            ['Em', 'E G B', 'from G, step up a 3rd to B'],
            ['C', 'C E G', 'E is common to Em and C: stay on it'],
            ['D', 'D F♯ A', 'from E (C chord) step down a whole step to D'],
            ['G', 'G B D', 'D rises a 4th to G, home']
          ],
          caption: 'Reasoning for each move in the I–vi–IV–V line.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Practise with a loop.** Open Tools > Looper, choose a ii–V–I or I–vi–IV–V in the key you are practising, and play the arpeggio of each chord on the downbeat, then fill in the rest with scale notes. Start by playing one chord tone per bar. Then two. Then four.`
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**A 7th on the V is the strongest sign.** Soloing over G7 with a G major triad arpeggio would ignore the F: the one note that makes G7 want to resolve to C. Use the **seventh-chord arpeggio** whenever the chord has a 7th.`
        },
        {
          type: 'tryIt',
          question: mc('In a ii–V–I in C, the F of Dm7 can stay as the ♭7 of G7. What is this kind of note called?', 'A common tone', ['A passing tone', 'A blue note', 'An extension'], {
            explain: 'F belongs to both Dm7 (the 3rd) and G7 (the ♭7). Staying on a note shared by two chords is a "common tone".'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            prompt: 'Over **G7**, select every chord tone (G B D F) between frets **7 and 10**.',
            frets: [7, 10],
            targets: toneTargets('G', 'dom7', 7, 10),
            explain: 'G7 is G B D F. Between frets 7 and 10 they sit on: ' + toneTargets('G', 'dom7', 7, 10).map((p) => `${p.string}:${p.fret}`).join(', ') + '.'
          }
        },
        {
          type: 'tryIt',
          question: mc('The V7 chord moves to the I chord. The 3rd of V7 (B in G7) resolves to…', 'the root of the I chord (C), up a half step', ['the 7th of the I chord, down a whole step', 'the 5th of the I chord', 'nothing, it stays as B'], {
            explain: 'B (3rd of G7) is the leading tone, a half step below the tonic C. It "wants" to resolve up to C.'
          })
        }
      ]
    },

    // ======================================================== 6
    {
      id: 'u13l6',
      title: 'Technique and practice patterns',
      summary: 'What sweep picking and economy picking are, how they relate to arpeggio shapes, and sequences that make arpeggios musical.',
      blocks: [
        {
          type: 'text',
          md: `You do not need special technique to play arpeggios; clean alternate picking is enough. But two picking ideas are worth understanding because arpeggio shapes suit them naturally. This lesson covers the **theory** behind them, then a set of **patterns** that turn a shape into music.

### The direction of a stroke
A **downstroke** moves the pick from the thick strings toward the thin ones: from the 6th string toward the 1st. So a downstroke travelling across the strings plays notes of **rising pitch** (6th to 1st), and an **upstroke** travelling the other way plays notes of **falling pitch**.`
        },
        {
          type: 'text',
          md: `### Sweep picking
In **sweep picking**, the pick makes one smooth motion across the strings, in the same direction, with **one note per string**. Played slowly, it feels like a slow strum or "rake"; the fretting hand lifts each note just before the next one sounds, so the notes come out as a clean arpeggio rather than a chord.

- **Ascending** sweep (low strings to high strings): all downstrokes.
- **Descending** sweep (high strings to low strings): all upstrokes.

The shapes that suit it have **exactly one note per string**: the 5- and 6-string shapes below.`
        },
        {
          type: 'fretboard',
          marks: [
            { string: 5, fret: 3, label: 'R', color: 'root' },
            { string: 4, fret: 5, label: '5', color: 'tone' },
            { string: 3, fret: 5, label: 'R', color: 'root' },
            { string: 2, fret: 5, label: '3', color: 'tone' },
            { string: 1, fret: 3, label: '5', color: 'tone' }
          ],
          frets: [1, 8],
          caption: 'A five-string sweep shape for C major: C (5th string, fret 3), G (4th, 5), C (3rd, 5), E (2nd, 5), G (1st, 3).',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }]
        },
        {
          type: 'tab',
          caption: 'C major sweep, up and back: one note per string, all downstrokes going up and all upstrokes coming back.',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }],
          bpm: 80,
          events: tab('5:3/0.5 4:5/0.5 3:5/0.5 2:5/0.5 1:3/1 2:5/0.5 3:5/0.5 4:5/0.5 5:3/2')
        },
        {
          type: 'fretboard',
          marks: [
            { string: 6, fret: 3, label: 'R', color: 'root' },
            { string: 5, fret: 5, label: '5', color: 'tone' },
            { string: 4, fret: 5, label: 'R', color: 'root' },
            { string: 3, fret: 4, label: '3', color: 'tone' },
            { string: 2, fret: 3, label: '5', color: 'tone' },
            { string: 1, fret: 3, label: 'R', color: 'root' }
          ],
          frets: [1, 7],
          caption: 'A six-string sweep shape for G major (the E-shape chord): G (6th string, fret 3), D (5th, 5), G (4th, 5), B (3rd, 4), D (2nd, 3), G (1st, 3).',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj' }]
        },
        {
          type: 'audioRow',
          toolExamples: [{ kind: 'chord', root: 'C', type: 'maj' }],
          items: [
            { label: 'Slow (60 bpm)', play: noteSeq([48, 55, 60, 64, 67, 64, 60, 55, 48], 0.5, 60) },
            { label: 'Medium (100 bpm)', play: noteSeq([48, 55, 60, 64, 67, 64, 60, 55, 48], 0.5, 100) },
            { label: 'Fast (160 bpm)', play: noteSeq([48, 55, 60, 64, 67, 64, 60, 55, 48], 0.5, 160) }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the five-string **C major sweep shape** going up, one note per string: C, G, C, E, G.',
          targets: ['C3', 'G3', 'C4', 'E4', 'G4'],
          hint: 'Frets: 5th string 3, 4th string 5, 3rd string 5, 2nd string 5, 1st string 3. Start slowly and sweep with downstrokes.',
          show: [P(5, 3), P(4, 5), P(3, 5), P(2, 5), P(1, 3)],
          frets: [1, 8]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Sweeping is mostly fretting hand.** The notes must not ring into each other. Fret each note, let it sound, and release the pressure as the pick moves on, so only one note rings at a time. Practise the fretting-hand timing *without* the pick motion first. Use a metronome (Tools > Metronome) and speed up only when every note is clean.`
        },
        {
          type: 'text',
          md: `### Economy picking
**Alternate picking** strictly alternates down and up. **Economy picking** also alternates *within* a string, but when you **change strings in the direction of travel**, you keep the stroke you were already making. The result is the same notes with fewer wasted pick motions.

For an ascending run with **two** notes per string, starting on a downstroke, both approaches can use down-up, down-up, down-up. With **three** notes per string, strict alternate picking continues down-up-down, **up**-down-up, down-up-down. Economy picking can sweep into each higher string with a downstroke: down-up-down, **down**-up-down. This is useful for three-note-per-string scale runs or wider arpeggio layouts. The seventh arpeggio shapes shown earlier do not have three notes on a string; use their actual note counts to choose your strokes.`
        },
        {
          type: 'table',
          headers: ['Style', 'Ascending (6th string toward 1st)', 'Notes per string', 'Good for'],
          rows: [
            ['Alternate picking', 'down-up-down-up…', 'any', 'steady rhythm, scales'],
            ['Economy picking', 'down-up-down, down-up-down…', '3 (or any odd number)', 'ascending runs that sweep a downstroke into the next string'],
            ['Sweep picking', 'down-down-down-down…', '1', 'fast triad and seventh arpeggios across 3 to 6 strings']
          ],
          caption: 'Three picking styles: one idea, reduce pick motion.'
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Sound first, technique second.** All of this is optional speed. A clean, slow, musical arpeggio always beats a fast, smeared one. Be sure you can hear every chord tone before you speed up.`
        },
        {
          type: 'text',
          md: `### Arpeggio patterns
A shape is a pool of notes. A **sequence** is a pattern that moves through it and shifts up one step each time. Below, the numbers are the **positions in the A minor two-octave arpeggio** (1 = A, 2 = C, 3 = E, 4 = A, 5 = C, 6 = E, 7 = A).`
        },
        {
          type: 'fretboard',
          marks: A_MIN_TWO.map((n, i) => ({ string: n.string, fret: n.fret, label: String(i + 1), toolExample: n.toolExample, color: (i % 3 === 0 ? 'root' : 'tone') as FretMark['color'] })),
          frets: span(A_MIN_TWO, 2),
          caption: `A minor two octaves, numbered 1 to 7 (low to high): ${A_MIN_TWO.map((n) => `${n.string}:${n.fret}`).join('  ')}.`
        },
        {
          type: 'text',
          md: `**Up and down** is the plain run: 1 2 3 4 5 6 7 6 5 4 3 2 1. Four more patterns follow, each starting on the lowest note and climbing:

1. **Groups of three** (1-2-3, 2-3-4, 3-4-5…): each group slides up one note.
2. **Groups of four, "1-3-5-8"** in chord-tone language: R, 3rd, 5th, octave (notes 1-2-3-4), then ♭3, 5, 8, ♭10 (notes 2-3-4-5), and so on up the shape.
3. **Skipping** (1-3, 2-4, 3-5…): jump over a note, step back, jump again.
4. **Alberti** (low, high, middle, high), borrowed from classical keyboard music: 1-3-2-3, 2-4-3-4, 3-5-4-5…`
        },
        ...([
          {
            title: 'Groups of three',
            cap: 'Groups of three: 1-2-3, 2-3-4, 3-4-5, 4-5-6, 5-6-7.',
            idx: [1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6, 5, 6, 7]
          },
          {
            title: 'Groups of four (1-3-5-8)',
            cap: 'Groups of four: 1-2-3-4, 2-3-4-5, 3-4-5-6, 4-5-6-7. In chord terms: R-♭3-5-R, then ♭3-5-R-♭3, and so on.',
            idx: [1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6, 7]
          },
          {
            title: 'Skipping',
            cap: 'Skipping: 1-3-2-4-3-5-4-6-5-7.',
            idx: [1, 3, 2, 4, 3, 5, 4, 6, 5, 7]
          },
          {
            title: 'Alberti',
            cap: 'Alberti pattern: 1-3-2-3, 2-4-3-4, 3-5-4-5, 4-6-5-6, 5-7-6-7.',
            idx: [1, 3, 2, 3, 2, 4, 3, 4, 3, 5, 4, 5, 4, 6, 5, 6, 5, 7, 6, 7]
          }
        ].flatMap((p) => {
          const ns = p.idx.map((i) => A_MIN_TWO[i - 1])
          return [
            { type: 'tab' as const, caption: p.cap, bpm: 90, events: tabOf(ns, 0.5, 2), toolExamples: [ns[0].toolExample] },
            { type: 'audio' as const, label: p.title, play: { ...noteSeq(ns.map((n) => n.midi), 0.5, 90), toolExample: ns[0].toolExample } }
          ]
        })),
        {
          type: 'text',
          md: `### Descending patterns
Reverse any pattern for the other direction. **8-5-3-1**, the mirror of 1-3-5-8, is the notes 4-3-2-1 of the shape. A good routine goes up with one pattern and comes down with its mirror.`
        },
        {
          type: 'tab',
          caption: 'Up in groups of four (1-2-3-4, 2-3-4-5…), then back down 7-6-5-4-3-2-1.',
          toolExamples: [{ kind: 'chord', root: 'A', type: 'min' }],
          bpm: 90,
          events: tabOf([1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1].map((i) => A_MIN_TWO[i - 1]), 0.5, 2)
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Make it musical.** Pick one pattern and play it over a vamp (Am, then Dm, then E7 in A minor). For each chord, switch to *that chord's* arpeggio and run the same pattern. Patterns are the bridge from "I know the shape" to "I can improvise with it".`
        },
        {
          type: 'tryIt',
          question: mc('A downstroke travelling from the 6th string toward the 1st plays notes that are…', 'rising in pitch', ['falling in pitch', 'always the same pitch', 'only on one string'], {
            explain: 'The 6th string is the lowest, the 1st the highest. A pick travelling 6 to 1 plays low to high.'
          })
        },
        {
          type: 'tryIt',
          question: mc('How many notes per string does a classic **sweep** use?', 'One', ['Two', 'Three', 'Four'], {
            explain: 'A sweep is one continuous pick motion across the strings with a single fretted note on each string.'
          })
        },
        {
          type: 'tryIt',
          question: mc('In the A minor arpeggio shape, "1-3-5-8" means…', 'root, 3rd, 5th, octave: A C E A', ['A B C D', 'A E C A', 'A C E G'], {
            explain: '1-3-5-8 are chord-tone degrees: root, ♭3, 5 and octave root. In A minor: A C E A.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('What is an arpeggio?', 'The notes of a chord played one at a time', ['A scale played very fast', 'A chord played with a pick', 'A scale with every note played twice'], {
        explain: 'An arpeggio plays the chord tones one at a time, usually in ascending or descending order.'
      }),
      { kind: 'spell', prompt: 'Spell the **Am** arpeggio, root first.', answer: chordNames('A', 'min'), explain: 'Minor triad: 1 ♭3 5 = **A C E**.' },
      { kind: 'spell', prompt: 'Spell the **G7** arpeggio, root first.', answer: chordNames('G', 'dom7'), explain: 'Dominant 7th: 1 3 5 ♭7 = **G B D F**.' },
      { kind: 'spell', prompt: 'Spell the **Bm7♭5** arpeggio, root first.', answer: chordNames('B', 'm7b5'), explain: 'Half-diminished: 1 ♭3 ♭5 ♭7 = **B D F A**.' },
      mc('Which triad has a **♯5**?', 'Augmented', ['Major', 'Diminished', 'Minor'], {
        explain: 'Augmented = 1 3 ♯5 (two major thirds). Diminished has ♭3 and ♭5.'
      }),
      mc('When soloing over a chord, which notes are best to play on the **strong beats**?', 'Chord tones', ['Any note outside the key', 'Only the root', 'The scale notes that are not chord tones'], {
        explain: 'Chord tones sound at home with the harmony. Other scale notes work best as passing notes between them.'
      }),
      {
        kind: 'fretboard',
        mode: 'all',
        prompt: 'Select **every** note of the **C major** arpeggio (C E G) between frets **7 and 10**.',
        frets: [7, 10],
        targets: toneTargets('C', 'maj', 7, 10),
        explain: `C E G in frets 7 to 10 appear at ${toneTargets('C', 'maj', 7, 10).map((p) => `${p.string}:${p.fret}`).join(', ')}.`
      },
      {
        kind: 'fretboard',
        mode: 'all',
        prompt: 'Select **every** note of the **Am** arpeggio (A C E) between frets **5 and 8**.',
        frets: [5, 8],
        targets: toneTargets('A', 'min', 5, 8),
        explain: `A C E in frets 5 to 8 appear at ${toneTargets('A', 'min', 5, 8).map((p) => `${p.string}:${p.fret}`).join(', ')}.`
      },
      {
        kind: 'fretboard',
        prompt: 'In this **G major** arpeggio over two octaves (6th-string root at fret 3), click a **3rd** (B) on the **5th or 3rd string**.',
        frets: span(G_MAJ_TWO, 2),
        marks: marksOf(G_MAJ_TWO).filter((x) => x.label !== '3'),
        targets: G_MAJ_TWO.filter((n) => n.deg === '3').map((n) => P(n.string, n.fret)),
        explain: 'B, the 3rd of G, appears on the 5th string at fret 2 and on the 3rd string at fret 4 in this shape.'
      },
      {
        kind: 'fretboard',
        prompt: 'In this **Am7** arpeggio (6th-string root at fret 5), click the **♭7** (G) on the **4th or 2nd string**.',
        frets: span(A_SEV.min7, 2),
        marks: marksOf(A_SEV.min7).filter((x) => x.label !== '♭7'),
        targets: A_SEV.min7.filter((n) => n.deg === '♭7').map((n) => P(n.string, n.fret)),
        explain: 'G, the ♭7 of Am7, is on the 4th string at fret 5 and on the 2nd string at fret 8.'
      },
      mc('Listen. What kind of triad is this arpeggio?', 'Minor', ['Major', 'Diminished', 'Augmented'], {
        play: playChord('E', 'min', 3, 'arpeggio'),
        explain: 'This is **Em** (E G B). The ♭3 gives the darker minor sound.'
      }),
      mc('Listen. What kind of seventh chord is this arpeggio?', 'Dominant 7th', ['Major 7th', 'Minor 7th', 'Half-diminished'], {
        play: playChord('G', 'dom7', 3, 'arpeggio'),
        explain: 'This is **G7** (G B D F): a major triad with a ♭7 on top.'
      }),
      mc('Which arpeggio does this tab show?', 'E minor', ['E major', 'E diminished', 'E augmented'], {
        visual: {
          type: 'tab',
          bpm: 90,
          events: tab('6:0/0.5 5:2/0.5 4:2/0.5 3:0/0.5 4:2/0.5 5:2/0.5 6:0/2')
        },
        explain: 'The notes are E (6th string open), B, E and G: the G on the open 3rd string is the minor 3rd. E G B = **Em**.'
      }),
      mc('In a ii–V–I in C (Dm7, G7, Cmaj7), the F of Dm7 can stay on as the ♭7 of G7. What is the F called?', 'A common tone', ['A leading tone', 'A tritone', 'An extension'], {
        explain: 'F is shared by Dm7 and G7, so you can keep it while the chord changes underneath.'
      }),
      mc('The two notes that tell you whether a seventh chord is major, minor or dominant are the…', '3rd and 7th', ['root and 5th', '5th and octave', '2nd and 4th'], {
        explain: 'The 3rd (major or minor) and 7th (major or minor) decide the chord quality; these are the "guide tones".'
      }),
      { kind: 'text', prompt: 'How many notes are in a two-octave triad arpeggio from root to root (e.g. R 3 5 R 3 5 R)? Type a number.', accept: ['7', 'seven'], explain: 'Three notes per octave, with the root counted only once at the middle: R 3 5 R 3 5 R is **7 notes**.' },
      mc('Which seventh-chord arpeggio fits the **viiø7** chord in C major (Bm7♭5)?', 'Half-diminished (B D F A)', ['Dominant 7th (B D♯ F♯ A)', 'Minor 7th (B D F♯ A)', 'Diminished 7th (B D F A♭)'], {
        explain: 'The seventh chord on the 7th degree of a major scale is half-diminished: 1 ♭3 ♭5 ♭7 = B D F A.'
      }),
      mc('A sweep-picked **ascending** arpeggio (6th string to 1st string) uses…', 'all downstrokes', ['all upstrokes', 'strict alternate picking', 'only the thumb'], {
        explain: 'A sweep is one continuous pick motion: downstrokes when travelling toward the high strings, upstrokes coming back.'
      }),
      mc('Economy picking differs from strict alternate picking mainly in that it…', 'keeps the stroke direction when crossing strings in the direction of travel', ['uses no pick', 'plays two strings at once', 'only works with one note per string'], {
        explain: 'Economy picking avoids wasted pick motions by keeping the same stroke across a string change.'
      }),
      mc('Which pattern is "1-3-5-8, 3-5-8-10" in a minor triad arpeggio?', 'Groups of four, stepping up one chord tone each time', ['A descending scale', 'Alternating between two strings', 'A chromatic run'], {
        explain: 'Each group of four notes starts one chord tone higher: R ♭3 5 R, then ♭3 5 R ♭3, and so on.'
      })
    ],
    generators: [spellArp, windowTones, hearTriad, hearSeventh, whichArpFits, shapeFret]
  }
}

export default unit
