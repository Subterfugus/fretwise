import type { Block, FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { mc, rand, scaleMarks, distractors, shuffle } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, shape, shapeMidis, movableChord, positionsOf } from '@/theory/guitar'
import { ScaleType, degreeLabels, scaleNames, scaleSemitones } from '@/theory/scales'
import { ChordType, chordSymbol, diatonicChords } from '@/theory/chords'
import { mod, noteName, pitchClass, pretty } from '@/theory/notes'
import { transpose } from '@/theory/intervals'

// ---------- local helpers ----------

function fit(marks: { fret: number }[]): [number, number] {
  const fs = marks.map((p) => p.fret)
  const lo = Math.min(...fs)
  const hi = Math.max(...fs)
  if (hi <= 12) return [0, 12]
  return [Math.max(0, lo - 1), Math.max(hi + 1, lo + 8)]
}

/** Scale marks labelled by degree, with some degrees highlighted. */
function accentMarks(root: string, type: ScaleType, accent: string[], opts: { box?: number; perString?: number; frets?: [number, number] } = {}): FretMark[] {
  return scaleMarks(root, type, { ...opts, label: 'degree' }).map((mk) =>
    mk.color !== 'root' && mk.label && accent.includes(mk.label) ? { ...mk, color: 'accent' } : mk
  )
}

function board(marks: FretMark[], caption: string, frets?: [number, number]): Block {
  return { type: 'fretboard', marks, frets: frets ?? fit(marks), caption, playAll: true }
}

/** A progression: each chord strummed once for `beats`, the last one held. */
function prog(shapes: ChordShape[], beats = 2, bpm = 92, toolExample?: ToolExample): PlaySpec {
  return {
    kind: 'sequence',
    bpm,
    toolExample,
    events: shapes.map((s, i) => ({ notes: shapeMidis(s), beats: i === shapes.length - 1 ? Math.max(4, beats) : beats, mode: 'strum' as const }))
  }
}

/** A barre voicing (E- or A-form), whichever sits lower on the neck. */
function voice(root: string, type: ChordType): ChordShape {
  const opts = [movableChord(root, type, 6, 1), movableChord(root, type, 5, 1)].filter((x): x is ChordShape => !!x)
  const hi = (s: ChordShape) => Math.max(...(s.frets.filter((f) => f !== null) as number[]))
  return opts.sort((a, b) => hi(a) - hi(b))[0]
}

const droneMidi = (root: string): number => 40 + mod(pitchClass(root) - 4, 12)

function overDrone(root: string, type: ScaleType, bpm = 120): PlaySpec {
  const d = droneMidi(root)
  const r = d + 12
  const up = [...scaleSemitones(type).map((s) => r + s), r + 12]
  const line = [...up, ...up.slice(0, -1).reverse()]
  return {
    kind: 'sequence',
    bpm,
    toolExample: { kind: 'scale', root, type },
    events: [
      { notes: [d, d + 7, d + 12], beats: 2, mode: 'strum' },
      ...line.map((n, i) => ({ notes: i % 2 === 0 ? [d, n] : [n], beats: 1, mode: 'block' as const })),
      { notes: [d, d + 12], beats: 2, mode: 'block' }
    ]
  }
}

const p = (string: number, fret: number) => ({ string, fret })

// ---------- voicings ----------

const Am = shape('Am', 'x02210', 'x02310')
const Dm = shape('Dm', 'xx0231', 'xx0231')
const Em = shape('Em', '022000', '023000')
const E = shape('E', '022100', '023100')
const E7 = shape('E7', '020100', '020100')
const F = shape('F', '133211', '134211', 1)
const G = shape('G', '320003', '210003')
const C = shape('C', 'x32010', 'x32010')
const D = shape('D', 'xx0232', 'xx0132')
const A = shape('A', 'x02220', 'x01230')
const A7 = shape('A7', 'x02020', 'x02030')
const B7 = shape('B7', 'x21202', 'x21304')
const C7 = shape('C7', 'x32310', 'x32410')
const D7 = shape('D7', 'xx0212', 'xx0213')
const G7 = shape('G7', '320001', '320001')
const Bdim = shape('B°', 'x2343x', 'x1243x')
const Gs_dim7 = shape('G♯°7', '4x343x', '2x131x')
const Fm = shape('Fm', '133111', '134111', 1)
const Ab = shape('A♭', '466544', '134211', 4)
const Bb = shape('B♭', 'x13331', 'x12341', 1)
const Eb = shape('E♭', 'x68886', 'x12341', 6)
const Cm = shape('Cm', 'x35543', 'x13421', 3)
const Db = shape('D♭', 'x46664', 'x12341', 4)
const Gb = shape('G♭', '244322', '134211', 2)

export const U11_VOICINGS: { shape: ChordShape; root: string; type: string; omit?: string[]; extra?: string[] }[] = [
  { shape: Am, root: 'A', type: 'min' },
  { shape: Dm, root: 'D', type: 'min' },
  { shape: Em, root: 'E', type: 'min' },
  { shape: E, root: 'E', type: 'maj' },
  { shape: E7, root: 'E', type: 'dom7' },
  { shape: F, root: 'F', type: 'maj' },
  { shape: G, root: 'G', type: 'maj' },
  { shape: C, root: 'C', type: 'maj' },
  { shape: D, root: 'D', type: 'maj' },
  { shape: A, root: 'A', type: 'maj' },
  { shape: A7, root: 'A', type: 'dom7' },
  { shape: B7, root: 'B', type: 'dom7' },
  { shape: C7, root: 'C', type: 'dom7', omit: ['G'] },
  { shape: D7, root: 'D', type: 'dom7' },
  { shape: G7, root: 'G', type: 'dom7' },
  { shape: Bdim, root: 'B', type: 'dim' },
  { shape: Gs_dim7, root: 'G#', type: 'dim7' },
  { shape: Fm, root: 'F', type: 'min' },
  { shape: Ab, root: 'Ab', type: 'maj' },
  { shape: Bb, root: 'Bb', type: 'maj' },
  { shape: Eb, root: 'Eb', type: 'maj' },
  { shape: Cm, root: 'C', type: 'min' },
  { shape: Db, root: 'Db', type: 'maj' },
  { shape: Gb, root: 'Gb', type: 'maj' }
]

