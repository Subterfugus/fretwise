import type { PlaySpec, QuizQuestion, Unit } from '../types'
import { distractors, m, mc, rand, randInt, shuffle, strum } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, movableChord, OPEN_CHORDS, pcAt, shapeMidis } from '@/theory/guitar'
import { chordNames, chordSymbol, ChordType, diatonicChords } from '@/theory/chords'
import { mod, pitchClass } from '@/theory/notes'

// ---------- local helpers ----------

const lowestFret = (s: ChordShape) => Math.min(...s.frets.filter((f): f is number => f !== null))

/** A practical guitar voicing: open chord if there is one, else the lowest E- or A-shape barre. */
function guitarChord(root: string, type: ChordType): ChordShape {
  const sym = chordSymbol(root, type)
  if (OPEN_CHORDS[sym]) return OPEN_CHORDS[sym]
  if (type === 'dim') {
    // x R ♭5 R ♭3 x, root on the 5th string (like Bdim = x2343x)
    const f = mod(pitchClass(root) - pcAt({ string: 5, fret: 0 }), 12)
    return { name: sym, frets: [null, f, f + 1, f + 2, f + 1, null] }
  }
  const cands = [movableChord(root, type, 6), movableChord(root, type, 5)].filter((x): x is ChordShape => x !== null)
  return cands.sort((a, b) => lowestFret(a) - lowestFret(b))[0]
}

/** Shapes for the given scale degrees (1-7) in a major key. */
function keyShapes(key: string, degrees: number[]): ChordShape[] {
  const dc = diatonicChords(key)
  return degrees.map((d) => guitarChord(dc[d - 1].root, dc[d - 1].type))
}

/** Strum a progression of degrees in a key. The last chord rings longer. */
function progression(key: string, degrees: number[], beats = 2, bpm = 96, lastBeats = 4): PlaySpec {
  const shapes = keyShapes(key, degrees)
  return {
    kind: 'sequence',
    bpm,
    toolExample: progressionExample(key, romansOf(degrees), 'major', bpm, beats),
    events: shapes.map((s, i) => ({ notes: shapeMidis(s), beats: i === shapes.length - 1 ? lastBeats : beats, mode: 'strum' as const }))
  }
}

const shapesSeq = (shapes: ChordShape[], beats = 2, bpm = 90, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: shapes.map((s, i) => ({ notes: shapeMidis(s), beats: i === shapes.length - 1 ? beats * 2 : beats, mode: 'strum' as const }))
})

const symbolsIn = (key: string, degrees: number[]) => {
  const dc = diatonicChords(key)
  return degrees.map((d) => dc[d - 1].symbol)
}
const romansOf = (degrees: number[]) => {
  const dc = diatonicChords('C')
  return degrees.map((d) => dc[d - 1].roman)
}
const NASH = ['1', '2m', '3m', '4', '5', '6m', '7°']
const nashOf = (degrees: number[]) => degrees.map((d) => NASH[d - 1])

const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb']

// ---------- cadences ----------

type Cadence = 'Authentic (V → I)' | 'Plagal (IV → I)' | 'Half (ends on V)' | 'Deceptive (V → vi)'
const CADENCES: { name: Cadence; degrees: number[]; why: string }[] = [
  { name: 'Authentic (V → I)', degrees: [1, 4, 5, 1], why: 'The V chord resolves home to I: the strongest, most final ending.' },
  { name: 'Plagal (IV → I)', degrees: [1, 6, 4, 1], why: 'IV moves straight to I: a softer "Amen" ending, no V chord at the end.' },
  { name: 'Half (ends on V)', degrees: [1, 6, 2, 5], why: 'The phrase stops on V, so it sounds like a question, unfinished.' },
  { name: 'Deceptive (V → vi)', degrees: [1, 4, 5, 6], why: 'V sets up the return home, but we land on vi instead: a surprise.' }
]

// ---------- generated questions ----------

const romanOfChord = (): QuizQuestion => {
  const key = rand(KEYS)
  const dc = diatonicChords(key)
  const c = rand(dc)
  const wrong = distractors(dc.map((x) => x.roman), c.roman, 3)
  return mc(`In the key of **${key} major**, what Roman numeral is the **${c.symbol}** chord?`, c.roman, wrong, {
    explain: `${key} major: ${dc.map((x) => `${x.symbol} (${x.roman})`).join(', ')}. ${c.symbol} is built on degree ${c.degree}, so it's **${c.roman}**.`
  })
}

