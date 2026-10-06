import type { PlaySpec, QuizQuestion, Unit } from '../types'
import type { SeqEvent } from '@/audio/engine'
import { progressionExample, type ToolExample } from '../toolExamples'
import { m, mc, rand, randInt, distractors } from '../helpers'
import { ChordShape, OPEN_CHORDS, midiAt, nameAt, shapePositions } from '@/theory/guitar'
import { pretty } from '@/theory/notes'

// ---------- local helpers ----------

/** 1.5 -> "1½", 0.25 -> "¼" */
function fmtBeats(b: number): string {
  const whole = Math.floor(b)
  const frac = b - whole
  const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : ''
  if (!whole) return f
  return String(whole) + f
}

/** Downstroke = every string low->high; upstroke = top four strings high->low. */
function strokeNotes(s: ChordShape, dir: 'D' | 'U'): number[] {
  const pos = shapePositions(s)
  if (dir === 'D') return pos.map((p) => midiAt(p))
  return pos
    .filter((p) => p.string <= 4)
    .map((p) => midiAt(p))
    .reverse()
}

/**
 * A strumming pattern on an eighth-note grid, e.g. "D-DU-UDU" (8 slots = one 4/4 bar).
 * Each stroke rings until the next one; a leading "-" is silence.
 */
function strumBar(s: ChordShape, grid: string): SeqEvent[] {
  const out: SeqEvent[] = []
  for (const ch of grid) {
    if (ch === 'D' || ch === 'U') out.push({ notes: strokeNotes(s, ch), beats: 0.5, mode: 'strum' })
    else if (out.length) out[out.length - 1].beats += 0.5
    else out.push({ notes: [], beats: 0.5 })
  }
  return out
}

const strumPlay = (chords: ChordShape[], grid: string, bpm = 90, toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: chords.flatMap((c) => strumBar(c, grid))
})

/** Pass `pitch = null` for plain metronome-style clicks. */
const rhythm = (pattern: number[], bpm = 80, pitch: string | null = 'G3', countIn = 4): PlaySpec => ({
  kind: 'rhythm',
  pattern,
  bpm,
  countIn,
  ...(pitch ? { pitch } : {})
})

const rep = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat()

const G = OPEN_CHORDS.G
const C = OPEN_CHORDS.C
const D = OPEN_CHORDS.D
const Em = OPEN_CHORDS.Em

// 3/4 "oom-pah-pah" and 4/4 "boom-chick" accompaniments (G and D chords)
const G_UPPER = [55, 59, 62] // G3 B3 D4
const D_UPPER = [54, 57, 62] // F#3 A3 D4
const BARS: [number, number[]][] = [
  [43, G_UPPER],
  [43, G_UPPER],
  [50, D_UPPER],
  [43, G_UPPER]
]
const bass = (n: number): SeqEvent => ({ notes: [n], beats: 1 })
const chord = (ns: number[]): SeqEvent => ({ notes: ns, beats: 1, mode: 'block' })
const waltz: PlaySpec = {
  kind: 'sequence',
  bpm: 132,
  toolExample: progressionExample('G', ['I', 'I', 'V', 'I'], 'major', 132, 3),
  events: BARS.flatMap(([b, up]) => [bass(b), chord(up), chord(up)])
}
const march: PlaySpec = {
  kind: 'sequence',
  bpm: 132,
  toolExample: progressionExample('G', ['I', 'I', 'V', 'I'], 'major', 132, 4),
  // bass on 1 (root) and 3 (fifth), chords on 2 and 4
  events: BARS.flatMap(([b, up]) => [bass(b), chord(up), bass(b + 7), chord(up)])
}
// 6/8: E minor arpeggio in eighths, two groups of three per bar
const sixEight: PlaySpec = {
  kind: 'sequence',
  bpm: 120,
  toolExample: { kind: 'chord', root: 'E', type: 'min' },
  events: rep([40, 47, 52, 55, 52, 47], 4).map((n) => ({ notes: [n], beats: 0.5 }))
}