// ---------- tables built from the theory engine ----------

const naturalTriads = diatonicChords('A', 'naturalMinor')
const naturalSevenths = diatonicChords('A', 'naturalMinor', true)
const harmonicTriads = diatonicChords('A', 'harmonicMinor')

/** Secondary dominant of a degree in a major key. */
function secondaryDominant(key: string, degree: number): string {
  const target = diatonicChords(key, 'major')[degree - 1]
  return chordSymbol(transpose(target.root, 'P5'), 'dom7')
}
const SEC_ROWS = [2, 3, 4, 5, 6].map((d) => {
  const t = diatonicChords('C', 'major')[d - 1]
  const lt = noteName(transpose(t.root, 'M7'))
  return [`V7/${t.roman}`, secondaryDominant('C', d), t.symbol, lt]
})

const C_CHORDS = diatonicChords('C', 'major')
const G_CHORDS = diatonicChords('G', 'major')
const COMMON_CG = C_CHORDS.filter((c) => G_CHORDS.some((g) => g.symbol === c.symbol))

// ---------- generated questions ----------

/** Show generated prompts/explanations with real sharp and flat glyphs. */
const pq = (q: QuizQuestion): QuizQuestion => ({ ...q, prompt: pretty(q.prompt), explain: q.explain && pretty(q.explain) })

const MINOR_KEYS = ['A', 'E', 'D', 'G', 'C', 'B', 'F', 'F#']
const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']

const spellMinorVariant = (): QuizQuestion => {
  const type = rand(['harmonicMinor', 'melodicMinor'] as const)
  const root = rand(MINOR_KEYS.filter((k) => k !== 'F#' || type === 'harmonicMinor'))
  const answer = scaleNames(root, type)
  const name = type === 'harmonicMinor' ? 'harmonic minor' : 'melodic minor (ascending)'
  return {
    kind: 'spell',
    prompt: `Spell **${root} ${name}** from ${root}.`,
    answer,
    explain: `${name[0].toUpperCase() + name.slice(1)} = **${degreeLabels(type).join(' ')}**. From ${root}: **${answer.join(' ')}**.${
      type === 'harmonicMinor' ? ` The raised 7th (${answer[6]}) is the leading tone.` : ` Both the 6th (${answer[5]}) and 7th (${answer[6]}) are raised.`
    }`
  }
}

const minorDominant = (): QuizQuestion => {
  const key = rand(MINOR_KEYS)
  const v = noteName(transpose(key, 'P5'))
  const correct = chordSymbol(v, 'dom7')
  const lt = noteName(transpose(key, 'M7'))
  return mc(`In **${key} minor**, what is the **V7** chord built from harmonic minor?`, correct, [chordSymbol(v, 'min7'), chordSymbol(transpose(key, 'P4'), 'dom7'), chordSymbol(transpose(key, 'm7'), 'dom7')], {
    explain: `The 5th of ${key} is ${v}. Harmonic minor raises the 7th to **${lt}**, which becomes the major 3rd of the V chord: **${correct}** (${v} ${noteName(transpose(v, 'M3'))} ${noteName(transpose(v, 'P5'))} ${noteName(transpose(v, 'm7'))}).`
  })
}

const secDomQ = (): QuizQuestion => {
  const key = rand(MAJOR_KEYS)
  const degree = rand([2, 3, 4, 5, 6])
  const chords = diatonicChords(key, 'major')
  const target = chords[degree - 1]
  const correct = secondaryDominant(key, degree)
  const wrong = [2, 3, 4, 5, 6].filter((d) => d !== degree).map((d) => secondaryDominant(key, d))
  wrong.push(chordSymbol(target.root, 'dom7'))
  return mc(`In **${key} major**, what is **V7/${target.roman}** (the secondary dominant of ${target.symbol})?`, correct, distractors(wrong, correct, 3), {
    explain: `Go up a perfect 5th from ${target.root}: **${correct}**. Its 3rd, ${noteName(transpose(target.root, 'M7'))}, is a half step below ${target.root}, acting as a temporary leading tone.`
  })
}

const BORROWED: { label: string; iv: string; type: ChordType }[] = [
  { label: 'iv', iv: 'P4', type: 'min' },
  { label: '♭VI', iv: 'm6', type: 'maj' },
  { label: '♭VII', iv: 'm7', type: 'maj' },
  { label: '♭III', iv: 'm3', type: 'maj' }
]

const borrowedQ = (): QuizQuestion => {
  const key = rand(['C', 'G', 'D', 'A', 'F', 'E'])
  const b = rand(BORROWED)
  const root = transpose(key, b.iv)
  const correct = chordSymbol(root, b.type)
  const wrong = [
    chordSymbol(root, b.type === 'min' ? 'maj' : 'min'),
    ...BORROWED.filter((x) => x !== b).map((x) => chordSymbol(transpose(key, x.iv), x.type)),
    chordSymbol(transpose(key, b.iv.replace('m', 'M')), b.type === 'min' ? 'maj' : 'min')
  ]
  return mc(`In **${key} major**, which chord is the **${b.label}** borrowed from ${key} minor?`, correct, distractors([...new Set(wrong)], correct, 3), {
    explain: `${b.label} in ${key} is **${correct}**. It comes from ${key} natural minor (${scaleNames(key, 'naturalMinor').join(' ')}), the parallel minor.`
  })
}

