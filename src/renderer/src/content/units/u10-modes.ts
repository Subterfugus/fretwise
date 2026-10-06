import type { Block, FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { mc, rand, scaleMarks, playScale, distractors } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, shape, shapeMidis, positionsOf } from '@/theory/guitar'
import { MODE_ORDER, ScaleType, degreeLabels, scaleNames, scaleSemitones, buildScale } from '@/theory/scales'
import { mod, noteName, pitchClass, pretty } from '@/theory/notes'
import { transpose } from '@/theory/intervals'

// ---------- mode data ----------

type Mode = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian'

interface ModeInfo {
  name: string
  /** Characteristic degree(s), as degreeLabels() prints them */
  char: string[]
  /** Interval from the mode's root to its characteristic note (first one) */
  charIv: string
  family: 'major' | 'minor' | 'diminished'
  sound: string
  vamp: string
}

const MODES: Record<Mode, ModeInfo> = {
  ionian: { name: 'Ionian', char: ['4', '7'], charIv: 'M7', family: 'major', sound: 'bright, settled, "home"', vamp: 'I–IV–V' },
  dorian: { name: 'Dorian', char: ['6'], charIv: 'M6', family: 'minor', sound: 'minor but cool and hopeful', vamp: 'i–IV' },
  phrygian: { name: 'Phrygian', char: ['♭2'], charIv: 'm2', family: 'minor', sound: 'dark, Spanish, metal', vamp: 'i–♭II' },
  lydian: { name: 'Lydian', char: ['♯4'], charIv: 'A4', family: 'major', sound: 'dreamy, floating, cinematic', vamp: 'I–II' },
  mixolydian: { name: 'Mixolydian', char: ['♭7'], charIv: 'm7', family: 'major', sound: 'bluesy, rocking major', vamp: 'I–♭VII' },
  aeolian: { name: 'Aeolian', char: ['♭6'], charIv: 'm6', family: 'minor', sound: 'sad, serious natural minor', vamp: 'i–♭VI–♭VII' },
  locrian: { name: 'Locrian', char: ['♭5'], charIv: 'd5', family: 'diminished', sound: 'unstable, menacing', vamp: 'i°–♭II (rare)' }
}

const BRIGHTNESS: Mode[] = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian']
/** Parent keys used for generated questions: friendly spellings only. */
const PARENTS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab']

// ---------- local helpers ----------

/** A fret window that shows every mark. */
function fit(marks: { fret: number }[]): [number, number] {
  const fs = marks.map((p) => p.fret)
  const lo = Math.min(...fs)
  const hi = Math.max(...fs)
  if (hi <= 12) return [0, 12]
  return [Math.max(0, lo - 1), Math.max(hi + 1, lo + 8)]
}

/** Scale marks labelled by degree with the characteristic note(s) highlighted. */
function modeMarks(root: string, mode: Mode, opts: { box?: number; perString?: number; frets?: [number, number] } = {}): FretMark[] {
  return scaleMarks(root, mode, { ...opts, label: 'degree' }).map((mk) =>
    mk.color !== 'root' && mk.label && MODES[mode].char.includes(mk.label) ? { ...mk, color: 'accent' } : mk
  )
}

function modeBoard(root: string, mode: Mode, caption: string, opts: { box?: number; perString?: number; frets?: [number, number] } = {}): Block {
  const marks = modeMarks(root, mode, opts)
  return { type: 'fretboard', marks, frets: opts.frets ?? fit(marks), caption, playAll: true }
}

/** Lowest comfortable pitch of a root: E2 (40) up to D#3 (51). */
const droneMidi = (root: string): number => 40 + mod(pitchClass(root) - 4, 12)

/** The mode played up and down over a low root drone, so the ear hears it *against its home note*. */
function overDrone(root: string, mode: ScaleType, bpm = 120): PlaySpec {
  const d = droneMidi(root)
  const r = d + 12
  const up = [...scaleSemitones(mode).map((s) => r + s), r + 12]
  const line = [...up, ...up.slice(0, -1).reverse()]
  return {
    kind: 'sequence',
    bpm,
    toolExample: { kind: 'scale', root, type: mode },
    events: [
      { notes: [d, d + 7, d + 12], beats: 2, mode: 'strum' },
      ...line.map((n, i) => ({ notes: i % 2 === 0 ? [d, n] : [n], beats: 1, mode: 'block' as const })),
      { notes: [d, d + 12], beats: 2, mode: 'block' }
    ]
  }
}

/** A chord vamp: each chord strummed twice (2 beats each), the whole loop played `times`, ending on the first chord. */
function vamp(shapes: ChordShape[], times = 2, bpm = 96, toolExample?: ToolExample): PlaySpec {
  const events: { notes: number[]; beats: number; mode: 'strum' }[] = []
  for (let t = 0; t < times; t++)
    for (const s of shapes) {
      events.push({ notes: shapeMidis(s), beats: 2, mode: 'strum' })
      events.push({ notes: shapeMidis(s), beats: 2, mode: 'strum' })
    }
  events.push({ notes: shapeMidis(shapes[0]), beats: 4, mode: 'strum' })
  return { kind: 'sequence', bpm, events, toolExample: toolExample?.kind === 'progression'
    ? { ...toolExample, bpm, beats: 2, romans: [...Array.from({ length: times }, () => toolExample.romans.flatMap((r) => [r, r])).flat(), toolExample.romans[0]] }
    : toolExample }
}

const p = (string: number, fret: number) => ({ string, fret })

// ---------- voicings (all checked against chord tones in tests) ----------

