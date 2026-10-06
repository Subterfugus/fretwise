import { useState } from 'react'
import { getProgress, useProgress } from '@/state/progress'
import type { DrillId } from './types'
import { DRILLS, drillById, loadSettings, saveSettings, weakestSettings } from './drills'
import { DrillSession } from './DrillSession'
import { StatsView } from './StatsView'
import { InstrumentSelect } from './SettingsPanel'
import { totals } from './weighting'
import { useSamples } from './useSamples'
import { DrillIcon } from './DrillIcon'
import { BarChart3, Play } from 'lucide-react'
import './ear.css'

type View = { kind: 'home' } | { kind: 'drill'; id: DrillId; n: number } | { kind: 'stats'; id: DrillId }

export function EarTraining() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const home = () => setView({ kind: 'home' })
  const open = (id: DrillId) => setView({ kind: 'drill', id, n: Date.now() })

  if (view.kind === 'drill')
    return <DrillSession key={view.n} drill={drillById(view.id)} onBack={home} onStats={() => setView({ kind: 'stats', id: view.id })} />

  if (view.kind === 'stats') {
    const drill = drillById(view.id)
    return (
      <StatsView
        drill={drill}
        onBack={home}
        onPractise={(weak) => {
          const cur = loadSettings(drill)
          saveSettings(drill.id, weak ? weakestSettings(drill, cur, getProgress().ear[drill.id] ?? {}) : { ...cur, weak: false })
          open(drill.id)
        }}
      />
    )
  }

  return <EarHome onOpen={open} onStats={(id) => setView({ kind: 'stats', id })} />
}

function EarHome({ onOpen, onStats }: { onOpen: (id: DrillId) => void; onStats: (id: DrillId) => void }) {
  const progress = useProgress()
  const samples = useSamples(progress.settings.instrument)
  const all = DRILLS.map((d) => totals(progress.ear[d.id])).reduce((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 })

  return (
    <div className="ear-page">
      <header className="ear-hero">
        <div>
          <h1>Ear training</h1>
          <p className="muted">
            Train your ear with real recorded instruments. Every answer feeds your stats, and "Practise weakest" drills what you miss most.
          </p>
        </div>
        <div className="ear-hero-side">
          <InstrumentSelect value={progress.settings.instrument} />
          <div className="ear-hero-status muted">
            {samples.status === 'loading' && (
              <>
                <span className="ear-spinner" aria-hidden /> loading samples{'…'}
              </>
            )}
            {samples.status === 'ready' && <>samples ready {'·'} {all.total ? `${Math.round((all.right / all.total) * 100)}% overall over ${all.total} answers` : 'no answers yet'}</>}
            {samples.status === 'error' && <span className="ear-bad-text">samples failed to load</span>}
          </div>
        </div>
      </header>

      <div className="ear-grid">
        {DRILLS.map((d) => {
          const t = totals(progress.ear[d.id])
          const acc = t.total ? t.right / t.total : null
          const hist = progress.earHistory[d.id] ?? []
          const lastSession = hist[hist.length - 1]
          return (
            <div key={d.id} className="card ear-card" role="button" tabIndex={0} onClick={() => onOpen(d.id)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.currentTarget === e.target) { e.preventDefault(); onOpen(d.id) } }}>
              <div className="ear-card-top">
                <span className="ear-glyph"><DrillIcon id={d.id} /></span>
                <Ring value={acc} />
              </div>
              <h3>{d.title}</h3>
              <p className="muted ear-card-blurb">{d.blurb}</p>
              <div className="ear-card-meta muted">
                {t.total ? `${t.total} answers` : 'Not started'}
                {lastSession && ` · last session ${lastSession.right}/${lastSession.total}`}
              </div>
              <div className="ear-card-actions">
                <button
                  className="btn primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(d.id)
                  }}
                >
                  <Play size={15} aria-hidden /> Practise
                </button>
                <button
                  className="btn ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    onStats(d.id)
                  }}
                >
                  <BarChart3 size={15} aria-hidden /> Stats
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Small accuracy ring for drill cards. */
function Ring({ value }: { value: number | null }) {
  const r = 20
  const c = 2 * Math.PI * r
  const tone = value === null ? 'none' : value >= 0.85 ? 'good' : value >= 0.6 ? 'mid' : 'low'
  return (
    <svg className={'ear-ring ' + tone} viewBox="0 0 50 50" width="50" height="50" aria-label={value === null ? 'no data' : `${Math.round(value * 100)}% accuracy`}>
      <circle className="ear-ring-bg" cx="25" cy="25" r={r} />
      {value !== null && <circle className="ear-ring-fg" cx="25" cy="25" r={r} strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 25 25)" />}
      <text x="25" y="29" textAnchor="middle">
        {value === null ? '—' : Math.round(value * 100) + '%'}
      </text>
    </svg>
  )
}
