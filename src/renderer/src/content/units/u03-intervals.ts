import type { FretMark, QuizQuestion, Unit } from '../types'
import { m, mc, rand, randInt, distractors, playInterval, shapeMarks, strum } from '../helpers'
import { taught } from '../curriculum'
import { FretPos, OPEN_CHORDS, midiAt, movableChord, nameAt, STRING_NAMES } from '@/theory/guitar'
import { SIMPLE_INTERVALS, intervalBetween, invert, parseInterval, transpose } from '@/theory/intervals'
import { noteName, pretty } from '@/theory/notes'

// ---------- local helpers ----------

const SHORT_BY_SEMI = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']
const LONG = (short: string) => (short === 'A4' || short === 'd5' ? `${parseInterval(short).long} (tritone)` : parseInterval(short).long)
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const art = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const hs = (n: number) => `${n} half step${n === 1 ? '' : 's'}`

/** Every fret position (frets lo..hi) sounding exactly this MIDI pitch. */
function pitchPositions(midiNum: number, lo = 0, hi = 12): FretPos[] {
  const out: FretPos[] = []
  for (let s = 1; s <= 6; s++) {
    const f = midiNum - midiAt({ string: s, fret: 0 })
    if (f >= lo && f <= hi) out.push({ string: s, fret: f })
  }
  return out
}

const C_ROOT = { string: 5, fret: 3 } // C3

// C on the A string with each interval up the same string
const ONE_STRING: FretMark[] = SHORT_BY_SEMI.map((lbl, i) => m(5, 3 + i, lbl === 'R' ? 'C' : lbl, i === 0 || i === 12 ? 'root' : 'tone'))

// Interval shapes from a 5th-string root (C at fret 3) onto the next two strings
const SHAPES_FROM_C: FretMark[] = [
  m(5, 3, 'R', 'root'),
  m(5, 5, 'M2'),
  m(4, 1, 'm3'),
  m(4, 2, 'M3'),
  m(4, 3, 'P4'),
  m(4, 4, 'TT'),
  m(4, 5, 'P5'),
  m(3, 1, 'm6'),
  m(3, 2, 'M6'),
  m(3, 3, 'm7'),
  m(3, 4, 'M7'),
  m(3, 5, 'P8', 'root')
]

const REFS: [string, string, string, string][] = [
  ['m2', '1', 'Jaws theme', 'Für Elise (first two notes)'],
  ['M2', '2', 'Frère Jacques', 'Mary Had a Little Lamb'],
  ['m3', '3', 'Greensleeves; Smoke on the Water (first two notes)', 'Hey Jude (first two notes)'],
  ['M3', '4', 'When the Saints Go Marching In', 'Swing Low, Sweet Chariot'],
  ['P4', '5', 'Here Comes the Bride; Amazing Grace', 'Eine kleine Nachtmusik (opening)'],
  ['TT', '6', 'The Simpsons theme ("The Simp-")', '–'],
  ['P5', '7', 'Twinkle Twinkle Little Star; Star Wars theme', 'The Flintstones ("Flint-stones")'],
  ['m6', '8', 'The Entertainer (the big leap after the pickup)', '–'],
  ['M6', '9', 'My Bonnie Lies Over the Ocean; NBC chimes', 'Nobody Knows the Trouble I’ve Seen'],
  ['m7', '10', 'Star Trek (original series theme)', '–'],
  ['M7', '11', 'Don’t Know Why (Norah Jones)', '–'],
  ['P8', '12', 'Somewhere Over the Rainbow ("Some-where")', '–']
]

const G5 = movableChord('G', 'power', 6)!
const C5 = movableChord('C', 'power', 5)!
const A5pc = movableChord('A', 'power', 6)!
const E5 = OPEN_CHORDS.E5
const A5 = OPEN_CHORDS.A5

// ---------- generated questions ----------

const POOL = SIMPLE_INTERVALS.filter((iv) => iv.short !== 'P1')

