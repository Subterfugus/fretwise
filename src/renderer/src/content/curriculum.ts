// The curriculum path: the single source of teaching order.
//
// The unit files in ./units are lesson *banks*. This file decides which lessons form each unit,
// the order of units, their stages, and which unit each quiz question belongs to. Lesson ids never
// change, so saved progress and bookmarks stay valid however the path is rearranged.
//
// - A path unit whose id matches a bank unit keeps that bank's title, summary, quiz count and
//   untagged quiz questions (its "home" questions).
// - A question or generator tagged with `lesson` goes to whichever path unit holds that lesson.
// - A bank unit that is not in the path (its lessons were spread over other units) must tag every
//   question, so nothing is silently lost.
import type { Lesson, QuestionGenerator, QuizQuestion, Unit } from './types'

export interface Stage {
  id: string
  title: string
  summary: string
}

export const STAGES: Stage[] = [
  { id: 'first-steps', title: 'First steps', summary: 'Notes, rhythm, first chords and the blues: play from day one.' },
  { id: 'building-blocks', title: 'How music is built', summary: 'Intervals, the major scale, triads and the pentatonic across the neck.' },
  { id: 'harmony', title: 'Harmony', summary: 'Barre chords, chords in a key and seventh chords.' },
  { id: 'colour', title: 'Colour', summary: 'Modes, minor keys and changing key.' },
  { id: 'mastery', title: 'Mastery', summary: 'Jazz and advanced harmony.' }
]

export interface PathUnit {
  /** Unit id. Reusing a bank unit's id keeps its saved quiz results and its untagged questions. */
  id: string
  stage: string
  /** Lesson ids in teaching order. */
  lessons: string[]
  /** Default: the bank unit with the same id. Required for composed units. */
  title?: string
  summary?: string
  /** Questions per attempt. Default: the bank unit's count, else 10. */
  quizCount?: number
  elective?: boolean
  requires?: string[]
  legacyPass?: string[]
}

