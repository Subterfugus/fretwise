import { useEffect, useRef, useState } from 'react'
import { Fretboard } from '@/components/Fretboard'
import type { FretMark } from '@/content/types'
import { FretPos, midiAt } from '@/theory/guitar'
import { pretty } from '@/theory/notes'
import { recordEar, recordEarSession, useProgress } from '@/state/progress'
import type { DrillDef, DrillSettings, Question, Sound } from './types'
import { loadSettings, saveSettings } from './drills'
import { playSound, stopSound } from './player'
import { SettingsPanel } from './SettingsPanel'
import { useSamples } from './useSamples'
import { melodySoundOf } from './drillFret'
import { ev, sound } from './weighting'
import { useSpelling } from '@/state/useSpelling'
import { controlOwnsDrillKey } from './keyboard'
import { ArrowLeft, AudioLines, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { DrillIcon } from './DrillIcon'

interface Pick {
  pos: FretPos
  ok: boolean
}
interface Score {
  right: number
  total: number
  streak: number
  best: number
}
const ZERO: Score = { right: 0, total: 0, streak: 0, best: 0 }
const KEY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export function DrillSession({ drill, onBack, onStats }: { drill: DrillDef; onBack: () => void; onStats: () => void }) {
  const progress = useProgress()
  const spelling = useSpelling()
  const stats = progress.ear[drill.id] ?? {}
  const samples = useSamples(progress.settings.instrument)

  const [settings, setSettingsState] = useState<DrillSettings>(() => loadSettings(drill))
  const setSettings = (s: DrillSettings) => {
    setSettingsState(s)
    saveSettings(drill.id, s)
  }
  const [showSettings, setShowSettings] = useState(false)

  const [q, setQ] = useState<Question | null>(null)
  const [part, setPart] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [revealed, setRevealed] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [score, setScore] = useState<Score>(ZERO)
  const [ended, setEnded] = useState(false)

  // Record an unfinished session if the user navigates away.
  const scoreRef = useRef(score)
  scoreRef.current = score
  const recorded = useRef(false)
  useEffect(
    () => () => {
      stopSound()
      if (!recorded.current && scoreRef.current.total > 0) {
        recorded.current = true
        recordEarSession(drill.id, scoreRef.current.right, scoreRef.current.total)
      }
    },
    [drill.id]
  )

  const ready = samples.status === 'ready'

  const play = (s: Sound) => {
    setPlaying(true)
    playSound(s).then(
      (done) => done && setPlaying(false),
      (e: unknown) => {
        setPlaying(false)
        setMsg('Could not play sound: ' + (e instanceof Error ? e.message : String(e)))
      }
    )
  }

  const next = () => {
    let nq: Question
    try {
      nq = drill.generate(settings, stats)
    } catch (e) {
      setMsg('Could not create a question: ' + (e instanceof Error ? e.message : String(e)))
      return
    }
    setQ(nq)
    setPart(0)
    setAnswers([])
    setPicks([])
    setRevealed(false)
    setHintOpen(false)
    setMsg(null)
    play(nq.sound)
  }

  const finish = (allOk: boolean) => {
    setRevealed(true)
    setScore((s) => {
      const streak = allOk ? s.streak + 1 : 0
      return { right: s.right + (allOk ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) }
    })
  }

  const choose = (key: string) => {
    if (!q?.parts) return
    if (revealed) {
      const snd = q.choiceSound?.(key, q.parts.length - 1)
      if (snd) play(snd)
      return
    }
    const p = q.parts[part]
    const ok = key === p.answer
    recordEar(drill.id, p.itemKey, ok)
    const na = [...answers, key]
    setAnswers(na)
    if (part + 1 < q.parts.length) setPart(part + 1)
    else finish(na.every((a, i) => a === q.parts![i].answer))
  }

  const pickFret = (pos: FretPos) => {
    const f = q?.fret
    if (!f || revealed) return
    if (f.string && pos.string !== f.string) {
      setMsg(`Click on string ${f.string}, the one that is highlighted.`)
      return
    }
    const i = picks.length
    const ok = midiAt(pos) === f.targets[i]
    recordEar(drill.id, f.itemKeys[i], ok)
    const np = [...picks, { pos, ok }]
    setPicks(np)
    setMsg(null)
    if (np.length === f.targets.length) finish(np.every((x) => x.ok))
  }

  const endSession = () => {
    stopSound()
    setPlaying(false)
    if (!recorded.current && score.total > 0) recordEarSession(drill.id, score.right, score.total)
    recorded.current = true
    setEnded(true)
  }
  const restart = () => {
    recorded.current = false
    setScore(ZERO)
    setEnded(false)
    setQ(null)
    setRevealed(false)
  }

  // ---------- keyboard ----------
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined)
  keys.current = (e: KeyboardEvent) => {
    if (ended || !ready) return
    if (controlOwnsDrillKey(e)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    // auto-repeat would answer several parts / skip questions while a key is held
    if (e.repeat) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
    }
    if (e.key === ' ') {
      if (q) play(q.sound)
      else next()
    } else if (e.key === 'Enter') {
      if (!q || revealed) next()
    } else if (e.key === 'r' || e.key === 'R') {
      if (q?.reference) play(q.reference.sound)
    } else if (q?.parts) {
      const idx = KEY_ORDER.indexOf(e.key)
      const choices = q.parts[Math.min(part, q.parts.length - 1)].choices
      if (idx >= 0 && idx < choices.length) choose(choices[idx].key)
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ---------- rendering ----------
  const acc = score.total ? Math.round((score.right / score.total) * 100) : null

  const header = (
    <div className="ear-topbar">
      <button className="btn ghost" aria-label="← Ear training" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden /> Ear training
      </button>
      <h2 className="ear-title">
        <span className="ear-glyph sm"><DrillIcon id={drill.id} size={18} /></span> {drill.title}
      </h2>
      <div className="ear-topbar-actions">
        <div className="ear-score" title="Session score">
          <span className="ear-score-main">
            {score.right} / {score.total}
          </span>
          {acc !== null && <span className="muted">{acc}%</span>}
          <span className={'ear-streak' + (score.streak >= 3 ? ' hot' : '')} title={`Best streak ${score.best}`}>
            streak {score.streak}
          </span>
        </div>
        <button className="btn ghost" onClick={onStats}>
          Stats
        </button>
        <button className="btn" onClick={endSession} disabled={ended}>
          End session
        </button>
      </div>
    </div>
  )

  if (ended)
    return (
      <div className="ear-page">
        {header}
        <div className="card ear-summary">
          <h3>Session complete</h3>
          <div className={'ear-summary-score ' + (acc === null ? '' : acc >= 80 ? 'ok' : acc >= 50 ? 'mid' : 'bad')}>{acc === null ? '—' : acc + '%'}</div>
          <p>
            {score.right} of {score.total} correct {'·'} best streak {score.best}
          </p>
          <div className="row ear-center">
            <button className="btn primary" onClick={restart}>
              New session
            </button>
            <button className="btn" onClick={onStats}>
              See stats
            </button>
            <button className="btn ghost" onClick={onBack}>
              Back to drills
            </button>
          </div>
        </div>
      </div>
    )

  const fret = q?.fret
  const parts = q?.parts
  const curPart = parts ? parts[Math.min(part, parts.length - 1)] : undefined
  const singleRevealed = revealed && parts?.length === 1
  const allOk = revealed && (parts ? answers.every((a, i) => a === parts[i].answer) : picks.every((p) => p.ok))

  // fretboard marks
  const marks: FretMark[] = []
  if (fret) {
    const offset = fret.start ? 2 : 1
    if (fret.string && !revealed)
      for (let f = fret.frets[0]; f <= fret.frets[1]; f++) marks.push({ string: fret.string, fret: f, color: 'ghost' })
    if (fret.start) marks.push({ ...fret.start, color: 'root', label: spelling.spellPc(midiAt(fret.start) % 12, { key: q?.keyContext }) })
    if (revealed)
      fret.targetPositions.forEach((tp, i) => {
        if (!picks[i]?.ok) marks.push({ ...tp, color: 'tone', label: fret.string ? spelling.spellPc(midiAt(tp) % 12, { key: q?.keyContext }) : String(i + offset) })
      })
    picks.forEach((pk, i) => marks.push({ ...pk.pos, color: pk.ok ? 'blue' : 'accent', label: fret.string ? (pk.ok ? '✓' : '✗') : String(i + offset) }))
  }

  const yourSound = (): Sound | null => {
    if (!q) return null
    if (fret) {
      if (!picks.length) return null
      const ms = picks.map((p) => midiAt(p.pos))
      return fret.start ? melodySoundOf([midiAt(fret.start), ...ms], q.sound.bpm) : sound([ev(ms, 2)], 60)
    }
    const wrongIdx = parts ? answers.findIndex((a, i) => a !== parts[i].answer) : -1
    return wrongIdx >= 0 ? (q.choiceSound?.(answers[wrongIdx], wrongIdx) ?? null) : null
  }
  const yours = revealed && !allOk ? yourSound() : null

  return (
    <div className="ear-page">
      {header}

      <div className="ear-layout">
        <div className="ear-main">
          <div className="card ear-stage">
            {samples.status === 'loading' && (
              <div className="ear-loading">
                <span className="ear-spinner" aria-hidden /> Loading instrument samples{'…'}
              </div>
            )}
            {samples.status === 'error' && (
              <div className="ear-error">
                Couldn't load the instrument samples ({samples.error}). Try another instrument in Settings, or run{' '}
                <code>npm run fetch-samples</code> and restart.
              </div>
            )}

            {!q ? (
              <div className="ear-start">
                <div className="ear-glyph lg"><DrillIcon id={drill.id} size={30} /></div>
                <p className="ear-blurb">{drill.blurb}</p>
                <button className="play-btn ear-play-big" disabled={!ready} onClick={next}>
                  <span className="play-icon" aria-hidden>
                    <Play size={18} aria-hidden />
                  </span>
                  Start
                </button>
                <p className="muted ear-keys">
                  <kbd>Space</kbd> replay {'·'} <kbd>1</kbd>{'–'}<kbd>9</kbd>, <kbd>0</kbd> answer {'·'} <kbd>R</kbd> reference {'·'} <kbd>Enter</kbd> next
                </p>
              </div>
            ) : (
              <>
                <div className="ear-prompt">{q.prompt}</div>
                <div className="ear-controls">
                  <button className={'play-btn ear-play-big' + (playing ? ' busy' : '')} disabled={!ready} onClick={() => play(q.sound)}>
                    <span className="play-icon" aria-hidden>
                      {playing ? <AudioLines size={18} aria-hidden /> : <Play size={18} aria-hidden />}
                    </span>
                    Replay
                  </button>
                  {q.reference && (
                    <button className="btn" aria-label={`▶ ${q.reference.label}`} disabled={!ready} onClick={() => play(q.reference!.sound)}>
                      <Play size={15} aria-hidden /> {q.reference.label}
                    </button>
                  )}
                  {q.hint && !revealed && (
                    <button className="btn ghost" onClick={() => setHintOpen((h) => !h)}>
                      {hintOpen ? 'Hide hint' : 'Hint'}
                    </button>
                  )}
                </div>
                {hintOpen && q.hint && !revealed && <div className="ear-hint">Think of: {q.hint}</div>}

                {parts && parts.length > 1 && (
                  <div className="ear-slots">
                    {parts.map((p, i) => {
                      const a = answers[i]
                      const state = a === undefined ? (i === part && !revealed ? 'current' : '') : a === p.answer ? 'ok' : 'bad'
                      return (
                        <div key={i} className={'ear-slot ' + state}>
                          <span className="ear-slot-label">{p.prompt ?? `Part ${i + 1}`}</span>
                          <span className="ear-slot-val">
                            {a === undefined ? '?' : a}
                            {a !== undefined && a !== p.answer && <span className="ear-slot-fix"> {'→'} {p.answer}</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {curPart && (
                  <div className={'ear-choices' + (curPart.choices.length > 6 ? ' many' : '')}>
                    {curPart.choices.map((c, i) => {
                      let cls = 'ear-choice'
                      if (singleRevealed) {
                        if (c.key === curPart.answer) cls += ' ok'
                        else if (c.key === answers[0]) cls += ' bad'
                        else cls += ' dim'
                      } else if (revealed) cls += ' dim'
                      return (
                        <button key={c.key} className={cls} disabled={!ready} onClick={() => choose(c.key)} title={revealed ? 'Hear this answer' : undefined}>
                          {i < KEY_ORDER.length && <kbd className="ear-kbd">{KEY_ORDER[i]}</kbd>}
                          <span className="ear-choice-label">{pretty(c.label)}</span>
                          {c.sub && <span className="ear-choice-sub">{c.sub}</span>}
                          {revealed && q.choiceSound && <span className="ear-choice-ear" aria-hidden><Play size={12} /></span>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {fret && (
                  <div className="ear-fret-wrap">
                    {!revealed && (
                      <div className="ear-fret-status">
                        {fret.string
                          ? `String ${fret.string} is highlighted. Click the fret you heard.`
                          : `Note ${picks.length + 2} of ${fret.targets.length + 1}: click it on the neck.`}
                      </div>
                    )}
                    <div className="fb-wrap">
                      <Fretboard className="ear-fb" frets={fret.frets} marks={marks} onPick={pickFret} />
                    </div>
                  </div>
                )}

                {msg && <div className="ear-msg">{msg}</div>}

                {revealed && (
                  <div className={'ear-feedback ' + (allOk ? 'ok' : 'bad')}>
                    <div className="ear-verdict">{allOk ? '✓ Correct!' : '✗ Not quite'}</div>
                    <div className="ear-reveal">{pretty(q.displayReveal?.(spelling) ?? q.reveal)}</div>
                    <div className="row ear-compare">
                      <button className="btn" aria-label="▶ Correct answer" onClick={() => play(q.sound)}>
                        <Play size={15} aria-hidden /> Correct answer
                      </button>
                      {yours && (
                        <button className="btn" aria-label="▶ What you picked" onClick={() => play(yours)}>
                          <Play size={15} aria-hidden /> What you picked
                        </button>
                      )}
                      <button className="btn primary ear-next" onClick={next}>
                        Next <kbd className="ear-kbd inv">Enter</kbd>
                      </button>
                    </div>
                    {fret && !allOk && fret.start && (
                      <div className="muted ear-small">
                        Correct notes: {[midiAt(fret.start), ...fret.targets].map((m) => pretty(spelling.spellMidi(m, { key: q.keyContext }))).join(' → ')}. Dashed circles show where the missed notes are.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className={'card ear-side' + (showSettings ? ' open' : '')}>
          <button className="ear-side-head" aria-expanded={showSettings} onClick={() => setShowSettings((s) => !s)}>
            <span>Settings</span>
            {showSettings ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
          </button>
          {showSettings && <SettingsPanel drill={drill} settings={settings} onChange={setSettings} instrument={progress.settings.instrument} />}
          {!showSettings && (
            <p className="muted ear-small">
              {settings.items.length} {drill.itemsLabel.toLowerCase()} selected{settings.weak ? ' · focusing on weak items' : ''}. Changes apply from the next question.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
