import type { FretMark, PlaySpec, QuizQuestion, Unit } from '../types'
import { mc, playChord, rand, strum } from '../helpers'
import { progressionExample, type ToolExample } from '../toolExamples'
import { ChordShape, OPEN_CHORDS, movableChord, pcAt, shape, shapeMidis, shapePositions } from '@/theory/guitar'
import { CHORDS, ChordType, chordNames, chordSymbol, diatonicChords } from '@/theory/chords'
import { intervalToDegree } from '@/theory/scales'
import { transpose } from '@/theory/intervals'
import { pitchClass, pretty } from '@/theory/notes'

// ---------- local helpers ----------

const pr = (s: string) => pretty(s)
const spelled = (root: string, type: ChordType) => chordNames(root, type).map(pr).join(' ')

/**
 * Movable chord from the theory engine, with the barre marker kept only when
 * at least three strings really share the barre fret (so non-barre shapes like
 * the E-form maj7 don't get a misleading barre drawn across them).
 */
function mv(root: string, type: ChordType, rootString: 5 | 6): ChordShape {
  const s = movableChord(root, type, rootString)
  if (!s) throw new Error(`No ${type} form on string ${rootString}`)
  const out: ChordShape = { ...s, name: pr(s.name) }
  if (out.barre !== undefined && out.frets.filter((f) => f === out.barre).length < 3) delete out.barre
  return out
}

/** Degree label for every note of a shape, using the chord's formula (R, 3, ♭7, 9…). */
function degreeMarks(sh: ChordShape, root: string, type: ChordType): FretMark[] {
  const deg = new Map(
    CHORDS[type].intervals.map((iv) => {
      const d = intervalToDegree(iv).replace('𝄫', '♭♭')
      return [pitchClass(transposeName(root, iv)), d === '1' ? 'R' : d] as [number, string]
    })
  )
  return shapePositions(sh).map((p) => ({ ...p, label: deg.get(pcAt(p)) ?? '?', color: pcAt(p) === pitchClass(root) ? 'root' : 'tone' }))
}
const transposeName = (root: string, iv: string) => transpose(root, iv)

/** Play a list of shapes as a chord progression. */
const progression = (shapes: ChordShape[], beats = 2, bpm = 80, mode: 'strum' | 'arpeggio' = 'strum', toolExample?: ToolExample): PlaySpec => ({
  kind: 'sequence',
  bpm,
  toolExample,
  events: shapes.map((s) => ({ notes: shapeMidis(s), beats, mode }))
})

const QUALITY_LABEL: Partial<Record<ChordType, string>> = {
  maj7: 'Major 7th',
  dom7: 'Dominant 7th',
  min7: 'Minor 7th',
  m7b5: 'Half-diminished (m7♭5)',
  dim7: 'Diminished 7th'
}
const SEVENTHS: ChordType[] = ['maj7', 'dom7', 'min7', 'm7b5', 'dim7']

const QUALITY_FEEL: Partial<Record<ChordType, string>> = {
  maj7: 'soft, dreamy and settled: a major triad with a bittersweet major 7th on top',
  dom7: 'bluesy and restless: it wants to move (usually up a 4th)',
  min7: 'mellow and smooth: a minor chord with the edge taken off',
  m7b5: 'dark and unresolved: like a minor 7th with a sinking ♭5',
  dim7: 'tense and suspenseful: stacked minor 3rds, the classic "villain" chord'
}

// ---------- shapes used in the lessons ----------

const G_SIX = { maj7: mv('G', 'maj7', 6), dom7: mv('G', 'dom7', 6), min7: mv('G', 'min7', 6), m7b5: mv('G', 'm7b5', 6), dim7: mv('G', 'dim7', 6) }
const C_FIVE = { maj7: mv('C', 'maj7', 5), dom7: mv('C', 'dom7', 5), min7: mv('C', 'min7', 5), m7b5: mv('C', 'm7b5', 5), dim7: mv('C', 'dim7', 5) }

// Diatonic sevenths of C, in one area of the neck
const C_DIATONIC: ChordShape[] = [
  mv('C', 'maj7', 5), // x35453
  mv('D', 'min7', 5), // x57565
  mv('E', 'min7', 5), // x79787
  mv('F', 'maj7', 6), // 1x221x
  mv('G', 'dom7', 6), // 353433
  mv('A', 'min7', 6), // 575555
  mv('B', 'm7b5', 6), // 7x776x
  { ...mv('C', 'maj7', 6), name: 'Cmaj7' } // 8x998x
]

// Shell voicings
const SHELL = {
  Gmaj7: shape('Gmaj7', '3x44xx'),
  G7: shape('G7', '3x34xx'),
  Gm7: shape('Gm7', '3x33xx'),
  Cmaj7: shape('Cmaj7', 'x324xx'),
  C7: shape('C7', 'x323xx'),
  Cm7: shape('Cm7', 'x313xx'),
  Dm7: shape('Dm7', 'x535xx'),
  A7: shape('A7', '5x56xx'),
  D7: shape('D7', 'x545xx'),
  E7: shape('E7', 'x767xx')
}

// Full barre 7ths for the blues in A
const A7_BAR = movableChord('A', 'dom7', 6) as ChordShape // 5 7 5 6 5 5
const D7_BAR = movableChord('D', 'dom7', 5) as ChordShape // x 5 7 5 7 5
const E7_BAR = movableChord('E', 'dom7', 5) as ChordShape // x 7 9 7 9 7

// 6ths, sus, add9
const SIXTHS = { G6: shape('G6', '320000', '210000'), D6: shape('D6', 'xx0202', 'xx0102'), Am6: shape('Am6', 'x02212', 'x02314'), Dm6: shape('Dm6', 'xx0201', 'xx0201') }
const A7SUS4 = shape('A7sus4', 'x02030', 'x02030')
const CSUS2 = shape('Csus2', 'x30013', 'x30014')
const GADD9 = shape('Gadd9', '320203', '210304')

