// Lesson-link tokens in lesson markdown: [[u4l6]], [[u4l6|custom text]], [[preview:u10l1]].
// They render as the target lesson's title plus its *current* unit number, so reordering the
// curriculum never leaves stale "see Unit 7" text. Plain links must point backwards along the
// path (tested); `preview:` marks a deliberate look ahead.
import { createContext, useContext } from 'react'
import { findLesson } from '@/content/units'
import { unitLabel } from '@/content/curriculum'
import { pretty } from '@/theory/notes'

export const LESSON_TOKEN = /\[\[(preview:)?([a-z0-9]+l\d+)(?:\|([^\]]+))?\]\]/g

export interface LessonToken {
  id: string
  preview: boolean
  text?: string
}

export function lessonTokens(md: string): LessonToken[] {
  return [...md.matchAll(LESSON_TOKEN)].map((m) => ({ id: m[2], preview: !!m[1], ...(m[3] ? { text: m[3] } : {}) }))
}

function label(t: LessonToken): string {
  const found = findLesson(t.id)
  if (!found) return t.text ?? t.id
  return `${t.text ?? found.lesson.title} (${unitLabel(found.unit)})`
}

/** Replace tokens with their plain label (search index, snippets, anything that isn't rendered). */
export const resolveLessonTokens = (md: string) => md.replace(LESSON_TOKEN, (...m) => label({ id: m[2], preview: !!m[1], text: m[3] }))

/** Provided by the lesson page so links can navigate; without it links render as plain text. */
export const LessonNavContext = createContext<((lessonId: string) => void) | null>(null)

export function LessonLink({ token }: { token: LessonToken }) {
  const open = useContext(LessonNavContext)
  const text = pretty(label(token))
  if (!open || !findLesson(token.id)) return <span className="lesson-ref">{text}</span>
  return (
    <button type="button" className={'link lesson-ref' + (token.preview ? ' preview' : '')} onClick={() => open(token.id)} title={token.preview ? 'Coming up later in the course' : 'Go back to this lesson'}>
      {text}
    </button>
  )
}
