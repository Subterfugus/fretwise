import { useEffect, useState } from 'react'
import { engine, InstrumentId } from '@/audio/engine'
import { updateProgress } from '@/state/progress'

export type SampleStatus = { status: 'loading' | 'ready' | 'error'; error?: string }

/** Keep the engine on the chosen instrument and report sample loading state. */
export function useSamples(inst: InstrumentId): SampleStatus {
  const [state, setState] = useState<SampleStatus>(() => ({ status: engine.isLoaded(inst) ? 'ready' : 'loading' }))
  useEffect(() => {
    let alive = true
    if (engine.instrument !== inst) engine.setInstrument(inst).catch(() => undefined)
    if (engine.isLoaded(inst)) {
      setState({ status: 'ready' })
      return
    }
    setState({ status: 'loading' })
    engine.load(inst).then(
      () => alive && setState({ status: 'ready' }),
      (e: unknown) => alive && setState({ status: 'error', error: e instanceof Error ? e.message : String(e ?? 'unknown error') })
    )
    return () => {
      alive = false
    }
  }, [inst])
  return state
}

/** Change the app-wide instrument (settings + engine kept in sync). */
export function chooseInstrument(id: InstrumentId): void {
  updateProgress((p) => {
    p.settings.instrument = id
  })
  engine.setInstrument(id).catch(() => undefined)
}
