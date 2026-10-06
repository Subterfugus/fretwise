import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { chordToneMarks, m, mc, playChord, rand, randInt, strum } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, OPEN_CHORDS, FretPos, midiAt, movableChord, openMidi, pcAt, shapeMidis, shapePositions } from '@/theory/guitar'
import { buildChord, chordNames, chordSymbol, CHORDS, ChordType } from '@/theory/chords'
import { midi, mod, pitchClass } from '@/theory/notes'

// ---------- local helpers ----------

/** Interval label (relative to root) for triad-type chord tones. */
const TONE_LABEL: Record<number, string> = { 0: 'R', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5' }

/** Marks for a chord shape labelled R / 3 / ♭3 / 5 etc. */
function toneMarks(sh: ChordShape, root: string): FretMark[] {
  const r = pitchClass(root)
  return shapePositions(sh).map((p) => ({
    ...p,
    label: TONE_LABEL[mod(pcAt(p) - r, 12)] ?? '?',
    color: pcAt(p) === r ? 'root' : 'tone'
  }))
}

/** Marks for an explicit list of positions, labelled relative to a root. */
function labelPositions(ps: FretPos[], root: string, color?: FretMark['color']): FretMark[] {
  const r = pitchClass(root)
  return ps.map((p) => ({ ...p, label: TONE_LABEL[mod(pcAt(p) - r, 12)], color: color ?? (pcAt(p) === r ? 'root' : 'tone') }))
}

const P = (string: number, fret: number): FretPos => ({ string, fret })

/** Play positions together, low to high. */
const together = (ps: FretPos[], mode: 'strum' | 'block' | 'arpeggio' = 'strum'): PlaySpec => ({
  kind: 'notes',
  notes: ps.map((p) => midiAt(p)).sort((a, b) => a - b),
  mode
})

const seq = (shapes: ChordShape[], beats = 2, bpm = 90, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: shapes.map((s) => ({ notes: shapeMidis(s), beats, mode: 'strum' as const }))
})

/** Tab events: each note alone, then all together. */
const arpThenChord = (ps: FretPos[], each = 0.5, hold = 1.5) => [...ps.map((p) => ({ pos: [p], beats: each })), { pos: ps, beats: hold }]

/** Close-position triad as MIDI numbers, root in the given octave. */
const triadMidis = (root: string, type: ChordType, octave = 3): number[] => buildChord(root + octave, type).map(midi)

const QUALITY_NAME: Record<'maj' | 'min' | 'dim' | 'aug', string> = {
  maj: 'Major',
  min: 'Minor',
  dim: 'Diminished',
  aug: 'Augmented'
}

/**
 * A close-voiced triad on three adjacent strings (low string first), in the
 * given inversion (0 = root position, 1 = first, 2 = second).
 */
function stringSetTriad(root: string, type: ChordType, strings: [number, number, number], inversion: number): FretPos[] {
  const tones = buildChord(root, type).map(pitchClass)
  const order = [tones[inversion % 3], tones[(inversion + 1) % 3], tones[(inversion + 2) % 3]]
  let f0 = mod(order[0] - openMidi(strings[0]), 12)
  if (f0 === 0) f0 = 12
  const out: FretPos[] = [{ string: strings[0], fret: f0 }]
  for (let i = 1; i < 3; i++) {
    let f = mod(order[i] - openMidi(strings[i]), 12)
    while (f - f0 > 6) f -= 12
    while (f0 - f > 6) f += 12
    if (f < 0) f += 12
    out.push({ string: strings[i], fret: f })
  }
  return out
}

// ---------- 3-string triad shapes used in lessons ----------

const C_GBE = {
  second: [P(3, 0), P(2, 1), P(1, 0)],
  root: [P(3, 5), P(2, 5), P(1, 3)],
  first: [P(3, 9), P(2, 8), P(1, 8)],
  secondHigh: [P(3, 12), P(2, 13), P(1, 12)]
}
const G_DGB = {
  second: [P(4, 0), P(3, 0), P(2, 0)],
  root: [P(4, 5), P(3, 4), P(2, 3)],
  first: [P(4, 9), P(3, 7), P(2, 8)],
  secondHigh: [P(4, 12), P(3, 12), P(2, 12)]
}
const AM_GBE = {
  root: [P(3, 2), P(2, 1), P(1, 0)],
  first: [P(3, 5), P(2, 5), P(1, 5)],
  second: [P(3, 9), P(2, 10), P(1, 8)]
}

// ---------- generated questions ----------

const TRIAD_ROOTS: Record<'maj' | 'min' | 'dim' | 'aug', string[]> = {
  maj: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab'],
  min: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'F#', 'C#'],
  dim: ['B', 'C#', 'D#', 'F#', 'G#', 'E', 'A', 'C', 'D'],
  aug: ['C', 'D', 'F', 'G', 'Bb', 'Eb', 'Ab']
}

