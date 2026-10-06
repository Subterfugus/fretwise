import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Play, Square, X } from 'lucide-react'
import './workspacePolish.css'
import { Fretboard } from '@/components/Fretboard'
import { INSTRUMENTS, InstrumentId, engine } from '@/audio/engine'
import { LabelMode } from '@/content/helpers'
import { noteName, pitchClass, pretty } from '@/theory/notes'
import { SCALES, ScaleType, buildScale, intervalToDegree } from '@/theory/scales'
import { CHORDS, buildChord } from '@/theory/chords'
import { parseInterval } from '@/theory/intervals'
import { looper } from './looper'
import { BassMode, DrumMode, STYLES, StrumStyle } from './patterns'
import { NUMERAL_PALETTE, PRESETS, ProgChord, fitScales, parseRoman, prettyRoman, progressionChords } from './progressions'
import { Chips, Field, NumberInput, RootPicker, Seg, usePref } from './ui'
import { rootName } from './names'
import { useProgress } from '@/state/progress'
import type { LooperPresetConfig } from '@/state/toolPresets'
import { PresetControls } from './PresetControls'
import { targetToneMarks, type TargetMode } from './targetTones'
import { useSpelling } from '@/state/useSpelling'
import { isChordDuration, normalizeCountInBeats, validLoopSection, type LoopSection } from './looperTiming'

const BEATS = [1, 2, 3, 4, 6, 8]
const COUNT_IN = [0, 2, 3, 4, 6, 8]
const integer = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

