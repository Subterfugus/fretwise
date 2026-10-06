import { useEffect, useRef, useState } from 'react'
import type { PlaySpec } from '@/content/types'
import { runPlay } from '@/audio/play'
import { engine } from '@/audio/engine'

export function PlayButton({ play, label = 'Play', small = false }: { play: PlaySpec | (() => Promise<unknown>); label?: string; small?: boolean }) {
  const [busy, setBusy] = useState(false)
  // Only the most recent click owns the busy state (an earlier, superseded run must not clear it).
  const run = useRef(0)
  const alive = useRef(true)
  const busyRef = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      // Leaving the page (or this button) mid-playback cuts its sound off.
      if (run.current > 0 && busyRef.current) engine.stop()
    }
  }, [])
  const go = async () => {
    const mine = ++run.current
    busyRef.current = true
    setBusy(true)
    try {
      await (typeof play === 'function' ? play() : runPlay(play))
    } catch (e) {
      console.error(e)
    } finally {
      if (mine === run.current) {
        busyRef.current = false
        if (alive.current) setBusy(false)
      }
    }
  }
  return (
    <button className={'play-btn' + (small ? ' small' : '') + (busy ? ' busy' : '')} onClick={go}>
      <span className="play-icon" aria-hidden>{busy ? '♪' : '▶'}</span>
      {label}
    </button>
  )
}
