import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { chordToneMarks, m, mc, rand, shuffle, strum } from '../helpers'
import type { ToolExample } from '../toolExamples'
import {
  CAGED_ORDER,
  CagedForm,
  cagedSequence,
  cagedShape,
  ChordShape,
  FretPos,
  movableChord,
  nameAt,
  OPEN_CHORDS,
  pcAt,
  shape,
  shapeMidis,
  shapePositions
} from '@/theory/guitar'
import { chordSymbol } from '@/theory/chords'
import { mod, pitchClass, pretty } from '@/theory/notes'

// ---------- local helpers ----------

const TONE_LABEL: Record<number, string> = { 0: 'R', 3: '♭3', 4: '3', 7: '5' }

/** Shape marks labelled R / 3 / ♭3 / 5, roots coloured. */
function toneMarks(sh: ChordShape, root: string): FretMark[] {
  const r = pitchClass(root)
  return shapePositions(sh).map((p) => ({
    ...p,
    label: TONE_LABEL[mod(pcAt(p) - r, 12)] ?? '?',
    color: pcAt(p) === r ? 'root' : 'tone'
  }))
}

/** A strummed run through several shapes. */
const seq = (shapes: ChordShape[], beats = 2, bpm = 80, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: shapes.map((s) => ({ notes: shapeMidis(s), beats, mode: 'strum' as const }))
})

const named = (sh: ChordShape, name: string): ChordShape => ({ ...sh, name })
const hidden = (sh: ChordShape): ChordShape => ({ ...sh, name: '?' })

const minFret = (sh: ChordShape) => Math.min(...(sh.frets.filter((f) => f !== null) as number[]))
const maxFret = (sh: ChordShape) => Math.max(...(sh.frets.filter((f) => f !== null) as number[]))
const windowFor = (sh: ChordShape): [number, number] => {
  const lo = Math.max(0, minFret(sh) - 1)
  return [lo, Math.max(lo + 5, maxFret(sh) + 1)]
}

/** Which strings hold the root in each CAGED form. */
const ROOT_STRINGS: Record<CagedForm, number[]> = {
  C: [5, 2],
  A: [5, 3],
  G: [6, 3, 1],
  E: [6, 4, 1],
  D: [4, 2]
}
const stringList = (ss: number[]) => ss.map((s) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][s]).join(', ')

// ---------- shapes used in lessons ----------

const E_BARRES = [OPEN_CHORDS.E, movableChord('F', 'maj', 6)!, movableChord('G', 'maj', 6)!, movableChord('A', 'maj', 6)!]
const E_MINOR_BARRES = [OPEN_CHORDS.Em, movableChord('F', 'min', 6)!, movableChord('G', 'min', 6)!, movableChord('A', 'min', 6)!]
const A_BARRES = [OPEN_CHORDS.A, movableChord('Bb', 'maj', 5)!, movableChord('C', 'maj', 5)!, movableChord('D', 'maj', 5)!]
const A_MINOR_BARRES = [OPEN_CHORDS.Am, movableChord('B', 'min', 5)!, movableChord('C', 'min', 5)!, movableChord('D', 'min', 5)!]

const C_SEQ = cagedSequence('C')
const G_SEQ = cagedSequence('G')
const C_SHAPES = C_SEQ.map((x) => x.shape)

// A minor in five minor-CAGED forms, up the neck
const AM_CAGED: { form: string; shape: ChordShape }[] = [
  { form: 'Am shape (open)', shape: named(OPEN_CHORDS.Am, 'Am (Am shape)') },
  { form: 'Gm shape', shape: shape('Am (Gm shape)', '532215') },
  { form: 'Em shape', shape: shape('Am (Em shape)', '577555', undefined, 5) },
  { form: 'Dm shape', shape: shape('Am (Dm shape)', 'x x 7 9 10 8') },
  { form: 'Cm shape', shape: shape('Am (Cm shape)', 'x 12 10 9 10 8') }
]

// ---------- generated questions ----------

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'F#', 'Ab']

