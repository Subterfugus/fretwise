import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Eye, Play, RotateCcw, Square, Volume2 } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import type { FretMark } from '@/content/types'
import { flushProgress, recordPracticeAnswer, recordPracticeSession, useProgress } from '@/state/progress'
import { useSpelling } from '@/state/useSpelling'
import { FretPos, midiAt, pcAt, STRING_NAMES } from '@/theory/guitar'
import { pretty } from '@/theory/notes'
import { answerNoteFinder, nextNoteFinder, NOTE_FINDER_LENGTH, NoteFinderConfig, noteFinderDefaults, NoteFinderLevel, noteFinderPool, NoteFinderSession, startNoteFinder, validNoteFinderConfig } from './noteFinder'
import { Field, NumberInput, Seg, useEngineReady, usePref } from './ui'
import './noteFinder.css'
import './workspacePolish.css'

const LEVELS: { id: NoteFinderLevel; label: string }[] = [
  { id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' }, { id: 'custom', label: 'Custom' }
]

export function NoteFinderTab() {
  const progress = useProgress()
  const { spellPc } = useSpelling()
  const ready = useEngineReady()
  const [config, setConfig] = usePref<NoteFinderConfig>('noteFinder.config', noteFinderDefaults(), validNoteFinderConfig)
  const [session, setSessionState] = useState<NoteFinderSession | null>(null)
  const sessionRef = useRef<NoteFinderSession | null>(null)
  const recorded = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const stats = progress.practice.noteFinder.stats
  const history = progress.practice.noteFinder.history
  const pool = useMemo(() => noteFinderPool(config), [config])
  const active = !!session && !session.ended
  const question = session?.question
  const answer = session?.answer
  const setSession = (s: NoteFinderSession) => {
    sessionRef.current = s
    setSessionState(s)
  }

  const saveSession = (s: NoteFinderSession) => {
    if (recorded.current || !s.total) return
    recorded.current = true
    recordPracticeSession('noteFinder', { right: s.right, total: s.total, assisted: s.assisted,
      durationMs: s.ended ? s.durationMs : Math.max(0, Date.now() - s.startedAt) })
  }

  useEffect(() => {
    const savePartial = () => {
      engine.stop()
      const s = sessionRef.current
      if (s && s.total && !recorded.current) {
        recorded.current = true
        recordPracticeSession('noteFinder', { right: s.right, total: s.total, assisted: s.assisted,
          durationMs: s.ended ? s.durationMs : Math.max(0, Date.now() - s.startedAt) })
      }
    }
    const close = () => { savePartial(); flushProgress(true) }
    window.addEventListener('beforeunload', close)
    window.addEventListener('pagehide', close)
    return () => {
      window.removeEventListener('beforeunload', close)
      window.removeEventListener('pagehide', close)
      savePartial()
    }
  }, [])

  const start = () => {
    engine.stop()
    setError(null)
    recorded.current = false
    try { setSession(startNoteFinder(config, stats, Date.now())) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start this session.') }
  }

  const finishAnswer = (pick?: FretPos) => {
    const current = sessionRef.current
    if (!current) return
    const next = answerNoteFinder(current, pick, Date.now())
    if (next === current) return
    setSession(next)
    recordPracticeAnswer('noteFinder', current.question.key, next.answer!.correct, next.answer!.assisted)
  }

  const next = () => {
    const current = sessionRef.current
    if (!current) return
    engine.stop()
    setError(null)
    const nextSession = nextNoteFinder(current, config, stats, Date.now())
    setSession(nextSession)
    if (nextSession.ended) saveSession(nextSession)
  }

  const end = () => {
    const current = sessionRef.current
    if (!current) return
    engine.stop()
    const ended = { ...current, ended: true, durationMs: Math.max(0, Date.now() - current.startedAt) }
    setSession(ended)
    saveSession(ended)
  }

  const play = (pos: FretPos) => {
    engine.stop()
    engine.playNote(midiAt(pos), 1.6).catch(() => setError('Sound could not be played.'))
  }
  const change = (partial: Partial<NoteFinderConfig>) => setConfig({ ...config, ...partial, level: 'custom' })
  const changeFret = (index: 0 | 1, fret: number) => {
    const frets: [number, number] = index === 0 ? [fret, Math.max(fret, config.frets[1])] : [Math.min(fret, config.frets[0]), fret]
    change({ frets })
  }

  const marks: FretMark[] = []
  if (question && active) {
    if (!answer) {
      for (let fret = question.frets[0]; fret <= question.frets[1]; fret++) marks.push({ string: question.string, fret, color: 'ghost' })
    } else {
      question.positions.forEach((pos) => marks.push({ ...pos, color: 'tone', label: spellPc(question.pc) }))
      if (answer.pick && !answer.correct) marks.push({ ...answer.pick, color: 'accent', label: spellPc(pcAt(answer.pick)) })
    }
  }

  const weakRows = pool.map((q) => ({ q, stat: stats[q.key] }))
    .filter((x) => x.stat?.total > 0)
    .sort((a, b) => a.stat.right / a.stat.total - b.stat.right / b.stat.total || b.stat.total - a.stat.total)
    .slice(0, 5)
  const total = Object.values(stats).reduce((sum, s) => sum + s.total, 0)
  const right = Object.values(stats).reduce((sum, s) => sum + s.right, 0)

  return (
    <div className="tools-pane tool-workspace nf-pane">
      <div className="nf-settings">
        <div className="tools-controls">
          <Field label="Level">
            <Seg label="Difficulty" options={LEVELS} value={config.level} disabled={active} onChange={(level) => setConfig(level === 'custom' ? { ...config, level } : noteFinderDefaults(level, config.weak))} />
          </Field>
          <Field label="Notes">
            <select aria-label="Note finder note set" value={config.naturalOnly ? 'natural' : 'all'} disabled={active} onChange={(e) => change({ naturalOnly: e.target.value === 'natural' })}>
              <option value="natural">Natural notes</option><option value="all">All notes</option>
            </select>
          </Field>
          <Field label="From fret"><NumberInput className="tools-num" min={0} max={22} value={config.frets[0]} disabled={active} onChange={(fret) => changeFret(0, fret)} /></Field>
          <Field label="To fret"><NumberInput className="tools-num" min={0} max={22} value={config.frets[1]} disabled={active} onChange={(fret) => changeFret(1, fret)} /></Field>
          <label className="tools-check nf-weak"><input type="checkbox" checked={config.weak} disabled={active} onChange={(e) => setConfig({ ...config, weak: e.target.checked })} />Practise weakest</label>
        </div>
        <fieldset className="nf-strings" disabled={active}>
          <legend>Strings</legend>
          {[1, 2, 3, 4, 5, 6].map((string) => (
            <label key={string} className="tools-check">
              <input type="checkbox" checked={config.strings.includes(string)} disabled={active || config.strings.length === 1 && config.strings[0] === string}
                onChange={(e) => change({ strings: e.target.checked ? [...config.strings, string].sort() : config.strings.filter((s) => s !== string) })} />
              {string} <span className="muted">{pretty(spellPc(pcAt({ string, fret: 0 })))}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <section className="nf-stage" aria-label="Note finder practice">
        {!session ? (
          <div className="nf-start">
            <h3>Note Finder</h3>
            <div className="muted">{NOTE_FINDER_LENGTH} questions / frets {config.frets[0]}-{config.frets[1]}</div>
            <button className="btn primary nf-action" onClick={start} disabled={!pool.length}><Play size={18} aria-hidden />Start session</button>
            {!pool.length && <p className="tools-err">No natural notes in this range. Choose another fret or all notes.</p>}
          </div>
        ) : session.ended ? (
          <div className="nf-summary">
            <h3>Session complete</h3>
            <div className="nf-summary-score">{session.right}<span> / {session.total}</span></div>
            <p>{session.assisted} assisted / {Math.round(session.durationMs / 1000)} seconds</p>
            <button className="btn primary nf-action" onClick={start} disabled={!pool.length}><RotateCcw size={18} aria-hidden />New session</button>
          </div>
        ) : (
          <>
            <div className="nf-session-bar">
              <span className="muted">Question {Math.min(session.total + (answer ? 0 : 1), NOTE_FINDER_LENGTH)} of {NOTE_FINDER_LENGTH}</span>
              <span>{session.right} correct / {session.assisted} assisted</span>
              <button className="btn ghost nf-action" onClick={end}><Square size={15} aria-hidden />End session</button>
            </div>
            <h3 className="nf-prompt">Find <strong>{pretty(spellPc(question!.pc))}</strong> on string {question!.string}</h3>
            <div className="nf-range muted">String {question!.string} ({STRING_NAMES[question!.string - 1]}) / frets {question!.frets[0]}-{question!.frets[1]}</div>
            <div className="tools-board nf-board">
              <Fretboard frets={question!.frets} marks={marks} activeStrings={[question!.string]} ariaLabel={`Find ${pretty(spellPc(question!.pc))} on string ${question!.string}`}
                hoverNames={false} playable={false} selected={answer?.pick ? [answer.pick] : []}
                onPick={(pos) => answer ? play(pos) : finishAnswer(pos)} />
            </div>
            {!answer ? (
              <div className="row"><button className="btn ghost nf-action" onClick={() => finishAnswer()} title="Reveal matching positions"><Eye size={17} aria-hidden />Reveal</button></div>
            ) : (
              <div className={'nf-feedback ' + (answer.correct ? 'ok' : answer.assisted ? 'assisted' : 'bad')} aria-live="polite">
                <div className="nf-verdict">{answer.correct ? 'Correct' : answer.assisted ? 'Revealed' : 'Not quite'}</div>
                <p>{answer.pick && !answer.correct ? `You picked ${pretty(spellPc(pcAt(answer.pick)))} at fret ${answer.pick.fret}. ` : ''}
                  {pretty(spellPc(question!.pc))}: {question!.positions.length === 1 ? 'fret' : 'frets'} {question!.positions.map((p) => p.fret).join(', ')}.
                  {!answer.assisted && <span className="muted"> { (answer.responseMs / 1000).toFixed(1)} seconds</span>}
                </p>
                <div className="row">
                  <button className="btn nf-action" disabled={ready !== 'ready'} onClick={() => play(question!.positions[0])} title="Hear the correct note"><Volume2 size={17} aria-hidden />Correct note</button>
                  {answer.pick && !answer.correct && <button className="btn ghost nf-action" disabled={ready !== 'ready'} onClick={() => play(answer.pick!)}><Volume2 size={17} aria-hidden />Your note</button>}
                  <button className="btn primary nf-action nf-next" onClick={next}>{session.total >= NOTE_FINDER_LENGTH ? 'Finish session' : 'Next'}<ArrowRight size={18} aria-hidden /></button>
                </div>
              </div>
            )}
          </>
        )}
        {error && <p className="tools-err" role="alert">{error}</p>}
      </section>

      <section className="nf-stats" aria-label="Note finder progress">
        <div className="nf-stats-heading"><h3>Progress</h3><span className="muted">{right} / {total} correct{total > 0 ? ` (${Math.round(right / total * 100)}%)` : ''}</span></div>
        <div className="nf-stats-columns">
          <div>
            <h4>Weakest notes</h4>
            {weakRows.length ? <table className="nf-table"><thead><tr><th>Note</th><th>String</th><th>Correct</th></tr></thead><tbody>
              {weakRows.map(({ q, stat }) => <tr key={q.key}><td>{pretty(spellPc(q.pc))}</td><td>{q.string}</td><td>{stat.right} / {stat.total}</td></tr>)}
            </tbody></table> : <p className="muted">No attempts in the selected range.</p>}
          </div>
          <div>
            <h4>Recent sessions</h4>
            {history.length ? <table className="nf-table"><thead><tr><th>Date</th><th>Correct</th><th>Assisted</th></tr></thead><tbody>
              {[...history].reverse().slice(0, 5).map((h, i) => <tr key={`${h.at}:${i}`}><td>{new Date(h.at).toLocaleDateString()}</td><td>{h.right} / {h.total}</td><td>{h.assisted}</td></tr>)}
            </tbody></table> : <p className="muted">No completed sessions yet.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
