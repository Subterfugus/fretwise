import type { PlaySpec, QuizQuestion, Unit } from '../types'
import { chordToneMarks, mc, rand, randInt, scaleMarks, shuffle } from '../helpers'
import { ChordShape, movableChord, OPEN_CHORDS, shape, shapeMidis } from '@/theory/guitar'
import { chordNames, chordSymbol, ChordType, diatonicChords } from '@/theory/chords'
import { transpose } from '@/theory/intervals'
import { mod, noteName, pitchClass, pretty } from '@/theory/notes'
import type { SeqEvent } from '@/audio/engine'
import { progressionExample } from '../toolExamples'
import type { ScaleType } from '@/theory/scales'

// ---------- chords from Roman-numeral tokens ----------

const lowestFret = (s: ChordShape) => Math.min(...s.frets.filter((f): f is number => f !== null))

/** A practical guitar voicing: the open chord if there is one, else the lowest E- or A-shape barre. */
function guitarChord(root: string, type: ChordType): ChordShape {
  const sym = chordSymbol(root, type)
  if (OPEN_CHORDS[sym]) return OPEN_CHORDS[sym]
  const cands = [movableChord(root, type, 6), movableChord(root, type, 5)].filter((x): x is ChordShape => x !== null)
  return cands.sort((a, b) => lowestFret(a) - lowestFret(b))[0]
}

/** Roman-numeral tokens used in section maps: interval above the key's tonic + chord quality. */
const TOK: Record<string, { iv: string; type: ChordType }> = {
  I: { iv: 'P1', type: 'maj' },
  ii: { iv: 'M2', type: 'min' },
  iii: { iv: 'M3', type: 'min' },
  IV: { iv: 'P4', type: 'maj' },
  V: { iv: 'P5', type: 'maj' },
  vi: { iv: 'M6', type: 'min' },
  I7: { iv: 'P1', type: 'dom7' },
  IV7: { iv: 'P4', type: 'dom7' },
  V7: { iv: 'P5', type: 'dom7' },
  II7: { iv: 'M2', type: 'dom7' },
  III7: { iv: 'M3', type: 'dom7' },
  VI7: { iv: 'M6', type: 'dom7' },
  bIII: { iv: 'm3', type: 'maj' },
  iv: { iv: 'P4', type: 'min' },
  bVI: { iv: 'm6', type: 'maj' },
  bVII: { iv: 'm7', type: 'maj' }
}

const rn = (t: string) => t.replace(/^b/, '♭')

function chordOf(key: string, token: string) {
  const d = TOK[token]
  const root = noteName(transpose(key, d.iv))
  const symbol = pretty(chordSymbol(root, d.type))
  return { root, type: d.type, symbol, shape: { ...guitarChord(root, d.type), name: symbol } }
}

const syms = (key: string, toks: string[]) => toks.map((t) => chordOf(key, t).symbol).join(' – ')
const romans = (toks: string[]) => toks.map(rn).join(' – ')
const b = (s: string) => s.split(' ')

// ---------- sketches (sequence PlaySpecs) ----------

type Seq = Extract<PlaySpec, { kind: 'sequence' }>
/** arp = arpeggiated (quiet), strum1/2/4 = 1, 2 or 4 strums per bar (more energy). One chord per bar. */
type Style = 'arp' | 'strum1' | 'strum2' | 'strum4'

function playBars(key: string, toks: string[], style: Style, bpm: number, scale: ScaleType = 'major'): Seq {
  const events: SeqEvent[] = []
  for (const t of toks) {
    const notes = shapeMidis(chordOf(key, t).shape)
    if (style === 'arp') events.push({ notes, beats: 4, mode: 'arpeggio' })
    else {
      const hits = style === 'strum1' ? 1 : style === 'strum2' ? 2 : 4
      for (let i = 0; i < hits; i++) events.push({ notes, beats: 4 / hits, mode: 'strum' })
    }
  }
  return { kind: 'sequence', bpm, events, toolExample: progressionExample(key, toks, scale, bpm, 4) }
}

const join = (...ps: Seq[]): Seq => {
  const contexts = ps.map((p) => p.toolExample)
  const first = contexts[0]
  const sameKey = first?.kind === 'progression' && contexts.every((c) => c?.kind === 'progression' && c.root === first.root && c.scale === first.scale)
  return {
    kind: 'sequence', bpm: ps[0].bpm, events: ps.flatMap((p) => p.events),
    ...(sameKey ? { toolExample: progressionExample(first.root, contexts.flatMap((c) => c?.kind === 'progression' ? c.romans : []), first.scale, ps[0].bpm, 4) } : {})
  }
}

/** Chords sounding with a capo: every string is raised by `fret` semitones. */
function capoSeq(shapes: ChordShape[], fret: number, soundingKey: string, toks: string[], bpm = 90, beats = 3): Seq {
  return { kind: 'sequence', bpm, events: shapes.map((s) => ({ notes: shapeMidis(s).map((n) => n + fret), beats, mode: 'strum' as const })), toolExample: progressionExample(soundingKey, toks, 'major', bpm, beats) }
}

// ---------- the forms (one data source for tables AND audio) ----------

interface Sec {
  name: string
  bars: string[]
}

function formRows(key: string, layout: Sec[]): string[][] {
  let start = 1
  return layout.map((sec) => {
    const end = start + sec.bars.length - 1
    const row = [start === end ? `${start}` : `${start}–${end}`, sec.name, sec.bars.map(rn).join(' | '), sec.bars.map((t) => chordOf(key, t).symbol).join(' | ')]
    start = end + 1
    return row
  })
}

const formExamples = (key: string, layout: Sec[], scale: ScaleType = 'major') =>
  layout.filter((sec, i) => layout.findIndex((s) => s.bars === sec.bars) === i)
    .map((sec) => ({ ...progressionExample(key, sec.bars, scale), label: sec.name }))

// Verse / chorus (key of G)
const VC_KEY = 'G'
const VC_INTRO = b('vi IV I V')
const VC_VERSE = b('vi IV I V vi IV I V')
const VC_CHORUS = b('I V vi IV I V IV I')
const VC_BRIDGE = b('IV V iii vi IV V vi V')
const VC_OUTRO = b('I V IV I')
const VC_LAYOUT: Sec[] = [
  { name: 'Intro', bars: VC_INTRO },
  { name: 'Verse 1', bars: VC_VERSE },
  { name: 'Chorus', bars: VC_CHORUS },
  { name: 'Verse 2', bars: VC_VERSE },
  { name: 'Chorus', bars: VC_CHORUS },
  { name: 'Bridge', bars: VC_BRIDGE },
  { name: 'Chorus', bars: VC_CHORUS },
  { name: 'Outro', bars: VC_OUTRO }
]

// AABA 32-bar (key of C)
const AABA_KEY = 'C'
const AABA_A = b('I vi ii V I vi ii V')
const AABA_B = b('III7 III7 VI7 VI7 II7 II7 V7 V7')
const AABA_A3 = b('I vi ii V I vi V I')
const AABA_LAYOUT: Sec[] = [
  { name: 'A (1st)', bars: AABA_A },
  { name: 'A (2nd)', bars: AABA_A },
  { name: 'B (bridge)', bars: AABA_B },
  { name: 'A (last, ends home)', bars: AABA_A3 }
]

// 12-bar blues (key of A)
const BLUES_KEY = 'A'
const BLUES_L1 = b('I7 I7 I7 I7')
const BLUES_L2 = b('IV7 IV7 I7 I7')
const BLUES_L3 = b('V7 IV7 I7 V7')
const BLUES_LAYOUT: Sec[] = [
  { name: 'Line 1', bars: BLUES_L1 },
  { name: 'Line 2', bars: BLUES_L2 },
  { name: 'Line 3 (turnaround)', bars: BLUES_L3 }
]

// Strophic (key of G)
const STR_KEY = 'G'
const STR_VERSE = b('I I IV I I IV V I')
const STR_LAYOUT: Sec[] = [
  { name: 'Verse 1', bars: STR_VERSE },
  { name: 'Verse 2', bars: STR_VERSE },
  { name: 'Verse 3', bars: STR_VERSE },
  { name: 'Verse 4', bars: STR_VERSE }
]

