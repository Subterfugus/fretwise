import type { QuizQuestion, Unit } from '../types'
import { m, mc, noteMarks, rand, randInt, distractors } from '../helpers'
import { nameAt, positionsOf, midiAt, STRING_NAMES } from '@/theory/guitar'
import { SHARP_NAMES, FLAT_NAMES, pretty } from '@/theory/notes'

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STRING_LABEL = ['', '1st (high E)', '2nd (B)', '3rd (G)', '4th (D)', '5th (A)', '6th (low E)']

/** Natural notes along one string, frets 0..12 */
const naturalsOnString = (s: number) =>
  Array.from({ length: 13 }, (_, f) => ({ string: s, fret: f }))
    .filter((p) => NATURALS.includes(nameAt(p, false)))
    .map((p) => m(p.string, p.fret, nameAt(p, false), nameAt(p, false) === STRING_NAMES[s - 1] ? 'root' : 'tone'))

// ---------- generated questions ----------

const nameThatFret = (): QuizQuestion => {
  const string = rand([5, 6, 6, 5, 4, 1])
  const fret = randInt(0, 12)
  const pos = { string, fret }
  const correct = nameAt(pos, false)
  const alt = correct.includes('#') ? FLAT_NAMES[SHARP_NAMES.indexOf(correct)] : null
  const correctLabel = alt ? `${correct} / ${alt}` : correct
  const wrong = distractors(SHARP_NAMES, correct, 3).map((n) => {
    const f = FLAT_NAMES[SHARP_NAMES.indexOf(n)]
    return n === f ? n : `${n} / ${f}`
  })
  return mc(`What note is marked on the **${STRING_LABEL[string]}** string?`, correctLabel, wrong, {
    visual: { type: 'fretboard', marks: [m(string, fret, '?', 'accent')], playable: false },
    explain: `Fret ${fret} on the ${STRING_LABEL[string]} string is **${correctLabel}**. Count up the musical alphabet from the open string, one fret per half step.`
  })
}

const findOnString = (): QuizQuestion => {
  const string = rand([6, 5])
  const note = rand(NATURALS)
  const targets = positionsOf(note, 0, 12).filter((p) => p.string === string)
  return {
    kind: 'fretboard',
    prompt: `Click a **${note}** on the **${STRING_LABEL[string]}** string (frets 0–12).`,
    targets,
    explain: `${note} is at fret ${targets.map((t) => t.fret).join(' and ')} on the ${STRING_LABEL[string]} string.`
  }
}

const findAllOnNeck = (): QuizQuestion => {
  const note = rand(['G', 'A', 'C', 'D', 'F'])
  const targets = positionsOf(note, 0, 5)
  return {
    kind: 'fretboard',
    mode: 'all',
    frets: [0, 5],
    prompt: `Select **every ${note}** between the nut and the 5th fret, then press Check.`,
    targets,
    explain: `There are ${targets.length} ${note}s in the first five frets. Octave shapes help you find them.`
  }
}

