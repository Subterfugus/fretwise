import { useProgress } from '@/state/progress'
import type { DrillDef } from './types'
import { statLabels } from './drills'
import { rankItems, totals } from './weighting'
import { ArrowLeft } from 'lucide-react'
import { DrillIcon } from './DrillIcon'

const pct = (x: number) => Math.round(x * 100) + '%'
const tone = (acc: number) => (acc >= 0.85 ? 'good' : acc >= 0.6 ? 'mid' : 'low')

export function StatsView({ drill, onBack, onPractise }: { drill: DrillDef; onBack: () => void; onPractise: (weak: boolean) => void }) {
  const progress = useProgress()
  const stats = progress.ear[drill.id] ?? {}
  const history = progress.earHistory[drill.id] ?? []
  const rows = rankItems(stats, statLabels(drill))
  const t = totals(stats)
  const untried = drill.items.filter((i) => !stats[i.key]?.total)

  return (
    <div className="ear-page">
      <div className="ear-topbar">
        <button className="btn ghost" aria-label="← Ear training" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Ear training
        </button>
        <h2 className="ear-title">
          <span className="ear-glyph sm"><DrillIcon id={drill.id} size={18} /></span> {drill.title} <span className="muted">stats</span>
        </h2>
        <div className="ear-topbar-actions">
          <button className="btn" onClick={() => onPractise(false)}>
            Practise
          </button>
          <button className="btn primary" disabled={rows.length === 0} onClick={() => onPractise(true)}>
            Practise weakest
          </button>
        </div>
      </div>

      <div className="ear-stat-tiles">
        <div className="card ear-tile">
          <div className="ear-tile-val">{t.total ? pct(t.right / t.total) : '—'}</div>
          <div className="muted">overall accuracy</div>
        </div>
        <div className="card ear-tile">
          <div className="ear-tile-val">{t.total}</div>
          <div className="muted">answers</div>
        </div>
        <div className="card ear-tile">
          <div className="ear-tile-val">{history.length}</div>
          <div className="muted">sessions</div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="card ear-history">
          <h3>Recent sessions</h3>
          <div className="ear-history-bars">
            {history.map((h, i) => {
              const a = h.total ? h.right / h.total : 0
              return (
                <div key={i} className="ear-history-col" title={`${h.right}/${h.total} · ${new Date(h.at).toLocaleString()}`}>
                  <div className={'ear-history-bar ' + tone(a)} style={{ height: `${Math.max(4, a * 100)}%` }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Accuracy by item <span className="muted">(weakest first)</span></h3>
        {rows.length === 0 ? (
          <p className="muted">No answers yet. Practise a few rounds and your per-item accuracy will show up here.</p>
        ) : (
          <div className="ear-bars">
            {rows.map((r) => (
              <div className="ear-bar-row" key={r.key}>
                <span className="ear-bar-label">{r.label}</span>
                <div className="ear-bar-track">
                  <div className={'ear-bar-fill ' + tone(r.acc)} style={{ width: `${Math.max(2, r.acc * 100)}%` }} />
                </div>
                <span className="ear-bar-num">
                  {pct(r.acc)} <span className="muted">({r.right}/{r.total})</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {untried.length > 0 && rows.length > 0 && (
          <p className="muted ear-untried">Not tried yet: {untried.map((i) => i.label).join(', ')}</p>
        )}
      </div>
    </div>
  )
}
