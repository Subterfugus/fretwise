// Browse categories for the dictionary (pure so tests can check nothing is missing).
import { CHORDS, ChordType } from '@/theory/chords'
import { SCALES, ScaleType } from '@/theory/scales'

export const CHORD_CATEGORIES: { name: string; types: ChordType[] }[] = [
  { name: 'Triads', types: ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', 'power'] },
  { name: 'Sixths & added tones', types: ['maj6', 'min6', 'add9'] },
  { name: 'Seventh chords', types: ['dom7', 'maj7', 'min7', 'm7b5', 'dim7', 'minMaj7', 'aug7', 'augMaj7', 'sus7'] },
  { name: 'Extended (9, 11, 13)', types: ['dom9', 'maj9', 'min9', 'dom11', 'min11', 'dom13', 'maj7s11'] },
  { name: 'Altered dominants', types: ['dom7b9', 'dom7s9'] }
]

export const SCALE_CATEGORIES: { name: string; types: ScaleType[] }[] = [
  { name: 'The seven modes', types: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'] },
  { name: 'Major & minor scales', types: ['major', 'naturalMinor', 'harmonicMinor', 'melodicMinor'] },
  { name: 'Pentatonic & blues', types: ['majorPentatonic', 'minorPentatonic', 'blues', 'majorBlues'] },
  { name: 'Symmetric & exotic', types: ['wholeTone', 'diminishedHW', 'diminishedWH', 'lydianDominant', 'altered', 'phrygianDominant', 'chromatic'] }
]

export const ALL_CHORD_TYPES = Object.keys(CHORDS) as ChordType[]
export const ALL_SCALE_TYPES = Object.keys(SCALES) as ScaleType[]
