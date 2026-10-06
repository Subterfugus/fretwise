import type { Block, FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { m, mc, rand, randInt, shuffle, playInterval } from '../helpers'
import { FretPos, MAX_FRET, STRING_NAMES, openMidi, posKey } from '@/theory/guitar'
import { buildScale } from '@/theory/scales'
import { diatonicChords } from '@/theory/chords'
import { intervalBetween, parseInterval } from '@/theory/intervals'
import { mod, noteName, parseNote, pitchClass, pretty } from '@/theory/notes'
import { progressionExample } from '../toolExamples'

// ---------- harmony engine (everything below is computed, never typed by hand) ----------

type Size = 3 | 6 | 8 | 10
/** Scale steps from the lower note up to the upper note */
const SKIP: Record<Size, number> = { 3: 2, 6: 5, 8: 7, 10: 9 }
const MAJ_OFFS = [0, 2, 4, 5, 7, 9, 11]
const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'Db']

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const hs = (n: number) => `${n} half step${n === 1 ? '' : 's'}`
const dash = (a: string, b: string) => `${pretty(a)}–${pretty(b)}`
const SIZE_WORD: Record<Size, string> = { 3: '3rd', 6: '6th', 8: 'octave', 10: '10th' }

interface Pair {
  key: string
  /** 0-based scale degree of the lower note */
  degree: number
  low: string
  high: string
  /** e.g. "M3", "m6", "P8", "M10" */
  iv: string
  semis: number
}

/** The diatonic interval of a given size above scale degree `degree` (0-based) of a major key. */
function pairAt(key: string, degree: number, size: Size): Pair {
  const sc = buildScale(key, 'major')
  const lo = sc[degree % 7]
  const hi = sc[(degree + SKIP[size]) % 7]
  let iv: string
  if (size === 8) iv = 'P8'
  else {
    const base = intervalBetween(lo, hi).short
    iv = size === 10 ? base[0] + '10' : base
  }
  return { key, degree: degree % 7, low: noteName(lo), high: noteName(hi), iv, semis: parseInterval(iv).semitones }
}

interface Voiced {
  pair: Pair
  lowMidi: number
  highMidi: number
}
interface Placed extends Voiced {
  lowPos: FretPos
  highPos: FretPos
}

function voice(key: string, size: Size, lowMidi: number): Voiced {
  const sc = buildScale(key, 'major')
  const d = sc.findIndex((n) => pitchClass(n) === mod(lowMidi, 12))
  if (d < 0) throw new Error(`u16: midi ${lowMidi} is not in ${key} major`)
  const pair = pairAt(key, d, size)
  return { pair, lowMidi, highMidi: lowMidi + pair.semis }
}

function placeMidi(key: string, size: Size, sLow: number, sHigh: number, lowMidi: number): Placed {
  const v = voice(key, size, lowMidi)
  const lowPos = { string: sLow, fret: lowMidi - openMidi(sLow) }
  const highPos = { string: sHigh, fret: v.highMidi - openMidi(sHigh) }
  for (const p of [lowPos, highPos]) if (p.fret < 0 || p.fret > MAX_FRET) throw new Error(`u16: ${key} ${size} fret ${p.fret} out of range`)
  return { ...v, lowPos, highPos }
}

const stepMidi = (tonicMidi: number, step: number) => tonicMidi + MAJ_OFFS[step % 7] + 12 * Math.floor(step / 7)
const RUN8 = [0, 1, 2, 3, 4, 5, 6, 7]

function runVoiced(key: string, size: Size, tonicMidi: number, steps: number[] = RUN8): Voiced[] {
  if (mod(tonicMidi, 12) !== pitchClass(key)) throw new Error(`u16: tonic midi ${tonicMidi} is not ${key}`)
  return steps.map((s) => voice(key, size, stepMidi(tonicMidi, s)))
}

/** A run/phrase on one string pair; `tonicFret` is where the key note sits on the lower string. */
function runPlaced(key: string, size: Size, sLow: number, sHigh: number, tonicFret: number, steps: number[] = RUN8): Placed[] {
  const tonicMidi = openMidi(sLow) + tonicFret
  if (mod(tonicMidi, 12) !== pitchClass(key)) throw new Error(`u16: fret ${tonicFret} on string ${sLow} is not ${key}`)
  return steps.map((s) => placeMidi(key, size, sLow, sHigh, stepMidi(tonicMidi, s)))
}

/** Every diatonic pair whose lower note lies in frets lo..hi of the lower string, ordered low to high. */
function positionPairs(key: string, size: Size, sLow: number, sHigh: number, lo: number, hi: number): Placed[] {
  const sc = buildScale(key, 'major').map(pitchClass)
  const out: Placed[] = []
  for (let f = lo; f <= hi; f++) {
    const lowMidi = openMidi(sLow) + f
    if (!sc.includes(mod(lowMidi, 12))) continue
    try {
      out.push(placeMidi(key, size, sLow, sHigh, lowMidi))
    } catch {
      /* off the neck */
    }
  }
  return out
}

// ----- blocks built from pairs -----

function pairMarks(ps: Placed[], key: string): FretMark[] {
  const seen = new Set<string>()
  const out: FretMark[] = []
  const add = (pos: FretPos, name: string, upper: boolean) => {
    if (seen.has(posKey(pos))) return
    seen.add(posKey(pos))
    const tonic = pitchClass(name) === pitchClass(key)
    out.push({ ...pos, label: name, color: tonic ? 'root' : upper ? 'accent' : 'tone', toolExample: { kind: 'scale', root: key, type: 'major' } })
  }
  for (const p of ps) {
    add(p.lowPos, p.pair.low, false)
    add(p.highPos, p.pair.high, true)
  }
  return out
}

const tabEvents = (ps: Placed[], beats: number | number[] = 1) =>
  ps.map((p, i) => ({ pos: [p.lowPos, p.highPos], beats: Array.isArray(beats) ? beats[i] : beats }))

const pairsSeq = (ps: Voiced[], bpm = 84, beats: number | number[] = 1, extra: (i: number) => number[] = () => []): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample: ps.length ? { kind: 'scale', root: ps[0].pair.key, type: 'major' } : undefined,
  events: ps.map((p, i) => ({ notes: [...extra(i), p.lowMidi, p.highMidi], beats: Array.isArray(beats) ? beats[i] : beats, mode: 'block' as const }))
})

const lineSeq = (midis: number[], bpm: number, beats: number | number[] = 1): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: midis.map((n, i) => ({ notes: [n], beats: Array.isArray(beats) ? beats[i] : beats }))
})

/** VexFlow key (written an octave above sounding pitch, as guitar is notated). */
const vexKey = (name: string, soundingMidi: number) => `${name}/${Math.floor((soundingMidi + 12 - parseNote(name).acc) / 12) - 1}`

function pairsTable(key: string, size: Size, caption?: string): Block {
  return {
    type: 'table',
    headers: ['Degree', 'Lower note', `Upper note (${SIZE_WORD[size]} up)`, 'Interval', 'Half steps'],
    rows: [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const p = pairAt(key, d, size)
      return [String(d + 1), pretty(p.low), pretty(p.high), parseInterval(p.iv).long, String(p.semis)]
    }),
    caption
  }
}

/** Words for a fret difference */
function fretWords(delta: number): string {
  if (delta === 0) return 'the same fret'
  const n = Math.abs(delta)
  return `${n} fret${n === 1 ? '' : 's'} ${delta < 0 ? 'lower' : 'higher'}`
}

const long = (iv: string) => parseInterval(iv).long

// ---------- data used in the lessons ----------

