import { useMemo, useState } from 'react'
import type { QuizQuestion, Unit } from '@/content/types'
import { PASS_MARK } from '@/content/types'
import { buildQuiz } from '@/content/grading'
import { recordQuiz, useProgress } from '@/state/progress'
import { QuestionView } from './QuestionView'
import { Markdown } from '@/components/Markdown'
import { unitLabel } from '@/content/curriculum'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import '@/features/lessons/learningPolish.css'

export function QuizView({ unit, onExit }: { unit: Unit; onExit: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const questions = useMemo(() => buildQuiz(unit.quiz), [unit, attempt])
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [answered, setAnswered] = useState(false)
  const [started, setStarted] = useState(false)
  const record = useProgress().quizzes[unit.id]

  const restart = () => {
    setAttempt((a) => a + 1)
    setIdx(0)
    setResults([])
    setAnswered(false)
    setStarted(true)
  }

  if (!started)
    return (
      <div className="quiz-intro">
        <h2>{unitLabel(unit)} quiz: {unit.title}</h2>
        <p>
          {questions.length} questions. You need {Math.round(PASS_MARK * 100)}% to pass. Some questions are randomised each attempt, and some
          need sound, so turn your speakers on.
        </p>
        {record && (
          <p className="muted">
            Best: {Math.round(record.best * 100)}% · Attempts: {record.attempts} {record.passed && '· ✓ Passed'}
          </p>
        )}
        <div className="row">
          <button className="btn primary" onClick={() => setStarted(true)}>Start quiz</button>
          <button className="btn ghost" onClick={onExit}>Back to lessons</button>
        </div>
      </div>
    )

  if (idx >= questions.length) {
    const score = questions.length ? results.filter(Boolean).length / questions.length : 0
    const passed = score >= PASS_MARK
    return (
      <div className="quiz-result">
        <h2>{passed && <CheckCircle2 size={24} aria-hidden />}{passed ? 'Unit passed!' : 'Keep practising'}</h2>
        <div className={'score ' + (passed ? 'ok' : 'bad')}>{Math.round(score * 100)}%</div>
        <p>
          {results.filter(Boolean).length} of {questions.length} correct.{' '}
          {passed ? 'The next unit is unlocked.' : `You need ${Math.round(PASS_MARK * 100)}% to pass. Review the lessons and try again.`}
        </p>
        <Review questions={questions} results={results} />
        <div className="row">
          <button className="btn primary" onClick={restart}>Retake quiz</button>
          <button className="btn ghost" onClick={onExit}>Back to lessons</button>
        </div>
      </div>
    )
  }

  const q = questions[idx]
  const next = () => {
    setIdx(idx + 1)
    setAnswered(false)
  }

  return (
    <div className="quiz">
      <div className="quiz-head">
        <span>{unitLabel(unit)} quiz</span>
        <div className="quiz-bar">
          <div style={{ width: `${(idx / questions.length) * 100}%` }} />
        </div>
        <span>
          {idx + 1} / {questions.length}
        </span>
      </div>
      <div className="quiz-body">
        <QuestionView
          key={attempt + ':' + idx}
          question={q}
          autoPlay
          onAnswered={(ok) => {
            const all = [...results.slice(0, idx), ok]
            setResults(all)
            setAnswered(true)
            // Record as soon as the last question is answered, not on "Finish": leaving the
            // page without pressing it must not throw the attempt away.
            if (idx + 1 >= questions.length) recordQuiz(unit.id, all.filter(Boolean).length / questions.length, PASS_MARK)
          }}
        />
        <div className="row end">
          <button className="btn primary" aria-label={idx + 1 >= questions.length ? 'Finish' : 'Next →'} disabled={!answered} onClick={next}>
            {idx + 1 >= questions.length ? 'Finish' : <>Next <ArrowRight size={16} aria-hidden /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Review({ questions, results }: { questions: QuizQuestion[]; results: boolean[] }) {
  const missed = questions.map((q, i) => ({ q, ok: results[i] })).filter((x) => !x.ok)
  if (!missed.length) return null
  return (
    <details className="review">
      <summary>Review {missed.length} missed question{missed.length > 1 ? 's' : ''}</summary>
      {missed.map(({ q }, i) => (
        <div key={i} className="review-item">
          <Markdown md={q.prompt} />
          {q.explain && (
            <div className="muted">
              <Markdown md={q.explain} />
            </div>
          )}
        </div>
      ))}
    </details>
  )
}