// Verse / pre-chorus / chorus / bridge (key of G)
const PC_KEY = 'G'
const PC_INTRO = b('I V IV I')
const PC_VERSE = b('I iii IV I I iii IV V')
const PC_PRE = b('ii IV V V')
const PC_CHORUS = b('I V vi IV I V IV I')
const PC_BRIDGE = b('IV bVII IV V')
const PC_TAG = b('IV I')
const PC_LAYOUT: Sec[] = [
  { name: 'Intro', bars: PC_INTRO },
  { name: 'Verse 1', bars: PC_VERSE },
  { name: 'Pre-chorus', bars: PC_PRE },
  { name: 'Chorus', bars: PC_CHORUS },
  { name: 'Verse 2', bars: PC_VERSE },
  { name: 'Pre-chorus', bars: PC_PRE },
  { name: 'Chorus', bars: PC_CHORUS },
  { name: 'Bridge', bars: PC_BRIDGE },
  { name: 'Chorus', bars: PC_CHORUS },
  { name: 'Tag', bars: PC_TAG }
]

// ---------- melodies (original, written pitch; guitar sounds an octave lower) ----------

const N = (k: string, d: string) => ({ keys: [k], duration: d })
const REST_Q = { keys: ['B/4'], duration: 'qr' }

// 4 bars over C | Am | F | G (chord tones on the strong beats)
const MELODY_TONES = [
  N('E/4', 'q'), N('G/4', 'q'), N('E/4', 'q'), N('D/4', 'q'),
  N('C/5', 'q'), N('B/4', '8'), N('A/4', '8'), N('C/5', 'h'),
  N('A/4', 'q'), N('C/5', 'q'), N('A/4', 'q'), N('G/4', 'q'),
  N('D/5', 'q'), N('B/4', 'q'), N('G/4', 'h')
]

// 4 bars over C | C | F | G (a one-bar motif, repeated, then varied)
const MELODY_MOTIF = [
  N('E/4', '8'), N('G/4', '8'), N('G/4', 'q'), N('E/4', '8'), N('D/4', '8'), N('C/4', 'q'),
  N('E/4', '8'), N('G/4', '8'), N('G/4', 'q'), N('E/4', '8'), N('D/4', '8'), N('C/4', 'q'),
  N('A/4', '8'), N('C/5', '8'), N('C/5', 'q'), N('A/4', '8'), N('G/4', '8'), N('F/4', 'q'),
  N('D/5', '8'), N('B/4', '8'), N('B/4', 'q'), N('G/4', '8'), N('A/4', '8'), N('B/4', 'q')
]

// 4 bars over C | G | F | C (call, then response that resolves)
const MELODY_CALL = [
  N('E/4', 'q'), N('G/4', 'q'), N('G/4', '8'), N('A/4', '8'), N('G/4', 'q'),
  N('B/4', 'q'), N('A/4', 'q'), N('B/4', 'h'),
  N('C/5', 'q'), N('A/4', 'q'), N('A/4', '8'), N('G/4', '8'), N('F/4', 'q'),
  N('E/4', 'q'), N('D/4', 'q'), N('C/4', 'h')
]

// 8-bar verse in G over Em | C | G | D | Em | C | G | D
const VERSE_P1 = [
  N('B/4', 'q'), N('B/4', '8'), N('A/4', '8'), N('G/4', 'q'), N('E/4', 'q'),
  N('E/4', 'q'), N('G/4', 'q'), N('C/5', 'q'), N('B/4', '8'), N('A/4', '8'),
  N('G/4', 'q'), N('B/4', 'q'), N('D/5', 'h'),
  N('A/4', 'q'), N('F#/4', 'q'), N('D/4', 'q'), REST_Q
]
const VERSE_P2 = [
  N('B/4', 'q'), N('B/4', '8'), N('A/4', '8'), N('G/4', 'q'), N('B/4', 'q'),
  N('E/4', 'q'), N('G/4', 'q'), N('C/5', 'q'), N('D/5', '8'), N('C/5', '8'),
  N('G/4', 'q'), N('B/4', 'q'), N('D/5', 'q'), N('B/4', 'q'),
  N('A/4', 'h'), N('F#/4', 'q'), N('A/4', 'q')
]
const VERSE_TOKS = b('vi IV I V vi IV I V') // Em C G D Em C G D in G

// ---------- shapes for lessons ----------

const shp = (key: string, tok: string) => chordOf(key, tok).shape
const G_OPEN = OPEN_CHORDS.G
const G_BARRE = movableChord('G', 'maj', 6)!
const G_TRIAD = shape('G (3 strings)', 'xx543x')

// ---------- generators ----------

const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb']

const aabaMath = (): QuizQuestion => {
  const n = rand([4, 6, 8, 10, 12])
  const kind = rand(['total', 'bridge', 'lastA'] as const)
  if (kind === 'total')
    return mc(`A song is in AABA form and each section is **${n} bars** long. How many bars is one full chorus of the tune?`, `${4 * n}`, [`${3 * n}`, `${5 * n}`, `${2 * n}`], {
      explain: `AABA has four sections (A, A, B, A) of ${n} bars each: 4 × ${n} = **${4 * n}**.`
    })
  if (kind === 'bridge')
    return mc(`An AABA song has **${n}-bar** sections. On which bar does the **bridge** (B) start?`, `${2 * n + 1}`, [`${2 * n}`, `${n + 1}`, `${3 * n + 1}`], {
      explain: `Two A sections come first (2 × ${n} = ${2 * n} bars), so the bridge starts on bar **${2 * n + 1}**.`
    })
  return mc(`An AABA song has **${n}-bar** sections. On which bar does the **last A** start?`, `${3 * n + 1}`, [`${3 * n}`, `${2 * n + 1}`, `${4 * n + 1}`], {
    explain: `A, A and B fill 3 × ${n} = ${3 * n} bars, so the final A starts on bar **${3 * n + 1}**.`
  })
}

const chordToneBeatOne = (): QuizQuestion => {
  const key = rand(KEYS)
  const dc = diatonicChords(key).slice(0, 6) // skip vii°
  const c = rand(dc)
  const tones = chordNames(c.root, c.type)
  const scale = diatonicChords(key).map((x) => x.root)
  const outside = scale.filter((x) => !tones.includes(x))
  if (Math.random() < 0.5) {
    const correct = rand(tones)
    return mc(`A melody sits over **${c.symbol}** (${c.roman} in ${key} major). Which note is a **chord tone**, safe to land on at beat 1?`, correct, shuffle(outside).slice(0, 3), {
      explain: `${c.symbol} is **${tones.join(' – ')}**. The other notes of ${key} major (${outside.join(', ')}) are scale notes but not chord tones, so they make better passing notes on weak beats.`
    })
  }
  const correct = rand(outside)
  return mc(`Over **${c.symbol}** in the key of ${key}, which of these melody notes is a **passing tone** (in the key, but not a chord tone)?`, correct, tones, {
    explain: `${c.symbol} is built from **${tones.join(' – ')}**. **${correct}** belongs to ${key} major but not to the chord, so use it on a weak beat and move on by step.`
  })
}

const SECTION_PROGS: { sec: string; toks: string[] }[] = [
  { sec: 'chorus', toks: b('I V vi IV') },
  { sec: 'verse', toks: b('vi IV I V') },
  { sec: 'pre-chorus', toks: b('ii IV V V') },
  { sec: 'bridge', toks: b('IV bVII IV V') },
  { sec: 'chorus', toks: b('I bVII IV I') },
  { sec: 'verse', toks: b('I iii IV V') }
]

const romanToSection = (): QuizQuestion => {
  const key = rand(KEYS)
  const p = rand(SECTION_PROGS)
  const answer = syms(key, p.toks)
  const wrongKeys = shuffle(KEYS.filter((k) => k !== key)).slice(0, 3)
  return mc(`A section map says the **${p.sec}** is **${romans(p.toks)}**. Which chords is that in the key of **${key}**?`, answer, wrongKeys.map((k) => syms(k, p.toks)), {
    play: playBars(key, p.toks, 'strum1', 96),
    explain: `In ${key} major: ${p.toks.map((t) => `${rn(t)} = ${chordOf(key, t).symbol}`).join(', ')}. So the ${p.sec} is **${answer}**.`
  })
}

const FORM_NAMES = ['Verse / chorus', 'AABA (32-bar)', '12-bar blues', 'Strophic', 'Verse / pre-chorus / chorus / bridge']

