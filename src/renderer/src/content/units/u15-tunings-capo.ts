import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { mc, rand, randInt, shuffle } from '../helpers'
import { ChordShape, FretPos, OPEN_CHORDS, STANDARD_TUNING, movableChord, pcAt, positionsOf, shape, shapeMidisIn, shapePositions } from '@/theory/guitar'
import { DADGAD, DOUBLE_DROP_D, DROP_D, FULL_STEP_DOWN, HALF_STEP_DOWN, OPEN_D, OPEN_E, OPEN_G, STANDARD, stringGaps, tuningLetters } from '@/theory/tunings'
import { mod, pcName } from '@/theory/notes'
import { progressionExample } from '../toolExamples'

// ---------- tunings used in this unit (MIDI, index 0 = string 1) ----------

const STD = STANDARD_TUNING
const DD = DROP_D.midi
const DG = DADGAD.midi
const OG = OPEN_G.midi
const OD = OPEN_D.midi
const HS = HALF_STEP_DOWN.midi

// ---------- naming helpers ----------

/** Quiz-choice labels for the 12 pitch classes (black keys show both spellings so nobody is marked down for spelling). */
const KEY_LABEL = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B']
/** Everyday key names used in prose and tables. */
const KEY_NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const DEG = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

const majLabel = (pc: number): string => KEY_LABEL[mod(pc, 12)]
const minLabel = (pc: number): string =>
  KEY_LABEL[mod(pc, 12)]
    .split('/')
    .map((n) => n + 'm')
    .join('/')
const chordLabel = (pc: number, minor: boolean): string => (minor ? minLabel(pc) : majLabel(pc))
const keyName = (pc: number, minor = false): string => KEY_NAME[mod(pc, 12)] + (minor ? 'm' : '')

const P = (string: number, fret: number): FretPos => ({ string, fret })

// ---------- fretboard mark builders (tuning aware) ----------

/** The six open strings (or the "open" strings under a capo) as dots. Frets are absolute. */
function openMarks(t: number[], opts: { label: 'note' | 'degree'; root?: number; fret?: number; flats?: boolean }): FretMark[] {
  const fret = opts.fret ?? 0
  return [1, 2, 3, 4, 5, 6].map((s) => {
    const pc = mod(t[s - 1] + fret, 12)
    const degree = opts.root === undefined ? undefined : DEG[mod(pc - opts.root, 12)]
    return {
      string: s,
      fret,
      label: opts.label === 'degree' ? degree : pcName(pc, !!opts.flats),
      color: degree === 'R' ? 'root' : 'tone'
    }
  })
}

/** A chord shape drawn on the fretboard. `capo` shifts the (capo-relative) shape frets to absolute fret numbers. */
function shapeMarksIn(
  shp: ChordShape,
  t: number[],
  opts: { capo?: number; root?: number; label: 'note' | 'degree' | 'finger'; flats?: boolean }
): FretMark[] {
  const capo = opts.capo ?? 0
  return shapePositions(shp).map((p) => {
    const abs = { string: p.string, fret: p.fret + capo }
    const pc = pcAt(abs, t)
    const finger = shp.fingers?.[6 - p.string]
    return {
      ...abs,
      label:
        opts.label === 'finger'
          ? finger
            ? String(finger)
            : undefined
          : opts.label === 'degree'
            ? DEG[mod(pc - (opts.root ?? 0), 12)]
            : pcName(pc, !!opts.flats),
      color: opts.root !== undefined && pc === opts.root ? 'root' : 'tone'
    }
  })
}

/** Every position of the given chord tones (semitones above the root) in a tuning and fret range. */
function toneMarksIn(t: number[], root: number, rel: number[], frets: [number, number], label: 'degree' | 'note' = 'degree', flats = false): FretMark[] {
  const out: FretMark[] = []
  for (const r of rel)
    for (const p of positionsOf(mod(root + r, 12), frets[0], frets[1], t))
      out.push({ ...p, label: label === 'degree' ? DEG[r] : pcName(mod(root + r, 12), flats), color: r === 0 ? 'root' : 'tone' })
  return out
}

/** Every position of one pitch class, labelled with its name. */
function noteMarksIn(t: number[], pc: number, frets: [number, number], color: FretMark['color'] = 'root', label?: string): FretMark[] {
  return positionsOf(pc, frets[0], frets[1], t).map((p) => ({ ...p, color, label: label ?? pcName(pc) }))
}

// ---------- sound builders ----------

const strumIn = (s: ChordShape, tuning: number[], capo = 0): PlaySpec => ({ kind: 'shape', shape: s, mode: 'strum', tuning, capo })
const seqIn = (shapes: ChordShape[], tuning: number[], beats = 2, bpm = 90, capo = 0): PlaySpec => ({
  kind: 'sequence',
  bpm,
  events: shapes.map((s) => ({ notes: shapeMidisIn(s, tuning, capo), beats, mode: 'strum' as const }))
})
const named = (s: ChordShape, name: string): ChordShape => ({ ...s, name })

/** Tab events: each note alone, then all together. */
const arpThenChord = (ps: FretPos[], each = 0.5, hold = 1.5) => [...ps.map((p) => ({ pos: [p], beats: each })), { pos: ps, beats: hold }]

// ---------- shapes ----------

const C = OPEN_CHORDS
/** The same open Em fingering, three tunings. */
const EM = named(C.Em, 'Em shape')

// Drop D
const D5 = shape('D5', '000xxx')
const F5 = shape('F5', '333xxx', '111xxx', 3)
const G5 = shape('G5', '555xxx', '111xxx', 5)
const D_FULL = shape('D', '000232', '000132')
const DM_FULL = shape('Dm', '000231', '000231')

// DADGAD
const DG_SUS4 = shape('Dsus4', '000000')
const DG_SUS2 = shape('Dsus2', '002x00', '002x00')
const DG_D = shape('D', '004x00', '004x00')
const DG_DM = shape('Dm', '003x00', '003x00')
const DG_ESUS4 = shape('Esus4', '222222', '111111', 2)
const DG_GSUS4 = shape('Gsus4', '555555', '111111', 5)
const DG_ASUS4 = shape('Asus4', '777777', '111111', 7)

// Open G
const OG_G = shape('G', '000000')
const OG_C = shape('C', '555555', '111111', 5)
const OG_D = shape('D', '777777', '111111', 7)
const OG_GM = shape('Gm', '0300x0', '0200x0')
const OG_G7 = shape('G7', '000003', '000003')
const OG_GMAJ7 = shape('Gmaj7', '000004', '000004')

// Open D
const OD_D = shape('D', '000000')
const OD_G = shape('G', '555555', '111111', 5)
const OD_A = shape('A', '777777', '111111', 7)
const OD_DM = shape('Dm', '003x00', '003x00')
const OD_D7 = shape('D7', '000030', '000030')

// ---------- generators ----------

interface ShapeKey {
  name: string
  pc: number
  minor: boolean
}
const SHAPE_KEYS: ShapeKey[] = [
  { name: 'C', pc: 0, minor: false },
  { name: 'D', pc: 2, minor: false },
  { name: 'E', pc: 4, minor: false },
  { name: 'G', pc: 7, minor: false },
  { name: 'A', pc: 9, minor: false },
  { name: 'Am', pc: 9, minor: true },
  { name: 'Em', pc: 4, minor: true },
  { name: 'Dm', pc: 2, minor: true }
]

