// React glue for MicInput and the note tracker.
import { useEffect, useReducer, useRef, useState } from 'react'
import { MicInput, MicOptions } from './micInput'
import { NoteEvent, NoteTracker } from './onset'
import { freqToMidi } from './pitch'

/** Create a MicInput that is guaranteed to be released when the component unmounts. */
export function useMic(opts: MicOptions = {}): MicInput {
  const ref = useRef<MicInput | null>(null)
  if (!ref.current) ref.current = new MicInput(opts)
  const mic = ref.current
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const off = mic.onStatus(force)
    return () => {
      off()
      mic.stop() // tracks stopped + AudioContext closed
    }
  }, [mic])
  return mic
}

export interface LiveNote {
  midi: number
  cents: number
  at: number
}

/**
 * Feed mic frames through a NoteTracker while `active`. onNote fires once per played note.
 * Returns the note currently being heard (for display only).
 */
export function useNoteStream(mic: MicInput, a4: number, active: boolean, onNote: (e: NoteEvent) => void): { live: LiveNote | null; reset: () => void } {
  const cb = useRef(onNote)
  cb.current = onNote
  const tracker = useRef<NoteTracker | null>(null)
  const [live, setLive] = useState<LiveNote | null>(null)

  useEffect(() => {
    if (!active) {
      setLive(null)
      return
    }
    const tr = (tracker.current = new NoteTracker({ rmsGate: mic.gate }))
    let lastLive = 0
    let shown: LiveNote | null = null
    const off = mic.onFrame((f) => {
      const midi = f.freq ? freqToMidi(f.freq, a4) : null
      const ev = tr.push({ t: f.t, midi, clarity: f.clarity, rms: f.rms })
      if (midi !== null) {
        lastLive = f.t
        const m = Math.round(midi)
        const c = Math.round((midi - m) * 100)
        if (!shown || shown.midi !== m || Math.abs(shown.cents - c) >= 4) {
          shown = { midi: m, cents: c, at: f.t }
          setLive(shown)
        }
      } else if (shown && f.t - lastLive > 500) {
        shown = null
        setLive(null)
      }
      if (ev) cb.current(ev)
    })
    return () => {
      off()
      tracker.current = null
    }
  }, [mic, a4, active])

  return { live, reset: () => tracker.current?.reset() }
}
