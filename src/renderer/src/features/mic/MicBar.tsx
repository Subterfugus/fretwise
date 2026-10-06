import { useEffect, useRef, useState } from 'react'
import type { MicInput } from './micInput'
import { MicSettings, updateMicSettings } from './micSettings'
import { Mic, MicOff, Minus, Plus } from 'lucide-react'

/** Input level meter: peak on a -60..0 dB scale, with the noise gate marked. */
export function LevelMeter({ mic }: { mic: MicInput }) {
  const [level, setLevel] = useState(0)
  const [hold, setHold] = useState(0)
  const [gate, setGate] = useState(mic.gate)
  const last = useRef(0)
  useEffect(() => {
    return mic.onFrame((f) => {
      if (f.t - last.current < 50) return
      last.current = f.t
      const db = f.peak > 0 ? 20 * Math.log10(f.peak) : -90
      const v = Math.min(1, Math.max(0, (db + 60) / 60))
      setLevel(v)
      setHold((h) => Math.max(v, h - 0.04))
      setGate(mic.gate)
    })
  }, [mic])
  const gateDb = 20 * Math.log10(gate)
  const gatePos = Math.min(1, Math.max(0, (gateDb + 60) / 60))
  return (
    <div className="mic-meter" title="Input level. Playing should reach the middle or beyond; the tick is the noise gate." aria-label="Input level">
      <div className={'mic-meter-fill' + (level > 0.95 ? ' clip' : '')} style={{ width: level * 100 + '%' }} />
      <div className="mic-meter-hold" style={{ left: hold * 100 + '%' }} />
      <div className="mic-meter-gate" style={{ left: gatePos * 100 + '%' }} />
    </div>
  )
}

const SENSITIVITY: { label: string; gate: number }[] = [
  { label: 'High (quiet guitar / far mic)', gate: 0.003 },
  { label: 'Normal', gate: 0.008 },
  { label: 'Low (noisy room)', gate: 0.02 }
]

export function MicBar({ mic, settings }: { mic: MicInput; settings: MicSettings }) {
  const on = mic.status === 'on'
  const starting = mic.status === 'starting'
  const sens = SENSITIVITY.reduce((best, s) => (Math.abs(Math.log(s.gate / settings.gate)) < Math.abs(Math.log(best.gate / settings.gate)) ? s : best))
  const a4 = settings.a4
  return (
    <div className="card mic-bar">
      <div className="mic-bar-main">
        {on ? (
          <button className="btn" onClick={() => mic.stop()}>
            <MicOff size={16} aria-hidden /> Stop microphone
          </button>
        ) : (
          <button className="btn primary" disabled={starting} onClick={() => void mic.start(settings.deviceId)}>
            <Mic size={16} aria-hidden /> {starting ? 'Starting…' : 'Start microphone'}
          </button>
        )}
        <div className="mic-bar-level">
          {on ? <LevelMeter mic={mic} /> : <span className="muted">Microphone is off. Nothing is recorded or stored.</span>}
        </div>
      </div>

      {(mic.status === 'denied' || mic.status === 'nodevice' || mic.status === 'error') && mic.error && (
        <p className="mic-error" role="alert">
          {mic.error}
        </p>
      )}

      <div className="mic-bar-opts">
        {mic.devices.length > 1 && (
          <label className="mic-field">
            <span className="muted">Input</span>
            <select
              value={mic.deviceId ?? ''}
              onChange={(e) => {
                updateMicSettings({ deviceId: e.target.value || null })
                if (on || starting) void mic.start(e.target.value || null)
              }}
            >
              {mic.devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mic-field">
          <span className="muted">Sensitivity</span>
          <select
            value={sens.gate}
            onChange={(e) => {
              const g = Number(e.target.value)
              mic.gate = g
              updateMicSettings({ gate: g })
            }}
          >
            {SENSITIVITY.map((s) => (
              <option key={s.gate} value={s.gate}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mic-field">
          <span className="muted">A4 =</span>
          <button className="btn ghost mic-step" aria-label="Lower A4 by 1 Hz" disabled={a4 <= 415} onClick={() => updateMicSettings({ a4: a4 - 1 })}>
            <Minus size={14} aria-hidden />
          </button>
          <A4Input value={a4} />
          <button className="btn ghost mic-step" aria-label="Raise A4 by 1 Hz" disabled={a4 >= 466} onClick={() => updateMicSettings({ a4: a4 + 1 })}>
            <Plus size={14} aria-hidden />
          </button>
          <span className="muted">Hz</span>
          {a4 !== 440 && (
            <button className="btn ghost mic-step" onClick={() => updateMicSettings({ a4: 440 })}>
              reset
            </button>
          )}
        </div>
      </div>
      <p className="muted mic-hint">
        Use headphones when you play along so the app's own sounds are not picked up. The microphone is never routed to your speakers.
      </p>
    </div>
  )
}

/** Text box that only commits valid values, so typing "4", "44", "440" works. */
function A4Input({ value }: { value: number }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <input
      className="mic-a4"
      type="text"
      inputMode="numeric"
      value={text}
      aria-label="A4 reference frequency in Hz"
      onChange={(e) => {
        setText(e.target.value)
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v >= 415 && v <= 466) updateMicSettings({ a4: v })
      }}
      onBlur={() => setText(String(value))}
    />
  )
}
