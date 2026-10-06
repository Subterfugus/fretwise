import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import type { SeqEvent } from '@/audio/engine'
import { progressionExample, type ToolExample } from '../toolExamples'
import { m, mc, rand, playScale, scaleMarks, strum } from '../helpers'
import { forLesson, taught } from '../curriculum'
import { ChordShape, FretPos, OPEN_CHORDS, midiAt, pcAt, pentatonicBoxes, posKey, shapeMidis, shapePositions } from '@/theory/guitar'
import { ScaleType, scaleNames } from '@/theory/scales'
import { transpose } from '@/theory/intervals'
import { noteName, pitchClass, pretty } from '@/theory/notes'

// ---------- local helpers ----------

const P = (string: number, fret: number): FretPos => ({ string, fret })

/**
 * Tab from compact text: "3:5 3:7 1:5+2:8/2" = string:fret, "+" joins notes
 * played together, "/n" sets that event's length in beats (default `beats`).
 */
function tab(spec: string, beats = 0.5): { pos: FretPos[]; beats: number }[] {
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

/** Give marks pretty ♯/♭ labels. */
const prettyMarks = (ms: FretMark[]): FretMark[] => ms.map((x) => ({ ...x, label: x.label ? pretty(x.label) : x.label }))

/** Recolour marks whose pitch class is in `pcs`. */
const recolour = (ms: FretMark[], pcs: number[], color: FretMark['color']): FretMark[] =>
  ms.map((x) => (pcs.includes(pcAt(x)) ? { ...x, color } : x))

/** A blues box 1 (5th position), blue notes highlighted. */
const A_BLUES_BOX1 = (label: 'note' | 'degree') =>
  prettyMarks(recolour(scaleMarks('A', 'blues', { frets: [5, 8], label }), [pitchClass('Eb')], 'blue'))

/** Box 1 of A minor pentatonic with finger numbers. */
const BOX1_FINGERS: FretMark[] = [
  m(6, 5, '1', 'root'), m(6, 8, '4'),
  m(5, 5, '1'), m(5, 7, '3'),
  m(4, 5, '1'), m(4, 7, '3', 'root'),
  m(3, 5, '1'), m(3, 7, '3'),
  m(2, 5, '1'), m(2, 8, '4'),
  m(1, 5, '1', 'root'), m(1, 8, '4')
]

/** Melody over a chord: strum, play the line, strum again. */
const overChord = (shape: ChordShape, melody: number[], bpm = 90, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: [{ notes: shapeMidis(shape), beats: 2 }, ...melody.map((n) => ({ notes: [n], beats: 0.5 })), { notes: shapeMidis(shape), beats: 3 }]
})

/** Start pitch then target pitch: how a bend should sound. */
const bend = (from: FretPos, semis: number, back = false): PlaySpec => {
  const a = midiAt(from)
  const ev: SeqEvent[] = [
    { notes: [a], beats: 0.5 },
    { notes: [a + semis], beats: back ? 1 : 2 }
  ]
  if (back) ev.push({ notes: [a], beats: 1.5 })
  return { kind: 'sequence', bpm: 80, events: ev }
}

const SWING: [number, number] = [2 / 3, 1 / 3]

/** One bar of the classic boogie shuffle riff on an open low string (root + 5th, root + 6th). */
function boogieBar(lowString: number): SeqEvent[] {
  const r = midiAt(P(lowString, 0))
  const five = midiAt(P(lowString - 1, 2))
  const six = midiAt(P(lowString - 1, 4))
  return [five, five, six, six].flatMap((n) => [
    { notes: [r, n], beats: SWING[0], mode: 'block' as const },
    { notes: [r, n], beats: SWING[1], mode: 'block' as const }
  ])
}

/** One bar of shuffle strumming: full chord on the long down-beat, top strings on the short up-beat. */
function strumBar(shape: ChordShape): SeqEvent[] {
  const all = shapeMidis(shape)
  const top = all.slice(-3)
  return [0, 1, 2, 3].flatMap(() => [
    { notes: all, beats: SWING[0] },
    { notes: top, beats: SWING[1] }
  ])
}

/** 12-bar form with the quick change. */
const FORM_QC = ['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'] as const
const FORM_SLOW = ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'] as const

function twelveBar(form: readonly string[], kind: 'riff' | 'strum', bpm: number): PlaySpec {
  const riff: Record<string, number> = { I: 5, IV: 4, V: 6 } // A, D, E open strings
  const chord: Record<string, ChordShape> = { I: OPEN_CHORDS.A7, IV: OPEN_CHORDS.D7, V: OPEN_CHORDS.E7 }
  const events = form.flatMap((d, i) => {
    // Last bar: end on a single E7 hit instead of looping back
    if (i === 11 && kind === 'riff') return [...boogieBar(6).slice(0, 4), { notes: shapeMidis(OPEN_CHORDS.E7), beats: 2 }]
    return kind === 'riff' ? boogieBar(riff[d]) : strumBar(chord[d])
  })
  events.push({ notes: shapeMidis(OPEN_CHORDS.A7), beats: 4 })
  return { kind: 'sequence', bpm, events, toolExample: progressionExample('A', [...form.map((d) => `${d}7`), 'I7'], 'mixolydian', bpm, 4) }
}

/** Box 1 of A minor pentatonic, coloured to show which notes are chord tones of a given chord. */
function targetMap(chordTones: string[], root: string, missing: { pos: FretPos; label: string }[]): FretMark[] {
  const tones = chordTones.map(pitchClass)
  const box = scaleMarks('A', 'minorPentatonic', { box: 0 })
  return [
    ...box.map((x) => ({
      ...x,
      color: (pcAt(x) === pitchClass(root) ? 'root' : tones.includes(pcAt(x)) ? 'accent' : 'ghost') as FretMark['color']
    })),
    ...missing.map((x) => m(x.pos.string, x.pos.fret, pretty(x.label), 'blue'))
  ]
}

/** A major pentatonic (frets 2–5) in colour, with A minor box 1 greyed beside it. */
const A_MAJOR_VS_MINOR: FretMark[] = (() => {
  const major = scaleMarks('A', 'majorPentatonic', { box: 4, label: 'degree' })
  const taken = new Set(major.map(posKey))
  const minor = scaleMarks('A', 'minorPentatonic', { box: 0, label: 'degree' })
    .filter((x) => !taken.has(posKey(x)))
    .map((x) => ({ ...x, color: 'ghost' as const }))
  return [...major, ...minor]
})()

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')

