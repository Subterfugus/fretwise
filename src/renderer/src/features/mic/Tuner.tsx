import { useEffect, useRef, useState } from 'react'
import { engine } from '@/audio/engine'
import { pretty } from '@/theory/notes'
import type { MicInput } from './micInput'
import { MicSettings, updateMicSettings } from './micSettings'
import { TUNER_STRINGS, centsOff, midiToFreq, nearestString, noteFromFreq } from './pitch'
import { useSpelling } from '@/state/useSpelling'
import { Play } from 'lucide-react'

const IN_TUNE = 5
const HOLD_MS = 1000

interface Reading {
  freq: number
  at: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function Tuner({ mic, settings }: { mic: MicInput; settings: MicSettings }) {
  const spelling = useSpelling()
  const { a4, tunerMode: mode } = settings
  const [reading, setReading] = useState<Reading | null>(null)
  const [locked, setLocked] = useState<number | null>(null) // string number the player chose as target
  const [toneMsg, setToneMsg] = useState<string | null>(null)
  const recent = useRef<number[]>([])
  const lastSeen = useRef(0)

  useEffect(() => {
    recent.current = []
    return mic.onFrame((f) => {
      if (f.freq) {
        lastSeen.current = f.t
        // median of the last few readings: ignores one-off glitches without lagging much
        const r = recent.current
        // a big jump (new note) restarts the smoothing
        if (r.length && Math.abs(centsOff(f.freq, r[r.length - 1])) > 80) r.length = 0
        r.push(f.freq)
        if (r.length > 5) r.shift()
        setReading({ freq: median(r), at: f.t })
      } else if (f.t - lastSeen.current > HOLD_MS) {
        recent.current = []
        setReading((cur) => (cur ? null : cur))
      }
    })
  }, [mic])

  // Which note/string are we showing, and how far off is it?
  let name = '–'
  let sub = ''
  let cents: number | null = null
  let targetFreq: number | null = null
  let activeString: number | null = null
  if (reading) {
    if (mode === 'auto') {
      const lockedDef = TUNER_STRINGS.find((s) => s.string === locked)
      if (lockedDef) {
        targetFreq = midiToFreq(lockedDef.midi, a4)
        cents = centsOff(reading.freq, targetFreq)
        name = spelling.spellPc(lockedDef.midi % 12)
        activeString = lockedDef.string
      } else {
        const s = nearestString(reading.freq, a4)
        cents = s.cents
        targetFreq = s.target
        name = spelling.spellPc(s.midi % 12)
        activeString = s.string
      }
      sub = `string ${activeString}`
    } else {
      const n = noteFromFreq(reading.freq, a4)
      cents = n.cents
      targetFreq = n.target
      const spelled = spelling.spellMidi(n.midi)
      name = spelled.replace(/-?\d+$/, '')
      sub = spelled.slice(name.length)
    }
  }
  const tuned = cents !== null && Math.abs(cents) <= IN_TUNE
  const shown = cents === null ? 0 : Math.max(-50, Math.min(50, cents))
  const far = cents !== null && Math.abs(cents) > 50

  const playRef = async (midi: number) => {
    setToneMsg(null)
    try {
      mic.muteFor(3800) // do not "hear" our own reference tone
      await engine.playNote(midi, 2.5)
    } catch {
      setToneMsg('Could not play the reference tone (sound samples did not load).')
    }
  }

  return (
    <div className="mic-tuner">
      <div className="mic-modes" role="tablist" aria-label="Tuner mode">
        <button role="tab" aria-selected={mode === 'auto'} className={'btn ' + (mode === 'auto' ? 'primary' : 'ghost')} onClick={() => updateMicSettings({ tunerMode: 'auto' })}>
          Guitar (auto string)
        </button>
        <button role="tab" aria-selected={mode === 'chromatic'} className={'btn ' + (mode === 'chromatic' ? 'primary' : 'ghost')} onClick={() => updateMicSettings({ tunerMode: 'chromatic' })}>
          Chromatic
        </button>
      </div>

      <div className={'card mic-gauge' + (tuned ? ' in-tune' : '') + (reading ? '' : ' idle')}>
        <Gauge cents={shown} active={!!reading} tuned={tuned} />
        <div className="mic-readout">
          <div className="mic-note" aria-live="polite">
            {pretty(name)}
            {mode === 'chromatic' && reading && <sub>{sub}</sub>}
          </div>
          <div className="mic-sub muted">{mode === 'auto' && reading ? <>{sub}{locked ? ' (locked)' : ''}</> : '\u00a0'}</div>
          <div className={'mic-cents ' + (tuned ? 'ok' : cents === null ? '' : 'off')}>
            {cents === null ? (mic.status === 'on' ? 'Play a string…' : 'Start the microphone') : `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents`}
          </div>
          <div className="mic-verdict">
            {tuned ? 'In tune' : cents === null ? '' : far ? (cents < 0 ? 'Much too low: tune up' : 'Much too high: tune down') : cents < 0 ? 'Flat: tune up' : 'Sharp: tune down'}
          </div>
          <div className="muted mic-hz">
            {reading && targetFreq ? `${reading.freq.toFixed(1)} Hz  (target ${targetFreq.toFixed(1)} Hz)` : ' '}
          </div>
        </div>
      </div>

      {mode === 'auto' && (
        <div className="mic-strings">
          {[...TUNER_STRINGS].map((s) => (
            <div key={s.string} className={'mic-string' + (activeString === s.string ? ' active' : '') + (activeString === s.string && tuned ? ' tuned' : '') + (locked === s.string ? ' locked' : '')}>
              <button
                className="mic-string-main"
                aria-pressed={locked === s.string}
                title={locked === s.string ? 'Unlock: detect the string automatically' : 'Lock the tuner to this string'}
                onClick={() => setLocked(locked === s.string ? null : s.string)}
              >
                <span className="mic-string-name">{pretty(spelling.spellPc(s.midi % 12))}</span>
                <span className="muted">string {s.string}</span>
              </button>
              <button className="btn ghost mic-ref" aria-label={`Play reference tone for string ${s.string}`} onClick={() => void playRef(s.midi)}>
                <Play size={13} aria-hidden /> tone
              </button>
            </div>
          ))}
        </div>
      )}
      {toneMsg && <p className="mic-error">{toneMsg}</p>}
      <p className="muted mic-hint">
        {mode === 'auto'
          ? 'Pluck one string at a time, let it ring. The tuner finds the closest string for you; click a string to lock onto it.'
          : 'Pluck any note. Shows the nearest note and how many cents sharp or flat it is.'}
        {a4 !== 440 && ' Reference tones are always played at A = 440 Hz.'}
      </p>
    </div>
  )
}

/** Half-circle gauge: -50..+50 cents mapped to -60..+60 degrees. */
function Gauge({ cents, active, tuned }: { cents: number; active: boolean; tuned: boolean }) {
  const cx = 200
  const cy = 190
  const r = 150
  const pt = (c: number, rad: number) => {
    const a = ((c / 50) * 60 * Math.PI) / 180
    return { x: cx + rad * Math.sin(a), y: cy - rad * Math.cos(a) }
  }
  const arc = (c1: number, c2: number, rad: number) => {
    const a = pt(c1, rad)
    const b = pt(c2, rad)
    return `M ${a.x} ${a.y} A ${rad} ${rad} 0 0 1 ${b.x} ${b.y}`
  }
  const ticks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]
  return (
    <svg className="mic-gauge-svg" viewBox="0 0 400 215" role="img" aria-label={active ? `${cents.toFixed(0)} cents` : 'no signal'}>
      <path d={arc(-50, 50, r)} className="mic-arc" />
      <path d={arc(-5, 5, r)} className="mic-arc zone" />
      {ticks.map((t) => {
        const a = pt(t, r - (t % 10 === 0 ? 16 : 8))
        const b = pt(t, r + 4)
        return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={'mic-tick' + (t === 0 ? ' zero' : '')} />
      })}
      {[-50, -25, 0, 25, 50].map((t) => {
        const p = pt(t, r - 32)
        return (
          <text key={t} x={p.x} y={p.y + 4} textAnchor="middle" className="mic-tick-label">
            {t > 0 ? '+' + t : t}
          </text>
        )
      })}
      <g className={'mic-needle' + (active ? '' : ' idle') + (tuned ? ' tuned' : '')} style={{ transform: `rotate(${(shown(cents) / 50) * 60}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 6} />
        <circle cx={cx} cy={cy} r="9" />
      </g>
    </svg>
  )
}

const shown = (c: number) => Math.max(-50, Math.min(50, c))