const identifyCagedShape = (): QuizQuestion => {
  const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb'])
  const form = rand(CAGED_ORDER)
  const sh = cagedShape(root, form)
  return mc(`This is a **${root}** major chord. Which CAGED shape is it?`, `${form} shape`, CAGED_ORDER.map((f) => `${f} shape`), {
    visual: { type: 'chords', shapes: [hidden(sh)], caption: `${pretty(root)} major somewhere on the neck.` },
    explain: `${
      mod(pitchClass(root) - pitchClass(form), 12) === 0
        ? `It's the open **${form}** chord itself`
        : `It's the open **${form}** chord moved up ${mod(pitchClass(root) - pitchClass(form), 12)} fret${mod(pitchClass(root) - pitchClass(form), 12) === 1 ? '' : 's'}`
    }: ${sh.frets
      .map((f) => (f === null ? 'x' : f))
      .join(' ')}. Its roots are on the ${stringList(ROOT_STRINGS[form])} strings.`
  })
}

const nameBarreChord = (): QuizQuestion => {
  const rootString = rand([5, 6] as const)
  const type = rand(['maj', 'maj', 'min'] as const)
  const pool = ROOTS.filter((r) => !(rootString === 6 && r === 'E') && !(rootString === 5 && r === 'A'))
  const root = rand(pool)
  const sh = movableChord(root, type, rootString)!
  const correct = chordSymbol(root, type)
  const wrongRoots = shuffle(pool.filter((r) => pitchClass(r) !== pitchClass(root))).slice(0, 2)
  const wrong = [...wrongRoots.map((r) => chordSymbol(r, type)), chordSymbol(root, type === 'maj' ? 'min' : 'maj')]
  return mc('Name this barre chord.', correct, wrong, {
    visual: { type: 'chords', shapes: [hidden(sh)] },
    play: strum(sh),
    explain: `It's an **${rootString === 6 ? 'E' : 'A'}-shape ${type === 'maj' ? 'major' : 'minor'}** barre chord with its root on the ${rootString}th string at fret ${sh.frets[6 - rootString]}. Fret ${sh.frets[6 - rootString]} of the ${
      rootString === 6 ? 'low E' : 'A'
    } string is **${nameAt({ string: rootString, fret: sh.frets[6 - rootString]! }, root.includes('b'))}**, so the chord is **${correct}**.`
  })
}

const findBarreRoot = (): QuizQuestion => {
  const rootString = rand([5, 6] as const)
  const pool = ROOTS.filter((r) => !(rootString === 6 && r === 'E') && !(rootString === 5 && r === 'A'))
  const root = rand(pool)
  const type = rand(['maj', 'min'] as const)
  const sh = movableChord(root, type, rootString)!
  const target: FretPos = { string: rootString, fret: sh.frets[6 - rootString]! }
  return {
    kind: 'fretboard',
    frets: [0, 12],
    prompt: `You want **${chordSymbol(root, type)}** as an **${rootString === 6 ? 'E' : 'A'}-shape** barre chord. Click the fret where its root goes (the barre fret on the ${rootString}th string).`,
    targets: [target],
    explain: `${root} on the ${rootString === 6 ? 'low E' : 'A'} string is at **fret ${target.fret}**. Barre there and play the ${rootString === 6 ? 'E' : 'A'}${type === 'min' ? 'm' : ''} shape: ${sh.frets
      .map((f) => (f === null ? 'x' : f))
      .join(' ')}.`
  }
}

const nextShapeUp = (): QuizQuestion => {
  const root = rand(['C', 'D', 'E', 'G', 'A'])
  const seqs = cagedSequence(root)
  const i = Math.floor(Math.random() * 4) // not the last one, so "next" is also higher on the neck
  const cur = seqs[i]
  const next = seqs[i + 1]
  return mc(
    `You're playing **${root}** major with the **${cur.form} shape** ${minFret(cur.shape) === 0 ? 'in open position' : `around fret ${minFret(cur.shape)}`}. Which CAGED shape gives you the next ${root} chord higher up the neck?`,
    `${next.form} shape`,
    CAGED_ORDER.filter((f) => f !== cur.form).map((f) => `${f} shape`),
    {
      visual: { type: 'chords', shapes: [cur.shape, hidden(next.shape)] },
      explain: `The order is always **C → A → G → E → D → C…**. After the ${cur.form} shape comes the **${next.form} shape**, starting around fret ${minFret(next.shape)}.`
    }
  )
}