// Ode to Joy (Beethoven, public domain), sounding pitch on strings 1 and 2
const E4 = { string: 1, fret: 0 }
const F4 = { string: 1, fret: 1 }
const G4 = { string: 1, fret: 3 }
const D4 = { string: 2, fret: 3 }
const C4 = { string: 2, fret: 1 }
const ODE: { p: { string: number; fret: number }; b: number }[] = [
  { p: E4, b: 1 }, { p: E4, b: 1 }, { p: F4, b: 1 }, { p: G4, b: 1 },
  { p: G4, b: 1 }, { p: F4, b: 1 }, { p: E4, b: 1 }, { p: D4, b: 1 },
  { p: C4, b: 1 }, { p: C4, b: 1 }, { p: D4, b: 1 }, { p: E4, b: 1 },
  { p: E4, b: 1.5 }, { p: D4, b: 0.5 }, { p: D4, b: 2 }
]
// Same tune as written for guitar (an octave higher than it sounds)
const ODE_WRITTEN = ['E/5', 'E/5', 'F/5', 'G/5', 'G/5', 'F/5', 'E/5', 'D/5', 'C/5', 'C/5', 'D/5', 'E/5', 'E/5', 'D/5', 'D/5']
const ODE_DUR = ['q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'qd', '8', 'h']

// ---------- generated questions ----------

const NOTE_VALUES = [
  { name: 'whole note', dur: 'w', beats: 4 },
  { name: 'half note', dur: 'h', beats: 2 },
  { name: 'quarter note', dur: 'q', beats: 1 },
  { name: 'eighth note', dur: '8', beats: 0.5 },
  { name: 'sixteenth note', dur: '16', beats: 0.25 },
  { name: 'dotted half note', dur: 'hd', beats: 3 },
  { name: 'dotted quarter note', dur: 'qd', beats: 1.5 },
  { name: 'dotted eighth note', dur: '8d', beats: 0.75 },
  { name: 'whole rest', dur: 'wr', beats: 4 },
  { name: 'half rest', dur: 'hr', beats: 2 },
  { name: 'quarter rest', dur: 'qr', beats: 1 },
  { name: 'eighth rest', dur: '8r', beats: 0.5 }
]
const BEAT_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map(fmtBeats)

const noteValueQ = (): QuizQuestion => {
  const v = rand(NOTE_VALUES)
  const rest = v.dur.includes('r')
  const ans = fmtBeats(v.beats)
  return mc(`In 4/4 time, how many beats does this ${rest ? 'rest' : 'note'} last?`, ans, distractors(BEAT_CHOICES, ans, 3), {
    visual: { type: 'staff', notes: [{ keys: ['B/4'], duration: v.dur }], playable: !rest },
    explain: `That's ${/^[aeiou]/.test(v.name) ? 'an' : 'a'} **${v.name}**: ${ans} beat${v.beats > 1 ? 's' : ''} in 4/4.${
      v.dur.includes('d') ? ' A dot adds half the note’s value again.' : ''
    }`
  })
}

const remainingBeatsQ = (): QuizQuestion => {
  const [ts, total] = rand([['2/4', 2], ['3/4', 3], ['4/4', 4], ['4/4', 4]] as [string, number][])
  const pool = [
    { d: 'q', b: 1 },
    { d: '8', b: 0.5 },
    { d: 'h', b: 2 },
    { d: 'qd', b: 1.5 }
  ]
  const notes: { keys: string[]; duration: string }[] = []
  let used = 0
  for (;;) {
    const cands = pool.filter((p) => used + p.b < total)
    if (!cands.length || (notes.length >= 1 && Math.random() < 0.35)) break
    const p = rand(cands)
    notes.push({ keys: [rand(['G/4', 'B/4', 'D/5'])], duration: p.d })
    used += p.b
  }
  const left = total - used
  const ans = fmtBeats(left)
  const pool2 = [0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(fmtBeats)
  return mc(`This bar of **${ts}** isn't full yet. How many more beats are needed to complete it?`, ans, distractors(pool2, ans, 3), {
    visual: { type: 'staff', timeSig: ts, notes },
    explain: `${ts} has ${total} quarter-note beats per bar. The notes shown add up to ${fmtBeats(used)}, so **${ans}** ${left > 1 ? 'beats remain' : 'beat remains'}.`
  })
}

const RHYTHMS = [
  { name: 'Four quarter notes', p: [1, 1, 1, 1] },
  { name: 'Two half notes', p: [2, 2] },
  { name: 'Eight eighth notes', p: rep([0.5], 8) },
  { name: 'Half note, then two quarter notes', p: [2, 1, 1] },
  { name: 'Two quarter notes, then a half note', p: [1, 1, 2] },
  { name: 'Dotted half note, then a quarter note', p: [3, 1] },
  { name: 'Dotted quarter + eighth, twice', p: [1.5, 0.5, 1.5, 0.5] },
  { name: 'Whole note', p: [4] },
  { name: 'Quarter, quarter rest, quarter, quarter rest', p: [1, -1, 1, -1] }
]

const listenRhythmQ = (): QuizQuestion => {
  const r = rand(RHYTHMS)
  return mc(
    'Listen: four count-in clicks, then **one bar of 4/4**. Which rhythm did you hear?',
    r.name,
    distractors(RHYTHMS.map((x) => x.name), r.name, 3),
    {
      play: rhythm(r.p, 76),
      explain: `The rhythm was: **${r.name}** (${r.p.map((b) => (b < 0 ? `rest ${fmtBeats(-b)}` : fmtBeats(b))).join(' + ')} beats). Count "1 2 3 4" along with the clicks and notice where each note starts.`
    }
  )
}

const tabToFretQ = (): QuizQuestion => {
  const string = randInt(1, 6)
  const fret = randInt(0, 12)
  return {
    kind: 'fretboard',
    prompt: 'Read the tab and **click the spot on the fretboard** where this note is played.',
    visual: { type: 'tab', events: [{ pos: [{ string, fret }], beats: 2 }], notation: false },
    targets: [{ string, fret }],
    explain: `The number sits on the ${['', '1st (top, high E)', '2nd (B)', '3rd (G)', '4th (D)', '5th (A)', '6th (bottom, low E)'][string]} line, so it's the **${['', '1st (high E)', '2nd (B)', '3rd (G)', '4th (D)', '5th (A)', '6th (low E)'][string]} string, ${
      fret === 0 ? 'open' : `fret ${fret}`
    }** (the note ${pretty(nameAt({ string, fret }, false))}).`
  }
}

const STAFF_NOTES = [
  { key: 'D/4', where: 'in the space just below the staff' },
  { key: 'E/4', where: 'on the bottom line' },
  { key: 'F/4', where: 'in the bottom space' },
  { key: 'G/4', where: 'on the 2nd line (the line the treble clef curls around)' },
  { key: 'A/4', where: 'in the 2nd space' },
  { key: 'B/4', where: 'on the middle line' },
  { key: 'C/5', where: 'in the 3rd space' },
  { key: 'D/5', where: 'on the 4th line' },
  { key: 'E/5', where: 'in the top space' },
  { key: 'F/5', where: 'on the top line' },
  { key: 'G/5', where: 'just above the top line' }
]

const staffNoteQ = (): QuizQuestion => {
  const n = rand(STAFF_NOTES)
  const letter = n.key[0]
  return mc('Name this note on the treble staff.', letter, distractors(['C', 'D', 'E', 'F', 'G', 'A', 'B'], letter, 3), {
    visual: { type: 'staff', notes: [{ keys: [n.key], duration: 'w' }] },
    explain: `The note is ${n.where}: **${letter}**. Lines (bottom to top) are E G B D F; spaces spell F A C E.`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u2',
  number: 2,
  title: 'Rhythm and reading',
  summary: 'Beats, note values, time signatures, counting subdivisions, reading tab and standard notation, and strumming patterns.',
  lessons: [
    {
      id: 'u2l1',
      title: 'Beats, tempo and note values',
      summary: 'The pulse under all music, how fast it goes, and how long each note lasts.',
      blocks: [
        {
          type: 'text',
          md: `Notes are only half of music. The other half is **when** they happen and **how long** they last. That's rhythm.

### The beat
The **beat** is the steady pulse you tap your foot to. **Tempo** is how fast the beats go, measured in **beats per minute (BPM)**. 60 BPM is one beat per second; a typical rock song sits around 100–130 BPM.

A **metronome** clicks the beat for you. It's the single most useful practice tool a guitarist can own.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Slow: 60 BPM', play: rhythm(rep([1], 8), 60, null, 0) },
            { label: 'Medium: 90 BPM', play: rhythm(rep([1], 8), 90, null, 0) },
            { label: 'Fast: 140 BPM', play: rhythm(rep([1], 8), 140, null, 0) }
          ]
        },
        {
          type: 'text',
          md: `### Note values
Each note value is **half** the length of the one before it. In most music the **quarter note** gets one beat:`
        },
        {
          type: 'table',
          headers: ['Note', 'Rest', 'Beats (in 4/4)', 'Per 4/4 bar'],
          rows: [
            ['Whole note', 'Whole rest', '4', '1'],
            ['Half note', 'Half rest', '2', '2'],
            ['Quarter note', 'Quarter rest', '1', '4'],
            ['Eighth note', 'Eighth rest', '½', '8'],
            ['Sixteenth note', 'Sixteenth rest', '¼', '16']
          ]
        },
        {
          type: 'staff',
          timeSig: '4/4',
          notes: [
            { keys: ['G/4'], duration: 'w' },
            { keys: ['G/4'], duration: 'h' },
            { keys: ['G/4'], duration: 'h' },
            ...rep([{ keys: ['G/4'], duration: 'q' }], 4),
            ...rep([{ keys: ['G/4'], duration: '8' }], 8)
          ],
          bpm: 80,
          caption: 'One bar each of whole, half, quarter and eighth notes. Same tempo, the notes just get shorter.'
        },
        {
          type: 'text',
          md: `### Rests
A **rest** is a measured silence. It has a length just like a note. On guitar, "playing" a rest usually means **stopping the sound**: lift your fretting fingers slightly or lay your picking hand on the strings.

Notice how rests make rhythm punchier:`
        },
        {
          type: 'staff',
          timeSig: '4/4',
          notes: [
            { keys: ['G/4'], duration: 'q' },
            { keys: ['B/4'], duration: 'qr' },
            { keys: ['G/4'], duration: 'q' },
            { keys: ['B/4'], duration: 'qr' },
            { keys: ['G/4'], duration: 'h' },
            { keys: ['B/4'], duration: 'hr' }
          ],
          bpm: 80,
          caption: 'Quarter rests and a half rest. The silences are counted just like the notes.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Quarter notes', play: rhythm([1, 1, 1, 1, 1, 1, 1, 1]) },
            { label: 'Half notes', play: rhythm([2, 2, 2, 2]) },
            { label: 'Eighth notes', play: rhythm(rep([0.5], 16)) },
            { label: 'Notes and rests', play: rhythm([1, -1, 1, -1, 2, -2]) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Set a metronome to 70 BPM and pick the open G string: four quarter notes, then two half notes, then eight eighth notes, then one whole note. Count out loud the whole time. Counting out loud feels silly for a week and then it becomes your superpower.`
        },
        {
          type: 'tryIt',
          question: mc('How many **eighth notes** fit into one half note?', '4', ['2', '3', '8'], {
            explain: 'A half note is 2 beats, and each eighth note is ½ beat, so **4** eighth notes fill it.'
          })
        }
      ]
    },
    {
      id: 'u2l2',
      title: 'Time signatures: 4/4, 3/4 and 6/8',
      summary: 'How beats are grouped into bars, and why a waltz feels different from a rock song.',
      blocks: [
        {
          type: 'text',
          md: `Beats are grouped into **bars** (also called **measures**), separated by **bar lines**. The **time signature** at the start of the music tells you how.

- The **top number** says how many beats are in each bar.
- The **bottom number** says which note value gets one beat: **4 = quarter note**, **8 = eighth note**.

### 4/4: "common time"
Four quarter-note beats per bar. Most rock, pop, blues and funk is in 4/4. Beat 1 is the strongest; beat 3 is a lighter accent. Drummers put the snare on **2 and 4**, the "backbeat".`
        },
        { type: 'audio', label: '4/4: bass on 1 and 3, chords on 2 and 4', play: march },
        {
          type: 'text',
          md: `### 3/4: waltz time
Three beats per bar: **STRONG**-weak-weak, "oom-pah-pah". Think of waltzes, many folk songs and country ballads.`
        },
        { type: 'audio', label: '3/4: bass on 1, chords on 2 and 3', play: waltz },
        {
          type: 'staff',
          timeSig: '3/4',
          notes: [
            { keys: ['G/3'], duration: 'q' },
            { keys: ['B/4', 'D/5'], duration: 'q' },
            { keys: ['B/4', 'D/5'], duration: 'q' },
            { keys: ['G/3'], duration: 'q' },
            { keys: ['B/4', 'D/5'], duration: 'q' },
            { keys: ['B/4', 'D/5'], duration: 'q' }
          ],
          bpm: 120,
          caption: 'Two bars of 3/4: three quarter-note beats per bar.'
        },
        {
          type: 'text',
          md: `### 6/8: two big beats, each split in three
6/8 has six eighth notes per bar, but you don't feel six beats. You feel **two** beats, each divided into **three**:

**1** 2 3 **4** 5 6

That makes it a **compound** time signature: each beat is a **dotted quarter** note. It's the lilting, rolling feel of many Irish jigs and slow rock ballads with a "swaying" groove. (4/4 and 3/4 are **simple** time: each beat splits into two.)`
        },
        {
          type: 'staff',
          timeSig: '6/8',
          notes: [
            { keys: ['E/3'], duration: '8' },
            { keys: ['B/3'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['G/4'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['B/3'], duration: '8' },
            { keys: ['E/3'], duration: '8' },
            { keys: ['B/3'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['G/4'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['B/3'], duration: '8' }
          ],
          bpm: 120,
          caption: 'An E minor arpeggio in 6/8. Feel the two big pulses on notes 1 and 4.'
        },
        { type: 'audio', label: '6/8 arpeggio (Em)', play: sixEight },
        {
          type: 'text',
          md: `Em (E minor) is one of the first chords you'll learn, coming up in [[preview:u2l7]]. For now just copy the notes.`
        },
        {
          type: 'tab',
          caption: 'The same 6/8 pattern on an open Em chord: low E, A string 2nd fret, D string 2nd fret, open G…',
          events: [
            { string: 6, fret: 0 },
            { string: 5, fret: 2 },
            { string: 4, fret: 2 },
            { string: 3, fret: 0 },
            { string: 4, fret: 2 },
            { string: 5, fret: 2 }
          ].map((p) => ({ pos: [p], beats: 0.5 })),
          bpm: 120
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `3/4 and 6/8 both contain six eighth notes per bar, but they're grouped differently: 3/4 is **(1 2)(3 4)(5 6)**, three beats of two; 6/8 is **(1 2 3)(4 5 6)**, two beats of three. Same maths, completely different feel.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Is this in **3/4** or **4/4**?', '3/4', ['4/4'], {
            play: waltz,
            explain: 'The bass note returns every **three** beats (oom-pah-pah), so it’s **3/4**.'
          })
        }
      ]
    },
    {
      id: 'u2l3',
      title: 'Dotted notes and ties',
      summary: 'Making notes longer: the dot adds half, the tie joins two notes together.',
      blocks: [
        {
          type: 'text',
          md: `### The dot
A **dot** after a note makes it **half as long again**:
- Dotted half note = 2 + 1 = **3 beats** (fills a whole bar of 3/4)
- Dotted quarter note = 1 + ½ = **1½ beats**
- Dotted eighth note = ½ + ¼ = **¾ beat**

The dotted quarter followed by an eighth (1½ + ½ = 2 beats) is one of the most common rhythms in all music. You'll hear it in countless melodies and riffs.`
        },
        {
          type: 'staff',
          timeSig: '4/4',
          notes: [
            { keys: ['G/4'], duration: 'hd' },
            { keys: ['G/4'], duration: 'q' },
            { keys: ['G/4'], duration: 'qd' },
            { keys: ['G/4'], duration: '8' },
            { keys: ['G/4'], duration: 'qd' },
            { keys: ['G/4'], duration: '8' },
            { keys: ['G/4'], duration: 'qd' },
            { keys: ['G/4'], duration: '8' },
            { keys: ['G/4'], duration: 'h' }
          ],
          bpm: 80,
          caption: 'Bar 1: dotted half + quarter. Bar 2: two dotted-quarter + eighth pairs. Bar 3: dotted quarter + eighth + half.'
        },
        {
          type: 'table',
          headers: ['Count', '1', '&', '2', '&', '3', '&', '4', '&'],
          rows: [
            ['Dotted quarter + eighth', 'X', '·', '·', 'X', 'X', '·', '·', 'X'],
            ['Four quarter notes', 'X', '·', 'X', '·', 'X', '·', 'X', '·']
          ],
          caption: 'X = a note starts. The eighth after a dotted quarter lands on the "&" of 2 (and of 4).'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Dotted quarter + eighth', play: rhythm([1.5, 0.5, 1.5, 0.5, 1.5, 0.5, 2]) },
            { label: 'Dotted half + quarter', play: rhythm([3, 1, 3, 1]) },
            { label: '3 + 3 + 2 (in eighths)', play: rhythm([1.5, 1.5, 1, 1.5, 1.5, 1]) }
          ]
        },
        {
          type: 'text',
          md: `### Ties
A **tie** is a curved line joining two notes of the **same pitch**. You play the first note and **hold it** through the second, without picking again. Their lengths add together.

Ties do two jobs:
1. They let a note **cross a bar line** (a note can't be longer than the bar it starts in, so it's tied into the next bar).
2. They show rhythms that a single note value can't, like a note lasting 2½ beats.

Don't confuse a tie with a **slur**, which joins *different* pitches (on guitar, usually played as a hammer-on or pull-off).`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Two quarter notes (picked twice)', play: rhythm([1, 1, 1, 1], 80) },
            { label: 'Two quarters tied = one half note', play: rhythm([2, 2], 80) },
            { label: 'Held across the bar line (beat 4 tied to beat 1)', play: rhythm([1, 1, 1, 2, 1, 1, 1], 80) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `To play a dotted quarter + eighth accurately, count in eighths: "**1** & 2 **&** **3** & 4 **&**". Pick on the bold counts only. Once it's steady, stop counting the in-between syllables out loud but keep feeling them.`
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'How many beats is a **dotted half note** in 4/4?', accept: ['3', 'three'], explain: 'A half note is 2 beats; the dot adds half of that (1), so **3 beats**.' }
        },
        {
          type: 'tryIt',
          question: mc('A half note tied to a quarter note lasts…', '3 beats, picked once', ['3 beats, picked twice', '2 beats', '2½ beats'], {
            explain: 'Tied notes add up (2 + 1 = 3) and you only pick the first one.'
          })
        }
      ]
    },
    {
      id: 'u2l4',
      title: 'Subdivision: counting eighths and sixteenths',
      summary: '"1 & 2 &" and "1 e & a": the counting systems every guitarist uses.',
      blocks: [
        {
          type: 'text',
          md: `**Subdivision** means splitting each beat into smaller, equal parts. It's how you place fast notes accurately instead of guessing.

### Eighth notes: "1 & 2 &"
Two per beat. Say the beat number, then "and" (written **&**) halfway through:

**1** & **2** & **3** & **4** &

### Sixteenth notes: "1 e & a"
Four per beat. Say "one-ee-and-uh":

**1** e & a **2** e & a **3** e & a **4** e & a

The **&** is always exactly halfway through the beat, in both systems.`
        },
        {
          type: 'table',
          headers: ['Value', 'Per beat', 'Counted'],
          rows: [
            ['Quarter notes', '1', '1  2  3  4'],
            ['Eighth notes', '2', '1 & 2 & 3 & 4 &'],
            ['Eighth-note triplets', '3', '1-trip-let 2-trip-let …'],
            ['Sixteenth notes', '4', '1 e & a 2 e & a …']
          ]
        },
        {
          type: 'staff',
          timeSig: '4/4',
          notes: [
            { keys: ['E/4'], duration: 'q' },
            { keys: ['E/4'], duration: 'q' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            { keys: ['E/4'], duration: '8' },
            ...rep([{ keys: ['E/4'], duration: '16' }], 16)
          ],
          bpm: 70,
          caption: 'Bar 1: quarters, then eighths. Bar 2: sixteenths. Count "1 2 3 & 4 &", then "1 e & a 2 e & a…".'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Eighths: 1 & 2 &', play: rhythm(rep([0.5], 16), 80) },
            { label: 'Sixteenths: 1 e & a', play: rhythm(rep([0.25], 16), 70) },
            { label: 'Quarters → eighths → sixteenths', play: rhythm([...rep([1], 4), ...rep([0.5], 8), ...rep([0.25], 16)], 70) }
          ]
        },
        {
          type: 'text',
          md: `### Mixing subdivisions: the gallop
Combine an eighth and two sixteenths in one beat and you get the **gallop**: "**1** & a, **2** & a". It drives countless metal riffs. Flip it (two sixteenths then an eighth: "**1** e &") and you get the **reverse gallop**.`
        },
        {
          type: 'tab',
          caption: 'Gallop on a muted low-string chug (open low E and the A string, 2nd fret): eighth + two sixteenths per beat.',
          events: rep(
            [
              { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }], beats: 0.5 },
              { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }], beats: 0.25 },
              { pos: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }], beats: 0.25 }
            ],
            4
          ),
          bpm: 100
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Gallop: 1 & a', play: rhythm(rep([0.5, 0.25, 0.25], 8), 90, 'E2') },
            { label: 'Reverse gallop: 1 e &', play: rhythm(rep([0.25, 0.25, 0.5], 8), 90, 'E2') }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Alternate picking** maps directly onto subdivision: pick **down** on the beat and on "&", **up** on "e" and "a". Your hand becomes a clock, and you always know where you are in the beat.`
        },
        {
          type: 'tryIt',
          question: mc('In "1 e & a", which syllable falls **exactly halfway** through the beat?', '&', ['e', 'a', '1'], {
            explain: 'The **&** is the midpoint, the same place the eighth-note "&" falls. "e" is a quarter of the way through, "a" three quarters.'
          })
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'How many **sixteenth notes** are in one bar of 4/4?', accept: ['16', 'sixteen'], explain: 'Four per beat × four beats = **16**.' }
        }
      ]
    },
    {
      id: 'u2l5',
      title: 'Reading tab and standard notation',
      summary: 'Tab tells you where; standard notation tells you what and when. Learn to read both.',
      blocks: [
        {
          type: 'text',
          md: `### Tab
**Tablature (tab)** is the guitarist's shorthand. Six horizontal lines represent the six strings, drawn **as you look down at the guitar**: the **top line is the high E (1st) string** and the bottom line is the low E (6th).

- A **number** on a line is the **fret** to play on that string. **0** means open.
- Numbers read **left to right**, in time order.
- Numbers **stacked vertically** are played **together** (a chord).`
        },
        {
          type: 'tab',
          caption: 'Ode to Joy (Beethoven) on the top two strings. Standard notation above, tab below.',
          events: ODE.map((e) => ({ pos: [e.p], beats: e.b })),
          bpm: 100
        },
        {
          type: 'fretboard',
          marks: [m(2, 1, 'C'), m(2, 3, 'D'), m(1, 0, 'E', 'root'), m(1, 1, 'F'), m(1, 3, 'G')],
          frets: [0, 5],
          caption: 'All five notes of the melody: C and D on the B string, E F G on the high E string.'
        },
        {
          type: 'tab',
          caption: 'Stacked numbers = a chord. Here: G, C, D, then G again.',
          events: [G, C, D, G].map((s) => ({ pos: shapePositions(s), beats: 2 })),
          bpm: 80,
          notation: false
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `Plain tab usually **doesn't show rhythm**. Many tabs online are just fret numbers, so you need to know the song to play it in time. That's why it pays to read at least a little standard notation, or to use tab that includes note values (like this app shows).`
        },
        {
          type: 'text',
          md: `### The treble staff
Standard notation uses five lines. Higher on the staff = higher pitch. Guitar music uses the **treble clef** (the curly G-clef, which circles the G line).

- **Lines**, bottom to top: **E G B D F** ("**E**very **G**ood **B**oy **D**eserves **F**udge")
- **Spaces**, bottom to top: **F A C E** (spells "face")

Notes beyond the staff use short **ledger lines**.`
        },
        {
          type: 'staff',
          notes: ['E/4', 'G/4', 'B/4', 'D/5', 'F/5'].map((k) => ({ keys: [k], duration: 'q' })).concat(
            ['F/4', 'A/4', 'C/5', 'E/5'].map((k) => ({ keys: [k], duration: 'q' }))
          ),
          bpm: 70,
          caption: 'The five lines (E G B D F), then the four spaces (F A C E).'
        },
        {
          type: 'text',
          md: `### Guitar is written an octave higher than it sounds
Guitar music is written **one octave above** the pitch you actually hear. This keeps the notes inside the treble staff instead of under a pile of ledger lines. So the open low E string (which sounds the E below the bass staff) is written way down **below the third ledger line** under the treble staff.

The written melody of Ode to Joy below sits on the top half of the staff, but when you play it on the guitar (and when you press play here), it sounds an octave lower.`
        },
        {
          type: 'staff',
          timeSig: '4/4',
          notes: ODE_WRITTEN.map((k, i) => ({ keys: [k], duration: ODE_DUR[i] })),
          bpm: 100,
          caption: 'Ode to Joy as written for guitar. Compare it with the tab above: same notes, same rhythm.'
        },
        {
          type: 'staff',
          notes: ['E/3', 'A/3', 'D/4', 'G/4', 'B/4', 'E/5'].map((k) => ({ keys: [k], duration: 'h' })),
          bpm: 80,
          caption: 'The six open strings as written in guitar music: low E down on ledger lines, high E in the top space.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Written top-space E, at written pitch', play: { kind: 'notes', notes: ['E5'], mode: 'block' } },
            { label: 'What the open high E string really sounds', play: { kind: 'notes', notes: ['E4'], mode: 'block' } },
            { label: 'All six open strings (sounding)', play: { kind: 'notes', notes: [40, 45, 50, 55, 59, 64], mode: 'arpeggio' } }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This tab shows a single note. Click where it’s played.',
            visual: { type: 'tab', events: [{ pos: [{ string: 3, fret: 2 }], beats: 2 }], notation: false },
            targets: [{ string: 3, fret: 2 }],
            explain: 'The 2 is on the **third line from the top**, the G string: **3rd string, 2nd fret** (an A).'
          }
        },
        {
          type: 'tryIt',
          question: mc('Name this note.', 'B', ['D', 'G', 'A'], {
            visual: { type: 'staff', notes: [{ keys: ['B/4'], duration: 'w' }] },
            explain: 'It sits on the **middle line**. Lines from the bottom: E G **B** D F.'
          })
        }
      ]
    },
    {
      id: 'u2l6',
      title: 'Strumming patterns',
      summary: 'Keep your hand moving, choose when to hit: the secret to steady strumming.',
      blocks: [
        {
          type: 'text',
          md: `Strumming is rhythm made physical. The big secret: **your strumming hand never stops moving**.

### Constant motion
Move your hand **down on every beat** (1 2 3 4) and **up on every "&"**, like a pendulum, all the time. A rhythm pattern is just a choice of which of those motions **hit the strings** and which **miss** them.

- Downstrokes (**D**, ↓) land on the numbers.
- Upstrokes (**U**, ↑) land on the "&"s.

If you keep the pendulum going, your timing stays steady, even when you skip strokes.`
        },
        {
          type: 'text',
          md: `Use the open chords from [[u2l7]] to practise with.`
        },
        {
          type: 'chords',
          shapes: [G, C, D, Em],
          caption: 'Four open chords to practise with: G, C, D and Em. Click to hear each one.'
        },
        {
          type: 'table',
          headers: ['Count', '1', '&', '2', '&', '3', '&', '4', '&'],
          rows: [
            ['Hand moves', '↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'],
            ['Pattern 1: quarters', 'D', '', 'D', '', 'D', '', 'D', ''],
            ['Pattern 2: eighths', 'D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'],
            ['Pattern 3: "the folk strum"', 'D', '', 'D', 'U', '', 'U', 'D', 'U']
          ],
          caption: 'Blank cells: the hand still moves but misses the strings.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Pattern 1 on G', play: strumPlay([G, G], 'D-D-D-D-', 90, { kind: 'chord', root: 'G', type: 'maj', shape: G }) },
            { label: 'Pattern 2 on G', play: strumPlay([G, G], 'DUDUDUDU', 90, { kind: 'chord', root: 'G', type: 'maj', shape: G }) },
            { label: 'Pattern 3 on G', play: strumPlay([G, G], 'D-DU-UDU', 90, { kind: 'chord', root: 'G', type: 'maj', shape: G }) }
          ]
        },
        {
          type: 'text',
          md: `### Pattern 3: down, down-up, up-down-up
Pattern 3 is probably the most-used strum in acoustic pop and folk. Say it: "**down, down-up, (miss) up-down-up**". The skipped downstroke on beat 3 makes the upstroke on "3&" feel like it's pushing ahead. That's **syncopation**: an accent on a weak part of the beat.

Upstrokes usually catch only the **top three or four strings**. That's natural; let them be lighter.`
        },
        {
          type: 'audio',
          label: 'G – C – D – G with pattern 3',
          play: strumPlay([G, C, D, G], 'D-DU-UDU', 88, progressionExample('G', ['I', 'IV', 'V', 'I'], 'major', 88, 4))
        },
        {
          type: 'text',
          md: `### Strumming in 3/4 and 6/8
Change the time signature and the patterns change too:
- **3/4**: "**D** D U D U" (counted 1, 2 &, 3 &), with a strong bass-heavy downstroke on 1.
- **6/8**: "**D** D U **D** D U" is a lilting pattern that puts weight on 1 and 4.`
        },
        {
          type: 'audioRow',
          items: [
            { label: '3/4 strum: D D U D U', play: { kind: 'sequence', bpm: 100, events: rep(strumBar(G, 'D-DUDU'), 2) } },
            {
              label: '6/8 strum: D D U D D U',
              play: {
                kind: 'sequence',
                bpm: 120,
                events: rep(
                  [
                    { notes: strokeNotes(Em, 'D'), beats: 0.5, mode: 'strum' as const },
                    { notes: strokeNotes(Em, 'D'), beats: 0.5, mode: 'strum' as const },
                    { notes: strokeNotes(Em, 'U'), beats: 0.5, mode: 'strum' as const }
                  ],
                  4
                )
              }
            }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Practise patterns with your fretting hand **muting** the strings (lay it lightly across them). You'll hear a percussive "chk" and can focus entirely on the rhythm. Then add chords. Start at 60 BPM and only speed up when it feels effortless.`
        },
        {
          type: 'tryIt',
          question: mc('With constant-motion strumming in 4/4 eighths, the **upstrokes** fall on…', 'the "&"s', ['the beat numbers', 'beats 2 and 4 only', 'whichever stroke feels easier'], {
            explain: 'Down on the numbers, **up on the "&"s**. Skipped strokes are just misses; the hand keeps moving.'
          })
        }
      ]
    },
    {
      id: 'u2l7',
      title: 'Your first open chords',
      summary: 'Read a chord diagram, learn E, A, D, G, C, Am, Em, Dm and the open sevenths, and switch between them in time.',
      blocks: [
        {
          type: 'text',
          md: `A **chord** is several notes sounded together, and **open chords** are the first ones every guitarist learns. They use open strings alongside a few fretted notes, so they ring out big and full.

### How to read a chord diagram
A chord diagram is the neck standing upright, as if the guitar were facing you: the **thickest string (low E) is on the left**, the thinnest on the right, and the horizontal lines are frets.

- A **dot** is where a finger goes. The number on it is the finger: **1** = index, **2** = middle, **3** = ring, **4** = pinky.
- An **o** above a string means play it **open** (no finger).
- An **x** above a string means **don't play it**. Skip it with your pick or let your fretting finger lightly mute it.

Strum only the strings that aren't marked **x**.`
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.E, OPEN_CHORDS.A, OPEN_CHORDS.D],
          caption: 'E, A and D. Click each one to hear it. Notice the x marks on D: its two lowest strings are skipped.'
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.G, OPEN_CHORDS.C],
          caption: 'G and C. C skips the low E string; G uses all six.'
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.Em, OPEN_CHORDS.Am, OPEN_CHORDS.Dm],
          caption: 'The minor chords: Em, Am and Dm. They sound darker and sadder than their major cousins.'
        },
        {
          type: 'text',
          md: `The chords above with no "m" are **major** chords: bright and happy. Chords with an **m** are **minor**: darker. You can hear the difference by comparing **Em** with **E**, or **Am** with **A**. Only one finger moves.

### Three sevenths for the blues
Add a little tension to a major chord and you get a **dominant seventh**, written **7**. A7, D7 and E7 sound bluesy and restless, as if they want to move somewhere. You'll need all three for the 12-bar blues.`
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.A7, OPEN_CHORDS.D7, OPEN_CHORDS.E7],
          caption: 'A7, D7 and E7. Each is its major chord with one finger changed or lifted.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'E', play: strumPlay([OPEN_CHORDS.E], 'D-------', 60, { kind: 'chord', root: 'E', type: 'maj', shape: OPEN_CHORDS.E }) },
            { label: 'Em', play: strumPlay([OPEN_CHORDS.Em], 'D-------', 60, { kind: 'chord', root: 'E', type: 'min', shape: OPEN_CHORDS.Em }) },
            { label: 'A', play: strumPlay([OPEN_CHORDS.A], 'D-------', 60, { kind: 'chord', root: 'A', type: 'maj', shape: OPEN_CHORDS.A }) },
            { label: 'A7', play: strumPlay([OPEN_CHORDS.A7], 'D-------', 60, { kind: 'chord', root: 'A', type: 'dom7', shape: OPEN_CHORDS.A7 }) }
          ]
        },
        {
          type: 'text',
          md: `### Fretting cleanly
Most buzzing and muffled strings come from the same few habits:
- Press with your **fingertips**, right behind the fret wire (not in the middle of the gap).
- Keep your fingers **curved** so they don't touch the neighbouring strings.
- Keep your thumb low behind the neck and relaxed.
- Pick the strings **one at a time** first. Any that buzz or go dead tell you which finger to fix.
- Strum slowly. Speed comes later.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Start with **Em** and **A**. They only need two fingers each, so they're the easiest to get ringing.`
        },
        {
          type: 'text',
          md: `### Switching chords in time
Knowing the shapes isn't enough: music needs you to change **on the beat**. Use the simplest strum there is: **four downstrokes per chord**, one on each beat, counting "1 2 3 4". Then change chord on the next "1".

Practise these pairs, which are all common and fairly easy to swap:
- **Em ↔ G**
- **A ↔ D**
- **C ↔ G**

Before the last beat of each bar, start moving your fingers, so you land on the new shape right as beat 1 arrives. If you stop the beat to find the chord, the groove is lost. Slow down and keep the beat going instead.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Em ↔ G', play: strumPlay([OPEN_CHORDS.Em, OPEN_CHORDS.G, OPEN_CHORDS.Em, OPEN_CHORDS.G], 'D-D-D-D-', 80) },
            { label: 'A ↔ D', play: strumPlay([OPEN_CHORDS.A, OPEN_CHORDS.D, OPEN_CHORDS.A, OPEN_CHORDS.D], 'D-D-D-D-', 80) },
            { label: 'C ↔ G', play: strumPlay([OPEN_CHORDS.C, OPEN_CHORDS.G, OPEN_CHORDS.C, OPEN_CHORDS.G], 'D-D-D-D-', 80) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Set a metronome to 60 BPM and play four downstrokes on Em, then four on G, and so on. When you can change without a pause or a buzz, go up 5 BPM. At first it's fine to make the last strum before a change a quick open-string strum: it buys your fingers time to move.`
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Curious why these chords sound the way they do? You'll look inside them in [[preview:u5l4]]. And if a chord is too high for your singing voice, a **capo** lets you move all these shapes up the neck: see [[preview:u15l2]].`
        },
        {
          type: 'tryIt',
          question: mc('In the open **D** chord, which strings are **not** played?', 'The 6th and 5th (the two lowest)', ['Only the 6th (low E)', 'The 1st and 2nd (the two highest)', 'All six are played'], {
            explain: 'D is **xx0232**: the low E and A strings carry an **x**, so you start the strum on the open D string (4th).'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which of these open chords has **all six strings** ringing?', 'E', ['D', 'C', 'A'], {
            explain: 'E is **022100**: no x marks, so every string sounds. D skips two strings, and A and C each skip the low E string.'
          })
        },
        {
          type: 'tryIt',
          question: mc('To switch chords **in time**, you should…', 'start moving your fingers before the last beat, and land on beat 1', ['stop the beat while you find the chord', 'wait for beat 1, then start moving', 'play faster until it sounds right'], {
            explain: 'Keep the beat going and **prepare the next shape early**. A late change is better than a stopped beat, but an early start is best.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('In 4/4, how many beats does a **half note** last?', '2', ['1', '3', '4'], { explain: 'Half of a whole note (4 beats) = **2 beats**.' }),
      mc('How many beats does a **dotted quarter note** last?', '1½', ['1', '2', '¾'], { explain: 'A quarter is 1 beat; the dot adds half again (½): **1½ beats**.' }),
      mc('In a time signature, the **top number** tells you…', 'how many beats are in each bar', ['which note gets one beat', 'the tempo in BPM', 'how many bars are in the song'], {
        explain: 'Top = **beats per bar**. Bottom = which note value counts as one beat.'
      }),
      mc('How is **6/8** usually felt?', 'Two beats per bar, each split into three', ['Six equal strong beats', 'Three beats, each split into two', 'Like 4/4 but faster'], {
        explain: '6/8 is **compound** time: (1 2 3)(4 5 6), two dotted-quarter beats per bar.'
      }),
      { kind: 'text', prompt: 'How many **eighth notes** fill one bar of 4/4?', accept: ['8', 'eight'], explain: 'Two per beat × four beats = **8**.' },
      mc('Which is the standard way to count **sixteenth notes**?', '1 e & a 2 e & a', ['1 & 2 & 3 & 4 &', '1 2 3 4', '1 & a 2 & a'], {
        explain: '"One-ee-and-uh": four syllables per beat. "1 & a" is for triplets or the gallop rhythm.'
      }),
      mc('A **tie** joins two notes of the same pitch. You…', 'play the first and hold it for both lengths', ['play both notes separately', 'slide between them', 'play them as a hammer-on'], {
        explain: 'Tied values add together and you only pick **once**.'
      }),
      mc('In tab, the **top line** represents…', 'the high E (1st) string', ['the low E (6th) string', 'the highest fret', 'the melody'], {
        explain: 'Tab is drawn as you look down at the guitar: **top line = thinnest string**.'
      }),
      mc('What does this tab show?', 'A C major chord: all five notes strummed together', ['Five notes picked one after another', 'A C major scale', 'A riff on the 3rd fret'], {
        visual: { type: 'tab', events: [{ pos: shapePositions(C), beats: 4 }], notation: false },
        explain: 'Numbers **stacked vertically** are played at the same time. x-3-2-0-1-0 is the open **C** chord.'
      }),
      {
        kind: 'fretboard',
        prompt: 'Click the note shown in this tab.',
        visual: { type: 'tab', events: [{ pos: [{ string: 5, fret: 3 }], beats: 2 }], notation: false },
        targets: [{ string: 5, fret: 3 }],
        explain: 'The 3 is on the **second line from the bottom**: the A string, 3rd fret (a C).'
      },
      { kind: 'spell', prompt: 'Name the notes on the five **lines** of the treble staff, bottom to top.', answer: ['E', 'G', 'B', 'D', 'F'], explain: '**E G B D F**: "Every Good Boy Deserves Fudge".' },
      mc('Name this note.', 'G', ['E', 'B', 'F'], {
        visual: { type: 'staff', notes: [{ keys: ['G/4'], duration: 'w' }] },
        explain: 'It sits on the 2nd line, the line the treble (G) clef curls around: **G**.'
      }),
      mc('Compared with how it’s written, guitar actually sounds…', 'one octave lower', ['one octave higher', 'exactly as written', 'a fifth lower'], {
        explain: 'Guitar is written an **octave higher** than it sounds, to keep notes inside the treble staff.'
      }),
      mc('Listen. Which rhythm is this (after the four count-in clicks)?', 'Half note, then two quarter notes', ['Four quarter notes', 'Two half notes', 'Two quarter notes, then a half note'], {
        play: rhythm([2, 1, 1], 76),
        explain: 'One long note (2 beats) then two short ones: **half, quarter, quarter**.'
      }),
      mc('Listen. What time signature fits this accompaniment?', '3/4', ['4/4', '2/4'], {
        play: waltz,
        explain: 'Bass on 1, chords on 2 and 3: "oom-pah-pah" is **3/4**.'
      }),
      mc('In constant-motion strumming of eighth notes, upstrokes land on…', 'the "&"s', ['the beat numbers', 'beat 1 only', 'beats 2 and 4'], {
        explain: 'Down on the numbers, **up on the "&"s**.'
      }),
      mc('In a chord diagram, an **x** above a string means…', 'don’t play that string', ['play it open', 'use your pinky there', 'play it twice'], {
        explain: 'An **x** means skip that string; an **o** means play it open.'
      }),
      mc('Which open chord is a **dominant seventh**?', 'E7', ['Em', 'Dm', 'Am'], {
        explain: 'The **7** in A7, D7 and E7 marks a dominant seventh. The **m** chords are minor.'
      }),
      mc('How many beats per chord in the simple switching exercise?', '4 (one downstroke each beat)', ['1', '2', '8'], {
        explain: 'Strum **four downstrokes** per chord, then change on the next beat 1.'
      })
    ],
    generators: [noteValueQ, remainingBeatsQ, listenRhythmQ, tabToFretQ, staffNoteQ]
  }
}

export default unit
