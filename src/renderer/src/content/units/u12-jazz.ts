import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { mc, rand, scaleMarks, chordToneMarks, distractors } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, shape, shapeMidis } from '@/theory/guitar'
import { ScaleType, scaleSemitones, degreeLabels } from '@/theory/scales'
import { ChordType, chordNames, chordSymbol, diatonicChords } from '@/theory/chords'
import { FLAT_NAMES, SHARP_NAMES, mod, noteName, pitchClass, pretty } from '@/theory/notes'
import { transpose } from '@/theory/intervals'

// ---------- local helpers ----------

const p = (string: number, fret: number) => ({ string, fret })

/** Strum each chord for `beats`, the last one held. */
function prog(shapes: ChordShape[], beats = 2, bpm = 92, toolExample?: ToolExample): PlaySpec {
  return {
    kind: 'sequence',
    bpm,
    toolExample,
    events: shapes.map((s, i) => ({ notes: shapeMidis(s), beats: i === shapes.length - 1 ? Math.max(4, beats) : beats, mode: 'strum' as const }))
  }
}

/** Strum a chord, then run the scale up an octave from the root (root between E3 and D#4). */
function chordThenScale(s: ChordShape, root: string, type: ScaleType, bpm = 132): PlaySpec {
  const r = 52 + mod(pitchClass(root) - 4, 12)
  const notes = [...scaleSemitones(type).map((x) => r + x), r + 12]
  return {
    kind: 'sequence',
    bpm,
    toolExample: { kind: 'scale', root, type },
    events: [
      { notes: shapeMidis(s), beats: 3, mode: 'strum' },
      ...notes.map((n) => ({ notes: [n], beats: 0.5 })),
      { notes: shapeMidis(s), beats: 3, mode: 'strum' }
    ]
  }
}

/** Only the guide tones (3rds and 7ths) of a chord inside a fret window. */
function guideMarks(root: string, type: ChordType, frets: [number, number], strings: number[] = [2, 3, 4, 5]): FretMark[] {
  return chordToneMarks(root, type, frets)
    .filter((mk) => ['3', '♭3', '7', '♭7'].includes(mk.label ?? '') && strings.includes(mk.string))
    .map((mk) => ({ ...mk, color: mk.label!.includes('7') ? ('blue' as const) : ('accent' as const) }))
}

/**
 * Movable 3-note shell voicing (root + 3rd + 7th). Root on the 6th string: R–7–3 on strings 6/4/3;
 * root on the 5th string: R–3–7 on strings 5/4/3. Placed as close to `near` as possible.
 */
const SHELLS: Record<6 | 5, Partial<Record<ChordType, number[]>>> = {
  6: { maj7: [0, 1, 1], dom7: [0, 0, 1], min7: [0, 0, 0], m7b5: [0, 0, 0] },
  5: { maj7: [0, -1, 1], dom7: [0, -1, 0], min7: [0, -2, 0], m7b5: [0, -2, 0] }
}
function shell(root: string, type: ChordType, rs: 6 | 5, near = 5): ChordShape {
  const offs = SHELLS[rs][type]!
  const base = mod(pitchClass(root) - (rs === 6 ? 4 : 9), 12)
  const cands = [base, base + 12].filter((rf) => rf + Math.min(...offs) >= 0)
  const rf = cands.sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0]
  const f = offs.map((o) => rf + o)
  const frets = rs === 6 ? [f[0], null, f[1], f[2], null, null] : [null, f[0], f[1], f[2], null, null]
  return { name: chordSymbol(root, type), frets }
}

function fretsOf(s: ChordShape): number[] {
  return s.frets.filter((f): f is number => f !== null)
}

// ---------- voicings ----------

// Shells
const Dm7s = shape('Dm7', 'x535xx', 'x213xx')
const G7s = shape('G7', '3x34xx', '2x34xx')
const Cmaj7s = shape('Cmaj7', 'x324xx', 'x214xx')
const Cmaj7s6 = shape('Cmaj7', '8x99xx', '1x34xx')
const Gm7s = shape('Gm7', '3x33xx', '2x34xx')
const Gmaj7s = shape('Gmaj7', '3x44xx', '2x34xx')
const Am7s = shape('Am7', '5x55xx', '1x34xx')
const A7s = shape('A7', '5x56xx', '1x23xx')
const Em7s = shape('Em7', 'x757xx', 'x213xx')
const Db7s = shape('D♭7', 'x434xx', 'x213xx')
const Eb7s = shape('E♭7', 'x656xx', 'x213xx')
const Bbmaj7s = shape('B♭maj7', '6x77xx', '1x34xx')
const Cm7s = shape('Cm7', 'x313xx', 'x314xx')
const F7s = shape('F7', '1x12xx', '1x23xx')
const D7s = shape('D7', 'x545xx', 'x213xx')
const C7s = shape('C7', 'x323xx', 'x213xx')
// Drop-2, top four strings
const Dm7t = shape('Dm7', 'xx3535', 'xx1314')
const G7t = shape('G7', 'xx3433', 'xx1211')
const Cmaj7t = shape('Cmaj7', 'xx2413', 'xx2413')
const Fmaj7t = shape('Fmaj7', 'xx3555', 'xx1333')
const F7t = shape('F7', 'xx3545', 'xx1324')
const Fm7t = shape('Fm7', 'xx3544', 'xx1322')
const Fm7b5t = shape('Fm7♭5', 'xx3444', 'xx1222')
// Drop-2, middle strings
const Dm7m = shape('Dm7', 'x5756x', 'x1312x')
const G7m = shape('G7', 'x5546x', 'x2314x')
const Cmaj7m = shape('Cmaj7', 'x3545x', 'x1324x')
const C7m = shape('C7', 'x3535x', 'x1324x')
const Cm7m = shape('Cm7', 'x3534x', 'x1312x')
const Cm7b5m = shape('Cm7♭5', 'x3434x', 'x1324x')
// Minor ii–V–i, altered sounds, tritone subs
const Bm7b5 = shape('Bm7♭5', '7x776x', '2x341x')
const E7b9 = shape('E7♭9', 'x7676x', 'x2131x')
const Am7 = shape('Am7', '5x555x', '1x111x')
const G7b9 = shape('G7♭9', 'xx3434', 'xx1213')
const E7s9 = shape('E7♯9', 'x7678x', 'x2134x')
const Db9 = shape('D♭9', 'x4344x', 'x2133x')