const chordOfRoman = (): QuizQuestion => {
  const key = rand(KEYS)
  const dc = diatonicChords(key)
  const c = rand(dc)
  const flip: ChordType = c.type === 'maj' ? 'min' : 'maj'
  const wrong = [...distractors(dc.map((x) => x.symbol), c.symbol, 2), chordSymbol(c.root, flip)]
  return mc(`What is the **${c.roman}** chord in **${key} major**?`, c.symbol, wrong, {
    explain: `Degree ${c.degree} of ${key} major is ${c.root}, and the quality pattern (I ii iii IV V vi vii°) makes it ${c.type === 'maj' ? 'major' : c.type === 'min' ? 'minor' : 'diminished'}: **${c.symbol}**.`
  })
}

const spellDiatonic = (): QuizQuestion => {
  const key = rand(['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'])
  const dc = diatonicChords(key)
  const c = dc[randInt(1, 6)] // skip I; the others are more interesting
  const notes = chordNames(c.root, c.type)
  return {
    kind: 'spell',
    prompt: `Spell the **${c.roman}** chord in **${key} major** (root, 3rd, 5th).`,
    answer: notes,
    explain: `Stack 3rds from degree ${c.degree} using only notes of ${key} major: **${notes.join(' – ')}** (${c.symbol}).`
  }
}

const PROGS: { degrees: number[]; name: string }[] = [
  { degrees: [1, 4, 5], name: 'I – IV – V' },
  { degrees: [1, 5, 6, 4], name: 'I – V – vi – IV' },
  { degrees: [2, 5, 1], name: 'ii – V – I' },
  { degrees: [6, 4, 1, 5], name: 'vi – IV – I – V' },
  { degrees: [1, 6, 4, 5], name: 'I – vi – IV – V' },
  { degrees: [1, 4, 6, 5], name: 'I – IV – vi – V' }
]

const transposeChart = (): QuizQuestion => {
  const p = rand(PROGS)
  const keys = shuffle(['C', 'G', 'D', 'A', 'E', 'F'])
  const key = keys[0]
  const show = (k: string) => symbolsIn(k, p.degrees).join(' – ')
  return mc(`Play the Nashville chart **${nashOf(p.degrees).join(' – ')}** in the key of **${key}**.`, show(key), keys.slice(1, 4).map(show), {
    play: progression(key, p.degrees),
    explain: `In ${key}: ${diatonicChords(key)
      .map((x, i) => `${NASH[i]} = ${x.symbol}`)
      .join(', ')}. So the chart is **${show(key)}** (${p.name}).`
  })
}

const listenCadence = (): QuizQuestion => {
  const key = rand(['C', 'G', 'D', 'A'])
  const c = rand(CADENCES)
  return mc(`Listen to this phrase in ${key} major. Which cadence ends it?`, c.name, CADENCES.map((x) => x.name), {
    play: progression(key, c.degrees),
    explain: `The chords were **${symbolsIn(key, c.degrees).join(' – ')}** (${romansOf(c.degrees).join(' – ')}). ${c.why}`
  })
}

// ---------- shapes used in lessons ----------

const C_DIATONIC = keyShapes('C', [1, 2, 3, 4, 5, 6, 7])
const G_DIATONIC = keyShapes('G', [1, 2, 3, 4, 5, 6, 7])

// ---------- unit ----------

