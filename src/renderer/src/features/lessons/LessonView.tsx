import { findLesson } from '@/content/units'
import type { Route } from '@/App'
import { BlockView } from './BlockView'
import { markLessonDone, useProgress } from '@/state/progress'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { BookmarkButton } from './BookmarkButton'
import { isUnlocked } from '@/state/unlock'
import { unitLabel } from '@/content/curriculum'
import type { Lesson } from '@/content/types'
import { LessonLink, LessonNavContext, lessonTokens } from './lessonLinks'
import './learningPolish.css'

/** Earlier lessons this one links back to (its plain [[...]] links), in first-mention order. */
export function buildsOn(lesson: Lesson): string[] {
  const ids = lesson.blocks.flatMap((b) => (b.type === 'text' || b.type === 'tip' ? lessonTokens(b.md) : [])).filter((t) => !t.preview && t.id !== lesson.id).map((t) => t.id)
  return [...new Set(ids)]
}

export function LessonView({ lessonId, from, go }: { lessonId: string; from?: 'library'; go: (r: Route) => void }) {
  const found = findLesson(lessonId)
  const progress = useProgress()
  if (!found) return <div className="page">Lesson not found.</div>
  const { unit, lesson } = found
  if (!isUnlocked(unit)) return <div className="page"><h1>Lesson locked</h1><button className="btn" onClick={() => go({ page: 'unit', unitId: unit.id })}>View {unitLabel(unit)}</button></div>
  const idx = unit.lessons.findIndex((l) => l.id === lessonId)
  const next = unit.lessons[idx + 1]
  const prev = unit.lessons[idx - 1]
  const done = !!progress.lessonsDone[lessonId]

  const finish = () => {
    markLessonDone(lessonId)
    go(next ? { page: 'lesson', lessonId: next.id, from } : { page: 'quiz', unitId: unit.id })
  }

  const earlier = buildsOn(lesson)

  return (
    <LessonNavContext.Provider value={(id) => go({ page: 'lesson', lessonId: id })}>
    <article className="page lesson">
      <div className="crumbs">
        {from === 'library' && <><button className="link" onClick={() => go({ page: 'library' })}>Back to lessons</button><span> / </span></>}
        <button className="link" onClick={() => go({ page: 'unit', unitId: unit.id })}>
          {unitLabel(unit)}: {unit.title}
        </button>
        <span> · Lesson {idx + 1} of {unit.lessons.length}</span>
      </div>
      <div className="lesson-heading"><h1>{lesson.title}</h1><BookmarkButton lesson={lesson} /></div>
      {lesson.summary && <p className="lead">{lesson.summary}</p>}
      {earlier.length > 0 && (
        <p className="builds-on muted small">
          Builds on:{' '}
          {earlier.map((id, i) => (
            <span key={id}>{i > 0 && ' · '}<LessonLink token={{ id, preview: false }} /></span>
          ))}
        </p>
      )}
      <div className="blocks">
        {lesson.blocks.map((b, i) => (
          <div key={lessonId + i} data-lesson-block={i}>
            <BlockView block={b} onOpenTool={(launch) => go({ page: 'tools', launch, lessonOrigin: { lessonId, from, blockIndex: i } })} />
          </div>
        ))}
      </div>
      {lessonId === 'u5l5' && <div className="row">
        <button className="btn" onClick={() => go({ page: 'tools', tab: 'triads' })}>Practise triad inversions <ArrowRight size={16} aria-hidden /></button>
      </div>}
      <div className="lesson-foot">
        {prev ? (
          <button className="btn ghost" aria-label={`← ${prev.title}`} onClick={() => go({ page: 'lesson', lessonId: prev.id, from })}>
            <ArrowLeft size={16} aria-hidden /> {prev.title}
          </button>
        ) : (
          <span />
        )}
        <button className="btn primary" aria-label={`${done ? '' : '✓ Mark complete · '}${next ? `Next: ${next.title} →` : 'Take the unit quiz →'}`} onClick={finish}>
          {!done && <><Check size={16} aria-hidden /> Mark complete · </>}
          {next ? `Next: ${next.title}` : 'Take the unit quiz'} <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </article>
    </LessonNavContext.Provider>
  )
}
