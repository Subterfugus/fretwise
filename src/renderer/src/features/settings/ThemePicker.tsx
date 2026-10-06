import { Check } from 'lucide-react'
import { updateProgress, useProgress } from '@/state/progress'
import { THEMES, type ThemeId } from '@/themes'
import './themePicker.css'

/** A tiny themed scene: panel + text + accent + a fretboard strip. data-theme scopes the variables to this subtree. */
function Preview({ id }: { id: ThemeId }) {
  return (
    <div className="theme-preview" data-theme={id} aria-hidden="true">
      <div className="theme-preview-panel">
        <span className="theme-preview-text">Aa</span>
        <span className="theme-preview-muted">muted</span>
        <span className="theme-preview-btn">Go</span>
        <span className="theme-preview-dot ok" />
        <span className="theme-preview-dot bad" />
      </div>
      <svg viewBox="0 0 120 34" className="theme-preview-fb">
        <rect className="fb-wood" x="0" y="0" width="120" height="34" rx="3" />
        <line className="fb-nut" x1="6" y1="0" x2="6" y2="34" style={{ strokeWidth: 3 }} />
        {[40, 72, 104].map((x) => (
          <line key={x} className="fb-fret" x1={x} y1="0" x2={x} y2="34" style={{ strokeWidth: 1.2 }} />
        ))}
        {[7, 17, 27].map((y) => (
          <line key={y} className="fb-string" x1="0" y1={y} x2="120" y2={y} style={{ strokeWidth: 1 }} />
        ))}
        <g className="fb-mark root">
          <circle cx="24" cy="17" r="6" />
        </g>
        <g className="fb-mark tone">
          <circle cx="56" cy="7" r="6" />
        </g>
        <g className="fb-mark accent">
          <circle cx="88" cy="27" r="6" />
        </g>
      </svg>
    </div>
  )
}

export function ThemePicker() {
  const { settings } = useProgress()
  return (
    <div className="theme-grid" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const current = settings.theme === t.id
        return (
          <label key={t.id} className={'theme-card' + (current ? ' current' : '')}>
            <input
              type="radio"
              name="theme"
              className="theme-radio"
              value={t.id}
              checked={current}
              onChange={() => updateProgress((p) => void (p.settings.theme = t.id))}
            />
            <Preview id={t.id} />
            <span className="theme-card-name">
              {t.label}
              {current && (
                <span className="theme-card-current">
                  <Check size={14} aria-hidden /> Current
                </span>
              )}
            </span>
            <span className="theme-card-blurb muted small">{t.blurb}</span>
          </label>
        )
      })}
    </div>
  )
}
