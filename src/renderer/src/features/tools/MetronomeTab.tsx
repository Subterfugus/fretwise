import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Hand, Minus, Play, Plus, Square } from 'lucide-react'
import { Field, NumberInput, Seg, usePref } from './ui'
import { MAX_BPM, MIN_BPM, SUBDIVISIONS, Subdivision, TIME_SIGS, accentLevels, clampBpm, tapTempo, timeSigById, trainerBarsToTarget } from './metro'
import { metronome } from './metronome'
import { engine } from '@/audio/engine'
import { PresetControls } from './PresetControls'
import type { MetronomePresetConfig } from '@/state/toolPresets'
import './workspacePolish.css'

export function MetronomeTab() {
  const [bpm, setBpm] = usePref('mt.bpm', 100)
  const [sig, setSig] = usePref('mt.sig', '4/4', (v) => TIME_SIGS.some((t) => t.id === v))
  const [sub, setSub] = usePref<Subdivision>('mt.sub', 'none', (v) => SUBDIVISIONS.some((s) => s.id === v))
  const [accentFirst, setAccentFirst] = usePref('mt.accent', true)
  const [volume, setVolume] = usePref('mt.vol', 0.8)
  const [trOn, setTrOn] = usePref('mt.trOn', false)
  const [trStep, setTrStep] = usePref('mt.trStep', 5)
  const [trEvery, setTrEvery] = usePref('mt.trEvery', 4)
  const [trTarget, setTrTarget] = usePref('mt.trTarget', 160)
  const taps = useRef<number[]>([])
  const state = useSyncExternalStore(metronome.subscribe, metronome.getState)

  const ts = timeSigById(sig)
  const effSub: Subdivision = ts.compound && sub === 'triplet' ? 'eighth' : sub
  const trainer = { enabled: trOn, step: trStep, everyBars: trEvery, target: trTarget }

  useEffect(() => {
    metronome.setConfig({ bpm, sig, sub: effSub, accentFirst, trainer: { enabled: trOn, step: trStep, everyBars: trEvery, target: trTarget }, volume })
  }, [bpm, sig, effSub, accentFirst, trOn, trStep, trEvery, trTarget, volume])
  useEffect(() => () => metronome.stop(), [])

  const playing = state.status === 'playing'
  const levels = accentLevels(ts)
  const toggle = () => (playing || state.status === 'loading' ? metronome.stop() : void metronome.start())
  const tap = () => {
    const now = performance.now()
    taps.current = [...taps.current.filter((t) => now - t < 8000), now]
    const t = tapTempo(taps.current)
    if (t) setBpm(t)
  }
  const bars = trainerBarsToTarget(bpm, trainer)
  const presetConfig: MetronomePresetConfig = { bpm, sig, sub, accentFirst, volume, trOn, trStep, trEvery, trTarget }
  const loadPreset = (c: MetronomePresetConfig) => {
    engine.stop()
    taps.current = []
    setBpm(c.bpm)
    setSig(c.sig)
    setSub(c.sub)
    setAccentFirst(c.accentFirst)
    setVolume(c.volume)
    setTrOn(c.trOn)
    setTrStep(c.trStep)
    setTrEvery(c.trEvery)
    setTrTarget(c.trTarget)
  }

  return (
    <div className="tools-pane tool-workspace metronome-workspace">
      <PresetControls tool="metronome" config={presetConfig} onLoad={loadPreset} />
      <div className="workspace-band tools-metro">
        <div className="tools-bpm">
          <button className="btn" onClick={() => setBpm(clampBpm(bpm - 1))} aria-label="Slower" title="Slower">
            <Minus size={21} aria-hidden />
          </button>
          <div className="tools-bpm-num">
            <b>{playing && trOn ? state.bpm : bpm}</b>
            <span className="muted">BPM ({ts.unit})</span>
          </div>
          <button className="btn" onClick={() => setBpm(clampBpm(bpm + 1))} aria-label="Faster" title="Faster">
            <Plus size={21} aria-hidden />
          </button>
        </div>
        <input
          type="range"
          className="tools-bpm-range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={(e) => setBpm(clampBpm(Number(e.target.value)))}
          aria-label="Tempo"
        />
        <div className="tools-beats" aria-label="Beat indicator">
          {levels.map((lv, i) => (
            <span key={i} className={'tools-beat l' + lv + (playing && state.pulse === i ? ' on' : '')} />
          ))}
        </div>
        <div className="row tools-center">
          <button className="btn primary tools-big" onClick={toggle}>
            {playing || state.status === 'loading' ? <Square size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            {playing || state.status === 'loading' ? 'Stop' : 'Start'}
          </button>
          <button className="btn" onClick={tap}>
            <Hand size={17} aria-hidden />
            Tap tempo
          </button>
          <NumberInput
            className="tools-num"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={setBpm}
            aria-label="BPM"
          />
        </div>
        <p className="muted tools-center metro-bar">{playing ? `Bar ${state.bar + 1}` : ''}</p>
        {state.error && <p className="tools-err">{state.error}</p>}
      </div>

      <div className="workspace-band metro-meter">
        <div className="tools-controls">
          <Field label="Time signature">
            <Seg label="Time signature" options={TIME_SIGS.map((t) => ({ id: t.id, label: t.label }))} value={sig} onChange={setSig} />
          </Field>
          <Field label="Subdivision">
            <Seg
              label="Subdivision"
              options={SUBDIVISIONS.map((s) => ({ id: s.id, label: s.label, disabled: ts.compound && s.id === 'triplet' }))}
              value={effSub}
              onChange={setSub}
            />
          </Field>
        </div>
        <div className="tools-controls">
          <label className="tools-check">
            <input type="checkbox" checked={accentFirst} onChange={(e) => setAccentFirst(e.target.checked)} /> Accent the first beat
          </label>
          <Field label="Volume">
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </Field>
        </div>
        <p className="muted">
          Accent grouping for {ts.label}: {ts.groups.join(' + ')}
          {ts.compound ? ' (each beat divides in three)' : ''}. Strong click on the bar's first beat, medium on each group start.
        </p>
      </div>

      <div className="workspace-band metro-trainer">
        <label className="tools-check">
          <input type="checkbox" checked={trOn} onChange={(e) => setTrOn(e.target.checked)} /> <b>Tempo trainer</b> <span className="muted">speed up gradually from the tempo above</span>
        </label>
        <div className="tools-controls" style={{ opacity: trOn ? 1 : 0.55 }}>
          <Field label="Add (BPM)">
            <NumberInput className="tools-num" min={1} max={50} value={trStep} onChange={setTrStep} />
          </Field>
          <Field label="Every (bars)">
            <NumberInput className="tools-num" min={1} max={64} value={trEvery} onChange={setTrEvery} />
          </Field>
          <Field label="Up to (BPM)">
            <NumberInput className="tools-num" min={MIN_BPM} max={MAX_BPM} value={trTarget} onChange={setTrTarget} />
          </Field>
        </div>
        {trOn && (
          <p className="muted">
            {bars === null ? 'The target is below the starting tempo, so nothing will change.' : bars === 0 ? 'Already at the target.' : `Reaches ${trTarget} BPM after ${bars} bars.`}
          </p>
        )}
      </div>
    </div>
  )
}