const rootStringsOfShape = (): QuizQuestion => {
  const form = rand(CAGED_ORDER)
  const correct = stringList(ROOT_STRINGS[form])
  const wrong = CAGED_ORDER.filter((f) => f !== form).map((f) => stringList(ROOT_STRINGS[f]))
  return mc(`In the **${form} shape**, which strings carry the root?`, correct, wrong, {
    explain: `Look at the open ${form} chord: the root ${form} is on the **${correct}** strings. Those positions move with the shape wherever you play it.`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u6',
  number: 6,
  title: 'The CAGED system',
  summary: 'Barre chords from the E and A shapes, the five CAGED shapes of one chord, how they link up the neck, and using them to find chords and arpeggios anywhere.',
  lessons: [
    // ------------------------------------------------------------------
    {
      id: 'u6l1',
      title: 'Movable chords: the E-shape barre',
      summary: 'Your index finger becomes a moving nut.',
      blocks: [
        {
          type: 'text',
          md: `An open E chord is a pattern of intervals: **R 5 R 3 5 R**. Those intervals depend only on the *distances between the frets you press*, not on where the shape sits on the neck.

The open strings are the problem: they're stuck at the nut. The solution is the **barre**. Lay your index finger flat across all six strings and it does the job of the nut. Re-finger the E shape with your other three fingers just above it, and the whole chord can slide anywhere.

Move the E shape up **one fret** and every note goes up a half step: E becomes **F**.`
        },
        {
          type: 'fretboard',
          marks: toneMarks(OPEN_CHORDS.E, 'E'),
          frets: [0, 5],
          caption: 'Open E: R 5 R 3 5 R. The open strings are part of the shape.'
        },
        {
          type: 'fretboard',
          marks: toneMarks(E_BARRES[1], 'F'),
          frets: [0, 5],
          caption: 'F (E shape, barre at fret 1): the same R 5 R 3 5 R, all one fret higher.'
        },
        {
          type: 'chords',
          shapes: E_BARRES,
          caption: 'E, then the E shape barred at frets 1, 3 and 5: F, G and A.'
        },
        {
          type: 'audio',
          label: 'E – F – G – A (one shape, sliding up)',
          play: seq(E_BARRES, 2, 80)
        },
        {
          type: 'text',
          md: `### The root is on the 6th string
In the E shape, the lowest note (6th string, under your barre) is the **root**. So the chord is named by whatever note you're barring on the low E string. This is why [[u1l3]] asked you to learn the 6th-string notes: they're the names of all your E-shape barre chords.`
        },
        {
          type: 'fretboard',
          marks: [0, 1, 3, 5, 7, 8, 10, 12].map((f) => m(6, f, nameAt({ string: 6, fret: f }, false), 'root')),
          frets: [0, 12],
          caption: 'Natural notes on the 6th string: the barre frets for the E-shape chords E, F, G, A, B, C, D and (at the 12th fret) E again.'
        },
        {
          type: 'text',
          md: `### Minor, too
The open **Em** shape (R 5 R ♭3 5 R) moves exactly the same way. Barre it at fret 1 and you get **Fm**, at fret 3 **Gm**, at fret 5 **Am**. The only difference from the major barre is your 2nd finger lifting off the 3rd string, exactly like E → Em.`
        },
        {
          type: 'chords',
          shapes: E_MINOR_BARRES,
          caption: 'Em, then Fm, Gm and Am as E-shape minor barre chords.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G (E shape, 3rd fret)', play: strum(E_BARRES[2]) },
            { label: 'Gm (Em shape, 3rd fret)', play: strum(E_MINOR_BARRES[2]) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Barre chord technique:** roll your index finger slightly onto its bony edge, keep it just behind the fret, and pull back gently with your arm rather than squeezing with your thumb. It's normal for a barre to buzz for the first couple of weeks.`
        },
        {
          type: 'tryIt',
          question: mc('Which fret do you barre to play **A major** with the E shape?', '5', ['3', '7', '2'], {
            explain: 'A is at the **5th fret** of the low E string, so the A chord in the E shape is 5 7 7 6 5 5.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            frets: [0, 12],
            prompt: 'Click where you would barre a **B♭** chord using the E shape (its root on the 6th string).',
            targets: [{ string: 6, fret: 6 }],
            explain: 'B♭ is at the **6th fret** of the low E string (one fret above A at the 5th).'
          }
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u6l2',
      title: 'The A-shape barre',
      summary: 'A second movable shape with its root on the 5th string.',
      blocks: [
        {
          type: 'text',
          md: `The open **A** chord moves just like E. Its intervals are **x R 5 R 3 5**, with the root on the **5th string**. Barre the index finger across strings 5 to 1 and fret the rest of the shape two frets higher. Many players flatten their 3rd finger across strings 4, 3 and 2 instead of using three fingers.

Move it up to fret 1 for **B♭**, fret 3 for **C**, fret 5 for **D**.`
        },
        {
          type: 'fretboard',
          marks: toneMarks(A_BARRES[2], 'C'),
          frets: [0, 6],
          caption: 'C (A shape, 3rd fret): x R 5 R 3 5. Roots on the 5th and 3rd strings.'
        },
        {
          type: 'chords',
          shapes: A_BARRES,
          caption: 'A, then the A shape barred at frets 1, 3 and 5: B♭, C and D.'
        },
        {
          type: 'audio',
          label: 'A – B♭ – C – D',
          play: seq(A_BARRES, 2, 80)
        },
        {
          type: 'text',
          md: `### A-shape minor
The open **Am** shape (x R 5 R ♭3 5) gives you minor chords with a 5th-string root. Barre it at fret 2 and you have **Bm**, the chord most beginners meet as their first barre. At fret 3 it's **Cm**, and at fret 5 it's **Dm**.`
        },
        {
          type: 'chords',
          shapes: A_MINOR_BARRES,
          caption: 'Am, then Bm, Cm and Dm as A-shape minor barre chords.'
        },
        {
          type: 'text',
          md: `### Two shapes, every chord, twice
With the E shape (6th-string root) and the A shape (5th-string root), you can play **every major and minor chord in two places**. Pick whichever is closer to the chord before it. For example, **C**:
- A shape at the **3rd fret** (root on the 5th string)
- E shape at the **8th fret** (root on the 6th string)`
        },
        {
          type: 'chords',
          shapes: [named(movableChord('C', 'maj', 5)!, 'C (A shape)'), named(movableChord('C', 'maj', 6)!, 'C (E shape)')],
          caption: 'The same C major chord in two places.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C (A shape, 3rd fret)', play: strum(movableChord('C', 'maj', 5)!) },
            { label: 'C (E shape, 8th fret)', play: strum(movableChord('C', 'maj', 6)!) }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Economy of motion.** A progression like G – C – D can be played G (E shape, 3rd fret), C (A shape, 3rd fret), D (A shape, 5th fret) without your hand moving more than two frets.`
        },
        {
          type: 'tab',
          bpm: 90,
          notation: false,
          caption: 'G – C – D – G with barre chords, all near the 3rd fret.',
          events: [
            { pos: shapePositions(E_BARRES[2]), beats: 2 },
            { pos: shapePositions(A_BARRES[2]), beats: 2 },
            { pos: shapePositions(A_BARRES[3]), beats: 2 },
            { pos: shapePositions(E_BARRES[2]), beats: 2 }
          ]
        },
        {
          type: 'tryIt',
          question: mc('An A-shape **major** barre chord at the **5th fret** is…', 'D major', ['A major', 'C major', 'E major'], {
            explain: 'The A shape takes its name from the 5th string. Fret 5 on the A string is **D**.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 6],
            prompt: 'This is C major in the A shape. Select **both roots**, then press Check.',
            marks: shapePositions(A_BARRES[2]).map((p) => ({ ...p, color: 'ghost' as const })),
            targets: [{ string: 5, fret: 3 }, { string: 3, fret: 5 }],
            explain: 'The C notes are the **5th string, 3rd fret** and the **3rd string, 5th fret**: the same places as the A roots in the open A chord.'
          }
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u6l3',
      title: 'Five shapes, one chord',
      summary: 'C, A, G, E and D shapes all playing the same C major chord.',
      blocks: [
        {
          type: 'text',
          md: `If E and A shapes can move, so can **C, G and D**. Take all five open major chord shapes (**C, A, G, E, D**) and move each one so it plays a **C** chord. Something remarkable happens: they line up end to end and cover the whole neck.

That's the **CAGED system**. It isn't a new set of chords to memorise. It's the five open shapes you already know, used as a map of the fretboard.`
        },
        {
          type: 'chords',
          shapes: C_SHAPES,
          caption: 'C major five ways: C shape (open), A shape (3rd fret), G shape (5th), E shape (8th), D shape (10th).'
        },
        {
          type: 'audio',
          label: 'C major in all five shapes, low to high',
          play: seq(C_SHAPES, 2, 70, { kind: 'chord', root: 'C', type: 'maj' })
        },
        {
          type: 'text',
          md: `### Every C, E and G on the neck
Here are all the notes of the C major triad from the nut to the 15th fret. Each CAGED shape is just a small window onto this map.`
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('C', 'maj', [0, 15]),
          frets: [0, 15],
          caption: 'C major chord tones (1 = C, 3 = E, 5 = G) across the neck.',
          playAll: true
        },
        ...C_SEQ.map(
          (x): { type: 'fretboard'; marks: FretMark[]; frets: [number, number]; caption: string } => ({
            type: 'fretboard',
            marks: toneMarks(x.shape, 'C'),
            frets: windowFor(x.shape),
            caption: `C major, ${x.form} shape: ${x.shape.frets.map((f) => (f === null ? 'x' : f)).join(' ')}. Roots on the ${stringList(ROOT_STRINGS[x.form])} strings.`
          })
        ),
        {
          type: 'tip',
          tone: 'warning',
          md: `**Not every shape is comfortable as a full chord.** The moved **G shape** (8 7 5 5 5 8 for C) and the moved **D shape** (x x 10 12 13 12) are big stretches. Guitarists mostly play *parts* of them: a 3- or 4-string fragment, or the notes one at a time as an arpeggio. The value of CAGED is the **map**, not five barre chords.`
        },
        {
          type: 'tryIt',
          question: mc('Going up the neck, which shape comes after the **E shape**?', 'D shape', ['C shape', 'G shape', 'A shape'], {
            explain: 'The order is in the name: C → A → G → **E → D**, then back to C.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which shape is this C chord?', 'G shape', ['E shape', 'A shape', 'D shape'], {
            visual: { type: 'chords', shapes: [hidden(cagedShape('C', 'G'))] },
            explain: 'Roots on the 6th, 3rd and 1st strings with the 3rd on the 5th string: that\'s the open **G** chord moved up 5 frets.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u6l4',
      title: 'How the shapes link up',
      summary: 'Neighbouring shapes share notes, and the order never changes.',
      blocks: [
        {
          type: 'text',
          md: `The shapes don't just sit next to each other: **neighbouring shapes overlap**. The right-hand edge of one shape uses the same notes as the left-hand edge of the next. For C:
- **C shape → A shape**: both use the C on the 5th string, 3rd fret.
- **A shape → G shape**: the A shape's notes at the 5th fret on strings 4, 3 and 2 (G, C, E) are the middle of the G shape.
- **G shape → E shape**: the G shape's roots on the 6th and 1st strings at fret 8 are the E shape's barre.
- **E shape → D shape**: the E shape's 4th-string root (fret 10) is the D shape's root.
- **D shape → C shape**: the D shape's notes on strings 3, 2 and 1 (frets 12, 13, 12) are the top of the C shape at the 12th fret, one octave above the open C.

The order is always **C – A – G – E – D**, then back to C. Only the starting shape changes with the key.`
        },
        {
          type: 'table',
          headers: ['Shape', 'Root strings', 'C major at', 'G major at'],
          rows: CAGED_ORDER.map((f) => {
            const c = cagedShape('C', f)
            const g = cagedShape('G', f)
            return [`${f} shape`, stringList(ROOT_STRINGS[f]), `fret ${minFret(c)}`, `fret ${minFret(g)}`]
          }),
          caption: '“At” means the lowest fret the shape uses. G starts with its open G shape, so its order is G – E – D – C – A.'
        },
        {
          type: 'chords',
          shapes: G_SEQ.map((x) => x.shape),
          caption: 'G major up the neck: G shape (open), E shape (3rd fret), D shape (5th), C shape (7th), A shape (10th).'
        },
        {
          type: 'audio',
          label: 'G major through all five shapes',
          play: seq(G_SEQ.map((x) => x.shape), 2, 70, { kind: 'chord', root: 'G', type: 'maj' })
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('G', 'maj', [0, 15]),
          frets: [0, 15],
          caption: 'G major chord tones across the neck. Find each of the five shapes inside this map.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Why does it work?** A major triad has only three notes, and on each string they sit in a fixed pattern: 1, 3 and 5 are 4, 3 and 5 frets apart. Each CAGED shape is a 3–4 fret slice of that pattern, and each slice starts where the last one's top edge left off. Five slices, overlapping by a fret or so, add up to 12 frets, and then the pattern repeats an octave higher.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            frets: [0, 8],
            prompt: 'Here is **G major in the E shape** (3rd fret). Click the root on the **4th string**.',
            marks: shapePositions(cagedShape('G', 'E')).map((p) => ({ ...p, color: 'ghost' as const })),
            targets: [{ string: 4, fret: 5 }],
            explain: 'The E shape has roots on the 6th, 4th and 1st strings. On the 4th string it is the **5th fret** (G), and that root is also the root of the next shape up, the D shape.'
          }
        },
        {
          type: 'tryIt',
          question: mc('In the key of **A**, the open A chord is the A shape. Which shape comes next up the neck?', 'G shape', ['E shape', 'C shape', 'D shape'], {
            explain: 'After A comes **G** in C-A-G-E-D. A major in the G shape is 5 4 2 2 2 5.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u6l5',
      title: 'Minor CAGED',
      summary: 'Lower the 3rd in each shape and you have the minor system.',
      blocks: [
        {
          type: 'text',
          md: `Every CAGED shape has a minor twin: find the **3rd** in the shape and lower it one fret. You already know three of the minor forms as open chords (**Am, Em, Dm**). The minor C and G forms aren't comfortable full chords, but they're still useful as maps and arpeggio fingerings.

Here is **A minor** in all five minor shapes, up the neck. The order is the same: C – A – G – E – D (starting here from the Am shape).`
        },
        {
          type: 'chords',
          shapes: AM_CAGED.map((x) => x.shape),
          caption: 'A minor up the neck: Am shape (open), Gm shape (frets 1–5), Em shape (5th), Dm shape (7th), Cm shape (frets 8–12).'
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('A', 'min', [0, 13]),
          frets: [0, 13],
          caption: 'A minor chord tones (1 = A, ♭3 = C, 5 = E) across the neck.',
          playAll: true
        },
        {
          type: 'text',
          md: `### The three you'll use most
In real playing, the three workhorse minor shapes are:
1. **Em shape** barre (root on the 6th string): 5 7 7 5 5 5 for Am
2. **Am shape** barre (root on the 5th string): x 12 14 14 13 12 for Am, or x 0 2 2 1 0 open
3. **Dm shape** on the top four strings (root on the 4th string): x x 7 9 10 8 for Am`
        },
        {
          type: 'fretboard',
          marks: toneMarks(AM_CAGED[2].shape, 'A'),
          frets: [4, 9],
          caption: 'Am, Em shape at the 5th fret: R 5 R ♭3 5 R.'
        },
        {
          type: 'fretboard',
          marks: toneMarks(AM_CAGED[3].shape, 'A'),
          frets: [6, 11],
          caption: 'Am, Dm shape at the 7th fret: R 5 R ♭3.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A (E shape)', play: strum(movableChord('A', 'maj', 6)!) },
            { label: 'Am (Em shape)', play: strum(movableChord('A', 'min', 6)!) },
            { label: 'A minor, all five shapes', play: seq(AM_CAGED.map((x) => x.shape), 2, 70, { kind: 'chord', root: 'A', type: 'min' }) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Major ↔ minor drill:** play any CAGED shape, find its 3rd (or 3rds), lower them one fret and listen to the change. Then go back. This one-fret move works in every shape, everywhere on the neck.`
        },
        {
          type: 'tryIt',
          question: mc('To change an **E-shape major** barre chord into minor, you…', 'lower the 3rd on the 3rd string by one fret', [
            'lower the root on the 6th string by one fret',
            'raise the 5th on the 5th string by one fret',
            'remove the barre'
          ], {
            explain: 'In the E shape the 3rd is on the **3rd string** (one fret above the barre). Lower it to the barre fret and the chord is minor.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u6l6',
      title: 'Using CAGED: chords and arpeggios anywhere',
      summary: 'Find any chord in any position, and turn shapes into arpeggios and melodies.',
      blocks: [
        {
          type: 'text',
          md: `### Finding a chord in any position
Suppose you're playing around the **5th fret** and need a **D** chord. Ask: *which shape puts a D root near here?*
1. Find nearby D roots: **5th string, 5th fret**, **3rd string, 7th fret** and **2nd string, 3rd fret**…
2. A root on the 5th string → **A shape** or **C shape**.
3. At the 5th fret, the A shape fits: x 5 7 7 7 5.

Do the same for any chord in any position. Within a few frets of anywhere there's always one of the five shapes.`
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('D', 'maj', [2, 8]),
          frets: [2, 8],
          caption: 'D major chord tones between frets 2 and 8: you can see the C shape (frets 2–5) and the A shape (5–7).',
          playAll: true
        },
        {
          type: 'text',
          md: `### Arpeggios
An **arpeggio** is a chord played one note at a time. Every CAGED shape is also an arpeggio fingering: play just the chord tones around the shape, string by string. Here's **C major** around the A shape (3rd position). It contains every C, E and G within that hand position.`
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('C', 'maj', [2, 5]),
          frets: [0, 7],
          caption: 'C major arpeggio around the A shape (frets 2–5).',
          playAll: true
        },
        {
          type: 'tab',
          bpm: 100,
          caption: 'C major arpeggio in the A-shape position, up and back.',
          events: (() => {
            const up: FretPos[] = [
              { string: 6, fret: 3 },
              { string: 5, fret: 3 },
              { string: 4, fret: 2 },
              { string: 4, fret: 5 },
              { string: 3, fret: 5 },
              { string: 2, fret: 5 },
              { string: 1, fret: 3 }
            ]
            return [...up, ...up.slice(0, -1).reverse()].map((p) => ({ pos: [p], beats: 0.5 }))
          })()
        },
        {
          type: 'text',
          md: `### Solos that follow the chords
When you solo, aiming for the **chord tones** of the current chord makes your lines sound connected to the harmony. If the band is on **G**, use the G-major CAGED shape nearest your hand to see where G, B and D are. When the chord changes to **C**, switch to the C shape in the same area. Remember how the pentatonic boxes from [[u8l2]] wrap around these same shapes? Each box sits right on top of a CAGED shape, so you can aim for the chord tones inside your scale.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G arpeggio (E shape, 3rd fret)', play: { kind: 'notes', notes: shapeMidis(cagedShape('G', 'E')), mode: 'arpeggio' } },
            { label: 'C arpeggio (A shape, 3rd fret)', play: { kind: 'notes', notes: shapeMidis(cagedShape('C', 'A')), mode: 'arpeggio' } },
            { label: 'D arpeggio (A shape, 5th fret)', play: { kind: 'notes', notes: shapeMidis(cagedShape('D', 'A')), mode: 'arpeggio' } }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**The CAGED workout:** pick a chord (start with G). Play it in all five shapes from the lowest to the highest. Then play each one as an arpeggio. Next day, a different chord. After twelve days you'll have played every major chord across the whole neck.`
        },
        {
          type: 'tryIt',
          question: mc('You need **E major** with your index finger barring the **7th fret** and the root under it on the 5th string. Which shape?', 'A shape', ['E shape', 'G shape', 'D shape'], {
            explain: 'E is at the 7th fret of the A string. The A shape barred there is **x 7 9 9 9 7**. (The C shape also has a 5th-string root, but it reaches *down* from the root: x 7 6 4 5 4.)'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [3, 9],
            prompt: 'Select all the **roots** in this **A major, E shape** chord, then press Check.',
            marks: shapePositions(cagedShape('A', 'E')).map((p) => ({ ...p, color: 'ghost' as const })),
            targets: [{ string: 6, fret: 5 }, { string: 4, fret: 7 }, { string: 1, fret: 5 }],
            explain: 'E-shape roots are on the 6th, 4th and 1st strings: frets **5, 7 and 5**.'
          }
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('The **E-shape** barre chord has its root on which string?', '6th string', ['5th string', '4th string', '3rd string'], {
        explain: 'Like the open E chord, the lowest note (6th string) is the root.'
      }),
      mc('An **A-shape** major barre chord at the **5th fret** is…', 'D', ['A', 'E', 'G'], {
        explain: 'The A shape is named by its 5th-string root. Fret 5 of the A string is **D**.'
      }),
      mc('An **E-shape** major barre chord at the **8th fret** is…', 'C', ['B', 'D', 'G'], {
        explain: 'Fret 8 of the low E string is **C**.'
      }),
      mc('Why can open chord shapes be moved up the neck?', 'The distances between their notes stay the same; the barre replaces the nut', [
        'Because every fret is a whole step',
        'Because open strings are always the root',
        'Only the E and A shapes can be moved'
      ], {
        explain: 'Moving a whole shape moves every note by the same interval, so the chord type is preserved. The barre does the job of the open strings.'
      }),
      mc('Going **up** the neck, which CAGED shape comes right after the **D shape**?', 'C shape', ['A shape', 'G shape', 'E shape'], {
        explain: 'C → A → G → E → D → **C** again. The cycle repeats every 12 frets.'
      }),
      mc('Which shape is this C major chord?', 'G shape', ['E shape', 'D shape', 'A shape'], {
        visual: { type: 'chords', shapes: [hidden(cagedShape('C', 'G'))] },
        explain: 'Roots on the 6th, 3rd and 1st strings: the open **G** shape moved up 5 frets (8 7 5 5 5 8).'
      }),
      {
        kind: 'fretboard',
        frets: [0, 12],
        prompt: 'Click the barre fret for **B♭ major** using the **E shape**.',
        targets: [{ string: 6, fret: 6 }],
        explain: 'B♭ is at the **6th fret** of the low E string.'
      },
      {
        kind: 'fretboard',
        mode: 'all',
        frets: [0, 6],
        prompt: 'This is **C major in the A shape**. Select every root, then press Check.',
        marks: shapePositions(cagedShape('C', 'A')).map((p) => ({ ...p, color: 'ghost' as const })),
        targets: [{ string: 5, fret: 3 }, { string: 3, fret: 5 }],
        explain: 'A-shape roots are on the 5th and 3rd strings: **5th string fret 3** and **3rd string fret 5**.'
      },
      mc('Which two CAGED shapes have a root on the **6th string**?', 'E and G', ['A and C', 'D and C', 'A and D'], {
        explain: 'The open **E** and **G** chords both have the root as their lowest note on the 6th string.'
      }),
      mc('To turn an **A-shape** major barre chord into minor, which note moves?', 'The 3rd on the 2nd string drops one fret', [
        'The root on the 5th string drops one fret',
        'The 5th on the 4th string drops one fret',
        'The 1st string is muted'
      ], {
        explain: 'In the A shape the 3rd (C♯ in open A) is on the **2nd string**. Lower it a fret: x 0 2 2 1 0 = Am.'
      }),
      {
        kind: 'text',
        prompt: 'After how many frets does the whole CAGED cycle repeat?',
        accept: ['12', 'twelve'],
        explain: '**12 frets**, one octave. The open C shape comes back at the 12th fret.'
      },
      mc('Listen. Is this barre chord major or minor?', 'Minor', ['Major'], {
        play: strum(movableChord('G', 'min', 6)!),
        explain: 'That was **Gm** (Em shape at the 3rd fret): 3 5 5 3 3 3.'
      }),
      mc('Listen. Is this barre chord major or minor?', 'Major', ['Minor'], {
        play: strum(movableChord('C', 'maj', 5)!),
        explain: 'That was **C** (A shape at the 3rd fret): x 3 5 5 5 3.'
      }),
      mc('In the **D shape** of C major (x x 10 12 13 12), which chord tone is on the 1st string?', 'The 3rd (E)', ['The root (C)', 'The 5th (G)', 'The ♭3 (E♭)'], {
        explain: 'Fret 12 of the high E string is **E**, the 3rd, just like the F♯ on top of an open D chord.'
      }),
      mc('You play **G** with the E shape at the 3rd fret. Roughly where is the **D shape** of G?', 'Around the 5th fret', ['Around the 1st fret', 'Around the 8th fret', 'Around the 12th fret'], {
        explain: 'The D shape shares the E shape\'s 4th-string root (5th fret): **x x 5 7 8 7**.'
      })
    ],
    generators: [identifyCagedShape, nameBarreChord, findBarreRoot, nextShapeUp, rootStringsOfShape]
  }
}

export default unit
