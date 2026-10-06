import type { Block, PlaySpec, QuizQuestion, Unit } from '../types'
import type { SeqEvent } from '@/audio/engine'
import { mc, rand, randInt } from '../helpers'
import { ChordShape, FretPos, OPEN_CHORDS, midiAt, shapePositions } from '@/theory/guitar'
import { progressionExample } from '../toolExamples'

// ---------- local helpers ----------
// Everything rhythmic is derived from one source (a "grid" string or a spec string) so that the
// notation, the tab and the audio of a pattern can never disagree with each other.

const rep = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat()

/** Pass `pitch = null` for plain metronome-style clicks. */
const rhythm = (pattern: number[], bpm = 80, pitch: string | null = 'G3', countIn = 4): PlaySpec => ({
  kind: 'rhythm',
  pattern,
  bpm,
  countIn,
  ...(pitch ? { pitch } : {})
})

type Staff = Extract<Block, { type: 'staff' }>

// ----- grid strings -----
// One character per time slot. D / U = down / up stroke (rings until the next event), X = muted "chuck",
// g = ghost stroke, "." = rest, "-" = hold whatever came before (a missed stroke / tied value).

interface Run {
  ch: string
  slots: number
}
function runs(grid: string): Run[] {
  const out: Run[] = []
  for (const ch of grid) {
    if (ch === '-' && out.length) out[out.length - 1].slots++
    else out.push({ ch: ch === '-' ? '.' : ch, slots: 1 })
  }
  return out
}
/** Note lengths in beats; negative = rest. */
const gridBeats = (grid: string, slot: number): number[] => runs(grid).map((r) => (r.ch === '.' ? -1 : 1) * r.slots * slot)

const DUR_OF: [number, string][] = [[4, 'w'], [3, 'hd'], [2, 'h'], [1.5, 'qd'], [1, 'q'], [0.75, '8d'], [0.5, '8'], [0.25, '16']]
function durOf(beats: number): string {
  const f = DUR_OF.find(([x]) => Math.abs(x - beats) < 1e-6)
  if (!f) throw new Error(`u14: no single note value for ${beats} beats`)
  return f[1]
}
/** Spec string for the staff: "q 8r qd q". Optional ":G/3" gives a note its pitch. */
const gridSpec = (grid: string, slot: number, key = 'B/4'): string =>
  runs(grid)
    .map((r) => (r.ch === '.' ? durOf(r.slots * slot) + 'r' : `${durOf(r.slots * slot)}:${key}`))
    .join(' ')

const BASE: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 }
function tokens(spec: string): { dur: string; key: string; beats: number }[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((t) => {
      const [d, key] = t.split(':')
      const beats = BASE[d.replace(/[rd]/g, '')] * (d.includes('d') ? 1.5 : 1)
      return { dur: d, key: key ?? 'B/4', beats: d.includes('r') ? -beats : beats }
    })
}
const specBeats = (spec: string): number[] => tokens(spec).map((t) => t.beats)
const staff = (timeSig: string, spec: string, caption?: string, bpm = 80): Staff => ({
  type: 'staff',
  timeSig,
  notes: tokens(spec).map((t) => ({ keys: [t.key], duration: t.dur })),
  caption,
  bpm
})
const gridStaff = (timeSig: string, grid: string, slot: number, reps: number, caption?: string, bpm = 80): Staff =>
  staff(timeSig, rep([gridSpec(grid, slot)], reps).join(' '), caption, bpm)
const gridRhythm = (grid: string, slot: number, reps: number, bpm = 80, pitch: string | null = 'G3', countIn = 4): PlaySpec =>
  rhythm(rep(gridBeats(grid, slot), reps), bpm, pitch, countIn)

// Tables: attack rows (X = a note starts) and stroke rows (D / U / x / g)
const HEAD8 = ['Count', '1', '&', '2', '&', '3', '&', '4', '&']
const HEAD16 = ['Count', '1', 'e', '&', 'a', '2', 'e', '&', 'a']
const attackRow = (label: string, grid: string): string[] => [label, ...[...grid].map((c) => ('DUXg'.includes(c) ? 'X' : '·'))]
const strokeRow = (label: string, grid: string): string[] => [
  label,
  ...[...grid].map((c) => (c === 'X' ? 'x' : 'DUg'.includes(c) ? c : ''))
]

// ----- strumming -----

/** Downstroke = every string low->high; upstroke = top four strings high->low. */
function strokeNotes(s: ChordShape, dir: 'D' | 'U'): number[] {
  const pos = shapePositions(s)
  if (dir === 'D') return pos.map((p) => midiAt(p))
  return pos
    .filter((p) => p.string <= 4)
    .map((p) => midiAt(p))
    .reverse()
}
/** A chuck is a very short muted strike; a ghost stroke is shorter and only brushes the top strings. */
function strumEvents(s: ChordShape, grid: string, slot: number): SeqEvent[] {
  const out: SeqEvent[] = []
  for (const r of runs(grid)) {
    const total = r.slots * slot
    if (r.ch === 'D' || r.ch === 'U') out.push({ notes: strokeNotes(s, r.ch), beats: total, mode: 'strum' })
    else if (r.ch === 'X' || r.ch === 'g') {
      const c = Math.min(total, slot * 0.3)
      const up = strokeNotes(s, 'U')
      out.push({ notes: r.ch === 'X' ? up : up.slice(0, 2), beats: c, mode: 'strum' })
      if (total - c > 1e-9) out.push({ notes: [], beats: total - c })
    } else out.push({ notes: [], beats: total })
  }
  return out
}
const strumSeq = (segs: [ChordShape, string][], slot: number, bpm: number): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: segs.flatMap(([s, g]) => strumEvents(s, g, slot))
})
/** The same grid on one chord, repeated `bars` times. */
const strumLoop = (s: ChordShape, grid: string, slot: number, times: number, bpm: number): PlaySpec =>
  strumSeq(rep([[s, grid] as [ChordShape, string]], times), slot, bpm)

// ----- tab / sequences from positions -----

const tabEvents = (beats: number[], pos: FretPos[]): { pos: FretPos[]; beats: number }[] =>
  beats.map((b) => (b < 0 ? { pos: [], beats: -b } : { pos, beats: b }))
const seqOf = (events: { pos: FretPos[]; beats: number }[], bpm: number, mode: 'block' | 'strum' = 'block'): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: events.map((e) => ({ notes: e.pos.map((p) => midiAt(p)), beats: e.beats, mode }))
})

/** Single-note riff grid: "5/0" = string 5 fret 0 (a note), "-" hold, "." rest. One token per slot. */
function riff(toks: string[], slot: number): { pos: FretPos[]; beats: number }[] {
  const out: { pos: FretPos[]; beats: number }[] = []
  for (const t of toks) {
    if (t === '-' && out.length) out[out.length - 1].beats += slot
    else if (t === '-' || t === '.') {
      if (t === '.' && out.length && out[out.length - 1].pos.length === 0) out[out.length - 1].beats += slot
      else out.push({ pos: [], beats: slot })
    } else {
      const [s, f] = t.split('/').map(Number)
      out.push({ pos: [{ string: s, fret: f }], beats: slot })
    }
  }
  return out
}

// ----- accent / grouping sequences (for meters) -----
// Strong = first group of the bar (low bass + chord), medium = start of the other groups, weak = the rest.