/** Three distinct wrong labels: the listed candidates first (typical slips), then random fill. */
function wrongLabels(correctPc: number, candidates: number[], minor: boolean): string[] {
  const answer = chordLabel(correctPc, minor)
  const seen = new Set<string>([answer])
  const out: string[] = []
  for (const pc of [...candidates, ...shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])]) {
    const l = chordLabel(pc, minor)
    if (seen.has(l)) continue
    seen.add(l)
    out.push(l)
    if (out.length === 3) break
  }
  return out
}

/** Shape key + capo fret -> sounding key. */
const capoForward = (): QuizQuestion => {
  const s = rand(SHAPE_KEYS)
  const capo = randInt(1, 9)
  const pc = mod(s.pc + capo, 12)
  return mc(
    `You clamp a capo on **fret ${capo}** and play the open **${s.name}** chord shape. Which chord actually sounds?`,
    chordLabel(pc, s.minor),
    wrongLabels(pc, [pc + 1, pc - 1, s.pc - capo], s.minor),
    {
      explain: `A capo raises every shape by its fret number in semitones: ${s.name} + ${capo} = **${keyName(pc, s.minor)}**. (Counting the wrong way would give ${keyName(s.pc - capo, s.minor)}.)`
    }
  )
}

/** Shape key + target key -> capo fret. */
const capoReverse = (): QuizQuestion => {
  const s = rand(SHAPE_KEYS.filter((k) => !k.minor))
  const capo = randInt(1, 9)
  const target = mod(s.pc + capo, 12)
  const wrong = [capo + 1, capo - 1, capo + 2, capo - 2, capo + 3, capo - 3, 12 - capo].filter((n, i, a) => n >= 1 && n <= 11 && n !== capo && a.indexOf(n) === i)
  return mc(
    `Your singer needs the song in **${keyName(target)}**, and you want to play **${s.name}**-shape chords. Which capo fret do you use?`,
    String(capo),
    wrong.slice(0, 3).map(String),
    {
      explain: `Capo fret = sounding key − shape key, counted up in semitones: from ${s.name} up to ${keyName(target)} is **${capo}** semitones, so capo ${capo}.`
    }
  )
}

/** Tunings used by the string-note generators (each differs from standard on at least one string). */
const NAMED_TUNINGS = [DROP_D, DADGAD, OPEN_G, OPEN_D, OPEN_E, DOUBLE_DROP_D, HALF_STEP_DOWN, FULL_STEP_DOWN]

/** The note an open string is tuned to: by name of tuning, or by retuning from standard. */
const openStringNote = (): QuizQuestion => {
  if (Math.random() < 0.5) {
    const t = rand(NAMED_TUNINGS)
    const s = randInt(1, 6)
    const letters = tuningLetters(t.midi)
    const answer = letters[6 - s]
    const flats = answer.includes('b')
    const pc = mod(t.midi[s - 1], 12)
    const wrong = [pc + 1, pc - 1, pc + 2, pc - 2].map((n) => pcName(n, flats))
    return mc(`A guitar is in **${t.name}** tuning. What is the open **${ORD[s]}** string?`, answer, wrong, {
      explain: `${t.name} is ${letters.join(' ')} from the 6th string up, so the ${ORD[s]} string is **${answer}**.`
    })
  }
  const s = randInt(1, 6)
  const down = Math.random() < 0.6
  const k = randInt(1, 3)
  const pc = mod(STD[s - 1] + (down ? -k : k), 12)
  const start = pcName(STD[s - 1], false)
  const wrongPcs = [pc + 1, pc - 1, pc + (down ? k : -k) - 0, STD[s - 1] + (down ? -k - 1 : k + 1)]
  const answer = majLabel(pc)
  const wrong = [...new Set(wrongPcs.map(majLabel))].filter((l) => l !== answer)
  for (const x of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])) if (wrong.length < 3 && x !== pc && !wrong.includes(majLabel(x))) wrong.push(majLabel(x))
  return mc(`Starting from standard tuning, you tune the **${ORD[s]}** string (open ${start}) **${down ? 'down' : 'up'} ${k} semitone${k > 1 ? 's' : ''}**. What note is it now?`, answer, wrong.slice(0, 3), {
    explain: `${start} ${down ? 'minus' : 'plus'} ${k} semitone${k > 1 ? 's' : ''} = **${answer}**.`
  })
}

/** On a retuned string, which fret plays note X? */
const fretOnRetuned = (): QuizQuestion => {
  const t = rand(NAMED_TUNINGS)
  const s = randInt(1, 6)
  const f = randInt(1, 11)
  const open = mod(t.midi[s - 1], 12)
  const pc = mod(open + f, 12)
  const letter = tuningLetters(t.midi)[6 - s]
  const stdFret = mod(pc - STD[s - 1], 12)
  const wrong = [stdFret, f + 1, f - 1, f + 2, f - 2, f + 3].filter((n, i, a) => n >= 0 && n <= 12 && n !== f && a.indexOf(n) === i)
  return mc(`In **${t.name}** tuning the ${ORD[s]} string is tuned to **${letter}**. Which fret on that string plays **${majLabel(pc)}**?`, String(f), wrong.slice(0, 3).map(String), {
    explain: `Count up from the open ${letter}: ${f} semitone${f > 1 ? 's' : ''} higher is **${majLabel(pc)}**, so fret **${f}**.${stdFret !== f ? ` (In standard tuning that note would be at fret ${stdFret}: the retuned string moves it.)` : ''}`
  })
}

/** Click a named note on one string of a retuned guitar. */
const clickTunedNote = (): QuizQuestion => {
  const t = rand(NAMED_TUNINGS)
  const s = randInt(1, 6)
  const pc = randInt(0, 11)
  const targets = positionsOf(pc, 0, 12, t.midi).filter((p) => p.string === s)
  return {
    kind: 'fretboard',
    prompt: `Tuning: **${t.name}** (${tuningLetters(t.midi).join(' ')}). Click **${majLabel(pc)}** on the **${ORD[s]}** string (frets 0–12).`,
    tuning: t.midi,
    frets: [0, 12],
    targets,
    explain: `The ${ORD[s]} string is open ${tuningLetters(t.midi)[6 - s]} in ${t.name}. ${majLabel(pc)} is at fret ${targets.map((p) => p.fret).join(' or ')} on it.`
  }
}

/** Capo up and tuned down together: net shift = capo − tune-down. */
const capoPlusTuning = (): QuizQuestion => {
  const s = rand(SHAPE_KEYS)
  const capo = randInt(0, 5)
  const down = randInt(1, 2)
  const net = capo - down
  const pc = mod(s.pc + net, 12)
  const downText = down === 1 ? 'a half step (1 fret)' : 'a whole step (2 frets)'
  const capoText = capo ? ` and clamp a capo on fret ${capo}` : ''
  return mc(
    `Your guitar is tuned **down ${downText}**${capoText}. You play the open **${s.name}** shape. Which chord sounds?`,
    chordLabel(pc, s.minor),
    wrongLabels(pc, [s.pc + capo + down, s.pc + capo, s.pc - down], s.minor),
    {
      explain: `The capo raises the shape by ${capo} and the lowered tuning drops it by ${down}: net ${net >= 0 ? '+' : '−'}${Math.abs(net)} semitone${Math.abs(net) === 1 ? '' : 's'}. ${s.name} → **${keyName(pc, s.minor)}**.`
    }
  )
}

// ---------- tables ----------

const gapsText = (t: number[]): string => stringGaps(t).join(' · ')

