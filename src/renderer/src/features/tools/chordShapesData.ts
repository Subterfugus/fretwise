// Curated chord-shape TEMPLATES for the chord library (consumed by chordLibrary.ts).
//
// Each template is written for a reference root (`refRoot`) using the same syntax as
// theory/guitar.ts `shape()`: frets low E -> high E, "x" = muted, space-separated when any
// fret >= 10. Movable templates are transposed to every root by shifting all fretted
// notes (open strings would become fretted when shifted, so templates that use open
// strings are movable: false and are only valid at refRoot). Fingers use one character per
// string: 1-4 = finger, 0 = open, x = muted (optional 'T' = thumb is allowed but unused here).
//
// DEGREE-LABEL CONVENTION (used by `omitted`, and by chordLibrary.ts for the same purpose)
// ---------------------------------------------------------------------------------------
// Each interval of CHORDS[type].intervals maps to exactly one label (INTERVAL_DEGREE_LABEL):
//   P1 "1"   m3 "♭3"   M3 "3"   P5 "5"   d5 "♭5"   A5 "♯5"   M2 "2"   P4 "4"   M6 "6"
//   m7 "♭7"  M7 "7"    d7 "𝄫7"  M9 "9"   m9 "♭9"   A9 "♯9"   P11 "11" A11 "♯11" M13 "13"
// `chordDegreeLabels(type)` returns them in formula order; `omitted` lists, in that order,
// EXACTLY the chord degrees that no sounding string produces (compared by pitch class).
// Because the 5th is a different degree label in dim/aug chords, a shell voicing of m7♭5
// omits ["♭5"], not ["5"].
//
// `inversionHint` (optional) describes the actual lowest sounding pitch: 'root' | 'first'
// (3rd/♭3 in the bass) | 'second' (5th/♭5/♯5) | 'third' (a 7th). It is only set when it is
// well defined for the chord type (chords with a third; the 'third' value only for chords
// with a 7th), and chordShapesData.test.ts verifies it against the real bass note.
//
// Labels say what the voicing is (shape name, string set, degrees from bass to treble for
// generated voicings). Shape names such as "E-shape" or "A-shape" just describe the familiar
// open-chord form the grip is derived from; they are not a separate system.
import { CHORDS, type ChordType } from '@/theory/chords'

export type InversionHint = 'root' | 'first' | 'second' | 'third'

export interface CuratedTemplate {
  type: ChordType
  /** e.g. "E-shape barre", "Drop 2 (strings 1-4), ♭7-3-5-1", "Shell R-3-♭7 (strings 4-5-6)" */
  label: string
  refRoot: string
  frets: string
  /** One character per string: 1-4, 0 = open, x = muted (T = thumb). Always provided in this file. */
  fingers?: string
  /** Degree labels deliberately omitted (see header convention), e.g. ["5"] */
  omitted?: string[]
  /** false = only valid at refRoot (uses open strings) */
  movable: boolean
  /** Actual bass of the voicing, when well defined for the chord type (verified by tests). */
  inversionHint?: InversionHint
}

/** Interval name (as in CHORDS) -> degree label. */
export const INTERVAL_DEGREE_LABEL: Record<string, string> = {
  P1: '1', m3: '♭3', M3: '3', P5: '5', d5: '♭5', A5: '♯5', M2: '2', P4: '4', M6: '6',
  m7: '♭7', M7: '7', d7: '𝄫7', M9: '9', m9: '♭9', A9: '♯9', P11: '11', A11: '♯11', M13: '13'
}

/** Degree label -> semitones above the root (mod 12). */
export const DEGREE_SEMITONES: Record<string, number> = {
  '1': 0, '♭3': 3, '3': 4, '5': 7, '♭5': 6, '♯5': 8, '2': 2, '4': 5, '6': 9,
  '♭7': 10, '7': 11, '𝄫7': 9, '9': 2, '♭9': 1, '♯9': 3, '11': 5, '♯11': 6, '13': 9
}

/** Degree labels of a chord type, in formula order. */
export function chordDegreeLabels(type: ChordType): string[] {
  return CHORDS[type].intervals.map((iv) => {
    const label = INTERVAL_DEGREE_LABEL[iv]
    if (!label) throw new Error(`No degree label for interval ${iv}`)
    return label
  })
}

const THIRDS = ['3', '♭3']
const FIFTHS = ['5', '♭5', '♯5']
const SEVENTHS = ['♭7', '7', '𝄫7']

/** Inversion name for a bass degree, or undefined when it is not one of root/3rd/5th/7th of this chord. */
export function inversionFor(type: ChordType, bassLabel: string): InversionHint | undefined {
  if (bassLabel === '1') return 'root'
  const labels = chordDegreeLabels(type)
  if (!labels.some((l) => THIRDS.includes(l))) return undefined
  if (THIRDS.includes(bassLabel)) return 'first'
  if (FIFTHS.includes(bassLabel)) return 'second'
  if (SEVENTHS.includes(bassLabel) && labels.some((l) => SEVENTHS.includes(l))) return 'third'
  return undefined
}