// Extensions and altered dominants
const EXT = {
  C9: shape('C9', 'x32333', 'x21333', 3),
  Cmaj9: shape('Cmaj9', 'x3243x', 'x2143x'),
  Cm9: shape('Cm9', 'x3133x', 'x2134x'),
  C11: shape('C11', 'x3333x', 'x1111x', 3),
  Cm11: shape('Cm11', 'x3334x', 'x1112x', 3),
  G13: shape('G13', '3x345x', '1x234x'),
  C13: shape('C13', 'x 3 2 3 5 5', 'x 2 1 3 4 4'),
  C7b9: shape('C7♭9', 'x3232x', 'x2131x'),
  C7s9: shape('C7♯9', 'x3234x', 'x2134x'),
  E7s9: shape('E7♯9', '07678x', '02134x')
}

// ---------- generated questions ----------

const hasDouble = (names: string[]) => names.some((n) => /##|bb/.test(n.slice(1)))

const SPELL_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab', 'F#', 'C#', 'Db']

const spellSeventh = (): QuizQuestion => {
  let root = 'C'
  let type: ChordType = 'maj7'
  let names: string[] = []
  do {
    root = rand(SPELL_ROOTS)
    type = rand(SEVENTHS)
    names = chordNames(root, type)
  } while (hasDouble(names))
  return {
    kind: 'spell',
    prompt: `Spell **${pr(chordSymbol(root, type))}** (${CHORDS[type].name}), root first.`,
    answer: names,
    explain: `Formula **${CHORDS[type].formula}** from ${pr(root)}: **${names.map(pr).join(' ')}**.`
  }
}

const hearQuality = (): QuizQuestion => {
  const type = rand(SEVENTHS)
  const rs = rand([5, 6] as const)
  const root = rand(rs === 6 ? ['F', 'G', 'A', 'Bb', 'B', 'C'] : ['C', 'D', 'Eb', 'E', 'F', 'G'])
  const sh = mv(root, type, rs)
  return mc('Listen. What kind of seventh chord is this?', QUALITY_LABEL[type]!, SEVENTHS.filter((t) => t !== type).map((t) => QUALITY_LABEL[t]!), {
    play: strum(sh),
    explain: `That was **${pr(chordSymbol(root, type))}**, ${CHORDS[type].formula}. It sounds ${QUALITY_FEEL[type]}.`
  })
}

const DIATONIC_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']
const DEGREE_WORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th']

const diatonicSeventh = (): QuizQuestion => {
  const key = rand(DIATONIC_KEYS)
  const chords = diatonicChords(key, 'major', true)
  const c = rand(chords)
  const wrong = (['maj7', 'dom7', 'min7', 'm7b5'] as ChordType[]).filter((t) => t !== c.type).map((t) => pr(chordSymbol(c.root, t)))
  return mc(`In **${pr(key)} major**, which seventh chord is built on the **${DEGREE_WORD[c.degree]} degree** (${pr(c.root)})?`, pr(c.symbol), wrong, {
    explain: `Stacking thirds from ${pr(c.root)} using only notes of ${pr(key)} major gives **${pr(c.symbol)}** (${c.roman}). The pattern in every major key: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7.`
  })
}

const findToneInShape = (): QuizQuestion => {
  const type = rand(['maj7', 'dom7', 'min7', 'm7b5'] as ChordType[])
  const rs = rand([5, 6] as const)
  const root = rand(rs === 6 ? ['F', 'G', 'A', 'B', 'C'] : ['C', 'D', 'E', 'F', 'G'])
  const sh = mv(root, type, rs)
  const tones = chordNames(root, type)
  const which = rand([1, 3] as const) // index into chord tones: 3rd or 7th
  const label = which === 1 ? (type === 'maj7' || type === 'dom7' ? '3rd' : '♭3') : type === 'maj7' ? '7th' : '♭7'
  const target = tones[which]
  const pos = shapePositions(sh)
  const targets = pos.filter((p) => pcAt(p) === pitchClass(target))
  const frets = pos.map((p) => p.fret)
  return {
    kind: 'fretboard',
    prompt: `This is **${pr(chordSymbol(root, type))}** (root on the ${rs}th string, red). Click its **${label}**.`,
    marks: pos.map((p) => ({ ...p, color: pcAt(p) === pitchClass(root) ? 'root' : 'tone' })),
    frets: [Math.max(0, Math.min(...frets) - 2), Math.max(...frets) + 2],
    targets,
    explain: `The ${label} of ${pr(chordSymbol(root, type))} is **${pr(target)}**. In this shape it's on the ${targets.map((t) => `${t.string}${t.string === 1 ? 'st' : t.string === 2 ? 'nd' : t.string === 3 ? 'rd' : 'th'} string, fret ${t.fret}`).join(' and ')}.`
  }
}

const NAME_TYPES: ChordType[] = ['maj7', 'dom7', 'min7', 'm7b5', 'maj6', 'min6', 'dom9', 'add9', 'sus4', 'sus2']

const nameFromNotes = (): QuizQuestion => {
  let root = 'C'
  let type: ChordType = 'maj7'
  let names: string[] = []
  do {
    root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'])
    type = rand(NAME_TYPES)
    names = chordNames(root, type)
  } while (hasDouble(names))
  const others = NAME_TYPES.filter((t) => t !== type)
  const pick = [...others].sort(() => Math.random() - 0.5).slice(0, 3)
  return mc(`Which chord is spelled **${names.map(pr).join(' – ')}** (root first)?`, pr(chordSymbol(root, type)), pick.map((t) => pr(chordSymbol(root, t))), {
    explain: `Measured from ${pr(root)}, those notes are **${CHORDS[type].formula}**: a ${CHORDS[type].name} chord, **${pr(chordSymbol(root, type))}**.`
  })
}

// ---------- unit ----------

const unit: Unit = {
  id: 'u9',
  number: 9,
  title: 'Seventh chords and extensions',
  summary: 'The five seventh-chord qualities, diatonic sevenths, guitar voicings and shells, 6ths, sus and add9, and extended and altered dominants.',
  lessons: [
    {
      id: 'u9l1',
      title: 'Building seventh chords',
      summary: 'Stack one more third on a triad and you get five new chord colours.',
      blocks: [
        {
          type: 'text',
          md: `A triad stacks two thirds: root, 3rd, 5th. Stack **one more third** on top and you reach the **7th**, giving a four-note **seventh chord**.

Two things decide the chord's quality:
- the **triad** underneath (major, minor or diminished), and
- the **kind of 7th** on top: a **major 7th** (11 frets above the root, one fret below the octave), a **minor 7th** (10 frets, two below the octave), or a **diminished 7th** (9 frets, which sounds like a 6th).

That gives the five seventh chords every guitarist needs:`
        },
        {
          type: 'table',
          headers: ['Chord', 'Symbol', 'Formula', 'Stack of 3rds', 'Notes from C'],
          rows: [
            ['Major 7th', 'Cmaj7', '1 3 5 7', 'M3 + m3 + M3', spelled('C', 'maj7')],
            ['Dominant 7th', 'C7', '1 3 5 ♭7', 'M3 + m3 + m3', spelled('C', 'dom7')],
            ['Minor 7th', 'Cm7', '1 ♭3 5 ♭7', 'm3 + M3 + m3', spelled('C', 'min7')],
            ['Half-diminished', 'Cm7♭5 (Cø7)', '1 ♭3 ♭5 ♭7', 'm3 + m3 + M3', spelled('C', 'm7b5')],
            ['Diminished 7th', 'C°7', '1 ♭3 ♭5 𝄫7', 'm3 + m3 + m3', spelled('C', 'dim7')]
          ]
        },
        {
          type: 'tip',
          tone: 'warning',
          md: `**"7" on its own means dominant.** C7 has a **♭7** (B♭), not B. If you want the major 7th you must write **maj7** (or Δ7). This trips up nearly everyone at first.`
        },
        {
          type: 'staff',
          caption: 'The five seventh chords on C. Note the B𝄫 (B double-flat) in C°7: it sounds like A, but it is a kind of 7th, so it is spelled as a B.',
          notes: [
            { keys: ['C/4', 'E/4', 'G/4', 'B/4'], duration: 'w' },
            { keys: ['C/4', 'E/4', 'G/4', 'Bb/4'], duration: 'w' },
            { keys: ['C/4', 'Eb/4', 'G/4', 'Bb/4'], duration: 'w' },
            { keys: ['C/4', 'Eb/4', 'Gb/4', 'Bb/4'], duration: 'w' },
            { keys: ['C/4', 'Eb/4', 'Gb/4', 'Bbb/4'], duration: 'w' }
          ],
          bpm: 70
        },
        {
          type: 'text',
          md: `### Hear the five colours
Each quality has a distinct personality. Listen to them all on the same root and try to describe each one in a word:`
        },
        {
          type: 'audioRow',
          items: SEVENTHS.map((t) => ({ label: pr(chordSymbol('C', t)), play: playChord('C', t, 3, 'strum') }))
        },
        {
          type: 'table',
          headers: ['Chord', 'Sound', 'Where you hear it'],
          rows: [
            ['maj7', 'soft, dreamy, settled', 'ballads, bossa nova, neo-soul, the I and IV chords'],
            ['7', 'bluesy, restless, wants to move', 'the blues, the V chord in any key'],
            ['m7', 'mellow, smooth', 'funk vamps, the ii chord, soul'],
            ['m7♭5', 'dark, sinking', 'the vii chord, ii in minor keys'],
            ['°7', 'tense, suspenseful, symmetrical', 'passing chords, classical and gypsy jazz']
          ]
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Arpeggiate Cmaj7', play: playChord('C', 'maj7', 3, 'arpeggio') },
            { label: 'Arpeggiate C7', play: playChord('C', 'dom7', 3, 'arpeggio') },
            { label: 'Arpeggiate Cm7', play: playChord('C', 'min7', 3, 'arpeggio') }
          ]
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell **G7**, root first.',
            answer: chordNames('G', 'dom7'),
            explain: 'G major triad (G B D) plus a minor 7th (F): **G B D F**.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Which seventh chord is a **minor triad** with a **minor 7th**?', 'm7', ['maj7', '7', 'm7♭5'], {
            explain: 'Minor triad + ♭7 = **m7** (1 ♭3 5 ♭7). m7♭5 also has a ♭7, but its triad is diminished.'
          })
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which seventh chord is this?', 'Major 7th', ['Dominant 7th', 'Minor 7th', 'Diminished 7th'], {
            play: strum(OPEN_CHORDS.Cmaj7),
            explain: 'The soft, dreamy shimmer of the major 7th (B, one fret below the C root) is **Cmaj7**.'
          })
        }
      ]
    },
    {
      id: 'u9l2',
      title: 'Diatonic seventh chords',
      summary: 'Stack thirds on every note of the major scale: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7.',
      blocks: [
        {
          type: 'text',
          md: `In [[u7l1]] you built a triad on each note of the major scale. Do the same with **four** notes, stacking thirds and using only notes from the key, and you get the **diatonic seventh chords**.

The pattern is the same in every major key:

**Imaj7 – ii7 – iii7 – IVmaj7 – V7 – vi7 – viiø7**`
        },
        {
          type: 'table',
          headers: ['Degree', 'Chord', 'Notes', 'Quality'],
          rows: diatonicChords('C', 'major', true).map((c) => [c.roman, c.symbol, spelled(c.root, c.type), CHORDS[c.type].name]),
          caption: 'The diatonic seventh chords of C major.'
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**Only one dominant.** The V7 is the only diatonic chord with a major 3rd *and* a ♭7. Its 3rd and 7th form a **tritone** (B–F in G7) that badly wants to resolve to the I chord. That's why V7 → I is the strongest move in tonal music, and why "7" chords sound like they're going somewhere.`
        },
        {
          type: 'chords',
          shapes: C_DIATONIC,
          caption: 'The C major diatonic sevenths with 5th- and 6th-string roots, climbing the neck. Click each to hear it.'
        },
        { type: 'audio', label: 'Play all eight (Cmaj7 up to Cmaj7)', play: progression(C_DIATONIC, 2, 76, 'strum', progressionExample('C', ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'vii7b5', 'Imaj7'], 'major', 76, 2)) },
        {
          type: 'text',
          md: `### The ii–V–I
The most important progression in jazz, and common in pop and soul, is **ii7 – V7 – Imaj7**. In C that's **Dm7 – G7 – Cmaj7**. With barre voicings it stays in one area of the neck:`
        },
        {
          type: 'chords',
          shapes: [C_DIATONIC[1], C_DIATONIC[4], C_DIATONIC[0]],
          caption: 'ii–V–I in C: Dm7 (5th-string root), G7 (6th-string root), Cmaj7 (5th-string root).'
        },
        { type: 'audio', label: 'Dm7 – G7 – Cmaj7', play: progression([C_DIATONIC[1], C_DIATONIC[4], C_DIATONIC[0]], 4, 80, 'strum', progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 80, 4)) },
        {
          type: 'table',
          headers: ['Key', 'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'],
          rows: ['G', 'D', 'F'].map((k) => [k + ' major', ...diatonicChords(k, 'major', true).map((c) => c.symbol)]),
          caption: 'The same pattern in G, D and F major.'
        },
        {
          type: 'text',
          md: `### In a minor key
The relative minor uses the same seven chords, starting from the 6th degree. In A minor (natural minor): **Am7 – Bm7♭5 – Cmaj7 – Dm7 – Em7 – Fmaj7 – G7**, so the pattern is **i7 – iiø7 – ♭IIImaj7 – iv7 – v7 – ♭VImaj7 – ♭VII7**. (The ♭ in ♭III, ♭VI and ♭VII means the chord is built on that scale degree lowered by a half step compared with the major scale. In practice minor keys often raise the 7th to make the v chord a dominant **E7**; you'll see why in [[preview:u11l2]].)`
        },
        {
          type: 'tryIt',
          question: mc('In **G major**, which chord is the **V7**?', 'D7', ['Dmaj7', 'Dm7', 'C7'], {
            explain: 'The 5th degree of G major is D. Stacking thirds in G major gives D F♯ A C: **D7**.'
          })
        },
        {
          type: 'tryIt',
          question: {
            kind: 'spell',
            prompt: 'Spell the **viiø7** chord of C major (Bm7♭5), root first.',
            answer: chordNames('B', 'm7b5'),
            explain: 'From B, use only white notes stacked in thirds: **B D F A**. That\'s 1 ♭3 ♭5 ♭7, a half-diminished chord.'
          }
        }
      ]
    },
    {
      id: 'u9l3',
      title: 'Guitar voicings: 6th- and 5th-string roots',
      summary: 'Ten movable shapes that cover every seventh chord in every key.',
      blocks: [
        {
          type: 'text',
          md: `Just like barre chords, seventh chords come in **movable** shapes with the root on the **6th string** (E-form) or the **5th string** (A-form). Learn one of each for all five qualities and you can play any seventh chord in any key.

Here they are with the root on **G** (6th string, 3rd fret):`
        },
        {
          type: 'chords',
          shapes: [G_SIX.maj7, G_SIX.dom7, G_SIX.min7, G_SIX.m7b5, G_SIX.dim7],
          caption: 'Root on the 6th string. Muted strings (×) are part of the shape: deaden them with spare fingers.'
        },
        {
          type: 'fretboard',
          marks: degreeMarks(G_SIX.dom7, 'G', 'dom7'),
          frets: [1, 7],
          caption: 'G7 (E-form barre) by chord tone. The ♭7 is on the 4th string, one whole step below the octave root.'
        },
        {
          type: 'fretboard',
          marks: degreeMarks(G_SIX.maj7, 'G', 'maj7'),
          frets: [1, 7],
          caption: 'Gmaj7 (6th-string root). Mute the 5th string with the side of your index finger and the 1st with the underside of your fingers.'
        },
        {
          type: 'text',
          md: `### Root on the 5th string
And the same five qualities with the root on **C** (5th string, 3rd fret):`
        },
        {
          type: 'chords',
          shapes: [C_FIVE.maj7, C_FIVE.dom7, C_FIVE.min7, C_FIVE.m7b5, C_FIVE.dim7],
          caption: 'Root on the 5th string. The 6th string is always muted.'
        },
        {
          type: 'fretboard',
          marks: degreeMarks(C_FIVE.m7b5, 'C', 'm7b5'),
          frets: [1, 7],
          caption: 'Cm7♭5 (5th-string root): compare it with Cm7: the 5th on the 4th string drops a fret to G♭ (and the 1st string is muted).'
        },
        {
          type: 'audioRow',
          items: [
            ...SEVENTHS.map((t) => ({ label: G_SIX[t as keyof typeof G_SIX].name, play: strum(G_SIX[t as keyof typeof G_SIX]) })),
            ...SEVENTHS.map((t) => ({ label: C_FIVE[t as keyof typeof C_FIVE].name, play: strum(C_FIVE[t as keyof typeof C_FIVE]) }))
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**The diminished 7th is symmetrical.** It is built from minor 3rds only, so moving any dim7 shape up **3 frets** gives the same four notes in a new inversion. G°7, B♭°7, D♭°7 and E°7 contain the same pitches (spelled differently). One shape, four positions, four names.`
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Find the root, then pick the shape.** To play F♯m7: F♯ is on the 2nd fret of the 6th string (E-form m7 at fret 2) or the 9th fret of the 5th string (A-form m7 at fret 9). Choose the one closest to the chords around it.`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This is **G7** (E-form barre at the 3rd fret). Click the **♭7**.',
            frets: [1, 7],
            marks: shapePositions(G_SIX.dom7).map((p) => ({ ...p, color: pcAt(p) === pitchClass('G') ? 'root' : 'tone' })),
            targets: [{ string: 4, fret: 3 }],
            explain: 'The ♭7 of G is **F**, at the 3rd fret of the 4th string. In the plain G major barre that string would be fretted at 5 (the octave G); lowering it a whole step gives the ♭7.'
          }
        },
        {
          type: 'tryIt',
          question: mc('Listen. Which seventh chord is this?', 'Half-diminished (m7♭5)', ['Minor 7th', 'Diminished 7th', 'Dominant 7th'], {
            play: strum(C_FIVE.m7b5),
            explain: 'This is **Cm7♭5**: darker than m7 because of the ♭5, but less tense than °7 because its 7th is a normal ♭7.'
          })
        }
      ]
    },
    {
      id: 'u9l4',
      title: 'Shell voicings',
      summary: 'Root, 3rd and 7th: the three notes that define a seventh chord.',
      blocks: [
        {
          type: 'text',
          md: `Which notes in a seventh chord actually matter?
- The **root** tells you what chord it is.
- The **3rd** tells you major or minor.
- The **7th** tells you maj7, 7 or m7.
- The **5th**... is the same perfect 5th in maj7, 7 and m7. It adds weight but no information.

Drop the 5th and you get a **shell voicing**: just **root, 3rd and 7th**. Shells are compact, clear, easy to move, and leave room for a singer, a bass player or a second guitar. Count Basie's guitarist Freddie Green built a whole career on lean three- and four-note voicings like these.`
        },
        {
          type: 'text',
          md: `### Two shapes, three qualities each
- **6th-string root: R – 7 – 3.** The 7th is on the 4th string and the 3rd on the 3rd string.
- **5th-string root: R – 3 – 7.** The 3rd is on the 4th string and the 7th on the 3rd string.

Change one note by one fret to switch quality.`
        },
        {
          type: 'chords',
          shapes: [SHELL.Gmaj7, SHELL.G7, SHELL.Gm7],
          caption: '6th-string shells (R–7–3): Gmaj7, G7, Gm7.'
        },
        {
          type: 'fretboard',
          marks: [...degreeMarks(SHELL.G7, 'G', 'dom7')],
          frets: [1, 6],
          caption: 'G7 shell: R on the 6th string, ♭7 on the 4th, 3 on the 3rd.'
        },
        {
          type: 'chords',
          shapes: [SHELL.Cmaj7, SHELL.C7, SHELL.Cm7],
          caption: '5th-string shells (R–3–7): Cmaj7, C7, Cm7.'
        },
        {
          type: 'fretboard',
          marks: degreeMarks(SHELL.C7, 'C', 'dom7'),
          frets: [1, 6],
          caption: 'C7 shell: R on the 5th string, 3 on the 4th, ♭7 on the 3rd.'
        },
        {
          type: 'audioRow',
          items: [SHELL.Gmaj7, SHELL.G7, SHELL.Gm7, SHELL.Cmaj7, SHELL.C7, SHELL.Cm7].map((s) => ({ label: s.name + ' shell', play: strum(s) }))
        },
        {
          type: 'text',
          md: `### Smooth voice leading
Shells really shine in a ii–V–I. Watch the two upper notes: they barely move.

- **Dm7 → G7:** the F (3rd of Dm7) stays put and becomes the ♭7 of G7. The C (♭7 of Dm7) slides down one fret to B, the 3rd of G7.
- **G7 → Cmaj7:** the F slides down one fret to E (3rd of Cmaj7). The B stays put and becomes the 7th of Cmaj7.

3rds become 7ths and 7ths become 3rds. This is called **voice leading**, and it's why the ii–V–I sounds so smooth.`
        },
        {
          type: 'tab',
          caption: 'ii–V–I in C with shells. Each chord gets two beats; listen to the top two voices.',
          bpm: 70,
          notation: true,
          events: [SHELL.Dm7, SHELL.G7, SHELL.Cmaj7].map((s) => ({ pos: shapePositions(s), beats: 2 }))
        },
        {
          type: 'audioRow',
          items: [
            { label: 'Shell ii–V–I, strummed', play: progression([SHELL.Dm7, SHELL.G7, SHELL.Cmaj7], 2, 72, 'strum', progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 72, 2)) },
            { label: 'Same, arpeggiated', play: progression([SHELL.Dm7, SHELL.G7, SHELL.Cmaj7], 2, 72, 'arpeggio', progressionExample('C', ['ii7', 'V7', 'Imaj7'], 'major', 72, 2)) }
          ]
        },
        {
          type: 'text',
          md: `### A jazzy blues
Use dominant shells for a 12-bar blues in A: **A7** (6th-string root, 5th fret), **D7** (5th-string root, 5th fret) and **E7** (5th-string root, 7th fret). All three sit within a few frets.`
        },
        { type: 'chords', shapes: [SHELL.A7, SHELL.D7, SHELL.E7], caption: 'Dominant shells for a blues in A.' },
        {
          type: 'text',
          md: `### Movable 7th chords
Shells are lean. For the full-bodied version of the [[u8l5]] blues, use the barre shapes from [[u6l1]] and [[u6l2]] with the extra ♭7 note added. To play the blues in any key, use barre 7th chords: an **E-form 7** on the 6th string for the I chord, and **A-form 7s** on the 5th string for IV and V. In A they all sit around the 5th fret, so your hand barely moves.`
        },
        {
          type: 'chords',
          shapes: [A7_BAR, D7_BAR, E7_BAR],
          caption: 'A7 (6th-string root, 5th fret), D7 (5th-string root, 5th fret), E7 (5th-string root, 7th fret).'
        },
        {
          type: 'audio',
          label: '12-bar blues in A with shells',
          toolExamples: [progressionExample('A', ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7', 'I7'], 'mixolydian', 120, 4)],
          play: {
            kind: 'sequence',
            bpm: 120,
            events: ['A7', 'D7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7', 'A7'].flatMap((n, i, all) => {
              const s = SHELL[n as 'A7' | 'D7' | 'E7']
              if (i === all.length - 1) return [{ notes: shapeMidis(s), beats: 4 }]
              return [
                { notes: shapeMidis(s), beats: 1.5 },
                { notes: shapeMidis(s), beats: 2.5 }
              ]
            })
          }
        },
        {
          type: 'tip',
          tone: 'tip',
          md: `**Going rootless.** With a bass player covering the root, jazz guitarists often drop it too and play just the **3rd and 7th** (a "guide-tone" pair), sometimes adding a 9th or 13th on top. You'll meet these in [[preview:u12l2]].`
        },
        {
          type: 'tryIt',
          question: {
            kind: 'fretboard',
            prompt: 'This is a **C7 shell** (R–3–♭7). Click the **3rd**.',
            frets: [0, 6],
            marks: shapePositions(SHELL.C7).map((p) => ({ ...p, color: pcAt(p) === pitchClass('C') ? 'root' : 'tone' })),
            targets: [{ string: 4, fret: 2 }],
            explain: 'The 3rd of C is **E**, at the 2nd fret of the 4th string. On the 3rd string, B♭ (3rd fret) is the ♭7.'
          }
        },
        {
          type: 'tryIt',
          question: mc('A G7 shell (3 x 3 4 x x) becomes **Gmaj7** if you…', 'raise the 4th-string note by one fret (F → F♯)', ['lower the 3rd-string note by one fret (B → B♭)', 'raise the 6th-string note by one fret', 'add the open 5th string'], {
            explain: 'The 4th string holds the 7th. Moving F (♭7) up to **F♯** (major 7th) turns G7 into Gmaj7. Lowering B to B♭ would give Gm7.'
          })
        }
      ]
    },
    {
      id: 'u9l5',
      title: '6th, sus and add9 chords',
      summary: 'Colour chords that change one note of a triad, or add one.',
      blocks: [
        {
          type: 'text',
          md: `Not every four-note chord is a seventh chord. Three families of "colour chords" are everywhere in pop, rock and folk guitar.

### 6th chords
Add the **major 6th** to a triad:
- **Major 6 (6):** 1 3 5 6. Sweet and vintage: think 1940s swing, surf and early rock'n'roll endings.
- **Minor 6 (m6):** 1 ♭3 5 6. Moody and a bit mysterious: a staple of minor swing, bossa nova and spy-movie soundtracks.

Note the 6 in **m6** is still the **major** 6th. That's why minor 6 chords have a Dorian flavour.`
        },
        { type: 'chords', shapes: [SIXTHS.G6, SIXTHS.D6, SIXTHS.Am6, SIXTHS.Dm6], caption: 'Open 6 and m6 chords: G6, D6, Am6, Dm6.' },
        {
          type: 'audioRow',
          items: [
            { label: 'G (triad)', play: strum(OPEN_CHORDS.G) },
            { label: 'G6', play: strum(SIXTHS.G6) },
            { label: 'Gmaj7', play: strum(OPEN_CHORDS.Gmaj7) },
            { label: 'G7', play: strum(OPEN_CHORDS.G7) }
          ]
        },
        {
          type: 'tip',
          tone: 'theory',
          md: `**C6 = Am7?** C6 is C E G A. Am7 is A C E G. Same four notes! Which name is right depends on the **bass note** and the context: with C in the bass and C as home, call it C6. This kind of double identity is common in harmony.`
        },
        {
          type: 'text',
          md: `### Suspended chords
A **sus** chord *replaces* the 3rd. With no 3rd it's neither major nor minor: open, floating, unresolved.
- **sus2:** 1 2 5
- **sus4:** 1 4 5. The 4th wants to fall to the 3rd, so sus4 → major is a classic resolution.
- **7sus4:** 1 4 5 ♭7. A dominant chord with its 3rd suspended, very common as a V chord in its own right, or resolving to the plain dominant 7th on the same root (A7sus4 → A7).`
        },
        {
          type: 'chords',
          shapes: [OPEN_CHORDS.Dsus2, OPEN_CHORDS.D, OPEN_CHORDS.Dsus4, OPEN_CHORDS.Asus2, OPEN_CHORDS.Asus4, A7SUS4],
          caption: 'Sus chords in open position: one finger changes D or A from sus2 to major to sus4.'
        },
        { type: 'audio', label: 'D – Dsus4 – D – Dsus2 – D (the folk-rock move)', play: progression([OPEN_CHORDS.D, OPEN_CHORDS.Dsus4, OPEN_CHORDS.D, OPEN_CHORDS.Dsus2, OPEN_CHORDS.D], 2, 90, 'strum', progressionExample('D', ['I', 'Isus4', 'I', 'Isus2', 'I'], 'major', 90, 2)) },
        { type: 'audio', label: 'A7sus4 resolving to A7', play: progression([A7SUS4, OPEN_CHORDS.A7], 4, 80, 'strum', progressionExample('A', ['I7sus4', 'I7'], 'mixolydian', 80, 4)) },
        {
          type: 'text',
          md: `### add9 chords
An **add9** chord *adds* the 9th (the 2nd, an octave up) to a full triad and keeps the 3rd: **1 3 5 9**. There's **no 7th**, which is what separates it from a **9** chord (1 3 5 ♭7 9).

So: **sus2 replaces the 3rd; add9 keeps it.** Compare Csus2 (C D G) with Cadd9 (C E G D).`
        },
        { type: 'chords', shapes: [CSUS2, OPEN_CHORDS.Cadd9, GADD9], caption: 'Csus2, Cadd9 and Gadd9. Cadd9 is one of the most-used chords in acoustic pop.' },
        {
          type: 'audioRow',
          items: [
            { label: 'C', play: strum(OPEN_CHORDS.C) },
            { label: 'Csus2', play: strum(CSUS2) },
            { label: 'Cadd9', play: strum(OPEN_CHORDS.Cadd9) },
            { label: 'C9', play: strum(EXT.C9) }
          ]
        },
        {
          type: 'table',
          headers: ['Chord', 'Formula', 'Has a 3rd?', 'Has a 7th?'],
          rows: [
            ['Csus2', '1 2 5', 'no', 'no'],
            ['Csus4', '1 4 5', 'no', 'no'],
            ['Cadd9', '1 3 5 9', 'yes', 'no'],
            ['C6', '1 3 5 6', 'yes', 'no'],
            ['C9', '1 3 5 ♭7 9', 'yes', 'yes (♭7)'],
            ['C7sus4', '1 4 5 ♭7', 'no', 'yes (♭7)']
          ]
        },
        {
          type: 'tryIt',
          question: { kind: 'spell', prompt: 'Spell **Dsus4**, root first.', answer: chordNames('D', 'sus4'), explain: 'Replace the 3rd (F♯) with the 4th: **D G A**.' }
        },
        {
          type: 'tryIt',
          question: mc('What is the difference between **Cadd9** and **C9**?', 'C9 also contains the ♭7 (B♭); Cadd9 has no 7th', ['Cadd9 has no 3rd', 'C9 has no 5th', 'They are the same chord'], {
            explain: 'Cadd9 = C E G D. C9 = C E G **B♭** D. The 9 chord is a dominant 7th with a 9th on top.'
          })
        }
      ]
    },
    {
      id: 'u9l6',
      title: 'Extensions and altered dominants',
      summary: '9ths, 11ths and 13ths, the 7♭9 and the Hendrix 7♯9, and what to leave out on guitar.',
      blocks: [
        {
          type: 'text',
          md: `Keep stacking thirds above the 7th and you get the **extensions**:

**1 – 3 – 5 – 7 – 9 – 11 – 13**

After the 13th you'd be back at the root, two octaves up. Extensions are just scale notes an octave higher:
- **9** = the 2nd
- **11** = the 4th
- **13** = the 6th

Calling them 9, 11 and 13 tells you they sit **on top of a seventh chord**. A chord named **9, 11 or 13** includes the 7th; if there's no 7th it's an **add** chord (add9) or a 6 chord.`
        },
        {
          type: 'table',
          headers: ['Chord', 'Formula', 'Notes from C'],
          rows: (['dom9', 'maj9', 'min9', 'dom11', 'min11', 'dom13'] as ChordType[]).map((t) => [chordSymbol('C', t), CHORDS[t].formula, spelled('C', t)])
        },
        {
          type: 'text',
          md: `### What to leave out
A full C13 has seven notes, and a guitar has six strings and four fretting fingers. Guitarists choose:
1. **Drop the 5th first.** It adds nothing to the chord's identity.
2. **Drop the root** if a bassist is playing it.
3. **Drop the 9th and 11th from a 13 chord.** The 13 plus the ♭7 and 3 already says "13".
4. **Never drop the 3rd or 7th** unless you want a sus sound. They define the chord.
5. **Natural 11 clashes with a major 3rd** (a ♭9 apart). So a dominant "11" chord usually drops the 3rd and is really a **9sus4**. Minor 11 chords keep their ♭3, which doesn't clash.`
        },
        {
          type: 'table',
          headers: ['Chord', 'Full formula', 'Typical guitar voicing', 'Omitted'],
          rows: [
            ['9', '1 3 5 ♭7 9', '1 3 ♭7 9', '5'],
            ['maj9', '1 3 5 7 9', '1 3 7 9', '5'],
            ['m9', '1 ♭3 5 ♭7 9', '1 ♭3 ♭7 9', '5'],
            ['11', '1 3 5 ♭7 9 11', '1 11 ♭7 9 (9sus4)', '3, 5'],
            ['m11', '1 ♭3 5 ♭7 9 11', '1 11 ♭7 ♭3', '5, 9'],
            ['13', '1 3 5 ♭7 9 11 13', '1 ♭7 3 13', '5, 9, 11']
          ]
        },
        { type: 'chords', shapes: [EXT.C9, EXT.Cmaj9, EXT.Cm9], caption: 'Ninth chords with 5th-string roots: C9, Cmaj9, Cm9.' },
        { type: 'fretboard', marks: degreeMarks(EXT.C9, 'C', 'dom9'), frets: [0, 6], caption: 'C9: R 3 ♭7 9, plus the 5 on top. A staple chord of funk and soul.' },
        { type: 'chords', shapes: [EXT.C11, EXT.Cm11, EXT.G13, EXT.C13], caption: 'C11 (as 9sus4), Cm11, G13 (6th-string root), C13 (5th-string root).' },
        { type: 'fretboard', marks: degreeMarks(EXT.G13, 'G', 'dom13'), frets: [1, 7], caption: 'G13: R ♭7 3 13. Four notes, no 5th, 9th or 11th, and it still sounds unmistakably like a 13.' },
        {
          type: 'audioRow',
          items: [
            { label: 'C7', play: strum(C_FIVE.dom7) },
            { label: 'C9', play: strum(EXT.C9) },
            { label: 'C13', play: strum(EXT.C13) },
            { label: 'C11 (9sus4)', play: strum(EXT.C11) },
            { label: 'Cmaj9', play: strum(EXT.Cmaj9) },
            { label: 'Cm11', play: strum(EXT.Cm11) }
          ]
        },
        {
          type: 'text',
          md: `### Altered dominants
On a dominant chord heading for its I chord, players often **alter** the 9th by a half step for extra tension:
- **7♭9** (1 3 5 ♭7 ♭9): dark and dramatic, typical before a minor chord. In C7♭9 the ♭9 is D♭.
- **7♯9** (1 3 5 ♭7 ♯9): the ♯9 sounds like a **minor 3rd on top of a major 3rd**, so the chord is major and minor at once. In C7♯9 the ♯9 is D♯.

The 7♯9 is nicknamed the **Hendrix chord** after its use in "Purple Haze". On E, the classic voicing is 0 7 6 7 8 x. Its top note is the ♯9 of E, correctly spelled F𝄪 (F double-sharp) but sounding the same as G: the blues ♭3 played against the chord's G♯.`
        },
        { type: 'chords', shapes: [EXT.C7b9, EXT.C7s9, EXT.E7s9], caption: 'C7♭9, C7♯9, and E7♯9, the Hendrix chord.' },
        { type: 'fretboard', marks: degreeMarks(EXT.E7s9, 'E', 'dom7s9'), frets: [0, 10], caption: 'E7♯9 by chord tone: the 3 (G♯) and ♯9 (sounds as G) are both in the chord.' },
        {
          type: 'audioRow',
          items: [
            { label: 'C7 → F', play: progression([C_FIVE.dom7, OPEN_CHORDS.F], 2, 70, 'strum', progressionExample('F', ['V7', 'I'], 'major', 70, 2)) },
            { label: 'C7♭9 → F', play: progression([EXT.C7b9, OPEN_CHORDS.F], 2, 70, 'strum', progressionExample('F', ['V7b9', 'I'], 'major', 70, 2)) },
            { label: 'E7♯9 (Hendrix chord)', play: strum(EXT.E7s9) }
          ]
        },
        {
          type: 'tip',
          tone: 'practice',
          md: `**Ear test:** play C7, C9, C13, C7♭9 and C7♯9 one after another. The 9 sounds richer but relaxed, the 13 sweet and bright, ♭9 dark and urgent, ♯9 gritty and bluesy. Try swapping them into the V7 of a ii–V–I and hear how each changes the resolution.`
        },
        {
          type: 'tryIt',
          question: mc('The "Hendrix chord" is a…', '7♯9 chord', ['7♭9 chord', 'maj7♯11 chord', 'm7♭5 chord'], {
            explain: 'E7♯9 (0 7 6 7 8 x) from "Purple Haze": a dominant 7th with a ♯9, the major 3rd and the "minor 3rd" sounding together.'
          })
        },
        {
          type: 'tryIt',
          question: mc('In a 4-note **13** chord voicing on guitar, which notes are usually kept?', 'Root, 3rd, ♭7 and 13th', ['Root, 5th, 9th and 13th', 'Root, 3rd, 5th and 13th', '9th, 11th, 13th and root'], {
            explain: 'The 3rd and ♭7 define the dominant sound; the 13 gives the colour. The 5th, 9th and 11th are dropped.'
          })
        },
        {
          type: 'tryIt',
          question: { kind: 'text', prompt: 'The **13th** is the same note as which scale degree, an octave higher? (Type a number.)', accept: ['6', '6th', 'sixth', 'the 6th'], explain: '13 − 7 = 6: the 13th is the **6th** an octave up (just as 9 = 2 and 11 = 4).' }
        }
      ]
    }
  ],
  quiz: {
    count: 12,
    fixed: [
      { kind: 'spell', prompt: 'Spell **Cmaj7**, root first.', answer: chordNames('C', 'maj7'), explain: '1 3 5 7 from C: **C E G B**.' },
      mc('What is the formula of a **dominant 7th** chord?', '1 3 5 ♭7', ['1 3 5 7', '1 ♭3 5 ♭7', '1 ♭3 ♭5 ♭7'], {
        explain: 'Dominant 7th = major triad + **minor 7th**: 1 3 5 ♭7.'
      }),
      mc('Another name for **m7♭5** is…', 'half-diminished (ø7)', ['fully diminished (°7)', 'minor-major 7th', 'dominant 7♭5'], {
        explain: 'm7♭5 = 1 ♭3 ♭5 ♭7, written **ø7**. The fully diminished °7 has a 𝄫7 instead of a ♭7.'
      }),
      { kind: 'spell', prompt: 'Spell **Bm7♭5**, root first.', answer: chordNames('B', 'm7b5'), explain: '1 ♭3 ♭5 ♭7 from B: **B D F A**, the viiø7 of C major.' },
      mc('Which is the diatonic seventh-chord pattern of a major key?', 'Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7', ['I7 ii7 iii7 IV7 V7 vi7 vii7', 'Imaj7 ii7 iii7 IV7 Vmaj7 vi7 vii°7', 'Imaj7 iim7♭5 iii7 IVmaj7 V7 vi7 vii7'], {
        explain: 'Two maj7s (I, IV), three m7s (ii, iii, vi), one dominant (V7) and one half-diminished (viiø7).'
      }),
      mc('In a major key, on which degree is the only diatonic **dominant 7th** chord?', 'V', ['I', 'IV', 'ii'], {
        explain: 'Only the **V7** has a major 3rd and a ♭7. In C that is G7 (G B D F).'
      }),
      {
        kind: 'fretboard',
        prompt: 'This is **G7** (E-form barre). Click the **3rd** (B).',
        frets: [1, 7],
        marks: shapePositions(G_SIX.dom7).map((p) => ({ ...p, color: pcAt(p) === pitchClass('G') ? 'root' : 'tone' })),
        targets: [{ string: 3, fret: 4 }],
        explain: 'B, the 3rd of G7, is at the **4th fret of the 3rd string**, under your middle finger.'
      },
      {
        kind: 'text',
        prompt: 'Which chord tone is usually the **first** to be left out of a guitar voicing? (e.g. root, 3rd, 5th or 7th)',
        accept: ['5', '5th', 'fifth', 'the 5th', 'the fifth'],
        explain: 'The **5th**: it is the same in maj7, 7 and m7 chords, so it adds weight but no information.'
      },
      mc('A **shell voicing** contains which notes?', 'Root, 3rd and 7th', ['Root, 5th and octave', 'Root, 3rd and 5th', '3rd, 5th and 7th'], {
        explain: 'Root, 3rd and 7th: the three notes that tell you the chord\'s name and quality.'
      }),
      mc('Listen. What kind of seventh chord is this?', 'Major 7th', ['Dominant 7th', 'Minor 7th', 'Half-diminished (m7♭5)'], {
        play: strum(OPEN_CHORDS.Fmaj7),
        explain: 'This is **Fmaj7** (xx3210). Soft and dreamy, with a major 7th (E) just a half step below the root.'
      }),
      mc('Listen. What kind of seventh chord is this?', 'Minor 7th', ['Major 7th', 'Dominant 7th', 'Diminished 7th'], {
        play: strum(OPEN_CHORDS.Am7),
        explain: 'This is **Am7** (x02010): a mellow minor chord with a ♭7.'
      }),
      mc('Listen. What kind of seventh chord is this?', 'Diminished 7th', ['Minor 7th', 'Dominant 7th', 'Major 7th'], {
        play: strum(C_FIVE.dim7),
        explain: '**C°7**: all minor 3rds, tense and symmetrical.'
      }),
      mc('The "Hendrix chord" from "Purple Haze" is a…', '7♯9', ['7♭9', 'm7♭5', 'maj9'], {
        explain: 'E7♯9: a dominant 7th with a ♯9 that sounds like a minor 3rd on top.'
      }),
      { kind: 'spell', prompt: 'Spell **C9**, root first.', answer: chordNames('C', 'dom9'), explain: 'C7 (C E G B♭) plus the 9th, D: **C E G B♭ D**.' },
      mc('**C6** (C E G A) contains exactly the same notes as…', 'Am7', ['Cmaj7', 'Em7', 'Fmaj7'], {
        explain: 'Am7 = A C E G. Same four notes; the bass note and context decide the name.'
      }),
      mc('What does a **sus4** chord do to a triad?', 'Replaces the 3rd with the 4th', ['Adds a 4th on top of the 3rd', 'Raises the 5th', 'Adds a ♭7'], {
        explain: 'Suspended chords **replace** the 3rd. Csus4 = C F G.'
      }),
      mc('Why does a dominant **11** chord usually leave out the 3rd?', 'The natural 11 clashes with the major 3rd', ['The 3rd is too low to fret', 'The 3rd and 7th form a tritone', 'It always has a ♭3 instead'], {
        explain: 'The 11 (F in C11) sits a ♭9 above the 3rd (E), a harsh clash. So C11 is usually played as **C9sus4**.'
      })
    ],
    generators: [spellSeventh, hearQuality, diatonicSeventh, findToneInShape, nameFromNotes]
  }
}

export default unit