const C = shape('C', 'x32010', 'x32010')
const F = shape('F', '133211', '134211', 1)
const G = shape('G', '320003', '210003')
const Am = shape('Am', 'x02210', 'x02310')
const Am7 = shape('Am7', 'x02010', 'x02010')
const D = shape('D', 'xx0232', 'xx0132')
const D9 = shape('D9', 'x5455x', 'x2133x')
const Dm7 = shape('Dm7', 'xx0211', 'xx0211')
const A = shape('A', 'x02220', 'x01230')
const Em = shape('Em', '022000', '023000')
const E5 = shape('E5', '022xxx', '011xxx')
const F5 = shape('F5', '133xxx', '134xxx')
const Dmaj7 = shape('Dmaj7', 'xx0222', 'xx0111')
const EoverD = shape('E/D', 'xx0454', 'xx0131')
const Bm7b5 = shape('Bm7♭5', 'x2323x', 'x1324x')
const Cmaj7 = shape('Cmaj7', 'x32000', 'x32000')

/** Every voicing shown in this unit with its intended chord (for automated checks). `omit` = chord tones left out, `extra` = added bass notes. */
export const U10_VOICINGS: { shape: ChordShape; root: string; type: string; omit?: string[]; extra?: string[] }[] = [
  { shape: C, root: 'C', type: 'maj' },
  { shape: F, root: 'F', type: 'maj' },
  { shape: G, root: 'G', type: 'maj' },
  { shape: Am, root: 'A', type: 'min' },
  { shape: Am7, root: 'A', type: 'min7' },
  { shape: D, root: 'D', type: 'maj' },
  { shape: D9, root: 'D', type: 'dom9', omit: ['A'] },
  { shape: Dm7, root: 'D', type: 'min7' },
  { shape: A, root: 'A', type: 'maj' },
  { shape: Em, root: 'E', type: 'min' },
  { shape: E5, root: 'E', type: 'power' },
  { shape: F5, root: 'F', type: 'power' },
  { shape: Dmaj7, root: 'D', type: 'maj7' },
  { shape: EoverD, root: 'E', type: 'maj', extra: ['D'] },
  { shape: Bm7b5, root: 'B', type: 'm7b5' },
  { shape: Cmaj7, root: 'C', type: 'maj7' }
]

const VAMPS: Record<Mode, { shapes: ChordShape[]; label: string; example: ToolExample }> = {
  ionian: { shapes: [C, F, G], label: 'C Ionian: C – F – G', example: progressionExample('C', ['I', 'IV', 'V'], 'ionian') },
  dorian: { shapes: [Am7, D9], label: 'A Dorian: Am7 – D9', example: progressionExample('A', ['i7', 'IV9'], 'dorian') },
  phrygian: { shapes: [Em, F], label: 'E Phrygian: Em – F', example: progressionExample('E', ['i', 'bII'], 'phrygian') },
  lydian: { shapes: [Dmaj7, EoverD], label: 'D Lydian: Dmaj7 – E/D', example: { ...progressionExample('D', ['Imaj7', 'II7'], 'lydian'), label: 'Dmaj7 – E/D (E7 tones)' } },
  mixolydian: { shapes: [A, G], label: 'A Mixolydian: A – G', example: progressionExample('A', ['I', 'bVII'], 'mixolydian') },
  aeolian: { shapes: [Am, F, G], label: 'A Aeolian: Am – F – G', example: progressionExample('A', ['i', 'bVI', 'bVII'], 'aeolian') },
  locrian: { shapes: [Bm7b5, Cmaj7], label: 'B Locrian: Bm7♭5 – Cmaj7', example: progressionExample('B', ['i7b5', 'bIImaj7'], 'locrian') }
}

// ---------- generated questions ----------

/** Show generated prompts/explanations with real sharp and flat glyphs. */
const pq = (q: QuizQuestion): QuizQuestion => ({ ...q, prompt: pretty(q.prompt), explain: q.explain && pretty(q.explain) })

/** Pick a parent major key and a mode; the mode's root is the parent's nth degree. */
function randomModeInKey(): { parent: string; mode: Mode; root: string; idx: number } {
  const parent = rand(PARENTS)
  const idx = Math.floor(Math.random() * 7)
  const mode = MODE_ORDER[idx] as Mode
  const root = noteName(buildScale(parent, 'major')[idx])
  return { parent, mode, root, idx }
}

const spellMode = (): QuizQuestion => {
  let r = randomModeInKey()
  while (r.mode === 'ionian') r = randomModeInKey()
  const { root, mode, parent } = r
  const answer = scaleNames(root, mode)
  return {
    kind: 'spell',
    prompt: `Spell **${root} ${MODES[mode].name}** ascending from its root (7 notes).`,
    answer,
    explain: `${MODES[mode].name} = **${degreeLabels(mode).join(' ')}**, so ${root} ${MODES[mode].name} is **${answer.join(' ')}**. Same notes as ${parent} major, but starting and resting on ${root}.`
  }
}

const parentKey = (): QuizQuestion => {
  let r = randomModeInKey()
  while (r.mode === 'ionian') r = randomModeInKey()
  const { root, mode, parent, idx } = r
  const wrong = distractors(
    [...new Set([root, noteName(transpose(parent, 'P5')), noteName(transpose(parent, 'P4')), noteName(transpose(root, 'P4')), noteName(transpose(root, 'P5'))])].filter(
      (k) => k !== parent
    ),
    parent,
    3
  )
  return mc(`**${root} ${MODES[mode].name}** uses exactly the same notes as which **major scale**?`, `${parent} major`, wrong.map((w) => `${w} major`), {
    explain: `${MODES[mode].name} is mode ${idx + 1} of the major scale, so ${root} is degree ${idx + 1} of the parent key. Count back: ${root} is the ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][idx]} note of **${parent} major**.`
  })
}