const range = (unit: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${unit}l${from + i}`)

export const PATH: PathUnit[] = [
  // ---- Stage 1: first steps ----
  { id: 'u1', stage: 'first-steps', lessons: range('u1', 1, 5) },
  {
    id: 'u2',
    stage: 'first-steps',
    title: 'Rhythm, reading and first chords',
    summary: 'Beats and note values, your first open chords, strumming patterns, and reading tab and notation.',
    // Strumming counts "&"s, which u2l4 teaches; first chords come just before strumming them.
    lessons: ['u2l1', 'u2l2', 'u2l3', 'u2l4', 'u2l7', 'u2l6', 'u2l5']
  },
  {
    id: 'blues1',
    stage: 'first-steps',
    title: 'Power chords and the blues',
    summary: 'Power chords, your first scale (the minor pentatonic), the blues scale, and putting them together over a 12-bar blues.',
    lessons: ['u3l6', 'u8l1', 'u8l4', 'u8l5'],
    legacyPass: ['u8']
  },
  // Uses power chords, E7 and the shuffle from the blues unit.
  { id: 'u14', stage: 'first-steps', lessons: range('u14', 1, 6), elective: true, requires: ['blues1'] },

  // ---- Stage 2: how music is built ----
  {
    id: 'u3',
    stage: 'building-blocks',
    summary: 'What intervals are, how to name them, their shapes across the strings, and how they sound.',
    lessons: range('u3', 1, 5)
  },
  { id: 'u4', stage: 'building-blocks', lessons: range('u4', 1, 6) },
  { id: 'u5', stage: 'building-blocks', lessons: range('u5', 1, 6) },
  {
    id: 'pent2',
    stage: 'building-blocks',
    title: 'Pentatonics across the neck',
    summary: 'All five pentatonic boxes, the major pentatonic and the relative relationship, and phrasing with target notes and bends.',
    lessons: ['u8l2', 'u8l3', 'u8l6'],
    legacyPass: ['u8']
  },
  // Both need triads: u15l4's sus chords, u16l6's triads on each degree.
  { id: 'u15', stage: 'building-blocks', lessons: range('u15', 1, 6), elective: true, requires: ['u5'] },
  { id: 'u16', stage: 'building-blocks', lessons: range('u16', 1, 6), elective: true, requires: ['u5'] },

  // ---- Stage 3: harmony ----
  { id: 'u6', stage: 'harmony', title: 'Barre chords and the five shapes', lessons: range('u6', 1, 6) },
  { id: 'u7', stage: 'harmony', lessons: range('u7', 1, 6) },
  { id: 'u9', stage: 'harmony', lessons: range('u9', 1, 6) },
  { id: 'u17', stage: 'harmony', lessons: range('u17', 1, 6), elective: true, requires: ['u7'] },
  { id: 'u13', stage: 'harmony', lessons: range('u13', 1, 6), elective: true, requires: ['u9'] },

  // ---- Stage 4: colour ----
  { id: 'u10', stage: 'colour', lessons: range('u10', 1, 6) },
  { id: 'u11', stage: 'colour', lessons: range('u11', 1, 6) },

  // ---- Stage 5: mastery ----
  { id: 'u12', stage: 'mastery', lessons: range('u12', 1, 6) }
]

/** Tag a fixed question with the lesson that teaches it. */
export const taught = <Q extends QuizQuestion>(lesson: string, q: Q): Q => ({ ...q, lesson })

/** Tag a generator with the lesson that teaches it (see QuestionGenerator.lesson). */
export function forLesson(lesson: string, gen: () => QuizQuestion): QuestionGenerator {
  const tagged: QuestionGenerator = () => gen()
  tagged.lesson = lesson
  return tagged
}

/** Build the ordered units from the lesson banks. Throws on any inconsistency, so tests catch it. */
export function buildCurriculum(banks: Unit[], path: PathUnit[] = PATH, stages: Stage[] = STAGES): Unit[] {
  const stageIds = new Set(stages.map((s) => s.id))
  const pathIds = new Set<string>()
  const lessons = new Map<string, Lesson>()
  for (const b of banks) for (const l of b.lessons) lessons.set(l.id, l)

  const home = new Map<string, string>() // lesson id -> path unit id
  for (const p of path) {
    if (pathIds.has(p.id)) throw new Error(`curriculum: duplicate unit ${p.id}`)
    pathIds.add(p.id)
    if (!stageIds.has(p.stage)) throw new Error(`curriculum: ${p.id} has unknown stage ${p.stage}`)
    for (const id of p.lessons) {
      if (!lessons.has(id)) throw new Error(`curriculum: ${p.id} lists unknown lesson ${id}`)
      if (home.has(id)) throw new Error(`curriculum: lesson ${id} is in both ${home.get(id)} and ${p.id}`)
      home.set(id, p.id)
    }
  }
  const unplaced = [...lessons.keys()].filter((id) => !home.has(id))
  if (unplaced.length) throw new Error(`curriculum: lessons not in the path: ${unplaced.join(', ')}`)

  const fixed = new Map<string, QuizQuestion[]>([...pathIds].map((id) => [id, []]))
  const gens = new Map<string, QuestionGenerator[]>([...pathIds].map((id) => [id, []]))
  const target = (bank: Unit, lesson: string | undefined, what: string) => {
    if (lesson !== undefined) {
      const t = home.get(lesson)
      if (!t) throw new Error(`curriculum: ${bank.id} ${what} is tagged with unknown lesson ${lesson}`)
      return t
    }
    if (!pathIds.has(bank.id)) throw new Error(`curriculum: ${bank.id} is not a path unit, so its ${what} needs a lesson tag`)
    return bank.id
  }
  for (const b of banks) {
    b.quiz.fixed.forEach((q, i) => fixed.get(target(b, q.lesson, `fixed question ${i}`))!.push(q))
    ;(b.quiz.generators ?? []).forEach((g, i) => gens.get(target(b, g.lesson, `generator ${i}`))!.push(g))
  }

  const coreCount = path.filter((p) => !p.elective).length
  let core = 0
  let elective = 0
  return path.map((p): Unit => {
    const base = banks.find((b) => b.id === p.id)
    const title = p.title ?? base?.title
    const summary = p.summary ?? base?.summary
    if (!title || summary === undefined) throw new Error(`curriculum: composed unit ${p.id} needs a title and summary`)
    return {
      id: p.id,
      number: p.elective ? coreCount + ++elective : ++core,
      title,
      summary,
      lessons: p.lessons.map((id) => lessons.get(id)!),
      quiz: { count: p.quizCount ?? base?.quiz.count ?? 10, fixed: fixed.get(p.id)!, generators: gens.get(p.id)! },
      ...(p.elective ? { elective: true, requires: p.requires } : {}),
      stage: p.stage,
      ...(p.legacyPass ? { legacyPass: p.legacyPass } : {})
    }
  })
}

/** "Unit 3" for core units, "Elective" for electives. */
export const unitLabel = (u: Pick<Unit, 'number' | 'elective'>) => (u.elective ? 'Elective' : `Unit ${u.number}`)
