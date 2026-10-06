import { useEffect, useState } from 'react'
import type { QuizQuestion } from '@/content/types'
import { grade, correctAnswerText, type Answer } from '@/content/grading'
import { Markdown } from '@/components/Markdown'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import { BlockView } from '@/features/lessons/BlockView'
import { runPlay } from '@/audio/play'
import { FretPos, posKey, samePos } from '@/theory/guitar'
import { pretty } from '@/theory/notes'
import '@/features/lessons/learningPolish.css'

interface Props {
  question: QuizQuestion
  /** Practice mode (inside lessons): allows retry after a wrong answer */
  practice?: boolean
  onAnswered?: (correct: boolean) => void
  /** Auto-play the sound when the question appears */
  autoPlay?: boolean
}

export function QuestionView({ question: q, practice, onAnswered, autoPlay }: Props) {
  const [choice, setChoice] = useState<number | null>(null)
  const [picks, setPicks] = useState<FretPos[]>([])
  const [text, setText] = useState('')
  const [result, setResult] = useState<boolean | null>(null)

  useEffect(() => {
    setChoice(null)
    setPicks([])
    setText('')
    setResult(null)
    if (autoPlay && q.play) runPlay(q.play).catch(() => undefined)
  }, [q])

  const answer = (): Answer | null => {
    switch (q.kind) {
      case 'mc':
        return choice === null ? null : { kind: 'mc', choice }
      case 'fretboard':
        return picks.length ? { kind: 'fretboard', picks } : null
      case 'spell':
      case 'text':
        return text.trim() ? { kind: q.kind, text } : null
    }
  }

  const check = (a = answer()) => {
    if (!a || (result !== null && !practice)) return
    const ok = grade(q, a)
    setResult(ok)
    onAnswered?.(ok)
  }

  const locked = result !== null && (!practice || result)

  const pick = (p: FretPos) => {
    if (locked) return
    if (result === false) setResult(null)
    if ((q.kind === 'fretboard' && (q.mode ?? 'any') === 'any')) {
      setPicks([p])
      check({ kind: 'fretboard', picks: [p] })
      return
    }
    setPicks((cur) => (cur.some((c) => samePos(c, p)) ? cur.filter((c) => !samePos(c, p)) : [...cur, p]))
  }

  return (
    <div className={'question' + (result === true ? ' correct' : result === false ? ' wrong' : '')}>
      <div className="q-prompt">
        <Markdown md={q.prompt} />
      </div>
      {q.play && (
        <div className="q-play">
          <PlayButton play={q.play} label="Listen" />
        </div>
      )}
      {q.visual && <BlockView block={q.visual} />}

      {q.kind === 'mc' && (
        <div className="q-choices">
          {q.choices.map((c, i) => {
            const state =
              result === null ? (choice === i ? 'chosen' : '') : i === q.answer && locked ? 'right' : choice === i ? (result ? 'right' : 'wrong') : ''
            return (
              <button
                key={i}
                className={'q-choice ' + state}
                disabled={locked}
                onClick={() => {
                  setChoice(i)
                  if (result === false) setResult(null)
                  check({ kind: 'mc', choice: i })
                }}
              >
                {pretty(c)}
              </button>
            )
          })}
        </div>
      )}

      {q.kind === 'fretboard' && (
        <div className="fb-wrap">
          <Fretboard
            frets={q.frets}
            tuning={q.tuning}
            capo={q.capo}
            showTuning={q.showTuning}
            marks={[
              ...(q.marks ?? []),
              ...(locked ? q.targets.filter((t) => !picks.some((p) => samePos(p, t))).map((t) => ({ ...t, color: 'ghost' as const })) : []),
              ...picks.map((p) => ({
                ...p,
                color: (result === null ? 'accent' : q.targets.some((t) => posKey(t) === posKey(p)) ? 'root' : 'muted') as 'accent'
              }))
            ]}
            onPick={pick}
            selected={picks}
          />
          {q.mode === 'all' && (
            <div className="q-actions">
              <span className="muted">{picks.length} selected</span>
              <button className="btn" disabled={locked || !picks.length} onClick={() => check()}>
                Check
              </button>
            </div>
          )}
        </div>
      )}

      {(q.kind === 'spell' || q.kind === 'text') && (
        <form
          className="q-input"
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
        >
          <input
            aria-label={q.kind === 'spell' ? 'Type notes' : 'Your answer'}
            autoFocus={!practice}
            value={text}
            disabled={locked}
            placeholder={q.kind === 'spell' ? 'Type notes, e.g.  C E G   (use # and b)' : 'Your answer'}
            onChange={(e) => {
              setText(e.target.value)
              if (result === false) setResult(null)
            }}
          />
          <button className="btn" disabled={locked || !text.trim()}>
            Check
          </button>
        </form>
      )}

      {result !== null && (
        <div className={'q-feedback ' + (result ? 'ok' : 'bad')} role="status" aria-live="polite">
          <strong>{result ? 'Correct!' : practice ? 'Not quite. Try again.' : 'Incorrect.'}</strong>
          {!result && !practice && <span> Answer: {pretty(correctAnswerText(q))}</span>}
          {(result || !practice) && q.explain && (
            <div className="q-explain">
              <Markdown md={q.explain} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
