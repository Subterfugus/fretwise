import type { Unit } from '../types'
import { buildCurriculum } from '../curriculum'
import u01 from './u01-notes'
import u02 from './u02-rhythm'
import u03 from './u03-intervals'
import u04 from './u04-major-scale'
import u05 from './u05-triads'
import u06 from './u06-caged'
import u07 from './u07-diatonic'
import u08 from './u08-pentatonic-blues'
import u09 from './u09-sevenths'
import u10 from './u10-modes'
import u11 from './u11-minor-modulation'
import u12 from './u12-jazz'

import u13 from './u13-arpeggios'
import u14 from './u14-rhythm-ii'
import u15 from './u15-tunings-capo'
import u16 from './u16-thirds-sixths'
import u17 from './u17-song-form'

/** Lesson banks: the unit files as written. Teaching order comes from content/curriculum.ts. */
export const BANKS: Unit[] = [u01, u02, u03, u04, u05, u06, u07, u08, u09, u10, u11, u12, u13, u14, u15, u16, u17]

/** Units in teaching order (core units and electives interleaved by stage), built from the banks. */
export const UNITS: Unit[] = buildCurriculum(BANKS)

export const findLesson = (id: string) => {
  for (const u of UNITS) {
    const l = u.lessons.find((x) => x.id === id)
    if (l) return { unit: u, lesson: l }
  }
  return null
}

/** Position of every lesson along the whole path (for "links only point backwards"). */
export const LESSON_ORDER: ReadonlyMap<string, number> = new Map(UNITS.flatMap((u) => u.lessons.map((l) => l.id)).map((id, i) => [id, i]))
