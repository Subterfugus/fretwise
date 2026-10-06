// One "play these notes" attempt: starts listening, feeds detected notes into a SequenceRun,
// records the result. Shared by the exercise pages and the lesson playIt block.
import { useEffect, useReducer, useRef, useState } from 'react'
import { engine } from '@/audio/engine'
import { recordMic } from '@/state/progress'
import { pretty } from '@/theory/notes'
import type { MicInput } from './micInput'
import { NoteTarget, SequenceRun } from './exerciseLogic'
import { LiveNote, useNoteStream } from './hooks'
import type { NoteEvent } from './onset'
import { useSpelling } from '@/state/useSpelling'

export type Phase = 'ready' | 'listening' | 'done' | 'failed' | 'gaveup'

export interface SessionMsg {
  ok: boolean
  text: string
}

export interface SequenceSessionOptions {
  mic: MicInput
  a4: number
  deviceId: string | null
  targets: NoteTarget[]
  /** MIDI notes for "hear it" */
  audible: number[]
  maxMistakes: number
  /** progress key, e.g. "scale:easy" */
  statKey: string
  /** start listening as soon as the targets change, when the mic is already on */
  autoStart?: boolean
}

export interface SequenceSession {
  phase: Phase
  index: number
  mistakes: number
  msg: SessionMsg | null
  live: LiveNote | null
  elapsedMs: number
  run: SequenceRun
  begin: () => Promise<void>
  giveUp: () => void
  hear: () => Promise<void>
  /** back to 'ready' with a fresh run (same targets) */
  retry: () => void
}

export function useSequenceSession(o: SequenceSessionOptions): SequenceSession {
  const spelling = useSpelling()
  const { mic, targets } = o
  const runRef = useRef(new SequenceRun(targets, o.maxMistakes))
  const [phase, setPhase] = useState<Phase>('ready')
  const phaseRef = useRef<Phase>('ready')
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [msg, setMsg] = useState<SessionMsg | null>(null)
  const [elapsedMs, setElapsed] = useState(0)
  const startedAt = useRef(0)
  const latest = useRef(o)
  latest.current = o

  const setPh = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const finish = (outcome: 'done' | 'failed' | 'gaveup') => {
    if (phaseRef.current !== 'listening') return
    const run = runRef.current
    const ms = performance.now() - startedAt.current
    setElapsed(ms)
    setPh(outcome)
    recordMic(latest.current.statKey, { completed: outcome === 'done', hits: run.hits.length, mistakes: run.mistakes, timeMs: ms })
  }

  const begin = async () => {
    const cur = latest.current
    runRef.current = new SequenceRun(cur.targets, cur.maxMistakes)
    setMsg(null)
    bump()
    const on = () => mic.status === 'on'
    if (!on()) {
      await mic.start(cur.deviceId)
      if (!on()) {
        setPh('ready')
        return
      }
    }
    startedAt.current = performance.now()
    setPh('listening')
  }

  const retry = () => {
    runRef.current = new SequenceRun(latest.current.targets, latest.current.maxMistakes)
    setMsg(null)
    setPh('ready')
    bump()
  }

  // New targets (next challenge): reset, and keep listening if the mic is on
  useEffect(() => {
    retry()
    if (latest.current.autoStart && mic.status === 'on') void begin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets])

  // the mic went away mid-attempt
  useEffect(
    () =>
      mic.onStatus(() => {
        if (mic.status !== 'on' && phaseRef.current === 'listening') {
          setPh('ready')
          setMsg({ ok: false, text: 'The microphone stopped. Press Start to try again.' })
        }
      }),
    [mic]
  )

  const onNote = (e: NoteEvent) => {
    const run = runRef.current
    if (phaseRef.current !== 'listening' || run.finished) return
    const want = run.current
    const res = run.push(e.midi)
    if (res === 'hit') setMsg({ ok: true, text: `${pretty(spelling.spellMidi(e.midi))} - correct` })
    else if (res === 'miss')
      setMsg({ ok: false, text: `Heard ${pretty(spelling.spellMidi(e.midi))}${want ? `, looking for ${pretty(want.computed ? spelling.spellPc(want.pc) : want.label)}` : ''}` })
    bump()
    if (run.done) finish('done')
    else if (run.failed) finish('failed')
  }

  const { live } = useNoteStream(mic, o.a4, phase === 'listening', onNote)

  const giveUp = () => finish('gaveup')

  const hear = async () => {
    const midis = latest.current.audible
    if (!midis.length) return
    const gap = midis.length > 1 ? 0.5 : 0
    const dur = 1.2
    mic.muteFor((gap * (midis.length - 1) + dur + 1.2) * 1000)
    try {
      await engine.playNotes(midis, midis.length > 1 ? 'arpeggio' : 'block', { gap, duration: dur })
    } catch {
      setMsg({ ok: false, text: 'Could not play the sample sound.' })
    }
  }

  // leaving the page: stop any sound we started
  useEffect(() => () => engine.stop(), [])

  const run = runRef.current
  return { phase, index: run.index, mistakes: run.mistakes, msg, live, elapsedMs, run, begin, giveUp, hear, retry }
}
