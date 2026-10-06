// Tuner + microphone play-along exercises. The microphone is released when this page unmounts.
import { useEffect, useState } from 'react'
import { useMic } from './hooks'
import { useMicSettings } from './micSettings'
import { MicBar } from './MicBar'
import { Tuner } from './Tuner'
import { Exercises } from './Exercises'
import './mic.css'

type Tab = 'tuner' | 'play'

export function MicPractice() {
  const settings = useMicSettings()
  const mic = useMic({ fftSize: 4096, gate: settings.gate })
  const [tab, setTab] = useState<Tab>('tuner')

  useEffect(() => {
    mic.gate = settings.gate
  }, [mic, settings.gate])
  // tuner: bigger window for steady low strings; exercises: smaller window for quicker response
  useEffect(() => mic.setFftSize(tab === 'tuner' ? 4096 : 2048), [mic, tab])

  return (
    <div className="page mic-page">
      <h1>Tuner &amp; play-along</h1>
      <p className="muted">Plug in or point a microphone at your guitar. Everything is analysed on this computer, nothing is recorded.</p>

      <MicBar mic={mic} settings={settings} />

      <div className="mic-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'tuner'} className={'mic-tab' + (tab === 'tuner' ? ' active' : '')} onClick={() => setTab('tuner')}>
          Tuner
        </button>
        <button role="tab" aria-selected={tab === 'play'} className={'mic-tab' + (tab === 'play' ? ' active' : '')} onClick={() => setTab('play')}>
          Play-along exercises
        </button>
      </div>

      {tab === 'tuner' ? <Tuner mic={mic} settings={settings} /> : <Exercises mic={mic} settings={settings} />}
    </div>
  )
}