const TUNING_ROWS = [STANDARD, DROP_D, DADGAD, OPEN_G, OPEN_D, DOUBLE_DROP_D].map((t) => [t.name, t.letters.join(' '), gapsText(t.midi)])

/** Capo chart: sounding major chord for open shapes at each capo fret. */
const CAPO_SHAPES = [0, 7, 2, 9, 4] // C G D A E
const CAPO_ROWS = [0, 1, 2, 3, 4, 5, 7].map((c) => [c === 0 ? 'No capo' : `Capo ${c}`, ...CAPO_SHAPES.map((pc) => keyName(pc + c))])

/** Ways to reach a target key: capo fret for each friendly open-chord family. */
function capoOptions(targetPc: number): string[][] {
  return [
    ['A', 9],
    ['G', 7],
    ['E', 4],
    ['D', 2],
    ['C', 0]
  ].map(([n, pc]) => {
    const capo = mod(targetPc - (pc as number), 12)
    return [`${n} shapes`, capo === 0 ? 'no capo' : `capo ${capo}`, capo > 7 ? 'high up, thin and cramped' : capo === 0 ? 'open position' : 'comfortable']
  })
}

// ---------- the unit ----------

const unit: Unit = {
  id: 'u15',
  number: 15,
  title: 'Alternate tunings and the capo',
  summary:
    'How tuning shapes every chord and scale, capo math for choosing a key, Drop D power chords, DADGAD, Open G and Open D slide tunings, and tuning down. Every diagram, tab and sound uses the altered pitches.',
  elective: true,
  requires: ['u5'],
  lessons: [
    // ------------------------------------------------------------------
    {
      id: 'u15l1',
      title: 'How tuning shapes everything',
      summary: 'Four 4ths and one major 3rd: why the same fingers make different music when the strings change.',
      blocks: [
        {
          type: 'text',
          md: `So far every fret number in this course has assumed **standard tuning**: E A D G B E from the 6th string to the 1st. That is just one agreement about what the open strings are. Change the open strings and **every note on the neck changes with them**, while the fret spacing stays exactly the same.

The open strings of standard tuning are not arbitrary. Going from the 6th string up:
- E → A, A → D, D → G: each a **perfect 4th** (5 frets)
- G → B: a **major 3rd** (4 frets), the one odd gap
- B → E: a perfect 4th again

Those gaps explain the shapes you already know. It is why a note on one string reappears **5 frets higher** on the string below, but only **4 frets** across the G and B strings.`
        },
        {
          type: 'fretboard',
          marks: openMarks(STD, { label: 'note' }),
          frets: [0, 5],
          caption: 'Standard tuning: E A D G B E (low to high). Click each open string. Gaps: 5, 5, 5, 4, 5 frets.'
        },
        {
          type: 'text',
          md: `### What changes when one string moves
Retune a single string and only the notes on **that string** move. Here is every **A** in the first 12 frets, first in standard tuning and then in Drop D (the low E string tuned down to D). Five of the six strings are identical; on the 6th string the A has slid from fret 5 to **fret 7**.`
        },
        {
          type: 'fretboard',
          marks: noteMarksIn(STD, 9, [0, 12], 'root', 'A'),
          frets: [0, 12],
          caption: 'Every A in standard tuning. On the 6th string it is at the 5th fret.'
        },
        {
          type: 'fretboard',
          marks: noteMarksIn(DD, 9, [0, 12], 'root', 'A').map((m) => (m.string === 6 ? { ...m, color: 'accent' as const } : m)),
          frets: [0, 12],
          tuning: DD,
          caption: 'Every A in Drop D. Only the 6th string has changed: the A moved from fret 5 to fret 7.'
        },
        {
          type: 'text',
          md: `### Why shapes move
A chord shape is a **pattern of fret numbers across the strings**. It only produces the chord you expect if the gaps between the strings are the ones the shape was designed for. Move a gap and the same fingers spell different notes.

The open **Em** shape (\`022000\`) is a good test. Here are the same three fingers in three tunings, with the notes each one plays:`
        },
        {
          type: 'chords',
          shapes: [EM],
          caption: 'Standard: E B E G B E. This is plain E minor.'
        },
        {
          type: 'chords',
          shapes: [EM],
          tuning: DD,
          caption: 'Drop D: D B E G B E. The low string now adds a D, the ♭7 of E, so the same fingers give Em7.'
        },
        {
          type: 'chords',
          shapes: [EM],
          tuning: DG,
          caption: 'DADGAD: D B E G A D. Still E, G and B, plus D and A: a hanging Em7 with an added 4th.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Em shape, standard', play: strumIn(EM, STD) },
            { label: 'Em shape, Drop D', play: strumIn(EM, DD) },
            { label: 'Em shape, DADGAD', play: strumIn(EM, DG) }
          ]
        },
        {
          type: 'text',
          md: `The fingers never moved; only the open strings underneath them did. Here are six tunings side by side. Read the **gaps** (in frets) from the lowest pair of strings up: wherever a gap differs from standard's 5, 5, 5, 4, 5, the shapes bend around it.`
        },
        {
          type: 'table',
          headers: ['Tuning', 'Open strings (low to high)', 'Gaps (frets)'],
          rows: TUNING_ROWS,
          caption: 'Drop D changes one string. DADGAD and the open tunings rebuild the whole set.'
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Use the **chromatic mode** of the Tuner page (Tuner & play-along) to check unusual tunings: guitar mode expects the standard six notes. Retune in small steps and check the string you moved again at the end, since moving one string shifts the neck tension a little.`
        },
        {
          type: 'tryIt',
          question: mc('Which two neighbouring open strings are a **major 3rd** apart in standard tuning?', 'G and B', ['E and A', 'D and G', 'B and high E'], {
            explain: 'G to B is 4 frets (a major 3rd). Every other neighbouring pair is a perfect 4th, 5 frets.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This board is in **Drop D**. Click the **E** on the **6th** string.',
            tuning: DD,
            frets: [0, 5],
            targets: [P(6, 2)],
            explain: 'The 6th string is open D, so E is a whole step (2 frets) higher: **fret 2**. In standard tuning that string would give E at fret 0.'
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: 'u15l2',
      title: 'The capo and capo math',
      summary: 'A movable nut: shape key, sounding key, and picking a capo fret for a singer.',
      blocks: [
        {
          type: 'text',
          md: `A **capo** clamps across all six strings at one fret, making that fret the new nut. Every open string is shortened, so every open string sounds **higher by the capo's fret number in semitones**. You keep playing the shapes you know; the whole song moves up.

Two keys matter, and mixing them up is the number one capo mistake:
- the **shape key**: the chords you are *fingering* (open G, C, D, Em…)
- the **sounding key**: the chords the audience *hears*

**Sounding key = shape key + capo fret** (counted in semitones).`
        },
        {
          type: 'fretboard',
          marks: openMarks(STD, { label: 'note', fret: 2, flats: false }),
          frets: [0, 7],
          capo: 2,
          caption: 'Capo on fret 2. The "open" strings now sit at the capo and sound F♯ B E A C♯ F♯ (low to high). Fret numbers still count from the original nut.'
        },
        {
          type: 'text',
          md: `### The capo example
Put the capo on **fret 3** and play the familiar open shapes **G, C, D, Em**. Each sounds three semitones higher: G → **B♭**, C → **E♭**, D → **F**, Em → **Gm**. To the audience the song is in B♭, a key that is awkward without a capo (it would need barre chords), but to your hands it is the easy key of G.

The diagrams below show the **shape** (counted from the capo). The audio is the **sounding** chord.`
        },
        {
          type: 'chords',
          shapes: [named(C.G, 'G → B♭'), named(C.C, 'C → E♭'), named(C.D, 'D → F'), named(C.Em, 'Em → Gm')],
          capo: 3,
          caption: 'Capo 3: shapes G, C, D, Em sound B♭, E♭, F, Gm. Click to hear the sounding chords.'
        },
        {
          type: 'fretboard',
          marks: shapeMarksIn(C.G, STD, { capo: 3, root: 10, label: 'note', flats: true }),
          frets: [0, 8],
          capo: 3,
          caption: 'The same G shape on the fretboard with the capo at fret 3: B♭ D F B♭ D B♭. B♭ is the root.',
          toolExamples: [{ kind: 'chord', root: 'Bb', type: 'maj', shape: C.G, tuning: STD, capo: 3 }]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G shape, no capo (G)', play: strumIn(C.G, STD) },
            { label: 'G shape, capo 3 (B♭)', play: strumIn(C.G, STD, 3) },
            { label: 'B♭ barre chord, no capo', play: strumIn(movableChord('Bb', 'maj', 5)!, STD) }
          ]
        },
        {
          type: 'text',
          md: `The second and third buttons are the same chord, **B♭ major**, voiced differently. The capo version rings with open strings, which is the other reason players love it: open strings ring longer and sound fuller than fretted ones.

### A capo chart
Find your shape family in the top row, then read down for the key the audience hears:`
        },
        {
          type: 'table',
          headers: ['', 'C shapes', 'G shapes', 'D shapes', 'A shapes', 'E shapes'],
          rows: CAPO_ROWS,
          caption: 'Each cell is the sounding major key. Minor shapes follow along: Em with capo 3 is Gm.'
        },
        {
          type: 'text',
          md: `### Choosing a capo position for a singer
Work **backwards** from the key the singer needs.
1. Decide the **target key** (the key the singer is comfortable in).
2. Pick a **shape family** you like: the open-chord keys C, A, G, E and D are the easy ones.
3. **Capo fret = target key − shape key**, going up through the semitones.

If the singer needs **B♭**, here are the options:`
        },
        {
          type: 'table',
          headers: ['Shape family', 'Capo', 'Feel'],
          rows: capoOptions(10),
          caption: 'Same sounding key, different hands. Lower capo positions keep the guitar sounding fuller.'
        },
        {
          type: 'text',
          md: `So the singer's B♭ is capo 3 with G shapes, or capo 1 with A shapes. A song written in **E** that is too low for the singer? They want G: capo 3 and keep playing the E-shape version (E + 3 = G). The progression stays the same in *relative* terms: a I–IV–V in the shapes is still a I–IV–V in the sounding key. Only the pitch moved.

### Practical points
- Place the capo just behind the fret wire (not on top of it) so it does not buzz or pull the strings sharp.
- **Retune with the capo on**; clamping often nudges strings sharp.
- High capo positions (above about 7) squeeze the frets and thin the tone. If the capo ends up very high, check whether a different shape family gives a lower position.
- A capo changes only the *pitch*. You still play the same chord names on paper; label your chart "capo 3, G shapes" so nobody misreads it.

### A partial capo (briefly)
A **partial or "cut" capo** presses on only some strings, leaving the rest open. For example, a capo on fret 2 across the 5th to 1st strings leaves the low E string open, so the open strings are **E B E A C♯ F♯** (low to high): a ready-made open drone chord, a different "tuning" with no retuning at all.`
        },
        {
          type: 'fretboard',
          marks: [m6(0, 'E'), m6(2, 'B', 5), m6(2, 'E', 4), m6(2, 'A', 3), m6(2, 'C#', 2), m6(2, 'F#', 1)],
          frets: [0, 5],
          caption: 'Partial capo on fret 2 over the 5th to 1st strings only: E B E A C♯ F♯. The low E stays open.'
        },
        {
          type: 'tab',
          capo: 2,
          bpm: 90,
          notation: true,
          caption: 'A G-shape arpeggio with capo 2. The tab counts frets from the capo (0 = the capo itself); it sounds in A.',
          toolExamples: [{ kind: 'chord', root: 'A', type: 'maj', shape: C.G, tuning: STD, capo: 2 }],
          events: [
            { pos: [P(6, 3)] },
            { pos: [P(4, 0)] },
            { pos: [P(3, 0)] },
            { pos: [P(2, 0)] },
            { pos: [P(1, 3)] },
            { pos: [P(2, 0)] },
            { pos: [P(3, 0)] },
            { pos: [P(4, 0)] }
          ]
        },
        {
          type: 'playIt',
          prompt: 'With a capo on fret 2, play the open 6th string. It should sound F♯.',
          targets: ['F#2'],
          hint: 'The low E string with a capo on fret 2 is F♯2. No capo? Play the 2nd fret of the 6th string instead: same pitch.',
          show: [P(6, 2)],
          frets: [0, 7]
        },
        {
          type: 'tryIt',
          question: mc('You play **C** shapes with a capo on **fret 4**. What key do you hear?', 'E', ['G', 'D', 'F'], {
            explain: 'Sounding key = shape key + capo: C + 4 semitones = **E**. (C → D♭ → D → E♭ → E.)'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'text',
            prompt: 'Your singer wants the key of **A**, and you want to play **G** shapes. Which capo fret? (a number)',
            accept: ['2', 'two', 'fret 2', 'capo 2'],
            explain: 'G up to A is 2 semitones: capo on **fret 2**.'
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: 'u15l3',
      title: 'Drop D and the low-D drone',
      summary: 'One string down a whole step: power chords with one finger, and a root–5th–octave stack.',
      blocks: [
        {
          type: 'text',
          md: `**Drop D** is standard tuning with only the **6th string lowered a whole step, from E to D**. Everything else is untouched, so every chord you know that does not use the 6th string is unchanged. What you gain is a deeper bass note and a new relationship between the three lowest strings.

### Getting there
Slowly tune the low E down to D (a whole step, 2 semitones). Two ways to check:
- The open 6th string should match the **4th string D**, one octave lower. Play the 12th-fret harmonic on the 6th string; it should match the open 4th string.
- **Fret 7 on the 6th string** should match the open 5th string (A). In standard tuning that match is at fret 5; the extra two frets are the whole step you lowered it.`
        },
        {
          type: 'playIt',
          prompt: 'Tune your low E string down to D, then play the open 6th string. Target: the low D.',
          targets: ['D2'],
          hint: 'It is the lowest note you can play: D below the bottom of standard tuning. Check it against the 4th string harmonic.',
          show: [P(6, 0)],
          frets: [0, 7],
          tuning: DD
        },
        {
          type: 'fretboard',
          marks: openMarks(DD, { label: 'note' }),
          frets: [0, 7],
          tuning: DD,
          caption: 'Drop D open strings: D A D G B E (low to high). The three lowest are D, A, D.'
        },
        {
          type: 'text',
          md: `### Root, 5th, octave on the bottom three strings
The low three strings are now **D A D**: a root, the **perfect 5th** above it, and the **octave** of the root. Their gaps are 7 frets (D to A) and 5 frets (A to D). Standard tuning has 5 and 5 there.

That is exactly the recipe for a **power chord**: root + 5th (+ octave). With the three strings spaced like this, you can flatten **one finger across the 6th, 5th and 4th strings** at any fret and get a power chord rooted on the 6th string. In standard tuning the same sound needs two fingers (\`355\` for G5).

- Fret 0: **D5** (D A D, all open)
- Fret 3: **F5** (F C F)
- Fret 5: **G5** (G D G)
- Fret 7: **A5** (A E A)`
        },
        {
          type: 'chords',
          shapes: [D5, F5, G5],
          tuning: DD,
          caption: 'Drop D power chords: one finger across the three lowest strings. D5 is all open.'
        },
        {
          type: 'fretboard',
          marks: [
            ...[0, 3, 5, 7].flatMap((f) => [
              { ...P(6, f), label: pcName(pcAt(P(6, f), DD)), color: 'root' as const },
              { ...P(5, f), label: pcName(pcAt(P(5, f), DD)), color: 'tone' as const },
              { ...P(4, f), label: pcName(pcAt(P(4, f), DD)), color: 'root' as const }
            ])
          ],
          frets: [0, 8],
          tuning: DD,
          caption: 'Frets 0, 3, 5 and 7 on the bottom three strings: D5, F5, G5, A5. Each pair of matching outer notes is the root; the middle note is the 5th.',
          toolExamples: [
            { kind: 'chord', root: 'D', type: 'power', shape: D5, tuning: DD },
            { kind: 'chord', root: 'F', type: 'power', shape: F5, tuning: DD },
            { kind: 'chord', root: 'G', type: 'power', shape: G5, tuning: DD },
            { kind: 'chord', root: 'A', type: 'power', shape: shape('A5', '777xxx'), tuning: DD }
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'D5 (open)', play: strumIn(D5, DD) },
            { label: 'F5 (fret 3)', play: strumIn(F5, DD) },
            { label: 'G5 (fret 5)', play: strumIn(G5, DD) }
          ]
        },
        {
          type: 'playIt',
          prompt: 'Play the three open bottom strings of Drop D one at a time, low to high: the root, the 5th and the octave of D5.',
          targets: ['D2', 'A2', 'D3'],
          hint: 'The 6th, 5th and 4th open strings. They spell D, then a perfect 5th up (A), then the octave of the first note (D).',
          show: [P(6, 0), P(5, 0), P(4, 0)],
          frets: [0, 5],
          tuning: DD
        },
        {
          type: 'tab',
          tuning: DD,
          timeSig: '4/4',
          bpm: 100,
          caption: 'A Drop D riff. Every chord is the same finger across three strings.',
          toolExamples: [progressionExample('D', ['I5', 'I5', 'I5', 'bIII5', 'IV5', 'I5', 'I5', 'V5', 'IV5'], 'naturalMinor', 100, 1)],
          events: [
            { pos: [P(6, 0), P(5, 0), P(4, 0)], beats: 1 },
            { pos: [P(6, 0), P(5, 0), P(4, 0)], beats: 0.5 },
            { pos: [P(6, 0), P(5, 0), P(4, 0)], beats: 0.5 },
            { pos: [P(6, 3), P(5, 3), P(4, 3)], beats: 1 },
            { pos: [P(6, 5), P(5, 5), P(4, 5)], beats: 1 },
            { pos: [P(6, 0), P(5, 0), P(4, 0)], beats: 1 },
            { pos: [P(6, 0), P(5, 0), P(4, 0)], beats: 1 },
            { pos: [P(6, 7), P(5, 7), P(4, 7)], beats: 1 },
            { pos: [P(6, 5), P(5, 5), P(4, 5)], beats: 1 }
          ]
        },
        {
          type: 'text',
          md: `### Full chords with the low D
The 6th string is no longer a problem for D chords. The familiar open **D** chord (\`xx0232\`) can now bring in the two lowest strings as well, so you strum all six strings: \`000232\`. Same for **Dm** (\`000231\`). The low open D is the root, so the bass rumbles under the chord instead of starting on the 4th string.`
        },
        {
          type: 'chords',
          shapes: [D_FULL, DM_FULL],
          tuning: DD,
          caption: 'D major (D A D A D F♯) and D minor (D A D A D F) with every string ringing.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Why it works:** the root D sits on the 6th string and again on the 4th, with the 5th (A) between them. The result is a chord whose bottom half is purely root and 5th, with no 3rd. Whatever the top strings add, major or minor, sits comfortably on top. Drop D suits keys where D is a strong note: D major and minor, G, B minor and anything with a pedal D.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In **Drop D**, select all three notes of **F5** with the root on the 6th string, then press Check.',
            tuning: DD,
            mode: 'all',
            frets: [0, 7],
            targets: [P(6, 3), P(5, 3), P(4, 3)],
            explain: 'D + 3 = F on the 6th string, A + 3 = C on the 5th and D + 3 = F on the 4th: F C F is F5, the same fret across three strings.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Why can a single finger make a power chord across the three lowest strings in Drop D?', 'They are tuned root, perfect 5th, octave', ['They are tuned in a major triad', 'The 6th string is muted', 'They are all the same note'], {
            explain: 'D–A–D is a root, the 5th above it and the octave of the root. Move that spacing up the neck with one finger and it stays a power chord.'
          })
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: 'u15l4',
      title: 'DADGAD and the suspended sound',
      summary: 'No 3rd anywhere: an open, modal tuning for drones, folk and Celtic music.',
      blocks: [
        {
          type: 'text',
          md: `**DADGAD** (said "dad-gad") takes standard tuning and lowers three strings by a whole step: the **6th string E → D**, the **2nd string B → A** and the **1st string E → D**. The strings, low to high, are **D A D G A D**.

The gaps between neighbours are 7, 5, 5, **2**, 5 frets. The old major-3rd gap between G and B is now a major 2nd (G to A), and no string is a 3rd above the root D.`
        },
        {
          type: 'fretboard',
          marks: openMarks(DG, { label: 'degree', root: 2 }),
          frets: [0, 5],
          tuning: DG,
          caption: 'DADGAD open strings as degrees of D: root, 5th, root, 4th, 5th, root. Notice there is no 3rd.',
          toolExamples: [{ kind: 'chord', root: 'D', type: 'sus4', shape: DG_SUS4, tuning: DG }]
        },
        {
          type: 'text',
          md: `### Why it is neither major nor minor
A chord is major or minor because of its **3rd**. Strum the open strings and you hear D, A and G only: a root (D), the 5th (A) and the **4th** (G). That is a **Dsus4** chord, a suspended chord (see [[u5l3]]). It is neither happy nor sad, just open and unresolved.

That ambiguity is the point of the tuning:
- Most of the strings are D, A and D: a drone that fits countless melodies.
- Melody notes from the top strings decide the mood. Play an F♯ and it leans major; play an F and it leans minor.
- It suits **modal** music: the Dorian and Mixolydian sounds of Celtic and folk tunes, which do not insist on a major or minor 3rd.`
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Open strings: Dsus4', play: strumIn(DG_SUS4, DG) },
            { label: 'Dsus2', play: strumIn(DG_SUS2, DG) },
            { label: 'D major', play: strumIn(DG_D, DG) },
            { label: 'D minor', play: strumIn(DG_DM, DG) }
          ]
        },
        {
          type: 'text',
          md: `### Common shapes
The 3rd is added with **one fretted note** and the clashing G (the 4th) is muted:
- **Dsus4**: strum all six open strings (\`000000\`).
- **Dsus2**: fret the D string at fret 2 (E) and mute the G string (\`002x00\`).
- **D major**: fret the D string at fret 4 (F♯) and mute the G string (\`004x00\`).
- **D minor**: fret the D string at fret 3 (F) and mute the G string (\`003x00\`).`
        },
        {
          type: 'chords',
          shapes: [DG_SUS4, DG_SUS2, DG_D, DG_DM],
          tuning: DG,
          caption: 'DADGAD chords built on the open drone. A × means mute that string.'
        },
        {
          type: 'fretboard',
          marks: [...noteMarksIn(DG, 6, [0, 7], 'accent', '3'), ...noteMarksIn(DG, 5, [0, 7], 'blue', '♭3')],
          frets: [0, 7],
          tuning: DG,
          caption: 'Where the missing 3rd lives in DADGAD: F♯ (labelled 3, the major 3rd) and F (labelled ♭3, the minor 3rd). Pick one to choose the mood.'
        },
        {
          type: 'text',
          md: `### Barre it and it is still sus4
Because the open strings are a sus4 shape, **one finger across all six strings** at any fret makes another sus4 chord, rooted on that fret's note. The shape moves without changing:

- Fret 2: **Esus4**
- Fret 3: **Fsus4**
- Fret 5: **Gsus4**
- Fret 7: **Asus4**
- Fret 9: **Bsus4**
- Fret 10: **Csus4**`
        },
        {
          type: 'chords',
          shapes: [DG_ESUS4, DG_GSUS4, DG_ASUS4],
          tuning: DG,
          caption: 'A full barre in DADGAD at frets 2, 5 and 7: Esus4, Gsus4 and Asus4.'
        },
        {
          type: 'tab',
          tuning: DG,
          bpm: 96,
          caption: 'A drone-and-melody figure. The open low D rings under every note while the melody walks on the top two strings.',
          events: [
            { pos: [P(6, 0), P(2, 0)] },
            { pos: [P(6, 0), P(2, 2)] },
            { pos: [P(6, 0), P(1, 0)] },
            { pos: [P(6, 0), P(1, 2)] },
            { pos: [P(6, 0), P(1, 0)] },
            { pos: [P(6, 0), P(2, 2)] },
            { pos: [P(6, 0), P(2, 0)] },
            { pos: [P(6, 0), P(5, 0), P(4, 0), P(3, 0), P(2, 0), P(1, 0)], beats: 2 }
          ]
        },
        {
          type: 'playIt',
          prompt: 'In DADGAD, play the open 6th, 2nd and 1st strings: D, A, D, the three strings you retuned.',
          targets: ['D2', 'A3', 'D4'],
          hint: 'Each of the three strings is a whole step lower than its standard note: E → D, B → A, E → D.',
          show: [P(6, 0), P(2, 0), P(1, 0)],
          frets: [0, 5],
          tuning: DG
        },
        {
          type: 'tryIt',
          question: mc('Strumming the open strings of DADGAD gives which chord?', 'Dsus4', ['D major', 'D minor', 'Dsus2'], {
            play: strumIn(DG_SUS4, DG),
            explain: 'The notes are D, A and G: root, 5th and **4th**, with no 3rd. That is Dsus4.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In **DADGAD** (fret range 0–5), click any **F♯** (the major 3rd of D).',
            tuning: DG,
            frets: [0, 5],
            targets: positionsOf(6, 0, 5, DG),
            explain: 'The 6th, 4th and 1st strings are all D, so F♯ is **4 frets** higher on each: fret 4.'
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: 'u15l5',
      title: 'Open G and Open D',
      summary: 'Tunings where the open strings are a chord: one-finger majors, slide guitar, and minors and 7ths.',
      blocks: [
        {
          type: 'text',
          md: `An **open tuning** tunes the open strings to the notes of a chord, so strumming with no fingers down already sounds like a chord. Barre one finger (or a slide) across the strings and you get a **major chord at every fret**. That is why open tunings are the home of slide and bottleneck guitar.

### Open G: D G D G B D
From standard, lower the **6th, 5th and 1st** strings by a whole step: E → D, A → G, E → D. The open strings are D, G, D, G, B, D: a **G major** chord (G B D), with D = the 5th, G = the root, B = the 3rd.`
        },
        {
          type: 'fretboard',
          marks: openMarks(OG, { label: 'degree', root: 7 }),
          frets: [0, 7],
          tuning: OG,
          caption: 'Open G open strings, as degrees of G: 5, R, 5, R, 3, 5. Every string is a chord tone.',
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj', shape: OG_G, tuning: OG }]
        },
        {
          type: 'chords',
          shapes: [OG_G, OG_C, OG_D],
          tuning: OG,
          caption: 'Open G: open = G, barre at the 5th fret = C, barre at the 7th fret = D.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Open strings: G', play: strumIn(OG_G, OG) },
            { label: 'Fret 5 barre: C', play: strumIn(OG_C, OG) },
            { label: 'Fret 7 barre: D', play: strumIn(OG_D, OG) },
            {
              label: '12-bar blues in G',
              play: { ...seqIn([OG_G, OG_G, OG_G, OG_G, OG_C, OG_C, OG_G, OG_G, OG_D, OG_C, OG_G, OG_D], OG, 2, 100), toolExample: progressionExample('G', ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'], 'major', 100, 2) }
            }
          ]
        },
        {
          type: 'text',
          md: `### One-finger harmony
The three chords of a blues in G (I, IV, V) are the open strings, the 5th fret and the 7th fret. Check by notes: fret 5 across the strings gives G C G C E G, which is a **C major** chord; fret 7 gives A D A D F♯ A, which is **D major**. The 12th fret gives the open strings again an octave higher.

With a slide, rest it **directly over the fret wire** (not behind it, as for a fretted note) and let the strings behind it be damped by your other fingers.`
        },
        {
          type: 'fretboard',
          marks: toneMarksIn(OG, 7, [0, 4, 7], [0, 12]),
          toolExamples: [{ kind: 'chord', root: 'G', type: 'maj', tuning: OG }],
          frets: [0, 12],
          tuning: OG,
          playAll: true,
          caption: 'Every G (R), B (3) and D (5) in Open G up to the 12th fret. Every chord tone sits within reach of the open strings and the barre.'
        },
        {
          type: 'text',
          md: `### Open D: D A D F♯ A D
Open D is the same idea for D major (D F♯ A). From standard: the **6th string E → D**, the **3rd string G → F♯**, the **2nd string B → A** and the **1st string E → D**. The barre trick is identical to Open G: the open strings are the chord, and any fret across all six strings is another major chord.`
        },
        {
          type: 'fretboard',
          marks: openMarks(OD, { label: 'degree', root: 2 }),
          frets: [0, 7],
          tuning: OD,
          caption: 'Open D, as degrees of D: R 5 R 3 5 R. The 3rd is on the 3rd string.',
          toolExamples: [{ kind: 'chord', root: 'D', type: 'maj', shape: OD_D, tuning: OD }]
        },
        {
          type: 'chords',
          shapes: [OD_D, OD_G, OD_A],
          tuning: OD,
          caption: 'Open D: open = D, fret 5 barre = G, fret 7 barre = A.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Open E is Open D, a whole step higher:** E B E G♯ B E. It holds the same shapes with a brighter sound, but the strings are under more tension. Many players stay with Open D and use a capo at fret 2 to reach the same pitches without stressing the strings.`
        },
        {
          type: 'text',
          md: `### Minor and 7th chords
In an open tuning the 3rd is built into the open strings, and a string cannot be tuned *lower* by fretting, so a minor chord is not simply "one fret down". You get a minor chord by **muting the major 3rd** and finding the ♭3 elsewhere. A 7th chord needs the 7th added, usually on a higher string.

Open G:
- **Gm** (\`0300x0\`): fret the 5th string at fret 3 (B♭) and mute the 2nd string (the B).
- **G7** (\`000003\`): fret the 1st string at fret 3 (F).
- **Gmaj7** (\`000004\`): fret the 1st string at fret 4 (F♯).

Open D:
- **Dm** (\`003x00\`): fret the 4th string at fret 3 (F) and mute the 3rd string (the F♯).
- **D7** (\`000030\`): fret the 2nd string at fret 3 (C).`
        },
        {
          type: 'chords',
          shapes: [OG_GM, OG_G7, OG_GMAJ7],
          tuning: OG,
          caption: 'Open G: Gm, G7 and Gmaj7 from the open G chord.'
        },
        {
          type: 'chords',
          shapes: [OD_DM, OD_D7],
          tuning: OD,
          caption: 'Open D: Dm and D7 from the open D chord.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'G', play: strumIn(OG_G, OG) },
            { label: 'Gm', play: strumIn(OG_GM, OG) },
            { label: 'G7', play: strumIn(OG_G7, OG) },
            { label: 'Gmaj7', play: strumIn(OG_GMAJ7, OG) }
          ]
        },
        {
          type: 'tab',
          tuning: OG,
          timeSig: '4/4',
          bpm: 90,
          caption: 'Open G arpeggios on a I–IV–V: G (open), C (fret 5), D (fret 7). The same finger shape moves up the neck.',
          toolExamples: [progressionExample('G', ['I', 'IV', 'V'], 'major', 90)],
          events: [
            ...arpThenChord([P(5, 0), P(3, 0), P(2, 0), P(1, 0)], 0.5, 2),
            ...arpThenChord([P(5, 5), P(3, 5), P(2, 5), P(1, 5)], 0.5, 2),
            ...arpThenChord([P(5, 7), P(3, 7), P(2, 7), P(1, 7)], 0.5, 2)
          ]
        },
        {
          type: 'playIt',
          prompt: 'Tune your 6th, 5th and 1st strings down a whole step to Open G, then play all six open strings from low to high.',
          targets: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
          hint: 'D G D G B D. The 4th, 3rd and 2nd strings stay where they were.',
          show: [P(6, 0), P(5, 0), P(4, 0), P(3, 0), P(2, 0), P(1, 0)],
          frets: [0, 5],
          tuning: OG
        },
        {
          type: 'tryIt',
          question: mc('In Open G, which fret barred across all six strings gives a **C** chord?', '5', ['3', '7', '12'], {
            explain: 'C is a 4th above G, and a 4th is 5 frets. Fret 5 gives G C G C E G. Fret 7 would be D.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'In Open G, click an open string that is the **root (G)**.',
            tuning: OG,
            showTuning: false,
            frets: [0, 3],
            targets: [P(5, 0), P(3, 0)],
            explain: 'Open G is D G D G B D. The 5th and 3rd strings are both open G: the roots of the chord.'
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: 'u15l6',
      title: 'Tuning down: pitch versus shapes',
      summary: 'Half step down and beyond: why bands do it, and how it fits with capo math.',
      blocks: [
        {
          type: 'text',
          md: `Tuning **down a half step** means every string is lowered by one fret: **E♭ A♭ D♭ G♭ B♭ E♭**. Nothing about the *relationships* between the strings changes, so all your shapes and tab fret numbers work exactly as before. What changes is the **pitch**: everything sounds one semitone lower.

That is the mirror image of a capo. A capo shifts the pitch up and leaves the shapes alone; tuning down shifts it down and leaves the shapes alone.`
        },
        {
          type: 'fretboard',
          marks: openMarks(HS, { label: 'note', flats: true }),
          frets: [0, 5],
          tuning: HS,
          caption: 'Half step down: E♭ A♭ D♭ G♭ B♭ E♭ (low to high). Same gaps as standard, 5, 5, 5, 4, 5, every note a fret lower.'
        },
        {
          type: 'chords',
          shapes: [named(C.E, 'E → E♭'), named(C.A, 'A → A♭'), named(C.D, 'D → D♭'), named(C.G, 'G → G♭')],
          tuning: HS,
          caption: 'The shapes you know, tuned a half step down: they sound E♭, A♭, D♭ and G♭ major.'
        },
        {
          type: 'audioRow',
          items: [
            { label: 'E shape, standard', play: strumIn(C.E, STD) },
            { label: 'E shape, half step down', play: strumIn(C.E, HS) },
            { label: 'Down a half step + capo 1', play: strumIn(C.E, HS, 1) }
          ]
        },
        {
          type: 'text',
          md: `The second button is one semitone lower than the first. The third combines the two ideas: tune down a half step, then add a capo at fret 1, and you are back to the original pitch, because **down 1 and up 1 cancel**.

### Why bands tune down
- **The singer.** A song may sit slightly too high; dropping the guitar a half or whole step brings it into range without learning new shapes.
- **Matching recordings.** Many classic recordings were played in E♭ tuning (or lower); playing along means tuning to match.
- **Feel.** Looser strings bend more easily and give a thicker, darker tone, which suits heavy styles.
- **Keys.** Songs written in flat keys such as E♭ or A♭ become friendly open-position songs.

Costs: the strings feel slacker, may buzz, and intonation can shift, so deeper tunings often need heavier strings and a setup. And every other instrument playing with you must match, or you transpose.

### Pitch versus shapes
Keep two ideas separate:
- **Shape names** (what you finger) and **tab frets** do not change.
- **Sounding pitch** does: it moves by *capo − tuned-down amount* semitones.

Mixing them gives a simple formula:`
        },
        {
          type: 'table',
          headers: ['Setup', 'Net shift', 'G shapes sound'],
          rows: [
            ['Standard, no capo', '0', 'G'],
            ['Half step down', '−1', 'G♭ (F♯)'],
            ['Whole step down', '−2', 'F'],
            ['Capo 3', '+3', 'B♭'],
            ['Half step down + capo 3', '+2', 'A'],
            ['Whole step down + capo 2', '0', 'G']
          ],
          caption: 'Net shift = capo fret − semitones tuned down.'
        },
        {
          type: 'tab',
          tuning: HS,
          flats: true,
          bpm: 90,
          caption: 'A simple open-string figure in half-step-down tuning. The numbers are the same as in standard; the staff above shows the real, lower pitches.',
          toolExamples: [{ kind: 'chord', root: 'Eb', type: 'min', shape: C.Em, tuning: HS }],
          events: [
            { pos: [P(6, 0)] },
            { pos: [P(5, 2)] },
            { pos: [P(4, 2)] },
            { pos: [P(3, 0)] },
            { pos: [P(2, 0)] },
            { pos: [P(1, 0)] },
            { pos: [P(6, 0), P(5, 2), P(4, 2), P(3, 0), P(2, 0), P(1, 0)], beats: 2 }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `Tune down gradually, a little at a time, and retune once the strings settle. Whole step down (D G C F A D) works the same way: every shape sounds two semitones lower. Always say which tuning a song uses on your chart, for example "E♭ tuning, play E shapes."`
        },
        {
          type: 'playIt',
          prompt: 'Tune the whole guitar down a half step, then play the open 6th string. It sounds E♭.',
          targets: ['Eb2'],
          hint: 'Use the Tuner page in chromatic mode: the low string should read E♭.',
          show: [P(6, 0)],
          frets: [0, 5],
          tuning: HS
        },
        {
          type: 'text',
          md: `### The tunings at a glance`
        },
        {
          type: 'table',
          headers: ['Tuning', 'Strings (low to high)', 'Best for'],
          rows: [
            ['Standard', 'E A D G B E', 'Everything; the reference'],
            ['Drop D', 'D A D G B E', 'Heavy riffs, one-finger power chords, the key of D'],
            ['DADGAD', 'D A D G A D', 'Folk, Celtic, drones, modal music'],
            ['Open G', 'D G D G B D', 'Slide, blues, one-finger major chords'],
            ['Open D', 'D A D F♯ A D', 'Slide, blues, folk'],
            ['Half step down', 'E♭ A♭ D♭ G♭ B♭ E♭', 'Matching recordings, easier on the voice'],
            ['Whole step down', 'D G C F A D', 'Lower, heavier, singer-friendly']
          ]
        },
        {
          type: 'tryIt',
          question: mc('You tune down a half step and play an open **A** chord shape. What sounds?', 'A♭ major', ['A major', 'G major', 'B♭ major'], {
            explain: 'The shape is A, and every pitch is one semitone lower: A − 1 = **A♭**.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Tuned **down a whole step** with a **capo on fret 2**, G shapes sound in…', 'G', ['F', 'A', 'E'], {
            explain: 'Net shift = capo (+2) − tuned down (2) = 0, so the shapes sound where they are written: **G**.'
          })
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      mc('In standard tuning, which interval separates the **G** and **B** strings?', 'Major 3rd (4 frets)', ['Perfect 4th (5 frets)', 'Minor 3rd (3 frets)', 'Perfect 5th (7 frets)'], {
        explain: 'Every neighbouring pair is a perfect 4th except G to B, which is a major 3rd.'
      }),
      mc('To go from standard tuning to **Drop D** you…', 'lower the 6th string a whole step (E to D)', ['lower all strings a half step', 'raise the 6th string to F', 'lower the 5th string to G'], {
        explain: 'Drop D changes only the 6th string, from E down to D.'
      }),
      {
        kind: 'fretboard',
        mode: 'all',
        frets: [0, 7],
        tuning: DD,
        prompt: 'In **Drop D**, select the three notes of **G5** with its root on the 6th string, then press Check.',
        targets: [P(6, 5), P(5, 5), P(4, 5)],
        explain: 'Fret 5 on D, A and D gives G, D and G: root, 5th, octave of G.'
      },
      mc('What fret on the 6th string of Drop D matches the open **5th** string (A)?', '7', ['5', '2', '12'], {
        explain: 'D + 7 semitones = A. (In standard tuning the match is at fret 5.)'
      }),
      mc('Why is the Drop D power chord easy to play?', 'The three lowest strings are D A D (root, 5th, octave), so one finger flat across them is a power chord', ['The 6th string is muted', 'It uses an open E string', 'All three strings play the same note'], {
        explain: 'The spacing of the bottom three strings is already a power chord, so a flat finger can move it anywhere.'
      }),
      mc('You put a capo on **fret 2** and play **D** shapes. The key you hear is…', 'E', ['C', 'F♯', 'D'], {
        explain: 'D + 2 semitones = **E**.'
      }),
      mc('A song is in **B♭** and you want to play **G** shapes. Which capo fret?', '3', ['1', '5', '6'], {
        explain: 'G up to B♭ is 3 semitones (G → A♭ → A → B♭): capo 3.'
      }),
      {
        kind: 'text',
        prompt: 'Capo on fret 5, playing **G** shapes. What major chord do you hear? (just the note name)',
        accept: ['C'],
        explain: 'G + 5 semitones = **C**.'
      },
      {
        kind: 'fretboard',
        prompt: 'The capo is on fret 2, so every fret behind it is dead. Click the fret on the 6th string where you play **A** (counting from the nut, frets 0–8).',
        capo: 2,
        frets: [0, 8],
        targets: [P(6, 5)],
        explain: 'On the low E string A is 5 frets above the open string. Fret numbers still count from the original nut, so with the capo at 2 that is **fret 5**, three frets above the capo.'
      },
      mc('The open strings of **DADGAD** make which chord?', 'Dsus4', ['D major', 'D minor', 'G major'], {
        play: strumIn(DG_SUS4, DG),
        explain: 'D, A and G: root, 5th and 4th with no 3rd. A suspended chord.'
      }),
      mc('Why is DADGAD often described as neither major nor minor?', 'It has no 3rd in its open strings', ['It has no 5th', 'It uses the wrong strings', 'It is tuned one octave lower'], {
        explain: 'Major or minor depends on the 3rd. DADGAD is D, A, G: root, 5th, 4th. Your fretted notes choose the mood.'
      }),
      {
        kind: 'fretboard',
        prompt: 'In **DADGAD**, click the **F** (the minor 3rd of D) on the **4th** string.',
        tuning: DG,
        frets: [0, 5],
        targets: [P(4, 3)],
        explain: 'The 4th string is open D. F is 3 semitones above D: fret **3**.'
      },
      mc('Strumming the open strings of **Open G** (D G D G B D) gives…', 'G major', ['G minor', 'G7', 'D major'], {
        play: strumIn(OG_G, OG),
        explain: 'G, B and D: a G major triad.'
      }),
      mc('In Open G, a barre across all six strings at the **7th fret** gives…', 'D major', ['C major', 'E major', 'G major'], {
        visual: { type: 'chords', shapes: [OG_D], tuning: OG, caption: 'Open G, barre at fret 7' },
        explain: 'G + 7 semitones = D. The strings read A D A D F♯ A: D major.'
      }),
      mc('The open strings of **Open D** (D A D F♯ A D) sound a…', 'D major chord', ['D minor chord', 'Dsus4 chord', 'D5 power chord'], {
        play: strumIn(OD_D, OD),
        explain: 'D, F♯ and A: the major 3rd (F♯) is on the 3rd string. D major.'
      }),
      mc('Tuned down a **half step**, you play an open **G** chord shape. The chord you hear is…', 'F♯/G♭ major', ['G major', 'A♭ major', 'F major'], {
        explain: 'Every pitch is one semitone lower than normal: G − 1 = F♯/G♭.'
      }),
      mc('Which is a reason players tune the whole guitar down a half step?', 'To bring the song into the singer\'s range or match a recording while keeping familiar shapes', ['To make the strings tighter', 'To change the shapes of chords', 'To raise the pitch'], {
        explain: 'The shapes and tab stay the same, but everything sounds lower.'
      }),
      mc('The open **Em** shape (\`022000\`) in **Drop D** plays D B E G B E. The chord is…', 'Em7', ['Em', 'E major', 'Em6'], {
        visual: { type: 'chords', shapes: [EM], tuning: DD },
        explain: 'E G B D: E minor with a ♭7 (D) from the lowered 6th string.'
      }),
      mc('Which two moves together leave the pitch of your shapes unchanged?', 'Tune down a half step and capo fret 1', ['Tune down a half step and capo fret 2', 'Capo fret 3 and tune down a whole step', 'Drop D and capo fret 2'], {
        explain: 'Net shift = capo − tuned down: 1 − 1 = 0.'
      })
    ],
    generators: [capoForward, capoReverse, openStringNote, fretOnRetuned, clickTunedNote, capoPlusTuning]
  }
}

/** A mark on string `s` at an absolute fret, used for the partial-capo diagram. */
function m6(fret: number, label: string, s = 6): FretMark {
  return { string: s, fret, label, color: fret === 0 ? 'root' : 'tone' }
}

export default unit