const semitonesQ = (): QuizQuestion => {
  const iv = rand(POOL)
  const ans = String(iv.semitones)
  const wrong = distractors(
    [iv.semitones - 2, iv.semitones - 1, iv.semitones + 1, iv.semitones + 2].filter((n) => n >= 1 && n <= 12).map(String),
    ans,
    3
  )
  return mc(`How many half steps (frets on one string) are in ${art(iv.long)} **${LONG(iv.short)}**?`, ans, wrong, {
    play: playInterval('A2', iv.short, 'ascending'),
    explain: `${cap(art(iv.long))} ${iv.long} (${iv.short}) spans **${hs(iv.semitones)}**: ${iv.semitones} fret${iv.semitones === 1 ? '' : 's'} up the same string.`
  })
}

const SPELL_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'F#', 'Ab']
const SPELL_IVS = ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'm7', 'M7']

const spellIntervalQ = (): QuizQuestion => {
  for (;;) {
    const root = rand(SPELL_ROOTS)
    const iv = rand(SPELL_IVS)
    const t = transpose(root, iv)
    if (Math.abs(t.acc) > 1) continue
    const ans = noteName(t)
    const info = parseInterval(iv)
    return {
      kind: 'spell',
      prompt: `Spell the note ${art(info.long)} **${info.long}** above **${pretty(root)}**.`,
      answer: [ans],
      play: playInterval(root + '3', iv),
      explain: `Count ${info.number} letter names from ${pretty(root)} (the letter must be ${t.letter}), then adjust so it's ${hs(info.semitones)} up: **${pretty(ans)}**.`
    }
  }
}

const nameIntervalQ = (): QuizQuestion => {
  for (;;) {
    const root = rand(SPELL_ROOTS)
    const iv = rand(SPELL_IVS.concat(['A4', 'P8']))
    const t = transpose(root, iv)
    if (Math.abs(t.acc) > 1) continue
    const top = noteName(t)
    const info = intervalBetween(root, top)
    const name = iv === 'P8' ? 'octave' : info.long
    const pool = ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'augmented 4th', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave']
    const idx = pool.indexOf(name)
    const near = pool.filter((_, i) => i !== idx && Math.abs(i - idx) <= 3)
    return mc(`What interval is it from **${pretty(root)} up to ${pretty(top)}**?`, cap(name), distractors(near, name, 3).map(cap), {
      play: playInterval(root + '3', iv),
      explain: `${pretty(root)} → ${pretty(top)}: ${iv === 'P8' ? 'same letter, an octave up' : `${info.number} letter names`}, ${hs(parseInterval(iv).semitones)} = **${name}**.`
    })
  }
}

const FB_IVS = ['m3', 'M3', 'P4', 'P5', 'M6', 'm7', 'P8']

const fretboardIntervalQ = (): QuizQuestion => {
  for (;;) {
    const string = rand([6, 5])
    const fret = randInt(1, 7)
    const root = { string, fret }
    const iv = rand(FB_IVS)
    const semis = parseInterval(iv).semitones
    const targets = pitchPositions(midiAt(root) + semis, 0, 12)
    if (!targets.length) continue
    const rootName = pretty(nameAt(root, false))
    const long = parseInterval(iv).long
    return {
      kind: 'fretboard',
      prompt: `The root **${rootName}** is marked. Click the note ${art(long)} **${long}** above it (any string, frets 0–12).`,
      marks: [m(string, fret, rootName, 'root')],
      targets,
      explain: `${cap(art(long))} ${long} is ${hs(semis)} up. ${targets
        .map((t) => `string ${t.string} (${STRING_NAMES[t.string - 1]}) fret ${t.fret}`)
        .join(', ')} all sound that exact pitch.`
    }
  }
}

const EAR_IVS = ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']