const identifyForm = (): QuizQuestion => {
  type Row = [string, number, string]
  const k = randInt(0, 4)
  let secs: Row[]
  let why: string
  if (k === 0) {
    const v = rand([8, 16])
    secs = [
      ['Verse', v, 'vi IV I V'],
      ['Chorus', 8, 'I V vi IV'],
      ['Verse', v, 'vi IV I V'],
      ['Chorus', 8, 'I V vi IV'],
      ['Bridge', 8, 'IV V iii vi'],
      ['Chorus', 8, 'I V vi IV']
    ]
    why = 'Verses alternate with a repeating chorus, plus a bridge, and there is no pre-chorus.'
  } else if (k === 1) {
    const n = rand([4, 8])
    secs = [
      ['A', n, 'I vi ii V'],
      ['A', n, 'I vi ii V'],
      ['B', n, 'new chords (III7 VI7 II7 V7)'],
      ['A', n, 'I vi ii V']
    ]
    why = `Four equal sections in the order A A B A: **AABA**, ${4 * n} bars in all.`
  } else if (k === 2) {
    secs = [
      ['Line 1', 4, 'I7 I7 I7 I7'],
      ['Line 2', 4, 'IV7 IV7 I7 I7'],
      ['Line 3', 4, 'V7 IV7 I7 V7']
    ]
    why = 'Twelve bars in three four-bar lines, built from I7, IV7 and V7: the **12-bar blues**.'
  } else if (k === 3) {
    const n = rand([8, 12, 16])
    secs = [
      ['Verse 1', n, 'same music'],
      ['Verse 2', n, 'same music'],
      ['Verse 3', n, 'same music']
    ]
    why = 'The same music repeats for every verse, with no chorus or bridge: **strophic**.'
  } else {
    secs = [
      ['Verse', 8, 'I iii IV V'],
      ['Pre-chorus', 4, 'ii IV V V'],
      ['Chorus', 8, 'I V vi IV'],
      ['Verse', 8, 'I iii IV V'],
      ['Pre-chorus', 4, 'ii IV V V'],
      ['Chorus', 8, 'I V vi IV'],
      ['Bridge', 4, 'IV bVII IV V']
    ]
    why = 'The short pre-chorus between each verse and chorus, plus a bridge, makes this **verse / pre-chorus / chorus / bridge**.'
  }
  let start = 1
  const rows = secs.map(([name, n, h]) => {
    const r = [`${start}–${start + n - 1}`, name, h.replace(/\bb(?=[IV])/g, '♭')]
    start += n
    return r
  })
  return mc('Which form does this bar map show?', FORM_NAMES[k], FORM_NAMES.filter((x) => x !== FORM_NAMES[k]), {
    visual: { type: 'table', headers: ['Bars', 'Section', 'Harmony'], rows },
    explain: why
  })
}

const listenVerseChorus = (): QuizQuestion => {
  const key = rand(['C', 'G', 'D', 'A', 'E'])
  const chorus = Math.random() < 0.5
  const toks = chorus ? b('I V vi IV') : b('vi IV I V')
  return mc('Listen. Judging by energy and texture, is this a **verse** or a **chorus**?', chorus ? 'Chorus' : 'Verse', [chorus ? 'Verse' : 'Chorus'], {
    play: chorus ? playBars(key, toks, 'strum4', 116) : playBars(key, toks, 'arp', 84),
    explain: chorus
      ? 'Four driving strums per bar at a higher tempo and a brighter, I-based progression: the energy of a **chorus**.'
      : 'Quiet arpeggios, a slower pace and a progression that starts on the minor vi: a calmer **verse**.'
  })
}

const cadenceStrength = (): QuizQuestion => {
  const key = rand(KEYS)
  const strong = Math.random() < 0.5
  const toks = strong ? rand([b('I IV V I'), b('I vi IV I')]) : rand([b('I vi ii V'), b('I IV ii V')])
  return mc('Listen. Does this phrase end on a **strong** or a **weak** cadence?', strong ? 'Strong (finished)' : 'Weak (unfinished)', [
    strong ? 'Weak (unfinished)' : 'Strong (finished)'
  ], {
    play: playBars(key, toks, 'strum2', 92),
    explain: `The chords were **${syms(key, toks)}** (${romans(toks)}). ${strong ? 'It ends on I, so the phrase feels complete: good for the end of a chorus.' : 'It ends on V, which asks a question: good for the end of a verse that leads into a chorus.'}`
  })
}

// ---------- capo table ----------

