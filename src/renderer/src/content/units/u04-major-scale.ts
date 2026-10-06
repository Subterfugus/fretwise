import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { m, mc, rand, distractors, playScale, scaleMarks } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, FretPos, OPEN_CHORDS, midiAt, nameAt, scalePositions, shapeMidis, STRING_NAMES } from '@/theory/guitar'
import { parseInterval } from '@/theory/intervals'
import { pitchClass, pretty } from '@/theory/notes'
import { SCALES, scaleNames, stepPattern } from '@/theory/scales'
import { CIRCLE_MAJOR, describeKeySignature, keySignature, relativeMinor, SHARP_ORDER, FLAT_ORDER } from '@/theory/keys'

// ---------- local helpers ----------

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th']
const DEGREE_NAMES = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading tone']
const p = (s: string) => pretty(s)
const scaleStr = (key: string) => scaleNames(key, 'major').map(p).join(' ')

/** Marks for one string of a major scale between two frets, labelled by degree. */
const oneString = (key: string, string: number, lo: number, hi: number): FretMark[] =>
  scaleMarks(key, 'major', { frets: [lo, hi], label: 'degree' }).filter((x) => x.string === string)

/** Positions sorted by pitch (for scale runs in tab). */
const byPitch = (ps: FretPos[]) => [...ps].sort((a, b) => midiAt(a) - midiAt(b))

const chordSeq = (shapes: ChordShape[], beats = 2, bpm = 80, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: shapes.map((s) => ({ notes: shapeMidis(s), beats, mode: 'strum' as const }))
})

const sigLabel = (key: string): string => {
  const n = keySignature(key).count
  if (n === 0) return 'No sharps or flats'
  const a = Math.abs(n)
  return `${a} ${n > 0 ? (a === 1 ? 'sharp' : 'sharps') : a === 1 ? 'flat' : 'flats'}`
}

// G major, 2nd position (frets 2-5), and the two-octave run from G2 to G4
const G_POS = scalePositions('G', 'major', 2, 5)
const G_RUN = byPitch(G_POS).filter((x) => midiAt(x) >= 43 && midiAt(x) <= 67)

// ---------- generated questions ----------

const SPELL_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#']

const spellScaleQ = (): QuizQuestion => {
  const key = rand(SPELL_KEYS)
  const ans = scaleNames(key, 'major')
  return {
    kind: 'spell',
    prompt: `Spell the **${p(key)} major** scale (7 notes, starting on ${p(key)}).`,
    answer: ans,
    play: playScale(key, 'major', pitchClass(key) >= 4 ? 2 : 3),
    explain: `Apply W W H W W W H from ${p(key)}, using every letter once: **${ans.map(p).join(' ')}**. Key signature: ${p(describeKeySignature(key))}.`
  }
}

const SIG_KEYS = [...CIRCLE_MAJOR]
const SIG_LABELS = [...new Set(SIG_KEYS.map(sigLabel))]

const keySigCountQ = (): QuizQuestion => {
  const key = rand(SIG_KEYS)
  const ans = sigLabel(key)
  const n = keySignature(key).count
  // keep distractors the same "kind" (sharps vs flats) so the answer isn't obvious
  const near = SIG_LABELS.filter((l) => l !== ans && (n > 0 ? !l.includes('flat') : n < 0 ? !l.includes('sharp') : true))
  return mc(`How many sharps or flats are in the key of **${p(key)} major**?`, ans, distractors(near, ans, 3), {
    explain: `${p(key)} major has **${p(describeKeySignature(key))}**.`
  })
}

const keySigStaffQ = (): QuizQuestion => {
  const key = rand(SIG_KEYS)
  const ans = `${p(key)} major`
  return mc('Which **major key** has this key signature?', ans, distractors(SIG_KEYS, key, 3).map((k) => `${p(k)} major`), {
    visual: { type: 'staff', keySig: key, notes: [], playable: false },
    explain: `${p(sigLabel(key) === 'No sharps or flats' ? 'No sharps or flats' : describeKeySignature(key))}: **${ans}**.${
      keySignature(key).count > 0
        ? ' For sharp keys, go up a half step from the last sharp.'
        : keySignature(key).count < -1
          ? ' For flat keys, the second-to-last flat names the key.'
          : ''
    }`
  })
}