const hearMinorV = (): QuizQuestion => {
  const key = rand(['A', 'E', 'D', 'G', 'C', 'B'])
  const major = Math.random() < 0.5
  const i = voice(key, 'min')
  const iv = voice(noteName(transpose(key, 'P4')), 'min')
  const v = voice(noteName(transpose(key, 'P5')), major ? 'dom7' : 'min')
  return mc('Listen: **i – iv – ? – i** in a minor key. Is the third chord a **minor v** or a **major V7**?', major ? 'Major V7 (harmonic minor)' : 'Minor v (natural minor)', [major ? 'Minor v (natural minor)' : 'Major V7 (harmonic minor)'], {
    play: prog([i, iv, v, i], 2, 88),
    explain: major
      ? `The V7 contains the raised 7th (${noteName(transpose(key, 'M7'))}), a leading tone that pulls strongly back to ${key}.`
      : `The minor v has the natural ♭7 (${noteName(transpose(key, 'm7'))}), so the return to i is soft and modal, without a leading tone.`
  })
}

const pivotQ = (): QuizQuestion => {
  const from = rand(['C', 'G', 'D', 'F', 'A'])
  const to = noteName(transpose(from, rand(['P5', 'P4'])))
  const a = diatonicChords(from, 'major')
  const b = diatonicChords(to, 'major')
  const common = a.filter((c) => c.type !== 'dim' && b.some((x) => x.symbol === c.symbol))
  const pick = rand(common)
  const wrong = [...a, ...b].filter((c) => c.type !== 'dim' && !common.some((x) => x.symbol === c.symbol)).map((c) => c.symbol)
  const other = b.find((x) => x.symbol === pick.symbol)!
  return mc(`Which chord could act as a **pivot chord** between **${from} major** and **${to} major**?`, pick.symbol, shuffle(wrong).slice(0, 3), {
    explain: `${pick.symbol} belongs to both keys: it's **${pick.roman}** in ${from} and **${other.roman}** in ${to}. Common chords: ${common.map((c) => c.symbol).join(', ')}.`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u11',
  number: 11,
  title: 'Minor keys and modulation',
  summary: 'Natural, harmonic and melodic minor, chords in minor keys, borrowed chords, secondary dominants and changing key.',
  lessons: [
    {
      id: 'u11l1',
      title: 'Three kinds of minor',
      summary: 'Natural, harmonic and melodic minor, and the one note that started it all.',
      blocks: [
        {
          type: 'text',
          md: `You already know **natural minor**: it's the Aeolian mode, 1 2 ♭3 4 5 ♭6 ♭7, and A natural minor uses the same notes as C major. But natural minor has a weakness that composers noticed centuries ago.

Play the A major scale up to the top: G♯ → A. That last half step, from the **7th degree** up to the root, is called the **leading tone**. It pulls hard toward home. Natural minor has **G** instead, a *whole step* below A, and that pull is gone.

So musicians patched minor in two ways.`
        },
        {
          type: 'table',
          headers: ['Scale', 'Formula', 'In A', 'Changed notes'],
          rows: [
            ['Natural minor', degreeLabels('naturalMinor').join(' '), scaleNames('A', 'naturalMinor').join(' '), '(none)'],
            ['Harmonic minor', degreeLabels('harmonicMinor').join(' '), scaleNames('A', 'harmonicMinor').join(' '), 'raised 7: G → G#'],
            ['Melodic minor', degreeLabels('melodicMinor').join(' '), scaleNames('A', 'melodicMinor').join(' '), 'raised 6 and 7: F#, G#']
          ]
        },
        {
          type: 'text',
          md: `### Harmonic minor
Raise the 7th. Now G♯ leads to A again, and, as you'll see next lesson, the **V chord becomes major** (E–G♯–B). The catch: between F and G♯ there's a gap of three half steps, an **augmented 2nd**. That gap gives harmonic minor its exotic, classical, neoclassical-metal sound (think Yngwie Malmsteen, or a flamenco or Middle-Eastern flavour).

### Melodic minor
To smooth over that awkward gap in melodies, raise the 6th too: F♯–G♯–A. In classical music, melodic minor goes **up** with the raised 6 and 7 and comes **down** as natural minor. In jazz, "melodic minor" means the ascending form used in both directions. It's a major scale with a ♭3.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A natural minor', play: overDrone('A', 'naturalMinor') },
            { label: 'A harmonic minor', play: overDrone('A', 'harmonicMinor') },
            { label: 'A melodic minor', play: overDrone('A', 'melodicMinor') }
          ]
        },
        board(accentMarks('A', 'harmonicMinor', ['7'], { box: 0, perString: 3 }), 'A harmonic minor, 3 notes per string from the 5th fret. The raised 7 (G♯) is orange.'),
        board(accentMarks('A', 'melodicMinor', ['6', '7'], { box: 0, perString: 3 }), 'A melodic minor: raised 6 (F♯) and 7 (G♯) in orange.'),
        {
          type: 'tab',
          caption: 'The augmented 2nd between the 2nd and 1st strings: F → G♯ → A, the signature harmonic-minor move.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'harmonicMinor' }],
          bpm: 84,
          events: [
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(2, 6)], beats: 0.5 },
            { pos: [p(1, 4)], beats: 1 },
            { pos: [p(1, 5)], beats: 1 },
            { pos: [p(1, 4)], beats: 0.5 },
            { pos: [p(2, 6)], beats: 0.5 },
            { pos: [p(2, 5)], beats: 0.5 },
            { pos: [p(3, 7)], beats: 0.5 },
            { pos: [p(3, 5)], beats: 0.5 },
            { pos: [p(3, 4)], beats: 0.5 },
            { pos: [p(4, 7)], beats: 2 }
          ]
        },
        {
          type: 'staff',
          caption: 'A melodic minor, classical style: up with F♯ and G♯, down as natural minor.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'melodicMinor', label: 'Ascending: A melodic minor' }, { kind: 'scale', root: 'A', type: 'naturalMinor', label: 'Descending: A natural minor' }],
          notes: [
            ...['a/4', 'b/4', 'c/5', 'd/5', 'e/5', 'f#/5', 'g#/5', 'a/5'].map((k) => ({ keys: [k], duration: '8' })),
            ...['g/5', 'f/5', 'e/5', 'd/5', 'c/5', 'b/4'].map((k) => ({ keys: [k], duration: '8' })),
            { keys: ['a/4'], duration: 'q' }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell **E harmonic minor** from E.',
            answer: scaleNames('E', 'harmonicMinor'),
            explain: 'E natural minor is E F♯ G A B C D. Raise the 7th: **E F♯ G A B C D♯**.'
          }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'Click the **leading tone of A harmonic minor** (G♯) on the **3rd (G) string**.',
            targets: [{ string: 3, fret: 1 }],
            frets: [0, 12],
            explain: 'G♯ on the G string is at the **1st fret**, a half step below the A at the 2nd fret. (The 13th fret is off this map.)'
          }
        }
      ]
    },
    {
      id: 'u11l2',
      title: 'Chords in a minor key',
      summary: 'Diatonic chords from natural and harmonic minor, and the power of i–iv–V7.',
      blocks: [
        {
          type: 'text',
          md: `Stack thirds on each degree of A natural minor and you get the same seven chords as C major, just starting from Am. The order of qualities is **minor, diminished, major, minor, minor, major, major**:`
        },
        {
          type: 'table',
          headers: ['Degree', ...naturalTriads.map((c) => c.roman)],
          rows: [
            ['Triads', ...naturalTriads.map((c) => c.symbol)],
            ['Sevenths', ...naturalSevenths.map((c) => c.symbol)]
          ],
          caption: 'Diatonic chords in A natural minor.'
        },
        {
          type: 'text',
          md: `### The problem with v
The natural-minor **v chord** is **Em** (E G B). Going Em → Am is pleasant, but it doesn't *resolve*; there's no leading tone. Raise G to **G♯** (harmonic minor) and the v becomes **E major**, or with the 7th, **E7** (E G♯ B D). Now G♯ pulls up to A and D pulls down to C: two half-step resolutions into Am. That's why harmonic minor exists: **to give minor keys a dominant V7**.`
        },
        {
          type: 'table',
          headers: ['Degree', ...harmonicTriads.map((c) => c.roman)],
          rows: [['Harmonic minor', ...harmonicTriads.map((c) => c.symbol)]],
          caption: 'Triads from A harmonic minor. The G♯ changes III, V and vii.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `In practice, minor-key songs **mix** the two: chords from natural minor (iv, ♭VI, ♭VII, ♭III) plus the **major V or V7** from harmonic minor. The vii°7 (G♯°7: G♯ B D F) from harmonic minor is another strong dominant-function chord.`
        },
        { type: 'chords', shapes: [Bdim, E, Gs_dim7], caption: 'Harmonic-minor chords in A: ii° (B°), V (E) and vii°7 (G♯°7).' },
        { type: 'chords', shapes: [Am, Dm, Em, E7], caption: 'In A minor: i, iv, v (natural) and V7 (harmonic).' },
        {
          type: 'audioRow',
          items: [
            { label: 'i – iv – v – i (Am Dm Em Am)', play: prog([Am, Dm, Em, Am], 2, 92, progressionExample('A', ['i', 'iv', 'v', 'i'], 'naturalMinor', 92, 2)) },
            { label: 'i – iv – V7 – i (Am Dm E7 Am)', play: prog([Am, Dm, E7, Am], 2, 92, progressionExample('A', ['i', 'iv', 'V7', 'i'], 'harmonicMinor', 92, 2)) }
          ]
        },
        {
          type: 'text',
          md: `### The Andalusian cadence
One of the most famous minor progressions walks down from i to V: **i – ♭VII – ♭VI – V**, in A minor **Am – G – F – E**. The first three chords come from natural minor; the final **E major** comes from harmonic minor. It's the backbone of flamenco, and of songs like *Hit the Road Jack* and *Walk Don't Run*.`
        },
        { type: 'chords', shapes: [Am, G, F, E], toolExamples: [progressionExample('A', ['i', 'bVII', 'bVI', 'V'], 'harmonicMinor')], caption: 'Andalusian cadence: Am – G – F – E.' },
        { type: 'audio', label: 'Andalusian cadence', play: prog([Am, G, F, E, Am], 2, 100, progressionExample('A', ['i', 'bVII', 'bVI', 'V', 'i'], 'harmonicMinor', 100, 2)) },
        {
          type: 'fretboard',
          marks: [
            ...positionsOf('E', 0, 5).map((x) => ({ ...x, label: 'E', color: 'tone' as const })),
            ...positionsOf('G#', 0, 5).map((x) => ({ ...x, label: 'G♯', color: 'accent' as const })),
            ...positionsOf('B', 0, 5).map((x) => ({ ...x, label: 'B', color: 'tone' as const })),
            ...positionsOf('D', 0, 5).map((x) => ({ ...x, label: 'D', color: 'tone' as const })),
            ...positionsOf('A', 0, 5).map((x) => ({ ...x, label: 'A', color: 'root' as const }))
          ],
          frets: [0, 5],
          caption: 'E7 chord tones (with the target A in red). Every orange G♯ is one fret below an A: the leading tone at work.'
        },
        {
          type: 'tryIt',
          question: mc('Listen. Does this minor progression use a **minor v** or a **major V7**?', 'Major V7', ['Minor v'], {
            play: prog([Am, Dm, E7, Am], 2, 92, progressionExample('A', ['i', 'iv', 'V7', 'i'], 'harmonicMinor', 92, 2)),
            explain: 'That was Am – Dm – **E7** – Am. The G♯ in E7 is the leading tone pulling to A.'
          })
        },
        {
          type: 'tryIt',
          question: mc('In **D minor**, which chord is the harmonic-minor **V7**?', 'A7', ['Am7', 'G7', 'C7'], {
            explain: 'The 5th of D is A. Harmonic minor raises C to **C♯**, giving A–C♯–E–G: **A7**.'
          })
        }
      ]
    },
    {
      id: 'u11l3',
      title: 'Borrowed chords (modal interchange)',
      summary: 'Bring the darkness of the parallel minor into a major key: iv, ♭VI, ♭VII and ♭III.',
      blocks: [
        {
          type: 'text',
          md: `**Parallel** keys share a tonic: C major and C minor. **Modal interchange** (or *borrowing*) means using a chord from the parallel minor while staying in the major key. The music stays in C; the borrowed chord just adds a shadow.

C natural minor is C D E♭ F G A♭ B♭, so the new notes are **E♭, A♭ and B♭**. Any chord containing them sounds "borrowed":`
        },
        {
          type: 'table',
          headers: ['Borrowed chord', 'In C', 'Borrowed note(s)', 'Sound / use'],
          rows: [
            ['iv', 'Fm', 'Ab', 'bittersweet, nostalgic: IV → iv → I'],
            ['♭VI', 'Ab', 'Ab, Eb', 'epic, cinematic'],
            ['♭VII', 'Bb', 'Bb', 'rock, anthemic (also Mixolydian)'],
            ['♭III', 'Eb', 'Eb, Bb', 'bold, bluesy-rock'],
            ['iiø7', 'Dm7♭5', 'Ab', 'dark pre-dominant, leads to V']
          ]
        },
        {
          type: 'fretboard',
          marks: [
            ...scaleMarks('C', 'major', { frets: [0, 5] }).map((x) => ({ ...x, color: x.color === 'root' ? ('root' as const) : ('ghost' as const) })),
            ...['Eb', 'Ab', 'Bb'].flatMap((n) => positionsOf(n, 0, 5).map((x) => ({ ...x, label: pretty(n), color: 'accent' as const })))
          ],
          frets: [0, 5],
          caption: 'C major (grey) plus the three notes borrowed from C minor (orange): Eb, Ab, Bb.'
        },
        {
          type: 'text',
          md: `### The minor iv
The most common borrowing of all. Play **C – F – Fm – C**: the A in F slides down to A♭, then to G in the C chord. That descending inner line is pure nostalgia. Radiohead's *Creep* (G – B – C – Cm) and the Beatles' *In My Life* both use the major IV followed by a minor iv.`
        },
        { type: 'chords', shapes: [C, F, Fm], toolExamples: [progressionExample('C', ['I', 'IV', 'iv'], 'major')], caption: 'IV → iv: F → Fm is a single note moving, A → A♭ (one fret on the G string).' },
        { type: 'audio', label: 'C – F – Fm – C', play: prog([C, F, Fm, C], 2, 80, progressionExample('C', ['I', 'IV', 'iv', 'I'], 'major', 80, 2)) },
        {
          type: 'text',
          md: `### ♭VI and ♭VII
**♭VI – ♭VII – I** (A♭ – B♭ – C) is a triumphant cadence, sometimes nicknamed the "Mario cadence" after video-game victory music. ♭VII alone is a rock staple: the coda of *Hey Jude* repeats **F – E♭ – B♭ – F**, a I – ♭VII – IV – I in F.`
        },
        { type: 'chords', shapes: [C, Ab, Bb, Eb], caption: 'C with borrowed ♭VI (A♭), ♭VII (B♭) and ♭III (E♭) as barre chords.' },
        {
          type: 'audioRow',
          items: [
            { label: 'C – A♭ – B♭ – C', play: prog([C, Ab, Bb, C], 2, 96, progressionExample('C', ['I', 'bVI', 'bVII', 'I'], 'major', 96, 2)) },
            { label: 'C – E♭ – F – C', play: prog([C, Eb, F, C], 2, 96, progressionExample('C', ['I', 'bIII', 'IV', 'I'], 'major', 96, 2)) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Take any major-key song you know and try replacing a IV with iv on its last appearance, or end with ♭VI – ♭VII – I. When soloing over a borrowed chord, follow it: play the **borrowed note** (A♭ over Fm or A♭, B♭ over B♭), or you'll clash.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which chord was borrowed from the parallel minor?', 'Fm (iv)', ['F (IV)', 'Am (vi)', 'G (V)'], {
            play: prog([C, F, Fm, C], 2, 80, progressionExample('C', ['I', 'IV', 'iv', 'I'], 'major', 80, 2)),
            explain: 'C – F – **Fm** – C. The A♭ in Fm comes from C minor.'
          })
        },
        {
          type: 'tryIt',
          question: mc('In **G major**, what is the borrowed **♭VI** chord?', 'E♭', ['E', 'Em', 'F'], {
            explain: 'G minor is G A B♭ C D **E♭** F. The ♭VI chord is **E♭** (E♭ G B♭).'
          })
        }
      ]
    },
    {
      id: 'u11l4',
      title: 'Secondary dominants',
      summary: 'Borrow the "V7" of any chord in the key: V/V, V/ii, V/vi and friends.',
      blocks: [
        {
          type: 'text',
          md: `The V7 → I pull is so strong that we can aim it at **any major or minor chord in the key**, not just I. A dominant 7th chord that resolves to a chord other than the tonic is a **secondary dominant**, written **V7/x** ("five of x").

To build one: go up a **perfect 5th** from the target chord's root and play a **dominant 7th**. In C major:`
        },
        {
          type: 'table',
          headers: ['Symbol', 'Chord', 'Resolves to', 'Its leading tone'],
          rows: SEC_ROWS,
          caption: 'Secondary dominants in C major. The leading tone (3rd of the dominant) is the non-diatonic note in most of them.',
          toolExamples: [
            { ...progressionExample('C', ['VI7', 'ii'], 'major'), label: 'A7 – Dm (V7/ii)' },
            { ...progressionExample('C', ['VII7', 'iii'], 'major'), label: 'B7 – Em (V7/iii)' },
            { ...progressionExample('C', ['I7', 'IV'], 'major'), label: 'C7 – F (V7/IV)' },
            { ...progressionExample('C', ['II7', 'V'], 'major'), label: 'D7 – G (V7/V)' },
            { ...progressionExample('C', ['III7', 'vi'], 'major'), label: 'E7 – Am (V7/vi)' }
          ]
        },
        {
          type: 'text',
          md: `Notice the chromatic notes: **A7** has C♯, **B7** has D♯, **D7** has F♯, **E7** has G♯, **C7** has B♭. Each is a half step away from a note of the target chord, so it tugs the ear toward it. There's no V/vii°, because a diminished chord can't feel like a temporary home.

You can hear secondary dominants all over jazz standards and ragtime. *Sweet Georgia Brown* opens on one, and the bridge of rhythm changes is a chain of them: D7 → G7 → C7 → F7, each the V of the next.`
        },
        { type: 'chords', shapes: [C, A7, Dm, G7], toolExamples: [progressionExample('C', ['I', 'VI7', 'ii', 'V7'], 'major')], caption: 'I – V7/ii – ii – V7: the A7 makes Dm sound like a momentary home.' },
        {
          type: 'audioRow',
          items: [
            { label: 'C – Am – Dm – G7 – C (plain)', play: prog([C, Am, Dm, G7, C], 2, 92, progressionExample('C', ['I', 'vi', 'ii', 'V7', 'I'], 'major', 92, 2)) },
            { label: 'C – A7 – Dm – G7 – C (with V7/ii)', play: prog([C, A7, Dm, G7, C], 2, 92, progressionExample('C', ['I', 'VI7', 'ii', 'V7', 'I'], 'major', 92, 2)) }
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C – E7 – Am (V7/vi)', play: prog([C, E7, Am], 2, 88, progressionExample('C', ['I', 'III7', 'vi'], 'major', 88, 2)) },
            { label: 'C – D7 – G (V7/V)', play: prog([C, D7, G], 2, 88, progressionExample('C', ['I', 'II7', 'V'], 'major', 88, 2)) },
            { label: 'C – C7 – F (V7/IV)', play: prog([C, C7, F], 2, 88, progressionExample('C', ['I', 'I7', 'IV'], 'major', 88, 2)) },
            { label: 'C – B7 – Em (V7/iii)', play: prog([C, B7, Em], 2, 88, progressionExample('C', ['I', 'VII7', 'iii'], 'major', 88, 2)) }
          ]
        },
        {
          type: 'fretboard',
          marks: [
            ...scaleMarks('C', 'major', { frets: [0, 5] }).map((x) => ({ ...x, color: x.color === 'root' ? ('root' as const) : ('ghost' as const) })),
            ...positionsOf('C#', 0, 5).map((x) => ({ ...x, label: 'C♯', color: 'accent' as const }))
          ],
          frets: [0, 5],
          caption: 'Soloing over A7 in C major: swap C for C♯ (orange). It resolves up a half step to D, the root of Dm.'
        },
        {
          type: 'tab',
          caption: 'Line over C – A7 – Dm: the C♯ (2nd string, 2nd fret) leads to D.',
          toolExamples: [progressionExample('C', ['I', 'VI7', 'ii'], 'major')],
          bpm: 90,
          events: [
            { pos: [p(2, 1)], beats: 1 },
            { pos: [p(3, 0)], beats: 0.5 },
            { pos: [p(2, 1)], beats: 0.5 },
            { pos: [p(1, 0)], beats: 2 },
            { pos: [p(2, 2)], beats: 1 },
            { pos: [p(1, 0)], beats: 0.5 },
            { pos: [p(3, 2)], beats: 0.5 },
            { pos: [p(2, 2)], beats: 1 },
            { pos: [p(2, 3)], beats: 3 }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Same-fret trick:** the 5th string is a 4th above the 6th string, and a target chord is a 4th above its dominant. So an **E-form V7** (root on the 6th string) resolves to an **A-form chord at the same fret** (root on the 5th string): B7 at fret 7 → Em at fret 7, E7 at fret 12 → Am at fret 12, A7 at fret 5 → Dm at fret 5. Find any secondary dominant without moving your hand.`
        },
        {
          type: 'tryIt',
          question: mc('In **C major**, what is **V7/V**?', 'D7', ['G7', 'A7', 'F7'], {
            explain: 'V in C is G. A perfect 5th above G is D, so V7/V = **D7** (D F♯ A C).'
          })
        },
        {
          type: 'tryIt',
          question: mc('In **G major**, what is **V7/vi**?', 'B7', ['E7', 'D7', 'F♯7'], {
            explain: 'vi in G is Em. A 5th above E is B: **B7**, whose D♯ leads to E.'
          })
        }
      ]
    },
    {
      id: 'u11l5',
      title: 'Tonicization vs modulation, and the pivot chord',
      summary: 'When does a new chord become a new key? Changing key smoothly with a shared chord.',
      blocks: [
        {
          type: 'text',
          md: `A secondary dominant makes a chord sound like home **for a moment**. That's **tonicization**: a brief visit, after which the music returns to the original key.

**Modulation** is moving in: the new tonic is confirmed with a **cadence** (usually V–I in the new key), the new key's notes take over, and the music stays there for a while (a new section, a bridge, the last chorus).

A useful test: if you could rewrite the passage with a new key signature and it would make sense for several bars, it's a modulation.`
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Tonicization: C – **A7 – Dm** – G7 – C (Dm is home for a moment).
Modulation: C – F – Am – **D7 – G** – C – **D7 – G** (G becomes the new home and stays).`
        },
        {
          type: 'text',
          md: `### The pivot chord
The smoothest way to change key is through a chord that **belongs to both keys**. The ear hears it in the old key, then reinterprets it in the new one.

C major and G major share four chords:`
        },
        {
          type: 'table',
          headers: ['Chord', 'In C major', 'In G major'],
          rows: COMMON_CG.map((c) => [c.symbol, c.roman, G_CHORDS.find((g) => g.symbol === c.symbol)!.roman]),
          caption: 'Pivot chords between C and G (keys a 5th apart share six of seven notes).'
        },
        {
          type: 'text',
          md: `A classic pivot modulation from C to G:
1. **C – F** establishes C.
2. **Am** is vi in C... and **ii** in G. That's the pivot.
3. **D7 – G** is V7 – I in G, with the new F♯ confirming the key.
4. **C – D7 – G** keeps us in G (C is now IV).`
        },
        { type: 'chords', shapes: [C, F, Am, D7, G], caption: 'C – F – Am (pivot) – D7 – G.' },
        { type: 'audio', label: 'Pivot modulation C → G', play: prog([C, F, Am, D7, G, C, D7, G], 2, 96), toolExamples: [
          { ...progressionExample('C', ['I', 'IV', 'vi'], 'major', 96, 2), label: 'C major: C – F – Am' },
          { ...progressionExample('G', ['ii', 'V7', 'I', 'IV', 'V7', 'I'], 'major', 96, 2), label: 'G major: Am – D7 – G – C – D7 – G' }
        ] },
        {
          type: 'fretboard',
          marks: [
            ...scaleMarks('G', 'major', { frets: [0, 5] }).map((x) => ({
              ...x,
              label: x.label ? pretty(x.label) : x.label,
              color: x.label === 'F#' ? ('accent' as const) : x.color
            }))
          ],
          frets: [0, 5],
          caption: 'G major in open position. The only change from C major is F → F♯ (orange): listen for it to hear the key change.',
        },
        {
          type: 'tryIt',
          question: mc('In a modulation from **C major to G major**, Am can be a pivot chord. What is Am in G major?', 'ii', ['vi', 'iii', 'IV'], {
            explain: 'G major: G Am Bm C D Em F♯°. Am is the **ii** chord, so it naturally leads to D7 (V7) and G.'
          })
        },
        {
          type: 'tryIt',
          question: mc('C – A7 – Dm – G7 – C. What happens to the Dm?', 'It is tonicized (a brief visit)', ['The song modulates to D minor', 'It is borrowed from C minor', 'It is a pivot chord'], {
            explain: 'A7 makes Dm sound like home for a beat, but the music returns to C straight away: **tonicization**.'
          })
        }
      ]
    },
    {
      id: 'u11l6',
      title: 'More ways to change key, and hearing them',
      summary: 'Direct ("truck-driver") modulation, modulating via the dominant, relative and parallel shifts.',
      blocks: [
        {
          type: 'text',
          md: `### Direct modulation (the "truck-driver" key change)
No preparation at all: the song just jumps to a new key, often **up a half step or whole step** for the final chorus, giving an instant lift. It's sometimes nicknamed the *truck-driver's gear change*. You'll hear it in *My Girl* (up a whole step), *Man in the Mirror* (up a half step) and, several times in a row, in Beyoncé's *Love on Top*.

On guitar, a half-step lift is trivial: move every barre chord **up one fret**.`
        },
        { type: 'chords', shapes: [C, F, G, D, G, A], caption: 'C – F – G, then the same progression up a whole step: D – G – A.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Up a whole step (C → D)', play: prog([C, F, G, C, D, G, A, D], 2, 104) },
            { label: 'Up a half step (C → D♭)', play: prog([C, F, G, C, Db, Gb, Ab, Db], 2, 104) }
          ],
          toolExamples: [
            { ...progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 104, 2), label: 'Before the lift: C major' },
            { ...progressionExample('D', ['I', 'IV', 'V', 'I'], 'major', 104, 2), label: 'Whole-step lift: D major' },
            { ...progressionExample('Db', ['I', 'IV', 'V', 'I'], 'major', 104, 2), label: 'Half-step lift: D-flat major' }
          ]
        },
        {
          type: 'text',
          md: `### Via the new key's dominant
Less abrupt: insert the **V7 of the new key** and resolve to it. The V7 announces the new tonic. From C to A major: **C – G – C – E7 – A**. The E7 has G♯, which doesn't belong in C, so the ear starts expecting A.

### Relative and parallel moves
- **Relative**: C major ↔ A minor share every note. Just cadence on Am with E7 → Am and you're in A minor. Verse in minor, chorus in the relative major is extremely common.
- **Parallel**: C major ↔ C minor share a tonic but three notes change (E♭, A♭, B♭). It's dramatic, like the lights dimming.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C → A major via E7', play: prog([C, F, G, C, E7, A, D, E7, A], 2, 100) },
            { label: 'C major → A minor (relative)', play: prog([C, F, G, C, E7, Am, Dm, E7, Am], 2, 100) },
            { label: 'C major → C minor (parallel)', play: prog([C, F, G, C, Cm, Fm, G7, Cm], 2, 100) }
          ],
          toolExamples: [
            { ...progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 100, 2), label: 'Starting key: C major' },
            { ...progressionExample('A', ['V7', 'I', 'IV', 'V7', 'I'], 'major', 100, 2), label: 'New key: A major' },
            { ...progressionExample('A', ['V7', 'i', 'iv', 'V7', 'i'], 'harmonicMinor', 100, 2), label: 'Relative key: A minor' },
            { ...progressionExample('C', ['i', 'iv', 'V7', 'i'], 'harmonicMinor', 100, 2), label: 'Parallel key: C minor' }
          ]
        },
        {
          type: 'table',
          headers: ['Technique', 'How', 'Feels like'],
          rows: [
            ['Pivot chord', 'a chord common to both keys, then V–I in the new key', 'smooth, natural'],
            ['Via dominant', 'jump to the V7 of the new key', 'clear, purposeful'],
            ['Direct / truck-driver', 'start in the new key, no preparation', 'sudden lift'],
            ['Relative', 'major ↔ its relative minor (same notes)', 'mood change, same colours'],
            ['Parallel', 'major ↔ minor on the same tonic', 'dramatic darkening/brightening']
          ]
        },
        {
          type: 'text',
          md: `### Hearing a key change
1. **Hum the tonic** while the song plays. When your note suddenly sounds wrong and another note feels like home, the key has moved.
2. Listen for a **new chromatic note that sticks around**. A one-off accidental is probably a secondary dominant; a note that keeps coming back is a new key signature.
3. Check for a **cadence**: V–I in the new key confirms modulation.
4. On guitar, notice when your **familiar shapes shift** up the neck by a fret or two for the last chorus.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. What kind of key change is this?', 'Direct (truck-driver), up a half step', ['Pivot chord to the dominant key', 'Parallel major to minor', 'No key change'], {
            play: prog([C, F, G, C, Db, Gb, Ab, Db], 2, 104),
            explain: 'C – F – G – C, then suddenly D♭ – G♭ – A♭ – D♭: the same progression one fret higher, with no preparation.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which chord would you insert to move from C major to **A major** "via the dominant"?', 'E7', ['G7', 'A7', 'D7'], {
            explain: 'The V7 of A is **E7** (E G♯ B D).'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('Why was the **harmonic minor** scale invented?', 'To raise the 7th, creating a leading tone and a major V (V7) chord in minor', [
        'To remove the awkward augmented 2nd',
        'To make minor sound brighter by raising the 3rd',
        'To give minor keys a major tonic chord'
      ], { explain: 'Raising ♭7 to 7 creates a **leading tone** and turns v into **V / V7**, which resolves strongly to i.' }),
      { kind: 'spell', prompt: 'Spell **A harmonic minor** from A.', answer: scaleNames('A', 'harmonicMinor'), explain: 'A natural minor with G raised to G♯: **A B C D E F G♯**.' },
      { kind: 'spell', prompt: 'Spell **A melodic minor** (ascending) from A.', answer: scaleNames('A', 'melodicMinor'), explain: 'Raise the 6th and 7th: **A B C D E F♯ G♯**.' },
      {
        kind: 'text',
        prompt: 'In harmonic minor, the step from the ♭6 to the raised 7 (F to G♯ in A) is what interval? (Two words.)',
        accept: ['augmented 2nd', 'augmented second', 'aug 2nd', 'A2', 'augmented 2'],
        explain: 'Three half steps, but spelled as a 2nd (F → G): an **augmented 2nd**.'
      },
      mc('In **A minor**, the V7 chord is…', 'E7', ['Em7', 'G7', 'D7'], { explain: 'E–G♯–B–D, using the raised 7th of harmonic minor.' }),
      mc('Listen. Is the dominant chord a **minor v** or a **major V7**?', 'Minor v', ['Major V7'], {
        play: prog([Am, Dm, Em, Am], 2, 92, progressionExample('A', ['i', 'iv', 'v', 'i'], 'naturalMinor', 92, 2)),
        explain: 'Am – Dm – **Em** – Am. No G♯, so the return to Am is gentle and modal.'
      }),
      mc('In **C major**, which chord is **V7/V**?', 'D7', ['G7', 'C7', 'A7'], { explain: 'A 5th above G is D: **D7** (with F♯ leading to G).' }),
      mc('In **G major**, which chord is **V7/ii**?', 'E7', ['A7', 'D7', 'B7'], { explain: 'ii in G is Am. A 5th above A is E: **E7**, whose G♯ leads to A.' }),
      mc('Which is a common **borrowed** chord in C major?', 'Fm', ['F', 'Dm', 'G7'], { explain: '**Fm** (iv) comes from C minor; its A♭ isn\'t in C major.' }),
      mc('Listen. Which borrowed chords lead back to C?', '♭VI – ♭VII (A♭ – B♭)', ['IV – V (F – G)', 'ii – V (Dm – G7)', 'iv – V (Fm – G)'], {
        play: prog([C, Ab, Bb, C], 2, 96, progressionExample('C', ['I', 'bVI', 'bVII', 'I'], 'major', 96, 2)),
        explain: 'C – **A♭ – B♭** – C: the triumphant ♭VI – ♭VII – I.'
      }),
      mc('What is the difference between **tonicization** and **modulation**?', 'Tonicization briefly makes a chord sound like home; modulation establishes a new key that lasts', [
        'They are the same thing',
        'Tonicization changes key permanently; modulation is brief',
        'Tonicization only happens in minor keys'
      ]),
      mc('Am is **vi** in C major. What is it in **G major**, making it a good pivot chord?', 'ii', ['iii', 'vi', 'IV'], {
        explain: 'In G major Am is **ii**, which leads naturally to D7 – G.'
      }),
      mc('A song repeats its last chorus **one fret higher** with no preparation. This is…', 'a direct (truck-driver) modulation', ['a pivot-chord modulation', 'a tonicization', 'modal interchange']),
      {
        kind: 'fretboard',
        prompt: 'Click the **leading tone of A harmonic minor** on the **6th string** (frets 0–12).',
        targets: positionsOf('G#', 0, 12).filter((t) => t.string === 6),
        explain: 'G♯ on the low E string is the **4th fret**, one fret below A at the 5th.'
      },
      mc('Which modulation keeps **all the same notes**?', 'C major → A minor (relative)', ['C major → C minor (parallel)', 'C major → D major', 'C major → D♭ major'], {
        explain: 'Relative keys share a key signature. Parallel keys share only the tonic.'
      })
    ],
    generators: [spellMinorVariant, minorDominant, secDomQ, borrowedQ, hearMinorV, pivotQ].map((g) => () => pq(g()))
  }
}

export default unit