const CAPO_SHAPES = ['G', 'C', 'D', 'E']
const CAPO_TARGETS = ['A', 'Bb', 'B', 'C', 'D', 'E']
const capoCell = (shapeKey: string, target: string) => {
  const n = mod(pitchClass(target) - pitchClass(shapeKey), 12)
  return n === 0 ? 'no capo' : n > 7 ? 'too high' : `capo ${n}`
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u17',
  number: 17,
  title: 'Song form and songwriting',
  summary:
    'How songs are built from sections, the common forms with bar-by-bar maps, writing progressions and melodies on purpose, guitar riffs and hooks, arranging with capo and texture, and a workflow to finish a song.',
  elective: true,
  requires: ['u7'],
  lessons: [
    // ------------------------------------------------------------------
    {
      id: 'u17l1',
      title: 'Sections and their jobs',
      summary: 'Intro, verse, pre-chorus, chorus, bridge, solo, outro and tag: what each is for.',
      blocks: [
        {
          type: 'text',
          md: `A song is not one long stream of chords. It is a set of **sections**, and each section has a **job**. Listeners rarely know the words for them, but they feel the jobs: "now the story", "now the big part", "now something different".

In [[u7l1]] you learned the chords of a key and what they do. Now you will use them to shape a whole song. The main sections are:

- **Intro**: sets the key, the tempo and the groove, and often plants the hook.
- **Verse**: tells the story. The music repeats while the words change.
- **Pre-chorus**: a short build that leans into the chorus.
- **Chorus**: the main message, the hook, the part people sing back. The words usually stay the same each time.
- **Bridge**: a contrast, usually once, late in the song.
- **Solo / instrumental**: the guitar (or another instrument) takes the melody.
- **Outro**: winds the song down.
- **Tag / turnaround**: a one- or two-bar phrase that ends a section or sends it round again.`
        },
        {
          type: 'table',
          headers: ['Section', 'Its job', 'Typical harmony', 'Energy'],
          rows: [
            ['Intro', 'Set key, groove and hook', 'The verse or chorus chords, or a riff on I', 'low to medium'],
            ['Verse', 'Tell the story; stay steady', 'Stable and often cyclic; may start on vi or I', 'low'],
            ['Pre-chorus', 'Build and point at the chorus', 'Starts on ii or IV, ends on V (a half cadence)', 'rising'],
            ['Chorus', 'Deliver the hook and the main message', 'Strong I; clear V → I or IV → I endings', 'highest'],
            ['Bridge', 'Give contrast and a new angle', 'Starts away from I (IV, vi, ♭VII); often ends on V', 'varies'],
            ['Solo', 'Showcase an instrument', 'Usually the verse or chorus chords', 'high'],
            ['Outro', 'Wind down or fade out', 'Repeats the chorus or a tag; ends on I', 'falling'],
            ['Tag / turnaround', 'Close a section or loop back', 'V → I, or I → IV → I; a V chord to loop', 'low']
          ],
          caption: 'The jobs of the common sections. Real songs bend every one of these rules.'
        },
        {
          type: 'text',
          md: `### Hearing the sections
Here are four sections in G (the same ones you will see in the full form map in the next lesson). Each plays four bars, one chord per bar. Notice how the **texture** changes as well as the chords: the verse is fingerpicked, the pre-chorus strums twice per bar, the chorus strums four times per bar.`
        },
        {
          type: 'audioRow',
          items: [
            { label: `Verse: ${syms(PC_KEY, PC_VERSE.slice(0, 4))}`, play: playBars(PC_KEY, PC_VERSE.slice(0, 4), 'arp', 84) },
            { label: `Pre-chorus: ${syms(PC_KEY, PC_PRE)}`, play: playBars(PC_KEY, PC_PRE, 'strum2', 100) },
            { label: `Chorus: ${syms(PC_KEY, PC_CHORUS.slice(0, 4))}`, play: playBars(PC_KEY, PC_CHORUS.slice(0, 4), 'strum4', 116) },
            { label: `Bridge: ${syms(PC_KEY, PC_BRIDGE)}`, play: playBars(PC_KEY, PC_BRIDGE, 'strum2', 100) }
          ]
        },
        {
          type: 'chords',
          shapes: [...new Set([...PC_VERSE, ...PC_PRE, ...PC_CHORUS, ...PC_BRIDGE])].map((t) => shp(PC_KEY, t)),
          caption: 'Every chord used by the four sections above, in G: I, iii, IV, V, ii, vi and ♭VII.'
        },
        {
          type: 'text',
          md: `### How energy moves between sections
A song feels like it is going somewhere because the energy **changes in steps**. You have five levers, and none of them needs a new chord:

1. **Rhythm density**: fingerpicking → two strums per bar → four strums per bar.
2. **Register**: voicings and melody notes sit higher in the chorus than in the verse.
3. **Volume**: soft verse, loud chorus. Use the pre-chorus to climb.
4. **Harmonic rhythm**: how often the chord changes. Changing chord every half bar in the pre-chorus makes it feel like it is rushing forward.
5. **Layers**: a second guitar, bass, drums or harmonies come in as the song builds.

Harmony helps in a second way. The verse often **avoids a strong landing on I** (it starts on vi, or ends on V) so the chorus can deliver **I** with weight.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Map a song you know.** Put on a favourite song and write down the sections with their timings: intro, verse, chorus, and so on. Count the bars of each (most are 4, 8 or 16). You will be surprised how regular the pattern is, and this is the skill you need to write your own.`
        },
        {
          type: 'tryIt',
          question: mc('What is the main job of a **pre-chorus**?', 'Build toward the chorus', ['Repeat the verse melody', 'Introduce the guitar solo', 'Bring the song to a close'], {
            explain: 'The pre-chorus is a short build, usually rising in energy and often ending on **V** so the chorus lands as a release.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Is this a **verse** or a **chorus**?', 'Chorus', ['Verse'], {
            play: playBars('D', b('I V vi IV'), 'strum4', 116),
            explain: 'Four strums per bar, a higher tempo and a progression that starts on I: the energy of a **chorus**.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u17l2',
      title: 'Common song forms',
      summary: 'Verse/chorus, AABA, the 12-bar blues, strophic and verse/pre-chorus/chorus/bridge, mapped bar by bar.',
      blocks: [
        {
          type: 'text',
          md: `A **form** is the plan for how sections follow each other. Five forms cover most of the songs you will play. Each map below counts every bar; the Roman numerals show one chord per bar, and the last column turns them into guitar chords. The audio plays **four-bar sketches** from each form (the first four bars of a section unless the label says otherwise). Every sketch is generated from the same data as the table, so what you hear is what you read.

### 1. Verse / chorus
The workhorse of rock, pop and country. The verse changes lyrics; the chorus is the anchor. A bridge usually appears once, after the second chorus.`
        },
        { type: 'table', headers: ['Bars', 'Section', 'Roman numerals (one per bar)', 'In G'], rows: formRows(VC_KEY, VC_LAYOUT), toolExamples: formExamples(VC_KEY, VC_LAYOUT), caption: 'Verse / chorus form in G: 56 bars.' },
        {
          type: 'audioRow',
          items: [
            { label: `Verse (bars 5–8): ${syms(VC_KEY, VC_VERSE.slice(0, 4))}`, play: playBars(VC_KEY, VC_VERSE.slice(0, 4), 'arp', 84) },
            { label: `Chorus (bars 13–16): ${syms(VC_KEY, VC_CHORUS.slice(0, 4))}`, play: playBars(VC_KEY, VC_CHORUS.slice(0, 4), 'strum4', 116) },
            { label: `Bridge (bars 37–40): ${syms(VC_KEY, VC_BRIDGE.slice(0, 4))}`, play: playBars(VC_KEY, VC_BRIDGE.slice(0, 4), 'strum2', 100) },
            {
              label: 'Verse end → chorus start',
              play: join(playBars(VC_KEY, VC_VERSE.slice(4), 'arp', 100), playBars(VC_KEY, VC_CHORUS.slice(0, 4), 'strum4', 100))
            }
          ]
        },
        {
          type: 'text',
          md: `### 2. AABA (32-bar)
The classic standard and Tin Pan Alley form. Think of "Over the Rainbow" or the "rhythm changes" of "I Got Rhythm". Four **8-bar** sections: the **A** melody and chords come back three times, and a contrasting **bridge (B)** sits in the middle. The bridge here uses a chain of dominant 7ths (E7 – A7 – D7 – G7) that drives round the circle of fifths back to the tonic.`
        },
        { type: 'table', headers: ['Bars', 'Section', 'Roman numerals (one per bar)', 'In C'], rows: formRows(AABA_KEY, AABA_LAYOUT), toolExamples: formExamples(AABA_KEY, AABA_LAYOUT), caption: 'AABA form in C: 4 × 8 = 32 bars. The last A ends V → I instead of turning round on V.' },
        {
          type: 'audioRow',
          items: [
            { label: `A (bars 1–4): ${syms(AABA_KEY, AABA_A.slice(0, 4))}`, play: playBars(AABA_KEY, AABA_A.slice(0, 4), 'strum2', 120) },
            { label: `Bridge (bars 17–20): ${syms(AABA_KEY, AABA_B.slice(0, 4))}`, play: playBars(AABA_KEY, AABA_B.slice(0, 4), 'strum2', 120) },
            { label: `Last A, ending (bars 29–32): ${syms(AABA_KEY, AABA_A3.slice(4))}`, play: playBars(AABA_KEY, AABA_A3.slice(4), 'strum2', 120) }
          ]
        },
        {
          type: 'text',
          md: `### 3. The 12-bar blues
Not just a progression: it is a **form**, a 12-bar chorus that repeats for as long as the song needs, with the words (or solos) changing each time. Three four-bar lines: **I** for four bars, then **IV** and back to **I**, then **V – IV – I – V** (the turnaround). Think of "Johnny B. Goode" or "Sweet Home Chicago". Every chord is a dominant 7th.`
        },
        { type: 'table', headers: ['Bars', 'Section', 'Roman numerals (one per bar)', 'In A'], rows: formRows(BLUES_KEY, BLUES_LAYOUT), toolExamples: formExamples(BLUES_KEY, BLUES_LAYOUT, 'blues'), caption: '12-bar blues in A: A7 for four bars, D7 for two, back to A7 for two, then E7 – D7 – A7 – E7.' },
        {
          type: 'audioRow',
          items: [
            { label: 'All 12 bars in A', play: playBars(BLUES_KEY, [...BLUES_L1, ...BLUES_L2, ...BLUES_L3], 'strum2', 120, 'blues') },
            { label: `Turnaround (bars 9–12): ${syms(BLUES_KEY, BLUES_L3)}`, play: playBars(BLUES_KEY, BLUES_L3, 'strum2', 120, 'blues') }
          ]
        },
        {
          type: 'text',
          md: `### 4. Strophic
The oldest form: **one tune, repeated for every verse**. There is no chorus and no bridge; the interest comes from the words, and from how the player varies the arrangement (a gentle first verse, a fuller last verse). Hymns and folk songs, such as "Amazing Grace" and "Greensleeves", are strophic.`
        },
        { type: 'table', headers: ['Bars', 'Section', 'Roman numerals (one per bar)', 'In G'], rows: formRows(STR_KEY, STR_LAYOUT), toolExamples: formExamples(STR_KEY, STR_LAYOUT), caption: 'Strophic form in G: the same eight bars for every verse, so 4 verses = 32 bars.' },
        {
          type: 'audioRow',
          items: [
            { label: 'Verse 1: arpeggiated', play: playBars(STR_KEY, STR_VERSE, 'arp', 84) },
            { label: 'Verse 4: same chords, fuller strum', play: playBars(STR_KEY, STR_VERSE, 'strum4', 100) }
          ]
        },
        {
          type: 'text',
          md: `### 5. Verse / pre-chorus / chorus / bridge
A modern pop form. The pre-chorus (here 4 bars, from ii to a held V) is the "lift" that connects a calm verse to a big chorus. A short tag at the end repeats the final chord move.`
        },
        { type: 'table', headers: ['Bars', 'Section', 'Roman numerals (one per bar)', 'In G'], rows: formRows(PC_KEY, PC_LAYOUT), toolExamples: formExamples(PC_KEY, PC_LAYOUT), caption: 'Verse / pre-chorus / chorus / bridge form in G: 58 bars including intro and tag.' },
        {
          type: 'audioRow',
          items: [
            { label: `Pre-chorus (bars 13–16): ${syms(PC_KEY, PC_PRE)}`, play: playBars(PC_KEY, PC_PRE, 'strum2', 108) },
            {
              label: 'Verse end → pre-chorus → chorus',
              play: join(playBars(PC_KEY, PC_VERSE.slice(4), 'arp', 108), playBars(PC_KEY, PC_PRE, 'strum2', 108), playBars(PC_KEY, PC_CHORUS.slice(0, 4), 'strum4', 108))
            }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Count the bars.** Almost every section is 4, 8, 12 or 16 bars, because phrases are built from 2- and 4-bar units. If you are writing and a verse comes out at 7 bars, either something is a deliberate surprise or a bar is missing.`
        },
        {
          type: 'tryIt',
          question: mc('In a **12-bar blues in E**, which chord do you play in **bar 9**?', 'B7', ['A7', 'E7', 'F♯7'], {
            explain: 'Bars 9–12 are V7 – IV7 – I7 – V7. In E, V is **B7** (then A7, E7, B7).'
          })
        },
        {
          type: 'tryIt',
          question: mc('A song has four 8-bar sections in the order A – A – B – A. What is this form, and how long is it?', 'AABA, 32 bars', ['Verse / chorus, 32 bars', 'Strophic, 24 bars', 'AABA, 24 bars'], {
            explain: 'A A B A with 8-bar sections is the **AABA** standard: 4 × 8 = **32** bars.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u17l3',
      title: 'Writing progressions on purpose',
      summary: 'Function, contrast, borrowed chords, cadences at the end of sections and the lift into a chorus.',
      blocks: [
        {
          type: 'text',
          md: `Instead of hunting for chords, write with a **plan**. You already know the tools from [[u7l3]]:

1. **Start from function.** Every phrase tells a small story: tonic (home) → subdominant (away) → dominant (tension) → tonic. Decide where each section should feel settled and where it should lean forward.
2. **Contrast verse and chorus.** If both start on the same chord and use the same chords, the chorus will not feel like an arrival. Start the verse on **vi** (or on a chord that is not the tonic) and the chorus on **I**; or use a different chord order for the same four chords. Another way is to raise the energy by moving a section to a different **key** or centre (a bridge in the key of the IV chord, for example).
3. **End sections with a cadence on purpose.** A verse that ends on **V** (half cadence) wants the chorus. A chorus that ends **V → I** or **IV → I** sounds finished.
4. **Add colour with a borrowed chord**, a chord from the parallel minor.
5. **Plan the lift** into the chorus.`
        },
        {
          type: 'audioRow',
          items: [
            { label: `Verse: ${syms('G', b('vi IV I V'))} (starts on vi)`, play: playBars('G', b('vi IV I V'), 'arp', 84) },
            { label: `Chorus: ${syms('G', b('I V vi IV'))} (starts on I)`, play: playBars('G', b('I V vi IV'), 'strum4', 116) }
          ]
        },
        {
          type: 'text',
          md: `### Borrowed chords for colour
The **parallel minor** of a key has the same tonic but a minor scale: G major and G minor. A few chords from G minor fit into G major songs and give a flash of shade. The most useful are **♭VII**, **iv**, **♭VI** and **♭III**.`
        },
        {
          type: 'table',
          headers: ['Borrowed chord', 'Numeral', 'In G', 'In C', 'Flavour'],
          rows: [
            ['Flat seven', '♭VII', chordOf('G', 'bVII').symbol, chordOf('C', 'bVII').symbol, 'rock lift, a mixolydian sound; often between IV and I'],
            ['Minor four', 'iv', chordOf('G', 'iv').symbol, chordOf('C', 'iv').symbol, 'wistful; darkens the usual IV for a bar'],
            ['Flat six', '♭VI', chordOf('G', 'bVI').symbol, chordOf('C', 'bVI').symbol, 'big, cinematic; often goes to ♭VII, then I'],
            ['Flat three', '♭III', chordOf('G', 'bIII').symbol, chordOf('C', 'bIII').symbol, 'bluesy, heavy']
          ],
          caption: 'Four triads borrowed from the parallel minor, in two keys. Each contains a note outside the major scale; iv keeps the usual fourth-degree root but lowers its 3rd.'
        },
        {
          type: 'audioRow',
          items: [
            { label: `IV → iv → I: ${syms('G', b('I IV iv I'))}`, play: playBars('G', b('I IV iv I'), 'strum2', 84) },
            { label: `I → ♭VII → IV → I: ${syms('G', b('I bVII IV I'))}`, play: playBars('G', b('I bVII IV I'), 'strum2', 96) },
            { label: `I → ♭VI → ♭VII → I: ${syms('G', b('I bVI bVII I'))}`, play: playBars('G', b('I bVI bVII I'), 'strum2', 96) }
          ]
        },
        {
          type: 'chords',
          shapes: [shp('G', 'I'), shp('G', 'bVII'), shp('G', 'IV'), shp('G', 'iv'), shp('G', 'bVI')],
          caption: 'G, F (♭VII), C (IV), Cm (iv, a barre) and E♭ (♭VI) in the key of G.'
        },
        {
          type: 'text',
          md: `### Ending sections: cadences
Use the cadences from [[u7l5]] as punctuation at the end of every section:

- A verse that ends on **V** (half cadence) leans forward.
- A chorus that ends **V → I** is a full stop; **IV → I** is a softer, plagal ending.
- A **deceptive** cadence (V → vi) can extend a final chorus for one more round.

### The lift into the chorus
Several tricks make a chorus *feel* bigger. Combine two or three:

1. End the pre-chorus (or verse) on **V**, then land on **I** on the chorus downbeat.
2. Start the chorus on a **chord that has not been the first chord of the verse**.
3. Increase the **rhythm density** and move up in register.
4. Let the harmony move faster for a bar or two just before the chorus.
5. A **key change** up (often a whole step, or a semitone) for the final chorus.`
        },
        {
          type: 'audioRow',
          toolExamples: [
            { ...progressionExample('G', b('I V vi IV'), 'major', 108), label: 'Chorus in G' },
            { ...progressionExample('A', b('I V vi IV'), 'major', 108), label: 'Chorus in A' }
          ],
          items: [
            {
              label: 'No lift: verse ends on I',
              play: join(playBars('G', b('vi IV I I'), 'arp', 100), playBars('G', b('I V vi IV'), 'strum4', 100))
            },
            {
              label: 'With a lift: verse ends on V',
              play: join(playBars('G', b('vi IV ii V'), 'arp', 100), playBars('G', b('I V vi IV'), 'strum4', 100))
            },
            {
              label: 'Key change up a step: chorus in G, then A',
              play: join(playBars('G', b('I V vi IV'), 'strum4', 108), playBars('A', b('I V vi IV'), 'strum4', 108))
            }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**A good rule of thumb:** change **one thing at a time** between sections. If the chord order, rhythm and register all change, the listener loses the thread; if one of them changes, the section feels fresh but familiar.`
        },
        {
          type: 'tryIt',
          question: mc('In the key of **C major**, which chord is a **borrowed** chord?', 'B♭', ['Dm', 'F', 'Am'], {
            explain: 'B♭ (♭VII) comes from C minor. Dm, F and Am are all diatonic to C major.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'What is the root of the **♭VII** chord in the key of **E**?',
            accept: ['D'],
            explain: 'The 7th degree of E major is D♯; lowering it a half step gives **D**. So ♭VII in E is a D major chord.'
          }
        },
        {
          type: 'tryIt',
          question: mc('A pre-chorus is meant to lift into the chorus. Which ending on the last pre-chorus bar does that best?', 'V', ['I', 'vi', 'iii'], {
            explain: 'Ending on **V** is a half cadence: tension that the I chord of the chorus resolves.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u17l4',
      title: 'Writing melodies over chords',
      summary: 'Chord tones on strong beats, passing and neighbour tones, contour, range, motifs, call and response, and phrase lengths.',
      blocks: [
        {
          type: 'text',
          md: `A melody and its chords must agree. The simplest way to make them agree is this:

- **On strong beats** (beat 1, and beat 3 in 4/4), use a **chord tone**: a note of the chord being played.
- **On weak beats**, you may use other notes of the key as **passing tones** (a step between two chord tones) or **neighbour tones** (a step away from a chord tone and back).

Chord tones are stable, so they sound "right" when the ear arrives on them. Passing and neighbour tones add motion. This is a guideline, not a law: a non-chord tone on a strong beat creates tension (a *suspension* or *appoggiatura*) that you can use deliberately.

### Example: the melody follows the chords
Here is an original 4-bar melody in C over **C – Am – F – G**. Play the chords first, then the melody.`
        },
        {
          type: 'audio',
          label: 'The chords: C – Am – F – G',
          play: playBars('C', b('I vi IV V'), 'strum2', 96)
        },
        {
          type: 'staff',
          keySig: 'C',
          timeSig: '4/4',
          bpm: 96,
          caption: 'Melody over C | Am | F | G. Beats 1 and 3 of every bar are chord tones.',
          toolExamples: [progressionExample('C', ['I', 'vi', 'IV', 'V'], 'major', 96)],
          notes: MELODY_TONES
        },
        {
          type: 'table',
          headers: ['Bar', 'Chord', 'Beat 1', 'Beat 3', 'Other notes'],
          rows: [
            ['1', 'C (C E G)', 'E (3rd)', 'E (3rd)', 'G is a chord tone on beat 2; D is a passing tone'],
            ['2', 'Am (A C E)', 'C (3rd)', 'C (3rd)', 'B and A step down between them: B is passing'],
            ['3', 'F (F A C)', 'A (3rd)', 'A (3rd)', 'C is a chord tone; G is a neighbour/passing tone'],
            ['4', 'G (G B D)', 'D (5th)', 'G (root)', 'B (3rd) joins them; the phrase ends on the root']
          ],
          caption: 'Why the melody works: chord tones on the strong beats.'
        },
        {
          type: 'playIt',
          prompt: 'Play the three chord tones of **Am** one at a time: A, C, E. These are the safest targets on strong beats over an Am chord.',
          targets: ['A', 'C', 'E'],
          octaveAgnostic: true,
          hint: 'Any octave is fine. A is the open 5th string, C is at the 3rd fret of the A string and E is the open 1st or 6th string.'
        },
        {
          type: 'fretboard',
          marks: chordToneMarks('A', 'min', [0, 5], 'note'),
          frets: [0, 5],
          caption: 'The chord tones of Am (A C E) on the first five frets. Roots are highlighted.',
          playAll: true
        },
        {
          type: 'text',
          md: `### Contour and range
The **contour** is the shape the melody draws. Common ones:

- **Arch**: climbs to a peak and falls back. Natural, singable, and the most common.
- **Wave**: rises and falls several times; feels flowing.
- **Ascending**: builds anticipation (good for a pre-chorus).
- **Descending**: relaxes (good for the end of a phrase).

Keep the **range** of one section within about an octave. The **chorus melody should sit higher** than the verse; the highest note of the song often belongs to the chorus. Leaps are expressive, but follow a big leap with a step back the other way.

### Motifs and repetition with variation
A **motif** is a small idea (a rhythm plus a few notes). Repeat it so the listener recognises it, then **vary** it: move it to a new chord, change the last note, change the rhythm. The melody below repeats a one-bar motif over C, transposes it to F in bar 3, then changes the pitches over G in bar 4 while keeping the rhythm.`
        },
        {
          type: 'audio',
          label: 'Chords: C | C | F | G',
          play: playBars('C', b('I I IV V'), 'strum2', 96)
        },
        {
          type: 'staff',
          keySig: 'C',
          timeSig: '4/4',
          bpm: 96,
          caption: 'Bar 1: the motif. Bar 2: the motif again. Bar 3: the same rhythm moved to F. Bar 4: the same rhythm over G, ending on B, which feels unresolved.',
          toolExamples: [progressionExample('C', ['I', 'I', 'IV', 'V'], 'major', 96)],
          notes: MELODY_MOTIF
        },
        {
          type: 'text',
          md: `### Call and response
Think of a conversation: a **call** that asks, and a **response** that answers. The call ends on a note that feels open (not the tonic); the response ends on the tonic. This is the melodic version of a half cadence followed by an authentic cadence.`
        },
        {
          type: 'audio',
          label: 'Chords: C | G | F | C',
          play: playBars('C', b('I V IV I'), 'strum2', 96)
        },
        {
          type: 'staff',
          keySig: 'C',
          timeSig: '4/4',
          bpm: 96,
          caption: 'Bars 1–2: the call, ending on B over G (open). Bars 3–4: the response, stepping down to the tonic C.',
          toolExamples: [progressionExample('C', ['I', 'V', 'IV', 'I'], 'major', 96)],
          notes: MELODY_CALL
        },
        {
          type: 'table',
          headers: ['Phrase length', 'What it is', 'Use it for'],
          rows: [
            ['2 bars', 'A short idea: one motif or one call', 'Hooks, riffs, call and response'],
            ['4 bars', 'A complete phrase, often question or answer', 'Half of a verse or chorus'],
            ['8 bars', 'Two 4-bar phrases: question then answer', 'A full verse or chorus; the standard unit'],
            ['16 bars', 'Two 8-bar halves, usually with a variation', 'Long verses, solos']
          ],
          caption: 'Phrases are built in lengths of 2, 4 and 8 bars.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Hum before you play.** Sing or hum a melody over the chords on la-la before you look for the notes on the guitar. Singable melodies come from the voice, not from scale patterns. Then find your hum on the fretboard and check whether the strong beats are chord tones.`
        },
        {
          type: 'tryIt',
          question: mc('Over an **F** chord (F – A – C), which note is the best choice on **beat 1**?', 'A', ['G', 'B', 'D'], {
            explain: 'A is the 3rd of F, a chord tone. G, B and D are not in an F major triad.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the chord tones of **G** (the chord in bar 4 of the first melody).',
            answer: ['G', 'B', 'D'],
            explain: 'G major is **G – B – D**. The melody uses D on beat 1 and G on beat 3.'
          }
        },
        {
          type: 'tryIt',
          question: mc('A melody **call** should usually end…', 'On an open note, not the tonic', ['Always on the tonic', 'On a rest', 'On the highest note of the song'], {
            explain: 'A call asks a question, so it stops somewhere unresolved. The response answers by landing on the tonic.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u17l5',
      title: 'Hooks, riffs and arranging for guitar',
      summary: 'Pentatonic riffs, rhythmic hooks, capo choices, voicings, strum or arpeggio by section, and dynamics.',
      blocks: [
        {
          type: 'text',
          md: `A **hook** is the part of the song your brain will not let go of. It can be a melody, a title phrase, or on guitar, a **riff**: a short repeating pattern of notes, usually one or two bars long. Famous riffs, from "Smoke on the Water" to "Seven Nation Army", prove that a handful of notes and a strong rhythm is enough.

### Building a riff from the pentatonic
The minor pentatonic scale ([[u8l1]]) is the guitarist's riff factory: five notes, no half steps, nothing that clashes with the chord. In A minor the notes are **A – C – D – E – G**. Pick a root note to hammer on (the "anchor"), then step up or down to one or two neighbours.`
        },
        {
          type: 'fretboard',
          marks: scaleMarks('A', 'minorPentatonic', { frets: [3, 9] }),
          frets: [3, 9],
          caption: 'A minor pentatonic around the 5th fret. The riff below lives on the low strings.',
          playAll: true
        },
        {
          type: 'tab',
          timeSig: '4/4',
          bpm: 100,
          caption: 'A two-bar riff in A minor pentatonic: the root repeated as an anchor, with C and D, then dropping to E and G.',
          toolExamples: [{ kind: 'scale', root: 'A', type: 'minorPentatonic' }],
          events: [
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 5 }], beats: 1 },
            { pos: [{ string: 5, fret: 3 }], beats: 1 },
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 5, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 4, fret: 2 }], beats: 1 },
            { pos: [{ string: 6, fret: 3 }], beats: 1 }
          ]
        },
        {
          type: 'text',
          md: `### Rhythm makes the hook
Often the **rhythm** is the hook, not the notes. Play any one note with each of these rhythms and notice how different they feel. Syncopation (accenting between the beats) gives the push that makes people nod along.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Straight eighths', play: { kind: 'rhythm', pattern: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], bpm: 100, pitch: 'A2' } },
            { label: 'Push: 3 + 3 + 2', play: { kind: 'rhythm', pattern: [0.75, 0.75, 0.5, 0.75, 0.75, 0.5], bpm: 100, pitch: 'A2' } },
            { label: 'Stab and gap', play: { kind: 'rhythm', pattern: [1, 0.5, -0.5, 0.5, 0.5, 1], bpm: 100, pitch: 'A2' } }
          ]
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Riff recipe.** (1) Choose a key and the matching pentatonic. (2) Choose a rhythm from a few notes of **different lengths**. (3) Repeat the first note several times, then move. (4) End on the root, or leave the last note hanging on the 5th for a "question" riff. (5) Play it against the chord progression: does the riff still sound right when the chord changes from Am to F or G?`
        },
        {
          type: 'text',
          md: `### Arranging: capo and key
A **capo** raises every string by the same number of frets, so you can keep easy open shapes while choosing the key that suits the singer. The key you hear is the key of the shapes plus the capo fret. Quick recap of the capo math from [[u15l2]].`
        },
        {
          type: 'table',
          headers: ['Key you want', ...CAPO_SHAPES.map((s) => `${s} shapes`)],
          rows: CAPO_TARGETS.map((t) => [t, ...CAPO_SHAPES.map((s) => capoCell(s, t))]),
          caption: 'Which capo fret turns each set of open shapes into the key you want. Capos above the 7th fret are rarely practical.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G – Em – C – D, open (key of G)', play: capoSeq(['I', 'vi', 'IV', 'V'].map((t) => shp('G', t)), 0, 'G', b('I vi IV V')) },
            { label: 'Same shapes, capo 2 (sounds in A)', play: capoSeq(['I', 'vi', 'IV', 'V'].map((t) => shp('G', t)), 2, 'A', b('I vi IV V')) },
            { label: 'Same shapes, capo 4 (sounds in B)', play: capoSeq(['I', 'vi', 'IV', 'V'].map((t) => shp('G', t)), 4, 'B', b('I vi IV V')) }
          ]
        },
        {
          type: 'text',
          md: `### Voicing choices
The same chord can be voiced to suit the section. A full open G is warm and big; a barre G on the 3rd fret is tight and bright; a **three-string triad** on the middle strings gives a thinner sound that leaves room for other instruments or a vocal.`
        },
        {
          type: 'chords',
          shapes: [G_OPEN, G_BARRE, G_TRIAD],
          caption: 'Three voicings of G: open, barre at the 3rd fret, and a small triad on strings 4–3–2.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Open G', play: { kind: 'shape', shape: G_OPEN, mode: 'strum' } },
            { label: 'Barre G', play: { kind: 'shape', shape: G_BARRE, mode: 'strum' } },
            { label: 'Small triad', play: { kind: 'shape', shape: G_TRIAD, mode: 'strum' } }
          ]
        },
        {
          type: 'text',
          md: `### Strum or arpeggio, by section
Choose a texture for each section and change it where the song should change. Here is a reliable plan:

- **Verse**: fingerpicked arpeggio or light, sparse strum, palm-muted if you like.
- **Pre-chorus**: tighten up: more strums per bar, or let the strum swell in volume.
- **Chorus**: open, full strums on every beat, with the biggest voicings.
- **Bridge**: change something: single notes, a new pattern, or a stripped-back texture.`
        },
        {
          type: 'tab',
          timeSig: '4/4',
          bpm: 90,
          caption: 'A verse fingerpicking pattern: eight notes per bar, C then G, all chord tones.',
          toolExamples: [progressionExample('C', ['I', 'V'], 'major', 90)],
          events: [
            { pos: [{ string: 5, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 3, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 1 }], beats: 0.5 },
            { pos: [{ string: 1, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 1 }], beats: 0.5 },
            { pos: [{ string: 3, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 4, fret: 2 }], beats: 0.5 },
            { pos: [{ string: 6, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 4, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 3, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 1, fret: 3 }], beats: 0.5 },
            { pos: [{ string: 2, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 3, fret: 0 }], beats: 0.5 },
            { pos: [{ string: 4, fret: 0 }], beats: 0.5 }
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Verse texture: arpeggio, soft', play: playBars('G', b('I V vi IV'), 'arp', 84) },
            { label: 'Chorus texture: four strums per bar', play: playBars('G', b('I V vi IV'), 'strum4', 116) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Dynamics are free.** You can move from a verse to a chorus with the same chords by playing softer and nearer the neck in the verse and harder, nearer the bridge pickup or the soundhole, in the chorus. Keep the strongest sound (full open chords, high voicings, loudest strumming) for the last chorus.`
        },
        {
          type: 'playIt',
          prompt: 'Play the riff\'s opening notes in order: A, A, C, A, D.',
          targets: ['A2', 'A2', 'C3', 'A2', 'D3'],
          hint: 'All on the 5th string: open (A), 3rd fret (C), 5th fret (D).'
        },
        {
          type: 'tryIt',
          question: mc('You want to play a G–C–D song in the key of **A**, using open G shapes. Where do you put the capo?', 'Fret 2', ['Fret 1', 'Fret 3', 'Fret 5'], {
            explain: 'G up two semitones is A, so a capo at the **2nd fret** turns G, C, D shapes into A, D, E.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Which notes make the best material for a quick bluesy riff in A minor?', 'A C D E G', ['A B C# D E', 'A B C D E F G', 'A C# E F# G#'], {
            explain: 'The A minor pentatonic scale (A C D E G) has no half steps and sounds good over most chords in the key.'
          })
        }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: 'u17l6',
      title: 'A songwriting workflow: write an 8-bar verse',
      summary: 'A practical routine from idea to finished song, with a guided 8-bar verse exercise.',
      blocks: [
        {
          type: 'text',
          md: `Songs do not arrive finished. A repeatable process turns ideas into songs. Here is one that works well on guitar:

1. **Capture the spark.** Record any riff, chord change or phrase on your phone straight away. Do not judge it.
2. **Pick a key, a tempo and a groove.** Choose a key that suits your voice, with open-chord shapes you can play comfortably (use the capo to fine-tune).
3. **Write the chorus first.** It is the heart of the song and the hardest part. Use a clear progression ending on I and a hook that repeats.
4. **Write a contrasting verse.** Different starting chord, lower melody, sparser texture.
5. **Join them with a lift.** A pre-chorus, or a verse ending on V.
6. **Add a bridge only if it has something new to say.** Not every song needs one.
7. **Arrange.** Choose a texture, dynamics and voicings for each section.
8. **Test and trim.** Play it from beginning to end. Cut anything that repeats without a reason.`
        },
        {
          type: 'table',
          headers: ['Step', 'Question to ask', 'Tool from this unit'],
          rows: [
            ['Chorus', 'Does it land? Is the hook easy to sing back?', 'I-based progression, chord tones on strong beats'],
            ['Verse', 'Does it contrast with the chorus?', 'Start on vi; lower register; arpeggiated texture'],
            ['Join', 'Does the end of the verse want the chorus?', 'Half cadence on V or a short pre-chorus'],
            ['Colour', 'Is there one memorable surprise?', 'A borrowed ♭VII or iv; a rhythmic hook'],
            ['Form', 'Do the sections fit 4, 8 or 16 bars?', 'Form maps from lesson 2']
          ],
          caption: 'A checklist for each stage of writing.'
        },
        {
          type: 'text',
          md: `### Guided exercise: write an 8-bar verse
We will build a verse in **G** for a chorus that goes **G – D – Em – C** (I – V – vi – IV).

**Step 1: choose the verse chords.** The chorus starts on I, so the verse should start somewhere else. Starting on **vi (Em)** gives the verse a more reflective feel. We will use **vi – IV – I – V** (Em – C – G – D) twice. The last chord, **D (V)**, is a half cadence that leans into the chorus.`
        },
        {
          type: 'tryIt',
          question: mc('The chorus is **G – D – Em – C**. Which verse progression in G contrasts best (starts away from I and ends on V)?', 'Em – C – G – D', ['G – D – Em – C', 'G – C – G – C', 'C – G – C – G'], {
            explain: 'Em – C – G – D is vi – IV – I – V: it starts on the minor vi and ends on **V**, so the chorus on I arrives as a release.'
          })
        },
        {
          type: 'audio',
          label: 'The verse chords, twice, as an arpeggiated texture',
          play: playBars('G', VERSE_TOKS, 'arp', 84)
        },
        {
          type: 'chords',
          shapes: ['vi', 'IV', 'I', 'V'].map((t) => shp('G', t)),
          caption: 'Em, C, G and D: the verse shapes, all open.'
        },
        {
          type: 'text',
          md: `**Step 2: choose the texture.** The verse is the quiet part. Pick a fingerpicking pattern (like the one in the last lesson) or a soft, palm-muted strum, one strum per beat at most.

**Step 3: write the first 4-bar phrase.** Put a chord tone on beat 1 and beat 3 of each bar. Make the contour an arch. The melody below does that: bar 1 starts on B (5th of Em), bar 2 climbs to C, bar 3 peaks on D (5th of G), and bar 4 falls from A (the 5th of D) to D, then rests to breathe.`
        },
        {
          type: 'staff',
          keySig: 'G',
          timeSig: '4/4',
          bpm: 96,
          caption: 'Phrase 1 over Em | C | G | D. A question: it settles on D over the D chord and rests to breathe.',
          toolExamples: [progressionExample('G', ['vi', 'IV', 'I', 'V'], 'major', 96)],
          notes: VERSE_P1
        },
        {
          type: 'table',
          headers: ['Bar', 'Chord', 'Beat 1', 'Beat 3', 'Note'],
          rows: [
            ['1', 'Em (E G B)', 'B', 'G', 'A is a passing tone'],
            ['2', 'C (C E G)', 'E', 'C', 'G on beat 2 is a chord tone; B and A step down'],
            ['3', 'G (G B D)', 'G', 'D', 'B on beat 2: the peak of the phrase is D'],
            ['4', 'D (D F♯ A)', 'A', 'D', 'F♯ in between; the last beat is a rest']
          ],
          caption: 'Check: strong beats are chord tones.'
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the chord tones of the **D major** chord that harmonises bar 4 of the verse.',
            answer: ['D', 'F#', 'A'],
            explain: 'D major is **D – F♯ – A**. The phrase uses A on beat 1 and F♯ on beat 2.'
          }
        },
        {
          type: 'text',
          md: `**Step 4: write the answer phrase (bars 5–8).** Repeat the first phrase with small changes: the same chords and opening motif, but different endings. This is *repetition with variation*. Bar 5 ends on B instead of E, bar 6 adds a passing D, and bar 7 splits the held D into D then B. Bar 8 opens with a long held A and ends on A, whereas bar 4 ends on D then rests. Both phrases end over the same chord, D (V), so the chorus is still pulling forward.`
        },
        {
          type: 'staff',
          keySig: 'G',
          timeSig: '4/4',
          bpm: 96,
          caption: 'Phrase 2 over Em | C | G | D: the opening motif returns, with variations in all four bars. In its third bar, D is shortened and followed by B.',
          toolExamples: [progressionExample('G', ['vi', 'IV', 'I', 'V'], 'major', 96)],
          notes: VERSE_P2
        },
        {
          type: 'playIt',
          prompt: 'Play the roots of the verse chords in order: E, C, G, D.',
          targets: ['E', 'C', 'G', 'D'],
          octaveAgnostic: true,
          hint: 'E is the open 6th string, C the 3rd fret of the A string, G the 3rd fret of the low E string and D the open 4th string.'
        },
        {
          type: 'tryIt',
          question: mc('In phrase 2 the melody ends on **A** over **D**. Why does the verse still lead into the chorus?', 'The final chord is V', ['The final note is the tonic', 'The final chord is minor', 'There is no final cadence'], {
            explain: 'The last chord is **V**, a half cadence. The chorus starts on **I**, which resolves it.'
          })
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Your turn.** Write your own 8-bar verse in another key, such as D or A:

1. Write the chorus progression (I – V – vi – IV).
2. Choose a verse progression that starts on **vi** or **IV** and ends on **V**.
3. Write bar by bar a melody with chord tones on beats 1 and 3.
4. Repeat the idea in bars 5–8 with one change.
5. Play it, record it, and listen back as a stranger would.

Then add a chorus melody that sits higher than the verse.`
        },
        {
          type: 'tryIt',
          question: mc('In a good workflow, which should you usually write **first**?', 'The chorus', ['The bridge', 'The outro', 'The guitar solo'], {
            explain: 'The chorus carries the hook and the main message. Once you have it, the verse can be designed to contrast with it.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('Which section is usually the **highest in energy** and carries the main hook?', 'Chorus', ['Verse', 'Intro', 'Outro'], {
        explain: 'The chorus is the payoff: the hook, the main message and (usually) the biggest sound.'
      }),
      mc('A **pre-chorus** most often ends on which chord?', 'V', ['I', 'vi', 'iii'], {
        explain: 'Ending on V (a half cadence) builds tension that the chorus resolves.'
      }),
      mc('What is the usual job of a **bridge**?', 'Provide contrast', ['Repeat the chorus hook', 'Introduce the opening key', 'Fade the song to silence'], {
        explain: 'A bridge starts away from the home chord (IV, vi, ♭VII) and often ends on V to lead back.'
      }),
      { kind: 'text', prompt: 'How many bars are in a standard **blues** chorus?', accept: ['12', 'twelve'], explain: 'The 12-bar blues has three 4-bar lines.' },
      mc('In the **AABA** form, which letter is the bridge?', 'B', ['The first A', 'The second A', 'The last A'], {
        explain: 'A – A – B – A: the contrasting B section in the middle is the bridge.'
      }),
      mc('What does **strophic** mean?', 'Each verse repeats the same tune', ['Each verse introduces a new tune', 'Each verse leads to a separate chorus', 'Each verse adds a new bridge'], {
        explain: 'In a strophic song, one tune is repeated for each verse (like "Amazing Grace").'
      }),
      mc('In a 12-bar blues in A, which chord is played in bars 5–6?', 'D7', ['A7', 'E7', 'G7'], {
        explain: 'Bars 5–6 are IV7: **D7** in the key of A.'
      }),
      mc('How many bars does a 32-bar **AABA** tune have if each section has 8 bars?', '32', ['24', '16', '36'], {
        explain: '4 sections × 8 bars = 32.'
      }),
      { kind: 'spell', prompt: 'Spell the chord tones of **Am**.', answer: ['A', 'C', 'E'], ordered: false, explain: 'Am is A – C – E. These are safe notes for strong beats.' },
      mc('A **passing tone** is…', 'A stepwise link between two notes', ['A chord tone held for a full bar', 'A note struck outside the key by leap', 'The lowest sounding chord tone'], {
        explain: 'Passing tones move by step between chord tones, usually on weak beats.'
      }),
      { kind: 'text', prompt: 'What is the root of the **♭VII** chord in the key of **D**?', accept: ['C'], explain: 'The 7th degree of D major is C♯, flattened to **C**. The ♭VII chord is C major.' },
      { kind: 'text', prompt: 'Open G shapes with a capo on fret 2 sound in which key?', accept: ['A', 'A major'], explain: 'G up two semitones is **A**.' },
      { kind: 'spell', prompt: 'Spell the roots of **I – V – vi – IV** in the key of **E**.', answer: ['E', 'B', 'C#', 'A'], explain: 'E major: E F♯ G♯ A B C♯ D♯. I = E, V = B, vi = C♯m, IV = A.' },
      mc('Which is a good way to build a **lift into a chorus**?', 'End on V, then resolve to I', ['End on I, then move to iii', 'Lower the chorus melody range', 'Thin out the chorus texture'], {
        explain: 'A half cadence on V sets up tension that the chorus I resolves; add more rhythm and register to complete the lift.'
      }),
      mc('A melody **call** and **response**: how should the response usually resolve?', 'On the tonic', ['On the leading tone', 'On the same open note', 'On the second degree'], {
        explain: 'The call asks a question; the response resolves it, usually onto the tonic.'
      }),
      mc('Listen. Is this a **verse** or a **chorus**?', 'Verse', ['Chorus'], {
        play: playBars('E', b('vi IV I V'), 'arp', 84),
        explain: 'Soft arpeggios, a slower pace and a progression that starts on vi: a calm **verse**.'
      }),
      mc('Listen. Does this phrase end on a **strong** or a **weak** cadence?', 'Weak (unfinished)', ['Strong (finished)'], {
        play: playBars('C', b('I vi ii V'), 'strum2', 92),
        explain: 'C – Am – Dm – G ends on V (G), a half cadence: it asks for more.'
      }),
      mc('Listen. Does this phrase end on a **strong** or a **weak** cadence?', 'Strong (finished)', ['Weak (unfinished)'], {
        play: playBars('G', b('I IV V I'), 'strum2', 92),
        explain: 'G – C – D – G ends V → I, an authentic cadence: a full stop.'
      }),
      mc('Which phrase lengths are the most common in songwriting?', '2, 4 and 8 bars', ['3, 5 and 7 bars', '1 and 10 bars', 'Only 16 bars'], {
        explain: 'Phrases are built from 2-, 4- and 8-bar units.'
      })
    ],
    generators: [aabaMath, chordToneBeatOne, romanToSection, identifyForm, listenVerseChorus, cadenceStrength]
  }
}

export default unit