// L1: C major and G major in 3rds, as pure sound and as a staff
const C_3RDS = runVoiced('C', 3, 48)
const G_3RDS = runVoiced('G', 3, 55)
/** The same melody with every upper note a major 3rd above: NOT diatonic */
const C_PARALLEL_MAJOR: PlaySpec = {
  kind: 'sequence',
  bpm: 84,
  events: C_3RDS.map((p) => ({ notes: [p.lowMidi, p.lowMidi + 4], beats: 1, mode: 'block' as const }))
}
const C_STAFF = {
  type: 'staff' as const,
  keySig: 'C',
  timeSig: '4/4',
  notes: C_3RDS.map((p) => ({ keys: [vexKey(p.pair.low, p.lowMidi), vexKey(p.pair.high, p.highMidi)], duration: 'q' })),
  bpm: 84,
  caption: 'The C major scale in diatonic 3rds. Written an octave above the sound, as guitar music always is.',
  toolExamples: [{ kind: 'scale' as const, root: 'C', type: 'major' as const }]
}

// L2: 3rds on adjacent strings
const G_ON_GB = runPlaced('G', 3, 3, 2, 0) // G major, strings 3 and 2 (G and B), tonic = open G
const C_ON_DG_M3 = runPlaced('C', 3, 4, 3, 10, [0]) // C on D string fret 10 -> E on G string
const C_ON_DG_m3 = runPlaced('C', 3, 4, 3, 10, [1]) // D -> F
const C_ON_GB_M3 = runPlaced('C', 3, 3, 2, 5, [0])
const C_ON_GB_m3 = runPlaced('C', 3, 3, 2, 5, [1])
const C_DG_POS = positionPairs('C', 3, 4, 3, 7, 12)
const C_BE_POS = positionPairs('C', 3, 2, 1, 1, 6)

// L3: 6ths
const G_ON_GE = runPlaced('G', 6, 3, 1, 0) // G major 6ths, strings 3 and 1: starts with two open strings
const C_ON_AG = runPlaced('C', 6, 5, 3, 3) // C major 6ths on strings 5 and 3
const G_DB_POS = positionPairs('G', 6, 4, 2, 5, 10)

// L5: octaves and 10ths
const C_OCT = runPlaced('C', 8, 5, 3, 3)
const C_OCT_PHRASE_STEPS = [4, 5, 4, 2, 0, 2, 4, 4]
const C_OCT_PHRASE = runPlaced('C', 8, 5, 3, 3, C_OCT_PHRASE_STEPS)
const C_TENTHS = runPlaced('C', 10, 5, 1, 3)

// L6: pairs over I-IV-V-I in C
const PROG: { sym: string; bass: FretPos; pair: Placed }[] = [
  { sym: 'C', bass: { string: 5, fret: 3 }, pair: placeMidi('C', 3, 3, 2, 60) }, // C-E
  { sym: 'F', bass: { string: 6, fret: 1 }, pair: placeMidi('C', 3, 3, 2, 57) }, // A-C
  { sym: 'G', bass: { string: 6, fret: 3 }, pair: placeMidi('C', 3, 3, 2, 59) }, // B-D
  { sym: 'C', bass: { string: 5, fret: 3 }, pair: placeMidi('C', 3, 3, 2, 60) }
]
const progBassMidi = (i: number) => openMidi(PROG[i].bass.string) + PROG[i].bass.fret
const PROG_SEQ: PlaySpec = { ...pairsSeq(
  PROG.map((p) => p.pair),
  72,
  2,
  (i) => [progBassMidi(i)]
), toolExample: progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 72, 2) }

// twin-guitar line in G major on strings 3 and 2
const TWIN_STEPS = [0, 2, 4, 2, 3, 2, 1, 0]
const TWIN_BEATS = [1, 0.5, 0.5, 1, 1, 1, 1, 2]
const TWIN = runPlaced('G', 3, 3, 2, 0, TWIN_STEPS)

// ---------- generators ----------

const ADJ_PAIRS: [number, number][] = [
  [6, 5],
  [5, 4],
  [4, 3],
  [3, 2],
  [2, 1]
]
const SKIP_PAIRS: [number, number][] = [
  [6, 4],
  [5, 3],
  [4, 2],
  [3, 1]
]

const diatonicSpellQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const size = rand([3, 6] as const)
  const d = randInt(0, 6)
  const p = pairAt(key, d, size)
  const nm = size === 3 ? '3rd' : '6th'
  return {
    kind: 'spell',
    prompt: `In the key of **${pretty(key)} major**, spell the diatonic ${nm} above **${pretty(p.low)}** (degree ${d + 1}).`,
    answer: [p.high],
    play: playInterval(`${p.low}3`, p.iv, 'harmonic'),
    explain: `${pretty(p.low)} is degree ${d + 1} of ${pretty(key)} major. A ${nm} up means ${size === 3 ? 'two' : 'five'} scale steps higher, which lands on **${pretty(p.high)}**. It is a ${long(p.iv)} (${hs(p.semis)}).`
  }
}

const qualityQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const size = rand([3, 6] as const)
  const d = randInt(0, 6)
  const p = pairAt(key, d, size)
  const nm = size === 3 ? '3rd' : '6th'
  const correct = cap(long(p.iv))
  const wrong = [cap(long((p.iv[0] === 'M' ? 'm' : 'M') + size))]
  return mc(`In **${pretty(key)} major**, is the diatonic ${nm} above **${pretty(p.low)}** (up to ${pretty(p.high)}) major or minor?`, correct, wrong, {
    play: playInterval(`${p.low}3`, p.iv, 'harmonic'),
    explain: `${dash(p.low, p.high)} is ${hs(p.semis)}: a **${long(p.iv)}**. In a major key the diatonic 3rds are major on degrees 1, 4 and 5 and minor on 2, 3, 6 and 7; the 6ths are major on 1, 2, 4 and 5 and minor on 3, 6 and 7.`
  })
}

const fretboardPairQ = (): QuizQuestion => {
  for (let tries = 0; tries < 500; tries++) {
    const key = rand(KEYS)
    const size = rand([3, 6] as const)
    const [sLow, sHigh] = rand(size === 3 ? ADJ_PAIRS : SKIP_PAIRS)
    const f = randInt(1, 10)
    let placed: Placed
    try {
      placed = placeMidi(key, size, sLow, sHigh, openMidi(sLow) + f)
    } catch {
      continue
    }
    if (placed.highPos.fret > 12) continue
    const nm = size === 3 ? '3rd' : '6th'
    const delta = placed.highPos.fret - f
    return {
      kind: 'fretboard',
      prompt: `In **${pretty(key)} major**, the note **${pretty(placed.pair.low)}** is marked on string ${sLow}, fret ${f}. Click the diatonic ${nm} directly above this pitch on string ${sHigh} (the ${STRING_NAMES[sHigh - 1]} string), in the same hand position${placed.highPos.fret === 0 ? ', using the open string' : ''}.`,
      marks: [{ ...placed.lowPos, label: pretty(placed.pair.low), color: 'root' }],
      targets: [placed.highPos],
      frets: [0, 12],
      explain: `${pretty(placed.pair.low)} up to ${pretty(placed.pair.high)} is a ${long(placed.pair.iv)}. On strings ${sLow} and ${sHigh} that interval sits **${fretWords(delta)}** than the lower note: fret ${placed.highPos.fret}.`
    }
  }
  throw new Error('u16: fretboardPairQ found no layout')
}

const earPairQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const d = randInt(0, 6)
  const dir = rand(['harmonic', 'harmonic', 'ascending'] as const)
  if (Math.random() < 0.5) {
    const size = rand([3, 6] as const)
    const p = pairAt(key, d, size)
    return mc('Listen. Is this interval a 3rd or a 6th?', size === 3 ? 'A 3rd' : 'A 6th', [size === 3 ? 'A 6th' : 'A 3rd'], {
      play: playInterval(`${p.low}3`, p.iv, dir),
      explain: `It was ${size === 3 ? 'a 3rd' : 'a 6th'} (${hs(p.semis)}). 3rds are close together and sweet; 6ths are wider and sound open and warm. A 6th is a 3rd turned upside down.`
    })
  }
  const size = rand([3, 6] as const)
  const p = pairAt(key, d, size)
  const nm = size === 3 ? '3rd' : '6th'
  return mc(`Listen. This diatonic ${nm} is major or minor?`, cap(long(p.iv)), [cap(long((p.iv[0] === 'M' ? 'm' : 'M') + size))], {
    play: playInterval(`${p.low}3`, p.iv, dir),
    explain: `${dash(p.low, p.high)} is ${hs(p.semis)}, a **${long(p.iv)}**. The major version is the brighter, wider one; the minor one is a half step narrower and a little darker.`
  })
}

const chordPairQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const sc = buildScale(key, 'major').map(noteName)
  const d = randInt(0, 6)
  const chord = diatonicChords(key)[d]
  const tones = [sc[d], sc[(d + 2) % 7], sc[(d + 4) % 7]]
  const size = rand([3, 6] as const)
  const at = (k: number) => pairAt(key, (d + k) % 7, size)
  const label = (p: Pair) => dash(p.low, p.high)
  const goodK = size === 3 ? [0, 2] : [2, 4]
  const k = rand(goodK)
  const correct = label(at(k))
  const wrong = shuffle([0, 1, 2, 3, 4, 5, 6].filter((x) => !goodK.includes(x)).map((x) => label(at(x)))).slice(0, 3)
  return mc(
    `In **${pretty(key)} major**, the chord is **${pretty(chord.symbol)}** (${tones.map(pretty).join(' ')}). Which diatonic ${size === 3 ? '3rd' : '6th'} (lower note up to upper note) is made only of chord tones?`,
    correct,
    wrong,
    {
      explain: `${pretty(chord.symbol)} contains ${tones.map(pretty).join(', ')}. **${correct}** uses two of them, so it outlines the chord. The other pairs each include a note that is not in the chord.`
    }
  )
}

const invertQ = (): QuizQuestion => {
  const key = rand(KEYS)
  const d = randInt(0, 6)
  const p = pairAt(key, d, 3)
  const inv = intervalBetween(p.high, p.low).short
  const names = ['Major 3rd', 'Minor 3rd', 'Major 6th', 'Minor 6th']
  return mc(
    `In **${pretty(key)} major** the diatonic 3rd ${dash(p.low, p.high)} is a ${long(p.iv)}. Flip it over: what interval is **${pretty(p.high)} up to ${pretty(p.low)}**?`,
    cap(long(inv)),
    names.filter((n) => n !== cap(long(inv))),
    {
      play: playInterval(`${p.high}3`, inv, 'harmonic'),
      explain: `Inverting a 3rd gives a 6th (3 + 6 = 9) and flips the quality: a ${long(p.iv)} becomes a **${long(inv)}** (${hs(parseInterval(p.iv).semitones)} + ${hs(parseInterval(inv).semitones)} = 12).`
    }
  )
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u16',
  number: 16,
  title: 'Harmonised 3rds, 6ths and double stops',
  summary: 'Harmonise the major scale in 3rds and 6ths, find the shapes on every string pair, then use double stops, octaves and 10ths in real playing.',
  elective: true,
  requires: ['u4'],
  lessons: [
    // ------------------------------------------------------------------ 1
    {
      id: 'u16l1',
      title: 'Harmonising a scale: diatonic 3rds',
      summary: 'Why a line in 3rds mixes major and minor 3rds, and how to know which is which.',
      blocks: [
        {
          type: 'text',
          md: `To **harmonise** a melody is to add a second note to each note. The sweetest and most common way is to add a **3rd** above (or below). Two guitars playing the same line a 3rd apart is one of the most recognisable sounds in rock, country and soul.

There is a catch. If you slide one fixed shape, say a major 3rd, up the scale, the top notes soon leave the key and the line sounds wrong. The fix is to harmonise **diatonically**. *Diatonic* means "belonging to the key": every added note comes from the same major scale as the melody.

To find it, count **two scale steps** up from each note. Sometimes that is a **major 3rd** (4 half steps), sometimes a **minor 3rd** (3 half steps). The key decides which.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major in diatonic 3rds', play: pairsSeq(C_3RDS) },
            { label: 'Same line, all major 3rds (out of key)', play: C_PARALLEL_MAJOR }
          ]
        },
        {
          type: 'text',
          md: `Listen to both. The first is smooth because every upper note is in C major. In the second, the major 3rd on D, E, A and B pulls in notes like F♯, G♯, C♯ and D♯ that do not belong, and the line goes sour.`
        },
        pairsTable('C', 3, 'The 3rd above each degree of C major. Spell the upper note by counting letters: C-D-E, D-E-F, E-F-G...'),
        {
          type: 'text',
          md: `### Why the mix of major and minor?
The major scale is built from whole steps (W) and half steps (H): **W W H W W W H**. A 3rd covers two scale steps, so its size depends on which two steps it spans.

- Two **whole** steps = 4 half steps = **major 3rd**. This happens on degrees **1, 4 and 5** (C-E, F-A, G-B).
- A whole step and a **half** step = 3 half steps = **minor 3rd**. This happens on degrees **2, 3, 6 and 7** (D-F, E-G, A-C, B-D). Each of those spans one of the two half steps (E-F or B-C).

So in every major key the pattern is the same: **major, minor, minor, major, major, minor, minor**. Only the note names change.`
        },
        C_STAFF,
        {
          type: 'tip',
          tone: 'theory',
          md: `The pattern is the same as the chord qualities of the major key: **I, IV and V are major chords, ii, iii and vi are minor**, and vii° is diminished (its lowest 3rd is minor). The 3rd sitting on the bottom of each diatonic triad is exactly the diatonic 3rd. That is why a line in 3rds fits the chords so naturally. The Roman numerals get their own lesson in [[preview:u7l2]].`
        },
        pairsTable('G', 3, 'The same pattern in G major (one sharp). Only the spelling changes: the 7th degree F♯ pairs with A.'),
        {
          type: 'tip',
          tone: 'warning',
          md: `**Spell by letters.** The 3rd above F♯ in G major is **A** (F-G-A), never a flat or sharp name such as G♯. Always count three letter names including the start, and use the key signature to fix the accidentals. In B♭ major the 3rd above G is B♭, not A♯.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G major in 3rds', play: pairsSeq(G_3RDS) },
            { label: 'Major 3rd', play: playInterval('C3', 'M3', 'harmonic') },
            { label: 'Minor 3rd', play: playInterval('D3', 'm3', 'harmonic') }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Say the pattern aloud while you play any major scale in single notes: "major, minor, minor, major, major, minor, minor". For each note, picture the note two letters higher before you reach for it.`
        },
        {
          type: 'tryIt',
          question: mc('How many of the seven diatonic 3rds in a major key are **major**?', '3 (on degrees 1, 4 and 5)', ['2 (on degrees 1 and 5)', '4 (on degrees 1, 3, 4 and 5)', '7 (all of them)'], {
            explain: 'Degrees **1, 4 and 5** carry major 3rds; degrees 2, 3, 6 and 7 carry minor 3rds.'
          })
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'In the key of **G major**, spell the diatonic 3rd above **E**.', answer: ['G'], explain: 'E-F♯-G: two scale steps up is **G**. E to G is 3 half steps, a minor 3rd (degree 6 of G major).' }
        },
        {
          type: 'tryIt',
          question: mc('Listen. Major or minor 3rd? (This is D up to F in C major.)', 'Minor 3rd', ['Major 3rd'], {
            play: playInterval('D3', 'm3', 'harmonic'),
            explain: 'D to F is 3 half steps: a **minor 3rd**. It spans the E-F half step.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'u16l2',
      title: '3rds on adjacent strings and the G–B shift',
      summary: 'The fretboard shapes for diatonic 3rds on neighbouring strings, and why the G–B pair is different.',
      blocks: [
        {
          type: 'text',
          md: `On the guitar a diatonic 3rd is two notes on **neighbouring strings**: the lower note on one string, the upper note on the next thinner string. Because neighbouring strings are a 4th (5 frets) apart, the shapes are easy to learn. From [[u3l3]]:

- **Major 3rd** (4 half steps) = the upper note is **one fret lower** than the root.
- **Minor 3rd** (3 half steps) = the upper note is **two frets lower**.

That is true on every pair of strings *except* one. The **G and B strings are only a major 3rd apart** (4 frets), so the shapes that cross from G to B move up a fret.`
        },
        {
          type: 'table',
          headers: ['String pair', 'Major 3rd: upper note is…', 'Minor 3rd: upper note is…'],
          rows: [
            ['6–5, 5–4, 4–3 (E–A, A–D, D–G)', '1 fret lower', '2 frets lower'],
            ['3–2 (G–B)', 'the same fret', '1 fret lower'],
            ['2–1 (B–E)', '1 fret lower', '2 frets lower']
          ],
          caption: 'Fret of the upper note, compared with the fret of the lower note.'
        },
        {
          type: 'fretboard',
          marks: pairMarks([...C_ON_DG_M3, ...C_ON_DG_m3], 'C'),
          frets: [8, 13],
          caption: 'D and G strings: C–E (major 3rd, upper note one fret lower) and D–F (minor 3rd, two frets lower). Each note is labelled by name.'
        },
        {
          type: 'fretboard',
          marks: pairMarks([...C_ON_GB_M3, ...C_ON_GB_m3], 'C'),
          frets: [3, 9],
          caption: 'G and B strings: the same C–E and D–F pairs. Now the major 3rd is on the same fret and the minor 3rd only one fret lower.'
        },
        {
          type: 'text',
          md: `### A whole scale on the G–B pair
G major in 3rds fits beautifully on the G and B strings, starting with both **open strings** (G and B are a major 3rd). Follow the frets: the upper note is on the same fret when the 3rd is major (G–B, C–E, D–F♯) and one fret lower when it is minor (A–C, B–D, E–G, F♯–A).`
        },
        {
          type: 'fretboard',
          marks: pairMarks(G_ON_GB, 'G'),
          frets: [0, 13],
          caption: 'G major in 3rds on strings 3 and 2, from the open strings to the octave at fret 12.'
        },
        {
          type: 'tab',
          caption: 'G major scale in 3rds, strings 3 and 2. Play the two notes of each pair together (pick and finger, or fingerstyle).',
          toolExamples: [{ kind: 'scale', root: 'G', type: 'major' }],
          events: tabEvents(G_ON_GB),
          bpm: 80
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Together', play: pairsSeq(G_ON_GB) },
            { label: 'Lower line only', play: { ...lineSeq(G_ON_GB.map((p) => p.lowMidi), 84), toolExample: { kind: 'scale', root: 'G', type: 'major' } } },
            { label: 'Upper line only', play: { ...lineSeq(G_ON_GB.map((p) => p.highMidi), 84), toolExample: { kind: 'scale', root: 'G', type: 'major' } } }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the first two 3rds of the G major run, one note at a time: **G** and **B** (both open), then **A** (3rd string, 2nd fret) and **C** (2nd string, 1st fret).',
          targets: ['G3', 'B3', 'A3', 'C4'],
          hint: 'Open G string, open B string, then A on the G string at the 2nd fret and C on the B string at the 1st fret. The second pair is a minor 3rd, so its upper note is one fret lower than the lower note.',
          show: [G_ON_GB[0].lowPos, G_ON_GB[0].highPos, G_ON_GB[1].lowPos, G_ON_GB[1].highPos],
          frets: [0, 5]
        },
        {
          type: 'text',
          md: `### Up a string pair and in position
Move the same line to another string pair and you only need the table above. Playing a scale in 3rds up the neck all in one go means long shifts; in practice you play a **position**, a few frets wide, where three or four pairs fall under the hand, then shift. Here is C major in 3rds on the D and G strings, then on the B and E strings.`
        },
        {
          type: 'fretboard',
          marks: pairMarks(C_DG_POS, 'C'),
          frets: [4, 14],
          caption: 'C major 3rds on strings 4 and 3 around frets 7–12. Every pair is major (upper note 1 fret lower) or minor (2 frets lower).'
        },
        {
          type: 'fretboard',
          marks: pairMarks(C_BE_POS, 'C'),
          frets: [0, 8],
          caption: 'C major 3rds on strings 2 and 1 (B and E). The normal shapes apply again here, because B–E is a 4th.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Learn the **G–B** pair first (it holds the open-string patterns), then do the same scale on D–G and B–E. Name each pair as you play it. If the top note sounds wrong, you used the wrong 3rd for that degree: count back to the table.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In **C major**, the note **C** is marked on the 3rd string (fret 5). Click the diatonic 3rd above it on the **B string**.',
            marks: [m(3, 5, 'C', 'root')],
            frets: [0, 12],
            targets: [{ string: 2, fret: 5 }],
            explain: 'C up to E is a major 3rd. Across the G–B pair a major 3rd is on the **same fret**: B string, fret 5 (E).'
          }
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In **C major**, the note **D** is marked on the 4th string (fret 12). Click the diatonic 3rd above it on the **G string**.',
            marks: [m(4, 12, 'D', 'root')],
            frets: [6, 14],
            targets: [{ string: 3, fret: 10 }],
            explain: 'D up to F is a minor 3rd. On a normal pair (D–G) it is **two frets lower**: G string, fret 10 (F).'
          }
        }
      ]
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'u16l3',
      title: '6ths: the soul and country sound',
      summary: 'Diatonic 6ths on strings that skip one, and how they are 3rds turned upside down.',
      blocks: [
        {
          type: 'text',
          md: `A **6th** is bigger than a 3rd: **8 half steps** (minor 6th) or **9** (major 6th). Played together on a guitar it sounds open, warm and a little nostalgic, the sound of 1960s soul and R&B rhythm guitar and of country and pedal-steel-style licks.

6ths are played on strings that **skip one**: strings 6 and 4, 5 and 3, 4 and 2, or 3 and 1. The middle string stays silent (fingers can lightly touch it, or just avoid it when you pick).

Diatonic 6ths work like diatonic 3rds: go **five scale steps** up from each note. The result is a mix of major and minor 6ths.`
        },
        pairsTable('C', 6, 'The 6th above each degree of C major. Major 6ths on degrees 1, 2, 4, 5; minor 6ths on 3, 6, 7.'),
        {
          type: 'text',
          md: `### A 6th is an upside-down 3rd
Turn the 3rd C–E upside down (move C up an octave) and you get **E–C**: a minor 6th. The same two note names, a different order. That is why the patterns are linked:

- Major 3rd ⇄ **minor** 6th, and minor 3rd ⇄ **major** 6th (3 + 6 = 9 and 4 + 8 = 12 half steps).
- A 6th starting on degree **3** (E–C) is the inversion of the 3rd on degree 1 (C–E). A 6th starting on degree 2 (D–B) is the inversion of the 3rd on degree 7 (B–D).
- A harmony note a 3rd **below** the melody has the same name as the note a 6th **above** it, just an octave lower.`
        },
        {
          type: 'table',
          headers: ['3rd (lower–upper)', 'Quality', 'Flipped: 6th (lower–upper)', 'Quality'],
          rows: [0, 1, 2, 3].map((d) => {
            const t = pairAt('C', d, 3)
            const inv = intervalBetween(t.high, t.low).short
            return [dash(t.low, t.high), cap(long(t.iv)), dash(t.high, t.low), cap(long(inv))]
          }),
          caption: 'Inversions in C major. The upper note drops to the bottom and the pair becomes a 6th.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C + E (major 3rd)', play: playInterval('C3', 'M3', 'harmonic') },
            { label: 'E + C (minor 6th)', play: playInterval('E3', 'm6', 'harmonic') },
            { label: 'D + F (minor 3rd)', play: playInterval('D3', 'm3', 'harmonic') },
            { label: 'F + D (major 6th)', play: playInterval('F3', 'M6', 'harmonic') }
          ]
        },
        {
          type: 'text',
          md: `### The fretboard shapes
Count the fret difference between the strings. Strings 6–4 and 5–3 are 10 half steps apart; strings 4–2 and 3–1 are 9 half steps apart. So:`
        },
        {
          type: 'table',
          headers: ['String pair', 'Major 6th: upper note is…', 'Minor 6th: upper note is…'],
          rows: [
            ['6–4 or 5–3', '1 fret lower', '2 frets lower'],
            ['4–2 or 3–1', 'the same fret', '1 fret lower']
          ],
          caption: 'Fret of the upper note compared with the lower note. Pairs 4–2 and 3–1 cross the G–B gap, so they shift up a fret, just as with 3rds.'
        },
        {
          type: 'fretboard',
          marks: pairMarks(G_ON_GE, 'G'),
          frets: [0, 13],
          caption: 'G major 6ths on strings 3 and 1 (G and high E). Open G with open high E start the line. Major 6ths sit on the same fret, minor 6ths one fret lower.'
        },
        {
          type: 'tab',
          caption: 'G major scale in 6ths, strings 3 and 1. Both lines are the G major scale; the upper line simply starts on E.',
          toolExamples: [{ kind: 'scale', root: 'G', type: 'major' }],
          events: tabEvents(G_ON_GE),
          bpm: 80
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G major in 6ths', play: pairsSeq(G_ON_GE) },
            { label: 'Same line in 3rds, for comparison', play: pairsSeq(G_3RDS) }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the first two 6ths of the G major run, one note at a time: **G** (open 3rd string) then **E** (open 1st string), then **A** (3rd string, 2nd fret) then **F♯** (1st string, 2nd fret).',
          targets: ['G3', 'E4', 'A3', 'F#4'],
          hint: 'G–E is a major 6th and so is A–F♯, so each upper note is on the same fret as the lower one (fret 0, then fret 2). Skip the 2nd string.',
          show: [G_ON_GE[0].lowPos, G_ON_GE[0].highPos, G_ON_GE[1].lowPos, G_ON_GE[1].highPos],
          frets: [0, 5]
        },
        {
          type: 'fretboard',
          marks: pairMarks(C_ON_AG, 'C'),
          frets: [1, 16],
          caption: 'C major 6ths on strings 5 and 3. Here the major 6th is one fret lower, because A–G is 10 half steps.'
        },
        {
          type: 'fretboard',
          marks: pairMarks(G_DB_POS, 'G'),
          frets: [2, 12],
          caption: 'In position: G major 6ths on strings 4 and 2, frets 5–10. Same patterns as strings 3 and 1, a fret-shape apart.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Playing a melody in 6ths? The upper note carries the melody and the lower note adds the warmth. Ending a phrase on a pair of **major 6ths** (the 1 and 6, or 5 and 3 in the key) gives that soulful, "resolved but open" cadence.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In **C major**, the note **C** is marked on the 5th string (fret 3). Click the diatonic **6th** above it on the **G string**.',
            marks: [m(5, 3, 'C', 'root')],
            frets: [0, 12],
            targets: [{ string: 3, fret: 2 }],
            explain: 'C up to A is a major 6th (9 half steps). On strings 5 and 3 that is one fret **lower** than the root: G string, fret 2 (A).'
          }
        },
        {
          type: 'tryIt',
          question: mc('Which interval is the **inversion** of a minor 3rd?', 'Major 6th', ['Minor 6th', 'Major 3rd', 'Perfect 5th'], {
            explain: 'Inverting a 3rd gives a 6th, and minor flips to major: 3 + 9 = 12 half steps. D–F (minor 3rd) turns into F–D (major 6th).'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'u16l4',
      title: 'Double stops: 4ths and 5ths in rock and blues',
      summary: 'Pairs of notes from the pentatonic scale, the Chuck Berry-style rocking pair and sliding double stops.',
      blocks: [
        {
          type: 'text',
          md: `Any two notes played together are a **double stop**. 3rds and 6ths are the sweet, harmonised kind. Rock and blues players lean on the sturdier 4ths and 5ths, usually taken straight from the **pentatonic scale** instead of a full seven-note key.

The shapes are ones you already know from [[u3l3]]:

- **Perfect 4th**: the **same fret** on neighbouring strings (but on the G–B pair the upper note is one fret *higher*).
- **Perfect 5th**: **two frets up** on the next string (three frets up across the G–B pair).

Because there is no 3rd, these pairs are neither major nor minor. That is why they work over both a major and a minor chord, and why they stay tight and clear under distortion.`
        },
        {
          type: 'table',
          headers: ['Double stop', 'Neighbouring strings (not G–B)', 'G–B pair'],
          rows: [
            ['Perfect 4th (5 half steps)', 'same fret', 'upper note 1 fret higher'],
            ['Perfect 5th (7 half steps)', 'upper note 2 frets higher', 'upper note 3 frets higher']
          ]
        },
        {
          type: 'fretboard',
          marks: [
            m(6, 5, 'A', 'root'),
            m(5, 7, 'E', 'accent'),
            m(6, 8, 'C'),
            m(5, 10, 'G', 'accent'),
            m(5, 5, 'D'),
            m(4, 7, 'A', 'accent')
          ],
          frets: [3, 12],
          caption: 'Perfect 5ths from A minor pentatonic: A–E, C–G and D–A. The upper note is 2 frets higher on the next string.'
        },
        {
          type: 'fretboard',
          marks: [
            m(4, 5, 'G'),
            m(3, 5, 'C', 'accent'),
            m(4, 7, 'A'),
            m(3, 7, 'D', 'accent'),
            m(2, 5, 'E'),
            m(1, 5, 'A', 'root'),
            m(2, 8, 'G'),
            m(1, 8, 'C', 'accent')
          ],
          frets: [3, 12],
          caption: 'Perfect 4ths from A minor pentatonic: G–C and A–D (strings 4–3), E–A and G–C (strings 2–1). Same fret, two strings.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'A + E (P5)', play: playInterval('A2', 'P5', 'harmonic') },
            { label: 'D + A (P5)', play: playInterval('D3', 'P5', 'harmonic') },
            { label: 'G + C (P4)', play: playInterval('G3', 'P4', 'harmonic') },
            { label: 'E + A (P4)', play: playInterval('E4', 'P4', 'harmonic') }
          ]
        },
        {
          type: 'text',
          md: `### The rocking pair
A classic rock 'n' roll figure, in the spirit of Chuck Berry's double-stop intros, rocks between two pairs on the **top two strings**. Over an **A chord**, the pair at fret 5 is E–A (the 5th and the root of A), and the pair at fret 7 is F♯–B (the 6th and 9th). Both pairs are 4ths, both belong to A major pentatonic (A B C♯ E F♯), and moving between them is a pure whole-step slide of one shape.`
        },
        {
          type: 'tab',
          caption: 'Rocking 4ths over an A chord on strings 2 and 1 (frets 5 and 7). Keep the same finger shape (a barre with the first finger works well).',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'major', frets: [5, 7] }],
          events: [
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 7 }, { string: 1, fret: 7 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 7 }, { string: 1, fret: 7 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 7 }, { string: 1, fret: 7 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 7 }, { string: 1, fret: 7 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 7 }, { string: 1, fret: 7 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 3 }
          ],
          bpm: 130,
          timeSig: '4/4'
        },
        {
          type: 'audioRow',
          items: [
            {
              label: 'Rocking 4ths',
              play: {
                kind: 'sequence',
                toolExample: { kind: 'scale', root: 'A', type: 'major', frets: [5, 7] },
                bpm: 130,
                events: [0, 1, 0, 1, 0, 1, 0, 1].map((i) => ({ notes: i === 0 ? [64, 69] : [66, 71], beats: 0.5, mode: 'block' as const }))
              }
            },
            {
              label: 'With an A bass note',
              play: {
                kind: 'sequence',
                toolExample: { kind: 'scale', root: 'A', type: 'major', frets: [5, 7] },
                bpm: 130,
                events: [0, 1, 0, 1, 0, 1, 0, 1].map((i) => ({ notes: i === 0 ? [45, 64, 69] : [45, 66, 71], beats: 0.5, mode: 'block' as const }))
              }
            }
          ]
        },
        {
          type: 'text',
          md: `### Sliding double stops
Double stops slide well because the shape stays rigid: both fingers (or one flat finger) move together. Slide **from a fret below** the target pair into it for the classic blues sound. Take care that the target pair is still in the scale: from E–A (fret 5) a slide up to F♯–B works over A major, but over A minor pentatonic the safe slides are along 4ths that stay in the scale, for example **D–G at fret 3 sliding to E–A at fret 5**, both from A minor pentatonic.`
        },
        {
          type: 'tab',
          caption: 'Slide a rigid 4th shape from fret 3 up to fret 5 on strings 2 and 1, then step to fret 8 (G–C). All are from A minor pentatonic.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic', frets: [3, 8] }],
          events: [
            { pos: [{ string: 2, fret: 3 }, { string: 1, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 1.5 },
            { pos: [{ string: 2, fret: 8 }, { string: 1, fret: 8 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 5 }, { string: 1, fret: 5 }], beats: 1.5 }
          ],
          bpm: 90,
          timeSig: '4/4'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Moving a rigid shape up and down is not diatonic harmony, it is **parallel** harmony. It stays in the key only when the notes you land on are in the scale. A pentatonic scale has just five notes, so the 4ths and 5ths drawn from it make up a ready-made safe set. If you hear a clash, check the pair against the scale (A C D E G in A minor pentatonic).`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The root **A** is marked on the 5th string (fret 0). Click the **perfect 5th** above it on the **4th string**.',
            marks: [m(5, 0, 'A', 'root')],
            frets: [0, 7],
            targets: [{ string: 4, fret: 2 }],
            explain: 'A perfect 5th is two frets up on the next string: D string, fret 2 (E). That is an A5 power chord shape without the octave.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Two notes at the **same fret** on strings 4 and 3 (D and G) form a…', 'perfect 4th', ['major 3rd', 'perfect 5th', 'major 6th'], {
            explain: 'Strings 4 and 3 are a 4th apart (5 frets), so the same fret on both is a **perfect 4th**. (On the G–B pair the same fret is a major 3rd.)'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'u16l5',
      title: 'Octaves and 10ths',
      summary: 'The octave shape with a muted middle string, and 10ths for fingerstyle: bass note plus a 3rd an octave up.',
      blocks: [
        {
          type: 'text',
          md: `### Octaves
An **octave** doubles a melody note one octave higher. The two notes blend into one thick, round tone. Jazz guitarists, most famously Wes Montgomery, played whole melodies in octaves with the thumb.

The octave shape skips a string. Fret the lower note, then the same-named note on the string two higher:

- strings **6 and 4**, or **5 and 3**: upper note **2 frets higher**
- strings **4 and 2**, or **3 and 1**: upper note **3 frets higher** (crossing the G–B gap)

The string in between must **not ring**. Lay the underside of the fretting finger lightly across it, or let the picking hand mute it. The muted string is marked with an x on the diagrams.`
        },
        {
          type: 'fretboard',
          marks: [m(6, 5, 'A', 'root'), m(5, 5, '×', 'mute'), m(4, 7, 'A', 'root')],
          frets: [3, 9],
          playable: false,
          caption: 'Octave A–A on strings 6 and 4. The 5th string (x) is muted.'
        },
        {
          type: 'fretboard',
          marks: [m(4, 3, 'F', 'root'), m(3, 3, '×', 'mute'), m(2, 6, 'F', 'root')],
          frets: [1, 8],
          playable: false,
          caption: 'Octave F–F on strings 4 and 2. The upper note is 3 frets higher, and the 3rd string (x) is muted.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Octave A (strings 6+4)', play: { kind: 'notes', notes: [45, 57], mode: 'block' } },
            { label: 'One note at a time', play: { kind: 'notes', notes: [45, 57], mode: 'arpeggio' } },
            { label: 'Octave F (strings 4+2)', play: { kind: 'notes', notes: [53, 65], mode: 'block' } }
          ]
        },
        {
          type: 'text',
          md: `An octave line is easiest to learn by playing a major scale. Move the shape along the strings 5 and 3 and every note of the scale comes out doubled, with no accidentals to think about.`
        },
        {
          type: 'tab',
          caption: 'C major scale in octaves, strings 5 and 3 (the 4th string is muted). The shape never changes: upper note 2 frets above the lower.',
          toolExamples: [{ kind: 'scale', root: 'C', type: 'major' }],
          events: tabEvents(C_OCT),
          bpm: 90
        },
        {
          type: 'tab',
          caption: 'A short melodic phrase in octaves. Keep your fretting hand relaxed and let the flat finger damp the middle string.',
          toolExamples: [{ kind: 'scale', root: 'C', type: 'major' }],
          events: tabEvents(C_OCT_PHRASE, [1, 0.5, 0.5, 1, 1, 1, 1, 2]),
          bpm: 84,
          timeSig: '4/4'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Scale in octaves', play: pairsSeq(C_OCT) },
            { label: 'Phrase in octaves', play: pairsSeq(C_OCT_PHRASE, 84, [1, 0.5, 0.5, 1, 1, 1, 1, 2]) },
            { label: 'Phrase, single notes', play: { ...lineSeq(C_OCT_PHRASE.map((p) => p.lowMidi), 84, [1, 0.5, 0.5, 1, 1, 1, 1, 2]), toolExample: { kind: 'scale', root: 'C', type: 'major' } } }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play an octave, one note after the other: **C** on the 5th string (3rd fret), then **C** an octave higher on the 3rd string (5th fret).',
          targets: ['C3', 'C4'],
          hint: 'Octaves on strings 5 and 3 are 2 frets apart. Skip the 4th string.',
          show: [C_OCT[0].lowPos, C_OCT[0].highPos],
          frets: [0, 8]
        },
        {
          type: 'text',
          md: `### 10ths
A **10th** is an octave plus a 3rd: **16 half steps** (major 10th) or **15** (minor 10th). In fingerstyle the thumb plays a **bass** note and a finger plays the 3rd an octave higher, which sounds like a left hand and right hand on the piano. A 10th is far more spread out than a 3rd, so it is open and full rather than sweet and close.

A diatonic 10th is exactly the diatonic 3rd stretched by an octave, so degrees 1, 4 and 5 give **major** 10ths and degrees 2, 3, 6 and 7 give **minor** 10ths.`
        },
        pairsTable('C', 10, 'Diatonic 10ths in C major. The note names are the same as the 3rds; the interval is an octave wider.'),
        {
          type: 'table',
          headers: ['String pair', 'Major 10th: upper note is…', 'Minor 10th: upper note is…'],
          rows: [
            ['6–3 (low E, G)', '1 fret higher', 'the same fret'],
            ['5–2 (A, B)', '2 frets higher', '1 fret higher'],
            ['6–2 or 5–1', '3 frets lower', '4 frets lower']
          ],
          caption: 'Upper-note fret compared with the bass note fret.'
        },
        {
          type: 'fretboard',
          marks: pairMarks(C_TENTHS, 'C'),
          frets: [0, 16],
          caption: 'C major in 10ths: the bass note on the 5th string, the 3rd above on the open or fretted 1st string. C–E uses the open high E string.'
        },
        {
          type: 'tab',
          caption: 'C major scale in 10ths on strings 5 and 1: bass note plus a 3rd an octave higher. Pick the bass with the thumb and the top note with a finger, together.',
          toolExamples: [{ kind: 'scale', root: 'C', type: 'major' }],
          events: tabEvents(C_TENTHS),
          bpm: 80
        },
        {
          type: 'audioRow',
          items: [
            { label: 'C major in 10ths', play: pairsSeq(C_TENTHS) },
            { label: 'C + E (3rd)', play: playInterval('C3', 'M3', 'harmonic') },
            { label: 'C + E (10th)', play: playInterval('C3', 'M10', 'harmonic') }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `A 10th is one of the nicest ways to play a **chord** with just two notes. In a C chord the bass note C and the E a 10th above already tell you "major". Add the open 3rd string (G) between them and you have an open C major triad spread across the guitar.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'The note **E** is marked on the 4th string (fret 2). Click the **octave** above it on the **2nd (B) string**.',
            marks: [m(4, 2, 'E', 'root')],
            frets: [0, 8],
            targets: [{ string: 2, fret: 5 }],
            explain: 'Octaves across strings 4 and 2 are 3 frets apart: B string, fret 5 (E). The 3rd string in between is muted.'
          }
        },
        {
          type: 'tryIt',
          question: mc('A bass **C** (5th string, fret 3) with the open high **E** string is a…', 'major 10th', ['major 3rd', 'minor 10th', 'perfect 5th'], {
            play: playInterval('C3', 'M10', 'harmonic'),
            explain: 'C3 up to E4 is 16 half steps: an octave plus a major 3rd, a **major 10th**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'u16l6',
      title: 'Harmonised intervals over chords and twin harmonies',
      summary: 'Choose the pair that holds chord tones, then harmonise a lead line the way twin-guitar bands do.',
      blocks: [
        {
          type: 'text',
          md: `So far every pair has been taken from the key. Over a **chord progression** you can be more deliberate: pick the pair that contains **chord tones**. Then your two notes outline the chord instead of fighting it.

For a triad built on degree *d*:
- **3rds**: the pairs 1–3 and 3–5 of the chord (root–3rd and 3rd–5th).
- **6ths**: the pairs 3rd–root (up a 6th) and 5th–3rd. These are the inversions of the 3rds above.

Both pairs stay inside the key, so you do not have to change anything else. The Roman numerals in the table below (I, ii, iii...) are explained in [[preview:u7l2]].`
        },
        {
          type: 'table',
          headers: ['Chord in C major', 'Chord tones', 'Pairs of chord tones in 3rds', 'Pairs in 6ths'],
          rows: diatonicChords('C').map((c, i) => {
            const sc = buildScale('C', 'major').map(noteName)
            const tones = [sc[i], sc[(i + 2) % 7], sc[(i + 4) % 7]]
            const t1 = pairAt('C', i, 3)
            const t2 = pairAt('C', (i + 2) % 7, 3)
            const s1 = pairAt('C', (i + 2) % 7, 6)
            const s2 = pairAt('C', (i + 4) % 7, 6)
            return [
              `${c.roman}: ${pretty(c.symbol)}`,
              tones.map(pretty).join(' '),
              `${dash(t1.low, t1.high)}, ${dash(t2.low, t2.high)}`,
              `${dash(s1.low, s1.high)}, ${dash(s2.low, s2.high)}`
            ]
          }),
          caption: 'Each chord has two 3rd pairs and two 6th pairs that use only its own notes (lower note first).'
        },
        {
          type: 'text',
          md: `### I – IV – V – I with a pair on top
Here is the plan on the G and B strings: a bass note on the 5th or 6th string and a pair on strings 3 and 2 that **moves very little** between chords.

- **C**: C–E (the root and 3rd)
- **F**: A–C (the 3rd and 5th of F)
- **G**: B–D (the 3rd and 5th of G)
- **C**: back to C–E

The top voice moves E → C → D → E, and the lower voice C → A → B → C: small steps, smooth enough to sing.`
        },
        {
          type: 'tab',
          caption: 'I–IV–V–I in C: bass note on strings 5 or 6, a chord-tone 3rd on strings 3 and 2. The 4th string is left silent.',
          toolExamples: [progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 72, 2)],
          events: PROG.map((p) => ({ pos: [p.bass, p.pair.lowPos, p.pair.highPos], beats: 2 })),
          bpm: 72,
          timeSig: '4/4'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Bass + 3rds over C–F–G–C', play: PROG_SEQ },
            { label: 'Only the 3rds', play: { ...pairsSeq(PROG.map((p) => p.pair), 72, 2), toolExample: progressionExample('C', ['I', 'IV', 'V', 'I'], 'major', 72, 2) } }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Pick any progression and ask for each chord: "which pair on these strings holds only chord tones, and is closest to the one I just played?" Use the table above to check. Over a **dominant 7th** chord the 3rd and 7th (say B–F over G7) make a lovely tense pair: a tritone, which you will recognise from [[u3l2]].`
        },
        {
          type: 'text',
          md: `### Twin-guitar harmony
Two guitarists playing the same melody a **3rd apart** is a signature of classic rock: the harmonised guitar leads of **Thin Lizzy** and **The Allman Brothers Band** are famous examples. One guitar plays the melody; the second plays the diatonic 3rd above (or below), note for note. The two lines stay together rhythmically and the harmony changes between major and minor 3rds automatically as the melody moves through the key.

To write one:
1. Choose a short melody entirely in the key.
2. For each melody note, find the note **two scale steps above** (or two steps *below*, for a harmony underneath).
3. Play both lines with the same rhythm. Listen for any note that is not in the key.

Here the melody is on the G string and the harmony on the B string, in G major.`
        },
        {
          type: 'tab',
          caption: 'A short phrase in G major, harmonised in 3rds (strings 3 and 2). The lower note of each pair is the melody.',
          toolExamples: [{ kind: 'scale', root: 'G', type: 'major' }],
          events: tabEvents(TWIN, TWIN_BEATS),
          bpm: 84,
          timeSig: '4/4'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Melody only', play: { ...lineSeq(TWIN.map((p) => p.lowMidi), 84, TWIN_BEATS), toolExample: { kind: 'scale', root: 'G', type: 'major' } } },
            { label: 'Harmony only', play: { ...lineSeq(TWIN.map((p) => p.highMidi), 84, TWIN_BEATS), toolExample: { kind: 'scale', root: 'G', type: 'major' } } },
            { label: 'Together', play: pairsSeq(TWIN, 84, TWIN_BEATS) }
          ]
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `Keep the harmony diatonic **to the chord underneath too**. If the melody lands on a note that is not a chord tone, a 3rd above it may clash with the bass. Test by ear and adjust, or put the harmony a 3rd *below* instead. The same rules and fret shapes apply: just swap which note is the melody.`
        },
        {
          type: 'tryIt',
          question: mc(
            'Over a **G** chord (G B D) in C major, which diatonic 3rd (lower note up to upper note) contains only chord tones?',
            'B–D',
            ['A–C', 'C–E', 'F–A'],
            { explain: 'G major is G B D. **B–D** (the 3rd and 5th of the chord) uses two chord tones. A–C, C–E and F–A each contain a note outside G major.' }
          )
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'A melody in **C major** has the note **E**. Spell the diatonic 3rd you would harmonise it with, above E.',
            answer: ['G'],
            explain: 'E-F-G: two scale steps up is **G**, a minor 3rd (3 half steps). It is degree 3 of C major.'
          }
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('Why do the diatonic 3rds in a major key include both major and minor 3rds?', 'Some cover a half step plus a whole step', [
        'Each pair covers two equal whole steps',
        'Only pairs on the lower strings are minor',
        'The key changes after each pair of notes'
      ], { explain: 'A 3rd covers two scale steps. W+W is 4 half steps (major); W+H or H+W is 3 half steps (minor). Only the 3rds that span E–F or B–C are minor.' }),
      mc('In a major key, on which scale degrees is the diatonic 3rd **major**?', '1, 4 and 5', ['1, 3 and 5', '2, 3, 6 and 7', '4, 5 and 7'], {
        explain: 'Major, minor, minor, major, major, minor, minor: degrees **1, 4 and 5** are major.'
      }),
      { kind: 'spell', prompt: 'In **G major**, spell the diatonic 3rd above **F♯**.', answer: ['A'], explain: 'F♯-G-A: **A**. F♯ to A is 3 half steps, a minor 3rd (degree 7).' },
      { kind: 'spell', prompt: 'In **D major**, spell the diatonic 3rd above **G**.', answer: ['B'], explain: 'G-A-B: **B**. G to B is 4 half steps, a major 3rd (degree 4 of D major).' },
      { kind: 'spell', prompt: 'In **F major**, spell the diatonic **6th** above **D**.', answer: ['Bb'], explain: 'D-E-F-G-A-B: the letter is B, and F major has B♭: **B♭**. D to B♭ is 8 half steps, a minor 6th (degree 6).' },
      {
        kind: 'spell',
        prompt: 'In **E major**, spell the two notes of the diatonic 3rd on **degree 4**, lower note first (two note names).',
        answer: ['A', 'C#'],
        explain: 'Degree 4 of E major is A. A-B-C: the upper note is **C♯** (E major has C♯). A to C♯ is a major 3rd.'
      },
      { kind: 'spell', prompt: 'In **C major**, spell the diatonic **10th** above **A**.', answer: ['C'], explain: 'A 10th is a 3rd plus an octave: A–C, an octave higher. The note name is **C** (a minor 10th).' },
      {
        kind: 'fretboard',
        prompt: 'In **C major**, the note **C** is marked on the 3rd string (fret 5). Click the diatonic 3rd above it on the **B string**.',
        marks: [m(3, 5, 'C', 'root')],
        frets: [0, 12],
        targets: [{ string: 2, fret: 5 }],
        explain: 'C to E is a major 3rd. Across the G–B pair it sits on the **same fret**: B string, fret 5 (E).'
      },
      {
        kind: 'fretboard',
        prompt: 'In **C major**, the note **C** is marked on the 5th string (fret 3). Click the diatonic **6th** above it on the **G string**.',
        marks: [m(5, 3, 'C', 'root')],
        frets: [0, 12],
        targets: [{ string: 3, fret: 2 }],
        explain: 'C to A is a major 6th. On strings 5 and 3 it is one fret **lower**: G string, fret 2 (A).'
      },
      {
        kind: 'fretboard',
        prompt: 'In **C major**, the note **D** is on the G string (fret 7). Click **both notes** of the diatonic 3rd above it: the D itself and the upper note on the B string.',
        marks: [],
        frets: [3, 10],
        mode: 'all',
        targets: [{ string: 3, fret: 7 }, { string: 2, fret: 6 }],
        explain: 'D to F is a minor 3rd. Across the G–B pair a minor 3rd is **one fret lower**: G string fret 7 with B string fret 6 (F).'
      },
      {
        kind: 'fretboard',
        prompt: 'In **G major**, click **both notes** of the diatonic **6th** on the open strings: G on the 3rd string and its 6th above on the 1st string.',
        marks: [],
        frets: [0, 5],
        mode: 'all',
        targets: [{ string: 3, fret: 0 }, { string: 1, fret: 0 }],
        explain: 'G (open G string) to E (open high E string) is a major 6th (9 half steps), the opening pair of a G major run in 6ths.'
      },
      mc('On the **G and B strings**, a diatonic major 3rd is played with the upper note…', 'on the same fret', ['one fret lower', 'two frets lower', 'one fret higher'], {
        explain: 'G and B are tuned a major 3rd (4 frets) apart, so the G–B pair shifts up a fret: major 3rd = same fret, minor 3rd = one fret lower.'
      }),
      mc('On the **D and G strings**, a minor 3rd is played with the upper note…', '2 frets lower', ['1 fret lower', 'on the same fret', '2 frets higher'], {
        explain: 'Neighbouring strings are a 4th (5 frets) apart, so a minor 3rd (3 half steps) is 5 − 3 = **2 frets lower**.'
      }),
      mc('A major 3rd turned upside down is a…', 'minor 6th', ['major 6th', 'minor 3rd', 'perfect 5th'], {
        explain: '3 + 6 = 9 and major flips to minor: the inversion of C–E is E–C, a **minor 6th** (4 + 8 = 12 half steps).'
      }),
      {
        kind: 'text',
        prompt: 'Two notes played together are called a ____ ____ (two words).',
        accept: ['double stop', 'double stops', 'double-stop', 'doublestop'],
        explain: 'A **double stop** is any pair of notes played together, such as 3rds, 4ths, 5ths and 6ths.'
      },
      mc('Two notes at the **same fret** on strings 4 and 2 (D and B) form a…', 'major 6th', ['major 3rd', 'perfect 4th', 'octave'], {
        visual: { type: 'fretboard', marks: [m(4, 5, 'G', 'root'), m(2, 5, 'E', 'accent')], frets: [3, 8], caption: 'D string fret 5 and B string fret 5.' },
        explain: 'Strings 4 and 2 are 9 half steps apart, so the same fret on both is a **major 6th** (G up to E).'
      }),
      mc('On strings 5 and 3 (A and G), the octave of the lower note is on the G string…', '2 frets higher', ['1 fret higher', '3 frets higher', 'on the same fret'], {
        explain: 'A to G is 10 half steps; an octave is 12, so the upper note is **2 frets higher**. On strings 4 and 2 or 3 and 1 it would be 3 frets higher.'
      }),
      mc('An octave on the guitar is usually played with the string between the two notes…', 'muted', ['ringing as a power chord', 'played an octave higher', 'tuned to a different note'], {
        explain: 'The middle string is damped with the underside of the fretting finger or the picking hand, so only the two octave notes sound (Wes Montgomery style).'
      }),
      mc('A 10th is…', 'an octave plus a 3rd', ['an octave plus a 5th', 'two octaves', 'a 3rd plus a 6th'], {
        explain: 'The 10th is 16 half steps (major) or 15 (minor): the 3rd stretched out by an octave.'
      }),
      mc('Over an **F** chord (F A C) in C major, which diatonic 3rd is made only of chord tones?', 'A–C', ['G–B', 'B–D', 'E–G'], {
        explain: 'F major is F A C. **A–C** uses two chord tones; G–B, B–D and E–G each contain a note outside the chord.'
      }),
      mc('Over a **Dm** chord (D F A) in C major, which diatonic **6th** (lower note up to upper note) uses only chord tones?', 'F–D', ['E–C', 'G–E', 'D–B'], {
        explain: 'F up to D is a major 6th, and both notes belong to D minor. E–C, G–E and D–B each contain a note outside Dm.'
      }),
      mc('Looking at the tab, why is the upper note one fret below the lower note in the second pair, but on the same fret in the first?', 'D–F is a half step narrower than C–E', [
        'D–F is a half step wider than C–E',
        'D–F is exactly the same width as C–E',
        'D–F is a full octave wider than C–E'
      ], {
        visual: {
          type: 'tab',
          events: [
            { pos: [{ string: 3, fret: 5 }, { string: 2, fret: 5 }], beats: 1 },
            { pos: [{ string: 3, fret: 7 }, { string: 2, fret: 6 }], beats: 1 }
          ],
          bpm: 80,
          caption: 'C–E, then D–F, on the G and B strings.'
        },
        explain: 'C–E is a major 3rd and D–F is a minor 3rd (it spans the E–F half step). In D–F, the upper note is one fret below the lower note: G string fret 7, B string fret 6.'
      }),
      mc('Listen. Is this interval a 3rd or a 6th?', 'A 6th', ['A 3rd'], {
        play: playInterval('E3', 'm6', 'harmonic'),
        explain: 'E up to C is 8 half steps, a **minor 6th**: wider and warmer than a 3rd. It is C–E turned upside down.'
      }),
      mc('Listen. Is this interval a 3rd or a 6th?', 'A 3rd', ['A 6th'], {
        play: playInterval('F3', 'M3', 'harmonic'),
        explain: 'F up to A is 4 half steps, a **major 3rd**.'
      }),
      mc('Listen. Major or minor 3rd?', 'Minor 3rd', ['Major 3rd'], {
        play: playInterval('E3', 'm3', 'harmonic'),
        explain: 'E up to G is 3 half steps: a **minor 3rd** (degree 3 of C major).'
      }),
      mc('Listen. Major or minor 6th?', 'Major 6th', ['Minor 6th'], {
        play: playInterval('G3', 'M6', 'harmonic'),
        explain: 'G up to E is 9 half steps: a **major 6th** (degree 5 of C major).'
      })
    ],
    generators: [diatonicSpellQ, qualityQ, fretboardPairQ, earPairQ, chordPairQ, invertQ]
  }
}

export default unit