const isMinorNumeral = (r: string): boolean => /^[b#♭♯]?[iv]/.test(r.trim())

export function LooperTab({ initialConfig }: { initialConfig?: LooperPresetConfig }) {
  const { settings } = useProgress()
  const [presetId, setPresetId] = usePref('lp.preset', 'pop', (v) => v === 'custom' || PRESETS.some((p) => p.id === v), initialConfig?.presetId)
  const [romans, setRomans] = usePref<string[]>('lp.romans', PRESETS[1].romans, (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && !!parseRoman(x)), initialConfig?.romans)
  const [keyPc, setKeyPc] = usePref('lp.key', 0, (v) => integer(v, 0, 11), initialConfig?.keyPc)
  const [keyMinor, setKeyMinor] = usePref<boolean | null>('lp.keyMinor', null, (v) => v === null || typeof v === 'boolean', initialConfig ? initialConfig.keyMinor ?? null : undefined)
  const [bpm, setBpm] = usePref('lp.bpm', 90, (v) => integer(v, 40, 220), initialConfig?.bpm)
  const [beats, setBeats] = usePref('lp.beats', 4, (v) => BEATS.includes(v as number), initialConfig?.beats)
  const [durations, setDurations] = usePref<number[] | null>('lp.durations', null,
    (v) => v === null || Array.isArray(v) && v.length === romans.length && v.every(isChordDuration), initialConfig ? initialConfig.durations ?? null : undefined)
  const [loopSection, setLoopSection] = usePref<LoopSection | null>('lp.loopSection', null,
    (v) => v === null || validLoopSection(v, romans.length), initialConfig ? initialConfig.loopSection ?? null : undefined)
  const [countInBeats, setCountInBeats] = usePref('lp.countInBeats', 0,
    (v) => normalizeCountInBeats(v) === v, initialConfig ? initialConfig.countInBeats ?? 0 : undefined)
  const [style, setStyle] = usePref<StrumStyle>('lp.style', 'strum8', (v) => STYLES.some((s) => s.id === v), initialConfig?.style)
  const [bass, setBass] = usePref<BassMode>('lp.bass', 'root', (v) => ['off', 'root', 'root-fifth'].includes(v as string), initialConfig?.bass)
  const [drums, setDrums] = usePref<DrumMode>('lp.drums', 'basic', (v) => ['off', 'click', 'basic'].includes(v as string), initialConfig?.drums)
  const [instrument, setInstrument] = usePref<InstrumentId>('lp.inst', settings.instrument, (v) => INSTRUMENTS.some((i) => i.id === v), initialConfig?.instrument)
  const [volume, setVolume] = usePref('lp.vol', 0.8, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1, initialConfig?.volume)
  const [label, setLabel] = usePref<LabelMode>('lp.label', 'degree', (v) => ['note', 'interval', 'degree', 'none'].includes(v as string), initialConfig?.label)
  const [scaleIdx, setScaleIdx] = usePref('lp.scaleIdx', 0, (v) => integer(v, 0, Object.keys(SCALES).length - 1), initialConfig ? 0 : undefined)
  const [selectedScale, setSelectedScale] = usePref<ScaleType | null>('lp.selectedScale', null, (v) => v === null || typeof v === 'string' && Object.hasOwn(SCALES, v), initialConfig?.selectedScale)
  const [showScale, setShowScale] = usePref('lp.showScale', true, (v) => typeof v === 'boolean', initialConfig?.showScale)
  const [targetOn, setTargetOn] = usePref('lp.targetOn', false, (v) => typeof v === 'boolean', initialConfig ? initialConfig.targetOn ?? false : undefined)
  const [targetMode, setTargetMode] = usePref<TargetMode>('lp.targetMode', 'guide', (v) => ['all', 'root', 'third', 'fifth', 'seventh', 'guide'].includes(v as string), initialConfig ? initialConfig.targetMode ?? 'guide' : undefined)
  const [targetPreview, setTargetPreview] = usePref('lp.targetPreview', true, (v) => typeof v === 'boolean', initialConfig ? initialConfig.targetPreview ?? true : undefined)
  const [fretLo, setFretLo] = usePref('lp.fretLo', 0, (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 22, initialConfig ? initialConfig.fretLo ?? 0 : undefined)
  const [fretHi, setFretHi] = usePref('lp.fretHi', 15, (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 22, initialConfig ? initialConfig.fretHi ?? 15 : undefined)
  const spelling = useSpelling()
  const [typed, setTyped] = useState('')
  const [viewIdx, setViewIdx] = useState(initialConfig?.viewIdx ?? 0)

  const state = useSyncExternalStore(looper.subscribe, looper.getState)
  const preset = PRESETS.find((p) => p.id === presetId)
  const minor = keyMinor ?? preset?.minor ?? (romans.length > 0 && isMinorNumeral(romans[0]))
  const tonic = rootName(keyPc, minor)
  const noteKey = tonic + (minor ? 'm' : '')
  const firstFret = Math.min(fretLo, fretHi)
  const lastFret = Math.max(fretLo, fretHi)
  const chords: ProgChord[] = useMemo(() => progressionChords(tonic, romans), [tonic, romans])
  const fits = useMemo(() => fitScales(tonic, chords, selectedScale ?? preset?.scale), [tonic, chords, preset, selectedScale])
  const fit = fits.find((f) => f.type === selectedScale) ?? fits[Math.min(scaleIdx, fits.length - 1)] ?? fits[0]

  // Push the live config to the engine on every change.
  useEffect(() => {
    looper.setConfig({ chords: chords.map((c) => ({ root: c.root, type: c.type })), bpm, beatsPerChord: beats, durations: durations ?? undefined, loopSection, countInBeats, style, bass, drums, instrument, volume })
  }, [chords, bpm, beats, durations, loopSection, countInBeats, style, bass, drums, instrument, volume])

  // Leaving the page stops the music.
  useEffect(() => () => looper.stop(), [])
  // Keep the engine's own instrument in step for click-to-hear on the fretboard.
  useEffect(() => {
    engine.setInstrument(instrument).catch(() => undefined)
  }, [instrument])
  useEffect(() => () => {
    engine.setInstrument(settings.instrument).catch(() => undefined)
  }, [settings.instrument])

  const playing = state.status === 'playing'
  const counting = state.status === 'countIn'
  const awaitingCount = counting || state.status === 'loading' && (state.countInRemaining ?? 0) > 0
  const cur = Math.min(playing ? state.chordIndex : viewIdx, Math.max(0, chords.length - 1))
  const curChord = awaitingCount ? undefined : chords[cur]

  const choosePreset = (id: string) => {
    setKeyMinor(null)
    setPresetId(id)
    const p = PRESETS.find((x) => x.id === id)
    if (p) {
      setRomans(p.romans)
      setDurations(null)
      setLoopSection(null)
      setScaleIdx(0)
      setSelectedScale(null)
      setViewIdx(0)
      if (id === 'blues12') setBeats(4)
    }
  }
  const edit = (next: string[], resetTiming = true) => {
    if (keyMinor === null && preset) setKeyMinor(preset.minor)
    setPresetId('custom')
    setRomans(next)
    setViewIdx(0)
    if (resetTiming) {
      setDurations(null)
      setLoopSection(null)
    }
  }
  const appendChord = (roman: string) => {
    edit([...romans, roman], false)
    if (durations !== null) setDurations([...durations, beats])
  }
  const removeChord = (index: number) => {
    const next = romans.filter((_, i) => i !== index)
    edit(next, false)
    setViewIdx(Math.max(0, Math.min(viewIdx - (index < viewIdx ? 1 : 0), next.length - 1)))
    if (durations !== null) setDurations(durations.filter((_, i) => i !== index))
    if (loopSection) {
      if (!next.length) setLoopSection(null)
      else {
        const start = Math.min(loopSection.start - (index < loopSection.start ? 1 : 0), next.length - 1)
        const end = Math.min(loopSection.end - (index <= loopSection.end ? 1 : 0), next.length - 1)
        setLoopSection({ start, end: Math.max(start, end) })
      }
    }
  }
  const applyTyped = () => {
    const toks = typed.split(/[\s,\-–—]+/).filter(Boolean).filter((t) => parseRoman(t))
    if (toks.length) edit(toks)
    setTyped('')
  }

  const marks = useMemo(() => {
    if (!curChord) return []
    return targetToneMarks(curChord.root, curChord.type, showScale && fit ? fit.root : null, showScale && fit ? fit.type : null, label, targetOn ? targetMode : 'all', [firstFret, lastFret])
      .map((m) => m.computedNote ? { ...m, computedNote: { ...m.computedNote, key: noteKey } } : m)
  }, [curChord, fit, showScale, label, targetOn, targetMode, firstFret, lastFret, noteKey])
  const targetNotes = (c: ProgChord) => buildChord(c.root, c.type).flatMap((n, i) => {
    const iv = CHORDS[c.type].intervals[i]
    const d = ((parseInterval(iv).number - 1) % 7) + 1
    const selected = !targetOn || targetMode === 'all' || (targetMode === 'root' && d === 1) || (targetMode === 'third' && d === 3) || (targetMode === 'fifth' && d === 5) || (targetMode === 'seventh' && d === 7) || (targetMode === 'guide' && (d === 3 || d === 7))
    return selected ? [{ name: spelling.spellPc(pitchClass(n), { key: noteKey }), degree: intervalToDegree(iv) }] : []
  })
  const nextChord = playing && targetOn && targetPreview && state.nextChordIndex !== null ? chords[state.nextChordIndex] : undefined
  const currentTargets = curChord ? targetNotes(curChord) : []
  const nextTargets = nextChord ? targetNotes(nextChord) : []
  const missingTarget = (c: ProgChord, count: number) => {
    if (!count) return `No ${targetMode === 'guide' ? '3rd or 7th' : targetMode === 'third' ? '3rd' : targetMode === 'fifth' ? '5th' : targetMode === 'seventh' ? '7th' : targetMode} in this chord.`
    if (targetMode !== 'guide') return null
    const degrees = CHORDS[c.type].intervals.map((iv) => ((parseInterval(iv).number - 1) % 7) + 1)
    if (!degrees.includes(7)) return 'No 7th in this chord.'
    if (!degrees.includes(3)) return 'No 3rd in this chord.'
    return null
  }
  const currentNotice = curChord ? missingTarget(curChord, currentTargets.length) : null
  const nextNotice = nextChord ? missingTarget(nextChord, nextTargets.length) : null
  const presetConfig: LooperPresetConfig = { presetId, romans, keyPc, keyMinor: minor, bpm, beats, durations: durations ?? undefined, loopSection, countInBeats, style, bass, drums, instrument, volume, label, selectedScale: fit?.type ?? null, showScale, viewIdx: Math.min(viewIdx, Math.max(0, chords.length - 1)), targetOn, targetMode, targetPreview, fretLo: firstFret, fretHi: lastFret }
  const loadPreset = (c: LooperPresetConfig) => {
    engine.stop()
    setKeyMinor(c.keyMinor ?? null)
    setPresetId(c.presetId)
    setRomans(c.romans)
    setKeyPc(c.keyPc)
    setBpm(c.bpm)
    setBeats(c.beats)
    setDurations(c.durations ?? null)
    setLoopSection(c.loopSection ?? null)
    setCountInBeats(c.countInBeats ?? 0)
    setStyle(c.style)
    setBass(c.bass)
    setDrums(c.drums)
    setInstrument(c.instrument)
    setVolume(c.volume)
    setLabel(c.label)
    setSelectedScale(c.selectedScale)
    setScaleIdx(0)
    setShowScale(c.showScale)
    setViewIdx(c.viewIdx)
    setTargetOn(c.targetOn ?? false)
    setTargetMode(c.targetMode ?? 'guide')
    setTargetPreview(c.targetPreview ?? true)
    setFretLo(c.fretLo ?? 0)
    setFretHi(c.fretHi ?? 15)
    setTyped('')
  }

  return (
    <div className="tools-pane tool-workspace looper-workspace">
      <PresetControls tool="looper" config={presetConfig} onLoad={loadPreset} />
      <div className="workspace-band looper-progression">
        <div className="tools-controls">
          <Field label="Progression">
            <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {presetId === 'custom' && <option value="custom">Custom</option>}
            </select>
          </Field>
          {preset?.note && <span className="muted">{preset.note}</span>}
        </div>
        <Field label="Key">
          <RootPicker pc={keyPc} minor={minor} onChange={setKeyPc} />
        </Field>

        <div className="tools-prog" aria-label="Progression">
          {chords.map((c, i) => (
            <div key={i} className={'tools-prog-chord' + (durations !== null ? ' looper-timed' : '') + (loopSection && (i < loopSection.start || i > loopSection.end) ? ' looper-excluded' : '') + (playing && i === state.chordIndex ? ' now' : '') + (!playing && !awaitingCount && i === cur ? ' sel' : '')}>
              <button className="tools-prog-main" onClick={() => setViewIdx(i)} title="Show this chord on the fretboard">
                <small>{prettyRoman(c.roman)}</small>
                <b>{pretty(c.symbol)}</b>
              </button>
              <button className="tools-x" onClick={() => removeChord(i)} aria-label={`Remove ${c.symbol}`} title="Remove">
                <X size={14} aria-hidden />
              </button>
              {durations !== null && <div className="looper-duration"><Field label="Beats"><NumberInput aria-label={`Looper chord ${i + 1} duration`} value={durations[i]} min={0.25} max={32} step={0.25} onChange={(value) => setDurations(durations.map((duration, j) => j === i ? value : duration))} /></Field></div>}
            </div>
          ))}
          {chords.length === 0 && <span className="muted">Add chords below.</span>}
        </div>

        <details className="tools-build">
          <summary>Build your own</summary>
          {NUMERAL_PALETTE.map((g) => (
            <div key={g.group} className="tools-keyrow">
              <span className="muted tools-keyrow-name">{g.group}</span>
              <span className="tools-chips">
                {g.romans.map((r) => {
                  const one = progressionChords(tonic, [r])[0]
                  return (
                    <button key={r} className="tools-chip" onClick={() => appendChord(r)} title="Add to the end">
                      <small>{prettyRoman(r)}</small>
                      {one ? pretty(one.symbol) : r}
                    </button>
                  )
                })}
              </span>
            </div>
          ))}
          <div className="row">
            <input
              type="text"
              className="tools-search"
              placeholder="or type numerals: I vi ii7 V7"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyTyped()}
            />
            <button className="btn" onClick={applyTyped} disabled={!typed.trim()}>
              Set
            </button>
            <button className="btn ghost" onClick={() => removeChord(romans.length - 1)} disabled={!romans.length}>
              Remove last
            </button>
            <button className="btn ghost" onClick={() => edit([])} disabled={!romans.length}>
              Clear
            </button>
          </div>
        </details>
        <div className="workspace-transport looper-transport">
          {playing || counting || state.status === 'loading' ? (
            <button className="btn primary" aria-label="Stop" onClick={() => looper.stop()}><Square size={17} aria-hidden />Stop</button>
          ) : (
            <button className="btn primary" aria-label="Play loop" disabled={!chords.length} onClick={() => void looper.start()}>Play loop<Play size={17} aria-hidden /></button>
          )}
          <Field label={`Tempo: ${bpm} BPM`}>
            <input type="range" min={40} max={220} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </Field>
          <span className="muted looper-play-status" role="status" aria-live="polite">
            {state.status === 'loading' ? 'Loading sounds...' : counting ? `Count-in: ${state.countInRemaining ?? countInBeats} ${(state.countInRemaining ?? countInBeats) === 1 ? 'beat' : 'beats'} remaining` : playing ? 'Looping' : (STYLES.find((s) => s.id === style)?.hint ?? '')}
          </span>
          {state.error && <span className="tools-err">{state.error}</span>}
        </div>
      </div>


      <div className="workspace-band looper-neck">
        <h3 className="tools-h">
          Improvise over it {curChord && <span className="muted">now: <b className="tools-now">{pretty(curChord.symbol)}</b></span>}
        </h3>
        {targetOn && <div className="looper-targets" aria-label="Target tones">
          <div className="looper-target-current" aria-live="off"><b>{awaitingCount ? 'Count-in' : curChord ? pretty(curChord.symbol) : 'No chord'}</b> {currentTargets.map((n) => <span className="tools-chip static" key={n.degree}><small>{pretty(n.degree)}</small>{pretty(n.name)}</span>)}
            {currentNotice && <span className="muted">{currentNotice}</span>}
          </div>
          <div className="looper-target-next" aria-label="Upcoming chord">{nextChord && <><span className="muted">Next </span><b>{pretty(nextChord.symbol)}</b>{nextTargets.map((n) => <span className="tools-chip static" key={n.degree}><small>{pretty(n.degree)}</small>{pretty(n.name)}</span>)}{nextNotice && <span className="muted">{nextNotice}</span>}</>}</div>
        </div>}
        <div className="tools-board">
          <Fretboard marks={marks} frets={[firstFret, lastFret]} hoverNames noteContext={{ key: noteKey }} />
        </div>
        <div className="tools-controls looper-target-controls">
          <Field label="Improv mode"><Seg label="Improv mode" value={targetOn ? 'target' : 'explore'} onChange={(v) => setTargetOn(v === 'target')} options={[{ id: 'explore', label: 'All chord tones' }, { id: 'target', label: 'Target tones' }]} /></Field>
          {targetOn && <Field label="Target"><Seg<TargetMode> label="Target degree" value={targetMode} onChange={setTargetMode} options={[{ id: 'all', label: 'All' }, { id: 'root', label: 'Root' }, { id: 'third', label: '3rd' }, { id: 'fifth', label: '5th' }, { id: 'seventh', label: '7th' }, { id: 'guide', label: 'Guide tones (3rd & 7th)' }]} /></Field>}
          <Field label="First fret"><NumberInput aria-label="Looper first fret" value={firstFret} min={0} max={lastFret} onChange={(value) => { setFretLo(value); setFretHi(lastFret) }} /></Field>
          <Field label="Last fret"><NumberInput aria-label="Looper last fret" value={lastFret} min={firstFret} max={22} onChange={(value) => { setFretLo(firstFret); setFretHi(value) }} /></Field>
          {targetOn && <label className="tools-check"><input type="checkbox" checked={targetPreview} onChange={(e) => setTargetPreview(e.target.checked)} /> Next-chord preview</label>}
        </div>
        <details className="workspace-details looper-display">
          <summary>Scale and fretboard display</summary>
        <div className="tools-controls">
          <Field label="Scales that fit the whole progression">
            <span className="tools-chips">
              {fits.filter((f, i) => i < 6 || f.type === fit?.type).map((f) => (
                <button key={f.type} className={'tools-chip' + (f.type === fit?.type ? ' on' : '')} onClick={() => setSelectedScale(f.type)} title={`${Math.round(f.coverage * 100)}% of the chord tones are in this scale`}>
                  {pretty(f.root)} {SCALES[f.type].name.split(' (')[0]}
                  <small>{Math.round(f.coverage * 100)}%</small>
                </button>
              ))}
            </span>
          </Field>
        </div>
        {fit && (
          <div className="tools-facts">
            <div>
              <span className="muted">Scale notes</span> <Chips items={buildScale(fit.root, fit.type).map(noteName)} />
            </div>
            {SCALES[fit.type].feel && <div className="muted">{pretty(SCALES[fit.type].feel ?? '')}</div>}
          </div>
        )}
        <div className="tools-controls">
          <Field label="Labels">
            <Seg<LabelMode> label="Looper labels" options={[{ id: 'degree', label: 'Chord degree' }, { id: 'note', label: 'Note' }, { id: 'interval', label: 'Interval' }, { id: 'none', label: 'None' }]} value={label} onChange={setLabel} />
          </Field>
          <label className="tools-check">
            <input type="checkbox" checked={showScale} onChange={(e) => setShowScale(e.target.checked)} /> Show the scale (dashed) behind the chord tones
          </label>
        </div>
        </details>
      </div>
      <details className="workspace-details looper-sound">
        <summary>Timing and accompaniment</summary>
        <h4 className="workspace-control-heading">Timing</h4>
        <div className="tools-controls">
          <Field label={durations === null ? 'Beats per chord' : 'Default beats'}>
            <select value={beats} onChange={(e) => setBeats(Number(e.target.value))}>
              {BEATS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timing"><Seg label="Chord timing" value={durations === null ? 'uniform' : 'perChord'} options={[{ id: 'uniform', label: 'Uniform' }, { id: 'perChord', label: 'Per chord' }]} onChange={(value) => { if (value === 'uniform') setDurations(null); else if (durations === null) setDurations(romans.map(() => beats)) }} /></Field>
          <Field label="Count-in"><select aria-label="Looper count-in" value={countInBeats} onChange={(e) => setCountInBeats(Number(e.target.value))}>{COUNT_IN.map((count) => <option key={count} value={count}>{count === 0 ? 'Off' : `${count} beats`}</option>)}</select></Field>
        </div>
        <div className="tools-controls">
          <Field label="Repeat"><Seg label="Loop section" value={loopSection ? 'section' : 'whole'} options={[{ id: 'whole', label: 'Whole progression' }, { id: 'section', label: 'Selected section', disabled: !chords.length }]} onChange={(value) => { if (value === 'whole') setLoopSection(null); else if (!loopSection && chords.length) setLoopSection({ start: 0, end: chords.length - 1 }) }} /></Field>
          {loopSection && <>
            <Field label="Section start"><select aria-label="Loop section start" value={loopSection.start} onChange={(e) => { const start = Number(e.target.value); setLoopSection({ start, end: Math.max(start, loopSection.end) }); setViewIdx(start) }}>{chords.map((c, i) => <option key={i} value={i}>{i + 1}: {pretty(c.symbol)}</option>)}</select></Field>
            <Field label="Section end"><select aria-label="Loop section end" value={loopSection.end} onChange={(e) => { const end = Number(e.target.value); const start = Math.min(loopSection.start, end); setLoopSection({ start, end }); setViewIdx(start) }}>{chords.map((c, i) => <option key={i} value={i}>{i + 1}: {pretty(c.symbol)}</option>)}</select></Field>
          </>}
        </div>
        <h4 className="workspace-control-heading">Accompaniment</h4>
        <div className="tools-controls">
          <Field label="Feel">
            <select value={style} onChange={(e) => setStyle(e.target.value as StrumStyle)}>
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instrument">
            <select value={instrument} onChange={(e) => setInstrument(e.target.value as InstrumentId)}>
              {INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="tools-controls">
          <Field label="Bass">
            <Seg<BassMode> label="Bass" options={[{ id: 'off', label: 'Off' }, { id: 'root', label: 'Root' }, { id: 'root-fifth', label: 'Root-fifth' }]} value={bass} onChange={setBass} />
          </Field>
          <Field label="Drums">
            <Seg<DrumMode> label="Drums" options={[{ id: 'off', label: 'Off' }, { id: 'click', label: 'Click' }, { id: 'basic', label: 'Drums' }]} value={drums} onChange={setDrums} />
          </Field>
          <Field label="Volume">
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </Field>
        </div>
      </details>
    </div>
  )
}