export const U12_VOICINGS: { shape: ChordShape; root: string; type: string; omit?: string[]; extra?: string[] }[] = [
  { shape: Dm7s, root: 'D', type: 'min7', omit: ['A'] },
  { shape: G7s, root: 'G', type: 'dom7', omit: ['D'] },
  { shape: Cmaj7s, root: 'C', type: 'maj7', omit: ['G'] },
  { shape: Cmaj7s6, root: 'C', type: 'maj7', omit: ['G'] },
  { shape: Gm7s, root: 'G', type: 'min7', omit: ['D'] },
  { shape: Gmaj7s, root: 'G', type: 'maj7', omit: ['D'] },
  { shape: Am7s, root: 'A', type: 'min7', omit: ['E'] },
  { shape: A7s, root: 'A', type: 'dom7', omit: ['E'] },
  { shape: Em7s, root: 'E', type: 'min7', omit: ['B'] },
  { shape: Db7s, root: 'Db', type: 'dom7', omit: ['Ab'] },
  { shape: Eb7s, root: 'Eb', type: 'dom7', omit: ['Bb'] },
  { shape: Bbmaj7s, root: 'Bb', type: 'maj7', omit: ['F'] },
  { shape: Cm7s, root: 'C', type: 'min7', omit: ['G'] },
  { shape: F7s, root: 'F', type: 'dom7', omit: ['C'] },
  { shape: D7s, root: 'D', type: 'dom7', omit: ['A'] },
  { shape: C7s, root: 'C', type: 'dom7', omit: ['G'] },
  { shape: Dm7t, root: 'D', type: 'min7' },
  { shape: G7t, root: 'G', type: 'dom7' },
  { shape: Cmaj7t, root: 'C', type: 'maj7' },
  { shape: Fmaj7t, root: 'F', type: 'maj7' },
  { shape: F7t, root: 'F', type: 'dom7' },
  { shape: Fm7t, root: 'F', type: 'min7' },
  { shape: Fm7b5t, root: 'F', type: 'm7b5' },
  { shape: Dm7m, root: 'D', type: 'min7' },
  { shape: G7m, root: 'G', type: 'dom7' },
  { shape: Cmaj7m, root: 'C', type: 'maj7' },
  { shape: C7m, root: 'C', type: 'dom7' },
  { shape: Cm7m, root: 'C', type: 'min7' },
  { shape: Cm7b5m, root: 'C', type: 'm7b5' },
  { shape: Bm7b5, root: 'B', type: 'm7b5' },
  { shape: E7b9, root: 'E', type: 'dom7b9', omit: ['B'] },
  { shape: Am7, root: 'A', type: 'min7' },
  { shape: G7b9, root: 'G', type: 'dom7b9', omit: ['G'] },
  { shape: E7s9, root: 'E', type: 'dom7s9', omit: ['B'] },
  { shape: Db9, root: 'Db', type: 'dom9', omit: ['Ab'] }
]

// ---------- data from the theory engine ----------

const IIVI_KEYS = ['C', 'F', 'Bb', 'Eb', 'G', 'D']
const iiVIRow = (key: string) => {
  const ch = diatonicChords(key, 'major', true)
  return [key, ch[1].symbol, ch[4].symbol, ch[0].symbol]
}

const CHORD_SCALE_ROWS = [
  ['m7', 'Dorian', '1 2 ♭3 4 5 6 ♭7', 'Dm7 → D Dorian'],
  ['maj7', 'Ionian (avoid holding the 4)', '1 2 3 4 5 6 7', 'Cmaj7 → C Ionian'],
  ['maj7♯11', 'Lydian', '1 2 3 ♯4 5 6 7', 'Fmaj7♯11 → F Lydian'],
  ['7 (unaltered)', 'Mixolydian', '1 2 3 4 5 6 ♭7', 'G7 → G Mixolydian'],
  ['7♯11', 'Lydian dominant', '1 2 3 ♯4 5 6 ♭7', 'D7♯11 → D Lydian dominant'],
  ['7♭9 (13)', 'Half-whole diminished', '1 ♭9 ♯9 3 ♯11 5 6 ♭7', 'G7♭9 → G half-whole'],
  ['7alt (♭9 ♯9 ♯11 ♭13)', 'Altered (7th mode of melodic minor)', '1 ♭9 ♯9 3 ♯11 ♭13 ♭7', 'G7alt → G altered'],
  ['7♭9 → minor', 'Phrygian dominant (5th mode of harmonic minor)', '1 ♭2 3 4 5 ♭6 ♭7', 'E7♭9 → Am: E Phrygian dominant'],
  ['m7♭5', 'Locrian', '1 ♭2 ♭3 4 ♭5 ♭6 ♭7', 'Bm7♭5 → B Locrian'],
  ['m(maj7)', 'Melodic minor', '1 2 ♭3 4 5 6 7', 'Cm(maj7) → C melodic minor']
]

// ---------- generated questions ----------

/** Show generated prompts/explanations with real sharp and flat glyphs. */
const pq = (q: QuizQuestion): QuizQuestion => ({ ...q, prompt: pretty(q.prompt), explain: q.explain && pretty(q.explain) })

const KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'G', 'D', 'A', 'E']

const iiVIQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const ch = diatonicChords(key, 'major', true)
  const line = (k: string) => {
    const c = diatonicChords(k, 'major', true)
    return `${c[1].symbol} – ${c[4].symbol} – ${c[0].symbol}`
  }
  const correct = line(key)
  const wrong = [
    line(noteName(transpose(key, 'P5'))),
    line(noteName(transpose(key, 'P4'))),
    `${chordSymbol(ch[1].root, 'min7')} – ${chordSymbol(ch[4].root, 'maj7')} – ${ch[0].symbol}`,
    `${chordSymbol(ch[1].root, 'dom7')} – ${ch[4].symbol} – ${ch[0].symbol}`
  ]
  return mc(`What is the **ii–V–I** in **${key} major**?`, correct, distractors(wrong, correct, 3), {
    explain: `Degrees 2, 5 and 1 of ${key} major, as seventh chords: **${correct}** (m7, dominant 7, maj7).`
  })
}

const tritoneSubQ = (): QuizQuestion => {
  const root = rand(['G', 'C', 'D', 'A', 'E', 'F', 'Bb', 'B'])
  const pc = mod(pitchClass(root) + 6, 12)
  const names = [...new Set([FLAT_NAMES[pc], SHARP_NAMES[pc]])]
  const g = chordNames(root, 'dom7')
  return {
    kind: 'text',
    prompt: `What is the **tritone substitute** for **${noteName(root)}7**? (Type a chord symbol such as Bb7 or F#7.)`,
    accept: names.map((n) => n + '7'),
    explain: `A tritone (6 half steps) from ${noteName(root)} is **${names.join(' / ')}**, so the sub is **${names.join('7 / ')}7**. Both chords share the same guide tones: ${g[1]} and ${g[3]} (spelled enharmonically in the sub).`
  }
}