const charNote = (): QuizQuestion => {
  let mode: Mode, root: string, note: string
  do {
    mode = rand(['dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'] as Mode[])
    root = rand(['C', 'D', 'E', 'G', 'A', 'F', 'B', 'Bb'])
    note = noteName(transpose(root, MODES[mode].charIv))
  } while (['Cb', 'Fb', 'E#', 'B#'].includes(note) || /##|bb/.test(note))
  return {
    kind: 'spell',
    prompt: `What is the **characteristic note** (the ${MODES[mode].char[0]}) of **${root} ${MODES[mode].name}**? Type one note (spelling counts).`,
    answer: [note],
    explain: `${MODES[mode].name}'s signature degree is the **${MODES[mode].char[0]}**. In ${root} ${MODES[mode].name} that's **${note}**. Lean on it and the mode's colour jumps out.`
  }
}

const hearMode = (): QuizQuestion => {
  const mode = rand(['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian'] as Mode[])
  const root = rand(['E', 'A', 'D', 'G'])
  const wrong = distractors(['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian'] as Mode[], mode, 3).map((x) => MODES[x].name)
  return mc('Listen to the scale over its root drone. Which **mode** is it?', MODES[mode].name, wrong, {
    play: overDrone(root, mode, 132),
    explain: `That was **${root} ${MODES[mode].name}** (${degreeLabels(mode).join(' ')}). Listen for the ${MODES[mode].char.join(' and ')}: ${MODES[mode].sound}.`
  })
}

const findCharNote = (): QuizQuestion => {
  const mode = rand(['dorian', 'lydian', 'mixolydian', 'phrygian'] as Mode[])
  const root = rand(['A', 'G', 'E', 'D'])
  const note = noteName(transpose(root, MODES[mode].charIv))
  const string = rand([5, 4, 3])
  const targets = positionsOf(note, 0, 12).filter((t) => t.string === string)
  const sname = ['', '1st', '2nd', '3rd (G)', '4th (D)', '5th (A)', '6th'][string]
  return {
    kind: 'fretboard',
    prompt: `Click the **characteristic note of ${root} ${MODES[mode].name}** on the **${sname}** string (frets 0–12).`,
    targets,
    explain: `The ${MODES[mode].char[0]} of ${root} is **${note}**: fret ${targets.map((t) => t.fret).join(' or ')} on that string.`
  }
}

// ---------- unit ----------

const derivativeRows = MODE_ORDER.map((x, i) => {
  const root = noteName(buildScale('C', 'major')[i])
  return [`${i + 1}`, `${root} ${MODES[x as Mode].name}`, scaleNames(root, x).join(' ')]
})

const parallelRows = BRIGHTNESS.map((x) => [MODES[x].name, degreeLabels(x).join(' '), scaleNames('A', x).join(' '), MODES[x].char.join(', ')])

const unit: Unit = {
  id: 'u10',
  number: 10,
  title: 'Modes',
  summary: 'The seven modes of the major scale: two ways to think about them, their signature notes, vamps and fretboard shapes.',
  lessons: [
    {
      id: 'u10l1',
      title: 'What is a mode?',
      summary: 'Same seven notes, different home: the "derivative" view of modes.',
      blocks: [
        {
          type: 'text',
          md: `Play a C major scale, but start and stop on **D** instead of C: D E F G A B C D. You haven't added a single sharp or flat, yet it sounds noticeably different. It's minor-ish, and it has a cool, jazzy lift. You've just played the **Dorian mode**.

A **mode** is a scale heard from a different home note. The major scale has seven notes, so it has **seven modes**, one starting on each degree. They have Greek names (from medieval church music, not ancient Greece):`
        },
        {
          type: 'table',
          headers: ['Start on degree', 'Mode (from C major)', 'Notes'],
          rows: derivativeRows,
          caption: 'The seven modes of C major. Every row uses only white-key notes.'
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `A classic memory aid for the order: **I D**on't **P**articularly **L**ike **M**odes **A** **L**ot. (Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian.)`
        },
        {
          type: 'text',
          md: `### Why it sounds different
The notes are the same, but the **distances from the home note** change. From C, the third note (E) is a major 3rd above. From D, the third note (F) is only a minor 3rd above, so D Dorian is a *minor* sound. Your ear always measures everything against the note that feels like home, the **tonal centre**.

That's the key point of this whole unit: **a mode only exists when the ear hears its root as home.** Noodling the C major scale over a C chord is just C major, no matter which note you start on. To hear D Dorian you need a D drone, a Dm chord, or a D bass note underneath.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major notes over a C drone', play: overDrone('C', 'ionian') },
            { label: 'The same notes over a D drone (D Dorian)', play: overDrone('D', 'dorian') },
            { label: '…over an E drone (E Phrygian)', play: overDrone('E', 'phrygian') }
          ]
        },
        {
          type: 'fretboard',
          marks: scaleMarks('C', 'major', { frets: [0, 12] }),
          caption: 'C major across the neck, with C as the root (red).'
        },
        {
          type: 'fretboard',
          marks: scaleMarks('D', 'dorian', { frets: [0, 12] }),
          caption: 'D Dorian: exactly the same dots, only the highlighted home note has moved to D.'
        },
        {
          type: 'text',
          md: `This "start the major scale on a different degree" idea is called the **derivative** (or *relative*) view. It's handy for finding notes quickly: *"D Dorian? That's C major starting on D."* We'll use it for fretboard shapes later.

But it hides what makes each mode special. For that we need the **parallel** view, next lesson.`
        },
        {
          type: 'tryIt',
          question: mc('Which mode do you get if you play the C major scale from **G to G**?', 'Mixolydian', ['Lydian', 'Dorian', 'Aeolian'], {
            explain: 'G is the 5th degree of C major, and the 5th mode is **Mixolydian**: G A B C D E F.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'A Aeolian uses the same notes as which major key? (Type the key letter.)',
            accept: ['C', 'C major'],
            explain: 'A is the 6th degree of **C major**, and Aeolian is the 6th mode. A Aeolian is the A natural minor scale, the relative minor of C.'
          }
        }
      ]
    },
    {
      id: 'u10l2',
      title: 'The parallel view: modes from one root',
      summary: 'Compare all seven modes from the same root to hear and see their characteristic notes.',
      blocks: [
        {
          type: 'text',
          md: `Musicians who *use* modes mostly think **parallel**: keep the root fixed and compare each mode to the major scale (or to natural minor). Each mode then becomes a formula, a major scale with a few notes altered.

Here are all seven from **A**, ordered from brightest to darkest:`
        },
        {
          type: 'table',
          headers: ['Mode', 'Formula', 'From A', 'Characteristic'],
          rows: parallelRows,
          caption: 'Brightest to darkest. Each row lowers exactly one note of the row above it.'
        },
        {
          type: 'text',
          md: `### The brightness ladder
Look at the table from top to bottom. Each step **flattens exactly one note**:
1. **Lydian** has a ♯4: the brightest.
2. Lower the ♯4 → **Ionian** (major).
3. Lower the 7 → **Mixolydian**.
4. Lower the 3 → **Dorian** (now minor).
5. Lower the 6 → **Aeolian** (natural minor).
6. Lower the 2 → **Phrygian**.
7. Lower the 5 → **Locrian**: the darkest, with a diminished tonic chord.

### Characteristic notes
The **characteristic note** is the one that separates a mode from its nearest "plain" relative, major or natural minor:
- **Lydian** = major with a **♯4**
- **Mixolydian** = major with a **♭7**
- **Dorian** = natural minor with a **♮6**
- **Phrygian** = natural minor with a **♭2**
- **Locrian** = Phrygian with a **♭5**

Play the characteristic note, especially on strong beats or held notes, and the mode announces itself. Avoid it and you're just playing major or minor pentatonic.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A Lydian', play: overDrone('A', 'lydian') },
            { label: 'A Ionian', play: overDrone('A', 'ionian') },
            { label: 'A Mixolydian', play: overDrone('A', 'mixolydian') },
            { label: 'A Dorian', play: overDrone('A', 'dorian') }
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A Aeolian', play: overDrone('A', 'aeolian') },
            { label: 'A Phrygian', play: overDrone('A', 'phrygian') },
            { label: 'A Locrian', play: overDrone('A', 'locrian') }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Pentatonic + two.** Every mode except Locrian is a pentatonic scale you already know plus two notes:
- Major pentatonic (1 2 3 5 6) + **4, 7** = Ionian; + **♯4, 7** = Lydian; + **4, ♭7** = Mixolydian
- Minor pentatonic (1 ♭3 4 5 ♭7) + **2, 6** = Dorian; + **2, ♭6** = Aeolian; + **♭2, ♭6** = Phrygian

So the mode lives in the two notes you add to your pentatonic box.`
        },
        {
          type: 'text',
          md: `### Seeing it on one string
The single string is a great place to compare modes, because the gaps are obvious. Here is A Ionian and A Mixolydian on the A string: one dot moves.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('A', 'ionian', { frets: [0, 12], label: 'degree' }).filter((x) => x.string === 5),
          caption: 'A Ionian on the 5th string: the 7 (G♯) is at fret 11.',
          playAll: true
        },
        {
          type: 'fretboard',
          marks: modeMarks('A', 'mixolydian', { frets: [0, 12] }).filter((x) => x.string === 5),
          caption: 'A Mixolydian: the ♭7 (G) drops to fret 10. Characteristic note in orange.',
          playAll: true
        },
        {
          type: 'tryIt',
          question: mc('Which mode is **natural minor with a raised (natural) 6th**?', 'Dorian', ['Phrygian', 'Mixolydian', 'Aeolian'], {
            explain: 'Aeolian is 1 2 ♭3 4 5 ♭6 ♭7. Raise the ♭6 to 6 and you have **Dorian**: 1 2 ♭3 4 5 6 ♭7.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell **A Lydian** from A.',
            answer: scaleNames('A', 'lydian'),
            explain: 'A major is A B C♯ D E F♯ G♯. Raise the 4th (D → D♯): **A B C♯ D♯ E F♯ G♯**.'
          }
        }
      ]
    },
    {
      id: 'u10l3',
      title: 'The major modes: Ionian, Lydian, Mixolydian',
      summary: 'Three modes with a major 3rd: formulas, sounds, vamps and songs.',
      blocks: [
        {
          type: 'text',
          md: `Three modes have a **major 3rd** and a perfect 5th, so their home chord is a major triad. They differ only in the **4th** and the **7th**:
- **Lydian**: ♯4, 7
- **Ionian**: 4, 7
- **Mixolydian**: 4, ♭7`
        },
        {
          type: 'text',
          md: `### Ionian (1 2 3 4 5 6 7)
This is plain major. It's the home of countless pop, folk and country songs. Its natural 4th is a tense note over the I chord; it wants to fall to the 3rd. Typical progressions use I, IV and V freely, for example C–F–G.`
        },
        { type: 'chords', shapes: [C, F, G], toolExamples: [VAMPS.ionian.example], caption: 'Ionian vamp in C: I – IV – V.' },
        { type: 'audio', label: VAMPS.ionian.label, play: vamp(VAMPS.ionian.shapes, 2, 96, VAMPS.ionian.example) },
        {
          type: 'text',
          md: `### Lydian (1 2 3 ♯4 5 6 7)
Raise the 4th and the tension disappears: the ♯4 sits a whole step above the 3rd and floats. Lydian sounds **dreamy, weightless, cinematic**. It's the sound of film scores, of Joe Satriani's *Flying in a Blue Dream*, and of *The Simpsons* theme. Fleetwood Mac's *Dreams* is often cited as a Lydian vamp too.

The giveaway chord is the **major II**: in D Lydian, an **E major** chord (E G♯ B) contains the ♯4, G♯. Playing E over a D bass note (E/D) is the classic Lydian sound.`
        },
        { type: 'chords', shapes: [Dmaj7, EoverD], toolExamples: [VAMPS.lydian.example], caption: 'D Lydian vamp: Dmaj7 – E/D (the major II chord over the tonic bass).' },
        { type: 'audio', label: VAMPS.lydian.label, play: vamp(VAMPS.lydian.shapes, 2, 84, VAMPS.lydian.example) },
        modeBoard('D', 'lydian', 'D Lydian, 3 notes per string from the 6th-string root. The ♯4 (G♯) is orange.', { box: 0, perString: 3 }),
        {
          type: 'tab',
          caption: 'A D Lydian lick over a D chord: climb to the ♯4 (G♯) and let it ring.',
          toolExamples: [{ kind: 'scale', root: 'D', type: 'lydian' }],
          bpm: 90,
          events: [
            { pos: [p(2, 3)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(1, 2)], beats: 0.5 },
            { pos: [p(1, 4)], beats: 1.5 },
            { pos: [p(1, 5)], beats: 0.5 },
            { pos: [p(1, 4)], beats: 0.5 },
            { pos: [p(1, 2)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(2, 3)], beats: 2 }
          ]
        },
        {
          type: 'text',
          md: `### Mixolydian (1 2 3 4 5 6 ♭7)
Lower the 7th and major turns **bluesy and rocking**. Mixolydian is the mode of the dominant 7th chord, and the home of classic rock: *Sweet Home Alabama* (D–C–G), *Norwegian Wood*, the verse of *Sweet Child O' Mine*, and countless jam-band grooves.

The giveaway chord is the **♭VII**: in A Mixolydian, a **G major** chord (G B D) contains the ♭7, G. The I–♭VII move (A–G, D–C, E–D) is pure Mixolydian.`
        },
        { type: 'chords', shapes: [A, G], toolExamples: [VAMPS.mixolydian.example], caption: 'A Mixolydian vamp: I – ♭VII.' },
        { type: 'audio', label: VAMPS.mixolydian.label, play: vamp(VAMPS.mixolydian.shapes, 2, 96, VAMPS.mixolydian.example) },
        modeBoard('A', 'mixolydian', 'A Mixolydian, 3 notes per string. The ♭7 (G) is orange.', { box: 0, perString: 3 }),
        {
          type: 'tab',
          caption: 'Mixolydian lick in A (2nd position): outline the A chord, then land on G, the ♭7.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'mixolydian' }],
          bpm: 96,
          events: [
            { pos: [p(3, 2)], beats: 0.5 },
            { pos: [p(2, 2)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(1, 3)], beats: 1.5 },
            { pos: [p(1, 2)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(2, 3)], beats: 0.5 },
            { pos: [p(2, 2)], beats: 0.5 },
            { pos: [p(3, 2)], beats: 2 }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Loop the A–G vamp (or record it) and improvise with **A major pentatonic**. Then add the G. Then the D. Notice how the G instantly says "Mixolydian", while a G♯ would clash with the G chord.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. The chords are I and a chord a whole step **below**. Which mode does this vamp suggest?', 'Mixolydian', ['Lydian', 'Dorian', 'Ionian'], {
            play: vamp([D, C], 1),
            explain: 'D to C is I–♭VII. The C chord contains C natural, the **♭7** of D: **D Mixolydian**.'
          })
        }
      ]
    },
    {
      id: 'u10l4',
      title: 'The minor modes: Dorian, Aeolian, Phrygian, Locrian',
      summary: 'Four modes with a minor 3rd, from cool Dorian to unstable Locrian.',
      blocks: [
        {
          type: 'text',
          md: `The other four modes all have a **minor 3rd**. Dorian, Aeolian and Phrygian have a minor tonic triad; Locrian's tonic is diminished. Compare them against **Aeolian** (natural minor), 1 2 ♭3 4 5 ♭6 ♭7:
- **Dorian**: raise the 6 → 1 2 ♭3 4 5 **6** ♭7
- **Phrygian**: lower the 2 → 1 **♭2** ♭3 4 5 ♭6 ♭7
- **Locrian**: lower the 2 and the 5 → 1 **♭2** ♭3 4 **♭5** ♭6 ♭7`
        },
        {
          type: 'text',
          md: `### Dorian (1 2 ♭3 4 5 6 ♭7)
The **natural 6th** lifts the gloom: Dorian is minor but cool, soulful and hopeful. It's Santana's *Oye Como Va* and *Evil Ways*, Miles Davis's *So What*, the folk song *Scarborough Fair*, and the default minor sound of funk and jazz.

Giveaway chord: the **major IV**. In A Dorian, D major (D **F♯** A) contains the natural 6. Am7–D (or Am7–D9) is the archetypal Dorian vamp.`
        },
        { type: 'chords', shapes: [Am7, D9], toolExamples: [VAMPS.dorian.example], caption: 'A Dorian vamp: i – IV (Am7 – D9).' },
        { type: 'audio', label: VAMPS.dorian.label, play: vamp(VAMPS.dorian.shapes, 2, 100, VAMPS.dorian.example) },
        modeBoard('A', 'dorian', 'A Dorian, 3 notes per string from the 5th fret. The 6 (F♯) is orange.', { box: 0, perString: 3 }),
        {
          type: 'tab',
          caption: 'Dorian lick in A, 5th position: lean on the F♯.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'dorian', frets: [4, 8] }],
          bpm: 100,
          events: [
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(2, 7)], beats: 1 },
            { pos: [p(1, 5)], beats: 0.5 },
            { pos: [p(2, 7)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(3, 7)], beats: 0.5 },
            { pos: [p(3, 5)], beats: 0.5 },
            { pos: [p(4, 7)], beats: 2 }
          ]
        },
        {
          type: 'text',
          md: `### Aeolian (1 2 ♭3 4 5 ♭6 ♭7)
This is the **natural minor** scale: sad, serious, epic. The **♭6** is its darkest colour, and it's the note that separates it from Dorian. Think *All Along the Watchtower* or the outro of *Stairway to Heaven*.

Giveaway chord: the **♭VI**. In A Aeolian, F major (**F** A C) contains the ♭6. i–♭VI–♭VII (Am–F–G) is the classic rock-minor progression.`
        },
        { type: 'chords', shapes: [Am, F, G], toolExamples: [VAMPS.aeolian.example], caption: 'A Aeolian vamp: i – ♭VI – ♭VII.' },
        { type: 'audio', label: VAMPS.aeolian.label, play: vamp(VAMPS.aeolian.shapes, 2, 96, VAMPS.aeolian.example) },
        {
          type: 'tab',
          caption: 'Aeolian descent in A: the F (♭6) falling to E is the sound of natural minor.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'aeolian' }],
          bpm: 90,
          events: [
            { pos: [p(1, 5)], beats: 0.5 },
            { pos: [p(2, 8)], beats: 0.5 },
            { pos: [p(2, 6)], beats: 1 },
            { pos: [p(2, 5)], beats: 1 },
            { pos: [p(3, 7)], beats: 0.5 },
            { pos: [p(3, 5)], beats: 0.5 },
            { pos: [p(4, 7)], beats: 2 }
          ]
        },
        {
          type: 'text',
          md: `### Phrygian (1 ♭2 ♭3 4 5 ♭6 ♭7)
The **♭2**, a half step above the root, gives Phrygian its dark, Spanish, menacing sound. It's everywhere in flamenco and in metal riffs; Metallica's *Wherever I May Roam* and Jefferson Airplane's *White Rabbit* lean on that half-step pull.

Giveaway chord: the **♭II**. In E Phrygian that's F major. On guitar, E Phrygian is a gift: the open low E plus the 1st fret F.`
        },
        { type: 'chords', shapes: [Em, F, E5, F5], toolExamples: [progressionExample('E', ['i', 'bII', 'I5', 'bII5'], 'phrygian')], caption: 'E Phrygian: i – ♭II, as full chords and as power chords.' },
        { type: 'audio', label: VAMPS.phrygian.label, play: vamp(VAMPS.phrygian.shapes, 2, 96, VAMPS.phrygian.example) },
        {
          type: 'tab',
          caption: 'Phrygian riff on the low E string: the open E against F (♭2) and G (♭3).',
          toolExamples: [{ kind: 'scale', root: 'E', type: 'phrygian' }],
          bpm: 120,
          events: [
            { pos: [p(6, 0)], beats: 0.5 },
            { pos: [p(6, 0)], beats: 0.5 },
            { pos: [p(6, 1)], beats: 0.5 },
            { pos: [p(6, 0)], beats: 0.5 },
            { pos: [p(6, 3)], beats: 0.5 },
            { pos: [p(6, 1)], beats: 0.5 },
            { pos: [p(6, 0)], beats: 1 },
            { pos: [p(6, 0), p(5, 2)], beats: 1 },
            { pos: [p(6, 1), p(5, 3)], beats: 1 },
            { pos: [p(6, 0), p(5, 2)], beats: 2 }
          ]
        },
        {
          type: 'text',
          md: `### Locrian (1 ♭2 ♭3 4 ♭5 ♭6 ♭7)
Locrian's tonic chord is **diminished** (1 ♭3 ♭5), so it never sounds fully at rest. It's rare as a home key; you'll meet it in metal riffs built on the root and ♭5, and Björk's *Army of Me* is often cited as a Locrian example. Its most important job is in jazz: the Locrian scale fits the **m7♭5** chord, as you'll see in [[preview:u12l5]].`
        },
        { type: 'chords', shapes: [Bm7b5, Cmaj7], toolExamples: [VAMPS.locrian.example], caption: 'B Locrian colour: Bm7♭5 – Cmaj7 (i – ♭II).' },
        {
          type: 'audioRow',
          items: [
            { label: VAMPS.locrian.label, play: vamp(VAMPS.locrian.shapes, 1, 80, VAMPS.locrian.example) },
            {
              label: 'Locrian riff (B, C, F)',
              play: {
                kind: 'sequence',
                bpm: 120,
                toolExample: { kind: 'scale', root: 'B', type: 'locrian' },
                events: [47, 47, 48, 47, 53, 52, 48, 47].map((n, i) => ({ notes: [n], beats: i === 7 ? 2 : 0.5 }))
              }
            }
          ]
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which minor mode is this vamp?', 'Phrygian', ['Dorian', 'Aeolian', 'Locrian'], {
            play: vamp([E5, F5], 2, 110),
            explain: 'The chord a **half step above** the root (E → F) is the ♭II: **Phrygian**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which note turns A Aeolian into A Dorian?', 'F becomes F♯', ['B becomes B♭', 'G becomes G♯', 'C becomes C♯'], {
            explain: 'Dorian has a natural 6. The 6th of A is F, so F → **F♯**.'
          })
        }
      ]
    },
    {
      id: 'u10l5',
      title: 'Mode shapes on the fretboard',
      summary: 'Three-notes-per-string patterns: one fingering, seven modes, and how to target the right root.',
      blocks: [
        {
          type: 'text',
          md: `You don't need 49 new shapes. Because each mode is a major scale started from another degree, the **seven 3-notes-per-string (3NPS) patterns of one major scale cover every mode** of that key. What changes is which note you treat as home.

### Approach 1: derivative shapes
To play A Dorian, think "A is the 2nd degree of **G major**", then play G major patterns but **start, end and rest on A**.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('G', 'major', { box: 1, perString: 3, label: 'note' }).map((x) => ({ ...x, label: x.label ? pretty(x.label) : x.label })),
          frets: [4, 11],
          caption: 'G major, 3NPS pattern starting on its 2nd degree (A) at the 5th fret. G is red.',
          playAll: true
        },
        modeBoard('A', 'dorian', 'The identical shape seen as A Dorian: now A is the root and the 6 (F♯) is highlighted.', { box: 0, perString: 3 }),
        {
          type: 'text',
          md: `### Approach 2: parallel shapes from one root
Better for hearing the differences: keep your hand at **one root**, like A at the 5th fret, and change the pattern to the mode you want. Each step down the brightness ladder moves just one note a fret lower.`
        },
        modeBoard('A', 'lydian', 'A Lydian (♯4 = D♯).', { box: 0, perString: 3 }),
        modeBoard('A', 'ionian', 'A Ionian (major).', { box: 0, perString: 3 }),
        modeBoard('A', 'phrygian', 'A Phrygian (♭2 = B♭).', { box: 0, perString: 3 }),
        {
          type: 'tip',
          tone: 'theory',
          md: `Look at the 2nd (B) string in each pattern: the G and B strings are tuned a major 3rd apart (not a 4th like the others), so every pattern shifts up a fret there. The orange **characteristic note** is the only dot that moves between neighbouring modes on the brightness ladder.`
        },
        {
          type: 'text',
          md: `### Approach 3: positional boxes
Many players prefer a 4–5 fret "position" rather than stretchy 3NPS shapes. This is A Dorian in 5th position, every note between frets 4 and 8. It's the A minor pentatonic box 1 with B and F♯ added.`
        },
        {
          type: 'fretboard',
          marks: modeMarks('A', 'dorian', { frets: [4, 8] }),
          frets: [3, 10],
          caption: 'A Dorian in 5th position (frets 4–8). Minor pentatonic box + 2 and 6.',
          playAll: true
        },
        { type: 'audioRow', items: [
          { label: 'A Dorian up and back', play: playScale('A', 'dorian', 2, true) },
          { label: 'A Phrygian up and back', play: playScale('A', 'phrygian', 2, true) },
          { label: 'A Lydian up and back', play: playScale('A', 'lydian', 2, true) }
        ] },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Parallel-mode drill:** play A Ionian from the 5th fret, then A Mixolydian, A Dorian, A Aeolian, A Phrygian: each time find the single note that moved. Then try it from the A on the 5th string (12th fret, or open A).`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'You\'re playing **A Mixolydian** in 5th position. Click its characteristic note, the **♭7 (G)**, on the **4th (D) string**.',
            marks: modeMarks('A', 'mixolydian', { frets: [4, 8] }).map((x) => ({ ...x, label: undefined, color: x.color === 'root' ? 'root' : 'ghost' })),
            frets: [3, 10],
            targets: [{ string: 4, fret: 5 }],
            explain: 'G on the D string is at the **5th fret**. In 5th position it sits right under your first finger.'
          }
        },
        {
          type: 'tryIt',
          question: mc('You want **E Dorian**. Which major scale\'s patterns can you borrow?', 'D major', ['E major', 'A major', 'G major'], {
            explain: 'Dorian is mode 2, so E is the 2nd degree of **D major**: E F♯ G A B C♯ D.'
          })
        }
      ]
    },
    {
      id: 'u10l6',
      title: 'Hearing and using modes',
      summary: 'Find the mode of a progression, target the characteristic note, and play over modal vamps.',
      blocks: [
        {
          type: 'text',
          md: `When you meet a progression, figure out its mode in three steps:
1. **Find home.** Which chord feels like rest? Usually the first and last chord, or the one the vamp keeps returning to.
2. **Collect the notes.** Spell all the chords and gather their notes into one scale.
3. **Compare with the tonic.** Which degree gives it away? Look for the "signature chord".`
        },
        {
          type: 'table',
          headers: ['Mode', 'Tonic chord', 'Signature chord', 'Why', 'Example in A'],
          rows: [
            ['Lydian', 'major', 'II (major)', 'its 3rd is the ♯4', 'A – B'],
            ['Ionian', 'major', 'IV and V together', 'IV has the 4, V has the 7', 'A – D – E'],
            ['Mixolydian', 'major', '♭VII (or v minor)', 'its root is the ♭7', 'A – G'],
            ['Dorian', 'minor', 'IV (major)', 'its 3rd is the ♮6', 'Am – D'],
            ['Aeolian', 'minor', '♭VI', 'its root is the ♭6', 'Am – F'],
            ['Phrygian', 'minor', '♭II', 'its root is the ♭2', 'Am – B♭'],
            ['Locrian', 'diminished', 'm7♭5 tonic (and ♭II)', 'the ♭5 is already in the tonic chord', 'Am7♭5 – B♭maj7']
          ],
          caption: 'Signature chords: the one chord that contains the characteristic note.'
        },
        {
          type: 'text',
          md: `### Worked example
**G – F – C – G.** Home is G. The notes: G B D, F A C, C E G → G A B C D E F. Compared with G major, the F is a **♭7**. So: **G Mixolydian**. Solo with G major pentatonic, and add F and C to bring out the mode.

**Dm7 – G.** Home is Dm. Notes: D F A C, G B D → D E F G A B C. Against D natural minor (which has B♭), the **B natural** is a raised 6th. So: **D Dorian**.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G – F – C – G (Mixolydian)', play: vamp([G, F, C, G], 1, 96, progressionExample('G', ['I', 'bVII', 'IV', 'I'], 'mixolydian')) },
            { label: 'Dm7 – G (Dorian)', play: vamp([Dm7, G], 2, 96, progressionExample('D', ['i7', 'IV'], 'dorian')) }
          ]
        },
        {
          type: 'text',
          md: `### Playing over a vamp
- **Start from the pentatonic** that matches the tonic chord (major or minor).
- **Add the characteristic note** and give it weight: land on it, bend into it, hold it.
- **Resolve to chord tones** of the tonic chord when the vamp comes home.
- Keep the **root audible** (drone, bass or tonic chord). Without a clear home, the mode collapses back into its parent major key.`
        },
        {
          type: 'staff',
          caption: 'An A Dorian line that keeps landing on F♯, the 6th. (Written an octave higher, as guitar music is.)',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'dorian' }],
          timeSig: '4/4',
          notes: [
            { keys: ['a/4'], duration: '8' },
            { keys: ['c/5'], duration: '8' },
            { keys: ['e/5'], duration: '8' },
            { keys: ['f#/5'], duration: '8' },
            { keys: ['f#/5'], duration: 'q' },
            { keys: ['e/5'], duration: '8' },
            { keys: ['d/5'], duration: '8' },
            { keys: ['c/5'], duration: '8' },
            { keys: ['b/4'], duration: '8' },
            { keys: ['f#/4'], duration: 'q' },
            { keys: ['a/4'], duration: 'h' }
          ]
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**Modal vs. tonal.** In a normal (tonal) song the chords keep moving and modes are just colours over individual chords. "Modal" music *stays put*: a one- or two-chord vamp that keeps the root fixed so the characteristic note can shine. If the progression is C–Am–F–G, playing "D Dorian over the Dm" isn't really a different mode; you're in C major.`
        },
        {
          type: 'tryIt',
          question: mc('Progression: **E – D – A – E**. Which mode?', 'E Mixolydian', ['E Ionian', 'E Dorian', 'A Lydian'], {
            explain: 'Home is E. The D chord contains D natural, the **♭7** of E. So E Mixolydian (parent A major).',
            play: vamp([shape('E', '022100'), D, A, shape('E', '022100')], 1)
          })
        },
        {
          type: 'tryIt',
          question: mc('Progression: **Cm – F**, looping. Which mode?', 'C Dorian', ['C Aeolian', 'C Phrygian', 'F Mixolydian'], {
            explain: 'Home is Cm. F major (F **A** C) contains A natural, the **♮6** of C: **C Dorian**.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('**D Dorian** uses the same notes as which major scale?', 'C major', ['D major', 'F major', 'G major'], {
        explain: 'Dorian is mode 2. D is the 2nd degree of **C major**.'
      }),
      mc('Which mode is the **brightest**?', 'Lydian', ['Ionian', 'Mixolydian', 'Dorian'], {
        explain: 'Lydian has a **♯4** on top of the major scale. Every other mode has at least one note lower.'
      }),
      mc('What is the characteristic note of **Mixolydian**?', '♭7', ['♯4', '♭3', '♭6'], {
        explain: 'Mixolydian = major with a **♭7** (1 2 3 4 5 6 ♭7).'
      }),
      mc('Which vamp is the classic **Dorian** sound?', 'i – IV (e.g. Am – D)', ['i – ♭II (e.g. Em – F)', 'I – II (e.g. D – E)', 'I – ♭VII (e.g. A – G)'], {
        explain: 'The major IV chord contains the natural 6th, Dorian\'s signature.'
      }),
      mc('Which mode is the **5th mode** of the major scale?', 'Mixolydian', ['Lydian', 'Aeolian', 'Dorian'], {
        explain: 'Ionian, Dorian, Phrygian, Lydian, **Mixolydian**, Aeolian, Locrian.'
      }),
      mc('Which mode has a **diminished** tonic triad?', 'Locrian', ['Phrygian', 'Aeolian', 'Lydian'], {
        explain: '**Locrian** has a ♭3 and a ♭5, so its tonic triad is diminished. That\'s why it rarely works as a home key.'
      }),
      mc('C Ionian and C Mixolydian differ by just one note. Which?', 'B vs B♭', ['F vs F♯', 'E vs E♭', 'A vs A♭'], {
        explain: 'Mixolydian lowers the 7th: B → **B♭**.'
      }),
      mc('Listen to this vamp. Which mode does it suggest?', 'Dorian', ['Aeolian', 'Mixolydian', 'Phrygian'], {
        play: vamp([Am7, D9], 2, 100),
        explain: 'Am7 → D9 is i – IV. The D chord\'s F♯ is the natural 6 of A: **A Dorian** (the *Oye Como Va* sound).'
      }),
      mc('Listen to this vamp. Which mode does it suggest?', 'Lydian', ['Mixolydian', 'Ionian', 'Dorian'], {
        play: vamp([Dmaj7, EoverD], 2, 84),
        explain: 'Dmaj7 → E/D is I – II. E major contains G♯, the **♯4** of D: Lydian.'
      }),
      mc('Listen to the scale over its drone. Which mode?', 'Phrygian', ['Aeolian', 'Locrian', 'Dorian'], {
        play: overDrone('E', 'phrygian', 132),
        explain: 'The very first step is a half step (E → F): that **♭2** marks **Phrygian**. Locrian would also have a ♭5.'
      }),
      { kind: 'spell', prompt: 'Spell **G Mixolydian** from G.', answer: scaleNames('G', 'mixolydian'), explain: 'G major with a ♭7: **G A B C D E F**. Same notes as C major.' },
      { kind: 'spell', prompt: 'Spell **E Phrygian** from E.', answer: scaleNames('E', 'phrygian'), explain: 'E Phrygian is C major from E: **E F G A B C D**.' },
      { kind: 'spell', prompt: 'Spell **F Lydian** from F.', answer: scaleNames('F', 'lydian'), explain: 'F major has B♭. Lydian raises the 4th to **B**: F G A B C D E, the white keys from F.' },
      { kind: 'text', prompt: 'How many modes does the major scale have?', accept: ['7', 'seven'], explain: 'Seven, one starting on each scale degree.' },
      {
        kind: 'fretboard',
        prompt: 'In **A Dorian**, click the characteristic note (the 6th, F♯) on the **4th (D) string**.',
        targets: positionsOf('F#', 0, 12).filter((t) => t.string === 4),
        explain: 'F♯ on the D string is at the **4th fret**. That natural 6 is what makes A Dorian different from A natural minor.'
      },
      mc('Which **song** is a famous Mixolydian I–♭VII-style example?', 'Sweet Home Alabama', ['Oye Como Va', 'Scarborough Fair', 'White Rabbit'], {
        explain: '*Sweet Home Alabama* rides D–C–G: D Mixolydian. *Oye Como Va* and *Scarborough Fair* are Dorian; *White Rabbit* leans Phrygian.'
      }),
      mc('Major pentatonic plus **♯4 and 7** gives which mode?', 'Lydian', ['Ionian', 'Mixolydian', 'Dorian'], {
        explain: '1 2 3 5 6 + ♯4 + 7 = 1 2 3 ♯4 5 6 7: **Lydian**.'
      })
    ],
    generators: [spellMode, parentKey, charNote, hearMode, findCharNote].map((g) => () => pq(g()))
  }
}

export default unit