const earIntervalQ = (): QuizQuestion => {
  const iv = rand(EAR_IVS)
  const dir = rand(['ascending', 'ascending', 'harmonic'] as const)
  const root = rand(['E3', 'F3', 'G3', 'A2', 'A3', 'C3', 'D3'])
  const name = iv === 'A4' ? 'Tritone' : cap(parseInterval(iv).long)
  const all = EAR_IVS.map((x) => (x === 'A4' ? 'Tritone' : cap(parseInterval(x).long)))
  const ref = REFS.find((r) => r[0] === (iv === 'A4' ? 'TT' : iv))
  return mc(`Listen${dir === 'harmonic' ? ' (both notes together)' : ''}. Which interval is this?`, name, distractors(all, name, 3), {
    play: playInterval(root, iv, dir),
    explain: `It was ${art(name)} **${name.toLowerCase()}** (${hs(parseInterval(iv).semitones)}).${ref && ref[2] !== '–' && dir !== 'harmonic' ? ` Reference (melodic, ascending): ${ref[2]}.` : ''}`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u3',
  number: 3,
  title: 'Intervals on the fretboard',
  summary: 'Interval names and sizes, interval shapes across strings, inversions, consonance, ear recognition and power chords.',
  lessons: [
    {
      id: 'u3l1',
      title: 'What is an interval?',
      summary: 'The distance between two notes: the building block of every scale, chord and melody.',
      blocks: [
        {
          type: 'text',
          md: `An **interval** is the distance between two notes. Every melody is a chain of intervals; every chord is a stack of them. Learn intervals well and the rest of theory becomes much simpler.

On guitar, the most basic way to measure an interval is to **count frets**: each fret is one half step (semitone). From C at the 3rd fret of the A string up to E at the 7th fret is **4 half steps**.`
        },
        {
          type: 'fretboard',
          marks: [m(5, 3, 'C', 'root'), m(5, 4, '1', 'ghost'), m(5, 5, '2', 'ghost'), m(5, 6, '3', 'ghost'), m(5, 7, 'E', 'tone')],
          frets: [0, 9],
          caption: 'C to E on the A string: 4 frets = 4 half steps.'
        },
        {
          type: 'text',
          md: `### Interval names have two parts
1. A **number**, found by counting **letter names**, including both ends. C–D–E is three letters, so C up to E is a **3rd**.
2. A **quality**: **perfect**, **major**, **minor**, **augmented** or **diminished**. This is set by the exact number of half steps.

C up to E (4 half steps) is a **major 3rd**. C up to E♭ (3 half steps) is still a 3rd (C–D–E), but smaller: a **minor 3rd**.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Major 3rd (C → E)', play: playInterval('C3', 'M3') },
            { label: 'Minor 3rd (C → E♭)', play: playInterval('C3', 'm3') }
          ]
        },
        {
          type: 'text',
          md: `### Melodic vs harmonic
- A **melodic** interval plays the notes **one after the other** (ascending or descending).
- A **harmonic** interval plays them **together**.

Same distance, different effect. Melodic intervals make tunes; harmonic intervals make harmony.`
        },
        {
          type: 'tab',
          caption: 'C to E: melodic (one after the other), then harmonic (together).',
          events: [
            { pos: [C_ROOT], beats: 1 },
            { pos: [{ string: 4, fret: 2 }], beats: 1 },
            { pos: [C_ROOT, { string: 4, fret: 2 }], beats: 2 }
          ],
          bpm: 70
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Melodic, ascending', play: playInterval('C3', 'M3', 'ascending') },
            { label: 'Melodic, descending', play: playInterval('C3', 'M3', 'descending') },
            { label: 'Harmonic', play: playInterval('C3', 'M3', 'harmonic') }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Notice in the tab that E isn't played on the A string. **The same interval can be played on different strings**. E at the 2nd fret of the D string is the exact same pitch as the 7th fret of the A string. Interval *shapes* across strings are what make guitar theory so visual (lesson 3).`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'How many half steps is it from **A up to C**? (Count frets.)', accept: ['3', 'three'], explain: 'A → A♯ → B → C: **3 half steps**, a minor 3rd.' }
        }
      ]
    },
    {
      id: 'u3l2',
      title: 'Interval names and sizes',
      summary: 'All twelve intervals within an octave, and how quality names work.',
      blocks: [
        {
          type: 'text',
          md: `Within one octave there are **12** different interval sizes (plus the unison, 0). Here they are, built up the A string from C:`
        },
        {
          type: 'fretboard',
          marks: ONE_STRING,
          frets: [2, 15],
          caption: 'Every interval from C, one fret at a time on the A string. Click each to hear it.',
          playAll: true
        },
        {
          type: 'table',
          headers: ['Half steps', 'Short', 'Name', 'From C'],
          rows: SIMPLE_INTERVALS.map((iv) => [
            String(iv.semitones),
            iv.short === 'A4' ? 'A4 / d5' : iv.short,
            iv.short === 'A4' ? 'augmented 4th / diminished 5th (tritone)' : iv.long,
            iv.short === 'A4' ? 'F# / Gb' : noteName(transpose('C', iv.short))
          ])
        },
        {
          type: 'text',
          md: `### Which quality goes with which number?
- **Perfect**: unisons, **4ths**, **5ths** and octaves. They sound so stable they only come in one "normal" size.
- **Major / minor**: **2nds, 3rds, 6ths and 7ths**. Minor is one half step smaller than major.
- **Augmented**: one half step *bigger* than perfect or major. **Diminished**: one half step *smaller* than perfect or minor.

The interval of 6 half steps sits exactly halfway through the octave. It's called the **tritone** (three whole steps). Spell it as an **augmented 4th** (C–F♯) or a **diminished 5th** (C–G♭) depending on the letters.`
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**Spelling matters.** C up to D♯ and C up to E♭ are both 3 half steps, but C–D♯ is an *augmented 2nd* (two letters: C, D) and C–E♭ is a *minor 3rd* (three letters: C, D, E). Same sound, different name and function. Always count letters first, then half steps.`
        },
        {
          type: 'audioRow',
          items: ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'].map((iv) => ({
            label: iv === 'A4' ? 'TT' : iv,
            play: playInterval('C3', iv)
          }))
        },
        {
          type: 'playIt',
          prompt: 'Play **A** (open 5th string), then the note a **perfect 5th** above it.',
          targets: ['A2', 'E3'],
          hint: 'A perfect 5th is 7 half steps: the 7th fret of the A string, or the shortcut one string over and 2 frets up, the 2nd fret of the D string. Both are E.',
          show: [{ string: 5, fret: 0 }, { string: 5, fret: 7 }, { string: 4, fret: 2 }]
        },
        {
          type: 'tryIt',
          question: mc('Which interval spans **7 half steps**?', 'Perfect 5th', ['Perfect 4th', 'Major 6th', 'Tritone'], {
            play: playInterval('C3', 'P5'),
            explain: 'C → G: 7 half steps, a **perfect 5th**. It’s the interval in every power chord.'
          })
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'Spell the note a **major 3rd above G**.', answer: ['B'], explain: 'G–A–B is three letters; G→B is 4 half steps: **B**.' }
        }
      ]
    },
    {
      id: 'u3l3',
      title: 'Interval shapes across strings',
      summary: 'Every interval is a fixed shape on the neck, with one twist at the B string.',
      blocks: [
        {
          type: 'text',
          md: `Playing intervals up one string is clear but slow. Guitarists usually play them **across strings**, where each interval becomes a small, movable **shape**.

The key fact: neighbouring strings are tuned a **perfect 4th** apart (5 frets). So:
- **Same fret, next string up** = a **perfect 4th**.
- Two frets higher on the next string = **P5** (the power-chord shape).
- One fret lower = **M3**; two frets lower = **m3**.`
        },
        {
          type: 'fretboard',
          marks: SHAPES_FROM_C,
          frets: [0, 6],
          caption: 'Every interval from C (5th string, 3rd fret) using the next two strings. Move the root anywhere on strings 6 or 5 and the shapes stay the same.'
        },
        {
          type: 'table',
          headers: ['Interval', 'Shape from the root'],
          rows: [
            ['M2', 'same string, +2 frets'],
            ['m3', 'next string, 2 frets back'],
            ['M3', 'next string, 1 fret back'],
            ['P4', 'next string, same fret'],
            ['TT', 'next string, +1 fret'],
            ['P5', 'next string, +2 frets'],
            ['m6', 'skip a string, 2 frets back'],
            ['M6', 'skip a string, 1 fret back'],
            ['m7', 'skip a string, same fret'],
            ['M7', 'skip a string, +1 fret'],
            ['P8', 'skip a string, +2 frets']
          ],
          caption: '"Next string" means the next higher-pitched (thinner) string. These shapes work as shown from roots on the 6th and 5th strings. From the 4th string, only the next-string shapes avoid the G–B pair.'
        },
        {
          type: 'text',
          md: `### The B-string shift
The G and B strings are tuned a **major 3rd** apart (4 frets), not a 4th. So any shape that crosses from the G string onto the B string has to move **up one fret** to make up the difference.`
        },
        {
          type: 'fretboard',
          marks: [m(4, 5, 'G', 'root'), m(3, 4, 'M3'), m(3, 7, 'P5')],
          frets: [2, 9],
          caption: 'Root on the D string (G): M3 is one fret back, P5 is two frets up. The normal shapes.'
        },
        {
          type: 'fretboard',
          marks: [m(3, 5, 'C', 'root'), m(2, 5, 'M3'), m(2, 8, 'P5')],
          frets: [2, 9],
          caption: 'Root on the G string (C): crossing to the B string, every shape shifts up one fret. M3 is now the same fret; P5 is three frets up.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G → B (M3) → D (P5)', play: { kind: 'notes', notes: [55, 59, 62], mode: 'arpeggio' } },
            { label: 'C → E (M3) → G (P5)', play: { kind: 'notes', notes: [60, 64, 67], mode: 'arpeggio' } }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Pick a root on the 5th string and play each shape from the table, saying the interval name aloud. Then move the root to a new fret and repeat. Within a week you'll "see" a 5th or a 3rd from any note.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The root **A** is marked on the 6th string. Click the **perfect 5th** above it using the shape on the next string.',
            marks: [m(6, 5, 'A', 'root')],
            frets: [0, 12],
            targets: pitchPositions(midiAt({ string: 6, fret: 5 }) + 7),
            explain: 'Next string, two frets up: **5th string, 7th fret** (E). The same E is also at the 12th fret of the low E string and the 2nd fret of the D string.'
          }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The root **D** is on the G string. Click its **major 3rd** (F♯) on the **B string**.',
            marks: [m(3, 7, 'D', 'root')],
            frets: [3, 11],
            targets: [{ string: 2, fret: 7 }],
            explain: 'Across the G–B pair the M3 shape moves up a fret: **same fret** on the B string (7th fret, F♯).'
          }
        }
      ]
    },
    {
      id: 'u3l4',
      title: 'Hearing intervals: song references',
      summary: 'Link each interval to a tune you already know.',
      blocks: [
        {
          type: 'text',
          md: `Knowing interval names is useful; **hearing** them is a superpower. It lets you work out riffs and melodies by ear, and tells you what your fingers will sound like before you play.

The fastest way in is to pair each interval with the opening of a song you already know. When you hear an interval, ask: "which song does that start like?"`
        },
        {
          type: 'table',
          headers: ['Interval', 'Half steps', 'Ascending reference', 'Descending reference'],
          rows: REFS.map((r) => [r[0], r[1], r[2], r[3]]),
          caption: 'Pick one reference per interval that you know well, and make it yours.'
        },
        {
          type: 'audioRow',
          items: ['m2', 'M2', 'm3', 'M3', 'P4', 'A4'].map((iv) => ({ label: `${iv === 'A4' ? 'TT' : iv} up`, play: playInterval('C3', iv) }))
        },
        {
          type: 'audioRow',
          items: ['P5', 'm6', 'M6', 'm7', 'M7', 'P8'].map((iv) => ({ label: `${iv} up`, play: playInterval('C3', iv) }))
        },
        {
          type: 'text',
          md: `### Tips for ear training
- **Sing it.** Humming the two notes back fixes them in your memory far better than listening alone.
- **Start with contrasts**: P5 vs M3 vs octave first, then add 4ths, then minor vs major 3rds.
- **Descending intervals** sound different from ascending ones. Practise both.
- **Harmonic** intervals have a colour of their own: 3rds and 6ths sound sweet, 2nds and 7ths rub, the tritone sounds tense.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'P5 descending', play: playInterval('C3', 'P5', 'descending') },
            { label: 'M3 descending', play: playInterval('C3', 'M3', 'descending') },
            { label: 'm3 descending', play: playInterval('C3', 'm3', 'descending') }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Use the **Ear training** tab daily for five minutes. Short, frequent sessions beat one long session a week.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which interval is this?', 'Perfect 4th', ['Perfect 5th', 'Major 3rd', 'Octave'], {
            play: playInterval('D3', 'P4'),
            explain: 'A **perfect 4th**: the start of "Here Comes the Bride".'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Major 3rd or minor 3rd?', 'Minor 3rd', ['Major 3rd'], {
            play: playInterval('A2', 'm3'),
            explain: 'A **minor 3rd** (3 half steps), the darker of the two. Think "Greensleeves".'
          })
        }
      ]
    },
    {
      id: 'u3l5',
      title: 'Inversions, consonance and dissonance',
      summary: 'Flipping intervals upside down, and why some sound smooth and some tense.',
      blocks: [
        {
          type: 'text',
          md: `### Inverting an interval
To **invert** an interval, move the lower note up an octave (or the top note down). C up to G is a **5th**; G up to C is a **4th**.

Two rules make inversions easy:
- The **numbers add up to 9**: 5th ↔ 4th, 3rd ↔ 6th, 2nd ↔ 7th.
- The **quality flips**: major ↔ minor, augmented ↔ diminished, perfect stays perfect.

And the half steps always add up to **12**.`
        },
        {
          type: 'fretboard',
          marks: [m(5, 3, 'C', 'root'), m(4, 5, 'G'), m(3, 5, 'C', 'root')],
          frets: [0, 7],
          caption: 'C → G is a perfect 5th (7 half steps). G → C above it is a perfect 4th (5 half steps). 7 + 5 = 12.'
        },
        {
          type: 'table',
          headers: ['Interval', 'Half steps', 'Inversion', 'Half steps'],
          rows: ['m2', 'M2', 'm3', 'M3', 'P4', 'A4'].map((iv) => {
            const inv = invert(iv)
            return [LONG(iv), String(parseInterval(iv).semitones), LONG(inv), String(parseInterval(inv).semitones)]
          })
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C up to E (M3)', play: playInterval('C3', 'M3') },
            { label: 'E up to C (m6)', play: playInterval('E3', 'm6') },
            { label: 'C up to G (P5)', play: playInterval('C3', 'P5') },
            { label: 'G up to C (P4)', play: playInterval('G3', 'P4') }
          ]
        },
        {
          type: 'text',
          md: `### Consonance and dissonance
Played together, some intervals blend smoothly (**consonant**) and others clash and want to move (**dissonant**). Neither is "good" or "bad"; music needs both. Tension that resolves is what makes music move.

- **Perfect consonances**: unison, octave, perfect 5th (and the 4th, depending on context). Hollow, strong, stable.
- **Imperfect consonances**: major and minor **3rds and 6ths**. Sweet and full. This is why harmonies "in 3rds" and "in 6ths" sound so good.
- **Dissonances**: **2nds, 7ths and the tritone**. They rub, buzz or pull toward resolution.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Octave', play: playInterval('C3', 'P8', 'harmonic') },
            { label: 'P5', play: playInterval('C3', 'P5', 'harmonic') },
            { label: 'M3', play: playInterval('C3', 'M3', 'harmonic') },
            { label: 'M6', play: playInterval('C3', 'M6', 'harmonic') },
            { label: 'm2', play: playInterval('C3', 'm2', 'harmonic') },
            { label: 'Tritone', play: playInterval('C3', 'A4', 'harmonic') },
            { label: 'M7', play: playInterval('C3', 'M7', 'harmonic') }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `The **tritone** splits the octave exactly in half and inverts to itself (A4 ↔ d5, 6 ↔ 6 half steps). It's the tense heart of the dominant 7th chord. You'll meet it again when we study chord progressions.`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'What is the inversion of a **major 3rd**? (Write it out, e.g. "minor 6th".)', accept: ['minor 6th', 'minor sixth', 'minor 6', 'min 6th'], explain: '3 + 6 = 9, and major flips to minor: a **minor 6th**. (4 + 8 = 12 half steps.)' }
        },
        {
          type: 'tryIt',
          question: mc('Listen. Consonant or dissonant?', 'Dissonant', ['Consonant'], {
            play: playInterval('E3', 'M7', 'harmonic'),
            explain: 'A **major 7th** played together: a sharp, buzzing **dissonance**.'
          })
        },
        {
          type: 'text',
          md: `### Inverted power chords and double stops
Flip the power chord from [[u3l6]] (5th on the bottom, root on top) and you get a **perfect 4th**: both notes at the **same fret** on adjacent strings. It's a thick, heavy sound used in a lot of hard rock.

Any two-note interval played together is called a **double stop**. 3rds and 6ths on adjacent or skipped strings are the sweet-sounding double stops of soul and country guitar.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Power chord (R + P5)', play: playInterval('A2', 'P5', 'harmonic') },
            { label: 'Inverted (P4)', play: playInterval('E2', 'P4', 'harmonic') },
            { label: 'Double stop in 3rds', play: playInterval('E3', 'M3', 'harmonic') },
            { label: 'Double stop in 6ths', play: playInterval('B2', 'M6', 'harmonic') }
          ]
        }
      ]
    },
    {
      id: 'u3l6',
      title: 'Power chords: two notes, huge sound',
      summary: 'Root + 5th (+ octave): the sound of rock guitar, explained.',
      blocks: [
        {
          type: 'text',
          md: `Every chord is named after its **root**, the note it is built on and the one that feels like home. A **power chord** is the simplest chord there is: just the **root** plus the note **7 frets higher**, which is one string over and two frets up. That second note is called the **fifth**. Often the root is doubled with a higher copy of itself (the **octave**) on top. Its symbol is a **5**: G5, A5, E5.

There's no third note to make it sound happy or sad, so a power chord is neither major nor minor. That's why it fits under almost any riff, and why it stays clear under heavy distortion: the simple 3:2 ratio of a fifth distorts cleanly, while fuller chords turn muddy.`
        },
        {
          type: 'chords',
          shapes: [E5, A5, G5, C5],
          caption: 'Open E5 and A5, then the movable shapes: G5 (root on the 6th string) and C5 (root on the 5th string).'
        },
        {
          type: 'fretboard',
          marks: [...shapeMarks(A5pc, 'A', 'interval'), ...shapeMarks(C5, 'C', 'interval')],
          frets: [1, 9],
          caption: 'A5 (root on the 6th string) and C5 (root on the 5th string): the same shape. Root, the fifth two frets up on the next string, octave (R) beside it.'
        },
        {
          type: 'tab',
          caption: 'A simple power-chord riff: E5, G5, A5, then C5. Palm-mute the eighth notes (rest the edge of your picking hand lightly on the strings by the bridge for a short, muffled thud).',
          events: [
            { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 6, fret: 3 }, { string: 5, fret: 5 }, { string: 4, fret: 5 }], beats: 1 },
            { pos: [{ string: 6, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 7 }], beats: 1 },
            { pos: [{ string: 6, fret: 3 }, { string: 5, fret: 5 }, { string: 4, fret: 5 }], beats: 1 },
            { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 3 }, { string: 4, fret: 5 }, { string: 3, fret: 5 }], beats: 1 },
            { pos: [{ string: 6, fret: 5 }, { string: 5, fret: 7 }, { string: 4, fret: 7 }], beats: 2 }
          ],
          bpm: 110
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G5', play: strum(G5) },
            { label: 'G major (with the 3rd)', play: strum(OPEN_CHORDS.G) },
            { label: 'A5 (6th-string root)', play: strum(A5pc) }
          ]
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'Spell the two different notes in a **D5** power chord.', answer: ['D', 'A'], ordered: false, explain: 'Root D plus the note 7 frets higher (the fifth), **A**. (The octave adds another D.)' }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'Build a power chord on the **C** at the 8th fret of the 6th string: click its **5th**.',
            marks: [m(6, 8, 'C', 'root')],
            frets: [5, 12],
            targets: pitchPositions(midiAt({ string: 6, fret: 8 }) + 7, 5, 12),
            explain: 'Next string, two frets up: **5th string, 10th fret** (G). That’s a C5. (The 4th string, 5th fret is the same G.)'
          }
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('How many half steps are in a **major 3rd**?', '4', ['3', '5', '2'], { explain: 'Major 3rd = **4** half steps; minor 3rd = 3.' }),
      mc('How many half steps are in a **perfect 5th**?', '7', ['5', '6', '8'], { explain: 'Perfect 5th = **7** half steps, e.g. C → G.' }),
      mc('Which interval is **6 half steps**?', 'The tritone (augmented 4th / diminished 5th)', ['Perfect 4th', 'Perfect 5th', 'Minor 6th'], {
        explain: 'Six half steps, half an octave: the **tritone**.'
      }),
      { kind: 'spell', prompt: 'Spell the note a **major 3rd above D**.', answer: ['F#'], explain: 'D–E–F: the letter must be F; D→F is only 3 half steps, so raise it: **F♯**.' },
      { kind: 'spell', prompt: 'Spell the note a **perfect 5th above B♭**.', answer: ['F'], explain: 'B♭–C–D–E♭–F: five letters, 7 half steps: **F**.' },
      { kind: 'text', prompt: 'What is the inversion of a **minor 3rd**? (Write it out, e.g. "major 6th".)', accept: ['major 6th', 'major sixth', 'major 6', 'maj 6th'], explain: '3 + 6 = 9 and minor flips to major: **major 6th**.' },
      mc('Two notes at the **same fret** on adjacent strings (not G–B) form a…', 'perfect 4th', ['perfect 5th', 'major 3rd', 'octave'], {
        explain: 'Adjacent strings are tuned a **4th** apart, except G–B (a major 3rd).'
      }),
      mc('Why do interval shapes move up a fret when crossing from the G string to the B string?', 'G and B are a major 3rd apart; every other adjacent pair is a perfect 4th', [
        'The B string is thicker',
        'B has no sharp',
        'Because the frets get closer together'
      ]),
      {
        kind: 'fretboard',
        prompt: 'The root **C** is marked. Click the **perfect 5th** above it.',
        marks: [m(5, 3, 'C', 'root')],
        targets: pitchPositions(midiAt(C_ROOT) + 7),
        explain: 'Next string, two frets up: **4th string, 5th fret** (G). The open G string and the 10th fret of the A string are the same pitch.'
      },
      {
        kind: 'fretboard',
        prompt: 'The root **A** is marked. Click the **major 3rd** above it.',
        marks: [m(6, 5, 'A', 'root')],
        targets: pitchPositions(midiAt({ string: 6, fret: 5 }) + 4),
        explain: 'Next string, one fret back: **5th string, 4th fret** (C♯). Also on the 6th string at fret 9.'
      },
      taught('u3l6', mc('A power chord contains…', 'the root and the perfect 5th (often doubled at the octave)', ['the root, major 3rd and 5th', 'the root and the major 3rd', 'the root, 4th and 5th'], {
        explain: 'Root + **P5** (+ octave). No 3rd, so it’s neither major nor minor.'
      })),
      mc('"Here Comes the Bride" opens with which ascending interval?', 'Perfect 4th', ['Perfect 5th', 'Major 3rd', 'Major 6th']),
      mc('A **harmonic** interval is one where the notes are…', 'played at the same time', ['played one after the other', 'an octave apart', 'consonant']),
      mc('Listen (played together). Consonant or dissonant?', 'Dissonant', ['Consonant'], {
        play: playInterval('C3', 'm2', 'harmonic'),
        explain: 'A **minor 2nd** together: the most dissonant interval, a sharp rub.'
      }),
      mc('Listen. Which interval is this?', 'Perfect 5th', ['Major 3rd', 'Octave', 'Minor 2nd'], {
        play: playInterval('E3', 'P5'),
        explain: 'A **perfect 5th**, "Twinkle Twinkle".'
      }),
      mc('Listen. Major 3rd or minor 3rd?', 'Minor 3rd', ['Major 3rd'], {
        play: playInterval('C3', 'm3'),
        explain: 'C → E♭: a **minor 3rd**, darker than the major 3rd.'
      })
    ],
    generators: [semitonesQ, spellIntervalQ, nameIntervalQ, fretboardIntervalQ, earIntervalQ]
  }
}

export default unit
