// Compact play-along used by lesson `playIt` blocks.
import { useEffect, useMemo } from 'react'
import { Fretboard } from '@/components/Fretboard'
import type { FretMark, Block } from '@/content/types'
import { pretty } from '@/theory/notes'
import { parsePlayIt, sequenceMarks } from './exerciseLogic'
import { useMic } from './hooks'
import { useMicSettings } from './micSettings'
import { Feedback, LiveChip, TargetChips } from './ChallengeSession'
import { useSequenceSession } from './useSequenceSession'
import './mic.css'
import { Guitar } from 'lucide-react'

export type PlayItBlockData = Extract<Block, { type: 'playIt' }>

export function PlayItBlock({ block }: { block: PlayItBlockData }) {
  const settings = useMicSettings()
  const mic = useMic({ fftSize: 2048, gate: settings.gate })
  const parsed = useMemo(() => parsePlayIt(block.targets, block.octaveAgnostic), [block.targets, block.octaveAgnostic])

  const s = useSequenceSession({
    mic,
    a4: settings.a4,
    deviceId: settings.deviceId,
    targets: parsed.targets,
    audible: parsed.audible,
    maxMistakes: Infinity,
    statKey: 'playIt'
  })

  const finished = s.phase === 'done' || s.phase === 'gaveup' || s.phase === 'failed'
  const labels = parsed.targets.map((t) => t.label)
  const marks: FretMark[] = finished
    ? block.show
      ? block.show.map((p) => ({ ...p, color: 'root' as const }))
      : sequenceMarks(parsed.positions, labels, s.index, 'reveal')
    : []
  const listening = s.phase === 'listening'
  // a lesson block should not keep the microphone open once the exercise is over
  useEffect(() => {
    if (finished) mic.stop()
  }, [finished, mic])

  return (
    <div className="b-playit mic-playit">
      <div className="mic-playit-title">
        <span className="mic-glyph" aria-hidden>
          <Guitar size={16} aria-hidden />
        </span>
        Play it
      </div>
      <p className="mic-playit-prompt">{pretty(block.prompt)}</p>
      {block.hint && <p className="muted mic-playit-hint">{pretty(block.hint)}</p>}
      {parsed.targets.length > 1 && <TargetChips targets={parsed.targets} index={s.index} hideUnplayed={false} />}
      <Feedback msg={s.msg} />
      <LiveChip live={s.live} listening={listening} />

      {mic.status !== 'on' && mic.error && (
        <p className="mic-error" role="alert">
          {mic.error}
        </p>
      )}

      <div className="row mic-playit-row">
        {!listening && (
          <button className="btn primary" disabled={mic.status === 'starting'} onClick={() => void s.begin()}>
            {finished ? 'Play it again' : mic.status === 'starting' ? 'Starting…' : 'Listen to my guitar'}
          </button>
        )}
        {listening && (
          <button className="btn" onClick={s.giveUp}>
            Show me
          </button>
        )}
        <button className="btn ghost" onClick={() => void s.hear()}>
          Hear it
        </button>
        {listening && (
          <button className="btn ghost" onClick={() => mic.stop()}>
            Stop microphone
          </button>
        )}
        {s.phase === 'ready' && !listening && !finished && <span className="muted">Uses your microphone; headphones recommended.</span>}
      </div>

      {s.phase === 'done' && <p className="mic-playit-result ok">Nice. {s.mistakes ? `${s.mistakes} wrong note${s.mistakes === 1 ? '' : 's'} on the way.` : 'Clean, no wrong notes.'}</p>}
      {s.phase === 'gaveup' && <p className="mic-playit-result">Here is where those notes are.</p>}

      {finished && (
        <div className="fb-wrap">
          <Fretboard marks={marks} frets={block.frets ?? [0, 12]} playable={false} tuning={block.tuning} />
        </div>
      )}
    </div>
  )
}