function accentSeq(bars: number[][], unit: number, bpm: number, reps = 2): PlaySpec {
  const events: SeqEvent[] = []
  for (let r = 0; r < reps; r++)
    for (const groups of bars)
      groups.forEach((n, gi) => {
        for (let i = 0; i < n; i++)
          events.push(
            i === 0 ? (gi === 0 ? { notes: [43, 55, 59], beats: unit, mode: 'block' } : { notes: [55], beats: unit, mode: 'block' }) : { notes: [67], beats: unit, mode: 'block' }
          )
      })
  return { kind: 'sequence', bpm, events }
}
/** Staff spec for the same groups: low note = strong, middle = medium, high = weak. */
function accentSpec(groups: number[], dur: string): string {
  return groups.flatMap((n, gi) => Array.from({ length: n }, (_, i) => `${dur}:${i === 0 ? (gi === 0 ? 'G/3' : 'D/4') : 'B/4'}`)).join(' ')
}
/** Tab events for the same groups: power chord on group starts, open G string for the rest. */
function groupEvents(groups: number[], unit: number): { pos: FretPos[]; beats: number }[] {
  return groups.flatMap((n, gi) =>
    Array.from({ length: n }, (_, i) => ({
      pos: i === 0 ? [{ string: 6, fret: gi === 0 ? 0 : 3 }, { string: 5, fret: gi === 0 ? 2 : 5 }] : [{ string: 3, fret: 0 }],
      beats: unit
    }))
  )
}
const plus = (g: number[]) => g.join('+')

// ----- shared musical material -----

const G = OPEN_CHORDS.G
const C = OPEN_CHORDS.C
const D = OPEN_CHORDS.D
const Em = OPEN_CHORDS.Em
const E7 = OPEN_CHORDS.E7

const SYNC = 'D-.D--D-' // eighth-note grid: 1, (rest on 2), 2&, held through 3, 4  =  q 8r qd q
const ON = 'D-D-D-D-'
const OFF = '.U.U.U.U'
const FOLK = 'D-DU-UDU'

// Swing: long-short at 2:1 (triplet feel)
const STRAIGHT8 = rep([0.5], 16)
const SWUNG8 = rep([2 / 3, 1 / 3], 8)

// Shuffle riff on E (low E string and A string): E5 then E6 on every beat
const E5: FretPos[] = [{ string: 6, fret: 0 }, { string: 5, fret: 2 }]
const E6: FretPos[] = [{ string: 6, fret: 0 }, { string: 5, fret: 4 }]
const shuffleEvents = (long: number, short: number) => rep([{ pos: E5, beats: long }, { pos: E6, beats: short }], 4)

// Triplet arpeggio on Am: A2, C3, E3.
const AM_ARP: FretPos[] = [{ string: 5, fret: 0 }, { string: 5, fret: 3 }, { string: 4, fret: 2 }]

// Funk single-note riff in A minor pentatonic, 16 slots = one bar of 4/4
const RIFF = riff(['5/0', '-', '.', '5/3', '-', '4/0', '4/2', '.', '5/0', '-', '.', '5/3', '.', '4/2', '4/0', '-'], 0.25)

// 3 against 2 over two beats: union of the 2-line (low E) and the 3-line (high E)
const LOW: FretPos = { string: 6, fret: 0 }
const HIGH: FretPos = { string: 1, fret: 0 }
const POLY = [
  { pos: [LOW, HIGH], beats: 2 / 3 },
  { pos: [HIGH], beats: 1 / 3 },
  { pos: [LOW], beats: 1 / 3 },
  { pos: [HIGH], beats: 2 / 3 }
]

// 12/8 slow-blues arpeggio on E7: bass note, then strings 3 and 2, four groups of three eighths
const E7_12_8: { pos: FretPos[]; beats: number }[] = [
  [6, 0], [5, 2], [4, 0], [5, 2]
].flatMap(([s, f]) => [
  { pos: [{ string: s, fret: f }], beats: 0.5 },
  { pos: [{ string: 3, fret: 1 }], beats: 0.5 },
  { pos: [{ string: 2, fret: 0 }], beats: 0.5 }
])

// ---------- generated questions ----------

const METERS = [
  { ts: '2/4', e: 4 },
  { ts: '3/4', e: 6 },
  { ts: '4/4', e: 8 },
  { ts: '5/4', e: 10 },
  { ts: '6/8', e: 6 },
  { ts: '7/8', e: 7 },
  { ts: '9/8', e: 9 },
  { ts: '12/8', e: 12 }
]
const COMPOUND = [
  { ts: '6/8', beats: 2 },
  { ts: '9/8', beats: 3 },
  { ts: '12/8', beats: 4 }
]

const beatsInBarQ = (): QuizQuestion => {
  if (Math.random() < 0.45) {
    const c = rand(COMPOUND)
    return mc(`How many main beats do you feel in one bar of **${c.ts}**?`, String(c.beats), ['1', '2', '3', '4', '6', '9', '12'].filter((x) => x !== String(c.beats)).slice(0, 3), {
      explain: `${c.ts} is compound time: the beat is a dotted quarter holding three eighths. ${c.ts.split('/')[0]} eighths ÷ 3 = **${c.beats}** beats.`
    })
  }
  const m = rand(METERS)
  return {
    kind: 'text',
    prompt: `How many **eighth notes** fill one bar of **${m.ts}**?`,
    accept: [String(m.e)],
    explain: m.ts.endsWith('/8')
      ? `The bottom number 8 means an eighth note gets the beat, so ${m.ts} holds **${m.e}** of them.`
      : `${m.ts} has ${m.e / 2} quarter-note beats, each made of two eighths: ${m.e / 2} × 2 = **${m.e}**.`
  }
}

const FEELS: { name: string; pat: number[]; why: string }[] = [
  { name: 'Straight eighths', pat: STRAIGHT8, why: 'Two equal notes per beat: even "1 & 2 &".' },
  { name: 'Swung eighths', pat: SWUNG8, why: 'Two notes per beat, but the first is twice as long as the second (long-short, 2:1).' },
  { name: 'Eighth-note triplets', pat: rep([1 / 3], 24), why: 'Three equal notes per beat: "1-trip-let".' },
  { name: 'Sixteenth notes', pat: rep([0.25], 32), why: 'Four equal notes per beat: "1 e & a".' }
]
const feelQ = (): QuizQuestion => {
  const f = rand(FEELS)
  return mc('Listen: four clicks, then two bars of 4/4. Which feel is it?', f.name, FEELS.map((x) => x.name), {
    play: rhythm(f.pat, rand([76, 84, 92]), 'G3'),
    explain: `**${f.name}.** ${f.why}`
  })
}

const syncCountQ = (): QuizQuestion => {
  let grid = ''
  let attacks: number[] = []
  do {
    grid = ''
    attacks = []
    let slot = 0
    while (slot < 8) {
      const len = Math.min(8 - slot, rand([1, 1, 2, 2, 3, 4]))
      attacks.push(slot)
      grid += 'D' + '-'.repeat(len - 1)
      slot += len
    }
  } while (attacks.filter((s) => s % 2 === 1).length < 1 || attacks.some((_, i) => i > 0 && attacks[i] - attacks[i - 1] > 4))
  const label = (s: number) => (s % 2 === 0 ? String(s / 2 + 1) : `${(s - 1) / 2 + 1}&`)
  const off = attacks.filter((s) => s % 2 === 1)
  const ans = String(off.length)
  return mc('How many of the notes in this bar start **off the beat** (on an "&")?', ans, ['0', '1', '2', '3', '4', '5'].filter((x) => x !== ans).slice(0, 3), {
    visual: gridStaff('4/4', grid, 0.5, 1),
    play: gridRhythm(grid, 0.5, 2, 84),
    explain: `The notes start on ${attacks.map(label).join(', ')}. The ones with an "&" are off the beat: **${off.length}** (${off.map(label).join(', ')}).`
  })
}

