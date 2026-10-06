import { useMemo, useState } from 'react'
import { Fretboard } from '@/components/Fretboard'
import { midiAt } from '@/theory/guitar'
import { pretty } from '@/theory/notes'
import { useProgress } from '@/state/progress'
import type { MicInput } from './micInput'
import { MicSettings } from './micSettings'
import { Challenge, DIFFICULTY_RULES, KIND_INFO, MarkMode, NoteTarget, generateChallenge, sequenceMarks } from './exerciseLogic'
import { SessionMsg, useSequenceSession } from './useSequenceSession'
import type { LiveNote } from './hooks'
import { useSpelling } from '@/state/useSpelling'
import { ArrowLeft } from 'lucide-react'

export function TargetChips({ targets, index, hideUnplayed }: { targets: NoteTarget[]; index: number; hideUnplayed?: boolean }) {
  const spelling = useSpelling()
  return (
    <div className="mic-chips" aria-label="Notes to play">
      {targets.map((t, i) => (
        <span key={i} className={'mic-chip' + (i < index ? ' done' : i === index ? ' current' : '')}>
          {i < index || !hideUnplayed ? pretty(t.computed ? spelling.spellPc(t.pc) : t.label) : '•'}
        </span>
      ))}
    </div>
  )
}

export function LiveChip({ live, listening }: { live: LiveNote | null; listening: boolean }) {
  const spelling = useSpelling()
  if (!listening) return null
  return (
    <div className="mic-live" aria-live="off">
      <span className="muted">Hearing</span>
      <strong>{live ? pretty(spelling.spellMidi(live.midi)) : '…'}</strong>
      {live && <span className={'muted mic-live-cents'}>{live.cents > 0 ? '+' : ''}{live.cents}¢</span>}
    </div>
  )
}

export function Feedback({ msg }: { msg: SessionMsg | null }) {
  return <div className={'mic-feedback' + (msg ? (msg.ok ? ' ok' : ' bad') : '')}>{msg?.text ?? ' '}</div>
}

export function ChallengeSession({ kind, mic, settings, onBack }: { kind: Challenge['kind']; mic: MicInput; settings: MicSettings; onBack: () => void }) {
  const progress = useProgress()
  const spelling = useSpelling()
  const { difficulty, anyOctave } = settings
  const rules = DIFFICULTY_RULES[difficulty]
  const [challenge, setChallenge] = useState(() => generateChallenge(kind, { difficulty, anyOctave }))
  const statKey = `${kind}:${difficulty}`
  const audible = useMemo(() => challenge.positions.map((ps) => midiAt(ps[0])), [challenge])

  const s = useSequenceSession({
    mic,
    a4: settings.a4,
    deviceId: settings.deviceId,
    targets: challenge.targets,
    audible,
    maxMistakes: rules.maxMistakes,
    statKey,
    autoStart: true
  })

  const finished = s.phase === 'done' || s.phase === 'failed' || s.phase === 'gaveup'
  const mode: MarkMode = finished ? 'reveal' : rules.hints ? 'hints' : 'hidden'
  const marks = sequenceMarks(
    challenge.positions,
    challenge.targets.map((t) => t.computed ? spelling.spellPc(t.pc) : t.label),
    s.index,
    mode
  )
  const stat = progress.mic.stats[statKey]
  const next = () => setChallenge((c) => generateChallenge(kind, { difficulty, anyOctave }, Math.random, c.title))

  return (
    <div className="mic-session">
      <div className="row mic-session-head">
        <button className="btn ghost" aria-label="← Exercises" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Exercises
        </button>
        <h2>{KIND_INFO[kind].title}</h2>
        <span className="mic-badge">{difficulty}</span>
        {anyOctave && <span className="mic-badge">any octave</span>}
      </div>

      <div className="card mic-prompt-card">
        <p className="mic-prompt">{pretty(challenge.kind === 'note' ? challenge.prompt.replace(challenge.targets[0].label, spelling.spellPc(challenge.targets[0].pc)) : challenge.prompt)}</p>
        {challenge.targets.length > 1 && <TargetChips targets={challenge.targets} index={s.index} hideUnplayed={difficulty === 'hard' && kind !== 'interval'} />}
        <Feedback msg={s.msg} />
        <LiveChip live={s.live} listening={s.phase === 'listening'} />

        <div className="row">
          {s.phase === 'ready' && (
            <>
              <button className="btn primary" disabled={mic.status === 'starting'} onClick={() => void s.begin()}>
                {mic.status === 'on' ? 'Start listening' : 'Start microphone and listen'}
              </button>
              <button className="btn ghost" onClick={() => void s.hear()}>
                Hear it
              </button>
              <button className="btn ghost" onClick={next}>
                Skip
              </button>
            </>
          )}
          {s.phase === 'listening' && (
            <>
              <button className="btn" onClick={s.giveUp}>
                Give up: show me
              </button>
              <button className="btn ghost" onClick={() => void s.hear()}>
                Hear it
              </button>
            </>
          )}
          {finished && (
            <>
              <button className="btn primary" onClick={next}>
                Next challenge
              </button>
              <button className="btn ghost" onClick={s.retry}>
                Try this one again
              </button>
              <button className="btn ghost" onClick={() => void s.hear()}>
                Hear it
              </button>
            </>
          )}
        </div>
      </div>

      {finished && (
        <div className={'card mic-result ' + (s.phase === 'done' ? 'ok' : 'bad')}>
          {s.phase === 'done' && (
            <strong>
              Done in {(s.elapsedMs / 1000).toFixed(1)} s{s.mistakes ? ` with ${s.mistakes} wrong note${s.mistakes === 1 ? '' : 's'}` : ', no wrong notes'}.
            </strong>
          )}
          {s.phase === 'failed' && <strong>Too many wrong notes ({s.mistakes}). The answer is on the fretboard.</strong>}
          {s.phase === 'gaveup' && <strong>The target{challenge.targets.length > 1 ? 's are' : ' is'} shown on the fretboard.</strong>}
          {stat && (
            <div className="muted">
              {difficulty}: {stat.completed}/{stat.attempts} completed
              {stat.bestTimeMs !== undefined && ` · best time ${(stat.bestTimeMs / 1000).toFixed(1)} s`}
            </div>
          )}
        </div>
      )}

      <div className="fb-wrap mic-fb">
        <Fretboard marks={marks} frets={challenge.frets} playable={false} />
      </div>
      <p className="muted mic-hint">
        {mode === 'hints' ? 'Easy mode: the dashed circles are the notes to play.' : finished ? 'Highlighted: where the notes are.' : 'The notes you play light up on the fretboard.'}
      </p>
    </div>
  )
}