const unit: Unit = {
  id: 'u7',
  number: 7,
  title: 'Diatonic harmony',
  summary: 'The seven chords of a major key, Roman numerals, tonic/subdominant/dominant, the progressions behind thousands of songs, cadences, and the Nashville number system.',
  lessons: [
    // ------------------------------------------------------------------
    {
      id: 'u7l1',
      title: 'Seven chords from one scale',
      summary: 'Stack 3rds on every note of the major scale.',
      blocks: [
        {
          type: 'text',
          md: `In [[u5l1]] you built a triad by taking every other note of a scale, starting on the root. Now do it starting on **every** note of the C major scale, using only notes from the scale (no sharps or flats):

1. **C** – E – G → C major
2. **D** – F – A → D minor
3. **E** – G – B → E minor
4. **F** – A – C → F major
5. **G** – B – D → G major
6. **A** – C – E → A minor
7. **B** – D – F → B diminished

These seven chords are the **diatonic chords** of C major ("diatonic" means "belonging to the key"). Almost every pop, rock, folk and country song in C uses mostly these chords.`
        },
        {
          type: 'staff',
          caption: 'Triads on each degree of the C major scale.',
          notes: [
            { keys: ['C/4', 'E/4', 'G/4'], duration: 'h' },
            { keys: ['D/4', 'F/4', 'A/4'], duration: 'h' },
            { keys: ['E/4', 'G/4', 'B/4'], duration: 'h' },
            { keys: ['F/4', 'A/4', 'C/5'], duration: 'h' },
            { keys: ['G/4', 'B/4', 'D/5'], duration: 'h' },
            { keys: ['A/4', 'C/5', 'E/5'], duration: 'h' },
            { keys: ['B/4', 'D/5', 'F/5'], duration: 'h' },
            { keys: ['C/5', 'E/5', 'G/5'], duration: 'h' }
          ]
        },
        {
          type: 'text',
          md: `### Why are some major and some minor?
The scale has whole and half steps in a fixed order (W W H W W W H), so the 3rds you stack aren't all the same size. On C, D and E you get different combinations of major and minor 3rds. The result is a pattern that is the **same in every major key**:

**Major – minor – minor – Major – Major – minor – diminished**

Learn that pattern and you know the chords of every major key.`
        },
        {
          type: 'table',
          headers: ['Degree', '1', '2', '3', '4', '5', '6', '7'],
          rows: [
            ['Chord', ...diatonicChords('C').map((c) => c.symbol)],
            ['Notes', ...diatonicChords('C').map((c) => chordNames(c.root, c.type).join(' '))],
            ['Quality', 'major', 'minor', 'minor', 'major', 'major', 'minor', 'dim']
          ],
          caption: 'The diatonic triads of C major.'
        },
        {
          type: 'chords',
          shapes: C_DIATONIC,
          caption: 'C, Dm, Em, F, G, Am and B° on the guitar. Click to strum.'
        },
        {
          type: 'audio',
          label: 'The seven chords of C major, up the scale',
          play: shapesSeq([...C_DIATONIC, OPEN_CHORDS.C], 1.5, 90),
          toolExamples: [{ ...progressionExample('C', ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'I'], 'major', 90, 2), label: 'C major diatonic chords' }]
        },
        {
          type: 'fretboard',
          marks: [m(5, 3, 'C', 'root'), m(5, 5, 'Dm'), m(5, 7, 'Em'), m(5, 8, 'F'), m(5, 10, 'G'), m(5, 12, 'Am'), m(5, 2, 'B°', 'accent')],
          frets: [0, 12],
          caption: 'The roots of the diatonic chords of C on the A string: the C major scale.',
          playAll: true
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**The odd one out.** The chord on the 7th degree is **diminished** (B – D – F: two minor 3rds). It's rarely strummed as a plain triad in pop music, but it has a strong pull toward the tonic, which you'll understand in the lesson on functions.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the chord built on the **3rd degree** of C major.',
            answer: ['E', 'G', 'B'],
            explain: 'Start on E and take every other scale note: **E – G – B**, E minor.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Which chord is **not** diatonic to C major?', 'D major', ['D minor', 'F major', 'A minor'], {
            explain: 'D major needs F♯, which is not in C major. The diatonic chord on D is **D minor** (D F A).'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u7l2',
      title: 'Roman numerals: one pattern, every key',
      summary: 'Name chords by scale degree so a progression works in any key.',
      blocks: [
        {
          type: 'text',
          md: `Musicians name diatonic chords with **Roman numerals** for the scale degree they're built on. The case shows the quality:
- **UPPERCASE** = major: I, IV, V
- **lowercase** = minor: ii, iii, vi
- **lowercase + °** = diminished: vii°

So every major key has the same seven chords, in Roman numerals:

**I – ii – iii – IV – V – vi – vii°**

The power of this is that **G – C – D** in the key of G and **A – D – E** in the key of A are both just **I – IV – V**. Learn the numerals and you can play a song in any key.

And now you know why the 12-bar blues from [[u8l5]] uses I, IV and V: they're the chords built on notes 1, 4 and 5 of the key.`
        },
        {
          type: 'table',
          headers: ['Key', 'I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
          rows: ['C', 'G', 'D', 'A', 'E', 'F'].map((k) => [k, ...diatonicChords(k).map((c) => c.symbol)]),
          caption: 'Diatonic triads in the six most guitar-friendly major keys.'
        },
        {
          type: 'chords',
          shapes: G_DIATONIC,
          caption: 'The key of G on guitar: G, Am, Bm, C, D, Em, F♯°.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'I – IV – V – I in G', play: progression('G', [1, 4, 5, 1]) },
            { label: 'I – IV – V – I in C', play: progression('C', [1, 4, 5, 1]) },
            { label: 'I – IV – V – I in A', play: progression('A', [1, 4, 5, 1]) }
          ]
        },
        {
          type: 'text',
          md: `### Finding the numerals on the neck
The diatonic chords sit on the notes of the scale. With barre chords, the I, IV and V of any key form a compact block. With the I chord's root on the 6th string, the **IV** is on the 5th string at the **same fret**, and the **V** is on the 5th string **two frets higher**:`
        },
        {
          type: 'fretboard',
          marks: [m(6, 3, 'I', 'root'), m(5, 3, 'IV', 'tone'), m(5, 5, 'V', 'accent'), m(6, 0, 'vi', 'blue'), m(5, 0, 'ii', 'blue'), m(5, 2, 'iii', 'blue')],
          frets: [0, 7],
          caption: 'Roots of the chords in G: I (G) on the 6th string; IV (C) and V (D) on the 5th; vi (Em), ii (Am) and iii (Bm) nearby.'
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**This block is movable.** Slide the same I–IV–V root pattern so the I is at the 5th fret and you're in A (A, D, E). At the 8th fret you're in C (C, F, G). That's the rock-and-blues player's secret to playing in any key.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'What is the **V** chord in the key of **D**?',
            accept: ['A', 'A major', 'Amaj'],
            explain: 'D major: D E F♯ G **A** B C♯. The 5th degree is A, and V is major: **A**.'
          }
        },
        {
          type: 'tryIt',
          question: mc('In the key of **A**, what is the **vi** chord?', 'F♯m', ['F♯', 'Fm', 'E'], {
            explain: 'The 6th degree of A major is F♯, and vi is minor: **F♯m**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u7l3',
      title: 'Tonic, subdominant, dominant',
      summary: 'Why some chords feel like home and others want to move.',
      blocks: [
        {
          type: 'text',
          md: `Each diatonic chord has a **job**. Musicians group them into three **functions**:
- **Tonic (home)**: **I**, and its stand-ins **vi** and **iii**. Stable, at rest.
- **Subdominant (moving away)**: **IV** and **ii**. Leaves home and creates gentle motion.
- **Dominant (tension)**: **V** and **vii°**. Strongly wants to return to I.

Most progressions tell a little story: **home → away → tension → home**. That's I – IV – V – I in its simplest form.`
        },
        {
          type: 'table',
          headers: ['Function', 'Chords', 'In C', 'In G', 'Feels'],
          rows: [
            ['Tonic', 'I, vi, (iii)', 'C, Am, (Em)', 'G, Em, (Bm)', 'home, resolved'],
            ['Subdominant', 'IV, ii', 'F, Dm', 'C, Am', 'moving away'],
            ['Dominant', 'V, vii°', 'G, B°', 'D, F#°', 'tension, pulls home']
          ],
          caption: 'iii is sometimes classed as tonic, sometimes as a weak dominant: it shares two notes with both I and V.'
        },
        {
          type: 'text',
          md: `### Why V pulls to I: the leading tone
The V chord contains the **7th note of the scale**, called the **leading tone**. It sits just **one half step below the tonic**, and our ears want it to rise. In C, the V chord G contains **B**, and B wants to move up to **C**.

On the guitar you can see this when you change from G to C: the B on the A string (2nd fret) moves up to C (3rd fret), and the open B string moves up to C (1st fret).`
        },
        {
          type: 'fretboard',
          marks: [m(5, 2, 'B', 'accent'), m(5, 3, 'C', 'root'), m(2, 0, 'B', 'accent'), m(2, 1, 'C', 'root')],
          frets: [0, 5],
          caption: 'Leading tone (B) resolving up a half step to the tonic (C), on the 5th and 2nd strings.',
          playAll: true
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G alone (unfinished)', play: strum(OPEN_CHORDS.G) },
            { label: 'G → C (resolved)', play: shapesSeq([OPEN_CHORDS.G, OPEN_CHORDS.C], 2, 80, progressionExample('C', ['V', 'I'], 'major', 80, 2)) },
            { label: 'G7 → C (even stronger)', play: shapesSeq([OPEN_CHORDS.G7, OPEN_CHORDS.C], 2, 80, progressionExample('C', ['V7', 'I'], 'major', 80, 2)) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Adding the 7th.** A G7 chord (G B D **F**) adds the 4th degree, F, which wants to fall a half step to E. B rises to C, F falls to E: two half-step pulls at once. The interval B–F is a **tritone**, the most unstable interval in the scale. You'll explore 7th chords fully in [[preview:u9l1]].`
        },
        {
          type: 'text',
          md: `### Swapping chords with the same function
Chords with the same function share notes, so they can often replace each other. **vi** (Am: A C E) shares two notes with **I** (C: C E G), so it can stand in for home with a sadder colour. **ii** (Dm: D F A) shares two notes with **IV** (F: F A C).`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C – F – G – C', play: progression('C', [1, 4, 5, 1]) },
            { label: 'C – Dm – G – C (ii for IV)', play: progression('C', [1, 2, 5, 1]) },
            { label: 'Am – F – G – Am (vi for I)', play: progression('C', [6, 4, 5, 6]) }
          ]
        },
        {
          type: 'tryIt',
          question: mc('Which two chords have **dominant** function in a major key?', 'V and vii°', ['IV and ii', 'I and vi', 'iii and IV'], {
            explain: 'Both **V** and **vii°** contain the leading tone, which pulls up to the tonic.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'What is the **leading tone** in the key of **G** major?',
            accept: ['F#', 'F♯', 'F sharp'],
            explain: 'The 7th degree of G major is **F♯**, a half step below G. It is the 3rd of the V chord, D.'
          }
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u7l4',
      title: 'The progressions everyone plays',
      summary: 'I–IV–V, I–V–vi–IV, ii–V–I, vi–IV–I–V and the 50s progression.',
      blocks: [
        {
          type: 'text',
          md: `A handful of progressions turn up again and again across styles. Learn them in Roman numerals and you'll recognise them everywhere and play them in any key.

### I – IV – V
The backbone of blues, rock'n'roll, folk and country. Three major chords: home, away, tension. In G: **G – C – D**.`
        },
        {
          type: 'audio',
          label: 'I – IV – V – I in G (G – C – D – G)',
          play: progression('G', [1, 4, 5, 1])
        },
        {
          type: 'text',
          md: `### I – V – vi – IV
The modern pop progression, heard in countless hits. In C: **C – G – Am – F**. In G: **G – D – Em – C**.

### vi – IV – I – V
The same four chords starting on vi. Beginning on the minor chord gives it a moodier feel. In C: **Am – F – C – G**.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'I – V – vi – IV in C', play: progression('C', [1, 5, 6, 4]) },
            { label: 'vi – IV – I – V in C', play: progression('C', [6, 4, 1, 5]) },
            { label: 'I – V – vi – IV in G', play: progression('G', [1, 5, 6, 4]) }
          ]
        },
        {
          type: 'text',
          md: `### I – vi – IV – V: the "50s progression"
The sound of doo-wop ballads, and still going strong. In C: **C – Am – F – G**. A variant swaps IV for ii: **I – vi – ii – V**.

### ii – V – I
The core of jazz harmony. Subdominant → dominant → tonic in its smoothest form. In C: **Dm – G – C**. Jazz players usually add 7ths (Dm7 – G7 – Cmaj7), which you'll learn in [[preview:u9l1]].`
        },
        {
          type: 'audioRow',
          items: [
            { label: '50s: C – Am – F – G', play: progression('C', [1, 6, 4, 5], 2, 96, 2) },
            { label: 'ii – V – I in C (triads)', play: progression('C', [2, 5, 1]) },
            { label: 'ii – V – I with 7ths', play: shapesSeq([OPEN_CHORDS.Dm7, OPEN_CHORDS.G7, OPEN_CHORDS.Cmaj7], 2, 90, progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 90, 2)) }
          ]
        },
        {
          type: 'table',
          headers: ['Progression', 'Key of C', 'Key of G', 'Key of D'],
          rows: PROGS.slice(0, 5).map((p) => [p.name, ...['C', 'G', 'D'].map((k) => symbolsIn(k, p.degrees).join(' – '))]),
          caption: 'The common progressions in three keys.',
          toolExamples: PROGS.slice(0, 5).flatMap((p) => ['C', 'G', 'D'].map((key) => ({ ...progressionExample(key, romansOf(p.degrees), 'major'), label: `${key}: ${p.name}` })))
        },
        {
          type: 'tab',
          bpm: 100,
          notation: false,
          caption: 'I – V – vi – IV in G with open chords (G – D – Em – C).',
          toolExamples: [progressionExample('G', ['I', 'V', 'vi', 'IV'], 'major', 100, 2)],
          events: keyShapes('G', [1, 5, 6, 4]).map((s) => ({
            pos: s.frets.flatMap((f, i) => (f === null ? [] : [{ string: 6 - i, fret: f }])),
            beats: 2
          }))
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Practice:** play each progression with a simple down-down-up-up-down-up strum, four beats per chord. Then say the Roman numerals out loud as you change. When you hear a song on the radio, try to spot which of these progressions it uses.`
        },
        {
          type: 'tryIt',
          question: mc('In the key of G, **G – D – Em – C** is…', 'I – V – vi – IV', ['I – IV – V – I', 'vi – IV – I – V', 'I – vi – IV – V'], {
            explain: 'G = I, D = V, Em = vi, C = IV: **I – V – vi – IV**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which is the **ii – V – I** in the key of **F**?', 'Gm – C – F', ['G – C – F', 'Dm – C – F', 'Gm – Bb – F'], {
            explain: 'F major: ii = Gm, V = C, I = F. So **Gm – C – F**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u7l5',
      title: 'Cadences: how phrases end',
      summary: 'Authentic, plagal, half and deceptive endings.',
      blocks: [
        {
          type: 'text',
          md: `A **cadence** is the chord move at the end of a musical phrase, like punctuation at the end of a sentence. There are four main types:

- **Authentic cadence: V → I.** A full stop. The strongest sense of arrival.
- **Plagal cadence: IV → I.** A gentler ending, the "Amen" at the end of hymns. Common in rock and gospel.
- **Half cadence: ends on V.** A comma or question mark. The phrase pauses on tension and waits for more.
- **Deceptive cadence: V → vi.** The music sets up V → I, then swerves to vi. A surprise that keeps things going.`
        },
        {
          type: 'table',
          headers: ['Cadence', 'Chords', 'In C', 'In G', 'Punctuation'],
          rows: [
            ['Authentic', 'V → I', 'G → C', 'D → G', 'full stop .'],
            ['Plagal', 'IV → I', 'F → C', 'C → G', 'soft full stop'],
            ['Half', '… → V', '… → G', '… → D', 'comma , or ?'],
            ['Deceptive', 'V → vi', 'G → Am', 'D → Em', 'surprise !']
          ],
          toolExamples: ['C', 'G'].flatMap((key) => [['V', 'I'], ['IV', 'I'], ['V', 'vi']].map((romans) => ({ ...progressionExample(key, romans, 'major'), label: `${key}: ${romans.join(' – ')}` })))
        },
        {
          type: 'audioRow',
          items: CADENCES.map((c) => ({ label: `${c.name.split(' ')[0]}: ${symbolsIn('C', c.degrees).join(' – ')}`, play: progression('C', c.degrees) }))
        },
        {
          type: 'text',
          md: `### Hearing the difference
Listen to the **last two chords** and ask:
1. Does it sound **finished**? If so, it's authentic or plagal. Authentic has that strong "pull" from V; plagal is softer and more open.
2. Does it sound **unfinished**, like it's waiting? That's a half cadence.
3. Did it seem about to finish but went somewhere **unexpected** and a bit sad? Deceptive.`
        },
        {
          type: 'audioRow',
          items: CADENCES.map((c) => ({ label: `${c.name.split(' ')[0]} in G`, play: progression('G', c.degrees) }))
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Songwriting trick:** end your verse with a half cadence (on V) so the listener leans forward into the chorus, and end the chorus with an authentic cadence (V → I) so it lands. Use a deceptive cadence when you want one more time round before the real ending.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which cadence ends this phrase?', 'Deceptive (V → vi)', CADENCES.map((c) => c.name), {
            play: progression('D', [1, 4, 5, 6]),
            explain: 'D – G – A – Bm: the A (V) leads us to expect D, but we land on **Bm (vi)**. That\'s a deceptive cadence.'
          })
        },
        {
          type: 'tryIt',
          question: mc('A phrase ending **IV → I** is a…', 'Plagal cadence', ['Authentic cadence', 'Half cadence', 'Deceptive cadence'], {
            explain: 'IV → I is the **plagal**, or "Amen", cadence.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u7l6',
      title: 'Transposing and the Nashville number system',
      summary: 'Write songs as numbers and play them in any key.',
      blocks: [
        {
          type: 'text',
          md: `**Transposing** means moving a song to a different key, usually to suit a singer's voice. If you think in scale degrees, it's easy: work out the numerals in the old key and rebuild them in the new one.

Nashville session players do exactly this with the **Nashville number system**. Instead of chord names, a chart uses plain numbers for the scale degrees, with an **m** for minor:

**1 – 2m – 3m – 4 – 5 – 6m – 7°**

A chart that reads **1 – 5 – 6m – 4** works in any key. The bandleader calls "in A" and everyone plays A – E – F♯m – D.`
        },
        {
          type: 'table',
          headers: ['Key', '1', '5', '6m', '4'],
          rows: ['C', 'G', 'D', 'A', 'E'].map((k) => [k, ...symbolsIn(k, [1, 5, 6, 4])]),
          caption: 'One Nashville chart, “1 – 5 – 6m – 4”, in five keys.'
        },
        {
          type: 'audioRow',
          items: [
            { label: '1 – 5 – 6m – 4 in C', play: progression('C', [1, 5, 6, 4]) },
            { label: '… in D', play: progression('D', [1, 5, 6, 4]) },
            { label: '… in E', play: progression('E', [1, 5, 6, 4]) }
          ]
        },
        {
          type: 'text',
          md: `### Transposing step by step
Move **G – Em – C – D** from G to D:
1. Write the numbers in G: G = **1**, Em = **6m**, C = **4**, D = **5**.
2. Build the D major scale: D E F♯ G A B C♯.
3. Rebuild the chords: 1 = **D**, 6m = **Bm**, 4 = **G**, 5 = **A**.

Result: **D – Bm – G – A**. Same song, new key.`
        },
        {
          type: 'chords',
          shapes: [...keyShapes('G', [1, 6, 4, 5]), ...keyShapes('D', [1, 6, 4, 5])],
          caption: 'G – Em – C – D (key of G) and D – Bm – G – A (key of D): the same 1 – 6m – 4 – 5.'
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**The capo shortcut.** A capo raises every chord by the number of frets you clamp. Play G-shape chords (G – Em – C – D) with a capo at the **2nd fret** and you're actually in **A** (A – F♯m – D – E). Guitarists use this to keep easy open shapes in any key. More in [[u15l2]].`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G – Em – C – D', play: progression('G', [1, 6, 4, 5]) },
            { label: 'Same shapes, capo 2 (key of A)', play: progression('A', [1, 6, 4, 5]) }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Play the chart **1 – 4 – 5** in the key of **A**. Type the three chord roots.',
            answer: ['A', 'D', 'E'],
            explain: 'A major: **A** B C♯ **D E** F♯ G♯. So 1 – 4 – 5 = **A – D – E**.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Transpose **C – Am – F – G** into the key of **G**.', 'G – Em – C – D', ['G – Am – C – D', 'G – Em – D – C', 'G – Bm – C – D'], {
            explain: 'In C: 1 – 6m – 4 – 5. In G: 1 = G, 6m = Em, 4 = C, 5 = D, so **G – Em – C – D**.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('What is the pattern of triad qualities in a major key (I to vii)?', 'Maj – min – min – Maj – Maj – min – dim', [
        'Maj – min – Maj – min – Maj – min – dim',
        'Maj – Maj – min – min – Maj – min – dim',
        'min – Maj – Maj – min – min – Maj – dim'
      ], {
        explain: 'I, IV and V are major; ii, iii and vi are minor; vii° is diminished.'
      }),
      mc('In the key of C, which chord is **vi**?', 'Am', ['A', 'Em', 'F'], {
        explain: 'The 6th degree of C is A, and vi is minor: **Am**.'
      }),
      { kind: 'text', prompt: 'What is the **IV** chord in the key of **G**?', accept: ['C', 'C major', 'Cmaj'], explain: 'G A B **C** D E F♯: the 4th degree is C, major: **C**.' },
      mc('Which chord in a major key is **diminished**?', 'vii°', ['ii', 'iii', 'IV'], {
        explain: 'Only the 7th-degree triad has two minor 3rds: **vii°**.'
      }),
      { kind: 'spell', prompt: 'Spell the **V** chord in the key of **D**.', answer: ['A', 'C#', 'E'], explain: 'V of D is A major: **A – C♯ – E**. C♯ is the leading tone of D.' },
      mc('Which chords have **subdominant** function?', 'IV and ii', ['V and vii°', 'I and vi', 'I and V'], {
        explain: 'IV and ii share two notes and both move the music away from home.'
      }),
      mc('**G – C – D** in the key of G is…', 'I – IV – V', ['I – V – vi', 'ii – V – I', 'I – III – IV'], {
        explain: 'G = I, C = IV, D = V.'
      }),
      mc('Which is the **ii – V – I** in C?', 'Dm – G – C', ['D – G – C', 'Dm – F – C', 'Em – G – C'], {
        explain: 'ii = Dm, V = G, I = C.'
      }),
      mc('The "50s progression" is…', 'I – vi – IV – V', ['I – IV – V – I', 'vi – IV – I – V', 'ii – V – I'], {
        explain: 'C – Am – F – G in C: **I – vi – IV – V**.'
      }),
      mc('What makes the V chord pull so strongly to I?', 'It contains the leading tone, a half step below the tonic', [
        'It is the loudest chord in the key',
        'It contains the tonic note',
        'It is a minor chord'
      ], {
        explain: 'The 3rd of V is the 7th degree of the scale (B in C), which wants to rise a half step to the tonic.'
      }),
      { kind: 'spell', prompt: 'Play the Nashville chart **1 – 4 – 5** in **E**. Type the three chord roots.', answer: ['E', 'A', 'B'], explain: 'E major: **E** F♯ G♯ **A B** C♯ D♯, so 1 – 4 – 5 = **E – A – B**.' },
      mc('Transpose **G – Em – C – D** to the key of **D**.', 'D – Bm – G – A', ['D – Em – G – A', 'D – Bm – G – E', 'D – F#m – G – A'], {
        explain: '1 – 6m – 4 – 5 in D is **D – Bm – G – A**.'
      }),
      mc('Listen. Which cadence ends this phrase?', 'Authentic (V → I)', CADENCES.map((c) => c.name), {
        play: progression('C', [1, 4, 5, 1]),
        explain: 'C – F – G – C: the phrase ends **G → C, V → I**. A full stop.'
      }),
      mc('Listen. Which cadence ends this phrase?', 'Plagal (IV → I)', CADENCES.map((c) => c.name), {
        play: progression('G', [1, 6, 4, 1]),
        explain: 'G – Em – C – G: it ends **C → G, IV → I**. The soft "Amen" ending.'
      }),
      mc('Listen. Which cadence ends this phrase?', 'Half (ends on V)', CADENCES.map((c) => c.name), {
        play: progression('C', [1, 6, 2, 5]),
        explain: 'C – Am – Dm – G: it stops on **G (V)** and sounds unfinished.'
      }),
      mc('Listen. Which cadence ends this phrase?', 'Deceptive (V → vi)', CADENCES.map((c) => c.name), {
        play: progression('G', [1, 4, 5, 6]),
        explain: 'G – C – D – Em: D (V) leads you to expect G, but it goes to **Em (vi)**.'
      })
    ],
    generators: [romanOfChord, chordOfRoman, spellDiatonic, transposeChart, listenCadence]
  }
}

export default unit