const tripletMathQ = (): QuizQuestion => {
  const v = randInt(0, 4)
  if (v === 0) {
    const n = randInt(1, 4)
    return mc(`How many **eighth-note triplets** fit in ${n} beat${n > 1 ? 's' : ''}?`, String(3 * n), [String(2 * n), String(4 * n), String(6 * n)], {
      explain: `A triplet puts three notes in each beat: ${n} × 3 = **${3 * n}**.`
    })
  }
  if (v === 1)
    return mc('How long, in beats, is one **quarter-note triplet** note?', '2/3 of a beat', ['1/3 of a beat', '3/4 of a beat', '1 beat'], {
      explain: 'Three quarter-note triplets share two beats, so each lasts 2 ÷ 3 = **2/3** of a beat.'
    })
  if (v === 2)
    return mc('How many quarter-note triplets fill one bar of 4/4?', '6', ['3', '4', '12'], {
      explain: 'Each pair of beats holds three of them, and a 4/4 bar has two pairs: **6**.'
    })
  if (v === 3)
    return mc('How many **sixteenth-note triplets** (sextuplets) fit in one beat?', '6', ['3', '4', '8'], {
      explain: 'Twice as fast as eighth triplets (3 per beat): **6** per beat.'
    })
  return mc('Three eighth-note triplets last the same time as…', 'one quarter note', ['one half note', 'three straight eighth notes', 'a dotted quarter note'], {
    explain: 'Three triplet eighths are squeezed into one beat: the length of **one quarter note**. Three straight eighths would be 1½ beats.'
  })
}

const GROUPINGS: { ts: string; unit: number; bpm: number; opts: number[][] }[] = [
  { ts: '5/4', unit: 1, bpm: 130, opts: [[3, 2], [2, 3]] },
  { ts: '7/8', unit: 0.5, bpm: 160, opts: [[2, 2, 3], [3, 2, 2], [2, 3, 2]] },
  { ts: '8/8', unit: 0.5, bpm: 160, opts: [[3, 3, 2], [3, 2, 3], [2, 3, 3]] },
  { ts: '9/8', unit: 0.5, bpm: 160, opts: [[2, 2, 2, 3], [3, 2, 2, 2], [2, 3, 2, 2], [2, 2, 3, 2]] }
]
const groupingQ = (): QuizQuestion => {
  const g = rand(GROUPINGS)
  const ans = rand(g.opts)
  return mc(
    `Listen: a bar of **${g.ts}**, repeated. The low note is beat 1 and the mid notes start the other groups. How is the bar grouped?`,
    plus(ans),
    g.opts.map(plus),
    {
      play: accentSeq([ans], g.unit, g.bpm, 4),
      explain: `The low and mid notes mark the start of each group, so the bar splits into groups of ${ans.join(', ')} ${g.unit === 1 ? 'beats' : 'eighths'}: **${plus(ans)}**. Count each group from 1: ${ans.map((n) => Array.from({ length: n }, (_, i) => i + 1).join(' ')).join(' | ')}.`
    }
  )
}