const guideToneQ = (): QuizQuestion => {
  let root: string, type: ChordType, notes: string[]
  do {
    root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab'])
    type = rand(['maj7', 'dom7', 'min7'] as ChordType[])
    notes = chordNames(root, type)
  } while (notes.some((n) => /##|bb|Cb|Fb|E#|B#/.test(n)))
  const answer = [notes[1], notes[3]]
  return {
    kind: 'spell',
    prompt: `Spell the **guide tones** of **${chordSymbol(root, type)}**: the 3rd, then the 7th.`,
    answer,
    explain: `${chordSymbol(root, type)} = ${notes.join(' ')}. Guide tones: **${answer[0]}** (3rd) and **${answer[1]}** (7th).`
  }
}

const CS: { type: ChordType; scale: ScaleType; label: string }[] = [
  { type: 'min7', scale: 'dorian', label: 'Dorian' },
  { type: 'maj7s11', scale: 'lydian', label: 'Lydian' },
  { type: 'dom7', scale: 'mixolydian', label: 'Mixolydian' },
  { type: 'm7b5', scale: 'locrian', label: 'Locrian' },
  { type: 'dom7b9', scale: 'diminishedHW', label: 'half-whole diminished' }
]
const chordScaleQ = (): QuizQuestion => {
  const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'B'].filter((r) => r !== 'B'))
  const c = rand(CS)
  const correct = `${root} ${c.label}`
  const wrong = ['Dorian', 'Lydian', 'Mixolydian', 'Locrian', 'Phrygian', 'Aeolian', 'half-whole diminished', 'Ionian']
    // Aeolian and Phrygian are also legitimate scales over other m7 chords (vi, iii), so they can't be "wrong" for m7
    .filter((x) => x !== c.label && !(c.type === 'min7' && (x === 'Aeolian' || x === 'Phrygian'))).map((x) => `${root} ${x}`)
  return mc(`Which scale is the standard chord-scale choice over **${chordSymbol(root, c.type)}**?`, correct, distractors(wrong, correct, 3), {
    explain: `${CHORDS_FORMULA[c.type]} matches **${c.label}** (${degreeLabels(c.scale).join(' ')}), which contains every chord tone with no clashing notes.`
  })
}
const CHORDS_FORMULA: Partial<Record<ChordType, string>> = {
  min7: 'A m7 chord (1 ♭3 5 ♭7) with a natural 9 and 13',
  maj7s11: 'A maj7♯11 chord (1 3 5 7 ♯11)',
  dom7: 'An unaltered dominant 7 (1 3 5 ♭7)',
  m7b5: 'A m7♭5 chord (1 ♭3 ♭5 ♭7)',
  dom7b9: 'A 7♭9 chord (1 3 5 ♭7 ♭9) with ♯9, ♯11 and 13 available'
}

const minorIIVQ = (): QuizQuestion => {
  const key = rand(['A', 'D', 'E', 'G', 'C', 'B', 'F'])
  const ii = noteName(transpose(key, 'M2'))
  const v = noteName(transpose(key, 'P5'))
  const correct = `${chordSymbol(ii, 'm7b5')} – ${chordSymbol(v, 'dom7b9')} – ${chordSymbol(key, 'min7')}`
  const wrong = [
    `${chordSymbol(ii, 'min7')} – ${chordSymbol(v, 'dom7')} – ${chordSymbol(key, 'maj7')}`,
    `${chordSymbol(ii, 'min7')} – ${chordSymbol(v, 'min7')} – ${chordSymbol(key, 'min7')}`,
    `${chordSymbol(v, 'm7b5')} – ${chordSymbol(transpose(key, 'P4'), 'dom7b9')} – ${chordSymbol(key, 'min7')}`
  ]
  return mc(`What is the **minor ii–V–i** in **${key} minor**?`, correct, wrong, {
    explain: `From ${key} harmonic minor: ii is half-diminished (${chordSymbol(ii, 'm7b5')}), V is dominant with a ♭9 (${chordSymbol(v, 'dom7b9')}), resolving to ${chordSymbol(key, 'min7')}.`
  })
}

