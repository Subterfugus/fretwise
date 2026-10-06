import { useState } from 'react'
import { useProgress } from '@/state/progress'
import type { MicInput } from './micInput'
import { MicSettings, updateMicSettings } from './micSettings'
import { DIFFICULTY_RULES, Difficulty, ExerciseKind, KIND_INFO } from './exerciseLogic'
import { ChallengeSession } from './ChallengeSession'
import { MemoSession } from './MemoSession'
import { AudioLines, Layers3, ListMusic, Music2, Play, Timer } from 'lucide-react'

const KINDS: ExerciseKind[] = ['note', 'interval', 'scale', 'arpeggio', 'memo']
const ICONS = { note: Music2, interval: AudioLines, scale: ListMusic, arpeggio: Layers3, memo: Timer }

export function Exercises({ mic, settings }: { mic: MicInput; settings: MicSettings }) {
  const [kind, setKind] = useState<ExerciseKind | null>(null)
  const [n, setN] = useState(0)
  const progress = useProgress()
  const open = (k: ExerciseKind) => {
    setN((x) => x + 1)
    setKind(k)
  }

  if (kind === 'memo') return <MemoSession key={n} mic={mic} settings={settings} onBack={() => setKind(null)} />
  if (kind) return <ChallengeSession key={n} kind={kind} mic={mic} settings={settings} onBack={() => setKind(null)} />

  return (
    <div className="mic-exercises">
      <div className="card mic-settings">
        <div className="mic-field-row">
          <div>
            <div className="mic-label">Difficulty</div>
            <div className="mic-seg" role="radiogroup" aria-label="Difficulty">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button key={d} role="radio" aria-checked={settings.difficulty === d} className={'btn ' + (settings.difficulty === d ? 'primary' : 'ghost')} onClick={() => updateMicSettings({ difficulty: d })}>
                  {d}
                </button>
              ))}
            </div>
            <div className="muted mic-hint">{DIFFICULTY_RULES[settings.difficulty].blurb}</div>
          </div>
          <label className="mic-check">
            <input type="checkbox" checked={settings.anyOctave} onChange={(e) => updateMicSettings({ anyOctave: e.target.checked })} />
            <span>
              Any octave
              <span className="muted"> accept the right note name in any octave</span>
            </span>
          </label>
          <label className="mic-field">
            <span className="muted">Memory drill length</span>
            <select value={settings.memoSeconds} onChange={(e) => updateMicSettings({ memoSeconds: Number(e.target.value) })}>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mic-grid">
        {KINDS.map((k) => {
          const stat = progress.mic.stats[`${k}:${settings.difficulty}`]
          const Icon = ICONS[k]
          return (
            <div key={k} className="card mic-card">
              <div className="mic-card-top">
                <span className="mic-glyph"><Icon size={22} aria-hidden /></span>
                <h3>{KIND_INFO[k].title}</h3>
              </div>
              <p className="muted">{KIND_INFO[k].blurb}</p>
              <div className="muted mic-card-stat">
                {!stat
                  ? `No ${settings.difficulty} attempts yet`
                  : k === 'memo'
                    ? `${stat.attempts} run${stat.attempts === 1 ? '' : 's'}${stat.bestScore !== undefined ? ` · best ${stat.bestScore.toFixed(1)} notes/min` : ''}`
                    : `${stat.completed}/${stat.attempts} completed${stat.bestTimeMs !== undefined ? ` · best ${(stat.bestTimeMs / 1000).toFixed(1)} s` : ''}`}
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => open(k)}>
                  <Play size={15} aria-hidden /> Practise
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
