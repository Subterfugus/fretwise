import { useEffect, useMemo, useRef, useState } from 'react'
import { Fretboard } from '@/components/Fretboard'
import { pretty } from '@/theory/notes'
import { recordMicMemo, useProgress } from '@/state/progress'
import type { MicInput } from './micInput'
import { MicSettings } from './micSettings'
import { matchesTarget, memoTarget } from './exerciseLogic'
import { useNoteStream } from './hooks'
import { Feedback, LiveChip } from './ChallengeSession'
import type { SessionMsg } from './useSequenceSession'
import { useSpelling } from '@/state/useSpelling'
import { ArrowLeft } from 'lucide-react'

type Phase = 'ready' | 'running' | 'over'

export function MemoSession({ mic, settings, onBack }: { mic: MicInput; settings: MicSettings; onBack: () => void }) {
  const progress = useProgress()
  const spelling = useSpelling()
  const { difficulty, memoSeconds: total } = settings
  const [phase, setPhase] = useState<Phase>('ready')
  const [target, setTarget] = useState(() => memoTarget(difficulty))
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [left, setLeft] = useState(total)
  const [runSecs, setRunSecs] = useState(total)
  const [msg, setMsg] = useState<SessionMsg | null>(null)
  const [flash, setFlash] = useState<typeof target | null>(null)
  const started = useRef(0)
  const counts = useRef({ correct: 0, wrong: 0 })
  const targetRef = useRef(target)
  targetRef.current = target
  const phaseRef = useRef<Phase>('ready')
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const setPh = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const finish = () => {
    if (phaseRef.current !== 'running') return
    setPh('over')
    setFlash(null)
    const secs = Math.min(total, (performance.now() - started.current) / 1000)
    const rounded = Math.max(1, Math.round(secs))
    setRunSecs(rounded)
    recordMicMemo(difficulty, counts.current.correct, counts.current.wrong, rounded)
  }

  const begin = async () => {
    if (mic.status !== 'on') {
      await mic.start(settings.deviceId)
      if ((mic.status as string) !== 'on') return
    }
    counts.current = { correct: 0, wrong: 0 }
    setCorrect(0)
    setWrong(0)
    setMsg(null)
    setFlash(null)
    setLeft(total)
    setTarget(memoTarget(difficulty))
    started.current = performance.now()
    setPh('running')
  }

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      const remaining = total - (performance.now() - started.current) / 1000
      if (remaining <= 0) {
        setLeft(0)
        finish()
      } else setLeft(remaining)
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, total])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const { live } = useNoteStream(mic, settings.a4, phase === 'running', (e) => {
    if (phaseRef.current !== 'running') return
    const cur = targetRef.current
    if (matchesTarget(e.midi, cur.target)) {
      counts.current.correct++
      setCorrect(counts.current.correct)
      setMsg({ ok: true, text: `${pretty(spelling.spellMidi(e.midi))} - correct` })
      setFlash(cur)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), 1400)
      setTarget(memoTarget(difficulty, Math.random, cur.target.pc))
    } else {
      counts.current.wrong++
      setWrong(counts.current.wrong)
      setMsg({ ok: false, text: `Heard ${pretty(spelling.spellMidi(e.midi))}, looking for ${pretty(spelling.spellPc(cur.target.pc))}` })
    }
  })

  // mic lost mid-run: end the run
  useEffect(() => mic.onStatus(() => mic.status !== 'on' && phaseRef.current === 'running' && finish()), [mic]) // eslint-disable-line react-hooks/exhaustive-deps

  const marks = useMemo(
    () => (flash ? flash.positions.map((p) => ({ ...p, color: 'root' as const, label: spelling.spellPc(flash.target.pc) })) : []),
    [flash, spelling]
  )
  const stat = progress.mic.stats[`memo:${difficulty}`]
  const perMinute = (correct * 60) / Math.max(1, runSecs)
  const lastRuns = progress.mic.memoHistory.slice(-5).reverse()

  return (
    <div className="mic-session">
      <div className="row mic-session-head">
        <button className="btn ghost" aria-label="← Exercises" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Exercises
        </button>
        <h2>Fretboard memory</h2>
        <span className="mic-badge">{difficulty}</span>
        <span className="mic-badge">{total} s</span>
      </div>

      <div className="card mic-prompt-card">
        {phase === 'ready' && (
          <>
            <p className="mic-prompt">Play the note that appears, anywhere on the neck. As many as you can in {total} seconds.</p>
            <p className="muted">
              {difficulty === 'easy' && 'Easy: natural notes only, any string.'}
              {difficulty === 'medium' && 'Medium: all 12 notes, any string.'}
              {difficulty === 'hard' && 'Hard: all 12 notes, and you are told which string to find them on.'}
            </p>
            <div className="row">
              <button className="btn primary" disabled={mic.status === 'starting'} onClick={() => void begin()}>
                {mic.status === 'on' ? 'Start the clock' : 'Start microphone and begin'}
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <div className="mic-memo-top">
              <span className="mic-timer" aria-label="Time left">
                {Math.ceil(left)}s
              </span>
              <span className="mic-score">
                {correct} <span className="muted">correct</span>
              </span>
              <span className="muted">{wrong} wrong</span>
            </div>
            <div className="mic-timebar">
              <div style={{ width: (left / total) * 100 + '%' }} />
            </div>
            <p className="mic-bignote">{pretty(target.prompt.replace(target.target.label, spelling.spellPc(target.target.pc)))}</p>
            <Feedback msg={msg} />
            <LiveChip live={live} listening />
            <div className="row">
              <button className="btn ghost" onClick={() => setTarget(memoTarget(difficulty, Math.random, target.target.pc))}>
                Skip this note
              </button>
              <button className="btn ghost" onClick={finish}>
                End now
              </button>
            </div>
          </>
        )}

        {phase === 'over' && (
          <>
            <p className="mic-prompt">
              Time! <strong>{correct}</strong> correct, {wrong} wrong
            </p>
            <p>
              Score: <strong>{perMinute.toFixed(1)}</strong> notes per minute
              {stat?.bestScore !== undefined && <span className="muted"> · best {stat.bestScore.toFixed(1)}/min</span>}
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => void begin()}>
                Go again
              </button>
              <button className="btn ghost" onClick={() => setPh('ready')}>
                Back
              </button>
            </div>
          </>
        )}
      </div>

      {phase === 'over' && lastRuns.length > 0 && (
        <div className="card">
          <h3>Recent runs</h3>
          <ul className="mic-history">
            {lastRuns.map((r) => (
              <li key={r.at}>
                {new Date(r.at).toLocaleString()}: {r.correct} correct / {r.wrong} wrong in {r.seconds}s ({r.perMinute.toFixed(1)}/min)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="fb-wrap mic-fb">
        <Fretboard marks={marks} frets={[0, 12]} playable={false} />
      </div>
      <p className="muted mic-hint">After each correct note, every place that note lives on the first 12 frets flashes up.</p>
    </div>
  )
}