const degreeQ = (): QuizQuestion => {
  const key = rand(SPELL_KEYS)
  const notes = scaleNames(key, 'major')
  const d = rand([1, 2, 3, 4, 5, 6])
  const ans = p(notes[d])
  const wrong = distractors(
    notes.filter((_, i) => i !== d),
    notes[d],
    3
  ).map(p)
  const useName = Math.random() < 0.4
  return mc(
    useName
      ? `What is the **${DEGREE_NAMES[d]}** (degree ${d + 1}) of ${p(key)} major?`
      : `What is the **${ORD[d]} degree** of ${p(key)} major?`,
    ans,
    wrong,
    { explain: `${p(key)} major: ${notes.map((n, i) => (i === d ? `**${p(n)}**` : p(n))).join(' ')}. Degree ${d + 1} (the ${DEGREE_NAMES[d]}) is **${ans}**.` }
  )
}

const ROOTS: FretPos[] = [
  { string: 6, fret: 0 },
  { string: 6, fret: 1 },
  { string: 6, fret: 3 },
  { string: 6, fret: 4 },
  { string: 5, fret: 0 },
  { string: 5, fret: 1 },
  { string: 5, fret: 3 },
  { string: 5, fret: 5 }
]

const fretboardDegreeQ = (): QuizQuestion => {
  const root = rand(ROOTS)
  const key = nameAt(root, true) // F, G, Ab, Bb, C, D, E, A
  const d = rand([1, 2, 3, 4, 5, 6])
  const semis = parseInterval(SCALES.major.intervals[d]).semitones
  const target = { string: root.string, fret: root.fret + semis }
  const note = scaleNames(key, 'major')[d]
  return {
    kind: 'fretboard',
    prompt: `The root of **${p(key)} major** is marked. Using W W H W W W H, click **degree ${d + 1}** on the **same string**.`,
    marks: [m(root.string, root.fret, p(key), 'root')],
    frets: [0, 16],
    targets: [target],
    explain: `Degree ${d + 1} is ${semis} frets above the root (${stepPattern('major').split(' ').slice(0, d).join(' ')}): ${root.string === 6 ? 'low E' : root.string === 5 ? 'A' : STRING_NAMES[root.string - 1]} string, fret ${target.fret}, the note **${p(note)}**.`
  }
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u4',
  number: 4,
  title: 'The major scale and keys',
  summary: 'The major scale formula, scale degrees, playing it in position, key signatures, the circle of fifths and relative minors.',
  lessons: [
    {
      id: 'u4l1',
      title: 'The major scale formula',
      summary: 'Whole, whole, half, whole, whole, whole, half: the pattern behind "do re mi".',
      blocks: [
        {
          type: 'text',
          md: `The **major scale** is the sound of "do re mi fa sol la ti do". It's the reference point for almost all Western theory: chords, intervals and other scales are all described by comparing them to it.

Every major scale follows the same pattern of **whole steps (W, 2 frets)** and **half steps (H, 1 fret)**:

**W  W  H  W  W  W  H**

Start on any note, follow the pattern, and you get that note's major scale.`
        },
        {
          type: 'table',
          headers: ['From', 'To', 'Step', 'Frets'],
          rows: (() => {
            const n = [...scaleNames('C', 'major'), 'C']
            const steps = stepPattern('major').split(' ')
            return steps.map((s, i) => [n[i], n[i + 1], s, s === 'W' ? '2' : '1'])
          })(),
          caption: 'C major: C D E F G A B C. The half steps fall between E–F and B–C, so C major has no sharps or flats.',
          toolExamples: [{ kind: 'scale', root: 'C', type: 'major' }],
        },
        {
          type: 'text',
          md: `### On one string
The clearest way to *see* the pattern is on a single string. Start at C on the A string (3rd fret) and walk up: 2 frets, 2 frets, 1 fret, 2, 2, 2, 1.`
        },
        {
          type: 'fretboard',
          marks: oneString('C', 5, 3, 15),
          frets: [2, 15],
          caption: 'C major on the A string, labelled by scale degree: 2-2-1-2-2-2-1 frets.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: oneString('G', 6, 3, 15),
          frets: [2, 15],
          caption: 'G major on the low E string. Same spacing, different starting note. The 7th degree lands on F♯.',
          playAll: true
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major', play: playScale('C', 'major', 3) },
            { label: 'G major', play: playScale('G', 'major', 2) },
            { label: 'G major up and down', play: playScale('G', 'major', 2, true) }
          ]
        },
        {
          type: 'text',
          md: `### Spelling rule: one of each letter
A major scale uses **every letter A–G exactly once**. That's how we decide between sharp and flat names. In D major the third note is **F♯**, not G♭. The next note is already a G, and we haven't used the letter F yet:

D  E  **F♯**  G  A  B  **C♯**`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Pick any note on the 6th or 5th string and play its major scale up the same string, saying "whole, whole, half…" as you go. When you can do it from any fret without thinking, the formula is yours.`
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'Spell the **D major** scale.', answer: scaleNames('D', 'major'), explain: `W W H W W W H from D: **${scaleStr('D')}**.` }
        }
      ]
    },
    {
      id: 'u4l2',
      title: 'Scale degrees and the pull of home',
      summary: 'Numbers and names for each note of the scale, and why the 7th wants to resolve.',
      blocks: [
        {
          type: 'text',
          md: `Each note of a scale has a **degree number** (1 to 7) and a traditional name. Numbers let us talk about *any* key at once: "the 5th degree" is G in C major, D in G major, E in A major.`
        },
        {
          type: 'table',
          headers: ['Degree', 'Name', 'In C', 'In G', 'In D'],
          rows: DEGREE_NAMES.map((name, i) => [String(i + 1), name, scaleNames('C', 'major')[i], scaleNames('G', 'major')[i], scaleNames('D', 'major')[i]])
        },
        {
          type: 'fretboard',
          marks: scaleMarks('C', 'major', { frets: [0, 3], label: 'degree' }),
          frets: [0, 5],
          caption: 'C major in open position, labelled by degree. The roots (1) are highlighted.',
          playAll: true
        },
        {
          type: 'text',
          md: `### Home and away
The **tonic** (1) is home. Every other degree has its own "pull":
- **5 (dominant)** is the strongest pillar after the tonic. Ending on it sounds like a question waiting for an answer.
- **7 (leading tone)** is only a half step below the tonic, and it really wants to **resolve** up to it.
- **4** tends to fall to **3**.

Listen to the scale stop on the 7th, and then finally reach home:`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Stops on 7 (unresolved)', play: { kind: 'notes', notes: [48, 50, 52, 53, 55, 57, 59], mode: 'arpeggio' } },
            { label: 'Resolves to 8 (home)', play: { kind: 'notes', notes: [48, 50, 52, 53, 55, 57, 59, 60], mode: 'arpeggio' } },
            { label: '7 → 1', play: { kind: 'notes', notes: [59, 60], mode: 'arpeggio' } },
            { label: '5 → 1', play: { kind: 'notes', notes: [55, 48], mode: 'arpeggio' } }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the **C major scale** in open position, from the C on the 5th string up to the next C.',
          targets: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'],
          hint: 'C is the 3rd fret of the 5th string, then D-E-F on the 4th string (open, 2, 3), G-A on the 3rd string (open, 2), and B-C on the 2nd string (open, 1).',
          show: [
            { string: 5, fret: 3 }, { string: 4, fret: 0 }, { string: 4, fret: 2 }, { string: 4, fret: 3 },
            { string: 3, fret: 0 }, { string: 3, fret: 2 }, { string: 2, fret: 0 }, { string: 2, fret: 1 }
          ],
          frets: [0, 5]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Degree numbers and interval names line up: in a major scale every degree is a **major** or **perfect** interval above the tonic (M2, M3, P4, P5, M6, M7). That's why later, when you see "♭3" or "♭7", you'll know it means "a half step lower than in the major scale".`
        },
        {
          type: 'tryIt',
          question: mc('What is the **5th degree** of G major?', 'D', ['C', 'E', 'B'], { explain: `G major: ${scaleStr('G')}. The 5th (dominant) is **D**.` })
        },
        {
          type: 'tryIt',
          question: mc('Which degree is called the **leading tone**?', '7', ['2', '4', '5'], { explain: 'Degree **7**, a half step below the tonic, "leads" back home.' })
        }
      ]
    },
    {
      id: 'u4l3',
      title: 'The major scale in position',
      summary: 'Two octaves of G major under one hand, plus the three-notes-per-string pattern.',
      blocks: [
        {
          type: 'text',
          md: `Playing up one string is great for understanding, but for real playing you want the scale **in position**: your hand stays put and you cross strings.

### G major, 2nd position
Put your 1st finger at the 2nd fret, one finger per fret (frets 2–5). Your 2nd finger plays the G root on the 6th string, 3rd fret. This pattern covers **two octaves**, from G on the 6th string to G on the 1st.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'major', { frets: [2, 5] }).map((x) => ({ ...x, label: x.label ? pretty(x.label) : x.label })),
          frets: [0, 7],
          caption: 'G major in 2nd position (frets 2–5). Roots highlighted.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'major', { frets: [2, 5], label: 'degree' }),
          frets: [0, 7],
          caption: 'The same pattern labelled by degree. Find the 3s, 5s and 7s around each root.'
        },
        {
          type: 'tab',
          caption: 'G major in 2nd position, two octaves ascending (G to G).',
          toolExamples: [{ kind: 'scale', root: 'G', type: 'major', frets: [2, 5] }],
          events: G_RUN.map((pos, i) => ({ pos: [pos], beats: i === G_RUN.length - 1 ? 1 : 0.5 })),
          bpm: 90
        },
        {
          type: 'text',
          md: `### Three notes per string
Another popular way to finger the major scale is **three notes per string (3NPS)**. Each string gets exactly three notes, which makes alternate picking very even and helps you move along the neck. It spans a wider stretch, so the hand shifts slightly as you climb.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'major', { box: 0, perString: 3 }),
          frets: [2, 9],
          caption: 'G major, three notes per string, starting from G on the 6th string. Notice the shift up a fret on the B string.',
          playAll: true
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Two octaves, up', play: { kind: 'notes', notes: G_RUN.map((x) => midiAt(x)), mode: 'arpeggio' } },
            { label: 'Up and back down', play: playScale('G', 'major', 2, true) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Practise the position with a metronome at 60 BPM, two notes per click, alternate picking (down-up). Always **start and end on a root** so your ear hears the scale as G major, not as a random string of notes.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 7],
            prompt: 'In the G major position (frets 2–5), select **every G** (the roots), then press Check.',
            marks: scaleMarks('G', 'major', { frets: [2, 5], label: 'none' }).map((x) => ({ ...x, color: 'tone' as const })),
            targets: [
              { string: 6, fret: 3 },
              { string: 4, fret: 5 },
              { string: 1, fret: 3 }
            ],
            explain: 'Three Gs: 6th string fret 3, 4th string fret 5, and 1st string fret 3. Two octaves of G.'
          }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 7],
            prompt: 'Now select every **7th degree (F♯)** in the same position.',
            marks: scaleMarks('G', 'major', { frets: [2, 5], label: 'none' }),
            targets: [
              { string: 6, fret: 2 },
              { string: 4, fret: 4 },
              { string: 1, fret: 2 }
            ],
            explain: 'The leading tone F♯ sits one fret **below** each G: 6th string fret 2, 4th string fret 4, 1st string fret 2.'
          }
        }
      ]
    },
    {
      id: 'u4l4',
      title: 'Keys and key signatures',
      summary: 'Why G major needs an F♯, how key signatures work, and the order of sharps and flats.',
      blocks: [
        {
          type: 'text',
          md: `A **key** is a scale used as home base. A song "in G major" uses mostly the notes of the G major scale, with G as its centre.

Apply W W H W W W H from different notes and you'll find each scale needs a different set of sharps or flats:
- **C major**: C D E F G A B. No sharps or flats.
- **G major**: G A B C D E **F♯**. One sharp.
- **F major**: F G A **B♭** C D E. One flat.

Rather than writing those accidentals on every note, music puts them once at the start of every line: the **key signature**.`
        },
        {
          type: 'staff',
          keySig: 'D',
          notes: ['D/4', 'E/4', 'F#/4', 'G/4', 'A/4', 'B/4', 'C#/5', 'D/5'].map((k) => ({ keys: [k], duration: 'q' })),
          bpm: 100,
          caption: 'D major: the key signature (F♯ and C♯) means every F and C is played sharp. No accidentals needed on the notes themselves.',
          toolExamples: [{ kind: 'scale', root: 'D', type: 'major' }],
        },
        {
          type: 'staff',
          keySig: 'F',
          notes: ['F/4', 'G/4', 'A/4', 'Bb/4', 'C/5', 'D/5', 'E/5', 'F/5'].map((k) => ({ keys: [k], duration: 'q' })),
          bpm: 100,
          caption: 'F major: one flat, B♭.',
          toolExamples: [{ kind: 'scale', root: 'F', type: 'major' }],
        },
        {
          type: 'table',
          headers: ['Key', 'Notes', 'Key signature'],
          rows: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].map((k) => [k + ' major', scaleNames(k, 'major').join(' '), describeKeySignature(k)])
        },
        {
          type: 'text',
          md: `### The order of sharps and flats
Sharps and flats are always added in the same order:
- **Sharps**: ${SHARP_ORDER.join(' ')} ("**F**ather **C**harles **G**oes **D**own **A**nd **E**nds **B**attle")
- **Flats**: ${FLAT_ORDER.join(' ')} (the same sentence backwards: "**B**attle **E**nds **A**nd **D**own **G**oes **C**harles' **F**ather")

So a key with three sharps always has F♯, C♯ and G♯, never some other three.

### Shortcuts for naming a key
- **Sharp keys**: go **up a half step from the last sharp**. Last sharp G♯ → key of **A**.
- **Flat keys**: the **second-to-last flat** is the key. Flats B♭ E♭ A♭ → key of **E♭**. (One flat = F major; just remember it.)`
        },
        {
          type: 'staff',
          keySig: 'C#',
          notes: [],
          playable: false,
          caption: 'All seven sharps (C♯ major): F C G D A E B.'
        },
        {
          type: 'staff',
          keySig: 'Cb',
          notes: [],
          playable: false,
          caption: 'All seven flats (C♭ major): B E A D G C F.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'D major (2♯)', play: playScale('D', 'major', 3) },
            { label: 'F major (1♭)', play: playScale('F', 'major', 2) },
            { label: 'E major (4♯)', play: playScale('E', 'major', 2) }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Guitar-friendly keys** are E, A, D, G and C (mostly sharp keys): they use lots of open strings and open chords. Horn players love flat keys (B♭, E♭, F). When a guitarist joins a horn section, a capo becomes your best friend.`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'How many sharps are in **A major**?', accept: ['3', 'three'], explain: `A major: ${scaleStr('A')}. **3 sharps**: F♯, C♯, G♯.` }
        },
        {
          type: 'tryIt',
          question: mc('A key signature has **four flats**. What major key is it?', 'A♭ major', ['E♭ major', 'D♭ major', 'B♭ major'], {
            visual: { type: 'staff', keySig: 'Ab', notes: [], playable: false },
            explain: 'Flats B♭ E♭ A♭ D♭. The second-to-last flat is **A♭**.'
          })
        }
      ]
    },
    {
      id: 'u4l5',
      title: 'The circle of fifths',
      summary: 'All twelve keys on one clock face, and how neighbouring keys relate.',
      blocks: [
        {
          type: 'text',
          md: `Arrange all twelve major keys so that each one is a **perfect 5th** above the last, and they form a circle:

**C → G → D → A → E → B → F♯/G♭ → D♭ → A♭ → E♭ → B♭ → F → C**

This is the **circle of fifths**, the most useful map in music theory.`
        },
        { type: 'circleOfFifths', highlight: 'G' },
        {
          type: 'text',
          md: `### Reading the circle
- **Clockwise** (up a 5th), each key adds **one sharp**: C (0) → G (1♯) → D (2♯) → A (3♯) …
- **Counter-clockwise** (up a 4th), each key adds **one flat**: C (0) → F (1♭) → B♭ (2♭) → E♭ (3♭) …
- At the bottom, the circle wraps around through **enharmonic** keys: F♯ major (6♯) sounds the same as G♭ major (6♭).
- The inner ring shows each key's **relative minor** (lesson 6).

### Neighbours are related
Keys next to each other share **six of their seven notes**. G major is just C major with F raised to F♯. That's why songs move easily between neighbouring keys.

And the two neighbours of any key are its **IV and V chords**, the most common chords in that key. Around C you'll find **F** and **G**: C, F and G are the three chords of a thousand songs.`
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.G, OPEN_CHORDS.C, OPEN_CHORDS.D],
          caption: 'G with its circle neighbours C (IV) and D (V). Click to hear each.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G – C – D – G', play: chordSeq([OPEN_CHORDS.G, OPEN_CHORDS.C, OPEN_CHORDS.D, OPEN_CHORDS.G], 2, 80, progressionExample('G', ['I', 'IV', 'V', 'I'], 'major', 80, 2)) },
            { label: 'C – F – G – C', play: chordSeq([OPEN_CHORDS.C, OPEN_CHORDS.F, OPEN_CHORDS.G, OPEN_CHORDS.C], 2, 80, progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 80, 2)) },
            { label: 'Round the circle: E – A – D – G – C', play: chordSeq([OPEN_CHORDS.E, OPEN_CHORDS.A, OPEN_CHORDS.D, OPEN_CHORDS.G, OPEN_CHORDS.C], 2, 90, progressionExample('C', ['III', 'VI', 'II', 'V', 'I'], 'major', 90, 2)) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**It's on your guitar already.** The open strings **E A D G** step **counter-clockwise** around the circle: each string is a 4th above the last. Chord progressions that move this way (E → A → D → G → C) sound strongly "forward-moving"; you'll study why in the unit on diatonic chords.`
        },
        {
          type: 'tryIt',
          question: mc('Which major key has **three flats**?', 'E♭ major', ['A♭ major', 'B♭ major', 'A major'], {
            explain: 'Counter-clockwise from C: F (1♭), B♭ (2♭), **E♭ (3♭)**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Moving one step **clockwise** from D on the circle takes you to…', 'A', ['G', 'E', 'B♭'], {
            explain: 'Clockwise = up a perfect 5th. D → **A** (D major has 2♯, A major has 3♯).'
          })
        }
      ]
    },
    {
      id: 'u4l6',
      title: 'Relative minor keys',
      summary: 'Same notes, different home: every major key has a minor twin.',
      blocks: [
        {
          type: 'text',
          md: `Play the notes of C major, but start and finish on **A** instead of C: A B C D E F G A. Same seven notes, but now it sounds darker. You're playing the **A natural minor** scale.

A is the **6th degree** of C major, and **A minor is the relative minor of C major**. They share the same key signature (no sharps or flats).

**Every major key has a relative minor**, built on its 6th degree, which is also **3 half steps (a minor 3rd) below** the major tonic.`
        },
        {
          type: 'fretboard',
          marks: scalePositions('C', 'major', 0, 3).map((x) => {
            const n = nameAt(x, false)
            return m(x.string, x.fret, n, n === 'C' ? 'root' : n === 'A' ? 'accent' : 'tone')
          }),
          frets: [0, 5],
          caption: 'The notes of C major in open position. Make C (orange) home and it’s C major; make A (teal) home and it’s A minor.',
          toolExamples: [{ kind: 'scale', root: 'C', type: 'major', frets: [0, 3] }, { kind: 'scale', root: 'A', type: 'naturalMinor', frets: [0, 3] }]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major scale', play: playScale('C', 'major', 3) },
            { label: 'A natural minor scale', play: playScale('A', 'naturalMinor', 2) }
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C – Am – F – G – C (home: C)', play: chordSeq([OPEN_CHORDS.C, OPEN_CHORDS.Am, OPEN_CHORDS.F, OPEN_CHORDS.G, OPEN_CHORDS.C], 2, 80, progressionExample('C', ['I', 'vi', 'IV', 'V', 'I'], 'major', 80, 2)) },
            { label: 'Am – G – F – G – Am (home: Am)', play: chordSeq([OPEN_CHORDS.Am, OPEN_CHORDS.G, OPEN_CHORDS.F, OPEN_CHORDS.G, OPEN_CHORDS.Am], 2, 80, progressionExample('A', ['i', 'bVII', 'bVI', 'bVII', 'i'], 'naturalMinor', 80, 2)) }
          ]
        },
        {
          type: 'text',
          md: `### Finding the relative minor on the neck
From any major root on the 6th or 5th string, go **down 3 frets on the same string**:
- G major (6th string, 3rd fret) → **E minor** (open 6th string)
- C major (5th string, 3rd fret) → **A minor** (open 5th string)
- A major (6th string, 5th fret) → **F♯ minor** (6th string, 2nd fret)`
        },
        {
          type: 'fretboard',
          marks: [m(6, 3, 'G', 'root'), m(6, 0, 'Em', 'accent'), m(5, 3, 'C', 'root'), m(5, 0, 'Am', 'accent'), m(6, 5, 'A', 'root'), m(6, 2, 'F♯m', 'accent')],
          frets: [0, 7],
          caption: 'Major roots (orange) and their relative minors (teal), three frets lower on the same string.'
        },
        {
          type: 'table',
          headers: ['Major key', 'Relative minor', 'Key signature'],
          rows: ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'].map((k) => [k + ' major', relativeMinor(k) + ' minor', describeKeySignature(k)])
        },
        { type: 'circleOfFifths', highlight: 'Am' },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.C, OPEN_CHORDS.Am, OPEN_CHORDS.G, OPEN_CHORDS.Em],
          caption: 'Two relative pairs you already play: C & Am, G & Em.'
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `How do you know whether a song is in C major or A minor if they share notes? Listen for **home**: which chord feels like the resting point, especially at the end? Songs usually start or end on their tonic chord. You'll go deeper into minor keys in a later unit.`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'What is the relative minor of **G major**?', accept: ['E minor', 'Em', 'E', 'E min', 'Emin', 'Eminor', 'E m'], explain: 'The 6th degree of G major is **E**: E minor shares G’s one sharp (F♯).' }
        },
        {
          type: 'tryIt',
          question: mc('Listen. Does this progression feel like it’s in a **major** or a **minor** key?', 'Minor', ['Major'], {
            play: chordSeq([OPEN_CHORDS.Am, OPEN_CHORDS.G, OPEN_CHORDS.F, OPEN_CHORDS.G, OPEN_CHORDS.Am], 2, 80, progressionExample('A', ['i', 'bVII', 'bVI', 'bVII', 'i'], 'naturalMinor', 80, 2)),
            explain: 'It starts and ends on **Am**, so A minor is home, even though every chord comes from C major.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('What is the step pattern of the major scale?', 'W W H W W W H', ['W H W W H W W', 'W W W H W W H', 'H W W W H W W'], {
        explain: 'Whole, whole, **half**, whole, whole, whole, **half**.'
      }),
      { kind: 'spell', prompt: 'Spell the **A major** scale.', answer: scaleNames('A', 'major'), explain: `**${scaleStr('A')}**: three sharps.` },
      { kind: 'spell', prompt: 'Spell the **B♭ major** scale.', answer: scaleNames('Bb', 'major'), explain: `**${scaleStr('Bb')}**: two flats.` },
      mc('How many sharps are in **E major**?', '4', ['2', '3', '5'], { explain: 'E major: E F♯ G♯ A B C♯ D♯. **4 sharps**: F♯ C♯ G♯ D♯.' }),
      mc('Which major key has **one flat**?', 'F major', ['B♭ major', 'G major', 'D minor'], { explain: '**F major**: F G A B♭ C D E. (D minor shares it, but it’s a minor key.)' }),
      {
        kind: 'spell',
        prompt: 'Type the **order of sharps** (seven letters separated by spaces).',
        answer: [...SHARP_ORDER],
        explain: '**F C G D A E B**: "Father Charles Goes Down And Ends Battle".'
      },
      mc('Moving **clockwise** around the circle of fifths, each new key is…', 'a perfect 5th higher, with one more sharp (or one fewer flat)', [
        'a perfect 4th higher, with one more flat',
        'a half step higher',
        'the relative minor of the last'
      ]),
      mc('A key signature has **F♯, C♯ and G♯**. Which major key is it?', 'A major', ['B major', 'E major', 'D major'], {
        explain: 'Last sharp G♯, up a half step: **A major**.'
      }),
      mc('Which major key has this key signature?', 'D major', ['G major', 'A major', 'B♭ major'], {
        visual: { type: 'staff', keySig: 'D', notes: [], playable: false },
        explain: 'Two sharps, F♯ and C♯. Up a half step from C♯: **D major**.'
      }),
      { kind: 'text', prompt: 'What is the relative minor of **C major**?', accept: ['A minor', 'Am', 'A', 'A min', 'Amin', 'Aminor', 'A m'], explain: '**A minor**: the 6th degree of C major, with no sharps or flats.' },
      mc('What is the **5th degree** (dominant) of **D major**?', 'A', ['G', 'B', 'F♯'], { explain: `D major: ${scaleStr('D')}. The dominant is **A**.` }),
      mc('Which pair shares the same key signature?', 'G major and E minor', ['G major and G minor', 'C major and C minor', 'D major and A minor'], {
        explain: 'E is the 6th degree of G: E minor is G major’s **relative minor** (one sharp).'
      }),
      {
        kind: 'fretboard',
        mode: 'all',
        frets: [0, 7],
        prompt: 'This is G major in 2nd position. Select every **7th degree (leading tone)**, then press Check.',
        marks: scaleMarks('G', 'major', { frets: [2, 5], label: 'none' }),
        targets: [
          { string: 6, fret: 2 },
          { string: 4, fret: 4 },
          { string: 1, fret: 2 }
        ],
        explain: 'The leading tone of G is **F♯**, one fret below each root: 6th string fret 2, 4th string fret 4, 1st string fret 2.'
      },
      mc('Listen. Is this a **major** scale or a **natural minor** scale?', 'Natural minor', ['Major'], {
        play: playScale('A', 'naturalMinor', 2),
        explain: 'A natural minor: the ♭3 near the start gives it the darker sound.'
      }),
      mc('Listen. The scale stops early. Which degree does it stop on?', '7 (leading tone)', ['5 (dominant)', '6', '8 (tonic)'], {
        play: { kind: 'notes', notes: [48, 50, 52, 53, 55, 57, 59], mode: 'arpeggio' },
        explain: 'It stops on **7**, the leading tone, a half step below home. That’s why it sounds unfinished.'
      }),
      mc('Listen. Does this progression sound like it’s in a **major** or a **minor** key?', 'Major', ['Minor'], {
        play: chordSeq([OPEN_CHORDS.G, OPEN_CHORDS.C, OPEN_CHORDS.D, OPEN_CHORDS.G], 2, 80, progressionExample('G', ['I', 'IV', 'V', 'I'], 'major', 80, 2)),
        explain: 'G – C – D – G: home is **G major**, with its circle neighbours C (IV) and D (V).'
      })
    ],
    generators: [spellScaleQ, keySigCountQ, keySigStaffQ, degreeQ, fretboardDegreeQ]
  }
}

export default unit