const pr = (s: string) => pretty(s)
const spellScale = (root: string, type: ScaleType) => scaleNames(root, type)

// ---------- generated questions ----------

const BOX_KEYS = ['F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#', 'D']

const findBoxRoots = (): QuizQuestion => {
  const key = rand(BOX_KEYS)
  const box = pentatonicBoxes(key)[0]
  const targets = box.filter((p) => pcAt(p) === pitchClass(key))
  const lo = Math.min(...box.map((p) => p.fret))
  const hi = Math.max(...box.map((p) => p.fret))
  return {
    kind: 'fretboard',
    mode: 'all',
    frets: [Math.max(0, lo - 2), hi + 2],
    prompt: `Select **every ${pr(key)}** (root) inside **box 1** of **${pr(key)} minor pentatonic**, then press Check.`,
    marks: box.map((p) => ({ ...p, color: 'tone' as const })),
    targets,
    explain: `Box 1 starts on the root at the **${ordinal(lo)} fret** of the 6th string. Its three roots are the 6th string fret ${lo}, the 4th string fret ${lo + 2}, and the 1st string fret ${lo}: the same shape as A minor box 1, moved to fret ${lo}.`
  }
}

const SPELL_ROOTS = ['A', 'E', 'D', 'G', 'C', 'B', 'F']
const SCALE_LABEL: Record<string, string> = {
  minorPentatonic: 'minor pentatonic',
  majorPentatonic: 'major pentatonic',
  blues: 'blues scale'
}

type PentType = 'minorPentatonic' | 'majorPentatonic' | 'blues'
/** Minor pentatonic and blues come early (Power chords and the blues); the major pentatonic later. */
const EARLY_TYPES: PentType[] = ['minorPentatonic', 'blues']
const ALL_TYPES: PentType[] = ['minorPentatonic', 'majorPentatonic', 'blues']

const spellPent = (types: PentType[]) => (): QuizQuestion => {
  const type = rand(types)
  // F blues has a Cb (the theoretically spelled ♭5), which just confuses learners: skip it
  const root = rand(type === 'blues' ? SPELL_ROOTS.filter((r) => r !== 'F') : SPELL_ROOTS)
  const answer = spellScale(root, type)
  const formula = { minorPentatonic: '1 ♭3 4 5 ♭7', majorPentatonic: '1 2 3 5 6', blues: '1 ♭3 4 ♭5 5 ♭7' }[type]
  return {
    kind: 'spell',
    prompt: `Spell the **${pr(root)} ${SCALE_LABEL[type]}**, starting on ${pr(root)}.`,
    answer,
    explain: `Formula **${formula}** from ${pr(root)}: **${answer.map(pr).join(' ')}**.`
  }
}

const relativePent = (): QuizQuestion => {
  const minorToMajor = Math.random() < 0.5
  const pool = minorToMajor ? ['A', 'E', 'B', 'D', 'G', 'C', 'F#', 'F'] : ['C', 'G', 'D', 'F', 'Bb', 'A', 'E', 'Eb']
  const given = rand(pool)
  const ans = minorToMajor ? noteName(transpose(given, 'm3')) : noteName(transpose(given, 'm3', true))
  const wrong = [
    noteName(transpose(given, 'm3', minorToMajor)), // the classic mistake: going the wrong way
    noteName(transpose(given, 'P5')),
    noteName(transpose(given, 'P4')),
    noteName(transpose(given, 'M2'))
  ].filter((w) => pitchClass(w) !== pitchClass(ans))
  const prompt = minorToMajor
    ? `**${pr(given)} minor pentatonic** has exactly the same notes as which **major** pentatonic?`
    : `**${pr(given)} major pentatonic** has exactly the same notes as which **minor** pentatonic?`
  return mc(prompt, pr(ans), wrong.slice(0, 3).map(pr), {
    explain: minorToMajor
      ? `The relative major is a **minor 3rd above** the minor root (3 frets up): ${pr(given)} → **${pr(ans)}**. Both scales: ${spellScale(given, 'minorPentatonic').map(pr).join(' ')}.`
      : `The relative minor is a **minor 3rd below** the major root (3 frets down): ${pr(given)} → **${pr(ans)}**. Both scales: ${spellScale(given, 'majorPentatonic').map(pr).join(' ')}.`
  })
}

const BLUES_KEYS = ['A', 'E', 'G', 'C', 'D', 'B', 'F', 'Bb']

const twelveBarChord = (): QuizQuestion => {
  const key = rand(BLUES_KEYS)
  const I = noteName(key) + '7'
  const IV = noteName(transpose(key, 'P4')) + '7'
  const V = noteName(transpose(key, 'P5')) + '7'
  const II = noteName(transpose(key, 'M2')) + '7'
  const by: Record<string, string> = { I, IV, V }
  const bar = rand([1, 2, 5, 7, 9, 10, 11, 12])
  const qc = bar === 2
  const deg = FORM_QC[bar - 1]
  const correct = by[deg]
  const why: Record<number, string> = {
    1: 'Every 12-bar blues starts on the **I** chord.',
    2: 'The **quick change** jumps to the **IV** chord in bar 2, then back to I in bar 3.',
    5: 'Bars 5–6 are the **IV** chord: the second line of the blues moves to IV.',
    7: 'Bars 7–8 return home to the **I** chord.',
    9: 'Bar 9 is the first arrival of the **V** chord, the strongest tension in the form.',
    10: 'Bar 10 steps back down to the **IV** chord (V → IV, the classic blues "backwards" move).',
    11: 'Bar 11 is home again on **I**, where the turnaround starts.',
    12: 'Bar 12 is the **turnaround**: the **V** chord pulls you back to bar 1.'
  }
  return mc(
    `In a 12-bar blues in **${pr(key)}**${qc ? ' with a **quick change**' : bar === 12 ? ' with a **V turnaround**' : ''}, which chord is played in **bar ${bar}**?`,
    pr(correct),
    [I, IV, V, II].filter((c) => c !== correct).map(pr),
    { explain: `In ${pr(key)}: I7 = ${pr(I)}, IV7 = ${pr(IV)}, V7 = ${pr(V)}. ${why[bar]}` }
  )
}