const halfStepsUp = (): QuizQuestion => {
  const start = rand(NATURALS)
  const i = SHARP_NAMES.indexOf(start)
  const steps = rand([1, 2])
  const ans = SHARP_NAMES[(i + steps) % 12]
  const alt = FLAT_NAMES[(i + steps) % 12]
  return {
    kind: 'text',
    prompt: `What note is a **${steps === 1 ? 'half step' : 'whole step'}** above **${start}**? (Type one name, e.g. F# or Gb.)`,
    accept: [...new Set([ans, alt])],
    explain: `A ${steps === 1 ? 'half step is 1 fret' : 'whole step is 2 frets'}. ${start} → **${ans === alt ? ans : ans + ' / ' + alt}**.${
      start === 'E' || start === 'B' ? ` Remember: there's no sharp between ${start} and ${start === 'E' ? 'F' : 'C'}.` : ''
    }`
  }
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u1',
  number: 1,
  title: 'The guitar and its notes',
  summary: 'String names, the musical alphabet, half and whole steps, and finding any note on the neck.',
  lessons: [
    {
      id: 'u1l1',
      title: 'Meet the fretboard',
      summary: 'String names and numbers, frets, and how the fretboard is drawn in this app.',
      blocks: [
        {
          type: 'text',
          md: `Music theory explains *why* music sounds the way it does. Guitarists have an advantage: the fretboard is a grid, so most theory turns into **shapes** you can see and play.

Before any theory, we need a map. A standard guitar has **six strings** tuned, from lowest to highest:

**E – A – D – G – B – E**

Guitarists number the strings from the *thinnest* up: the high E is the **1st string** and the low E is the **6th string**.`
        },
        {
          type: 'fretboard',
          marks: [1, 2, 3, 4, 5, 6].map((s) => m(s, 0, STRING_NAMES[s - 1], 'root')),
          frets: [0, 5],
          caption: 'Open strings. Click a dot to hear it. The top line is the 1st (high E) string, just like tab.',
          playAll: true
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `A classic way to remember the strings, low to high: **E**ddie **A**te **D**ynamite, **G**ood **B**ye **E**ddie.`
        },
        {
          type: 'text',
          md: `### Frets
The metal bars across the neck are **frets**. Pressing behind a fret shortens the string and raises the pitch. **Each fret is one half step**, the smallest distance in Western music.

The dots (inlays) at frets **3, 5, 7, 9 and 12** help you find your place. The **12th fret** has a double dot because it's exactly one **octave** above the open string. The pattern of notes repeats from there.`
        },
        {
          type: 'fretboard',
          marks: [m(6, 0, 'E', 'root'), m(6, 12, 'E', 'root'), m(1, 0, 'E', 'root'), m(1, 12, 'E', 'root')],
          caption: 'Open E and 12th-fret E: same note name, one octave apart. Click to compare.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Low E: open → 12th fret', play: { kind: 'notes', notes: [40, 52], mode: 'arpeggio' } },
            { label: 'High E: open → 12th fret', play: { kind: 'notes', notes: [64, 76], mode: 'arpeggio' } }
          ]
        },
        {
          type: 'tryIt',
          question: mc('Which string is the **3rd string**?', 'G', ['D', 'B', 'A'], {
            explain: 'Counting from the thinnest: 1 = high E, 2 = B, **3 = G**, 4 = D, 5 = A, 6 = low E.'
          })
        }
      ]
    },
    {
      id: 'u1l2',
      title: 'The musical alphabet, half steps and whole steps',
      summary: 'Seven letters, sharps and flats, and the two places without a sharp in between.',
      blocks: [
        {
          type: 'text',
          md: `Music uses only seven letters: **A B C D E F G**, and then it repeats. These are the **natural notes**.

Between most natural notes there's an extra note, a **sharp (♯)** or **flat (♭)**:
- **Sharp** raises a note by one half step (one fret): F → F♯
- **Flat** lowers a note by one half step: B → B♭

There are **12 different notes** in all. Together they make up the **chromatic scale**.`
        },
        {
          type: 'fretboard',
          marks: Array.from({ length: 13 }, (_, f) => {
            const n = nameAt({ string: 5, fret: f }, false)
            return m(5, f, pretty(n), n.includes('#') ? 'ghost' : n === 'A' ? 'root' : 'tone')
          }),
          caption: 'The chromatic scale on the A string, fret by fret. Sharps are grey.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'chromatic', frets: [0, 12] }],
          playAll: true
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**E–F** and **B–C** have no note in between. They're only one fret apart. Everywhere else, natural notes are two frets apart. This one fact unlocks the whole fretboard.`
        },
        {
          type: 'text',
          md: `### Half steps and whole steps
- **Half step (semitone)** = 1 fret. E → F, A → A♯, C♯ → D
- **Whole step (tone)** = 2 frets. C → D, F → G, B → C♯

### Enharmonic notes
A♯ and B♭ are the **same pitch** with two names. Notes like this are called **enharmonic**. Which name to use depends on the key, which we'll cover in [[preview:u4l4]]. For now, every black-key note has two names:`
        },
        {
          type: 'table',
          headers: ['Sharp name', 'Flat name'],
          rows: [
            ['C#', 'Db'],
            ['D#', 'Eb'],
            ['F#', 'Gb'],
            ['G#', 'Ab'],
            ['A#', 'Bb']
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Half step (E → F)', play: { kind: 'notes', notes: [52, 53], mode: 'arpeggio' } },
            { label: 'Whole step (F → G)', play: { kind: 'notes', notes: [53, 55], mode: 'arpeggio' } },
            { label: 'Chromatic E → E', play: { kind: 'notes', notes: Array.from({ length: 13 }, (_, i) => 52 + i), mode: 'arpeggio', toolExample: { kind: 'scale', root: 'E', type: 'chromatic', frets: [0, 12] } } }
          ]
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'What note is a **whole step above B**?', accept: ['C#', 'Db'], explain: 'B → C is only a half step, so a whole step up from B is **C♯ (D♭)**.' }
        }
      ]
    },
    {
      id: 'u1l3',
      title: 'Notes on the 6th and 5th strings',
      summary: 'The two most important strings to know: they hold the roots of almost every barre chord.',
      blocks: [
        {
          type: 'text',
          md: `You don't need to memorise the whole neck at once. Start with the **6th (low E)** and **5th (A)** strings. Most movable chords and scale shapes take their name from a root on one of these two strings, so knowing them pays off right away.

Learn the **natural notes** first. Remember the gaps: two frets between most naturals, and one fret for E–F and B–C.`
        },
        {
          type: 'fretboard',
          marks: [...naturalsOnString(6), ...naturalsOnString(5)],
          caption: 'Natural notes on the 6th and 5th strings, open to 12th fret.'
        },
        {
          type: 'text',
          md: `### Landmarks
Rather than counting from the nut every time, anchor on the inlays:
- 6th string: **G at 3**, **A at 5**, **B at 7**, **C at 8**, **D at 10**, **E at 12**
- 5th string: **C at 3**, **D at 5**, **E at 7**, **F at 8**, **G at 10**, **A at 12**

Notice that the 5th fret of the 6th string is **A**, the same note as the open 5th string. That's how you tune the guitar by ear.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Say each note name out loud as you play it, up and down the low E string. Then do the same on the A string. Five minutes a day for a week and these two strings will be automatic.`
        },
        { type: 'tryIt', question: { kind: 'fretboard', prompt: 'Click the **C** on the 6th string.', targets: [{ string: 6, fret: 8 }], explain: 'C is at the 8th fret of the low E string, right after B at the 7th.' } },
        {
          type: 'playIt',
          prompt: 'Play the note **A** on the 5th string, then **C** on the 6th string.',
          targets: ['A2', 'C3'],
          hint: 'The open 5th string is A. The C on the low E string is at the 8th fret.',
          show: [{ string: 5, fret: 0 }, { string: 6, fret: 8 }]
        },
        { type: 'tryIt', question: { kind: 'fretboard', prompt: 'Click the **D** on the 5th string (frets 0–12).', targets: [{ string: 5, fret: 5 }], explain: 'D is at the 5th fret of the A string.' } }
      ]
    },
    {
      id: 'u1l4',
      title: 'Octave shapes',
      summary: 'Use octave patterns to find any note on any string fast.',
      blocks: [
        {
          type: 'text',
          md: `An **octave** is the same note 12 half steps higher. It sounds like a higher version of the same note. On guitar, octaves make a few **fixed shapes**. Once you know a note on the 6th or 5th string, these shapes take you to the same note on other strings.`
        },
        {
          type: 'fretboard',
          marks: [m(6, 3, 'G', 'root'), m(4, 5, 'G', 'root'), m(5, 3, 'C', 'accent'), m(3, 5, 'C', 'accent')],
          frets: [0, 7],
          caption: 'Shape 1: skip a string, up two frets (6→4 and 5→3).'
        },
        {
          type: 'fretboard',
          marks: [m(4, 5, 'G', 'root'), m(2, 8, 'G', 'root'), m(3, 5, 'C', 'accent'), m(1, 8, 'C', 'accent')],
          frets: [3, 10],
          caption: 'Shape 2: from the 4th or 3rd string, skip a string and go up three frets. The B string shifts the shape by one fret.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Why does the B string shift things?** Every pair of neighbouring strings is tuned a 4th apart (5 frets), *except* G → B, which is a major 3rd (4 frets). Any shape that crosses from the G string to the B string moves up one fret to make up for it. You'll see this "B-string shift" in scales and chords too.`
        },
        {
          type: 'fretboard',
          marks: [m(6, 5, 'A', 'root'), m(1, 5, 'A', 'root')],
          frets: [0, 7],
          caption: 'Shape 3: the 6th and 1st strings are both E, so a note on the low E string is two octaves below the same fret on the high E string.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G octave (6th → 4th)', play: { kind: 'notes', notes: [midiAt({ string: 6, fret: 3 }), midiAt({ string: 4, fret: 5 })], mode: 'arpeggio' } },
            { label: 'Same, together', play: { kind: 'notes', notes: [43, 55], mode: 'block' } }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The **A** at the 5th fret of the 6th string is marked. Click the A **one octave higher** (hint: shape 1).',
            marks: [m(6, 5, 'A', 'root')],
            frets: [0, 9],
            targets: [{ string: 4, fret: 7 }, { string: 3, fret: 2 }],
            explain: 'Skip a string (to the 4th) and go up two frets: **4th string, 7th fret**. The same pitch is also at the 2nd fret of the 3rd string.'
          }
        }
      ]
    },
    {
      id: 'u1l5',
      title: 'The whole neck',
      summary: 'Putting it together: every natural note from the nut to the 12th fret.',
      blocks: [
        {
          type: 'text',
          md: `Here are all the natural notes up to the 12th fret. Don't try to memorise it as a picture. Use what you know:
1. The **open strings** E A D G B E
2. The **E–F / B–C** half steps
3. Your **6th and 5th string landmarks**
4. **Octave shapes** to jump across to the other strings`
        },
        {
          type: 'fretboard',
          marks: [1, 2, 3, 4, 5, 6].flatMap(naturalsOnString),
          caption: 'All natural notes, open to 12th fret. Hover or click to hear them.'
        },
        {
          type: 'text',
          md: `### One note at a time
A great exercise: pick one note and find **every** place it appears. Here is every **C**:`
        },
        { type: 'fretboard', marks: noteMarks('C', [0, 12]), caption: 'Every C from the nut to the 12th fret.', playAll: true },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Daily drill:** choose a note, set a timer for 60 seconds, and play it on every string from 6 to 1 and back. Change notes each day. The ear-training tab can play reference pitches to check yourself.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            mode: 'all',
            frets: [0, 5],
            prompt: 'Select **every F** between the nut and the 5th fret, then press Check.',
            targets: positionsOf('F', 0, 5),
            explain: 'There are three: the 1st fret of the 6th string, the 3rd fret of the 4th string, and the 1st fret of the 1st string. On the 5th, 3rd and 2nd strings, F is above the 5th fret.'
          }
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('Which list shows the open strings from **lowest to highest**?', 'E A D G B E', ['E B G D A E', 'E A D G C E', 'A D G C E A']),
      mc('Which string is the **5th string**?', 'A', ['D', 'B', 'Low E']),
      mc('How many frets make a **whole step**?', '2', ['1', '3', '4']),
      mc('Which pair of natural notes is only a **half step** apart?', 'B and C', ['C and D', 'F and G', 'A and B'], {
        explain: 'The natural half steps are **E–F** and **B–C**.'
      }),
      mc('A♯ and B♭ are…', 'enharmonic: the same pitch with two names', ['a half step apart', 'a whole step apart', 'an octave apart']),
      mc('Fret 12 on any string gives…', 'the same note as the open string, one octave higher', ['the note a 5th above the open string', 'a half step below the open string', 'a different note on every string']),
      mc('Why do octave and scale shapes move up one fret when they cross onto the B string?', 'G to B is only 4 frets apart, while the other neighbouring string pairs are 5 frets apart', [
        'The B string is thinner',
        'B has no sharp',
        'Because of the inlay at the 5th fret'
      ]),
      {
        kind: 'text',
        prompt: 'How many **different** notes are there in the chromatic scale?',
        accept: ['12', 'twelve'],
        explain: '12 notes. After that the alphabet repeats an octave higher.'
      },
      { kind: 'spell', prompt: 'Type the **seven natural notes** starting from C.', answer: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
      { kind: 'fretboard', prompt: 'Click the **A** on the 6th string.', targets: [{ string: 6, fret: 5 }], explain: 'A is at the 5th fret of the low E string.' },
      { kind: 'fretboard', prompt: 'Click the **E** on the 5th string (frets 0–12).', targets: [{ string: 5, fret: 7 }], explain: 'E is at the 7th fret of the A string.' },
      mc('Listen. Is the second note a **half step** or a **whole step** higher?', 'Half step', ['Whole step'], {
        play: { kind: 'notes', notes: [57, 58], mode: 'arpeggio' },
        explain: 'A → A♯ is one fret: a **half step**.'
      }),
      mc('Listen. Is the second note a **half step** or a **whole step** higher?', 'Whole step', ['Half step'], {
        play: { kind: 'notes', notes: [55, 57], mode: 'arpeggio' },
        explain: 'G → A is two frets: a **whole step**.'
      })
    ],
    generators: [nameThatFret, findOnString, findAllOnNeck, halfStepsUp]
  }
}

export default unit