const spellTriad = (): QuizQuestion => {
  const type = rand(['maj', 'maj', 'min', 'min', 'dim', 'aug'] as const)
  const root = rand(TRIAD_ROOTS[type])
  const notes = chordNames(root, type)
  return {
    kind: 'spell',
    prompt: `Spell the **${chordSymbol(root, type)}** (${CHORDS[type].name}) triad, root first.`,
    answer: notes,
    explain: `${CHORDS[type].name[0].toUpperCase() + CHORDS[type].name.slice(1)} = **${CHORDS[type].formula}**. From ${root}: **${notes.join(' – ')}**. Skip a letter each time (${notes
      .map((n) => n[0])
      .join('-')}), then adjust sharps/flats to get the right size of 3rds.`
  }
}

const triadQualityFromNotes = (): QuizQuestion => {
  const type = rand(['maj', 'min', 'dim', 'aug'] as const)
  const root = rand(TRIAD_ROOTS[type])
  const notes = chordNames(root, type)
  const name = QUALITY_NAME[type]
  const stacks: Record<string, string> = {
    maj: 'major 3rd + minor 3rd',
    min: 'minor 3rd + major 3rd',
    dim: 'minor 3rd + minor 3rd',
    aug: 'major 3rd + major 3rd'
  }
  return mc(`The notes **${notes.join(' – ')}** form which kind of triad?`, name, Object.values(QUALITY_NAME), {
    play: playChord(root, type, 3, 'arpeggio'),
    explain: `${notes[0]} → ${notes[1]} → ${notes[2]} is a **${stacks[type]}**, which makes a **${name.toLowerCase()}** triad (${chordSymbol(root, type)}).`
  })
}

const listenQuality = (): QuizQuestion => {
  const type = rand(['maj', 'maj', 'min', 'min', 'dim', 'aug'] as const)
  const root = rand(['C', 'D', 'E', 'F', 'G', 'A'])
  const descr: Record<string, string> = {
    maj: 'bright and stable: a major 3rd on the bottom',
    min: 'darker and sadder: a minor 3rd on the bottom',
    dim: 'tense and unstable: two minor 3rds, so the 5th is flattened',
    aug: 'unresolved and dreamy: two major 3rds, so the 5th is sharpened'
  }
  return mc('Listen. Which kind of triad is this?', QUALITY_NAME[type], Object.values(QUALITY_NAME), {
    play: {
      kind: 'sequence',
      bpm: 80,
      events: [
        { notes: triadMidis(root, type), beats: 3, mode: 'arpeggio' },
        { notes: triadMidis(root, type), beats: 3, mode: 'strum' }
      ]
    },
    explain: `That was **${chordSymbol(root, type)}**, a ${QUALITY_NAME[type].toLowerCase()} triad: ${descr[type]}.`
  })
}

const OPEN_FOR_QUIZ: { name: string; root: string; minor: boolean }[] = [
  { name: 'C', root: 'C', minor: false },
  { name: 'A', root: 'A', minor: false },
  { name: 'G', root: 'G', minor: false },
  { name: 'E', root: 'E', minor: false },
  { name: 'D', root: 'D', minor: false },
  { name: 'Am', root: 'A', minor: true },
  { name: 'Em', root: 'E', minor: true },
  { name: 'Dm', root: 'D', minor: true }
]

const openChordTone = (): QuizQuestion => {
  const c = rand(OPEN_FOR_QUIZ)
  const sh = OPEN_CHORDS[c.name]
  const role = rand(['root', 'third', 'fifth'] as const)
  const semis = role === 'root' ? 0 : role === 'fifth' ? 7 : c.minor ? 3 : 4
  const roleName = role === 'root' ? 'root' : role === 'fifth' ? '5th' : c.minor ? '♭3 (minor 3rd)' : '3rd (major 3rd)'
  const r = pitchClass(c.root)
  const targets = shapePositions(sh).filter((p) => mod(pcAt(p) - r, 12) === semis)
  return {
    kind: 'fretboard',
    mode: 'all',
    frets: [0, 5],
    prompt: `Here is an open **${c.name}** chord. Select **every ${roleName}** in the shape, then press Check.`,
    marks: shapePositions(sh).map((p) => ({ ...p, color: 'ghost' as const })),
    targets,
    explain: `In ${c.name} the ${roleName} is **${targets.map((p) => `string ${p.string} fret ${p.fret}`).join(', ')}**. The full shape reads (low to high): ${toneMarks(sh, c.root)
      .map((x) => x.label)
      .join(' ')}.`
  }
}

const INV_NAMES = ['Root position', 'First inversion', 'Second inversion']

const inversionOnStrings = (): QuizQuestion => {
  const type = rand(['maj', 'maj', 'min'] as const)
  const root = rand(type === 'maj' ? ['C', 'D', 'F', 'G', 'A'] : ['A', 'D', 'E', 'B'])
  const strings = rand([[3, 2, 1], [4, 3, 2]] as [number, number, number][])
  const inv = randInt(0, 2)
  const ps = stringSetTriad(root, type, strings, inv)
  const tones = chordNames(root, type)
  const bassName = tones[inv]
  const lo = Math.max(0, Math.min(...ps.map((p) => p.fret)) - 2)
  return mc(
    `These three notes on the ${strings[0] === 3 ? 'G–B–E' : 'D–G–B'} strings make a **${chordSymbol(root, type)}** triad. Which inversion is it?`,
    INV_NAMES[inv],
    INV_NAMES,
    {
      visual: { type: 'fretboard', marks: ps.map((p) => m(p.string, p.fret, undefined, 'accent')), frets: [lo, Math.max(lo + 6, ...ps.map((p) => p.fret + 1))] },
      play: together(ps, 'arpeggio'),
      explain: `The lowest note (on string ${strings[0]}) is **${bassName}**, the ${['root', '3rd', '5th'][inv]} of ${chordSymbol(root, type)}, so it's **${INV_NAMES[inv].toLowerCase()}**. Low to high: ${labelPositions(ps, root)
        .map((x) => x.label)
        .join(' – ')}.`
    }
  )
}