const FEEL_METERS = [
  { ts: '3/4', groups: [2, 2, 2], why: 'Three groups of two eighths: three simple beats.' },
  { ts: '4/4', groups: [2, 2, 2, 2], why: 'Four groups of two eighths: four simple beats.' },
  { ts: '6/8', groups: [3, 3], why: 'Two groups of three eighths: two compound beats.' },
  { ts: '9/8', groups: [3, 3, 3], why: 'Three groups of three eighths: three compound beats.' }
]
const meterFeelQ = (): QuizQuestion => {
  const f = rand(FEEL_METERS)
  return mc('Listen: eighth notes with the first of each bar in the low register. Which time signature fits?', f.ts, FEEL_METERS.map((x) => x.ts), {
    play: accentSeq([f.groups], 0.5, 150, 3),
    explain: `**${f.ts}.** ${f.why}`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u14',
  number: 14,
  title: 'Rhythm II: syncopation, swing and odd meters',
  summary:
    'Syncopation and anticipations, the syncopated strum, chucks and ghost strokes, triplets, swing and shuffle, sixteenth-note funk, compound meters in depth, odd meters, changing meters and 3-against-2.',
  elective: true,
  requires: ['u2'],
  lessons: [
    // ------------------------------------------------------------------ 1
    {
      id: 'u14l1',
      title: 'Syncopation: playing against the beat',
      summary: 'Off-beats, anticipations (pushes) and ties across the beat: why a rhythm can make you want to move.',
      blocks: [
        {
          type: 'text',
          md: `In [[u2l4]] you learned to count "1 & 2 & 3 & 4 &". Every number is an **on-beat**; every "&" is an **off-beat**. Your foot lands on the on-beats, and the ear *expects* the notes to land there too.

**Syncopation** is what happens when the music **stresses the off-beats** and leaves the expected on-beats empty or held over. The pulse is still there (your foot keeps tapping), but the notes lean against it. That tension between the steady foot and the leaning notes is the feel of funk, reggae, Latin, jazz, and nearly every good pop riff.

### Three ways to syncopate
1. **Play the off-beats** and skip the on-beats ("1 **&** 2 **&**").
2. **Rest on a strong beat**, so the next note arrives "late" and surprising.
3. **Tie a note across the beat**: start it on an "&" and hold it through the next number. Nothing is struck on that beat, but you hear it.`
        },
        {
          type: 'table',
          headers: HEAD8,
          rows: [attackRow('Four quarters', ON), attackRow('Off-beats only', OFF), attackRow('Syncopated', SYNC)],
          caption: 'X = a note starts, · = nothing starts. The third rhythm has notes on 1, 2& and 4. The 2& note is held right over beat 3.'
        },
        {
          ...gridStaff('4/4', ON + OFF + SYNC, 0.5, 1, 'Bar 1: on the beat. Bar 2: only on the off-beats. Bar 3: syncopated (quarter, eighth rest, dotted quarter, quarter).'),
          bpm: 84
        },
        {
          type: 'audioRow',
          items: [
            { label: 'On the beat', play: gridRhythm(ON, 0.5, 2, 84) },
            { label: 'Off-beats only', play: gridRhythm(OFF, 0.5, 2, 84) },
            { label: 'Syncopated: 1, 2&, 4', play: gridRhythm(SYNC, 0.5, 2, 84) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Tap your foot on every number while you listen to each example, and **never let the foot stop**. The first pattern sits on your foot. The second falls exactly *between* taps. The third does both, which is why it sounds the most "grooving".`
        },
        {
          type: 'text',
          md: `### The tie across the beat
The third pattern shows the most common syncopation of all. After the rest on beat 2, a note starts on **2&** and is **held through beat 3**. Written as one **dotted quarter** it fills a beat and a half. Many charts instead write an **eighth tied to a quarter**, so the middle of the bar stays visible. It is the same sound either way.

Compare it with the same pattern where beat 3 is struck again. The only difference is one extra pick, and the whole feel flattens out.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Tied: 2& held through 3', play: rhythm(specBeats('q 8r qd q q 8r qd q'), 84) },
            { label: 'Beat 3 struck again', play: rhythm(specBeats('q 8r 8 q q q 8r 8 q q'), 84) }
          ]
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'The syncopated rhythm as an Em chord stab: the note after the rest lands on 2& and rings across beat 3.',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'min', shape: Em }],
          events: tabEvents(rep(gridBeats(SYNC, 0.5), 2), shapePositions(Em)),
          bpm: 84
        },
        {
          type: 'text',
          md: `### Anticipation: the "push"
An **anticipation** (or **push**) is a note or chord that arrives **early**, usually half a beat before the beat it belongs to, and then holds through that beat. The classic use is a **chord change**: instead of changing on beat 1 of the new bar, you play the new chord on the **4&** of the bar before.

Listen to a G to C change both ways. The first one is square and safe; the second one *leans into* the new chord.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Change lands on beat 1', play: { ...strumSeq([[G, 'D-D-D-D-'], [C, 'D-D-D-D-']], 0.5, 92), toolExample: progressionExample('G', ['I', 'IV'], 'major', 92) } },
            { label: 'C pushed to the 4& before', play: { ...strumSeq([[G, 'D-D-D-D'], [C, 'D--D-D-D-']], 0.5, 92), toolExample: progressionExample('G', ['I', 'IV'], 'major', 92) } }
          ]
        },
        {
          type: 'text',
          md: `In the pushed version the C chord is struck on **4&** and then **not struck again** on beat 1: it just keeps ringing. The downbeat of the new bar is silent, yet the change is clearly felt there. That is the whole trick: **the beat is implied, not played**.

On a chart the pushed chord is simply written on the "&" of the last beat of the bar. If you hear a band hit a chord "just early" and let it ring through the downbeat, that is an anticipation.`
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Anticipations nearly always land on the **"&" of the beat before**, half a beat early. Occasionally you will meet a **sixteenth-note** push (on the "a"), which is much more urgent.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which count does the second note of this bar start on?', '2&', ['2', '3', '3&'], {
            play: rhythm(specBeats('q 8r qd q q 8r qd q'), 84),
            explain: 'After the beat-1 note, there is an **eighth rest on beat 2**, so the next note starts half a beat later: the **2&** (and it holds through beat 3).'
          })
        },
        {
          type: 'tryIt',
          question: mc('What makes a chord change an **eighth-note anticipation**?', 'It arrives on the preceding off-beat', ['It arrives on the following off-beat', 'It arrives exactly on the strong beat', 'It arrives one complete bar earlier'], {
            explain: 'The new chord is pushed ahead onto the "&" before the beat and sustained through it.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'u14l2',
      title: 'The syncopated strum, chucks and ghost strokes',
      summary: 'Why D-DU-UDU grooves, how to use muted strikes, ghost strokes and rests as part of the rhythm.',
      blocks: [
        {
          type: 'text',
          md: `You met **D-DU-UDU** in [[u2l6]] and were told it contains syncopation. Now we can say exactly where.

Read the pattern against the constant hand motion (down on numbers, up on the "&"s):`
        },
        {
          type: 'table',
          headers: HEAD8,
          rows: [
            ['Hand moves', '↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'],
            strokeRow('D-DU-UDU', FOLK),
            attackRow('Notes start', FOLK)
          ],
          caption: 'The hand never stops. Strokes marked D or U hit the strings; blank cells are misses.'
        },
        {
          type: 'text',
          md: `Three things are going on:
- The **"&" after 1** is missed, so beat 1 rings for a full beat.
- The **downstroke on beat 3 is missed**. Nothing starts on the strongest beat of the second half of the bar.
- The **upstroke on 2&** therefore rings *across* beat 3, and the **3&** upstroke pushes the next downstroke on 4.

Written as note values, that is a quarter, an eighth, a quarter, then three eighths. The long note on 2& is the same *tie across the beat* you just learned.`
        },
        {
          ...gridStaff('4/4', FOLK, 0.5, 1, 'D-DU-UDU as rhythm: quarter, eighth, quarter (starting on 2&), eighth, eighth, eighth.'),
          bpm: 88
        },
        {
          type: 'audioRow',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj', shape: G }],
          items: [
            { label: 'Quarters on G: D-D-D-D-', play: strumLoop(G, ON, 0.5, 2, 88) },
            { label: 'Constant eighths: DUDUDUDU', play: strumLoop(G, 'DUDUDUDU', 0.5, 2, 88) },
            { label: 'Syncopated: D-DU-UDU', play: strumLoop(G, FOLK, 0.5, 2, 88) }
          ]
        },
        {
          type: 'audio',
          label: 'G – C – D – G with D-DU-UDU',
          play: { ...strumSeq([[G, FOLK], [C, FOLK], [D, FOLK], [G, FOLK]], 0.5, 90), toolExample: progressionExample('G', ['I', 'IV', 'V', 'I'], 'major', 90) }
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Keep the hand swinging and **think of the missed strokes as ghost swings**. If you stop the hand for the missed beat-3 downstroke, you will rush the 3& upstroke every time.`
        },
        {
          type: 'text',
          md: `### Rests are rhythm too
The gaps in a pattern are not "nothing": they are what gives the notes their shape. On guitar there are three levels of silence:
- **A true rest**: nothing sounds. Lift the fretting fingers or lay the picking palm on the strings.
- **A chuck** (also "chop" or "dead strum"): you strike the strings while they are **muted**, so you hear a short percussive *chk* instead of a chord. Release the fretting-hand pressure for a moment while the strum happens. On charts a chuck is an **x** notehead.
- **A ghost stroke**: the hand swings through and **barely brushes** the strings. You feel it more than you hear it.

Chucks usually take the place of the **backbeat** (beats 2 and 4, where a drummer hits the snare). Ghost strokes fill the gaps so the hand keeps moving with a lively texture.`
        },
        {
          type: 'table',
          headers: HEAD8,
          rows: [
            strokeRow('Boom-chuck', 'D-X-D-X-'),
            strokeRow('Folk with chucks', 'D-XU-UXU'),
            strokeRow('Ghosts in the gaps', 'DgDUgUDU'),
            strokeRow('Reggae skank', OFF)
          ],
          caption: 'x = muted chuck, g = ghost stroke, D / U = normal strokes.'
        },
        {
          type: 'audioRow',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj', shape: G }],
          items: [
            { label: 'Boom-chuck', play: strumLoop(G, 'D-X-D-X-', 0.5, 2, 88) },
            { label: 'Folk with chucks on 2 and 4', play: strumLoop(G, 'D-XU-UXU', 0.5, 2, 88) },
            { label: 'Ghost strokes in the gaps', play: strumLoop(G, 'DgDUgUDU', 0.5, 2, 88) }
          ]
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `In this app a chuck is a short muted-style tap and a ghost stroke is a lighter, even shorter one. Real guitars give you a much wider palette of volume and dead-string sounds, so use these as a guide to **timing**, then copy the sound with your own hands.`
        },
        {
          type: 'text',
          md: `### Rest on the beat: the skank
Reggae builds an entire style on one idea: **rest on every beat, play only the off-beats**, short and sharp. Down on the beat means silence; the upstroke on each "&" is a quick chop. It is the "off-beats only" pattern from the last lesson with a guitar in your hands.`
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'Reggae skank on Em: a rest on every number, a short chord on every "&".',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'min', shape: Em }],
          events: tabEvents(rep([-0.5, 0.5], 4), shapePositions(Em)).concat(tabEvents(rep([-0.5, 0.5], 4), shapePositions(Em))),
          bpm: 80
        },
        {
          type: 'audioRow',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'min', shape: Em }],
          items: [
            { label: 'Skank on Em (off-beat chops)', play: strumLoop(Em, OFF, 0.5, 2, 80) },
            { label: 'Same chord on the beat', play: strumLoop(Em, ON, 0.5, 2, 80) }
          ]
        },
        {
          type: 'tryIt',
          question: mc('In D-DU-UDU, which beat has **no** downstroke on it?', 'Beat 3', ['Beat 1', 'Beat 2', 'Beat 4'], {
            explain: 'The pattern goes D (1), – (&), D (2), U (2&), – (3), U (3&), D (4), U (4&). The hand passes beat 3 without hitting the strings.'
          })
        },
        {
          type: 'tryIt',
          question: mc('What is a **chuck**?', 'A short muted strike', ['A quiet ringing strum', 'A bend held for two beats', 'A ringing harmonic'], {
            explain: 'A chuck means you strum while the strings are damped. It takes up a place in the rhythm but gives a click-like sound, not a chord.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'u14l3',
      title: 'Triplets, swing and shuffle',
      summary: 'Three in the space of two: eighth and quarter-note triplets, then how swung eighths grow out of the triplet.',
      blocks: [
        {
          type: 'text',
          md: `So far each beat has been split into 2 (eighths) or 4 (sixteenths). A **triplet** splits the beat into **3 equal parts** instead: "three in the time of two". Everything about it is the same idea, just a different gear.

### Eighth-note triplets
Three notes per beat, counted **1-trip-let 2-trip-let 3-trip-let 4-trip-let** (some people say "1 la li" or "1 & a"). Each lasts **⅓ of a beat**. In notation a small **3** and a bracket sit over each group.`
        },
        {
          type: 'audioRow',
          items: [
            { label: '2 per beat: eighths', play: rhythm(rep([0.5], 8), 76) },
            { label: '3 per beat: triplets', play: rhythm(rep([1 / 3], 12), 76) },
            { label: '4 per beat: sixteenths', play: rhythm(rep([0.25], 16), 76) }
          ]
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'A triplet arpeggio on Am: three notes in each beat (the 3 bracket marks each group).',
          toolExamples: [{ kind: 'chord', root: 'A', type: 'min', shape: OPEN_CHORDS.Am }],
          events: rep(AM_ARP, 4).map((p) => ({ pos: [p], beats: 1 / 3 })),
          bpm: 66
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Say "**1**-trip-let **2**-trip-let" out loud with a metronome at 60 BPM. Then try to say it while tapping the foot. A 3-syllable word "**tri-pl-et**" or "**pine-ap-ple**" under each beat is the easiest way to lock the feel.`
        },
        {
          type: 'text',
          md: `### Quarter-note triplets
Stretch the idea: **three quarter-note triplets fit in two beats**, so each lasts **⅔ of a beat**. They cut across the bar in a slow, rolling way, and they are great for making a simple riff sound "over the barline".

The easy way to count them is to say eighth-note triplets over two beats (**1** trip **let** **2** trip **let**) and play only the **1st, 3rd and 5th** syllables: that is the "**1**", the "**let**" and the "**trip**" of beat 2.`
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'Six quarter-note triplets fill one bar of 4/4 (three per two beats).',
          events: rep([{ string: 5, fret: 0 }, { string: 4, fret: 2 }, { string: 3, fret: 2 }], 2).map((p) => ({ pos: [p], beats: 2 / 3 })),
          bpm: 72
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Quarters', play: rhythm(rep([1], 8), 80) },
            { label: 'Quarter-note triplets', play: rhythm(rep([2 / 3], 12), 80) }
          ]
        },
        {
          type: 'table',
          headers: ['Name', 'Length', 'Per beat', 'Per 4/4 bar'],
          rows: [
            ['Half-note triplet', '4/3 beats', '¾', '3'],
            ['Quarter-note triplet', '⅔ beat', '1½', '6'],
            ['Eighth-note triplet', '⅓ beat', '3', '12'],
            ['Sixteenth-note triplet (sextuplet)', '⅙ beat', '6', '24']
          ],
          caption: 'Each triplet value is two-thirds of the plain value written under the bracket.'
        },
        {
          type: 'text',
          md: `### From triplets to swing
Now take a group of three eighth triplets and play only the **1st and 3rd** (the middle one is silent). You get two notes in a beat: one on the beat, one **two-thirds of the way through**. The first note is **twice as long** as the second: **long-short, 2:1**.

That is exactly what **swing** is. Straight eighths are two equal halves of the beat; **swung eighths** are the triplet's long and short parts.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Triplets with the middle one silent', play: rhythm(rep([1 / 3, -1 / 3, 1 / 3], 8), 76) },
            { label: 'Swung eighths (2:1)', play: rhythm(SWUNG8, 76) },
            { label: 'Straight eighths (1:1)', play: rhythm(STRAIGHT8, 76) }
          ]
        },
        {
          type: 'text',
          md: `The first two buttons sound the same: the notes start at the same moments. Straight eighths are noticeably more "stiff".

### How swing is written
Swing is almost never notated precisely. Charts write **ordinary eighth notes** and put a note at the top, e.g. **"Swing"** or a mark like *eighth = triplet-quarter + triplet-eighth*. The performer is expected to know what to do. The notes below are straight eighths on the page but swung in the ear.`
        },
        staff('4/4', rep(['8', '8', '8', '8', '8', '8', '8', '8'], 2).join(' '), 'Written: ordinary eighths with "Swing" above the staff. Played: long-short.', 90),
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'The exact swung rhythm: a triplet quarter followed by a triplet eighth, four times.',
          events: rep([{ string: 5, fret: 0 }], 4).flatMap((p, i) => [{ pos: [p], beats: 2 / 3 }, { pos: [{ string: 4, fret: i % 2 ? 2 : 0 }], beats: 1 / 3 }]),
          bpm: 80
        },
        {
          type: 'text',
          md: `### How much swing?
Swing is a **ratio**, not a switch. Between straight (1:1) and triplet swing (2:1) there is "lazy" light swing, and beyond it there is hard swing (3:1) which is nearly a dotted-eighth and a sixteenth. **Faster tempos swing less**; slow blues and jazz ballads swing more.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Straight 1:1', play: rhythm(rep([0.5, 0.5], 8), 76) },
            { label: 'Light swing', play: rhythm(rep([0.56, 0.44], 8), 76) },
            { label: 'Triplet swing 2:1', play: rhythm(SWUNG8, 76) },
            { label: 'Hard swing 3:1', play: rhythm(rep([0.75, 0.25], 8), 76) }
          ]
        },
        {
          type: 'text',
          md: `### Shuffle
A **shuffle** is the same long-short pulse on a groove. You already met this riff in [[u8l5]], built on the power chords from [[u3l6]]. The classic electric-blues version moves between two chord shapes on a single beat: **E5 for the long note, E6 for the short note**, "5–6, 5–6, 5–6". Played straight it is a march; played swung it is the shuffle that drives every 12-bar blues.`
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'The shuffle: low E and A strings, a power chord (fret 2) for the long note, a sixth (fret 4) for the short note.',
          events: shuffleEvents(2 / 3, 1 / 3),
          bpm: 100
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Shuffle, straight eighths', play: seqOf(shuffleEvents(0.5, 0.5).concat(shuffleEvents(0.5, 0.5)), 100) },
            { label: 'Shuffle, swung eighths', play: seqOf(shuffleEvents(2 / 3, 1 / 3).concat(shuffleEvents(2 / 3, 1 / 3)), 100) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Triplet feel and swing live on the same grid. Slow blues in **12/8** (Lesson 5) and a swung 4/4 shuffle are the same sound, written two different ways.`
        },
        {
          type: 'tryIt',
          question: mc('Listen. Straight or swung?', 'Swung', ['Straight'], {
            play: rhythm(SWUNG8, 80),
            explain: 'The notes alternate **long, short**: the first of each pair is twice as long as the second. That is swing.'
          })
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'How many **eighth-note triplets** fill one bar of 4/4?', accept: ['12', 'twelve'], explain: 'Three per beat × four beats = **12**.' }
        }
      ]
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'u14l4',
      title: 'Sixteenth-note funk',
      summary: 'Syncopated sixteenths, the 3-3-2 pattern, and a funk riff with silence built in.',
      blocks: [
        {
          type: 'text',
          md: `Funk lives on the **sixteenth-note grid**: four slots per beat, counted "**1** e & a **2** e & a". The right hand never stops: **down on the numbers and "&"s, up on the "e"s and "a"s**, a steady blur of 16 swings per bar. A funk part is the hand picking *which* of those slots to hit, which to mute, and which to leave empty.

The ear then hears **short stabs, rests and held notes** instead of a wall of notes. That is the groove.`
        },
        {
          type: 'table',
          headers: HEAD16,
          rows: [
            ['Hand moves', '↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'],
            strokeRow('Straight 16ths', 'DUDUDUDU'),
            strokeRow('Funk strum', 'D-XU-UXU'),
            strokeRow('3-3-2', 'D--D--D-'),
            strokeRow('Push on the "a"', 'D--UD--U')
          ],
          caption: 'Two beats of sixteenths (1 e & a 2 e & a). Repeat for the second half of the bar. x = muted chuck.'
        },
        {
          type: 'audioRow',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'dom7', shape: E7 }],
          items: [
            { label: 'Straight 16ths', play: strumLoop(E7, 'DUDUDUDU', 0.25, 4, 76) },
            { label: 'Funk strum', play: strumLoop(E7, 'D-XU-UXU', 0.25, 4, 76) },
            { label: '3-3-2', play: strumLoop(E7, 'D--D--D-', 0.25, 4, 76) },
            { label: 'Push on the "a"', play: strumLoop(E7, 'D--UD--U', 0.25, 4, 76) }
          ]
        },
        {
          type: 'text',
          md: `### 3-3-2: the most common syncopated sixteenth pattern
Take eight sixteenth slots (two beats) and group them **3 + 3 + 2**: one hit every three slots, then a short one. That is a **dotted eighth, a dotted eighth, an eighth**. Played over a steady foot, the hits drift across the beat and then snap back. It shows up in Latin, funk, rock and pop, and it comes back in Lesson 6 as an odd-meter grouping.

If you count the slots out loud: **1** e & **a** 2 e **&** a, with hits on "1", "a" and "&".`
        },
        {
          ...gridStaff('4/4', 'D--D--D-', 0.25, 2, '3-3-2 in sixteenths: dotted eighth, dotted eighth, eighth, twice per bar.'),
          bpm: 72
        },
        {
          ...gridStaff('4/4', 'D--UD--U', 0.25, 2, 'Push on the "a": dotted eighth + sixteenth, four times per bar.'),
          bpm: 72
        },
        {
          type: 'text',
          md: `### Single-note funk: leave the holes in
Here is a one-bar riff in A minor pentatonic. It uses the open A string, the 3rd fret (C), the open D string and the 2nd fret of the D string (E). Look at how much of the bar is **rests**. The rests are doing as much work as the notes.`
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: 'A one-bar funk riff on the A and D strings. Blank gaps are rests (mute them with your fretting hand).',
          events: RIFF,
          bpm: 88
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Riff', play: seqOf(RIFF.concat(RIFF).concat(RIFF).concat(RIFF), 88) },
            { label: 'Riff, slow (60)', play: seqOf(RIFF.concat(RIFF), 60) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Practise funk **slowly**. Set the metronome to 60 and say "1 e & a 2 e & a" out loud while you play. If you can't say the count and play the riff, the riff isn't yet in your hands. Add ghost notes (a muted pick in the gaps) once the written notes are rock steady.`
        },
        {
          type: 'playIt',
          prompt: 'Play the pitches of the riff in order: A2, C3, D3, E3, A2, C3, E3, D3.',
          targets: ['A2', 'C3', 'D3', 'E3', 'A2', 'C3', 'E3', 'D3'],
          hint: 'The microphone only checks pitch, not timing. First get the notes right, then work on the rhythm with a metronome. Open A, A string 3rd fret, open D, D string 2nd fret.',
          show: [
            { string: 5, fret: 0 },
            { string: 5, fret: 3 },
            { string: 4, fret: 0 },
            { string: 4, fret: 2 }
          ],
          frets: [0, 5]
        },
        {
          type: 'tryIt',
          question: mc('A **dotted eighth** note is how many sixteenth-note slots long?', '3', ['2', '4', '6'], {
            explain: 'An eighth is 2 sixteenths. The dot adds half (1 more): **3 sixteenths**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which pattern is this (two beats repeated)?', '3-3-2', ['Straight sixteenths', 'Push on the "a"'], {
            play: gridRhythm('D--D--D-', 0.25, 4, 76),
            explain: 'The hits are 3, 3, then 2 slots apart: **3-3-2**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'u14l5',
      title: 'Compound meter in depth: 6/8 vs 3/4, and 12/8 blues',
      summary: 'Simple vs compound, the same six eighths felt two ways, hemiola, and the 12/8 slow-blues feel.',
      blocks: [
        {
          type: 'text',
          md: `[[u2l2]] introduced 6/8. Here is the full rule behind it.

- In **simple meter** (2/4, 3/4, 4/4), the beat is a plain note and it splits into **two**.
- In **compound meter** (6/8, 9/8, 12/8), the beat is a **dotted** note and it splits into **three**.

The top number counts eighths; you **divide it by three** to find the number of felt beats.`
        },
        {
          type: 'table',
          headers: ['Meter', 'Felt beats', 'Beat note', 'Beat splits into', 'Type'],
          rows: [
            ['2/4', '2', 'quarter', '2 eighths', 'Simple'],
            ['3/4', '3', 'quarter', '2 eighths', 'Simple'],
            ['4/4', '4', 'quarter', '2 eighths', 'Simple'],
            ['6/8', '2', 'dotted quarter', '3 eighths', 'Compound'],
            ['9/8', '3', 'dotted quarter', '3 eighths', 'Compound'],
            ['12/8', '4', 'dotted quarter', '3 eighths', 'Compound']
          ]
        },
        {
          type: 'text',
          md: `### The same six eighths, felt two ways
3/4 and 6/8 both hold six eighth notes. Only the **accent** changes. In 3/4 you accent every second eighth (3 groups of 2), in 6/8 every third (2 groups of 3). In the examples the **low note is beat 1** and the **mid notes** start the other beats.`
        },
        {
          type: 'audioRow',
          items: [
            { label: '3/4: (1 2)(3 4)(5 6)', play: accentSeq([[2, 2, 2]], 0.5, 140, 4) },
            { label: '6/8: (1 2 3)(4 5 6)', play: accentSeq([[3, 3]], 0.5, 140, 4) }
          ]
        },
        {
          ...staff('3/4', accentSpec([2, 2, 2], '8'), '3/4: three groups of two eighths.', 140),
          bpm: 140
        },
        {
          ...staff('6/8', accentSpec([3, 3], '8'), '6/8: two groups of three eighths.', 140),
          bpm: 140
        },
        {
          type: 'text',
          md: `### Hemiola: when 6/8 turns into 3/4
Because the two feels share the same eighths, you can **switch between them inside a bar**. This trick is called a **hemiola**: two groups of three become three groups of two. Cross-switching 6/8 and 3/4 gives the "I want to dance a little wrong" lilt of Latin and Broadway tunes (the musical *West Side Story* is the textbook case: the song named *America*).

Listen to two bars of 6/8, then two bars of 3/4, with no change in tempo.`
        },
        {
          type: 'audio',
          label: '6/8, 6/8, then 3/4, 3/4 (same eighth note speed)',
          play: accentSeq([[3, 3], [3, 3], [2, 2, 2], [2, 2, 2]], 0.5, 140, 2)
        },
        {
          type: 'text',
          md: `### 12/8: the slow blues
**12/8** is **four** compound beats, each split in three: **1**-la-li **2**-la-li **3**-la-li **4**-la-li. It is the meter of slow blues, doo-wop and 50s rock ballads, where the guitar rolls triplets under the chords.

It sounds exactly like **4/4 with a triplet feel** (Lesson 3). The only difference is on paper: 4/4 with triplets needs a "3" bracket over every beat, while 12/8 just writes plain eighth notes. Players tend to choose 12/8 whenever the triplet feel runs through the whole piece.`
        },
        {
          type: 'tab',
          timeSig: '12/8',
          caption: 'One bar of 12/8: an E7 arpeggio, bass note then strings 3 and 2, four groups of three.',
          toolExamples: [{ kind: 'chord', root: 'E', type: 'dom7', shape: E7 }],
          events: E7_12_8,
          bpm: 96
        },
        {
          type: 'audioRow',
          items: [
            { label: '12/8: four beats of three', play: accentSeq([[3, 3, 3, 3]], 0.5, 130, 3) },
            { label: 'E7 slow-blues arpeggio', play: seqOf(E7_12_8.concat(E7_12_8, E7_12_8), 96) },
            { label: '4/4 triplets (same feel)', play: rhythm(rep([1 / 3], 36), 64, 'E3', 0) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Feeling compound beats: in 6/8 and 12/8 the Metronome in Tools counts the **dotted quarter**, so "60 BPM" is one big beat a second, with the three eighths in between left for you to subdivide.`
        },
        {
          type: 'tryIt',
          question: mc('How many main beats do you feel in a bar of **9/8**?', '3', ['2', '4', '9'], {
            explain: 'Compound meter: 9 eighths ÷ 3 = **3** dotted-quarter beats.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Is this **3/4** or **6/8**?', '6/8', ['3/4'], {
            play: accentSeq([[3, 3]], 0.5, 140, 4),
            explain: 'The accents come every **three** eighths: two big beats, each split in three: **6/8**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'u14l6',
      title: 'Odd meters, changing meters and polyrhythm',
      summary: 'Counting 5/4 and 7/8 as groups of 2 and 3, bars that change length, and playing 3 against 2.',
      blocks: [
        {
          type: 'text',
          md: `Most bars divide into twos and threes: 4/4 is 2+2, 6/8 is 3+3, 3/4 is a 3. **Odd meters** (5, 7, 9, 11…) are bars that don't split in half. You count them by **mixing groups of 2 and 3**. Each group starts with an accent, and the "lopsided" long group gives the bar its limp.

### 5/4: 3+2 or 2+3
Five quarter-note beats can be felt as **3+2** (1 2 3 | 1 2) or **2+3** (1 2 | 1 2 3). Same bar, different swing.`
        },
        {
          type: 'audioRow',
          items: [
            { label: '5/4 as 3+2', play: accentSeq([[3, 2]], 1, 150, 4) },
            { label: '5/4 as 2+3', play: accentSeq([[2, 3]], 1, 150, 4) }
          ]
        },
        {
          ...staff('5/4', accentSpec([3, 2], 'q') + ' ' + accentSpec([2, 3], 'q'), 'Bar 1: 5/4 as 3+2. Bar 2: 5/4 as 2+3. Low note = beat 1, mid note = start of the second group.', 130),
          bpm: 130
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `Famous examples to find and count along with (by name only): **"Take Five"** (Dave Brubeck Quartet) is in 5/4, as is the **"Mission: Impossible"** theme. **"Money"** (Pink Floyd) and **"Solsbury Hill"** (Peter Gabriel) are in 7/4. **"Blue Rondo à la Turk"** (Brubeck again) is a 9/8 counted 2+2+2+3.`
        },
        {
          type: 'text',
          md: `### 7/8: three groups
Seven eighth notes are usually felt as **three groups**: two groups of 2 and one of 3, in any order.

- **2+2+3**: ONE-two ONE-two ONE-two-three
- **3+2+2**: ONE-two-three ONE-two ONE-two
- **2+3+2**: ONE-two ONE-two-three ONE-two

Which one you hear depends on where the **long group** sits. Listen to all three over the same seven eighths.`
        },
        {
          type: 'audioRow',
          items: [
            { label: '7/8 as 2+2+3', play: accentSeq([[2, 2, 3]], 0.5, 160, 4) },
            { label: '7/8 as 3+2+2', play: accentSeq([[3, 2, 2]], 0.5, 160, 4) },
            { label: '7/8 as 2+3+2', play: accentSeq([[2, 3, 2]], 0.5, 160, 4) }
          ]
        },
        {
          ...staff('7/8', accentSpec([2, 2, 3], '8') + ' ' + accentSpec([3, 2, 2], '8') + ' ' + accentSpec([2, 3, 2], '8'), 'Three bars of 7/8: 2+2+3, then 3+2+2, then 2+3+2. The lower the note, the stronger the accent.', 150),
          bpm: 150
        },
        {
          type: 'tab',
          timeSig: '7/8',
          caption: 'A 2+2+3 riff: a power chord starts each group, the open G string fills in. Two bars of 7/8.',
          events: groupEvents([2, 2, 3], 0.5).concat(groupEvents([2, 2, 3], 0.5)),
          bpm: 150
        },
        {
          type: 'audioRow',
          items: [
            { label: '2+2+3 riff', play: seqOf(groupEvents([2, 2, 3], 0.5).concat(groupEvents([2, 2, 3], 0.5), groupEvents([2, 2, 3], 0.5), groupEvents([2, 2, 3], 0.5)), 150) },
            { label: '3+2+2 riff', play: seqOf(groupEvents([3, 2, 2], 0.5).concat(groupEvents([3, 2, 2], 0.5), groupEvents([3, 2, 2], 0.5), groupEvents([3, 2, 2], 0.5)), 150) }
          ]
        },
        {
          type: 'text',
          md: `Notice the 3-3-2 pattern from the funk lesson: it is **8/8 grouped 3+3+2**, an eight-slot bar that feels odd without leaving 4/4.

### Changing meters
Some music **changes the bar length** from bar to bar. Common cases are **4/4 then 3/4** (7 beats in all, counted 1 2 3 4 | 1 2 3), a single **2/4** bar dropped in as a pause, or **6/8 alternating with 3/4** (the hemiola). The beat speed stays the same: only the count restarts. The staves below show each meter separately, since a notation staff here holds one time signature.`
        },
        {
          type: 'audio',
          label: '4/4, 3/4, 4/4, 3/4 (the beat stays constant)',
          play: accentSeq([[4], [3]], 1, 130, 3)
        },
        {
          ...staff('4/4', accentSpec([4], 'q'), 'A bar of 4/4: count 1 2 3 4.', 130),
          bpm: 130
        },
        {
          ...staff('3/4', accentSpec([3], 'q'), 'Then a bar of 3/4: count 1 2 3. The pulse never changes.', 130),
          bpm: 130
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `When you practise a changing-meter part, **count the bars out loud first** ("1 2 3 4, 1 2 3, 1 2 3 4, 1 2 3"), then add the guitar. Don't try to "feel" the pattern before you can count it.`
        },
        {
          type: 'text',
          md: `### Polyrhythm: 3 against 2
A **polyrhythm** layers two different groupings over the same span. The simplest is **3 against 2**: one line plays 2 even notes, another plays 3 even notes, and both fit into the same two beats.

They only coincide on the **first note** of each cycle. A useful phrase is **"Not dif-fi-cult"**:
- **Not**: both lines sound.
- **dif**: only the 3-line.
- **fi**: only the 2-line.
- **cult**: only the 3-line.

On guitar you can split it between a **bass-note thumb** (the 2) and **fingers on the top strings** (the 3), or tap one against the other on your leg first.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'The 2-line (low E)', play: rhythm(rep([1], 8), 80, 'E2', 0) },
            { label: 'The 3-line (high E)', play: rhythm(rep([2 / 3], 12), 80, 'E4', 0) },
            { label: '3 against 2 together', play: seqOf(rep(POLY, 4), 80) }
          ]
        },
        {
          type: 'tab',
          timeSig: '4/4',
          caption: '3 against 2 for two beats, repeated: low E and high E together on the downbeat, then "dif", "fi", "cult".',
          events: POLY.concat(POLY),
          bpm: 80
        },
        {
          type: 'tryIt',
          question: mc('Listen. Is this 5/4 grouped **3+2** or **2+3**?', '3+2', ['2+3'], {
            play: accentSeq([[3, 2]], 1, 150, 4),
            explain: 'The mid accent comes on beat **4**, after a group of three, so it is 1 2 3 | 1 2: **3+2**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('How many eighth-note beats are in a bar of 7/8?', '7', ['3½', '6', '8'], {
            explain: 'The top number counts eighths: **7**. A bar of 7/8 lasts the same as 3½ quarter notes.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('**Syncopation** is…', 'stressing weak parts of the beat', ['playing twice as fast as the beat', 'striking every strong beat evenly', 'changing the tempo of each bar'], {
        explain: 'The pulse stays steady, but the notes lean away from the strong beats.'
      }),
      mc('In D-DU-UDU, which count has the **upstroke that rings across the missed downstroke on beat 3**?', '2&', ['1&', '3&', '4&'], {
        explain: 'D (1) – D (2) U (**2&**) – U (3&) D (4) U (4&). The 2& stroke rings across the missed beat 3.'
      }),
      mc('An **eighth-note anticipation** (push) arrives…', 'on the preceding off-beat', ['on the following off-beat', 'exactly on the strong beat', 'one complete bar earlier'], {
        explain: 'The note or chord is pulled forward half a beat and held through the beat it belongs to.'
      }),
      mc('Listen (four clicks, then two bars). Which counts have note attacks?', '1, 2& and 4', ['1, 2, 3 and 4', '1&, 2&, 3& and 4&', '1, 1&, 2 and 2&'], {
        play: gridRhythm(SYNC, 0.5, 2, 84),
        explain: 'Notes on 1, 2& and 4, with the 2& note held through beat 3: **q, 8r, qd, q**.'
      }),
      mc('A **chuck** in strumming is…', 'a short muted strike', ['a ringing harmonic', 'a full ringing downstroke', 'a bend before the attack'], {
        explain: 'You strike while the strings are damped, so the hit is a timing event and not a chord.'
      }),
      mc('A **ghost stroke** is…', 'a faint brush of the strings', ['a loud strike on the off-beat', 'a ringing strummed harmonic', 'a pause of two full beats'], {
        explain: 'The hand swings through, but you hear it only faintly. It keeps the motion going.'
      }),
      mc('How is a **reggae skank** played?', 'Short chords on the off-beats', ['Full chords on every strong beat', 'Long chords across entire bars', 'Fast gallops on sixteenth notes'], {
        explain: 'The beat is silent; the "&"s carry the chords.'
      }),
      { kind: 'text', prompt: 'How many **eighth-note triplets** fit in one beat?', accept: ['3', 'three'], explain: 'A triplet divides the beat into **3** equal parts.' },
      mc('How long is one **quarter-note triplet**?', '2/3 of a beat', ['1/3 of a beat', '1½ beats', '1 beat'], {
        explain: 'Three of them fill two beats: 2 ÷ 3 = **2/3**.'
      }),
      mc('Swung eighth notes are played…', 'in long-short pairs', ['in short-long pairs', 'in equal-length pairs', 'in three equal parts'], {
        explain: 'Swing is a 2:1 long-short pairing of each beat.'
      }),
      mc('Listen. Are these eighths **straight or swung**?', 'Swung', ['Straight'], {
        play: rhythm(SWUNG8, 84),
        explain: 'The first note of each pair is longer: a long-short, **swung** feel.'
      }),
      mc('Listen. Are these eighths **straight or swung**?', 'Straight', ['Swung'], {
        play: rhythm(STRAIGHT8, 84),
        explain: 'The notes are evenly spaced: **straight** eighths.'
      }),
      mc('In this E shuffle, which shape sounds on the long part, then the short part of each beat?', 'E5 then E6', ['E6 then E5', 'E7 then A7', 'E5 then B5'], {
        explain: 'The "5–6" pattern: power chord, then the sixth, in a long-short rhythm.'
      }),
      { kind: 'text', prompt: 'How many **sixteenth notes** are in a dotted eighth note?', accept: ['3', 'three'], explain: 'An eighth is 2 sixteenths; the dot adds half of that (1): **3**.' },
      mc('Which grid is the **3-3-2** pattern (eight sixteenth slots)?', 'D--D--D-', ['D-D-D-D-', 'DUDUDUDU', 'D---D---'], {
        explain: 'Hits every 3 slots, then 3, then 2: D-- D-- D-.'
      }),
      mc('Which time signature is **compound**?', '9/8', ['3/4', '5/4', '2/4'], {
        explain: 'In 9/8 the beat is a dotted quarter divided in three: **compound**.'
      }),
      mc('How many main beats are felt in one bar of **12/8**?', '4', ['2', '6', '12'], {
        explain: '12 eighths ÷ 3 = **4** dotted-quarter beats.'
      }),
      mc('How is **12/8** usually felt?', 'Four beats, each divided in three', ['Three beats, each divided in four', 'Six beats, each divided in two', 'Two beats, each divided in six'], {
        explain: 'Four beats, each in three: the same sound as 4/4 triplets.'
      }),
      mc('Listen. Which time signature fits this accompaniment?', '6/8', ['3/4', '4/4'], {
        play: accentSeq([[3, 3]], 0.5, 140, 4),
        explain: 'Accents come every **three** eighths, two per bar: **6/8**.'
      }),
      mc('Listen. How is this 7/8 bar grouped?', '2+2+3', ['3+2+2', '2+3+2', '4+3'], {
        play: accentSeq([[2, 2, 3]], 0.5, 160, 4),
        explain: 'The mid accents fall after two and after four eighths: **2+2+3**, with the long group last.'
      }),
      mc('Listen. How is this 5/4 bar grouped?', '2+3', ['3+2', '4+1'], {
        play: accentSeq([[2, 3]], 1, 150, 4),
        explain: 'The second accent comes on beat 3, after a group of two: **2+3**.'
      }),
      mc('In 7/8 grouped **3+2+2**, which eighths carry the accents?', '1, 4 and 6', ['1, 3 and 5', '1, 3 and 6', '1, 4 and 7'], {
        explain: 'Groups of 3, 2, 2 start on eighth 1, 4 (1+3) and 6 (4+2).'
      }),
      mc('How many eighth notes fill a bar of 7/8?', '7', ['6', '8', '3½'], {
        visual: staff('7/8', accentSpec([2, 2, 3], '8')),
        explain: 'The top number counts eighth notes: **7** (here 2 + 2 + 3).'
      }),
      mc('A bar of 4/4 followed by a bar of 3/4 contains how many quarter-note beats in all?', '7', ['6', '8', '12'], {
        explain: '4 + 3 = **7** beats. The pulse is unchanged; only the count restarts.'
      }),
      mc('"3 against 2" means…', 'Three notes against two in the same span', ['Three notes followed by two in a new span', 'Three bars alternating with two bars', 'Three notes lasting twice as long as two'], {
        explain: 'Two lines, 3 and 2 notes, both lasting the same time. They coincide only on the first note.'
      }),
      mc('In 3 against 2, when do both lines sound together?', 'At the start of each cycle', ['On every note in the cycle', 'On the last note of each cycle', 'At no point in the cycle'], {
        explain: 'Both start on the first note ("Not"), then the lines interleave (dif – fi – cult).'
      })
    ],
    generators: [beatsInBarQ, feelQ, syncCountQ, tripletMathQ, groupingQ, meterFeelQ]
  }
}

export default unit