const hearSubQ = (): QuizQuestion => {
  const key = rand(['C', 'D', 'F', 'G', 'A', 'Bb'])
  const sub = Math.random() < 0.5
  const ii = noteName(transpose(key, 'M2'))
  const iiS = shell(ii, 'min7', 5, 5)
  const near = Math.min(...fretsOf(iiS))
  const vS = sub ? shell(FLAT_NAMES[mod(pitchClass(key) + 1, 12)], 'dom7', 5, near) : shell(noteName(transpose(key, 'P5')), 'dom7', 6, near)
  const iS = shell(key, 'maj7', 5, near)
  return mc('Listen to this **ii – V – I**. Is the middle chord the normal **V7**, or its **tritone substitute** (♭II7)?', sub ? 'Tritone sub (♭II7)' : 'Normal V7', [sub ? 'Normal V7' : 'Tritone sub (♭II7)'], {
    play: prog([iiS, vS, iS], 2, 80),
    explain: sub
      ? 'The bass slides down by half steps (ii → ♭II → I): that chromatic descent is the tritone sub\'s signature.'
      : 'The bass leaps down a 5th (or up a 4th) from V to I: the normal dominant.'
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u12',
  number: 12,
  title: 'Jazz and advanced harmony',
  summary: 'ii–V–I in major and minor, guide tones, shell and drop-2 voicings, tritone subs, chord-scales, turnarounds and enclosures.',
  lessons: [
    {
      id: 'u12l1',
      title: 'The ii–V–I',
      summary: 'The most important progression in jazz: what it is, why it works, and how it moves around the neck.',
      blocks: [
        {
          type: 'text',
          md: `If jazz harmony has one sentence it repeats endlessly, it's **ii–V–I**. In C major that's **Dm7 – G7 – Cmaj7**. Standards like *Autumn Leaves*, *Satin Doll* and *Tune Up* are built almost entirely from chains of ii–V–Is in different keys.

Why does it work so well?
- **Root motion by 5ths.** D → G → C: each root falls a 5th (or rises a 4th), the strongest root movement in tonal music.
- **Function.** ii is *pre-dominant* (it sets up tension), V7 is *dominant* (maximum tension, with the tritone B–F), I is *tonic* (release).
- **Smooth voice leading.** As you'll see next lesson, the inner notes move by a half step or stay put.`
        },
        { type: 'chords', shapes: [Dm7m, G7m, Cmaj7m], toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major')], caption: 'ii–V–I in C on the middle strings: Dm7 – G7 – Cmaj7.' },
        { type: 'audio', label: 'ii – V – I in C', play: prog([Dm7m, G7m, Cmaj7m], 4, 88, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 88, 4)) },
        {
          type: 'table',
          headers: ['Key', 'ii7', 'V7', 'Imaj7'],
          rows: IIVI_KEYS.map(iiVIRow),
          caption: 'ii–V–I in common jazz keys (built from diatonic seventh chords).',
          toolExamples: IIVI_KEYS.map((key) => ({ ...progressionExample(key, ['ii7', 'V7', 'Imaj7'], 'major'), label: `${key}: ii7 – V7 – Imaj7` }))
        },
        {
          type: 'text',
          md: `### On the fretboard
Root positions make the ii–V–I a compact shape. Put the **ii** on the 5th string, the **V** on the 6th string two frets lower, and the **I** on the 5th string at that same fret. Or flip it: ii on the 6th string, V on the 5th string at the same fret, I on the 6th string two frets lower. Move either shape anywhere to change key.`
        },
        {
          type: 'fretboard',
          marks: [
            { ...p(5, 5), label: 'ii', color: 'tone' },
            { ...p(6, 3), label: 'V', color: 'accent' },
            { ...p(5, 3), label: 'I', color: 'root' },
            { ...p(6, 10), label: 'ii', color: 'tone' },
            { ...p(5, 10), label: 'V', color: 'accent' },
            { ...p(6, 8), label: 'I', color: 'root' }
          ],
          frets: [0, 12],
          caption: 'Two root patterns for ii–V–I in C. Left: D (5th string) → G (6th) → C (5th). Right: D (6th) → G (5th) → C (6th).',
          playable: true
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Play the ii–V–I in C, then move the whole shape **down two frets** (B♭), then two more (A♭). Jazz tunes constantly jump between keys a whole step apart.`
        },
        {
          type: 'tryIt',
          question: mc('What is the ii–V–I in **F major**?', 'Gm7 – C7 – Fmaj7', ['Dm7 – G7 – Cmaj7', 'Gm7 – Cmaj7 – F7', 'Cm7 – F7 – B♭maj7'], {
            explain: 'F major: ii = **Gm7**, V = **C7**, I = **Fmaj7**.'
          })
        }
      ]
    },
    {
      id: 'u12l2',
      title: 'Guide tones and shell voicings',
      summary: 'The 3rd and 7th define a chord. Learn to see them, voice-lead them, and play three-note shells.',
      blocks: [
        {
          type: 'text',
          md: `You first met shell voicings in [[u9l4]]. Here we look at why they work.

Of the four notes in a seventh chord, two do almost all the work:
- The **3rd** says major or minor.
- The **7th** says maj7, dominant 7 or m7.

The **root** is often played by the bass, and the **5th** is usually the same perfect 5th in every chord, so jazz guitarists often leave them out. The 3rd and 7th are called **guide tones**.

In a ii–V–I they move beautifully: the **7th of each chord falls a half step to the 3rd of the next** (or stays put).`
        },
        {
          type: 'table',
          headers: ['', 'Dm7', 'G7', 'Cmaj7'],
          rows: [
            ['7th', 'C', 'F', 'B'],
            ['3rd', 'F', 'B', 'E']
          ],
          caption: 'Guide-tone voice leading: C → B → B and F → F → E. Only one note moves at each change, by a half step.',
          toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major')]
        },
        {
          type: 'tab',
          caption: 'Guide tones only, on the D and G strings. Two notes are enough to hear the whole progression.',
          toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80, 4)],
          bpm: 80,
          events: [
            { pos: [p(4, 3), p(3, 5)], beats: 4 },
            { pos: [p(4, 3), p(3, 4)], beats: 4 },
            { pos: [p(4, 2), p(3, 4)], beats: 4 }
          ]
        },
        {
          type: 'fretboard',
          marks: guideMarks('G', 'dom7', [2, 6]),
          frets: [0, 8],
          caption: 'G7 guide tones in frets 2–6 (strings 2–5): 3rd (B) in orange, ♭7 (F) in blue. They form a tritone.'
        },
        {
          type: 'fretboard',
          marks: guideMarks('C', 'maj7', [2, 6]),
          frets: [0, 8],
          caption: 'Cmaj7 guide tones in the same area: 3rd (E) orange, 7th (B) blue. Compare with G7: F → E, B stays.'
        },
        {
          type: 'text',
          md: `### Shell voicings
Add the root on the 6th or 5th string to the guide tones and you have a **shell voicing**: three notes, no 5th, instantly jazzy, and easy to move. There are only two shapes per chord type:
- **Root on the 6th string**: root, 7th (4th string), 3rd (3rd string)
- **Root on the 5th string**: root, 3rd (4th string), 7th (3rd string)

Mute the strings you don't play with the edges of your fretting fingers.`
        },
        { type: 'chords', shapes: [G7s, Cmaj7s6, Gm7s, Gmaj7s], caption: 'Root-on-6th shells: G7 (R ♭7 3), Cmaj7 (R 7 3), Gm7, Gmaj7.' },
        { type: 'chords', shapes: [Dm7s, Cmaj7s, C7s, Cm7s], caption: 'Root-on-5th shells: Dm7, Cmaj7, C7, Cm7 (R 3 7).' },
        {
          type: 'text',
          md: `### ii–V–I with shells
Alternate string sets: **ii on the 5th string, V on the 6th, I on the 5th**. Your hand barely moves and the guide tones lead perfectly.`
        },
        { type: 'chords', shapes: [Dm7s, G7s, Cmaj7s], toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major')], caption: 'Dm7 (x535xx) – G7 (3x34xx) – Cmaj7 (x324xx).' },
        { type: 'audio', label: 'Shell ii – V – I in C', play: prog([Dm7s, G7s, Cmaj7s], 4, 84, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 84, 4)) },
        {
          type: 'tip',
          tone: 'practice',
          md: `Comp through the ii–V–I in all 12 keys with shells. Then play only the guide tones (drop the root) while a friend or looper plays the bass. That's how big-band guitarists like Freddie Green kept the time: tiny voicings, perfect voice leading.`
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'Spell the guide tones of **G7**: the 3rd, then the 7th.', answer: ['B', 'F'], explain: 'G7 = G B D F. Guide tones: **B** (3rd) and **F** (♭7), a tritone apart.' }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The Cmaj7 shell `x324xx` is shown. Click its **7th (B)**.',
            marks: [
              { ...p(5, 3), label: 'R', color: 'root' },
              { ...p(4, 2), label: '?', color: 'tone' },
              { ...p(3, 4), label: '?', color: 'tone' }
            ],
            frets: [0, 6],
            targets: [{ string: 3, fret: 4 }],
            explain: 'On the root-5th-string shell, the 7th is on the **G string** (here fret 4 = B). The D-string note (fret 2) is E, the 3rd.'
          }
        }
      ]
    },
    {
      id: 'u12l3',
      title: 'Drop-2 voicings',
      summary: 'Four-note chords on the top four and middle string sets, built by "dropping" one note.',
      blocks: [
        {
          type: 'text',
          md: `A **close voicing** stacks a chord's four notes as tightly as possible, inside one octave: G B C E is Cmaj7 in close position (an inversion, with the G at the bottom). Close voicings are often unplayable on guitar (they need huge stretches).

The fix: take the **second-highest note** and **drop it an octave**. G B **C** E becomes **C** G B E. This is a **drop-2 voicing**: four notes spread over four adjacent strings, one note per string, very playable. Most "jazz chord" shapes you've seen are drop-2.`
        },
        {
          type: 'staff',
          caption: 'Cmaj7 close voicing (G B C E), then drop-2 (C G B E): the C has dropped an octave.',
          notes: [
            { keys: ['g/4', 'b/4', 'c/5', 'e/5'], duration: 'h' },
            { keys: ['c/4', 'g/4', 'b/4', 'e/5'], duration: 'h' }
          ]
        },
        {
          type: 'text',
          md: `### Top four strings (4–3–2–1)
With the root on the 4th string, each chord type differs by one or two notes. Learn them as a family, in F:`
        },
        { type: 'chords', shapes: [Fmaj7t, F7t, Fm7t, Fm7b5t], caption: 'Drop-2 on strings 4–1, root on the D string: Fmaj7, F7, Fm7, Fm7♭5.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Fmaj7', play: { kind: 'shape', shape: Fmaj7t, mode: 'strum' } },
            { label: 'F7', play: { kind: 'shape', shape: F7t, mode: 'strum' } },
            { label: 'Fm7', play: { kind: 'shape', shape: Fm7t, mode: 'strum' } },
            { label: 'Fm7♭5', play: { kind: 'shape', shape: Fm7b5t, mode: 'strum' } }
          ]
        },
        {
          type: 'text',
          md: `Watch the B string (2nd) and E string (1st): maj7 → 7 lowers the 7th (E → E♭) on the B string; 7 → m7 lowers the 3rd (A → A♭) on the E string; m7 → m7♭5 lowers the 5th (C → C♭) on the G string.

### Middle strings (5–4–3–2)
The same idea one string set lower, root on the 5th string:`
        },
        { type: 'chords', shapes: [Cmaj7m, C7m, Cm7m, Cm7b5m], caption: 'Drop-2 on strings 5–2, root on the A string: Cmaj7, C7, Cm7, Cm7♭5.' },
        {
          type: 'text',
          md: `### ii–V–I with drop-2
Choose voicings that stay in one area of the neck. Each note moves to the **nearest** note of the next chord, which is how a pianist or horn section would voice it.`
        },
        { type: 'chords', shapes: [Dm7t, G7t, Cmaj7t], toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major')], caption: 'Top-four strings: Dm7 (F C D A) – G7 (F B D G) – Cmaj7 (E B C G). Each note moves by a step or stays put.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Top four: Dm7 – G7 – Cmaj7', play: prog([Dm7t, G7t, Cmaj7t], 4, 84, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 84, 4)) },
            { label: 'Middle: Dm7 – G7 – Cmaj7', play: prog([Dm7m, G7m, Cmaj7m], 4, 84, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 84, 4)) }
          ]
        },
        { type: 'chords', shapes: [Dm7m, G7m, Cmaj7m], toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major')], caption: 'Middle strings: Dm7 (D A C F) – G7 (D G B F) – Cmaj7 (C G B E).' },
        {
          type: 'tip',
          tone: 'theory',
          md: `Every drop-2 voicing has **four inversions** on each string set (root, 3rd, 5th or 7th on the bottom), so a single chord can be played in four places along the neck. Start with the shapes here, then find the inversions by moving each note up to the next chord tone on its string.`
        },
        {
          type: 'tryIt',
          question: mc('How is a **drop-2** voicing made?', 'Take a close voicing and lower its second-highest note by an octave', [
            'Remove the 2nd and the 5th from the chord',
            'Lower the root by two frets',
            'Play only the top two strings'
          ], { explain: 'G B C E (close) → drop the C an octave → **C G B E**.' })
        }
      ]
    },
    {
      id: 'u12l4',
      title: 'Minor ii–V–i and the tritone substitution',
      summary: 'iiø7–V7♭9–i from harmonic minor, and swapping V7 for the dominant a tritone away.',
      blocks: [
        {
          type: 'text',
          md: `### The minor ii–V–i
In a minor key, the chords come from **harmonic minor** ([[u11l1]]). In A minor:
- **ii** is **Bm7♭5** (B D F A), also written **Bø7**: half-diminished.
- **V** is **E7**, usually with a **♭9** (F) added: **E7♭9** (E G♯ B D F). The F and G♯ come straight from A harmonic minor.
- **i** is **Am7**, **Am6** or **Am(maj7)**.

The result is darker and more dramatic than the major ii–V–I. *Autumn Leaves*, *Blue Bossa* and *Softly, As in a Morning Sunrise* all lean on it.`
        },
        { type: 'chords', shapes: [Bm7b5, E7b9, Am7], toolExamples: [progressionExample('A', ['ii7b5', 'V7b9', 'i7'], 'harmonicMinor')], caption: 'Minor ii–V–i in A: Bm7♭5 – E7♭9 – Am7.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Minor ii–V–i in A', play: prog([Bm7b5, E7b9, Am7], 4, 80, progressionExample('A', ['ii7b5', 'V7b9', 'i7'], 'harmonicMinor', 80, 4)) },
            { label: 'Major ii–V–I in C (compare)', play: prog([Dm7m, G7m, Cmaj7m], 4, 80, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80, 4)) }
          ]
        },
        {
          type: 'text',
          md: `### The tritone substitution
Look at G7's guide tones: **B and F**, a tritone apart. Now look at **D♭7** (D♭ F A♭ C♭): its guide tones are **F and C♭**, and C♭ is the same pitch as B. The two chords share the same tritone, just flipped.

Since the tritone is what makes a dominant want to resolve, **any dominant 7 can be replaced by the dominant 7 a tritone away**. That's the **tritone substitution**, or "sub V". The ii–V–I becomes **Dm7 – D♭7 – Cmaj7**, and the bass slides down chromatically: D → D♭ → C.`
        },
        { type: 'chords', shapes: [G7s, Db7s], caption: 'G7 shell (G F B) and D♭7 shell (D♭ F C♭): the F and B/C♭ are literally the same two notes on the same frets. Only the root changes, and the 3rd and 7th swap roles.' },
        { type: 'chords', shapes: [Dm7s, Db7s, Cmaj7s], toolExamples: [progressionExample('C', ['ii7', 'bII7', 'Imaj7'], 'major')], caption: 'ii – subV – I: Dm7 – D♭7 – Cmaj7. The shells slide down a fret at a time.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Dm7 – G7 – Cmaj7', play: prog([Dm7s, G7s, Cmaj7s], 4, 80, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80, 4)) },
            { label: 'Dm7 – D♭7 – Cmaj7 (tritone sub)', play: prog([Dm7s, Db7s, Cmaj7s], 4, 80, progressionExample('C', ['ii7', 'bII7', 'Imaj7'], 'major', 80, 4)) },
            { label: 'Dm7 – D♭9 – Cmaj7', play: prog([Dm7s, Db9, Cmaj7s], 4, 80, progressionExample('C', ['ii7', 'bII9', 'Imaj7'], 'major', 80, 4)) }
          ]
        },
        {
          type: 'fretboard',
          marks: [
            { ...p(6, 3), label: 'G', color: 'root' },
            { ...p(4, 3), label: 'F', color: 'blue' },
            { ...p(3, 4), label: 'B', color: 'accent' },
            { ...p(5, 4), label: 'D♭', color: 'tone' },
            { ...p(2, 6), label: 'F', color: 'blue' },
            { ...p(1, 7), label: 'C♭', color: 'accent' }
          ],
          frets: [0, 9],
          caption: 'G7 guide tones (left) and the same pitch classes over a D♭ root. The tritone F–B is shared.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `The sub works in reverse too: over G7, improvising with **D♭ Lydian dominant** gives you the same notes as **G altered**. That's a peek at chord-scale theory, next lesson. Note the spelling: the sub of G7 is **D♭7**, not C♯7, because it resolves down a half step to C.`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'What is the tritone substitute for **D7**? (Type a chord symbol such as Bb7 or F#7.)', accept: ['Ab7', 'G#7'], explain: 'D + 6 half steps = **A♭**. A♭7 shares D7\'s guide tones (F♯/G♭ and C).' }
        },
        {
          type: 'tryIt',
          question: mc('Listen. Normal V7 or tritone sub?', 'Tritone sub', ['Normal V7'], {
            play: prog([Dm7s, Db7s, Cmaj7s], 4, 80, progressionExample('C', ['ii7', 'bII7', 'Imaj7'], 'major', 80, 4)),
            explain: 'The bass slid down by half steps, D → D♭ → C: **tritone sub**.'
          })
        }
      ]
    },
    {
      id: 'u12l5',
      title: 'Chord-scale theory',
      summary: 'Which scale fits which chord: Dorian, Mixolydian, Lydian, altered, half-whole and Locrian.',
      blocks: [
        {
          type: 'text',
          md: `**Chord-scale theory** matches every chord with a scale that contains all its chord tones and fills the gaps with compatible tensions (9ths, 11ths, 13ths). It's a practical map for improvising: when the chord changes, the scale changes.

It's also where the modes from [[u10l1]] get their day job.`
        },
        { type: 'table', headers: ['Chord', 'Scale', 'Scale formula', 'Example'], rows: CHORD_SCALE_ROWS, caption: 'Common chord-scale pairings.' },
        {
          type: 'text',
          md: `### In a ii–V–I, the "easy" answer
Over **Dm7 – G7 – Cmaj7**, the chord-scales are D Dorian, G Mixolydian and C Ionian: all the **same seven notes**. So for diatonic ii–V–Is, one major scale covers everything, but **aim for the chord tones** of whichever chord is sounding, especially the guide tones.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Dm7 → D Dorian', play: chordThenScale(Dm7m, 'D', 'dorian') },
            { label: 'G7 → G Mixolydian', play: chordThenScale(G7m, 'G', 'mixolydian') },
            { label: 'Fmaj7 → F Lydian', play: chordThenScale(Fmaj7t, 'F', 'lydian') },
            { label: 'Cm7♭5 → C Locrian', play: chordThenScale(Cm7b5m, 'C', 'locrian') }
          ]
        },
        {
          type: 'text',
          md: `### Dominant chords: where the colours are
A dominant 7th is meant to be tense, so jazz players add even more tension. Three scales cover most situations:
- **Mixolydian**: unaltered, "inside" sound (9 and 13).
- **Half-whole diminished**: alternating half and whole steps; gives ♭9, ♯9, ♯11 *and* the natural 13. Great over **7♭9** and 13♭9 chords.
- **Altered** (super-Locrian, the 7th mode of melodic minor): keeps only 1, 3 and ♭7 and alters everything else: ♭9, ♯9, ♯11, ♭13. Maximum tension before resolving. (The app labels its degrees 1 ♭2 ♯2 3 ♯4 ♯5 ♭7; jazz players call them 1 ♭9 ♯9 3 ♯11 ♭13 ♭7.)`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'mixolydian', { frets: [2, 6], label: 'degree' }),
          frets: [1, 8],
          caption: 'G Mixolydian around the 3rd position.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'altered', { frets: [2, 6], label: 'degree' }),
          frets: [1, 8],
          caption: 'G altered in the same area: only G, B and F remain from Mixolydian.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'diminishedHW', { frets: [2, 6], label: 'degree' }),
          frets: [1, 8],
          caption: 'G half-whole diminished: 8 notes, a symmetrical pattern that repeats every 3 frets.',
          playAll: true
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G7♭9 → G half-whole', play: chordThenScale(G7b9, 'G', 'diminishedHW') },
            { label: 'E7♯9 → E altered', play: chordThenScale(E7s9, 'E', 'altered') },
            { label: 'E7♭9 → E Phrygian dominant', play: chordThenScale(E7b9, 'E', 'phrygianDominant') }
          ]
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**Chord-scales are a map, not the music.** Running scales up and down over chords sounds like an exercise. Use the scale to know which notes are *safe*, then build lines that target **chord tones on strong beats**. The next lesson shows how.`
        },
        {
          type: 'tryIt',
          question: mc('Which scale is the usual choice over **Bm7♭5**?', 'B Locrian', ['B Dorian', 'B Phrygian', 'B Aeolian'], {
            explain: 'Locrian (1 ♭2 ♭3 4 ♭5 ♭6 ♭7) contains the ♭5 of the half-diminished chord. In C major, Bm7♭5 is vii, and B Locrian is C major from B.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Over **Fmaj7♯11**, which scale fits?', 'F Lydian', ['F Ionian', 'F Mixolydian', 'F Dorian'], {
            explain: 'The ♯11 (B) is Lydian\'s ♯4: **F Lydian** = F G A B C D E.'
          })
        }
      ]
    },
    {
      id: 'u12l6',
      title: 'Turnarounds, rhythm changes and enclosures',
      summary: 'I–vi–ii–V and its cousins, the "I Got Rhythm" changes, and targeting chord tones with approach notes.',
      blocks: [
        {
          type: 'text',
          md: `A **turnaround** is a short progression at the end of a section that "turns around" to the top. The basic one is **I – vi – ii – V**, in C **Cmaj7 – Am7 – Dm7 – G7**. Jazz players spice it up:
- **I – VI7 – ii – V**: make vi a dominant (A7, the V7/ii from [[u11l4]]) so it pulls harder to Dm7.
- **iii – VI7 – ii – V**: replace I with its close relative iii (Em7). Every chord now moves by 5ths: E → A → D → G → C.
- **Tritone subs**: Cmaj7 – E♭7 – Dm7 – D♭7 – Cmaj7. The bass moves chromatically.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'I – vi – ii – V', play: prog([Cmaj7s, Am7s, Dm7s, G7s, Cmaj7s], 2, 100, progressionExample('C', ['Imaj7', 'vi7', 'ii7', 'V7', 'Imaj7'], 'major', 100, 2)) },
            { label: 'I – VI7 – ii – V', play: prog([Cmaj7s, A7s, Dm7s, G7s, Cmaj7s], 2, 100, progressionExample('C', ['Imaj7', 'VI7', 'ii7', 'V7', 'Imaj7'], 'major', 100, 2)) },
            { label: 'iii – VI7 – ii – V', play: prog([Em7s, A7s, Dm7s, G7s, Cmaj7s], 2, 100, progressionExample('C', ['iii7', 'VI7', 'ii7', 'V7', 'Imaj7'], 'major', 100, 2)) },
            { label: 'With tritone subs', play: prog([Cmaj7s, Eb7s, Dm7s, Db7s, Cmaj7s], 2, 100, progressionExample('C', ['Imaj7', 'bIII7', 'ii7', 'bII7', 'Imaj7'], 'major', 100, 2)) }
          ]
        },
        { type: 'chords', shapes: [Em7s, A7s, Dm7s, G7s, Cmaj7s], toolExamples: [progressionExample('C', ['iii7', 'VI7', 'ii7', 'V7', 'Imaj7'], 'major')], caption: 'iii – VI7 – ii – V – I with shells: Em7 – A7 – Dm7 – G7 – Cmaj7.' },
        {
          type: 'text',
          md: `### Rhythm changes
After the blues, the most-played jazz form is **rhythm changes**, based on George Gershwin's *I Got Rhythm*. It's a 32-bar **AABA** form, usually in **B♭**:
- **A sections**: fast turnarounds, **B♭ – G7 – Cm7 – F7** (I – VI7 – ii – V) two chords per bar, with variations.
- **Bridge (B)**: a chain of secondary dominants, two bars each: **D7 – G7 – C7 – F7**, each the V of the next, landing back on B♭.

Charlie Parker's *Anthropology* and Sonny Rollins's *Oleo* are famous tunes on these changes.`
        },
        { type: 'chords', shapes: [Bbmaj7s, G7s, Cm7s, F7s], toolExamples: [progressionExample('Bb', ['Imaj7', 'VI7', 'ii7', 'V7'], 'major')], caption: 'Rhythm changes A section in B♭: B♭maj7 – G7 – Cm7 – F7.' },
        {
          type: 'audioRow',
          items: [
            { label: 'A section turnaround', play: prog([Bbmaj7s, G7s, Cm7s, F7s, Bbmaj7s, G7s, Cm7s, F7s, Bbmaj7s], 2, 132, progressionExample('Bb', ['Imaj7', 'VI7', 'ii7', 'V7', 'Imaj7', 'VI7', 'ii7', 'V7', 'Imaj7'], 'major', 132, 2)) },
            { label: 'Bridge: D7 – G7 – C7 – F7', play: prog([D7s, G7s, C7s, F7s, Bbmaj7s], 4, 132, progressionExample('Bb', ['III7', 'VI7', 'II7', 'V7', 'Imaj7'], 'major', 132, 4)) }
          ]
        },
        {
          type: 'text',
          md: `### Approach notes and enclosures
Bebop lines sound "inside" because they **land on chord tones on strong beats**, and they get there in style:
- **Chromatic approach**: a note one fret below (or above) the target.
- **Scale approach**: the scale note above or below.
- **Enclosure**: surround the target, one note above and one below, then hit it. Typical: scale note above → chromatic note below → target.

Here they all aim at **E**, the 3rd of Cmaj7, on the B string:`
        },
        {
          type: 'tab',
          caption: 'Targeting E (2nd string, 5th fret): chromatic from below (D♯), scale from above (F), enclosure F – D♯ – E, double chromatic D – D♯ – E.',
          bpm: 80,
          notation: true,
          events: [
            { pos: [p(2, 4)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 1.5 },
            { pos: [p(2, 6)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 1.5 },
            { pos: [p(2, 6)], beats: 0.5 },
            { pos: [p(2, 4)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 1 },
            { pos: [p(2, 3)], beats: 0.5 },
            { pos: [p(2, 4)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 1 }
          ]
        },
        {
          type: 'tab',
          caption: 'A ii–V–I line: arpeggiate Dm7, descend through G7, then enclose the E (F – D♯) to land on the 3rd of Cmaj7 on beat 1.',
          toolExamples: [progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 100, 4)],
          bpm: 100,
          events: [
            { pos: [p(2, 3)], beats: 1 },
            { pos: [p(2, 6)], beats: 1 },
            { pos: [p(1, 5)], beats: 1 },
            { pos: [p(1, 8)], beats: 1 },
            { pos: [p(1, 7)], beats: 1 },
            { pos: [p(1, 5)], beats: 0.5 },
            { pos: [p(1, 3)], beats: 0.5 },
            { pos: [p(2, 6)], beats: 1 },
            { pos: [p(2, 4)], beats: 1 },
            { pos: [p(2, 5)], beats: 4 }
          ]
        },
        {
          type: 'tab',
          caption: 'Chromatic enclosure of the root C: D♭ above, B below, then C.',
          bpm: 90,
          events: [
            { pos: [p(2, 2)], beats: 0.5 },
            { pos: [p(2, 0)], beats: 0.5 },
            { pos: [p(2, 1)], beats: 2 }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Pick one target, the 3rd of each chord in a ii–V–I, and enclose it on beat 1 of every bar. When that's easy, target the 7ths. This single habit makes lines sound like bebop faster than learning any new scale.`
        },
        {
          type: 'tryIt',
          question: mc('In an **enclosure**, the target note is…', 'approached from both above and below before it\'s played', [
            'played three times in a row',
            'left out so the listener imagines it',
            'always the root of the chord'
          ], { explain: 'An enclosure "surrounds" the target: e.g. F (above) → D♯ (below) → **E**.' })
        },
        {
          type: 'tryIt',
          question: mc('Which is the **iii – VI7 – ii – V** turnaround in C?', 'Em7 – A7 – Dm7 – G7', ['Em7 – Am7 – Dm7 – G7', 'Cmaj7 – A7 – Dm7 – G7', 'Em7 – A7 – D7 – G7'], {
            explain: 'iii = Em7, VI7 = **A7** (secondary dominant of ii), ii = Dm7, V = G7.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('What is the ii–V–I in **C major**?', 'Dm7 – G7 – Cmaj7', ['Dm7 – Gmaj7 – C7', 'Em7 – A7 – Dmaj7', 'Am7 – D7 – Gmaj7']),
      mc('Which chord tones are the **guide tones**?', 'The 3rd and the 7th', ['The root and the 5th', 'The 5th and the 9th', 'The root and the 3rd'], {
        explain: 'The **3rd** (major/minor) and **7th** (maj7/7/m7) define the chord\'s quality.'
      }),
      { kind: 'spell', prompt: 'Spell the guide tones of **Dm7**: the 3rd, then the 7th.', answer: ['F', 'C'], explain: 'Dm7 = D F A C. Guide tones: **F** and **C**.' },
      mc('Which scale is the standard choice over a **m7♭5** chord?', 'Locrian', ['Dorian', 'Phrygian', 'Mixolydian'], { explain: '**Locrian** has the ♭3, ♭5 and ♭7 of the half-diminished chord.' }),
      mc('Which scale fits a **maj7♯11** chord?', 'Lydian', ['Ionian', 'Mixolydian', 'Locrian'], { explain: 'The ♯11 is Lydian\'s characteristic ♯4.' }),
      mc('Which scale contains ♭9, ♯9, ♯11 and ♭13 over a dominant chord?', 'Altered (super-Locrian)', ['Mixolydian', 'Lydian dominant', 'Dorian'], {
        explain: 'The **altered** scale keeps 1, 3 and ♭7 and alters every other tension.'
      }),
      mc('What is the **tritone substitute** for G7?', 'D♭7', ['C♯m7', 'D7', 'F7'], { explain: 'G + 6 half steps = **D♭**. D♭7 shares G7\'s tritone (F and B/C♭).' }),
      mc('Why does the tritone substitution work?', 'Both dominants share the same 3rd and 7th (the tritone), just swapped', [
        'Both chords have the same root',
        'Both chords come from the same major scale',
        'The tritone sub is always a minor chord'
      ]),
      mc('What is the **minor ii–V–i** in A minor?', 'Bm7♭5 – E7♭9 – Am7', ['Bm7 – E7 – Amaj7', 'Dm7 – G7 – Cmaj7', 'Bm7♭5 – Em7 – Am7']),
      mc('Listen. Major ii–V–I or minor ii–V–i?', 'Minor ii–V–i', ['Major ii–V–I'], {
        play: prog([Bm7b5, E7b9, Am7], 4, 80, progressionExample('A', ['ii7b5', 'V7b9', 'i7'], 'harmonicMinor', 80, 4)),
        explain: 'The half-diminished ii and the ♭9 on the V give it away: Bm7♭5 – E7♭9 – Am7.'
      }),
      mc('Listen. Is the V chord normal, or a tritone substitute?', 'Tritone sub', ['Normal V7'], {
        play: prog([Dm7s, Db7s, Cmaj7s], 4, 80, progressionExample('C', ['ii7', 'bII7', 'Imaj7'], 'major', 80, 4)),
        explain: 'Dm7 – **D♭7** – Cmaj7: a chromatic bass line D → D♭ → C.'
      }),
      mc('A **drop-2** voicing is made by…', 'lowering the second-highest note of a close voicing by an octave', ['removing the 2nd', 'doubling the root two octaves down', 'playing a chord on two strings only']),
      { kind: 'text', prompt: 'In the turnaround **I – vi – ii – V** in C major, what is the **vi** chord (as a seventh chord)?', accept: ['Am7', 'A-7', 'Amin7', 'Am 7', 'A min7', 'A minor 7'], explain: 'vi7 in C is **Am7** (A C E G).' },
      mc('**Rhythm changes** are based on which tune?', 'I Got Rhythm', ['Autumn Leaves', 'So What', 'Giant Steps'], {
        explain: 'Gershwin\'s *I Got Rhythm*: AABA, usually in B♭, with a bridge of secondary dominants D7 – G7 – C7 – F7.'
      }),
      {
        kind: 'fretboard',
        prompt: 'The G7 shell `3x34xx` is shown. Click its **3rd (B)**.',
        marks: [
          { ...p(6, 3), label: 'R', color: 'root' },
          { ...p(4, 3), label: '?', color: 'tone' },
          { ...p(3, 4), label: '?', color: 'tone' }
        ],
        frets: [0, 6],
        targets: [{ string: 3, fret: 4 }],
        explain: 'Root-6th-string shells are R – 7 – 3: the 4th-string note is F (♭7), the **G-string note (fret 4) is B**, the 3rd.'
      },
      mc('Over **E7♭9** resolving to **Am**, which scale is a natural choice?', 'E Phrygian dominant (5th mode of A harmonic minor)', ['E Mixolydian', 'E Lydian', 'E Dorian'], {
        explain: 'A harmonic minor from E: E F G♯ A B C D, which contains the ♭9 (F) and fits the minor key.'
      }),
      mc('In bebop lines, chord tones (especially 3rds and 7ths) are usually placed…', 'on strong beats', ['only on upbeats', 'never: lines avoid chord tones', 'only at the end of the tune'])
    ],
    generators: [iiVIQ, tritoneSubQ, guideToneQ, chordScaleQ, minorIIVQ, hearSubQ].map((g) => () => pq(g()))
  }
}

export default unit