// ---------- unit ----------

const C = OPEN_CHORDS
const G5 = movableChord('G', 'power', 6)!
const A5 = movableChord('A', 'power', 6)!
const C5 = movableChord('C', 'power', 5)!
const D5 = movableChord('D', 'power', 5)!

const unit: Unit = {
  id: 'u5',
  number: 5,
  title: 'Triads and open chords',
  summary: 'How chords are built from stacked 3rds, the four triad qualities, sus and power chords, what is really inside your open chords, inversions and small triad shapes.',
  lessons: [
    // ------------------------------------------------------------------
    {
      id: 'u5l1',
      title: 'Building a triad by stacking 3rds',
      summary: 'Take a scale, skip every other note, and a chord falls out.',
      blocks: [
        {
          type: 'text',
          md: `A **chord** is three or more notes sounding together. The most basic chord, and the building block of almost everything you strum, is the **triad**: three notes stacked in **3rds**.

Here's the recipe. Take the C major scale from [[u4l1]]:

**C – D – E – F – G – A – B**

Start on C and take **every other note**: C, (skip D), **E**, (skip F), **G**. Those three notes, **C – E – G**, are the C major triad.

They have names based on their distance from the bottom note, the **root**:
- **Root (R or 1)**: the note the chord is named after, C
- **3rd**: two letters up, E
- **5th**: four letters up, G`
        },
        {
          type: 'staff',
          caption: 'The C major scale, then its 1st, 3rd and 5th notes stacked into a triad.',
          notes: [
            { keys: ['C/4'], duration: 'q' },
            { keys: ['D/4'], duration: 'q' },
            { keys: ['E/4'], duration: 'q' },
            { keys: ['F/4'], duration: 'q' },
            { keys: ['G/4'], duration: 'q' },
            { keys: ['A/4'], duration: 'q' },
            { keys: ['B/4'], duration: 'q' },
            { keys: ['C/5'], duration: 'q' },
            { keys: ['C/4', 'E/4', 'G/4'], duration: 'w' }
          ]
        },
        {
          type: 'text',
          md: `### Why "stacking 3rds"?
Look at the triad as two intervals sitting on top of each other:
- **C → E** is a **major 3rd** (4 half steps, 4 frets)
- **E → G** is a **minor 3rd** (3 half steps, 3 frets)

Together C → G spans a **perfect 5th** (7 frets). A major 3rd with a minor 3rd on top: that's the DNA of every **major** chord.

On the guitar you can see this on a single string. Root at the 3rd fret of the A string, then count up 4 frets for the 3rd and 3 more for the 5th:`
        },
        {
          type: 'fretboard',
          marks: [m(5, 3, 'R', 'root'), m(5, 7, '3'), m(5, 10, '5'), m(5, 15, 'R', 'root')],
          frets: [0, 15],
          caption: 'C major triad along the A string: R (C) +4 frets → 3 (E) +3 frets → 5 (G) +5 frets → R (C). Click to hear.',
          playAll: true
        },
        {
          type: 'text',
          md: `Nobody plays chords along one string, of course. Spread the same notes across strings and you get something familiar. Here are C, E and G on the 5th, 4th and 3rd strings, which is the bottom half of your open C chord:`
        },
        {
          type: 'fretboard',
          marks: [m(5, 3, 'R', 'root'), m(4, 2, '3'), m(3, 0, '5')],
          frets: [0, 5],
          caption: 'C (A string, 3rd fret), E (D string, 2nd fret), G (open G string): a C major triad.',
          playAll: true
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C triad, one note at a time', play: { kind: 'notes', notes: [48, 52, 55], mode: 'arpeggio' } },
            { label: 'C triad, together', play: { kind: 'notes', notes: [48, 52, 55], mode: 'strum' } },
            { label: 'Full open C chord', play: strum(C.C) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Letters first, then accidentals.** A triad always uses every *other* letter: C-E-G, D-F-A, E-G-B, F-A-C, G-B-D, A-C-E, B-D-F. Get the letters right, then add ♯ or ♭ to make the 3rds the right size. That's why the D major triad is spelled **D – F♯ – A**, never D – G♭ – A.`
        },
        {
          type: 'chords',
          shapes: [C.C, C.G, C.D],
          caption: 'Open C, G and D: each one is a triad (R, 3, 5) with some notes doubled. Click to strum.'
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **G major** triad (root, 3rd, 5th). Hint: G major scale is G A B C D E F♯.',
            answer: ['G', 'B', 'D'],
            explain: 'Take every other note of the G major scale: **G – B – D**. G→B is a major 3rd, B→D is a minor 3rd.'
          }
        },
        {
          type: 'tryIt',
          question: mc('How many frets is a **major 3rd**?', '4', ['3', '5', '7'], {
            explain: 'A major 3rd is 4 half steps = **4 frets**. A minor 3rd is 3 frets, and a perfect 5th is 7.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u5l2',
      title: 'Major, minor, diminished and augmented',
      summary: 'Two kinds of 3rd, stacked four ways, give the four triad qualities.',
      blocks: [
        {
          type: 'text',
          md: `There are two sizes of 3rd, **major (4 frets)** and **minor (3 frets)**. Stack two of them and there are exactly four combinations. Each one is a different **triad quality**:`
        },
        {
          type: 'table',
          headers: ['Quality', 'Bottom 3rd', 'Top 3rd', 'Formula', 'From C', 'Symbol'],
          rows: [
            ['Major', 'major (4)', 'minor (3)', '1 3 5', 'C E G', 'C'],
            ['Minor', 'minor (3)', 'major (4)', '1 ♭3 5', 'C Eb G', 'Cm'],
            ['Diminished', 'minor (3)', 'minor (3)', '1 ♭3 ♭5', 'C Eb Gb', 'C° (Cdim)'],
            ['Augmented', 'major (4)', 'major (4)', '1 3 ♯5', 'C E G#', 'C+ (Caug)']
          ],
          caption: 'Numbers in brackets are half steps (frets).'
        },
        {
          type: 'text',
          md: `Notice what the formulas say:
- **Minor** is major with the **3rd lowered** one fret. The 5th doesn't move.
- **Diminished** is minor with the **5th lowered** too.
- **Augmented** is major with the **5th raised**.

So a single fret is the difference between happy and sad. Hear all four on the same root:`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major', play: playChord('C', 'maj', 3, 'strum') },
            { label: 'C minor', play: playChord('C', 'min', 3, 'strum') },
            { label: 'C diminished', play: playChord('C', 'dim', 3, 'strum') },
            { label: 'C augmented', play: playChord('C', 'aug', 3, 'strum') }
          ]
        },
        {
          type: 'staff',
          caption: 'C, Cm, C° and C+ written out. Only the 3rd and 5th move.',
          notes: [
            { keys: ['C/4', 'E/4', 'G/4'], duration: 'h' },
            { keys: ['C/4', 'Eb/4', 'G/4'], duration: 'h' },
            { keys: ['C/4', 'Eb/4', 'Gb/4'], duration: 'h' },
            { keys: ['C/4', 'E/4', 'G#/4'], duration: 'h' }
          ]
        },
        {
          type: 'text',
          md: `### On the fretboard
Here's the same idea as a small shape. The root C stays put on the 6th string (8th fret). The 3rd sits on the A string (7th fret for E, 6th fret for E♭) and the 5th on the D string (5th fret for G, 4th for G♭, 6th for G♯). Play through the tab below and you'll *feel* the formulas under your fingers.`
        },
        {
          type: 'tab',
          notation: false,
          bpm: 100,
          caption: 'C major, C minor, C diminished, C augmented: arpeggiated then together.',
          events: [
            ...arpThenChord([P(6, 8), P(5, 7), P(4, 5)]),
            ...arpThenChord([P(6, 8), P(5, 6), P(4, 5)]),
            ...arpThenChord([P(6, 8), P(5, 6), P(4, 4)]),
            ...arpThenChord([P(6, 8), P(5, 7), P(4, 6)])
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: 'Keep your 1st finger planted on the 6th-string root while the other fingers move. Say the formula out loud as you play each one: "1 3 5", "1 ♭3 5", "1 ♭3 ♭5", "1 3 ♯5".'
        },
        {
          type: 'fretboard',
          marks: [m(6, 8, 'R', 'root'), m(5, 7, '3'), m(5, 6, '♭3', 'blue'), m(4, 4, '♭5', 'blue'), m(4, 5, '5'), m(4, 6, '♯5', 'accent')],
          frets: [3, 10],
          caption: 'All the options around a C root (6th string, 8th fret): major or minor 3rd on the A string; ♭5, 5 or ♯5 on the D string.'
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('A', 'min', [0, 12]),
          caption: 'Every A, C and E up to the 12th fret: the A minor triad (1, ♭3, 5) all over the neck.',
          playAll: true
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Where you'll meet them.** Major and minor triads are everywhere. The diminished triad appears naturally on the 7th degree of every major scale (you'll see this in [[preview:u7l1]]). The augmented triad is rarer: a colour chord used for passing tension, like the classic "C → C+ → C6" climb.`
        },
        {
          type: 'tryIt',
          question: mc('A triad built from a **minor 3rd with another minor 3rd** on top is…', 'Diminished', ['Minor', 'Augmented', 'Major'], {
            explain: 'Two minor 3rds (3 + 3 = 6 frets) give a **diminished** triad, 1 ♭3 ♭5. The 5th is a tritone above the root.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell **A minor** (A, ♭3, 5).',
            answer: ['A', 'C', 'E'],
            explain: 'A major is A C♯ E. Lower the 3rd a half step: **A – C – E**.'
          }
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u5l3',
      title: 'Sus chords and power chords',
      summary: 'Remove or replace the 3rd and the chord stops being major or minor.',
      blocks: [
        {
          type: 'text',
          md: `The 3rd is the note that decides **major or minor**. So what happens if we take it away?

### Suspended chords
A **sus chord** replaces the 3rd with a neighbour:
- **sus2**: 1 – **2** – 5 (the 3rd drops to the 2nd)
- **sus4**: 1 – **4** – 5 (the 3rd rises to the 4th)

With no 3rd, the chord sounds open and unresolved, "suspended", as if it's waiting to land. Classically the 4th resolves down to the 3rd: **Dsus4 → D**. Guitarists love this move because it's one finger on an open chord.`
        },
        {
          type: 'chords',
          shapes: [C.Dsus2, C.D, C.Dsus4, C.Asus2, C.A, C.Asus4],
          caption: 'Dsus2 – D – Dsus4 and Asus2 – A – Asus4. Only one note changes each time, on the top string or the B string.'
        },
        {
          type: 'fretboard',
          marks: [...toneMarks(C.D, 'D'), m(1, 0, '2', 'accent'), m(1, 3, '4', 'accent')],
          frets: [0, 5],
          caption: 'Open D with its 3rd (F♯, 1st string 2nd fret). The 2nd (E, open) and 4th (G, 3rd fret) sit on either side.'
        },
        {
          type: 'audio',
          label: 'D – Dsus4 – D – Dsus2 – D',
          play: seq([C.D, C.Dsus4, C.D, C.Dsus2, C.D], 2, 84, progressionExample('D', ['I', 'Isus4', 'I', 'Isus2', 'I'], 'major', 84, 2))
        },
        {
          type: 'text',
          md: `### Power chords
You already met power chords in [[u3l6]]: just **root and 5th** (often with the root doubled an octave up), written with a **5**: E5, A5, G5. With no 3rd they're neither major nor minor, which is why they stay tight and heavy under distortion. Here they are next to the other triad variations, so you can compare.`
        },
        {
          type: 'chords',
          shapes: [C.E5, C.A5, G5, C5],
          caption: 'E5 and A5 (open), G5 (root on 6th string, 3rd fret), C5 (root on 5th string, 3rd fret).'
        },
        {
          type: 'tab',
          bpm: 110,
          caption: 'A simple power-chord riff: G5 – A5 – C5 – D5.',
          events: [
            { pos: shapePositions(G5), beats: 1 }, { pos: shapePositions(G5), beats: 1 },
            { pos: shapePositions(A5), beats: 1 }, { pos: shapePositions(A5), beats: 1 },
            { pos: shapePositions(C5), beats: 1 }, { pos: shapePositions(C5), beats: 1 },
            { pos: shapePositions(D5), beats: 2 }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**One shape, any power chord.** Same movable shape as in [[u3l6]]: know your 6th- and 5th-string notes from [[u1l3]] and you can play any power chord.`
        },
        {
          type: 'table',
          headers: ['Chord', 'Formula', 'From D', 'Feel'],
          rows: [
            ['Major', '1 3 5', 'D F# A', 'bright, settled'],
            ['Minor', '1 ♭3 5', 'D F A', 'dark, settled'],
            ['sus2', '1 2 5', 'D E A', 'open, airy'],
            ['sus4', '1 4 5', 'D G A', 'tense, wants to resolve'],
            ['Power (5)', '1 5', 'D A', 'neutral, heavy']
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell **Asus4** (1, 4, 5).',
            answer: ['A', 'D', 'E'],
            explain: 'The 4th above A is D, so Asus4 is **A – D – E**. In the open Asus4 shape, the D is the 3rd fret of the B string, replacing the C♯.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Why is a power chord neither major nor minor?', 'It has no 3rd', ['It has no 5th', 'It has no root', 'It uses a flattened 5th'], {
            explain: 'The 3rd decides major vs minor. A power chord is just **root and 5th**, so it fits either.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u5l4',
      title: 'What is inside your open chords',
      summary: 'C, A, G, E, D, Am, Em and Dm labelled as root, 3rd and 5th.',
      blocks: [
        {
          type: 'text',
          md: `You've been playing these since [[u2l7]]. Now see why they work.

Every open chord you know is just a triad with some notes **doubled**. A six-string E chord only has three different notes in it: E, G♯ and B. Seeing each shape as **R, 3 and 5** is one of the most useful habits in guitar theory. It tells you which note to change to make a chord minor or sus, where the root is for bass lines, and later it's the key to the CAGED system in [[preview:u6l3]].

Below, every chord is labelled by interval: **R** = root, **3** = major 3rd, **♭3** = minor 3rd, **5** = perfect 5th.`
        },
        { type: 'fretboard', marks: toneMarks(C.C, 'C'), frets: [0, 4], caption: 'C: x32010. Notes C E G C E: R 3 5 R 3.', playAll: true },
        { type: 'fretboard', marks: toneMarks(C.A, 'A'), frets: [0, 4], caption: 'A: x02220. Notes A E A C# E: R 5 R 3 5.', playAll: true },
        { type: 'fretboard', marks: toneMarks(C.G, 'G'), frets: [0, 4], caption: 'G: 320003. Notes G B D G B G: R 3 5 R 3 R.', playAll: true },
        { type: 'fretboard', marks: toneMarks(C.E, 'E'), frets: [0, 4], caption: 'E: 022100. Notes E B E G# B E: R 5 R 3 5 R.', playAll: true },
        { type: 'fretboard', marks: toneMarks(C.D, 'D'), frets: [0, 4], caption: 'D: xx0232. Notes D A D F#: R 5 R 3.', playAll: true },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Remember these five: C, A, G, E, D.** [[preview:u6l3]] shows that these exact shapes, moved up the neck, cover the whole fretboard. That's the CAGED system.`
        },
        {
          type: 'text',
          md: `### Major to minor: move the 3rd
To turn a major chord minor, lower its 3rd by one fret. On three of the open shapes that's a tiny change:
- **E → Em**: the G♯ (3rd string, 1st fret) becomes open G. Just lift a finger.
- **A → Am**: the C♯ (2nd string, 2nd fret) drops to C at the 1st fret.
- **D → Dm**: the F♯ (1st string, 2nd fret) drops to F at the 1st fret.`
        },
        { type: 'fretboard', marks: toneMarks(C.Em, 'E'), frets: [0, 4], caption: 'Em: 022000. R 5 R ♭3 5 R.' },
        { type: 'fretboard', marks: toneMarks(C.Am, 'A'), frets: [0, 4], caption: 'Am: x02210. R 5 R ♭3 5.' },
        { type: 'fretboard', marks: toneMarks(C.Dm, 'D'), frets: [0, 4], caption: 'Dm: xx0231. R 5 R ♭3.' },
        {
          type: 'audioRow',
          items: [
            { label: 'E → Em', play: seq([C.E, C.Em], 2, 70, progressionExample('E', ['I', 'i'], 'major', 70, 2)) },
            { label: 'A → Am', play: seq([C.A, C.Am], 2, 70, progressionExample('A', ['I', 'i'], 'major', 70, 2)) },
            { label: 'D → Dm', play: seq([C.D, C.Dm], 2, 70, progressionExample('D', ['I', 'i'], 'major', 70, 2)) }
          ]
        },
        {
          type: 'chords',
          shapes: [C.C, C.A, C.G, C.E, C.D, C.Am, C.Em, C.Dm],
          caption: 'The eight core open chords. Click each to strum.'
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**Why not C minor or G minor in open position?** Lowering the 3rd in the C and G shapes means fretting E♭ or B♭ where there was an open string, which leaves awkward stretches. That's why most players use barre chords for Cm and Gm (see [[preview:u6l1]]).`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 4],
            prompt: 'This is an open **C** chord. Select **every 3rd** (E) in the shape, then press Check.',
            marks: shapePositions(C.C).map((p) => ({ ...p, color: 'ghost' as const })),
            targets: [P(4, 2), P(1, 0)],
            explain: 'The 3rd of C is E: the **2nd fret of the D string** and the **open high E string**.'
          }
        },
        {
          type: 'tryIt',
          question: mc('In an open **G** chord (320003), how many times does the root G appear?', '3', ['1', '2', '4'], {
            explain: 'G is on the 6th string (3rd fret), the open 3rd string and the 1st string (3rd fret): **three** roots. The other notes are B (3rd) twice and D (5th) once.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u5l5',
      title: 'Inversions and small triad shapes',
      summary: 'Same three notes, different note on the bottom: compact triads on the G–B–E and D–G–B strings.',
      blocks: [
        {
          type: 'text',
          md: `A triad doesn't have to have its root on the bottom. Whichever chord tone is **lowest** decides the **inversion**:
- **Root position**: root on the bottom (C – E – G)
- **First inversion**: 3rd on the bottom (E – G – C)
- **Second inversion**: 5th on the bottom (G – C – E)

It's still a C chord every time: same three notes, just re-stacked.`
        },
        {
          type: 'staff',
          caption: 'C major: root position, first inversion, second inversion.',
          notes: [
            { keys: ['C/4', 'E/4', 'G/4'], duration: 'h' },
            { keys: ['E/4', 'G/4', 'C/5'], duration: 'h' },
            { keys: ['G/4', 'C/5', 'E/5'], duration: 'h' }
          ]
        },
        {
          type: 'text',
          md: `### Triads on the top three strings (G–B–E)
On guitar, inversions give us **three-note shapes** on three adjacent strings. They're small, bright and easy to move, which makes them perfect for rhythm parts that sit above a bass player or a second guitar.

Here's C major on the G, B and E strings, walking up the neck through each inversion. Look closely at the first one: it's the top of your open C chord!`
        },
        {
          type: 'fretboard',
          marks: [
            ...labelPositions(C_GBE.second, 'C'),
            ...labelPositions(C_GBE.root, 'C'),
            ...labelPositions(C_GBE.first, 'C'),
            ...labelPositions(C_GBE.secondHigh, 'C')
          ],
          frets: [0, 14],
          caption: 'C major on G–B–E: 2nd inversion (frets 0–1), root position (3–5), 1st inversion (8–9), 2nd inversion again (12–13).'
        },
        {
          type: 'tab',
          bpm: 80,
          caption: 'C major triads up the neck on the top three strings.',
          events: [
            { pos: C_GBE.second, beats: 2 },
            { pos: C_GBE.root, beats: 2 },
            { pos: C_GBE.first, beats: 2 },
            { pos: C_GBE.secondHigh, beats: 2 }
          ]
        },
        {
          type: 'text',
          md: `### The same idea on D–G–B
Move down one string set and the shapes change, because the G–B gap (the "B-string shift" from [[u1l4]]) now sits in the upper part of the set instead of the lower part. Here's **G major** on the D, G and B strings. The open strings D–G–B are already a G triad in second inversion!`
        },
        {
          type: 'fretboard',
          marks: [
            ...labelPositions(G_DGB.second, 'G'),
            ...labelPositions(G_DGB.root, 'G'),
            ...labelPositions(G_DGB.first, 'G'),
            ...labelPositions(G_DGB.secondHigh, 'G')
          ],
          frets: [0, 13],
          caption: 'G major on D–G–B: 2nd inversion (open), root position (3–5), 1st inversion (7–9), 2nd inversion (12).'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G: open (2nd inv)', play: together(G_DGB.second) },
            { label: 'G: root position', play: together(G_DGB.root) },
            { label: 'G: 1st inversion', play: together(G_DGB.first) },
            { label: 'G: 2nd inv (12th fret)', play: together(G_DGB.secondHigh) }
          ]
        },
        {
          type: 'text',
          md: `### Minor triads on G–B–E
Minor triads work the same way: find the 3rd in each shape and drop it one fret. Here's **A minor** on the top strings. The root-position shape is the top of your open Am chord.`
        },
        {
          type: 'fretboard',
          marks: [...labelPositions(AM_GBE.root, 'A'), ...labelPositions(AM_GBE.first, 'A'), ...labelPositions(AM_GBE.second, 'A')],
          frets: [0, 12],
          caption: 'A minor on G–B–E: root position (0–2), 1st inversion (all at the 5th fret), 2nd inversion (8–10).',
          playAll: true
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Practice:** strum each C shape on G–B–E while saying which chord tone is on top (E, G, C, E). Then do the same for G on D–G–B. Soon you'll be able to grab a chord with the melody note you want on top, which is a real arranging skill.`
        },
        {
          type: 'tryIt',
          question: mc('**E – G – C** (E lowest) is which inversion of C major?', 'First inversion', ['Root position', 'Second inversion', 'It isn’t a C chord'], {
            explain: 'The 3rd (E) is on the bottom, so it is **first inversion**.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 8],
            prompt: 'Select the **root-position C major** triad on the G, B and E strings (root on the G string), then press Check.',
            targets: C_GBE.root,
            explain: 'C on the G string is the **5th fret**, E on the B string is the **5th fret**, and G on the high E string is the **3rd fret**.'
          }
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u5l6',
      title: 'Hearing major vs minor',
      summary: 'Train your ear to tell chord qualities apart.',
      blocks: [
        {
          type: 'text',
          md: `Theory is only useful if you can **hear** it. The good news: major vs minor is one of the easiest things to learn to recognise, because the difference is so emotional.
- **Major** sounds bright, open, settled, "happy"
- **Minor** sounds darker, sadder, more serious

Those words are a starting point, not a rule (plenty of upbeat songs are in minor). A more reliable method: **listen to the 3rd**. In a major chord it sits high and bright; in a minor chord it's one fret lower and pulls the sound downward.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A (major)', play: strum(C.A) },
            { label: 'Am (minor)', play: strum(C.Am) },
            { label: 'E (major)', play: strum(C.E) },
            { label: 'Em (minor)', play: strum(C.Em) }
          ]
        },
        {
          type: 'text',
          md: `### Arpeggiate to hear the 3rd
If you're unsure, play the chord one note at a time: root, 3rd, 5th. Major goes up a big step then a small one (4 frets, then 3); minor goes up a small step then a big one (3 frets, then 4). Sing along with each one.`
        },
        {
          type: 'tab',
          bpm: 90,
          caption: 'C major then C minor, arpeggiated and then together. The only difference is E vs E♭ on the A string.',
          notation: false,
          events: [...arpThenChord([P(6, 8), P(5, 7), P(4, 5)], 1, 2), ...arpThenChord([P(6, 8), P(5, 6), P(4, 5)], 1, 2)]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Major arpeggio (G)', play: playChord('G', 'maj', 2, 'arpeggio') },
            { label: 'Minor arpeggio (G)', play: playChord('G', 'min', 2, 'arpeggio') },
            { label: 'Diminished (G)', play: playChord('G', 'dim', 2, 'arpeggio') },
            { label: 'Augmented (G)', play: playChord('G', 'aug', 2, 'arpeggio') }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Ear drill with a friend (or the ear-training tab):** one person strums E or Em, A or Am, D or Dm without showing the fretting hand, and the other names it. Then move on to random roots using barre chords. Once major/minor is easy, add sus4 (tense, wants to resolve) and diminished (unstable, spooky).`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Major or minor?', 'Minor', ['Major'], {
            play: strum(C.Dm),
            explain: 'That was **D minor**. The F on top (♭3) gives the darker colour.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Major or minor?', 'Major', ['Minor'], {
            play: strum(C.G),
            explain: 'That was **G major**, with the major 3rd B ringing on the A and B strings.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen to the arpeggio. Which triad quality is it?', 'Diminished', ['Major', 'Minor', 'Augmented'], {
            play: playChord('B', 'dim', 2, 'arpeggio'),
            explain: 'B – D – F: two minor 3rds, a **diminished** triad. Notice how unstable it feels.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('A major triad contains…', 'root, major 3rd, perfect 5th', ['root, minor 3rd, perfect 5th', 'root, 4th, 5th', 'root, major 3rd, minor 6th'], {
        explain: 'Major = **1 3 5**: a major 3rd (4 frets) with a minor 3rd on top, making a perfect 5th.'
      }),
      mc('Stacking **two major 3rds** gives which triad?', 'Augmented', ['Major', 'Diminished', 'Minor'], {
        explain: 'Major 3rd + major 3rd = 1 3 ♯5, an **augmented** triad.'
      }),
      { kind: 'spell', prompt: 'Spell the **D major** triad, root first.', answer: ['D', 'F#', 'A'], explain: 'D – F♯ – A. D→F♯ is a major 3rd, F♯→A a minor 3rd.' },
      { kind: 'spell', prompt: 'Spell the **E minor** triad, root first.', answer: ['E', 'G', 'B'], explain: 'E major is E G♯ B; lower the 3rd: **E – G – B**.' },
      { kind: 'spell', prompt: 'Spell the **B diminished** triad, root first.', answer: ['B', 'D', 'F'], explain: 'B → D is a minor 3rd, D → F is a minor 3rd: **B – D – F**.' },
      { kind: 'spell', prompt: 'Spell the **C augmented** triad, root first.', answer: ['C', 'E', 'G#'], explain: 'C major is C E G; raise the 5th: **C – E – G♯** (not A♭, which would be the wrong letter).' },
      mc('What changes when you go from an open **E** chord to **Em**?', 'The G♯ on the 3rd string becomes open G', ['The B on the 5th string moves up a fret', 'The low E is muted', 'The open B string is fretted'], {
        explain: 'Em lowers the 3rd (G♯ → G). On the guitar you simply lift your 1st finger off the 3rd string.'
      }),
      {
        kind: 'fretboard',
        prompt: 'This is an open **C** chord. Click the **5th** (G).',
        frets: [0, 4],
        marks: shapePositions(C.C).map((p) => ({ ...p, color: 'ghost' as const })),
        targets: [P(3, 0)],
        explain: 'The only G in an open C chord is the **open 3rd string**.'
      },
      mc('Why do power chords sound good with heavy distortion?', 'They contain only root and 5th, with no 3rd to clash', ['They contain a minor 3rd', 'They are always played in open position', 'They have four different notes'], {
        explain: 'Distortion adds lots of overtones. The simple root–5th sound stays clear where a full triad gets muddy.'
      }),
      {
        kind: 'text',
        prompt: 'The notes **D – G – A** make which chord? (e.g. "Dsus2")',
        accept: ['Dsus4', 'Dsus', 'D sus4', 'Dsus 4', 'D sus 4', 'D suspended 4th'],
        explain: 'G is the 4th above D, replacing the 3rd (F♯): **Dsus4**.'
      },
      mc('**G – C – E** with G on the bottom is…', 'C major, second inversion', ['C major, first inversion', 'G major, root position', 'E minor, root position'], {
        explain: 'The notes are C, E and G. With the 5th (G) on the bottom, it is **second inversion** of C.'
      }),
      {
        kind: 'fretboard',
        mode: 'all',
        frets: [0, 8],
        prompt: 'Select the **root-position C major** triad on the G–B–E strings, then press Check.',
        targets: C_GBE.root,
        explain: 'G string 5th fret (C), B string 5th fret (E), high E string 3rd fret (G).'
      },
      mc('Listen. Major or minor?', 'Major', ['Minor'], {
        play: strum(C.A),
        explain: 'That was **A major**.'
      }),
      mc('Listen. Major or minor?', 'Minor', ['Major'], {
        play: strum(C.Em),
        explain: 'That was **E minor**.'
      }),
      mc('Listen. Which triad quality?', 'Augmented', ['Major', 'Minor', 'Diminished'], {
        play: playChord('C', 'aug', 3, 'arpeggio'),
        explain: 'C – E – G♯: two major 3rds, an **augmented** triad. It sounds unresolved, like it wants to move.'
      }),
      mc('In the open **D** chord (xx0232), what is the note on the 1st string, 2nd fret?', 'F♯, the major 3rd', ['A, the 5th', 'D, the root', 'E, the 2nd'], {
        explain: 'Fret 2 of the high E string is **F♯**, the 3rd of D. Lower it to F for Dm.'
      })
    ],
    generators: [spellTriad, triadQualityFromNotes, listenQuality, openChordTone, inversionOnStrings]
  }
}

export default unit
