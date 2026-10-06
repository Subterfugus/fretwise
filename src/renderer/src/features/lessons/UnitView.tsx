import type { Unit } from '@/content/types'
import { PASS_MARK } from '@/content/types'
import type { Route } from '@/App'
import { isUnlocked, prerequisites } from '@/state/unlock'
import { updateProgress, useProgress } from '@/state/progress'
import { BookmarkButton } from './BookmarkButton'
import { STAGES, unitLabel } from '@/content/curriculum'
import { Check, ChevronRight, CircleHelp, LockKeyhole } from 'lucide-react'
import './learningPolish.css'

export function UnitView({ unit, go }: { unit: Unit; go: (r: Route) => void }) {
  const progress = useProgress()
  const unlocked = isUnlocked(unit)
  const quiz = progress.quizzes[unit.id]
  const done = unit.lessons.filter((l) => progress.lessonsDone[l.id]).length
  const stage = STAGES.findIndex((s) => s.id === unit.stage)

  return (
    <div className="page unit-page">
      <div className="eyebrow">{unitLabel(unit)}{stage >= 0 && ` · Stage ${stage + 1}: ${STAGES[stage].title}`}{unit.elective && ' · optional'}</div>
      <h1>{unit.title}</h1>
      <p className="lead">{unit.summary}</p>

      {!unlocked && (
        <div className="card locked-card">
          <strong><LockKeyhole size={16} aria-hidden /> This unit is locked.</strong> Pass the{' '}
          {prerequisites(unit)
            .map((p) => `${unitLabel(p)} (${p.title})`)
            .join(' and ')}{' '}
          quiz{prerequisites(unit).length > 1 ? 'zes' : ''} to unlock it, or unlock every unit now.
          <div className="row">
            <button className="btn" onClick={() => updateProgress((p) => void (p.settings.unlockAll = true))}>
              Unlock all units
            </button>
          </div>
        </div>
      )}

      {unit.lessons.length === 0 ? (
        <div className="card muted">Lessons for this unit are on their way.</div>
      ) : (
        <ol className={'lesson-list' + (unlocked ? '' : ' dim')}>
          {unit.lessons.map((l, i) => (
            <li key={l.id}>
              <div className="lesson-entry">
              <button className="lesson-item" disabled={!unlocked} onClick={() => go({ page: 'lesson', lessonId: l.id })}>
                <span className={'lesson-num' + (progress.lessonsDone[l.id] ? ' done' : '')}>{progress.lessonsDone[l.id] ? <Check size={17} aria-label="Completed" /> : i + 1}</span>
                <span className="lesson-text">
                  <span className="lesson-title">{l.title}</span>
                  {l.summary && <span className="lesson-sum">{l.summary}</span>}
                </span>
                <ChevronRight className="chev" size={18} aria-hidden />
              </button>
              <BookmarkButton lesson={l} />
              </div>
            </li>
          ))}
          <li>
            <button className="lesson-item quiz-item" disabled={!unlocked || unit.quiz.fixed.length === 0} onClick={() => go({ page: 'quiz', unitId: unit.id })}>
              <span className={'lesson-num quiz' + (quiz?.passed ? ' done' : '')}>{quiz?.passed ? <Check size={17} aria-label="Passed" /> : <CircleHelp size={17} aria-hidden />}</span>
              <span className="lesson-text">
                <span className="lesson-title">Unit quiz</span>
                <span className="lesson-sum">
                  {quiz
                    ? `Best ${Math.round(quiz.best * 100)}% · ${quiz.attempts} attempt${quiz.attempts > 1 ? 's' : ''}${quiz.passed ? ' · Passed' : ''}`
                    : `Pass with ${Math.round(PASS_MARK * 100)}% to unlock the next unit.`}
                  {done < unit.lessons.length && !quiz ? ` Tip: finish the lessons first (${done}/${unit.lessons.length}).` : ''}
                </span>
              </span>
              <ChevronRight className="chev" size={18} aria-hidden />
            </button>
          </li>
        </ol>
      )}
    </div>
  )
}