const hearScale = (types: PentType[]) => (): QuizQuestion => {
  const type = rand(types)
  const root = rand(['A', 'C', 'D', 'E', 'G'])
  const labels: Record<string, string> = {
    minorPentatonic: 'Minor pentatonic',
    majorPentatonic: 'Major pentatonic',
    blues: 'Blues scale (minor pentatonic + ♭5)'
  }
  const hint: Record<string, string> = {
    minorPentatonic: 'The leap from the root up a minor 3rd gives it a dark, bluesy start, and there are only five notes.',
    majorPentatonic: 'It climbs in whole steps from the root (1 2 3) for a bright, open, country sound.',
    blues: 'Listen for the chromatic squeeze in the middle (three notes one fret apart): 4 → ♭5 → 5. That extra note is the blue note.'
  }
  return mc(`Listen. Which scale is this? (It starts on ${pr(root)}, up and back.)`, labels[type], types.filter((t) => t !== type).map((t) => labels[t]), {
    play: playScale(root, type, 3, true),
    explain: hint[type]
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u8',
  number: 8,
  title: 'Pentatonic and blues',
  summary: 'The minor pentatonic boxes, the relative major pentatonic, the blues scale, the 12-bar blues, and soloing that targets the chords.',
  lessons: [
    {
      id: 'u8l1',
      title: 'The minor pentatonic: box 1',
      summary: 'Five notes, one shape, and the most-played pattern in rock and blues.',
      blocks: [
        {
          type: 'text',
          md: `*Penta* means five. A **pentatonic scale** has five notes instead of seven. If you've ever noodled a solo, you've almost certainly played the **minor pentatonic**: it's the backbone of blues, rock, funk and a huge amount of pop.

Written as numbers, its formula is:

**1 – ♭3 – 4 – 5 – ♭7**

In A, that's **A – C – D – E – G**.`
        },
        {
          type: 'text',
          md: `Don't worry about the numbers yet. Learn the **shape** and the **sound** first. The **root** is just the home note the scale is named after, and "minor" means a darker, moodier sound than major.

The numbers are each note's **place in the scale**: 1 is the root, 4 is the fourth note up, and so on. "♭3" means the 3rd note **lowered by a half step** (one fret). The full story is in [[preview:u4l1]] and [[preview:u4l2]].

This scale is a trimmed-down version of the seven-note natural minor scale, which you'll meet in [[preview:u4l6]]. It keeps five of the seven notes, and those five are the ones that sound great on guitar.`
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Why does it sound so "safe"?** The two notes it leaves out of the full seven-note minor scale (B and F, when the home note is A) are the ones that sit **one fret (a half step)** from a neighbour. With no half steps left, no note in the scale grinds against another. That's why you can play it over almost anything in the song and nothing sounds wrong.`
        },
        {
          type: 'text',
          md: `### Box 1
On the guitar, the minor pentatonic falls into a compact pattern with **two notes on every string**. The most famous is **box 1**, which starts on the root on the 6th string. For A minor pentatonic, that root is the **5th fret**.

Your first finger covers the 5th fret on every string. The other note on each string is under your **ring finger** (7th fret) or **pinky** (8th fret).`
        },
        {
          type: 'fretboard',
          marks: BOX1_FINGERS,
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0, frets: [5, 8] }],
          frets: [3, 10],
          caption: 'A minor pentatonic box 1 with suggested fingers. Red dots are the root, A.'
        },
        {
          type: 'fretboard',
          marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'degree' }),
          frets: [3, 10],
          caption: 'The same box labelled with scale degrees. The numbers show each note\'s place in the scale. Notice where the ♭3 and ♭7 sit next to the roots.',
          playAll: true
        },
        {
          type: 'tab',
          caption: 'Box 1 up and back down, in eighth notes. Play it slowly with alternate picking.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0, frets: [5, 8] }],
          bpm: 90,
          events: tab('6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 2:5 2:8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 4:7 4:5 5:7 5:5 6:8 6:5/2')
        },
        { type: 'audio', label: 'A minor pentatonic, one octave up and back', play: playScale('A', 'minorPentatonic', 3, true) },
        {
          type: 'text',
          md: `### It's movable
Box 1 has no open strings, so you can slide it anywhere. **Wherever your first finger sits on the 6th string, that note names the scale.** Start on the 3rd fret and you're in G minor pentatonic; start on the 8th fret and you're in C minor pentatonic.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Learn box 1 by its **roots**: 6th string (1st finger), 4th string (3rd finger), 1st string (1st finger). Whenever you're improvising, know which dot is home. Ending a phrase on a root always sounds finished.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [3, 10],
            prompt: 'Box 1 of A minor pentatonic is shown. Select **all three A roots**, then press Check.',
            marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'none' }).map((x) => ({ ...x, color: 'tone' as const })),
            targets: [P(6, 5), P(4, 7), P(1, 5)],
            explain: 'The roots are the 5th fret of the 6th string, the 7th fret of the 4th string, and the 5th fret of the 1st string.'
          }
        },
        {
          type: 'tryIt',
          question: mc('You play box 1 with your first finger on the **3rd fret** of the 6th string. Which scale is that?', 'G minor pentatonic', ['A minor pentatonic', 'C minor pentatonic', 'F minor pentatonic'], {
            explain: 'The 3rd fret of the low E string is **G**, and box 1 starts on the root, so this is **G minor pentatonic** (G B♭ C D F).'
          })
        }
      ]
    },
    {
      id: 'u8l2',
      title: 'All five boxes and how they connect',
      summary: 'Five interlocking shapes that cover the whole neck.',
      blocks: [
        {
          type: 'text',
          md: `The five notes of A minor pentatonic repeat all over the neck. Guitarists split that map into **five boxes**, each with two notes per string. Each box starts on a different scale note on the 6th string:

1. **Box 1** starts on the root, **A** (5th fret)
2. **Box 2** starts on the ♭3, **C** (8th fret)
3. **Box 3** starts on the 4, **D** (10th fret)
4. **Box 4** starts on the 5, **E** (12th fret, or open)
5. **Box 5** starts on the ♭7, **G** (15th fret, or 3rd)

After box 5 you're back to box 1, an octave higher. The boxes form a loop. You already know box 1 from [[u8l1]]; this lesson adds the other four.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('A', 'minorPentatonic', { frets: [0, 15] }),
          frets: [0, 15],
          caption: 'Every note of A minor pentatonic from the nut to the 15th fret. The five boxes are slices of this one map.'
        },
        {
          type: 'text',
          md: `### The boxes one by one
Below, each box is labelled with scale degrees so you can see where the roots fall. In A, boxes 4 and 5 sit near the nut (they repeat again at the 12th and 15th frets), so in order up the neck you meet **4, 5, 1, 2, 3**.`
        },
        { type: 'fretboard', marks: scaleMarks('A', 'minorPentatonic', { box: 3, label: 'degree' }), frets: [0, 5], caption: 'Box 4 (open position): it starts on E, the 5th, and uses open strings.', playAll: true },
        { type: 'fretboard', marks: scaleMarks('A', 'minorPentatonic', { box: 4, label: 'degree' }), frets: [1, 7], caption: 'Box 5 (frets 2–5): the root is under your pinky on the 6th and 1st strings.', playAll: true },
        { type: 'fretboard', marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'degree' }), frets: [3, 10], caption: 'Box 1 (frets 5–8): your home base.', playAll: true },
        { type: 'fretboard', marks: scaleMarks('A', 'minorPentatonic', { box: 1, label: 'degree' }), frets: [6, 12], caption: 'Box 2 (frets 7–10): on the G and B strings the pair of notes sits a fret off from the others (7 and 9, then 8 and 10).', playAll: true },
        { type: 'fretboard', marks: scaleMarks('A', 'minorPentatonic', { box: 2, label: 'degree' }), frets: [8, 15], caption: 'Box 3 (frets 9–13): the B string pushes the top notes up a fret.', playAll: true },
        {
          type: 'playIt',
          prompt: 'Play **box 1** of A minor pentatonic, low to high, one note at a time (12 notes).',
          targets: ['A2', 'C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
          hint: 'Frets 5 and 8 on the 6th string, then 5 and 7 on strings 5, 4 and 3, then 5 and 8 on strings 2 and 1.',
          show: [
            { string: 6, fret: 5 }, { string: 6, fret: 8 }, { string: 5, fret: 5 }, { string: 5, fret: 7 },
            { string: 4, fret: 5 }, { string: 4, fret: 7 }, { string: 3, fret: 5 }, { string: 3, fret: 7 },
            { string: 2, fret: 5 }, { string: 2, fret: 8 }, { string: 1, fret: 5 }, { string: 1, fret: 8 }
          ],
          frets: [3, 10]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**The overlap rule:** the right-hand notes of one box are the left-hand notes of the next. Box 1's top notes (8 on the 6th string, 7 on the 5th, 7 on the 4th…) are exactly box 2's bottom notes. You never learn a whole new box, just one new note per string.`
        },
        {
          type: 'text',
          md: `### Connecting boxes
Boxes are a learning tool, not a cage. The best players **slide** between them. A slide along one string carries you into the next box without a jump:`
        },
        {
          type: 'tab',
          caption: 'From box 1 into box 2: slide from D (7th fret) up to E (9th fret) on the 3rd string, then finish in box 2 on the root A.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', frets: [5, 10] }],
          bpm: 90,
          events: tab('3:5 3:7 3:9 2:8 2:10 1:8 1:10 1:8 2:10/2')
        },
        {
          type: 'tab',
          caption: 'Back down: start in box 2 on the high strings and slide down the 2nd string (8 → 5) into box 1.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', frets: [5, 10] }],
          bpm: 90,
          events: tab('1:10 1:8 2:10 2:8 2:5 3:7 3:5 4:7/2')
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Learn the boxes **in pairs**: 1+2, then 5+1, then 2+3, and so on. Play up one box and down the next. Within a couple of weeks the neck stops being five shapes and becomes one connected map.`
        },
        {
          type: 'tryIt',
          question: mc('In A minor pentatonic, box 2 starts on which note on the 6th string?', 'C (8th fret)', ['A (5th fret)', 'D (10th fret)', 'G (3rd fret)'], {
            explain: 'Box 2 starts on the next scale note after the root: the ♭3, **C**, at the 8th fret. It is also box 1\'s top note on that string.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [5, 12],
            prompt: 'In **box 2** of A minor pentatonic (frets 7–10), select **every A**, then press Check.',
            marks: scaleMarks('A', 'minorPentatonic', { box: 1, label: 'none' }).map((x) => ({ ...x, color: 'tone' as const })),
            targets: [P(4, 7), P(2, 10)],
            explain: 'Box 2 has two roots: the **7th fret of the 4th string** and the **10th fret of the 2nd string**.'
          }
        }
      ]
    },
    {
      id: 'u8l3',
      title: 'The major pentatonic and the relative relationship',
      summary: 'Same notes, different home: A minor pentatonic = C major pentatonic.',
      blocks: [
        {
          type: 'text',
          md: `The **major pentatonic** is the bright cousin. Its formula is the major scale without the 4th and 7th:

**1 – 2 – 3 – 5 – 6**

C major pentatonic is **C – D – E – G – A**. Look closely: those are exactly the notes of **A minor pentatonic** (A C D E G), starting from a different place.`
        },
        {
          type: 'table',
          headers: ['Scale', 'Notes', 'Root'],
          rows: [
            ['A minor pentatonic', 'A C D E G', 'A'],
            ['C major pentatonic', 'C D E G A', 'C']
          ],
          caption: 'Relative scales share all their notes. What changes is which note feels like home.'
        },
        {
          type: 'text',
          md: `This is the same **relative major / minor** relationship you met in [[u4l6]]: the relative major is a **minor 3rd (3 frets) above** the minor root. So box 1 of A minor pentatonic *is* a C major pentatonic shape. Only your **target notes** change.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('C', 'majorPentatonic', { box: 4, label: 'degree' }),
          frets: [3, 10],
          caption: 'Box 1 again, now labelled from C. The red dots are C. Same dots, different home.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Line over Am (ends on A)', play: overChord(OPEN_CHORDS.Am, [60, 62, 64, 67, 69], 90, { kind: 'scale', root: 'A', type: 'minorPentatonic' }) },
            { label: 'Same notes over C (ends on C)', play: overChord(OPEN_CHORDS.C, [69, 67, 64, 62, 60], 90, { kind: 'scale', root: 'C', type: 'majorPentatonic' }) }
          ]
        },
        {
          type: 'text',
          md: `### Major pentatonic from its own root
The handy guitarist's rule: **to play a major pentatonic, play the minor box 1 shape three frets lower.**

For **G major pentatonic**, G is at the 3rd fret of the 6th string. Three frets lower is the open E, so play the box 1 shape in open position (E minor pentatonic). Now the **G notes** are home.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'majorPentatonic', { box: 4, label: 'degree' }),
          frets: [0, 5],
          caption: 'G major pentatonic in open position: the E minor box 1 shape, heard from G.',
          playAll: true
        },
        {
          type: 'tab',
          caption: 'A country-flavoured G major pentatonic run using open strings.',
          toolExamples: [{ kind: 'scale', root: 'G', type: 'majorPentatonic', frets: [0, 5] }],
          bpm: 100,
          events: tab('6:3 5:0 5:2 4:0 4:2 3:0 3:2 2:0 2:3 1:0 1:3/2 1:0 2:3 2:0 3:2 3:0/2')
        },
        {
          type: 'text',
          md: `### Major vs minor over the same root
Over an A chord you can choose **A minor pentatonic** (box 1 at the 5th fret) for a gritty blues-rock sound, or **A major pentatonic** (box 1 shape at the 2nd fret, which is F♯ minor pentatonic) for a sweeter country or Allman Brothers sound. Many blues players mix both.`
        },
        {
          type: 'fretboard',
          marks: A_MAJOR_VS_MINOR,
          frets: [0, 10],
          caption: 'A major pentatonic (frets 2–5, coloured) next to A minor pentatonic box 1 (frets 5–8, grey). They overlap at the 5th fret, including the A roots.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A minor pentatonic', play: playScale('A', 'minorPentatonic', 3) },
            { label: 'A major pentatonic', play: playScale('A', 'majorPentatonic', 3) }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'Which **major** pentatonic has the same notes as **E minor pentatonic**?',
            accept: ['G', 'G major', 'G major pentatonic'],
            explain: 'Go up a minor 3rd (3 frets) from E: **G**. E minor pentatonic (E G A B D) = G major pentatonic (G A B D E).'
          }
        },
        {
          type: 'tryIt',
          question: mc('You want **D major pentatonic** using the minor box 1 shape. Where does your first finger go on the 6th string?', '7th fret (it is B minor pentatonic box 1)', ['10th fret', '5th fret', '12th fret'], {
            explain: 'D is at the 10th fret of the 6th string. Three frets lower is the **7th fret (B)**. B minor pentatonic has the same notes as D major pentatonic.'
          })
        },
        {
          type: 'text',
          md: `### Other blue notes
"Blue notes" really means pitches that sit *between* major and minor. Besides the ♭5 you met in [[u8l4]], blues players treat the **♭3** and the **♭7** as blue notes. Over a major or dominant chord, the ♭3 rubs against the chord's major 3rd. Players often **bend the ♭3 up slightly** (push the string sideways a "curl" or quarter-tone), so it lands somewhere between minor and major.

The **major blues scale** goes the other way: the major pentatonic plus the ♭3 (**1 – 2 – ♭3 – 3 – 5 – 6**). The ♭3 → 3 hammer-on (sound the lower note, then hammer a finger down on the higher fret without picking again) is one of the sweetest sounds in the blues.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A major blues scale', play: playScale('A', 'majorBlues', 3) },
            { label: '♭3 → 3 hammer-on (C → C♯) over A', play: { kind: 'sequence', bpm: 90, toolExample: { kind: 'scale', root: 'A', type: 'majorBlues' }, events: [{ notes: shapeMidis(OPEN_CHORDS.A), beats: 1.5 }, { notes: [60], beats: 0.5 }, { notes: [61], beats: 1 }, { notes: [57], beats: 2 }] } }
          ]
        }
      ]
    },
    {
      id: 'u8l4',
      title: 'The blues scale and the blue note',
      summary: 'Add one chromatic note, the ♭5, and the minor pentatonic starts to cry.',
      blocks: [
        {
          type: 'text',
          md: `The **blues scale** is the minor pentatonic plus one extra note, the **♭5**:

**1 – ♭3 – 4 – ♭5 – 5 – ♭7**

In A: **A – C – D – E♭ – E – G**. The E♭ is the famous **blue note**. It fills the gap between the 4 and 5 with a **chromatic squeeze**: three notes in a row, one fret apart (D → E♭ → E).`
        },
        {
          type: 'fretboard',
          marks: A_BLUES_BOX1('note'),
          frets: [3, 10],
          caption: 'A blues scale in box 1. The blue dots are E♭, the ♭5.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: A_BLUES_BOX1('degree'),
          frets: [3, 10],
          caption: 'The same shape in degrees. The ♭5 sits one fret above the 4 on the 5th and 3rd strings.'
        },
        {
          type: 'staff',
          caption: 'A blues scale, ascending (written an octave higher than it sounds, as guitar music always is).',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'blues' }],
          notes: ['A/4', 'C/5', 'D/5', 'Eb/5', 'E/5', 'G/5', 'A/5'].map((k) => ({ keys: [k], duration: 'q' }))
        },
        { type: 'audio', label: 'A blues scale up and back', play: playScale('A', 'blues', 3, true) },
        {
          type: 'tip',
          tone: 'warning',
          md: `**The blue note is a passing note, not a resting place.** Sitting on the ♭5 sounds tense and unfinished. Slide or hammer through it on the way to the 5th or the 4th, and it sounds instantly bluesy.`
        },
        {
          type: 'tab',
          caption: 'A classic blue-note lick: C D E♭ D C, then land on the root.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'blues', frets: [5, 8] }],
          bpm: 90,
          events: tab('3:5 3:7 3:8 3:7 3:5 4:7/3')
        },
        {
          type: 'tab',
          caption: 'Climbing through the blue note: A C, then D E♭ E on the 5th string, then G and A on the 4th string.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'blues', frets: [5, 8] }],
          bpm: 90,
          events: tab('6:5 6:8 5:5 5:6 5:7 4:5 4:7/3')
        },
        {
          type: 'text',
          md: `### The blues scale in open E
In E, the blues scale uses lots of open strings, which is why so many classic riffs are in E. The blue note, B♭, is on the 1st fret of the 5th string and the 3rd fret of the 3rd string.`
        },
        {
          type: 'fretboard',
          marks: prettyMarks(recolour(scaleMarks('E', 'blues', { frets: [0, 3] }), [pitchClass('Bb')], 'blue')),
          frets: [0, 5],
          caption: 'E blues scale in open position. Blue dots = B♭, the ♭5.',
          playAll: true
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **E blues scale**, starting on E.',
            answer: spellScale('E', 'blues'),
            explain: 'E minor pentatonic (E G A B D) plus the ♭5. The ♭5 of E is **B♭** (not A♯), because it is the ♭5, one fret below B (a ♭, not a ♯): **E G A B♭ B D**.'
          }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In box 1 of A blues, click the **blue note on the 3rd string**.',
            frets: [3, 10],
            marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'none' }).map((x) => ({ ...x, color: 'ghost' as const })),
            targets: [P(3, 8)],
            explain: 'E♭ is one fret above D on the 3rd string: the **8th fret**.'
          }
        }
      ]
    },
    {
      id: 'u8l5',
      title: 'The 12-bar blues',
      summary: 'Three dominant 7th chords, twelve bars, and the shuffle feel.',
      blocks: [
        {
          type: 'text',
          md: `The **12-bar blues** is the most important chord progression in popular music. It uses just three chords, called **I, IV and V** (say "one, four, five"). They are the chords built on the **1st, 4th and 5th notes** of the key's scale. In A, those notes are **A, D and E**, so the three chords are built on A, D and E. (Roman numerals like these get the full treatment in [[preview:u7l2]].)

In the blues all three are usually **dominant 7th chords**: a major chord plus one extra note that adds bluesy tension. You already know them: the A7, D7 and E7 from [[u2l7]]. (The full story of dominant 7ths is in [[preview:u9l1]].)

In A, that gives **A7 (I7), D7 (IV7) and E7 (V7)**.`
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.A7, OPEN_CHORDS.D7, OPEN_CHORDS.E7],
          caption: 'The open-position I7, IV7 and V7 in A. Click to strum.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Why dominant 7ths everywhere?** Normally a 7th chord this bluesy would only show up on the V chord. The blues breaks that habit: every chord gets the extra note (the ♭7). That extra note is the source of the blues' gritty, unresolved sound. You'll see how this bends the usual rules in [[preview:u9l2]].`
        },
        {
          type: 'text',
          md: `### The form
Twelve bars, in three lines of four. Here's the version with the **quick change** (a jump to IV in bar 2), which is very common:`
        },
        {
          type: 'table',
          headers: ['', 'Bar 1', 'Bar 2', 'Bar 3', 'Bar 4'],
          rows: [
            ['Line 1', 'A7 (I)', 'D7 (IV)', 'A7 (I)', 'A7 (I)'],
            ['Line 2', 'D7 (IV)', 'D7 (IV)', 'A7 (I)', 'A7 (I)'],
            ['Line 3', 'E7 (V)', 'D7 (IV)', 'A7 (I)', 'E7 (V)']
          ],
          caption: '12-bar blues in A with a quick change. Without the quick change, bar 2 stays on A7.',
          toolExamples: [progressionExample('A', FORM_QC.map((d) => `${d}7`), 'mixolydian')]
        },
        {
          type: 'text',
          md: `- **Line 1** sets up the key on the I chord.
- **Line 2** moves to the IV chord and comes back home.
- **Line 3** brings the tension: **V** in bar 9, **IV** in bar 10, home to **I** in bar 11.
- **Bar 12** is the **turnaround**: the V chord that sends you back to bar 1 for the next chorus.`
        },
        {
          type: 'text',
          md: `### The shuffle feel
Most blues is played with a **shuffle** (or swing) feel. Each beat is split into a **long** note and a **short** note, roughly 2/3 + 1/3 of the beat, like the first and last notes of a triplet. Say "**doo**-ba **doo**-ba" with the "doo" longer.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Straight eighths', play: { kind: 'rhythm', pattern: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], bpm: 100, pitch: 45 } },
            { label: 'Shuffle (swung eighths)', play: { kind: 'rhythm', pattern: [2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3], bpm: 100, pitch: 45 } }
          ]
        },
        {
          type: 'text',
          md: `### The boogie shuffle riff
The classic rhythm part alternates a **root + 5th** with a **root + 6th** on the two lowest strings that fit each chord. (In fret terms: the open string plus the note at fret 2 of the next string, then the same open string plus fret 4.) On A, play the open A string with the 2nd and 4th frets of the D string. Move the same shape to the D string for D7, and to the low E string for E7.`
        },
        {
          type: 'tab',
          caption: 'One bar of the A shuffle riff (A5 – A6), written as straight eighths. Swing them: long-short, long-short.',
          bpm: 100,
          notation: false,
          events: [P(4, 2), P(4, 2), P(4, 4), P(4, 4)].flatMap((p) => [
            { pos: [P(5, 0), p], beats: 0.5 },
            { pos: [P(5, 0), p], beats: 0.5 }
          ])
        },
        { type: 'audio', label: 'Full 12-bar shuffle riff in A (quick change)', play: twelveBar(FORM_QC, 'riff', 110) },
        { type: 'audio', label: 'Full 12-bar with strummed A7 / D7 / E7 (no quick change)', play: twelveBar(FORM_SLOW, 'strum', 100) },
        {
          type: 'text',
          md: `### The turnaround
Bars 11–12 often get a short melodic figure called a **turnaround**. A favourite: hold the high A (1st string, 5th fret) while a line walks down the 2nd string from G to E (G → F♯ → F → E, which in A is ♭7 → 6 → ♭6 → 5), then hit E7.`
        },
        {
          type: 'tab',
          caption: 'Classic turnaround in A: a descending line under a high A pedal, resolving to E7.',
          bpm: 80,
          events: [...tab('1:5+2:8 1:5+2:7 1:5+2:6 1:5+2:5', 1), { pos: shapePositions(OPEN_CHORDS.E7), beats: 4 }]
        },
        {
          type: 'text',
          md: `### Solo over it
You already have a scale that fits over the whole 12-bar: the minor pentatonic from [[u8l1]]. A minor pentatonic (box 1 at the 5th fret) works over A7, D7 and E7 alike. Its ♭3s and ♭7s are the gritty notes the blues is built on. Play the full 12-bar audio above and noodle along.`
        },
        {
          type: 'tryIt',
          question: mc('In a 12-bar blues in **E**, what are the I7, IV7 and V7 chords?', 'E7, A7, B7', ['E7, B7, A7', 'E7, A7, D7', 'E7, F#7, B7'], {
            explain: 'I is the home chord, **E**. IV is built on the 4th note counting up from E (E F G **A**), and V on the 5th (E F G A **B**). In the blues they are all dominant 7ths: **E7, A7, B7**.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'In which **bar** of a standard 12-bar blues does the **V chord** first appear? (Type a number.)',
            accept: ['9', 'bar 9', 'nine'],
            explain: 'The V chord arrives in **bar 9**, the start of the third line (and it often returns in bar 12 as the turnaround).'
          }
        }
      ]
    },
    {
      id: 'u8l6',
      title: 'Target notes, bends and phrasing',
      summary: 'Make the scale follow the chords, and make it talk.',
      blocks: [
        {
          type: 'text',
          md: `You can play A minor pentatonic over the whole 12-bar blues from [[u8l5]] and it will "work". But the solos that sound great do more: they **follow the chord changes** by landing on **chord tones**, the notes of whichever chord is playing right now.

Box 1 contains different chord tones for each of the three chords:`
        },
        {
          type: 'table',
          headers: ['Chord', 'Chord tones', 'Already in A minor pentatonic', 'Missing (nearby)'],
          rows: [
            ['A7', 'A C# E G', 'A, E, G', 'C# (3rd)'],
            ['D7', 'D F# A C', 'D, A, C', 'F# (3rd)'],
            ['E7', 'E G# B D', 'E, D', 'G# (3rd), B (5th)']
          ]
        },
        {
          type: 'fretboard',
          marks: targetMap(['A', 'C#', 'E', 'G'], 'A', [{ pos: P(3, 6), label: 'C#' }, { pos: P(1, 9), label: 'C#' }]),
          frets: [3, 10],
          caption: 'Over A7: red = root, orange = other chord tones in the box, blue = the 3rd (C♯), just outside the box. Grey notes are fine but less stable.'
        },
        {
          type: 'fretboard',
          marks: targetMap(['D', 'F#', 'A', 'C'], 'D', [{ pos: P(2, 7), label: 'F#' }, { pos: P(4, 4), label: 'F#' }]),
          frets: [3, 10],
          caption: 'Over D7: the C in box 1 is now the ♭7, a great note to land on. F♯ (blue) is one fret below the G on the 2nd string.'
        },
        {
          type: 'fretboard',
          marks: targetMap(['E', 'G#', 'B', 'D'], 'E', [{ pos: P(1, 7), label: 'B' }, { pos: P(4, 6), label: 'G#' }]),
          frets: [3, 10],
          caption: 'Over E7: target E and D (the root and ♭7). B and G♯ sit just outside the box.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**The ♭3 over a dominant chord.** Over A7, the scale's C clashes with the chord's C♯. That clash *is* the blues, but control it: bend the C up a little, or slide C → C♯ and you've played the chord's 3rd.`
        },
        {
          type: 'text',
          md: `### Bending to chord tones
A **bend** pushes the string sideways to raise the pitch. In box 1, three bends do most of the work. The trick is to **bend up to a note that's in the scale**, ideally a chord tone, and to bend **in tune**:

- **3rd string, 7th fret (D) up a whole step to E**: the 5th of A7 and the root of E7.
- **2nd string, 8th fret (G) up a whole step to A**: the root of A7, the 5th of D7.
- **1st string or 3rd string C up a quarter step**: the blue "curl" between C and C♯ over A7.

The buttons below play the starting note and then the pitch your bend should reach, so you can check your intonation.`
        },
        {
          type: 'fretboard',
          marks: [
            m(3, 7, 'D', 'accent'), m(3, 9, 'E', 'ghost'),
            m(2, 8, 'G', 'accent'), m(2, 10, 'A', 'ghost')
          ],
          frets: [3, 12],
          caption: 'Fret the orange note and bend until it matches the grey target (two frets higher).'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'D → E (3rd string, 7th fret)', play: bend(P(3, 7), 2) },
            { label: 'G → A (2nd string, 8th fret)', play: bend(P(2, 8), 2) },
            { label: 'Bend and release: G → A → G', play: bend(P(2, 8), 2, true) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Bend with three fingers.** Put your ring finger on the bending fret and back it up with the middle and first fingers on the same string. Push from the wrist, not the fingertip. Play the target fret first, then bend until the pitches match.`
        },
        {
          type: 'text',
          md: `### Phrasing: making it talk
Great blues solos are built like speech:
- **Leave space.** A phrase, then a rest. Let the band answer.
- **Call and response.** Play a short idea, then "answer" it with a variation.
- **Repeat and vary.** Play the same lick over A7 and again over D7. The new chord changes how it sounds.
- **End phrases on chord tones**, especially the root of the current chord.
- **Rhythm beats notes.** Three notes with great timing and vibrato beat thirty notes without.`
        },
        {
          type: 'tab',
          caption: 'Lick 1, the classic descent: C A G E D C, landing on the root A.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0 }],
          bpm: 90,
          events: tab('1:8 1:5 2:8 2:5 3:7 3:5 4:7/2')
        },
        {
          type: 'tab',
          caption: 'Lick 2, call and response. The call rises to the high C; the response falls back to A.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0 }],
          bpm: 90,
          events: tab('2:5 1:5 1:8/2 1:5 2:8 2:5/1 4:7/2')
        },
        {
          type: 'tab',
          caption: 'Lick 3, for the D7 bar: walk up to the C (♭7 of D7) and resolve to D, the root.',
          toolExamples: [{ kind: 'chord', root: 'D', type: 'dom7' }, { kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0 }],
          bpm: 90,
          events: tab('4:5 4:7 3:5/1 3:7/3')
        },
        {
          type: 'tab',
          caption: 'Lick 4, for the E7 bar (bar 9): land on D, the ♭7 of E7, then on E, its root.',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'dom7' }, { kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0 }],
          bpm: 90,
          events: tab('2:8 2:5 3:7/1 2:5/3')
        },
        {
          type: 'audio',
          label: 'Hear lick 3 over D7',
          play: overChord(OPEN_CHORDS.D7, [55, 57, 60, 62], 90, { kind: 'chord', root: 'D', type: 'dom7', shape: OPEN_CHORDS.D7 }),
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', box: 0 }]
        },
        {
          type: 'tryIt',
          question: mc('Over an **E7** chord, you bend D (3rd string, 7th fret) up a whole step. Which chord tone of E7 do you land on?', 'E, the root', ['G♯, the 3rd', 'B, the 5th', 'D, the ♭7'], {
            explain: 'D up a whole step is **E**, the root of E7. That makes this bend a perfect target note in bar 9.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Over **D7**, which note of A minor pentatonic is the chord\'s **♭7**?', 'C', ['G', 'E', 'A'], {
            explain: 'D7 = D F♯ A **C**. The C in box 1 (6th string 8th fret, 3rd string 5th fret, 1st string 8th fret) is the ♭7: a great target over the IV chord.'
          })
        }
      ]
    }
  ],
  // This unit's lessons are split across two path units (see content/curriculum.ts):
  // u8l1, u8l4, u8l5 in "Power chords and the blues"; u8l2, u8l3, u8l6 in "Pentatonics across the neck".
  // Every question is therefore tagged with the lesson that teaches it.
  quiz: {
    count: 12,
    fixed: [
      taught('u8l1', mc('What is the formula of the **minor pentatonic** scale?', '1 ♭3 4 5 ♭7', ['1 2 3 5 6', '1 ♭3 5 ♭7', '1 2 ♭3 4 5'], {
        explain: 'Minor pentatonic = **1 ♭3 4 5 ♭7**: the root, a minor 3rd, 4th, 5th and flat 7th.'
      })),
      taught('u8l1', {
        kind: 'spell',
        prompt: 'Spell **A minor pentatonic**, starting on A.',
        answer: spellScale('A', 'minorPentatonic'),
        explain: '**A C D E G**: 1 ♭3 4 5 ♭7 from A.'
      }),
      taught('u8l1', {
        kind: 'fretboard',
        prompt: 'Box 1 of A minor pentatonic is shown. Click the root (A) on the **4th string**.',
        frets: [3, 10],
        marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'none' }).map((x) => ({ ...x, color: 'tone' as const })),
        targets: [P(4, 7)],
        explain: 'The 4th-string root in box 1 is at the **7th fret**, under your ring finger.'
      }),
      taught('u8l2', mc('In A minor pentatonic, **box 3** starts on which note on the 6th string?', 'D (10th fret)', ['C (8th fret)', 'E (12th fret)', 'A (5th fret)'], {
        explain: 'The boxes climb through the scale notes: box 1 on A (5th fret), box 2 on C (8th), box 3 on **D** (10th fret), box 4 on E (12th), box 5 on G (15th).'
      })),
      taught('u8l3', mc('A minor pentatonic contains exactly the same notes as which **major** pentatonic?', 'C major pentatonic', ['A major pentatonic', 'E major pentatonic', 'G major pentatonic'], {
        explain: 'The relative major is a minor 3rd up: A → **C**. Both use A C D E G.'
      })),
      taught('u8l3', {
        kind: 'spell',
        prompt: 'Spell **C major pentatonic**, starting on C.',
        answer: spellScale('C', 'majorPentatonic'),
        explain: '1 2 3 5 6 from C: **C D E G A**.'
      }),
      taught('u8l4', mc('What is the "blue note" added to the minor pentatonic to make the blues scale?', 'The ♭5', ['The 2', 'The major 3rd', 'The 6'], {
        explain: 'The blues scale is **1 ♭3 4 ♭5 5 ♭7**. In A the ♭5 is **E♭**.'
      })),
      taught('u8l4', {
        kind: 'spell',
        prompt: 'Spell the **A blues scale**, starting on A.',
        answer: spellScale('A', 'blues'),
        explain: '**A C D E♭ E G**. The ♭5 is spelled E♭ (a flattened E), not D♯.'
      }),
      taught('u8l4', {
        kind: 'fretboard',
        prompt: 'Click the **blue note (♭5)** on the **5th string** near box 1 of A minor pentatonic.',
        frets: [3, 10],
        marks: scaleMarks('A', 'minorPentatonic', { box: 0, label: 'none' }).map((x) => ({ ...x, color: 'ghost' as const })),
        targets: [P(5, 6)],
        explain: 'E♭ sits between D (5th fret) and E (7th fret) on the 5th string: the **6th fret**.'
      }),
      taught('u8l5', mc('Which three chords make up a 12-bar blues in **A**?', 'A7, D7, E7', ['A7, D7, G7', 'Am, Dm, Em', 'A7, E7, F#m7'], {
        explain: 'I7, IV7 and V7 in A: **A7, D7 and E7**.'
      })),
      taught('u8l5', mc('What is a **quick change** in a 12-bar blues?', 'Going to the IV chord in bar 2', ['Speeding up the tempo in the last chorus', 'Changing key for the solo', 'Playing the V chord in bar 4'], {
        explain: 'The quick change moves **I → IV → I** in bars 1–3, instead of four bars of I.'
      })),
      taught('u8l5', {
        kind: 'text',
        prompt: 'How many bars long is one chorus of a standard blues? (Type a number.)',
        accept: ['12', 'twelve'],
        explain: 'It\'s the **12**-bar blues: three lines of four bars.'
      }),
      taught('u8l5', mc('What does the **turnaround** in bars 11–12 do?', 'Leads back to the I chord to start the next chorus', ['Ends the song for good', 'Modulates to the relative minor', 'Repeats the first line'], {
        explain: 'The turnaround, usually ending on V in bar 12, creates tension that **resolves to I in bar 1** of the next chorus.'
      })),
      taught('u8l5', mc('Listen. Is this rhythm **straight** or **shuffle (swung)**?', 'Shuffle (swung)', ['Straight'], {
        play: { kind: 'rhythm', pattern: [2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3], bpm: 96, pitch: 45 },
        explain: 'Each beat is split **long–short**. That lopsided "doo-ba doo-ba" is the shuffle.'
      })),
      // Its wrong answers name the major pentatonic and natural minor, so it waits for the later unit.
      taught('u8l3', mc('Listen. Which scale is this?', 'Blues scale', ['Minor pentatonic', 'Major pentatonic', 'Natural minor'], {
        play: playScale('E', 'blues', 3),
        explain: 'Six notes, with a chromatic run 4 → ♭5 → 5 in the middle: the **blues scale**.'
      })),
      // Compares with triads, which come after the blues unit.
      taught('u8l6', mc('Listen. What type of chord is this, the kind used for all three chords of a blues?', 'Dominant 7th', ['Major triad', 'Minor triad', 'Major 7th'], {
        play: strum(OPEN_CHORDS.A7),
        explain: 'This is **A7**: a major triad plus a ♭7. That bluesy, unresolved edge is the dominant 7th.'
      })),
      taught('u8l6', mc('Over **E7**, bending D (3rd string, 7th fret) up a whole step lands on…', 'E, the root of E7', ['F, the ♭9', 'G♯, the 3rd', 'D, the ♭7'], {
        explain: 'D + a whole step = **E**, the root of the E7 chord.'
      })),
      taught('u8l3', {
        kind: 'text',
        prompt: 'Which **major** pentatonic shares its notes with **E minor pentatonic**?',
        accept: ['G', 'G major', 'G major pentatonic'],
        explain: 'Up a minor 3rd from E is **G**: E G A B D = G A B D E.'
      })
    ],
    generators: [
      forLesson('u8l1', findBoxRoots),
      forLesson('u8l1', spellPent(EARLY_TYPES)),
      forLesson('u8l4', hearScale(EARLY_TYPES)),
      forLesson('u8l5', twelveBarChord),
      forLesson('u8l3', relativePent),
      forLesson('u8l3', spellPent(ALL_TYPES)),
      forLesson('u8l3', hearScale(ALL_TYPES))
    ]
  }
}

export default unit