export const CURATED_TEMPLATES: CuratedTemplate[] = [
  // ======================================================================
  // TRIADS, SUSPENDED, ADDED-TONE AND SIXTH CHORDS
  // ======================================================================

  // --- Major: movable barre shapes ---
  { type: 'maj', label: 'E-shape barre', refRoot: 'F', frets: '133211', fingers: '134211', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'A-shape barre', refRoot: 'Bb', frets: 'x13331', fingers: 'x12341', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'C-shape barre', refRoot: 'D', frets: 'x54232', fingers: 'x43121', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'G-shape barre', refRoot: 'A', frets: '542225', fingers: '321114', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'D-shape (strings 4-1)', refRoot: 'E', frets: 'xx2454', fingers: 'xx1243', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'F small grip (strings 4-1)', refRoot: 'F', frets: 'xx3211', fingers: 'xx3211', movable: true, inversionHint: 'root' },

  // --- Major: open and slash chords ---
  { type: 'maj', label: 'C open', refRoot: 'C', frets: 'x32010', fingers: 'x32010', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'A open', refRoot: 'A', frets: 'x02220', fingers: 'x01230', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'G open', refRoot: 'G', frets: '320003', fingers: '210003', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'G open (alt, 320033)', refRoot: 'G', frets: '320033', fingers: '210034', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'E open', refRoot: 'E', frets: '022100', fingers: '023100', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'D open', refRoot: 'D', frets: 'xx0232', fingers: 'xx0132', movable: false, inversionHint: 'root' },
  { type: 'maj', label: 'C/E open', refRoot: 'C', frets: '032010', fingers: '032010', movable: false, inversionHint: 'first' },
  { type: 'maj', label: 'G/B open', refRoot: 'G', frets: 'x20003', fingers: 'x10002', movable: false, inversionHint: 'first' },
  { type: 'maj', label: 'D/F# open', refRoot: 'D', frets: '200232', fingers: '100243', movable: false, inversionHint: 'first' },
  { type: 'maj', label: 'A/E open', refRoot: 'A', frets: '002220', fingers: '001230', movable: false, inversionHint: 'second' },

  // --- Minor: movable barre shapes ---
  { type: 'min', label: 'E-shape barre', refRoot: 'F', frets: '133111', fingers: '123111', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'A-shape barre', refRoot: 'Bb', frets: 'x13321', fingers: 'x13421', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'D-shape (strings 4-1)', refRoot: 'Eb', frets: 'xx1342', fingers: 'xx1342', movable: true, inversionHint: 'root' },

  // --- Minor: open and slash chords ---
  { type: 'min', label: 'Am open', refRoot: 'A', frets: 'x02210', fingers: 'x02310', movable: false, inversionHint: 'root' },
  { type: 'min', label: 'Em open', refRoot: 'E', frets: '022000', fingers: '012000', movable: false, inversionHint: 'root' },
  { type: 'min', label: 'Dm open', refRoot: 'D', frets: 'xx0231', fingers: 'xx0231', movable: false, inversionHint: 'root' },
  { type: 'min', label: 'Am/E open', refRoot: 'A', frets: '002210', fingers: '002310', movable: false, inversionHint: 'second' },
  { type: 'min', label: 'Am/C open', refRoot: 'A', frets: 'x32210', fingers: 'x42310', movable: false, inversionHint: 'first' },
  { type: 'min', label: 'Em/B open', refRoot: 'E', frets: 'x22000', fingers: 'x12000', movable: false, inversionHint: 'second' },
  { type: 'min', label: 'Dm/F open', refRoot: 'D', frets: '1x0231', fingers: '1x0342', movable: false, inversionHint: 'first' },

  // --- Diminished ---
  { type: 'dim', label: 'D-shape (strings 4-1)', refRoot: 'Eb', frets: 'xx1242', fingers: 'xx1243', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'A-shape (strings 5-2)', refRoot: 'B', frets: 'x2343x', fingers: 'x1243x', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'A open (strings 5-2)', refRoot: 'A', frets: 'x0121x', fingers: 'x0132x', movable: false, inversionHint: 'root' },

  // --- Augmented ---
  { type: 'aug', label: 'E open', refRoot: 'E', frets: '032110', fingers: '043120', movable: false, inversionHint: 'root' },
  { type: 'aug', label: 'C-shape open', refRoot: 'C', frets: 'x32110', fingers: 'x43120', movable: false, inversionHint: 'root' },
  { type: 'aug', label: 'A open', refRoot: 'A', frets: 'x03221', fingers: 'x04231', movable: false, inversionHint: 'root' },

  // --- Suspended 2nd ---
  { type: 'sus2', label: 'A open', refRoot: 'A', frets: 'x02200', fingers: 'x01200', movable: false, inversionHint: 'root' },
  { type: 'sus2', label: 'D open', refRoot: 'D', frets: 'xx0230', fingers: 'xx0120', movable: false, inversionHint: 'root' },
  { type: 'sus2', label: 'E open', refRoot: 'E', frets: '024400', fingers: '012300', movable: false, inversionHint: 'root' },
  { type: 'sus2', label: 'C open', refRoot: 'C', frets: 'x30033', fingers: 'x10023', movable: false, inversionHint: 'root' },
  { type: 'sus2', label: 'G open', refRoot: 'G', frets: '300033', fingers: '100023', movable: false, inversionHint: 'root' },
  { type: 'sus2', label: 'A-shape barre', refRoot: 'B', frets: 'x24422', fingers: 'x12311', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'E-shape barre', refRoot: 'F', frets: '135511', fingers: '123411', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'D-shape (strings 4-1)', refRoot: 'Eb', frets: 'xx1341', fingers: 'xx1231', movable: true, inversionHint: 'root' },

  // --- Suspended 4th ---
  { type: 'sus4', label: 'A open', refRoot: 'A', frets: 'x02230', fingers: 'x01230', movable: false, inversionHint: 'root' },
  { type: 'sus4', label: 'D open', refRoot: 'D', frets: 'xx0233', fingers: 'xx0123', movable: false, inversionHint: 'root' },
  { type: 'sus4', label: 'E open', refRoot: 'E', frets: '022200', fingers: '012300', movable: false, inversionHint: 'root' },
  { type: 'sus4', label: 'C open', refRoot: 'C', frets: 'x33011', fingers: 'x34012', movable: false, inversionHint: 'root' },
  { type: 'sus4', label: 'G open', refRoot: 'G', frets: '330013', fingers: '230014', movable: false, inversionHint: 'root' },
  { type: 'sus4', label: 'E-shape barre', refRoot: 'F', frets: '133311', fingers: '123411', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'A-shape barre', refRoot: 'B', frets: 'x24452', fingers: 'x12341', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'D-shape (strings 4-1)', refRoot: 'Eb', frets: 'xx1344', fingers: 'xx1234', movable: true, inversionHint: 'root' },

  // --- Added 9th ---
  { type: 'add9', label: 'C open', refRoot: 'C', frets: 'x32030', fingers: 'x21030', movable: false, inversionHint: 'root' },
  { type: 'add9', label: 'C open (alt)', refRoot: 'C', frets: 'x32033', fingers: 'x21034', movable: false, inversionHint: 'root' },
  { type: 'add9', label: 'G open', refRoot: 'G', frets: '320203', fingers: '310204', movable: false, inversionHint: 'root' },
  { type: 'add9', label: 'A open', refRoot: 'A', frets: 'x02420', fingers: 'x01320', movable: false, inversionHint: 'root' },
  { type: 'add9', label: 'E open', refRoot: 'E', frets: '024100', fingers: '023100', movable: false, inversionHint: 'root' },

  // --- Major 6th ---
  { type: 'maj6', label: 'C open', refRoot: 'C', frets: 'x32210', fingers: 'x42310', omitted: ['5'], movable: false, inversionHint: 'root' },
  { type: 'maj6', label: 'A open', refRoot: 'A', frets: 'x02222', fingers: 'x01234', movable: false, inversionHint: 'root' },
  { type: 'maj6', label: 'E open', refRoot: 'E', frets: '022120', fingers: '023140', movable: false, inversionHint: 'root' },
  { type: 'maj6', label: 'G open', refRoot: 'G', frets: '320000', fingers: '210000', movable: false, inversionHint: 'root' },
  { type: 'maj6', label: 'D open', refRoot: 'D', frets: 'xx0202', fingers: 'xx0102', movable: false, inversionHint: 'root' },
  { type: 'maj6', label: 'E-shape (strings 6,4-2)', refRoot: 'F', frets: '1x323x', fingers: '1x324x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj6', label: 'A-shape barre', refRoot: 'Bb', frets: 'x13333', fingers: 'x12222', movable: true, inversionHint: 'root' },
  { type: 'maj6', label: 'D-shape (strings 4-1)', refRoot: 'Eb', frets: 'xx1313', fingers: 'xx1213', movable: true, inversionHint: 'root' },

  // --- Minor 6th ---
  { type: 'min6', label: 'A open', refRoot: 'A', frets: 'x02212', fingers: 'x02314', movable: false, inversionHint: 'root' },
  { type: 'min6', label: 'E open', refRoot: 'E', frets: '022020', fingers: '012030', movable: false, inversionHint: 'root' },
  { type: 'min6', label: 'D open', refRoot: 'D', frets: 'xx0201', fingers: 'xx0201', movable: false, inversionHint: 'root' },
  { type: 'min6', label: 'E-shape barre', refRoot: 'F', frets: '133131', fingers: '123141', movable: true, inversionHint: 'root' },

  // --- maj: top-string triad grips ---
  { type: 'maj', label: 'Triad (strings 1-2-3), 1-3-5', refRoot: 'Bb', frets: 'xxx331', fingers: 'xxx231', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'Triad (strings 1-2-3), 3-5-1', refRoot: 'F', frets: 'xxx211', fingers: 'xxx211', movable: true, inversionHint: 'first' },
  { type: 'maj', label: 'Triad (strings 1-2-3), 5-1-3', refRoot: 'Db', frets: 'xxx121', fingers: 'xxx121', movable: true, inversionHint: 'second' },
  { type: 'maj', label: 'Triad (strings 2-3-4), 1-3-5', refRoot: 'F', frets: 'xx321x', fingers: 'xx321x', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'Triad (strings 2-3-4), 3-5-1', refRoot: 'Db', frets: 'xx312x', fingers: 'xx312x', movable: true, inversionHint: 'first' },
  { type: 'maj', label: 'Triad (strings 2-3-4), 5-1-3', refRoot: 'Ab', frets: 'xx111x', fingers: 'xx111x', movable: true, inversionHint: 'second' },
  { type: 'maj', label: 'Triad (strings 3-4-5), 1-3-5', refRoot: 'Db', frets: 'x431xx', fingers: 'x321xx', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'Triad (strings 3-4-5), 3-5-1', refRoot: 'Ab', frets: 'x311xx', fingers: 'x211xx', movable: true, inversionHint: 'first' },
  { type: 'maj', label: 'Triad (strings 3-4-5), 5-1-3', refRoot: 'E', frets: 'x221xx', fingers: 'x231xx', movable: true, inversionHint: 'second' },
  { type: 'maj', label: 'Triad (strings 4-5-6), 1-3-5', refRoot: 'Ab', frets: '431xxx', fingers: '321xxx', movable: true, inversionHint: 'root' },
  { type: 'maj', label: 'Triad (strings 4-5-6), 3-5-1', refRoot: 'Eb', frets: '311xxx', fingers: '211xxx', movable: true, inversionHint: 'first' },
  { type: 'maj', label: 'Triad (strings 4-5-6), 5-1-3', refRoot: 'B', frets: '221xxx', fingers: '231xxx', movable: true, inversionHint: 'second' },
  { type: 'maj', label: '4-string grip (strings 1-4), 3-5-1-3', refRoot: 'Db', frets: 'xx3121', fingers: 'xx3121', movable: true, inversionHint: 'first' },
  { type: 'maj', label: '4-string grip (strings 1-4), 5-1-3-5', refRoot: 'Bb', frets: 'xx3331', fingers: 'xx2341', movable: true, inversionHint: 'second' },
  { type: 'maj', label: '4-string grip (strings 1-4), 3-1-3-5', refRoot: 'B', frets: 'xx1442', fingers: 'xx1342', movable: true, inversionHint: 'first' },
  { type: 'maj', label: '4-string grip (strings 1-4), 3-5-1-5', refRoot: 'Db', frets: 'xx3124', fingers: 'xx3124', movable: true, inversionHint: 'first' },
  { type: 'maj', label: '4-string grip (strings 1-4), 5-1-3-1', refRoot: 'Ab', frets: 'xx1114', fingers: 'xx1112', movable: true, inversionHint: 'second' },
  { type: 'maj', label: '4-string grip (strings 2-5), 1-5-1-3', refRoot: 'Bb', frets: 'x1333x', fingers: 'x1234x', movable: true, inversionHint: 'root' },
  { type: 'maj', label: '4-string grip (strings 2-5), 3-5-1-3', refRoot: 'Ab', frets: 'x3111x', fingers: 'x2111x', movable: true, inversionHint: 'first' },
  { type: 'maj', label: '4-string grip (strings 2-5), 5-1-3-5', refRoot: 'F', frets: 'x3321x', fingers: 'x3421x', movable: true, inversionHint: 'second' },
  { type: 'maj', label: '4-string grip (strings 2-5), 1-3-5-1', refRoot: 'Db', frets: 'x4312x', fingers: 'x4312x', movable: true, inversionHint: 'root' },
  { type: 'maj', label: '4-string grip (strings 2-5), 3-1-3-5', refRoot: 'F#', frets: 'x1432x', fingers: 'x1432x', movable: true, inversionHint: 'first' },
  { type: 'maj', label: '4-string grip (strings 2-5), 3-5-1-5', refRoot: 'Ab', frets: 'x3114x', fingers: 'x2113x', movable: true, inversionHint: 'first' },

  // --- min: top-string triad grips ---
  { type: 'min', label: 'Triad (strings 1-2-3), 1-♭3-5', refRoot: 'Bb', frets: 'xxx321', fingers: 'xxx321', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'Triad (strings 1-2-3), ♭3-5-1', refRoot: 'F', frets: 'xxx111', fingers: 'xxx111', movable: true, inversionHint: 'first' },
  { type: 'min', label: 'Triad (strings 1-2-3), 5-1-♭3', refRoot: 'D', frets: 'xxx231', fingers: 'xxx231', movable: true, inversionHint: 'second' },
  { type: 'min', label: 'Triad (strings 2-3-4), 1-♭3-5', refRoot: 'F', frets: 'xx311x', fingers: 'xx211x', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'Triad (strings 2-3-4), ♭3-5-1', refRoot: 'Db', frets: 'xx212x', fingers: 'xx213x', movable: true, inversionHint: 'first' },
  { type: 'min', label: 'Triad (strings 2-3-4), 5-1-♭3', refRoot: 'A', frets: 'xx221x', fingers: 'xx231x', movable: true, inversionHint: 'second' },
  { type: 'min', label: 'Triad (strings 3-4-5), 1-♭3-5', refRoot: 'Db', frets: 'x421xx', fingers: 'x321xx', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'Triad (strings 3-4-5), ♭3-5-1', refRoot: 'Ab', frets: 'x211xx', fingers: 'x211xx', movable: true, inversionHint: 'first' },
  { type: 'min', label: 'Triad (strings 3-4-5), 5-1-♭3', refRoot: 'F', frets: 'x331xx', fingers: 'x231xx', movable: true, inversionHint: 'second' },
  { type: 'min', label: 'Triad (strings 4-5-6), 1-♭3-5', refRoot: 'Ab', frets: '421xxx', fingers: '321xxx', movable: true, inversionHint: 'root' },
  { type: 'min', label: 'Triad (strings 4-5-6), ♭3-5-1', refRoot: 'Eb', frets: '211xxx', fingers: '211xxx', movable: true, inversionHint: 'first' },
  { type: 'min', label: 'Triad (strings 4-5-6), 5-1-♭3', refRoot: 'C', frets: '331xxx', fingers: '231xxx', movable: true, inversionHint: 'second' },
  { type: 'min', label: '4-string grip (strings 1-4), 1-♭3-5-1', refRoot: 'F', frets: 'xx3111', fingers: 'xx2111', movable: true, inversionHint: 'root' },
  { type: 'min', label: '4-string grip (strings 1-4), ♭3-5-1-♭3', refRoot: 'D', frets: 'xx3231', fingers: 'xx3241', movable: true, inversionHint: 'first' },
  { type: 'min', label: '4-string grip (strings 1-4), 5-1-♭3-5', refRoot: 'Bb', frets: 'xx3321', fingers: 'xx3421', movable: true, inversionHint: 'second' },
  { type: 'min', label: '4-string grip (strings 1-4), 1-♭3-5-♭3', refRoot: 'F', frets: 'xx3114', fingers: 'xx2113', movable: true, inversionHint: 'root' },
  { type: 'min', label: '4-string grip (strings 1-4), ♭3-5-1-5', refRoot: 'Db', frets: 'xx2124', fingers: 'xx2134', movable: true, inversionHint: 'first' },
  { type: 'min', label: '4-string grip (strings 1-4), 5-♭3-5-1', refRoot: 'Ab', frets: 'xx1444', fingers: 'xx1234', movable: true, inversionHint: 'second' },
  { type: 'min', label: '4-string grip (strings 2-5), 1-5-1-♭3', refRoot: 'Bb', frets: 'x1332x', fingers: 'x1342x', movable: true, inversionHint: 'root' },
  { type: 'min', label: '4-string grip (strings 2-5), ♭3-5-1-♭3', refRoot: 'A', frets: 'x3221x', fingers: 'x4231x', movable: true, inversionHint: 'first' },
  { type: 'min', label: '4-string grip (strings 2-5), 5-1-♭3-5', refRoot: 'F', frets: 'x3311x', fingers: 'x2311x', movable: true, inversionHint: 'second' },
  { type: 'min', label: '4-string grip (strings 2-5), 1-♭3-5-1', refRoot: 'Db', frets: 'x4212x', fingers: 'x4213x', movable: true, inversionHint: 'root' },
  { type: 'min', label: '4-string grip (strings 2-5), ♭3-5-1-5', refRoot: 'Ab', frets: 'x2114x', fingers: 'x2113x', movable: true, inversionHint: 'first' },
  { type: 'min', label: '4-string grip (strings 2-5), 5-♭3-5-1', refRoot: 'Eb', frets: 'x1434x', fingers: 'x1324x', movable: true, inversionHint: 'second' },

  // --- dim: top-string triad grips ---
  { type: 'dim', label: 'Triad (strings 1-2-3), 1-♭3-♭5', refRoot: 'B', frets: 'xxx431', fingers: 'xxx321', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'Triad (strings 1-2-3), ♭3-♭5-1', refRoot: 'F#', frets: 'xxx212', fingers: 'xxx213', movable: true, inversionHint: 'first' },
  { type: 'dim', label: 'Triad (strings 1-2-3), ♭5-1-♭3', refRoot: 'D', frets: 'xxx131', fingers: 'xxx121', movable: true, inversionHint: 'second' },
  { type: 'dim', label: 'Triad (strings 2-3-4), 1-♭3-♭5', refRoot: 'F#', frets: 'xx421x', fingers: 'xx321x', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'Triad (strings 2-3-4), ♭3-♭5-1', refRoot: 'D', frets: 'xx313x', fingers: 'xx213x', movable: true, inversionHint: 'first' },
  { type: 'dim', label: 'Triad (strings 2-3-4), ♭5-1-♭3', refRoot: 'A', frets: 'xx121x', fingers: 'xx121x', movable: true, inversionHint: 'second' },
  { type: 'dim', label: 'Triad (strings 3-4-5), 1-♭3-♭5', refRoot: 'D', frets: 'x531xx', fingers: 'x321xx', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'Triad (strings 3-4-5), ♭3-♭5-1', refRoot: 'A', frets: 'x312xx', fingers: 'x312xx', movable: true, inversionHint: 'first' },
  { type: 'dim', label: 'Triad (strings 3-4-5), ♭5-1-♭3', refRoot: 'F', frets: 'x231xx', fingers: 'x231xx', movable: true, inversionHint: 'second' },
  { type: 'dim', label: 'Triad (strings 4-5-6), 1-♭3-♭5', refRoot: 'A', frets: '531xxx', fingers: '321xxx', movable: true, inversionHint: 'root' },
  { type: 'dim', label: 'Triad (strings 4-5-6), ♭3-♭5-1', refRoot: 'E', frets: '312xxx', fingers: '312xxx', movable: true, inversionHint: 'first' },
  { type: 'dim', label: 'Triad (strings 4-5-6), ♭5-1-♭3', refRoot: 'C', frets: '231xxx', fingers: '231xxx', movable: true, inversionHint: 'second' },
  { type: 'dim', label: '4-string grip (strings 1-4), ♭3-♭5-1-♭3', refRoot: 'D', frets: 'xx3131', fingers: 'xx2131', movable: true, inversionHint: 'first' },
  { type: 'dim', label: '4-string grip (strings 1-4), 1-♭3-♭5-1', refRoot: 'F#', frets: 'xx4212', fingers: 'xx4213', movable: true, inversionHint: 'root' },
  { type: 'dim', label: '4-string grip (strings 1-4), ♭3-♭5-1-♭5', refRoot: 'D', frets: 'xx3134', fingers: 'xx2134', movable: true, inversionHint: 'first' },
  { type: 'dim', label: '4-string grip (strings 1-4), ♭5-1-♭3-♭5', refRoot: 'B', frets: 'xx3431', fingers: 'xx2431', movable: true, inversionHint: 'second' },
  { type: 'dim', label: '4-string grip (strings 2-5), ♭3-♭5-1-♭3', refRoot: 'A', frets: 'x3121x', fingers: 'x3121x', movable: true, inversionHint: 'first' },
  { type: 'dim', label: '4-string grip (strings 2-5), ♭3-♭5-1-♭5', refRoot: 'A', frets: 'x3124x', fingers: 'x3124x', movable: true, inversionHint: 'first' },
  { type: 'dim', label: '4-string grip (strings 2-5), ♭5-1-♭3-♭5', refRoot: 'F#', frets: 'x3421x', fingers: 'x3421x', movable: true, inversionHint: 'second' },

  // --- aug: top-string triad grips ---
  { type: 'aug', label: 'Triad (strings 1-2-3), 1-3-♯5', refRoot: 'A', frets: 'xxx221', fingers: 'xxx231', movable: true, inversionHint: 'root' },
  { type: 'aug', label: 'Triad (strings 2-3-4), 1-3-♯5', refRoot: 'E', frets: 'xx211x', fingers: 'xx211x', movable: true, inversionHint: 'root' },
  { type: 'aug', label: 'Triad (strings 3-4-5), 1-3-♯5', refRoot: 'C', frets: 'x321xx', fingers: 'x321xx', movable: true, inversionHint: 'root' },
  { type: 'aug', label: 'Triad (strings 4-5-6), 1-3-♯5', refRoot: 'G', frets: '321xxx', fingers: '321xxx', movable: true, inversionHint: 'root' },
  { type: 'aug', label: '4-string grip (strings 1-4), 1-3-♯5-1', refRoot: 'F', frets: 'xx3221', fingers: 'xx4231', movable: true, inversionHint: 'root' },
  { type: 'aug', label: '4-string grip (strings 1-4), 1-3-♯5-3', refRoot: 'E', frets: 'xx2114', fingers: 'xx2113', movable: true, inversionHint: 'root' },
  { type: 'aug', label: '4-string grip (strings 1-4), 1-♯5-1-3', refRoot: 'Eb', frets: 'xx1443', fingers: 'xx1342', movable: true, inversionHint: 'root' },
  { type: 'aug', label: '4-string grip (strings 2-5), 1-3-♯5-1', refRoot: 'C', frets: 'x3211x', fingers: 'x3211x', movable: true, inversionHint: 'root' },
  { type: 'aug', label: '4-string grip (strings 2-5), 1-♯5-1-3', refRoot: 'Bb', frets: 'x1433x', fingers: 'x1423x', movable: true, inversionHint: 'root' },

  // --- sus2: top-string triad grips ---
  { type: 'sus2', label: 'Triad (strings 1-2-3), 1-2-5', refRoot: 'Bb', frets: 'xxx311', fingers: 'xxx211', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'Triad (strings 1-2-3), 2-5-1', refRoot: 'F#', frets: 'xxx122', fingers: 'xxx123', movable: true },
  { type: 'sus2', label: 'Triad (strings 1-2-3), 5-1-2', refRoot: 'Eb', frets: 'xxx341', fingers: 'xxx231', movable: true },
  { type: 'sus2', label: 'Triad (strings 2-3-4), 1-2-5', refRoot: 'F#', frets: 'xx412x', fingers: 'xx312x', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'Triad (strings 2-3-4), 2-5-1', refRoot: 'Db', frets: 'xx112x', fingers: 'xx112x', movable: true },
  { type: 'sus2', label: 'Triad (strings 2-3-4), 5-1-2', refRoot: 'Bb', frets: 'xx331x', fingers: 'xx231x', movable: true },
  { type: 'sus2', label: 'Triad (strings 3-4-5), 1-2-5', refRoot: 'Db', frets: 'x411xx', fingers: 'x211xx', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'Triad (strings 3-4-5), 2-5-1', refRoot: 'Ab', frets: 'x111xx', fingers: 'x111xx', movable: true },
  { type: 'sus2', label: 'Triad (strings 3-4-5), 5-1-2', refRoot: 'F#', frets: 'x441xx', fingers: 'x231xx', movable: true },
  { type: 'sus2', label: 'Triad (strings 4-5-6), 1-2-5', refRoot: 'Ab', frets: '411xxx', fingers: '211xxx', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: 'Triad (strings 4-5-6), 2-5-1', refRoot: 'Eb', frets: '111xxx', fingers: '111xxx', movable: true },
  { type: 'sus2', label: 'Triad (strings 4-5-6), 5-1-2', refRoot: 'Db', frets: '441xxx', fingers: '231xxx', movable: true },
  { type: 'sus2', label: '4-string grip (strings 1-4), 5-1-2-5', refRoot: 'Bb', frets: 'xx3311', fingers: 'xx2311', movable: true },
  { type: 'sus2', label: '4-string grip (strings 1-4), 1-2-5-1', refRoot: 'F#', frets: 'xx4122', fingers: 'xx4123', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: '4-string grip (strings 1-4), 1-2-5-2', refRoot: 'F#', frets: 'xx4124', fingers: 'xx3124', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: '4-string grip (strings 1-4), 2-5-1-2', refRoot: 'Eb', frets: 'xx3341', fingers: 'xx2341', movable: true },
  { type: 'sus2', label: '4-string grip (strings 1-4), 2-5-1-5', refRoot: 'Db', frets: 'xx1124', fingers: 'xx1123', movable: true },
  { type: 'sus2', label: '4-string grip (strings 1-4), 5-2-5-1', refRoot: 'Ab', frets: 'xx1344', fingers: 'xx1234', movable: true },
  { type: 'sus2', label: '4-string grip (strings 2-5), 1-5-1-2', refRoot: 'Bb', frets: 'x1331x', fingers: 'x1231x', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: '4-string grip (strings 2-5), 2-5-1-2', refRoot: 'Bb', frets: 'x3331x', fingers: 'x2341x', movable: true },
  { type: 'sus2', label: '4-string grip (strings 2-5), 1-2-5-1', refRoot: 'Db', frets: 'x4112x', fingers: 'x3112x', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: '4-string grip (strings 2-5), 1-2-5-2', refRoot: 'Db', frets: 'x4114x', fingers: 'x2113x', movable: true, inversionHint: 'root' },
  { type: 'sus2', label: '4-string grip (strings 2-5), 2-5-1-5', refRoot: 'Ab', frets: 'x1114x', fingers: 'x1112x', movable: true },
  { type: 'sus2', label: '4-string grip (strings 2-5), 5-1-2-5', refRoot: 'F#', frets: 'x4412x', fingers: 'x3412x', movable: true },
  { type: 'sus2', label: '4-string grip (strings 2-5), 5-2-5-1', refRoot: 'Eb', frets: 'x1334x', fingers: 'x1234x', movable: true },

  // --- sus4: top-string triad grips ---
  { type: 'sus4', label: 'Triad (strings 1-2-3), 1-4-5', refRoot: 'Bb', frets: 'xxx341', fingers: 'xxx231', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'Triad (strings 1-2-3), 4-5-1', refRoot: 'F', frets: 'xxx311', fingers: 'xxx211', movable: true },
  { type: 'sus4', label: 'Triad (strings 1-2-3), 5-1-4', refRoot: 'Db', frets: 'xxx122', fingers: 'xxx123', movable: true },
  { type: 'sus4', label: 'Triad (strings 2-3-4), 1-4-5', refRoot: 'F', frets: 'xx331x', fingers: 'xx231x', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'Triad (strings 2-3-4), 4-5-1', refRoot: 'Db', frets: 'xx412x', fingers: 'xx312x', movable: true },
  { type: 'sus4', label: 'Triad (strings 2-3-4), 5-1-4', refRoot: 'Ab', frets: 'xx112x', fingers: 'xx112x', movable: true },
  { type: 'sus4', label: 'Triad (strings 3-4-5), 1-4-5', refRoot: 'Db', frets: 'x441xx', fingers: 'x231xx', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'Triad (strings 3-4-5), 4-5-1', refRoot: 'Ab', frets: 'x411xx', fingers: 'x211xx', movable: true },
  { type: 'sus4', label: 'Triad (strings 3-4-5), 5-1-4', refRoot: 'Eb', frets: 'x111xx', fingers: 'x111xx', movable: true },
  { type: 'sus4', label: 'Triad (strings 4-5-6), 1-4-5', refRoot: 'Ab', frets: '441xxx', fingers: '231xxx', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: 'Triad (strings 4-5-6), 4-5-1', refRoot: 'Eb', frets: '411xxx', fingers: '211xxx', movable: true },
  { type: 'sus4', label: 'Triad (strings 4-5-6), 5-1-4', refRoot: 'Bb', frets: '111xxx', fingers: '111xxx', movable: true },
  { type: 'sus4', label: '4-string grip (strings 1-4), 1-4-5-1', refRoot: 'F', frets: 'xx3311', fingers: 'xx2311', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: '4-string grip (strings 1-4), 4-1-4-5', refRoot: 'Bb', frets: 'xx1341', fingers: 'xx1231', movable: true },
  { type: 'sus4', label: '4-string grip (strings 1-4), 4-5-1-4', refRoot: 'Db', frets: 'xx4122', fingers: 'xx4123', movable: true },
  { type: 'sus4', label: '4-string grip (strings 1-4), 4-5-1-5', refRoot: 'Db', frets: 'xx4124', fingers: 'xx3124', movable: true },
  { type: 'sus4', label: '4-string grip (strings 1-4), 5-1-4-1', refRoot: 'Ab', frets: 'xx1124', fingers: 'xx1123', movable: true },
  { type: 'sus4', label: '4-string grip (strings 1-4), 5-1-4-5', refRoot: 'Bb', frets: 'xx3341', fingers: 'xx2341', movable: true },
  { type: 'sus4', label: '4-string grip (strings 2-5), 4-1-4-5', refRoot: 'F', frets: 'x1331x', fingers: 'x1231x', movable: true },
  { type: 'sus4', label: '4-string grip (strings 2-5), 5-1-4-5', refRoot: 'F', frets: 'x3331x', fingers: 'x2341x', movable: true },
  { type: 'sus4', label: '4-string grip (strings 2-5), 1-4-5-1', refRoot: 'Db', frets: 'x4412x', fingers: 'x3412x', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: '4-string grip (strings 2-5), 1-5-1-4', refRoot: 'Bb', frets: 'x1334x', fingers: 'x1234x', movable: true, inversionHint: 'root' },
  { type: 'sus4', label: '4-string grip (strings 2-5), 4-5-1-4', refRoot: 'Ab', frets: 'x4112x', fingers: 'x3112x', movable: true },
  { type: 'sus4', label: '4-string grip (strings 2-5), 4-5-1-5', refRoot: 'Ab', frets: 'x4114x', fingers: 'x2113x', movable: true },
  { type: 'sus4', label: '4-string grip (strings 2-5), 5-1-4-1', refRoot: 'Eb', frets: 'x1114x', fingers: 'x1112x', movable: true },

  // --- maj6: drop 2 and drop 3 voicings ---
  { type: 'maj6', label: 'Drop 2 (strings 1-4), 5-1-3-6', refRoot: 'Ab', frets: 'xx1111', fingers: 'xx1111', movable: true, inversionHint: 'second' },
  { type: 'maj6', label: 'Drop 2 (strings 2-5), 5-1-3-6', refRoot: 'E', frets: 'x2212x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'maj6', label: 'Drop 2 (strings 3-6), 5-1-3-6', refRoot: 'B', frets: '2211xx', fingers: '2311xx', movable: true, inversionHint: 'second' },
  { type: 'maj6', label: 'Drop 3 (strings 2-6, one string skipped), 3-1-5-6', refRoot: 'Eb', frets: '3x131x', fingers: '2x131x', movable: true, inversionHint: 'first' },
  { type: 'maj6', label: 'Drop 3 (strings 1-5, one string skipped), 3-1-5-6', refRoot: 'Ab', frets: 'x3x141', fingers: 'x2x131', movable: true, inversionHint: 'first' },
  { type: 'maj6', label: 'Drop 2 (strings 1-4), 6-3-5-1', refRoot: 'F#', frets: 'xx1322', fingers: 'xx1423', movable: true },
  { type: 'maj6', label: 'Drop 2 (strings 2-5), 6-3-5-1', refRoot: 'Db', frets: 'x1312x', fingers: 'x1312x', movable: true },
  { type: 'maj6', label: 'Drop 2 (strings 3-6), 6-3-5-1', refRoot: 'Ab', frets: '1311xx', fingers: '1211xx', movable: true },
  { type: 'maj6', label: 'Drop 3 (strings 2-6, one string skipped), 5-3-6-1', refRoot: 'C', frets: '3x221x', fingers: '4x231x', movable: true, inversionHint: 'second' },
  { type: 'maj6', label: 'Drop 3 (strings 1-5, one string skipped), 5-3-6-1', refRoot: 'F', frets: 'x3x231', fingers: 'x3x241', movable: true, inversionHint: 'second' },
  { type: 'maj6', label: 'Drop 2 (strings 2-5), 1-5-6-3', refRoot: 'B', frets: 'x2414x', fingers: 'x2314x', movable: true, inversionHint: 'root' },
  { type: 'maj6', label: 'Drop 2 (strings 3-6), 1-5-6-3', refRoot: 'F#', frets: '2413xx', fingers: '2413xx', movable: true, inversionHint: 'root' },
  { type: 'maj6', label: 'Drop 3 (strings 2-6, one string skipped), 6-5-1-3', refRoot: 'Ab', frets: '1x111x', fingers: '1x111x', movable: true },
  { type: 'maj6', label: 'Drop 3 (strings 1-5, one string skipped), 6-5-1-3', refRoot: 'Db', frets: 'x1x121', fingers: 'x1x121', movable: true },
  { type: 'maj6', label: 'Drop 2 (strings 1-4), 3-6-1-5', refRoot: 'C', frets: 'xx2213', fingers: 'xx2314', movable: true, inversionHint: 'first' },
  { type: 'maj6', label: 'Drop 2 (strings 2-5), 3-6-1-5', refRoot: 'Ab', frets: 'x3314x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'maj6', label: 'Drop 2 (strings 3-6), 3-6-1-5', refRoot: 'Eb', frets: '3313xx', fingers: '2314xx', movable: true, inversionHint: 'first' },
  { type: 'maj6', label: 'Drop 3 (strings 2-6, one string skipped), 1-6-3-5', refRoot: 'F#', frets: '2x132x', fingers: '2x143x', movable: true, inversionHint: 'root' },
  { type: 'maj6', label: 'Drop 3 (strings 1-5, one string skipped), 1-6-3-5', refRoot: 'B', frets: 'x2x142', fingers: 'x2x143', movable: true, inversionHint: 'root' },

  // --- min6: drop 2 and drop 3 voicings ---
  { type: 'min6', label: 'Drop 2 (strings 1-4), 5-1-♭3-6', refRoot: 'A', frets: 'xx2212', fingers: 'xx2314', movable: true, inversionHint: 'second' },
  { type: 'min6', label: 'Drop 2 (strings 2-5), 5-1-♭3-6', refRoot: 'F', frets: 'x3313x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'min6', label: 'Drop 2 (strings 3-6), 5-1-♭3-6', refRoot: 'C', frets: '3312xx', fingers: '3412xx', movable: true, inversionHint: 'second' },
  { type: 'min6', label: 'Drop 3 (strings 2-6, one string skipped), ♭3-1-5-6', refRoot: 'Eb', frets: '2x131x', fingers: '2x131x', movable: true, inversionHint: 'first' },
  { type: 'min6', label: 'Drop 3 (strings 1-5, one string skipped), ♭3-1-5-6', refRoot: 'Ab', frets: 'x2x141', fingers: 'x2x131', movable: true, inversionHint: 'first' },
  { type: 'min6', label: 'Drop 2 (strings 1-4), 6-♭3-5-1', refRoot: 'F#', frets: 'xx1222', fingers: 'xx1234', movable: true },
  { type: 'min6', label: 'Drop 2 (strings 2-5), 6-♭3-5-1', refRoot: 'Db', frets: 'x1212x', fingers: 'x1213x', movable: true },
  { type: 'min6', label: 'Drop 2 (strings 3-6), 6-♭3-5-1', refRoot: 'Ab', frets: '1211xx', fingers: '1211xx', movable: true },
  { type: 'min6', label: 'Drop 3 (strings 2-6, one string skipped), 5-♭3-6-1', refRoot: 'C', frets: '3x121x', fingers: '3x121x', movable: true, inversionHint: 'second' },
  { type: 'min6', label: 'Drop 3 (strings 1-5, one string skipped), 5-♭3-6-1', refRoot: 'F', frets: 'x3x131', fingers: 'x2x131', movable: true, inversionHint: 'second' },
  { type: 'min6', label: 'Drop 2 (strings 1-4), 1-5-6-♭3', refRoot: 'Eb', frets: 'xx1312', fingers: 'xx1312', movable: true, inversionHint: 'root' },
  { type: 'min6', label: 'Drop 2 (strings 2-5), 1-5-6-♭3', refRoot: 'B', frets: 'x2413x', fingers: 'x2413x', movable: true, inversionHint: 'root' },
  { type: 'min6', label: 'Drop 2 (strings 3-6), 1-5-6-♭3', refRoot: 'F#', frets: '2412xx', fingers: '2413xx', movable: true, inversionHint: 'root' },
  { type: 'min6', label: 'Drop 3 (strings 2-6, one string skipped), 6-5-1-♭3', refRoot: 'A', frets: '2x221x', fingers: '2x341x', movable: true },
  { type: 'min6', label: 'Drop 3 (strings 1-5, one string skipped), 6-5-1-♭3', refRoot: 'D', frets: 'x2x231', fingers: 'x2x341', movable: true },
  { type: 'min6', label: 'Drop 2 (strings 1-4), ♭3-6-1-5', refRoot: 'C', frets: 'xx1213', fingers: 'xx1213', movable: true, inversionHint: 'first' },
  { type: 'min6', label: 'Drop 2 (strings 2-5), ♭3-6-1-5', refRoot: 'Ab', frets: 'x2314x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'min6', label: 'Drop 2 (strings 3-6), ♭3-6-1-5', refRoot: 'Eb', frets: '2313xx', fingers: '2314xx', movable: true, inversionHint: 'first' },
  { type: 'min6', label: 'Drop 3 (strings 2-6, one string skipped), 1-6-♭3-5', refRoot: 'F#', frets: '2x122x', fingers: '2x134x', movable: true, inversionHint: 'root' },
  { type: 'min6', label: 'Drop 3 (strings 1-5, one string skipped), 1-6-♭3-5', refRoot: 'B', frets: 'x2x132', fingers: 'x2x143', movable: true, inversionHint: 'root' },

  // --- add9: drop 2 and drop 3 voicings ---
  { type: 'add9', label: 'Drop 2 (strings 1-4), 9-3-5-1', refRoot: 'F', frets: 'xx5211', fingers: 'xx3211', movable: true },
  { type: 'add9', label: 'Drop 2 (strings 2-5), 1-5-9-3', refRoot: 'Bb', frets: 'x1353x', fingers: 'x1243x', movable: true, inversionHint: 'root' },
  { type: 'add9', label: 'Drop 2 (strings 3-6), 1-5-9-3', refRoot: 'F', frets: '1352xx', fingers: '1342xx', movable: true, inversionHint: 'root' },
  { type: 'add9', label: 'Drop 3 (strings 2-6, one string skipped), 1-9-3-5', refRoot: 'F', frets: '1x521x', fingers: '1x321x', movable: true, inversionHint: 'root' },
  { type: 'add9', label: 'Drop 3 (strings 1-5, one string skipped), 1-9-3-5', refRoot: 'Bb', frets: 'x1x531', fingers: 'x1x321', movable: true, inversionHint: 'root' },

  // ======================================================================
  // POWER CHORDS
  // ======================================================================

  // --- Movable power chords ---
  { type: 'power', label: 'Root on 6th string', refRoot: 'F', frets: '13xxxx', fingers: '12xxxx', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 6th string with octave', refRoot: 'F', frets: '133xxx', fingers: '123xxx', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 5th string', refRoot: 'Bb', frets: 'x13xxx', fingers: 'x12xxx', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 5th string with octave', refRoot: 'Bb', frets: 'x133xx', fingers: 'x123xx', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 4th string', refRoot: 'Eb', frets: 'xx13xx', fingers: 'xx12xx', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 4th string with octave', refRoot: 'Eb', frets: 'xx134x', fingers: 'xx123x', movable: true, inversionHint: 'root' },
  { type: 'power', label: 'Root on 3rd string', refRoot: 'Ab', frets: 'xxx14x', fingers: 'xxx12x', movable: true, inversionHint: 'root' },
  { type: 'power', label: '5th in bass (strings 6-5)', refRoot: 'Bb', frets: '11xxxx', fingers: '11xxxx', movable: true },
  { type: 'power', label: '5th in bass (strings 5-4)', refRoot: 'Eb', frets: 'x11xxx', fingers: 'x11xxx', movable: true },
  { type: 'power', label: '5th in bass (strings 4-3)', refRoot: 'Ab', frets: 'xx11xx', fingers: 'xx11xx', movable: true },
  { type: 'power', label: '5th in bass (strings 6-5-4)', refRoot: 'Bb', frets: '113xxx', fingers: '112xxx', movable: true },
  { type: 'power', label: '5th in bass (strings 5-4-3)', refRoot: 'Eb', frets: 'x113xx', fingers: 'x112xx', movable: true },

  // --- Open power chords ---
  { type: 'power', label: 'E5 open', refRoot: 'E', frets: '022xxx', fingers: '012xxx', movable: false, inversionHint: 'root' },
  { type: 'power', label: 'A5 open', refRoot: 'A', frets: 'x022xx', fingers: 'x012xx', movable: false, inversionHint: 'root' },
  { type: 'power', label: 'D5 open', refRoot: 'D', frets: 'xx023x', fingers: 'xx012x', movable: false, inversionHint: 'root' },

  // ======================================================================
  // SEVENTH CHORDS
  // ======================================================================

  // --- Dominant 7th: open ---
  { type: 'dom7', label: 'E7 open', refRoot: 'E', frets: '020100', fingers: '020100', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'E7 open (alt, 020130)', refRoot: 'E', frets: '020130', fingers: '020130', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'A7 open', refRoot: 'A', frets: 'x02020', fingers: 'x01020', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'A7 open (alt, x02223)', refRoot: 'A', frets: 'x02223', fingers: 'x01234', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'D7 open', refRoot: 'D', frets: 'xx0212', fingers: 'xx0213', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'C7 open', refRoot: 'C', frets: 'x32310', fingers: 'x32410', omitted: ['5'], movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'G7 open', refRoot: 'G', frets: '320001', fingers: '320001', movable: false, inversionHint: 'root' },
  { type: 'dom7', label: 'B7 open', refRoot: 'B', frets: 'x21202', fingers: 'x21304', movable: false, inversionHint: 'root' },

  // --- Dominant 7th: movable grips ---
  { type: 'dom7', label: 'E-shape barre (root 6th string)', refRoot: 'F', frets: '131211', fingers: '131211', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'A-shape barre (root 5th string)', refRoot: 'Bb', frets: 'x13131', fingers: 'x12131', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1323', fingers: 'xx1324', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'G-shape barre (root 6th string)', refRoot: 'Ab', frets: '431112', fingers: '431112', movable: true, inversionHint: 'root' },

  // --- Major 7th: open ---
  { type: 'maj7', label: 'Cmaj7 open', refRoot: 'C', frets: 'x32000', fingers: 'x21000', movable: false, inversionHint: 'root' },
  { type: 'maj7', label: 'Fmaj7 open', refRoot: 'F', frets: 'xx3210', fingers: 'xx3210', movable: false, inversionHint: 'root' },
  { type: 'maj7', label: 'Amaj7 open', refRoot: 'A', frets: 'x02120', fingers: 'x02130', movable: false, inversionHint: 'root' },
  { type: 'maj7', label: 'Dmaj7 open', refRoot: 'D', frets: 'xx0222', fingers: 'xx0123', movable: false, inversionHint: 'root' },
  { type: 'maj7', label: 'Emaj7 open', refRoot: 'E', frets: '021100', fingers: '031200', movable: false, inversionHint: 'root' },
  { type: 'maj7', label: 'Gmaj7 open', refRoot: 'G', frets: '320002', fingers: '310002', movable: false, inversionHint: 'root' },

  // --- Major 7th: movable grips ---
  { type: 'maj7', label: 'E-shape barre (root 6th string)', refRoot: 'F', frets: '132211', fingers: '142311', movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'E-shape, 5th string muted', refRoot: 'F', frets: '1x221x', fingers: '1x231x', movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'A-shape barre (root 5th string)', refRoot: 'Bb', frets: 'x13231', fingers: 'x13241', movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1333', fingers: 'xx1234', movable: true, inversionHint: 'root' },

  // --- Minor 7th: open ---
  { type: 'min7', label: 'Am7 open', refRoot: 'A', frets: 'x02010', fingers: 'x02010', movable: false, inversionHint: 'root' },
  { type: 'min7', label: 'Em7 open', refRoot: 'E', frets: '022030', fingers: '012030', movable: false, inversionHint: 'root' },
  { type: 'min7', label: 'Em7 open (alt, 020000)', refRoot: 'E', frets: '020000', fingers: '010000', movable: false, inversionHint: 'root' },
  { type: 'min7', label: 'Dm7 open', refRoot: 'D', frets: 'xx0211', fingers: 'xx0312', movable: false, inversionHint: 'root' },
  { type: 'min7', label: 'Bm7 open', refRoot: 'B', frets: 'x20202', fingers: 'x10203', movable: false, inversionHint: 'root' },

  // --- Minor 7th: movable grips ---
  { type: 'min7', label: 'E-shape barre (root 6th string)', refRoot: 'F', frets: '131111', fingers: '121111', movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'A-shape barre (root 5th string)', refRoot: 'Bb', frets: 'x13121', fingers: 'x13121', movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1322', fingers: 'xx1423', movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'E-shape, 5th string muted', refRoot: 'F', frets: '1x111x', fingers: '1x111x', movable: true, inversionHint: 'root' },

  // --- Half-diminished (m7♭5) ---
  { type: 'm7b5', label: 'A-shape (root 5th string)', refRoot: 'B', frets: 'x2323x', fingers: 'x1213x', movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'E-shape (root 6th string)', refRoot: 'G', frets: '3x332x', fingers: '2x341x', movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1222', fingers: 'xx1234', movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'D open', refRoot: 'D', frets: 'xx0111', fingers: 'xx0123', movable: false, inversionHint: 'root' },

  // --- Diminished 7th ---
  { type: 'dim7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1212', fingers: 'xx1213', movable: true, inversionHint: 'root' },
  { type: 'dim7', label: 'A-shape (root 5th string)', refRoot: 'B', frets: 'x2313x', fingers: 'x2314x', movable: true, inversionHint: 'root' },
  { type: 'dim7', label: 'E-shape (root 6th string)', refRoot: 'G', frets: '3x232x', fingers: '2x131x', movable: true, inversionHint: 'root' },

  // --- Minor-major 7th ---
  { type: 'minMaj7', label: 'Am(maj7) open', refRoot: 'A', frets: 'x02110', fingers: 'x03120', movable: false, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Em(maj7) open', refRoot: 'E', frets: '021000', fingers: '021000', movable: false, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Dm(maj7) open', refRoot: 'D', frets: 'xx0221', fingers: 'xx0231', movable: false, inversionHint: 'root' },
  { type: 'minMaj7', label: 'E-shape (root 6th string)', refRoot: 'F', frets: '1x211x', fingers: '1x211x', movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'A-shape (root 5th string)', refRoot: 'Bb', frets: 'x13221', fingers: 'x14231', movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1332', fingers: 'xx1342', movable: true, inversionHint: 'root' },

  // --- Augmented 7th and augmented major 7th ---
  { type: 'aug7', label: 'E7♯5 open', refRoot: 'E', frets: '0x0110', fingers: '0x0120', movable: false, inversionHint: 'root' },
  { type: 'aug7', label: 'C7♯5 (strings 5-4-3-1)', refRoot: 'C', frets: 'x323x4', fingers: 'x213x4', movable: true, inversionHint: 'root' },
  { type: 'augMaj7', label: 'Cmaj7♯5 open', refRoot: 'C', frets: 'x32100', fingers: 'x32100', movable: false, inversionHint: 'root' },

  // --- Dominant 7 sus4 ---
  { type: 'sus7', label: 'A7sus4 open', refRoot: 'A', frets: 'x02030', fingers: 'x01020', movable: false, inversionHint: 'root' },
  { type: 'sus7', label: 'D7sus4 open', refRoot: 'D', frets: 'xx0213', fingers: 'xx0213', movable: false, inversionHint: 'root' },
  { type: 'sus7', label: 'E7sus4 open', refRoot: 'E', frets: '020200', fingers: '010200', movable: false, inversionHint: 'root' },
  { type: 'sus7', label: 'G7sus4 open', refRoot: 'G', frets: '330011', fingers: '340012', movable: false, inversionHint: 'root' },
  { type: 'sus7', label: 'E-shape barre', refRoot: 'F', frets: '131311', fingers: '121311', movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'A-shape barre', refRoot: 'Bb', frets: 'x13141', fingers: 'x12131', movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'D-shape (root 4th string)', refRoot: 'Eb', frets: 'xx1324', fingers: 'xx1324', movable: true, inversionHint: 'root' },

  // --- dom7: drop 2 and drop 3 voicings ---
  { type: 'dom7', label: 'Drop 2 (strings 1-4), 5-1-3-♭7', refRoot: 'Ab', frets: 'xx1112', fingers: 'xx1112', movable: true, inversionHint: 'second' },
  { type: 'dom7', label: 'Drop 2 (strings 2-5), 5-1-3-♭7', refRoot: 'E', frets: 'x2213x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'dom7', label: 'Drop 2 (strings 3-6), 5-1-3-♭7', refRoot: 'B', frets: '2212xx', fingers: '2314xx', movable: true, inversionHint: 'second' },
  { type: 'dom7', label: 'Drop 3 (strings 2-6, one string skipped), 3-1-5-♭7', refRoot: 'Eb', frets: '3x132x', fingers: '3x142x', movable: true, inversionHint: 'first' },
  { type: 'dom7', label: 'Drop 3 (strings 1-5, one string skipped), 3-1-5-♭7', refRoot: 'Ab', frets: 'x3x142', fingers: 'x3x142', movable: true, inversionHint: 'first' },
  { type: 'dom7', label: 'Drop 2 (strings 1-4), ♭7-3-5-1', refRoot: 'F', frets: 'xx1211', fingers: 'xx1211', movable: true, inversionHint: 'third' },
  { type: 'dom7', label: 'Drop 2 (strings 2-5), ♭7-3-5-1', refRoot: 'Db', frets: 'x2312x', fingers: 'x2413x', movable: true, inversionHint: 'third' },
  { type: 'dom7', label: 'Drop 2 (strings 3-6), ♭7-3-5-1', refRoot: 'Ab', frets: '2311xx', fingers: '2311xx', movable: true, inversionHint: 'third' },
  { type: 'dom7', label: 'Drop 3 (strings 2-6, one string skipped), 5-3-♭7-1', refRoot: 'C', frets: '3x231x', fingers: '3x241x', movable: true, inversionHint: 'second' },
  { type: 'dom7', label: 'Drop 3 (strings 1-5, one string skipped), 5-3-♭7-1', refRoot: 'F', frets: 'x3x241', fingers: 'x3x241', movable: true, inversionHint: 'second' },
  { type: 'dom7', label: 'Drop 2 (strings 2-5), 1-5-♭7-3', refRoot: 'Bb', frets: 'x1313x', fingers: 'x1213x', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Drop 2 (strings 3-6), 1-5-♭7-3', refRoot: 'F', frets: '1312xx', fingers: '1312xx', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Drop 3 (strings 2-6, one string skipped), ♭7-5-1-3', refRoot: 'Ab', frets: '2x111x', fingers: '2x111x', movable: true, inversionHint: 'third' },
  { type: 'dom7', label: 'Drop 3 (strings 1-5, one string skipped), ♭7-5-1-3', refRoot: 'Db', frets: 'x2x121', fingers: 'x2x131', movable: true, inversionHint: 'third' },
  { type: 'dom7', label: 'Drop 2 (strings 1-4), 3-♭7-1-5', refRoot: 'C', frets: 'xx2313', fingers: 'xx2314', movable: true, inversionHint: 'first' },
  { type: 'dom7', label: 'Drop 2 (strings 2-5), 3-♭7-1-5', refRoot: 'Ab', frets: 'x3414x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'dom7', label: 'Drop 2 (strings 3-6), 3-♭7-1-5', refRoot: 'Eb', frets: '3413xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'dom7', label: 'Drop 3 (strings 2-6, one string skipped), 1-♭7-3-5', refRoot: 'F', frets: '1x121x', fingers: '1x121x', movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Drop 3 (strings 1-5, one string skipped), 1-♭7-3-5', refRoot: 'Bb', frets: 'x1x131', fingers: 'x1x121', movable: true, inversionHint: 'root' },

  // --- maj7: drop 2 and drop 3 voicings ---
  { type: 'maj7', label: 'Drop 2 (strings 1-4), 5-1-3-7', refRoot: 'Ab', frets: 'xx1113', fingers: 'xx1112', movable: true, inversionHint: 'second' },
  { type: 'maj7', label: 'Drop 2 (strings 2-5), 5-1-3-7', refRoot: 'E', frets: 'x2214x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'maj7', label: 'Drop 2 (strings 3-6), 5-1-3-7', refRoot: 'B', frets: '2213xx', fingers: '2314xx', movable: true, inversionHint: 'second' },
  { type: 'maj7', label: 'Drop 3 (strings 2-6, one string skipped), 3-1-5-7', refRoot: 'Eb', frets: '3x133x', fingers: '2x134x', movable: true, inversionHint: 'first' },
  { type: 'maj7', label: 'Drop 3 (strings 1-5, one string skipped), 3-1-5-7', refRoot: 'Ab', frets: 'x3x143', fingers: 'x2x143', movable: true, inversionHint: 'first' },
  { type: 'maj7', label: 'Drop 2 (strings 1-4), 7-3-5-1', refRoot: 'F', frets: 'xx2211', fingers: 'xx2311', movable: true, inversionHint: 'third' },
  { type: 'maj7', label: 'Drop 2 (strings 2-5), 7-3-5-1', refRoot: 'Db', frets: 'x3312x', fingers: 'x3412x', movable: true, inversionHint: 'third' },
  { type: 'maj7', label: 'Drop 2 (strings 3-6), 7-3-5-1', refRoot: 'Ab', frets: '3311xx', fingers: '2311xx', movable: true, inversionHint: 'third' },
  { type: 'maj7', label: 'Drop 3 (strings 2-6, one string skipped), 5-3-7-1', refRoot: 'C', frets: '3x241x', fingers: '3x241x', movable: true, inversionHint: 'second' },
  { type: 'maj7', label: 'Drop 3 (strings 1-5, one string skipped), 5-3-7-1', refRoot: 'F', frets: 'x3x251', fingers: 'x3x241', movable: true, inversionHint: 'second' },
  { type: 'maj7', label: 'Drop 2 (strings 2-5), 1-5-7-3', refRoot: 'Bb', frets: 'x1323x', fingers: 'x1324x', movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'Drop 2 (strings 3-6), 1-5-7-3', refRoot: 'F', frets: '1322xx', fingers: '1423xx', movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'Drop 3 (strings 2-6, one string skipped), 7-5-1-3', refRoot: 'Ab', frets: '3x111x', fingers: '2x111x', movable: true, inversionHint: 'third' },
  { type: 'maj7', label: 'Drop 3 (strings 1-5, one string skipped), 7-5-1-3', refRoot: 'Db', frets: 'x3x121', fingers: 'x3x121', movable: true, inversionHint: 'third' },
  { type: 'maj7', label: 'Drop 2 (strings 1-4), 3-7-1-5', refRoot: 'C', frets: 'xx2413', fingers: 'xx2413', movable: true, inversionHint: 'first' },
  { type: 'maj7', label: 'Drop 2 (strings 2-5), 3-7-1-5', refRoot: 'Ab', frets: 'x3514x', fingers: 'x2413x', movable: true, inversionHint: 'first' },
  { type: 'maj7', label: 'Drop 2 (strings 3-6), 3-7-1-5', refRoot: 'Eb', frets: '3513xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'maj7', label: 'Drop 3 (strings 1-5, one string skipped), 1-7-3-5', refRoot: 'Bb', frets: 'x1x231', fingers: 'x1x231', movable: true, inversionHint: 'root' },

  // --- min7: drop 2 and drop 3 voicings ---
  { type: 'min7', label: 'Drop 2 (strings 1-4), 5-1-♭3-♭7', refRoot: 'A', frets: 'xx2213', fingers: 'xx2314', movable: true, inversionHint: 'second' },
  { type: 'min7', label: 'Drop 2 (strings 2-5), 5-1-♭3-♭7', refRoot: 'F', frets: 'x3314x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'min7', label: 'Drop 2 (strings 3-6), 5-1-♭3-♭7', refRoot: 'C', frets: '3313xx', fingers: '2314xx', movable: true, inversionHint: 'second' },
  { type: 'min7', label: 'Drop 3 (strings 2-6, one string skipped), ♭3-1-5-♭7', refRoot: 'Eb', frets: '2x132x', fingers: '2x143x', movable: true, inversionHint: 'first' },
  { type: 'min7', label: 'Drop 3 (strings 1-5, one string skipped), ♭3-1-5-♭7', refRoot: 'Ab', frets: 'x2x142', fingers: 'x2x143', movable: true, inversionHint: 'first' },
  { type: 'min7', label: 'Drop 2 (strings 1-4), ♭7-♭3-5-1', refRoot: 'F', frets: 'xx1111', fingers: 'xx1111', movable: true, inversionHint: 'third' },
  { type: 'min7', label: 'Drop 2 (strings 2-5), ♭7-♭3-5-1', refRoot: 'Db', frets: 'x2212x', fingers: 'x2314x', movable: true, inversionHint: 'third' },
  { type: 'min7', label: 'Drop 2 (strings 3-6), ♭7-♭3-5-1', refRoot: 'Ab', frets: '2211xx', fingers: '2311xx', movable: true, inversionHint: 'third' },
  { type: 'min7', label: 'Drop 3 (strings 2-6, one string skipped), 5-♭3-♭7-1', refRoot: 'C', frets: '3x131x', fingers: '2x131x', movable: true, inversionHint: 'second' },
  { type: 'min7', label: 'Drop 3 (strings 1-5, one string skipped), 5-♭3-♭7-1', refRoot: 'F', frets: 'x3x141', fingers: 'x2x131', movable: true, inversionHint: 'second' },
  { type: 'min7', label: 'Drop 2 (strings 2-5), 1-5-♭7-♭3', refRoot: 'Bb', frets: 'x1312x', fingers: 'x1312x', movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'Drop 2 (strings 3-6), 1-5-♭7-♭3', refRoot: 'F', frets: '1311xx', fingers: '1211xx', movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'Drop 3 (strings 2-6, one string skipped), ♭7-5-1-♭3', refRoot: 'A', frets: '3x221x', fingers: '4x231x', movable: true, inversionHint: 'third' },
  { type: 'min7', label: 'Drop 3 (strings 1-5, one string skipped), ♭7-5-1-♭3', refRoot: 'D', frets: 'x3x231', fingers: 'x3x241', movable: true, inversionHint: 'third' },
  { type: 'min7', label: 'Drop 2 (strings 1-4), ♭3-♭7-1-5', refRoot: 'C', frets: 'xx1313', fingers: 'xx1213', movable: true, inversionHint: 'first' },
  { type: 'min7', label: 'Drop 2 (strings 2-5), ♭3-♭7-1-5', refRoot: 'Ab', frets: 'x2414x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'min7', label: 'Drop 2 (strings 3-6), ♭3-♭7-1-5', refRoot: 'Eb', frets: '2413xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'min7', label: 'Drop 3 (strings 1-5, one string skipped), 1-♭7-♭3-5', refRoot: 'Bb', frets: 'x1x121', fingers: 'x1x121', movable: true, inversionHint: 'root' },

  // --- m7b5: drop 2 and drop 3 voicings ---
  { type: 'm7b5', label: 'Drop 2 (strings 1-4), ♭5-1-♭3-♭7', refRoot: 'A', frets: 'xx1213', fingers: 'xx1213', movable: true, inversionHint: 'second' },
  { type: 'm7b5', label: 'Drop 2 (strings 2-5), ♭5-1-♭3-♭7', refRoot: 'F', frets: 'x2314x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'm7b5', label: 'Drop 2 (strings 3-6), ♭5-1-♭3-♭7', refRoot: 'C', frets: '2313xx', fingers: '2314xx', movable: true, inversionHint: 'second' },
  { type: 'm7b5', label: 'Drop 3 (strings 2-6, one string skipped), ♭3-1-♭5-♭7', refRoot: 'Eb', frets: '2x122x', fingers: '2x134x', movable: true, inversionHint: 'first' },
  { type: 'm7b5', label: 'Drop 3 (strings 1-5, one string skipped), ♭3-1-♭5-♭7', refRoot: 'Ab', frets: 'x2x132', fingers: 'x2x143', movable: true, inversionHint: 'first' },
  { type: 'm7b5', label: 'Drop 2 (strings 1-4), ♭7-♭3-♭5-1', refRoot: 'F#', frets: 'xx2212', fingers: 'xx2314', movable: true, inversionHint: 'third' },
  { type: 'm7b5', label: 'Drop 2 (strings 2-5), ♭7-♭3-♭5-1', refRoot: 'D', frets: 'x3313x', fingers: 'x2314x', movable: true, inversionHint: 'third' },
  { type: 'm7b5', label: 'Drop 2 (strings 3-6), ♭7-♭3-♭5-1', refRoot: 'A', frets: '3312xx', fingers: '3412xx', movable: true, inversionHint: 'third' },
  { type: 'm7b5', label: 'Drop 3 (strings 2-6, one string skipped), ♭5-♭3-♭7-1', refRoot: 'C', frets: '2x131x', fingers: '2x131x', movable: true, inversionHint: 'second' },
  { type: 'm7b5', label: 'Drop 3 (strings 1-5, one string skipped), ♭5-♭3-♭7-1', refRoot: 'F', frets: 'x2x141', fingers: 'x2x131', movable: true, inversionHint: 'second' },
  { type: 'm7b5', label: 'Drop 2 (strings 3-6), 1-♭5-♭7-♭3', refRoot: 'F', frets: '1211xx', fingers: '1211xx', movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'Drop 3 (strings 2-6, one string skipped), ♭7-♭5-1-♭3', refRoot: 'A', frets: '3x121x', fingers: '3x121x', movable: true, inversionHint: 'third' },
  { type: 'm7b5', label: 'Drop 3 (strings 1-5, one string skipped), ♭7-♭5-1-♭3', refRoot: 'D', frets: 'x3x131', fingers: 'x2x131', movable: true, inversionHint: 'third' },
  { type: 'm7b5', label: 'Drop 2 (strings 1-4), ♭3-♭7-1-♭5', refRoot: 'C', frets: 'xx1312', fingers: 'xx1312', movable: true, inversionHint: 'first' },
  { type: 'm7b5', label: 'Drop 2 (strings 2-5), ♭3-♭7-1-♭5', refRoot: 'Ab', frets: 'x2413x', fingers: 'x2413x', movable: true, inversionHint: 'first' },
  { type: 'm7b5', label: 'Drop 2 (strings 3-6), ♭3-♭7-1-♭5', refRoot: 'Eb', frets: '2412xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'm7b5', label: 'Drop 3 (strings 1-5, one string skipped), 1-♭7-♭3-♭5', refRoot: 'B', frets: 'x2x231', fingers: 'x2x341', movable: true, inversionHint: 'root' },

  // --- dim7: drop 2 and drop 3 voicings ---
  { type: 'dim7', label: 'Drop 2 (strings 3-6), ♭5-1-♭3-𝄫7', refRoot: 'C', frets: '2312xx', fingers: '2413xx', movable: true, inversionHint: 'second' },
  { type: 'dim7', label: 'Drop 3 (strings 1-5, one string skipped), ♭3-1-♭5-𝄫7', refRoot: 'Ab', frets: 'x2x131', fingers: 'x2x131', movable: true, inversionHint: 'first' },

  // --- minMaj7: drop 2 and drop 3 voicings ---
  { type: 'minMaj7', label: 'Drop 2 (strings 1-4), 5-1-♭3-7', refRoot: 'A', frets: 'xx2214', fingers: 'xx2314', movable: true, inversionHint: 'second' },
  { type: 'minMaj7', label: 'Drop 2 (strings 2-5), 5-1-♭3-7', refRoot: 'F', frets: 'x3315x', fingers: 'x2314x', movable: true, inversionHint: 'second' },
  { type: 'minMaj7', label: 'Drop 2 (strings 3-6), 5-1-♭3-7', refRoot: 'C', frets: '3314xx', fingers: '2314xx', movable: true, inversionHint: 'second' },
  { type: 'minMaj7', label: 'Drop 3 (strings 2-6, one string skipped), ♭3-1-5-7', refRoot: 'Eb', frets: '2x133x', fingers: '2x134x', movable: true, inversionHint: 'first' },
  { type: 'minMaj7', label: 'Drop 3 (strings 1-5, one string skipped), ♭3-1-5-7', refRoot: 'Ab', frets: 'x2x143', fingers: 'x2x143', movable: true, inversionHint: 'first' },
  { type: 'minMaj7', label: 'Drop 2 (strings 1-4), 7-♭3-5-1', refRoot: 'F', frets: 'xx2111', fingers: 'xx2111', movable: true, inversionHint: 'third' },
  { type: 'minMaj7', label: 'Drop 2 (strings 2-5), 7-♭3-5-1', refRoot: 'Db', frets: 'x3212x', fingers: 'x4213x', movable: true, inversionHint: 'third' },
  { type: 'minMaj7', label: 'Drop 2 (strings 3-6), 7-♭3-5-1', refRoot: 'Ab', frets: '3211xx', fingers: '3211xx', movable: true, inversionHint: 'third' },
  { type: 'minMaj7', label: 'Drop 3 (strings 2-6, one string skipped), 5-♭3-7-1', refRoot: 'C', frets: '3x141x', fingers: '2x131x', movable: true, inversionHint: 'second' },
  { type: 'minMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 5-♭3-7-1', refRoot: 'F', frets: 'x3x151', fingers: 'x2x131', movable: true, inversionHint: 'second' },
  { type: 'minMaj7', label: 'Drop 2 (strings 2-5), 1-5-7-♭3', refRoot: 'Bb', frets: 'x1322x', fingers: 'x1423x', movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Drop 2 (strings 3-6), 1-5-7-♭3', refRoot: 'F', frets: '1321xx', fingers: '1321xx', movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Drop 3 (strings 2-6, one string skipped), 7-5-1-♭3', refRoot: 'A', frets: '4x221x', fingers: '4x231x', movable: true, inversionHint: 'third' },
  { type: 'minMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 7-5-1-♭3', refRoot: 'D', frets: 'x4x231', fingers: 'x4x231', movable: true, inversionHint: 'third' },
  { type: 'minMaj7', label: 'Drop 2 (strings 1-4), ♭3-7-1-5', refRoot: 'C', frets: 'xx1413', fingers: 'xx1312', movable: true, inversionHint: 'first' },
  { type: 'minMaj7', label: 'Drop 2 (strings 2-5), ♭3-7-1-5', refRoot: 'Ab', frets: 'x2514x', fingers: 'x2413x', movable: true, inversionHint: 'first' },
  { type: 'minMaj7', label: 'Drop 2 (strings 3-6), ♭3-7-1-5', refRoot: 'Eb', frets: '2513xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'minMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 1-7-♭3-5', refRoot: 'Bb', frets: 'x1x221', fingers: 'x1x231', movable: true, inversionHint: 'root' },

  // --- aug7: drop 2 and drop 3 voicings ---
  { type: 'aug7', label: 'Drop 2 (strings 1-4), ♯5-1-3-♭7', refRoot: 'Ab', frets: 'xx2112', fingers: 'xx2113', movable: true, inversionHint: 'second' },
  { type: 'aug7', label: 'Drop 2 (strings 2-5), ♯5-1-3-♭7', refRoot: 'E', frets: 'x3213x', fingers: 'x3214x', movable: true, inversionHint: 'second' },
  { type: 'aug7', label: 'Drop 2 (strings 3-6), ♯5-1-3-♭7', refRoot: 'B', frets: '3212xx', fingers: '4213xx', movable: true, inversionHint: 'second' },
  { type: 'aug7', label: 'Drop 3 (strings 2-6, one string skipped), 3-1-♯5-♭7', refRoot: 'Eb', frets: '3x142x', fingers: '3x142x', movable: true, inversionHint: 'first' },
  { type: 'aug7', label: 'Drop 3 (strings 1-5, one string skipped), 3-1-♯5-♭7', refRoot: 'Ab', frets: 'x3x152', fingers: 'x3x142', movable: true, inversionHint: 'first' },
  { type: 'aug7', label: 'Drop 2 (strings 1-4), ♭7-3-♯5-1', refRoot: 'F', frets: 'xx1221', fingers: 'xx1231', movable: true, inversionHint: 'third' },
  { type: 'aug7', label: 'Drop 2 (strings 2-5), ♭7-3-♯5-1', refRoot: 'C', frets: 'x1211x', fingers: 'x1211x', movable: true, inversionHint: 'third' },
  { type: 'aug7', label: 'Drop 2 (strings 3-6), ♭7-3-♯5-1', refRoot: 'Ab', frets: '2321xx', fingers: '2431xx', movable: true, inversionHint: 'third' },
  { type: 'aug7', label: 'Drop 3 (strings 2-6, one string skipped), ♯5-3-♭7-1', refRoot: 'C', frets: '4x231x', fingers: '4x231x', movable: true, inversionHint: 'second' },
  { type: 'aug7', label: 'Drop 3 (strings 1-5, one string skipped), ♯5-3-♭7-1', refRoot: 'F', frets: 'x4x241', fingers: 'x3x241', movable: true, inversionHint: 'second' },
  { type: 'aug7', label: 'Drop 2 (strings 1-4), 1-♯5-♭7-3', refRoot: 'Eb', frets: 'xx1423', fingers: 'xx1423', movable: true, inversionHint: 'root' },
  { type: 'aug7', label: 'Drop 2 (strings 2-5), 1-♯5-♭7-3', refRoot: 'Bb', frets: 'x1413x', fingers: 'x1312x', movable: true, inversionHint: 'root' },
  { type: 'aug7', label: 'Drop 2 (strings 3-6), 1-♯5-♭7-3', refRoot: 'F', frets: '1412xx', fingers: '1312xx', movable: true, inversionHint: 'root' },
  { type: 'aug7', label: 'Drop 3 (strings 2-6, one string skipped), ♭7-♯5-1-3', refRoot: 'Ab', frets: '2x211x', fingers: '2x311x', movable: true, inversionHint: 'third' },
  { type: 'aug7', label: 'Drop 3 (strings 1-5, one string skipped), ♭7-♯5-1-3', refRoot: 'Db', frets: 'x2x221', fingers: 'x2x341', movable: true, inversionHint: 'third' },
  { type: 'aug7', label: 'Drop 2 (strings 1-4), 3-♭7-1-♯5', refRoot: 'C', frets: 'xx2314', fingers: 'xx2314', movable: true, inversionHint: 'first' },
  { type: 'aug7', label: 'Drop 2 (strings 2-5), 3-♭7-1-♯5', refRoot: 'Ab', frets: 'x3415x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'aug7', label: 'Drop 2 (strings 3-6), 3-♭7-1-♯5', refRoot: 'Eb', frets: '3414xx', fingers: '2314xx', movable: true, inversionHint: 'first' },
  { type: 'aug7', label: 'Drop 3 (strings 2-6, one string skipped), 1-♭7-3-♯5', refRoot: 'F', frets: '1x122x', fingers: '1x123x', movable: true, inversionHint: 'root' },
  { type: 'aug7', label: 'Drop 3 (strings 1-5, one string skipped), 1-♭7-3-♯5', refRoot: 'Bb', frets: 'x1x132', fingers: 'x1x132', movable: true, inversionHint: 'root' },

  // --- augMaj7: drop 2 and drop 3 voicings ---
  { type: 'augMaj7', label: 'Drop 2 (strings 1-4), ♯5-1-3-7', refRoot: 'Ab', frets: 'xx2113', fingers: 'xx2113', movable: true, inversionHint: 'second' },
  { type: 'augMaj7', label: 'Drop 2 (strings 2-5), ♯5-1-3-7', refRoot: 'E', frets: 'x3214x', fingers: 'x3214x', movable: true, inversionHint: 'second' },
  { type: 'augMaj7', label: 'Drop 2 (strings 3-6), ♯5-1-3-7', refRoot: 'B', frets: '3213xx', fingers: '3214xx', movable: true, inversionHint: 'second' },
  { type: 'augMaj7', label: 'Drop 3 (strings 2-6, one string skipped), 3-1-♯5-7', refRoot: 'Eb', frets: '3x143x', fingers: '2x143x', movable: true, inversionHint: 'first' },
  { type: 'augMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 3-1-♯5-7', refRoot: 'Ab', frets: 'x3x153', fingers: 'x2x143', movable: true, inversionHint: 'first' },
  { type: 'augMaj7', label: 'Drop 2 (strings 1-4), 7-3-♯5-1', refRoot: 'F', frets: 'xx2221', fingers: 'xx2341', movable: true, inversionHint: 'third' },
  { type: 'augMaj7', label: 'Drop 2 (strings 2-5), 7-3-♯5-1', refRoot: 'C', frets: 'x2211x', fingers: 'x2311x', movable: true, inversionHint: 'third' },
  { type: 'augMaj7', label: 'Drop 2 (strings 3-6), 7-3-♯5-1', refRoot: 'Ab', frets: '3321xx', fingers: '3421xx', movable: true, inversionHint: 'third' },
  { type: 'augMaj7', label: 'Drop 3 (strings 2-6, one string skipped), ♯5-3-7-1', refRoot: 'C', frets: '4x241x', fingers: '3x241x', movable: true, inversionHint: 'second' },
  { type: 'augMaj7', label: 'Drop 3 (strings 1-5, one string skipped), ♯5-3-7-1', refRoot: 'F', frets: 'x4x251', fingers: 'x3x241', movable: true, inversionHint: 'second' },
  { type: 'augMaj7', label: 'Drop 2 (strings 1-4), 1-♯5-7-3', refRoot: 'Eb', frets: 'xx1433', fingers: 'xx1423', movable: true, inversionHint: 'root' },
  { type: 'augMaj7', label: 'Drop 2 (strings 2-5), 1-♯5-7-3', refRoot: 'Bb', frets: 'x1423x', fingers: 'x1423x', movable: true, inversionHint: 'root' },
  { type: 'augMaj7', label: 'Drop 2 (strings 3-6), 1-♯5-7-3', refRoot: 'F', frets: '1422xx', fingers: '1423xx', movable: true, inversionHint: 'root' },
  { type: 'augMaj7', label: 'Drop 3 (strings 2-6, one string skipped), 7-♯5-1-3', refRoot: 'Ab', frets: '3x211x', fingers: '3x211x', movable: true, inversionHint: 'third' },
  { type: 'augMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 7-♯5-1-3', refRoot: 'Db', frets: 'x3x221', fingers: 'x4x231', movable: true, inversionHint: 'third' },
  { type: 'augMaj7', label: 'Drop 2 (strings 1-4), 3-7-1-♯5', refRoot: 'C', frets: 'xx2414', fingers: 'xx2314', movable: true, inversionHint: 'first' },
  { type: 'augMaj7', label: 'Drop 2 (strings 2-5), 3-7-1-♯5', refRoot: 'Ab', frets: 'x3515x', fingers: 'x2314x', movable: true, inversionHint: 'first' },
  { type: 'augMaj7', label: 'Drop 2 (strings 3-6), 3-7-1-♯5', refRoot: 'Eb', frets: '3514xx', fingers: '2413xx', movable: true, inversionHint: 'first' },
  { type: 'augMaj7', label: 'Drop 3 (strings 2-6, one string skipped), 1-7-3-♯5', refRoot: 'F', frets: '1x222x', fingers: '1x234x', movable: true, inversionHint: 'root' },
  { type: 'augMaj7', label: 'Drop 3 (strings 1-5, one string skipped), 1-7-3-♯5', refRoot: 'Bb', frets: 'x1x232', fingers: 'x1x243', movable: true, inversionHint: 'root' },

  // --- sus7: drop 2 and drop 3 voicings ---
  { type: 'sus7', label: 'Drop 2 (strings 1-4), 5-1-4-♭7', refRoot: 'Ab', frets: 'xx1122', fingers: 'xx1123', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 2-5), 5-1-4-♭7', refRoot: 'Eb', frets: 'x1112x', fingers: 'x1112x', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 3-6), 5-1-4-♭7', refRoot: 'Bb', frets: '1111xx', fingers: '1111xx', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 2-6, one string skipped), 4-1-5-♭7', refRoot: 'Eb', frets: '4x132x', fingers: '4x132x', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 1-5, one string skipped), 4-1-5-♭7', refRoot: 'Ab', frets: 'x4x142', fingers: 'x3x142', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 1-4), ♭7-4-5-1', refRoot: 'F', frets: 'xx1311', fingers: 'xx1211', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 2-5), ♭7-4-5-1', refRoot: 'Db', frets: 'x2412x', fingers: 'x2413x', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 3-6), ♭7-4-5-1', refRoot: 'Ab', frets: '2411xx', fingers: '2311xx', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 2-6, one string skipped), 5-4-♭7-1', refRoot: 'C', frets: '3x331x', fingers: '2x341x', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 1-5, one string skipped), 5-4-♭7-1', refRoot: 'F', frets: 'x3x341', fingers: 'x2x341', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 2-5), 1-5-♭7-4', refRoot: 'Bb', frets: 'x1314x', fingers: 'x1213x', movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Drop 2 (strings 3-6), 1-5-♭7-4', refRoot: 'F', frets: '1313xx', fingers: '1213xx', movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Drop 3 (strings 2-6, one string skipped), ♭7-5-1-4', refRoot: 'Ab', frets: '2x112x', fingers: '2x113x', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 1-5, one string skipped), ♭7-5-1-4', refRoot: 'Db', frets: 'x2x122', fingers: 'x2x134', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 1-4), 4-♭7-1-5', refRoot: 'C', frets: 'xx3313', fingers: 'xx2314', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 2-5), 4-♭7-1-5', refRoot: 'Ab', frets: 'x4414x', fingers: 'x2314x', movable: true },
  { type: 'sus7', label: 'Drop 2 (strings 3-6), 4-♭7-1-5', refRoot: 'Eb', frets: '4413xx', fingers: '3412xx', movable: true },
  { type: 'sus7', label: 'Drop 3 (strings 2-6, one string skipped), 1-♭7-4-5', refRoot: 'F', frets: '1x131x', fingers: '1x121x', movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Drop 3 (strings 1-5, one string skipped), 1-♭7-4-5', refRoot: 'Bb', frets: 'x1x141', fingers: 'x1x121', movable: true, inversionHint: 'root' },

  // --- dom7: shell voicings ---
  { type: 'dom7', label: 'Shell R-3-♭7 (strings 4-5-6)', refRoot: 'F#', frets: '212xxx', fingers: '213xxx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Shell R-3-♭7 (strings 3-4-5)', refRoot: 'B', frets: 'x212xx', fingers: 'x213xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Shell R-♭7-3 (strings 3-4-6)', refRoot: 'F', frets: '1x12xx', fingers: '1x12xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7', label: 'Shell R-♭7-3 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x13x', fingers: 'x1x12x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // --- maj7: shell voicings ---
  { type: 'maj7', label: 'Shell R-3-7 (strings 4-5-6)', refRoot: 'F#', frets: '213xxx', fingers: '213xxx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'Shell R-3-7 (strings 3-4-5)', refRoot: 'B', frets: 'x213xx', fingers: 'x213xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'Shell R-7-3 (strings 3-4-6)', refRoot: 'F', frets: '1x22xx', fingers: '1x23xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7', label: 'Shell R-7-3 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x23x', fingers: 'x1x23x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // --- min7: shell voicings ---
  { type: 'min7', label: 'Shell R-♭3-♭7 (strings 4-5-6)', refRoot: 'G', frets: '313xxx', fingers: '213xxx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'Shell R-♭3-♭7 (strings 3-4-5)', refRoot: 'C', frets: 'x313xx', fingers: 'x213xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'Shell R-♭7-♭3 (strings 3-4-6)', refRoot: 'F', frets: '1x11xx', fingers: '1x11xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min7', label: 'Shell R-♭7-♭3 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x12x', fingers: 'x1x12x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // --- m7b5: shell voicings ---
  { type: 'm7b5', label: 'Shell R-♭3-♭7 (strings 4-5-6)', refRoot: 'G', frets: '313xxx', fingers: '213xxx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'Shell R-♭3-♭7 (strings 3-4-5)', refRoot: 'C', frets: 'x313xx', fingers: 'x213xx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'Shell R-♭7-♭3 (strings 3-4-6)', refRoot: 'F', frets: '1x11xx', fingers: '1x11xx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'm7b5', label: 'Shell R-♭7-♭3 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x12x', fingers: 'x1x12x', omitted: ['♭5'], movable: true, inversionHint: 'root' },

  // --- dim7: shell voicings ---
  { type: 'dim7', label: 'Shell R-♭3-𝄫7 (strings 4-5-6)', refRoot: 'G', frets: '312xxx', fingers: '312xxx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'dim7', label: 'Shell R-♭3-𝄫7 (strings 3-4-5)', refRoot: 'C', frets: 'x312xx', fingers: 'x312xx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'dim7', label: 'Shell R-𝄫7-♭3 (strings 3-4-6)', refRoot: 'F#', frets: '2x12xx', fingers: '2x13xx', omitted: ['♭5'], movable: true, inversionHint: 'root' },
  { type: 'dim7', label: 'Shell R-𝄫7-♭3 (strings 2-3-5)', refRoot: 'B', frets: 'x2x13x', fingers: 'x2x13x', omitted: ['♭5'], movable: true, inversionHint: 'root' },

  // --- minMaj7: shell voicings ---
  { type: 'minMaj7', label: 'Shell R-♭3-7 (strings 4-5-6)', refRoot: 'G', frets: '314xxx', fingers: '213xxx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Shell R-♭3-7 (strings 3-4-5)', refRoot: 'C', frets: 'x314xx', fingers: 'x213xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Shell R-7-♭3 (strings 3-4-6)', refRoot: 'F', frets: '1x21xx', fingers: '1x21xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'minMaj7', label: 'Shell R-7-♭3 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x22x', fingers: 'x1x23x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // --- sus7: shell voicings ---
  { type: 'sus7', label: 'Shell R-4-♭7 (strings 4-5-6)', refRoot: 'F', frets: '111xxx', fingers: '111xxx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Shell R-4-♭7 (strings 3-4-5)', refRoot: 'Bb', frets: 'x111xx', fingers: 'x111xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Shell R-♭7-4 (strings 3-4-6)', refRoot: 'F', frets: '1x13xx', fingers: '1x12xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'sus7', label: 'Shell R-♭7-4 (strings 2-3-5)', refRoot: 'Bb', frets: 'x1x14x', fingers: 'x1x12x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // ======================================================================
  // EXTENDED CHORDS
  // ======================================================================

  // --- Dominant 9th ---
  { type: 'dom9', label: 'C9 (A-shape, root 5th string)', refRoot: 'C', frets: 'x32333', fingers: 'x21333', movable: true, inversionHint: 'root' },
  { type: 'dom9', label: 'E9 open', refRoot: 'E', frets: '020102', fingers: '020103', movable: false, inversionHint: 'root' },
  { type: 'dom9', label: 'G9 open', refRoot: 'G', frets: '3x3201', fingers: '3x4201', omitted: ['5'], movable: false, inversionHint: 'root' },
  { type: 'dom9', label: 'E-shape 9 (root 6th string)', refRoot: 'F', frets: '131213', fingers: '131214', movable: true, inversionHint: 'root' },
  { type: 'dom9', label: 'Rootless 9 (strings 4-1)', refRoot: 'C', frets: 'xx2333', fingers: 'xx1234', omitted: ['1'], movable: true, inversionHint: 'first' },

  // --- Major 9th ---
  { type: 'maj9', label: 'Cmaj9 (strings 5-2)', refRoot: 'C', frets: 'x3243x', fingers: 'x2143x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj9', label: 'Cmaj9 open', refRoot: 'C', frets: 'x32430', fingers: 'x21430', omitted: ['5'], movable: false, inversionHint: 'root' },
  { type: 'maj9', label: 'Emaj9 open', refRoot: 'E', frets: '021102', fingers: '031204', movable: false, inversionHint: 'root' },
  { type: 'maj9', label: 'Rootless maj9 (strings 4-1)', refRoot: 'C', frets: 'xx2433', fingers: 'xx1423', omitted: ['1'], movable: true, inversionHint: 'first' },

  // --- Minor 9th ---
  { type: 'min9', label: 'Cm9 (strings 5-2)', refRoot: 'C', frets: 'x3133x', fingers: 'x2134x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min9', label: 'Am9 (root 6th string)', refRoot: 'A', frets: '575557', fingers: '121113', movable: true, inversionHint: 'root' },
  { type: 'min9', label: 'Em9 open', refRoot: 'E', frets: '020002', fingers: '010002', movable: false, inversionHint: 'root' },
  { type: 'min9', label: 'Bm9 open', refRoot: 'B', frets: 'x20222', fingers: 'x10234', movable: false, inversionHint: 'root' },

  // --- Dominant 7♭9 ---
  { type: 'dom7b9', label: 'C7♭9 (strings 5-2)', refRoot: 'C', frets: 'x3232x', fingers: 'x2131x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7b9', label: 'C7♭9 (full, strings 5-1)', refRoot: 'C', frets: 'x32323', fingers: 'x21314', movable: true, inversionHint: 'root' },
  { type: 'dom7b9', label: 'E7♭9 open', refRoot: 'E', frets: '020101', fingers: '030102', movable: false, inversionHint: 'root' },
  { type: 'dom7b9', label: 'Rootless 7♭9 (strings 4-1)', refRoot: 'C', frets: 'xx2323', fingers: 'xx1213', omitted: ['1'], movable: true, inversionHint: 'first' },

  // --- Dominant 7♯9 ---
  { type: 'dom7s9', label: 'Hendrix 7♯9 (strings 5-2)', refRoot: 'E', frets: 'x7678x', fingers: 'x2134x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7s9', label: 'E7♯9 open', refRoot: 'E', frets: '022133', fingers: '022134', movable: false, inversionHint: 'root' },

  // --- Dominant 11th and minor 11th ---
  { type: 'dom11', label: 'E11 open', refRoot: 'E', frets: '000100', fingers: '000100', omitted: ['9'], movable: false, inversionHint: 'root' },
  { type: 'min11', label: 'Em11 open', refRoot: 'E', frets: '000000', fingers: '000000', omitted: ['9'], movable: false, inversionHint: 'root' },
  { type: 'min11', label: 'Am11 (root 6th string)', refRoot: 'A', frets: '5x5533', fingers: '2x3411', omitted: ['5', '9'], movable: true, inversionHint: 'root' },

  // --- Dominant 13th ---
  { type: 'dom13', label: 'G13 (strings 6-4-3-2)', refRoot: 'G', frets: '3x345x', fingers: '1x123x', omitted: ['5', '9'], movable: true, inversionHint: 'root' },
  { type: 'dom13', label: 'G13 (strings 6-4-3-2-1)', refRoot: 'G', frets: '3x3455', fingers: '1x1234', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom13', label: 'C13 (strings 5-1)', refRoot: 'C', frets: 'x32335', fingers: 'x21334', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom13', label: 'E13 open', refRoot: 'E', frets: '020120', fingers: '020130', omitted: ['9'], movable: false, inversionHint: 'root' },
  { type: 'dom13', label: 'A13 open', refRoot: 'A', frets: 'x02022', fingers: 'x01023', omitted: ['9'], movable: false, inversionHint: 'root' },

  // --- Major 7♯11 ---
  { type: 'maj7s11', label: 'Cmaj7♯11 (strings 5-4-3-1)', refRoot: 'C', frets: 'x324x2', fingers: 'x213x1', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7s11', label: 'Gmaj7♯11 (strings 6-4-3-2)', refRoot: 'G', frets: '3x442x', fingers: '2x341x', omitted: ['5'], movable: true, inversionHint: 'root' },

  // --- dom9: generated grips ---
  { type: 'dom9', label: 'Shell + extension (strings 2-3-4-5), 1-3-♭7-9', refRoot: 'B', frets: 'x2122x', fingers: 'x2134x', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom9', label: 'Shell + extension (strings 3-4-5-6), 1-3-♭7-9', refRoot: 'F#', frets: '2121xx', fingers: '2131xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom9', label: 'Shell + extension (strings 1-2-3-4), 1-3-♭7-9', refRoot: 'E', frets: 'xx2132', fingers: 'xx2143', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom9', label: 'Rootless drop 2 (strings 1-2-3-4), ♭7-3-5-9', refRoot: 'F', frets: 'xx1213', fingers: 'xx1213', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'dom9', label: 'Rootless drop 2 (strings 2-3-4-5), ♭7-3-5-9', refRoot: 'Db', frets: 'x2314x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'dom9', label: 'Rootless drop 2 (strings 1-2-3-4), 9-5-♭7-3', refRoot: 'D', frets: 'xx2212', fingers: 'xx2314', omitted: ['1'], movable: true },
  { type: 'dom9', label: 'Rootless drop 2 (strings 2-3-4-5), 9-5-♭7-3', refRoot: 'Bb', frets: 'x3313x', fingers: 'x2314x', omitted: ['1'], movable: true },
  { type: 'dom9', label: 'Rootless drop 2 (strings 2-3-4-5), 3-♭7-9-5', refRoot: 'F#', frets: 'x1212x', fingers: 'x1213x', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'dom9', label: 'Rootless drop 2 (strings 1-2-3-4), 5-9-3-♭7', refRoot: 'Ab', frets: 'xx1312', fingers: 'xx1312', omitted: ['1'], movable: true, inversionHint: 'second' },
  { type: 'dom9', label: 'Rootless drop 2 (strings 2-3-4-5), 5-9-3-♭7', refRoot: 'E', frets: 'x2413x', fingers: 'x2413x', omitted: ['1'], movable: true, inversionHint: 'second' },

  // --- maj9: generated grips ---
  { type: 'maj9', label: 'Shell + extension (strings 3-4-5-6), 1-3-7-9', refRoot: 'F#', frets: '2131xx', fingers: '2131xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj9', label: 'Shell + extension (strings 1-2-3-4), 1-3-7-9', refRoot: 'E', frets: 'xx2142', fingers: 'xx2143', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj9', label: 'Rootless drop 2 (strings 1-2-3-4), 7-3-5-9', refRoot: 'F', frets: 'xx2213', fingers: 'xx2314', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'maj9', label: 'Rootless drop 2 (strings 2-3-4-5), 7-3-5-9', refRoot: 'Db', frets: 'x3314x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'maj9', label: 'Rootless drop 2 (strings 1-2-3-4), 9-5-7-3', refRoot: 'Db', frets: 'xx1111', fingers: 'xx1111', omitted: ['1'], movable: true },
  { type: 'maj9', label: 'Rootless drop 2 (strings 2-3-4-5), 9-5-7-3', refRoot: 'A', frets: 'x2212x', fingers: 'x2314x', omitted: ['1'], movable: true },
  { type: 'maj9', label: 'Rootless drop 2 (strings 2-3-4-5), 3-7-9-5', refRoot: 'F#', frets: 'x1312x', fingers: 'x1312x', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'maj9', label: 'Rootless drop 2 (strings 1-2-3-4), 5-9-3-7', refRoot: 'Ab', frets: 'xx1313', fingers: 'xx1213', omitted: ['1'], movable: true, inversionHint: 'second' },
  { type: 'maj9', label: 'Rootless drop 2 (strings 2-3-4-5), 5-9-3-7', refRoot: 'E', frets: 'x2414x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'second' },

  // --- min9: generated grips ---
  { type: 'min9', label: 'Shell + extension (strings 3-4-5-6), 1-♭3-♭7-9', refRoot: 'G', frets: '3132xx', fingers: '3142xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min9', label: 'Shell + extension (strings 1-2-3-4), 1-♭3-♭7-9', refRoot: 'F', frets: 'xx3143', fingers: 'xx2143', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'min9', label: 'Rootless drop 2 (strings 1-2-3-4), ♭7-♭3-5-9', refRoot: 'F', frets: 'xx1113', fingers: 'xx1112', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'min9', label: 'Rootless drop 2 (strings 2-3-4-5), ♭7-♭3-5-9', refRoot: 'Db', frets: 'x2214x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'min9', label: 'Rootless drop 2 (strings 1-2-3-4), 9-5-♭7-♭3', refRoot: 'D', frets: 'xx2211', fingers: 'xx2311', omitted: ['1'], movable: true },
  { type: 'min9', label: 'Rootless drop 2 (strings 2-3-4-5), 9-5-♭7-♭3', refRoot: 'Bb', frets: 'x3312x', fingers: 'x3412x', omitted: ['1'], movable: true },
  { type: 'min9', label: 'Rootless drop 2 (strings 1-2-3-4), ♭3-♭7-9-5', refRoot: 'C', frets: 'xx1333', fingers: 'xx1234', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'min9', label: 'Rootless drop 2 (strings 2-3-4-5), ♭3-♭7-9-5', refRoot: 'G', frets: 'x1323x', fingers: 'x1324x', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'min9', label: 'Rootless drop 2 (strings 1-2-3-4), 5-9-♭3-♭7', refRoot: 'A', frets: 'xx2413', fingers: 'xx2413', omitted: ['1'], movable: true, inversionHint: 'second' },
  { type: 'min9', label: 'Rootless drop 2 (strings 2-3-4-5), 5-9-♭3-♭7', refRoot: 'F', frets: 'x3514x', fingers: 'x2413x', omitted: ['1'], movable: true, inversionHint: 'second' },

  // --- dom7b9: generated grips ---
  { type: 'dom7b9', label: 'Shell + extension (strings 3-4-5-6), 1-3-♭7-♭9', refRoot: 'G', frets: '3231xx', fingers: '3241xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7b9', label: 'Shell + extension (strings 1-2-3-4), 1-3-♭7-♭9', refRoot: 'E', frets: 'xx2131', fingers: 'xx2131', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7b9', label: 'Rootless drop 2 (strings 2-3-4-5), ♭7-3-5-♭9', refRoot: 'Db', frets: 'x2313x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'third' },

  // --- dom7s9: generated grips ---
  { type: 'dom7s9', label: 'Shell + extension (strings 3-4-5-6), 1-3-♭7-♯9', refRoot: 'F#', frets: '2122xx', fingers: '2134xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7s9', label: 'Shell + extension (strings 1-2-3-4), 1-3-♭7-♯9', refRoot: 'E', frets: 'xx2133', fingers: 'xx2134', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 1-2-3-4), ♭7-3-5-♯9', refRoot: 'F', frets: 'xx1214', fingers: 'xx1213', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 2-3-4-5), ♭7-3-5-♯9', refRoot: 'Db', frets: 'x2315x', fingers: 'x2314x', omitted: ['1'], movable: true, inversionHint: 'third' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 1-2-3-4), ♯9-5-♭7-3', refRoot: 'D', frets: 'xx3212', fingers: 'xx4213', omitted: ['1'], movable: true },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 2-3-4-5), ♯9-5-♭7-3', refRoot: 'Bb', frets: 'x4313x', fingers: 'x4213x', omitted: ['1'], movable: true },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 1-2-3-4), 3-♭7-♯9-5', refRoot: 'B', frets: 'xx1232', fingers: 'xx1243', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 2-3-4-5), 3-♭7-♯9-5', refRoot: 'F#', frets: 'x1222x', fingers: 'x1234x', omitted: ['1'], movable: true, inversionHint: 'first' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 1-2-3-4), 5-♯9-3-♭7', refRoot: 'Ab', frets: 'xx1412', fingers: 'xx1312', omitted: ['1'], movable: true, inversionHint: 'second' },
  { type: 'dom7s9', label: 'Rootless drop 2 (strings 2-3-4-5), 5-♯9-3-♭7', refRoot: 'E', frets: 'x2513x', fingers: 'x2413x', omitted: ['1'], movable: true, inversionHint: 'second' },

  // --- dom13: generated grips ---
  { type: 'dom13', label: 'Shell + extension (strings 1-2-3-5), 1-♭7-3-13', refRoot: 'Bb', frets: 'x1x133', fingers: 'x1x123', omitted: ['5', '9'], movable: true, inversionHint: 'root' },
  { type: 'dom13', label: 'Rootless drop 2 (strings 1-2-3-4), ♭7-3-5-13', refRoot: 'Ab', frets: 'xx4541', fingers: 'xx2431', omitted: ['1', '9'], movable: true, inversionHint: 'third' },
  { type: 'dom13', label: 'Rootless drop 2 (strings 2-3-4-5), ♭7-3-5-13', refRoot: 'Eb', frets: 'x4531x', fingers: 'x3421x', omitted: ['1', '9'], movable: true, inversionHint: 'third' },
  { type: 'dom13', label: 'Rootless drop 2 (strings 1-2-3-4), 5-13-3-♭7', refRoot: 'B', frets: 'xx4145', fingers: 'xx2134', omitted: ['1', '9'], movable: true, inversionHint: 'second' },
  { type: 'dom13', label: 'Rootless drop 2 (strings 2-3-4-5), 5-13-3-♭7', refRoot: 'F#', frets: 'x4135x', fingers: 'x3124x', omitted: ['1', '9'], movable: true, inversionHint: 'second' },

  // --- maj7s11: generated grips ---
  { type: 'maj7s11', label: 'Shell + extension (strings 3-4-5-6), 1-3-7-♯11', refRoot: 'F#', frets: '2135xx', fingers: '2134xx', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7s11', label: 'Shell + extension (strings 1-2-3-5), 1-7-3-♯11', refRoot: 'B', frets: 'x2x341', fingers: 'x2x341', omitted: ['5'], movable: true, inversionHint: 'root' },
  { type: 'maj7s11', label: 'Rootless drop 2 (strings 1-2-3-4), ♯11-5-7-3', refRoot: 'Db', frets: 'xx5111', fingers: 'xx2111', omitted: ['1'], movable: true },
  { type: 'maj7s11', label: 'Rootless drop 2 (strings 2-3-4-5), 3-7-♯11-5', refRoot: 'F#', frets: 'x1352x', fingers: 'x1342x', omitted: ['1'], movable: true, inversionHint: 'first' },

  // --- min11: generated grips ---
  { type: 'min11', label: 'Shell + extension (strings 3-4-5-6), 1-♭3-♭7-11', refRoot: 'G', frets: '3135xx', fingers: '2134xx', omitted: ['5', '9'], movable: true, inversionHint: 'root' },
  { type: 'min11', label: 'Shell + extension (strings 2-3-4-6), 1-♭7-♭3-11', refRoot: 'G', frets: '3x331x', fingers: '2x341x', omitted: ['5', '9'], movable: true, inversionHint: 'root' },
  { type: 'min11', label: 'Shell + extension (strings 1-2-3-5), 1-♭7-♭3-11', refRoot: 'C', frets: 'x3x341', fingers: 'x2x341', omitted: ['5', '9'], movable: true, inversionHint: 'root' },
  { type: 'min11', label: 'Rootless drop 2 (strings 1-2-3-4), 11-5-♭7-♭3', refRoot: 'D', frets: 'xx5211', fingers: 'xx3211', omitted: ['1', '9'], movable: true },
  { type: 'min11', label: 'Rootless drop 2 (strings 2-3-4-5), ♭3-♭7-11-5', refRoot: 'G', frets: 'x1353x', fingers: 'x1243x', omitted: ['1', '9'], movable: true, inversionHint: 'first' },
]
