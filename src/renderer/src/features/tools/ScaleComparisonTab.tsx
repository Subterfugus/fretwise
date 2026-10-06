import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Play, Square, Volume2 } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import { pretty } from '@/theory/notes'
import { SCALES, type ScaleType } from '@/theory/scales'
import { useSpelling } from '@/state/useSpelling'
import { useProgress } from '@/state/progress'
import { SCALE_CATEGORIES } from './catalog'
import { isMinorish } from './names'
import { Field, NumberInput, RootPicker, useEngineReady, usePref } from './ui'
import { COMPARISON_PAIRS, DEFAULT_COMPARISON, compareScales, comparisonMarks, comparisonRootB, comparisonSameRoot, comparisonPreset, swapComparison, comparisonRootMidi, comparisonTonicSequence, comparisonPlaybackSequence, validComparisonConfig, type ComparisonConfig, type ComparisonGroup } from './scaleComparison'
import './scaleComparison.css'
import './workspacePolish.css'

const GROUP_LABELS: Record<ComparisonGroup, string> = { shared: 'Shared', a: 'A only', b: 'B only' }
const SelectScale = ({ side, value, onChange }: { side: 'A' | 'B'; value: ScaleType; onChange: (s: ScaleType) => void }) =>
  <Field label={`Scale ${side}`}><select aria-label={`Scale ${side}`} value={value} onChange={(e) => onChange(e.target.value as ScaleType)}>
    {SCALE_CATEGORIES.map((category) => <optgroup key={category.name} label={category.name}>
      {category.types.map((type) => <option key={type} value={type}>{SCALES[type].name}</option>)}
    </optgroup>)}
  </select></Field>

export function ScaleComparisonTab() {
  const ready = useEngineReady()
  const { settings } = useProgress()
  const { spellPc, spellMidi } = useSpelling()
  const [config, setConfig] = usePref<ComparisonConfig>('comparison.config', DEFAULT_COMPARISON, validComparisonConfig)
  const [playing, setPlaying] = useState<'a' | 'b' | 'tonic-a' | 'tonic-b' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)
  const rootBPc = comparisonRootB(config), sameRoot = comparisonSameRoot(config)
  const comparison = useMemo(() => compareScales(config.rootPc, config.a, config.b, rootBPc), [config.rootPc, config.a, config.b, rootBPc])
  const marks = useMemo(() => comparisonMarks(comparison, config), [comparison, config.view, config.labels, config.frets])
  const pair = COMPARISON_PAIRS.find((p) => p.a === config.a && p.b === config.b && (rootBPc - config.rootPc + 12) % 12 === (p.rootBOffset ?? 0))?.id ?? 'custom'
  const root = comparison.root
  const nameA = `${pretty(comparison.rootA)} ${SCALES[config.a].name}`, nameB = `${pretty(comparison.rootB)} ${SCALES[config.b].name}`

  useEffect(() => {
    const remove = engine.registerStopHandler(() => { run.current++; setPlaying(null) })
    return () => { remove(); run.current++; engine.stop() }
  }, [])
  useEffect(() => { engine.stop() }, [settings.instrument])
  const change = (partial: Partial<ComparisonConfig>) => { engine.stop(); setError(null); setConfig({ ...config, ...partial }) }
  const changeRoot = (side: 'a' | 'b', pc: number) => change(sameRoot ? { rootPc: pc, rootBPc: pc } : side === 'a' ? { rootPc: pc } : { rootBPc: pc })
  const changeFret = (index: 0 | 1, fret: number) => {
    change({ frets: index === 0 ? [fret, Math.max(fret, config.frets[1])] : [Math.min(fret, config.frets[0]), fret] })
  }
  const play = async (which: 'a' | 'b' | 'both' | 'tonic-a' | 'tonic-b') => {
    engine.stop()
    const mine = ++run.current
    setError(null)
    try {
      if (which === 'tonic-a' || which === 'tonic-b') {
        const side = which === 'tonic-a' ? 'a' : 'b'
        setPlaying(which)
        await engine.playSequence(comparisonTonicSequence(side === 'a' ? config.rootPc : rootBPc, config[side], config.octave), config.bpm)
      } else {
        const sides: ('a' | 'b')[] = which === 'both' ? ['a', 'b'] : [which]
        for (let i = 0; i < sides.length; i++) {
          if (mine !== run.current) return
          setPlaying(sides[i])
          const side = sides[i]
          await engine.playSequence(comparisonPlaybackSequence(side === 'a' ? config.rootPc : rootBPc, config[side], config.octave, config.upAndBack, config.tonicReference ?? false), config.bpm)
          if (mine !== run.current) return
          if (i < sides.length - 1) await engine.wait(0.6)
        }
      }
    } catch {
      if (mine === run.current) setError('Sound could not be played.')
    } finally { if (mine === run.current) setPlaying(null) }
  }
  const summary = comparison.onlyA.length === 0 && comparison.onlyB.length === 0 ? config.rootPc === rootBPc ? 'Same pitches and tonic.' : 'Same pitches; different tonics and degrees.' :
    comparison.onlyA.length === 0 ? 'A is contained in B.' : comparison.onlyB.length === 0 ? 'B is contained in A.' : `${comparison.shared.length} shared pitches; ${comparison.onlyA.length + comparison.onlyB.length} distinct pitches.`

  return <div className="tools-pane tool-workspace sc-pane">
    <h2>Scale Comparison</h2>
    <div className="tools-controls sc-pickers">
      <div className="sc-side-picker">
        <SelectScale side="A" value={config.a} onChange={(a) => change({ a })} />
        <Field label="Root A"><RootPicker label="Root A" minor={isMinorish(SCALES[config.a].intervals)} pc={config.rootPc} onChange={(pc) => changeRoot('a', pc)} /></Field>
      </div>
      <button className="btn ghost sc-swap" aria-label="Swap scales and roots" title="Swap scales and roots" onClick={() => change(swapComparison(config))}><ArrowLeftRight size={18} aria-hidden /></button>
      <div className="sc-side-picker">
        <SelectScale side="B" value={config.b} onChange={(b) => change({ b })} />
        <Field label="Root B"><RootPicker label="Root B" minor={isMinorish(SCALES[config.b].intervals)} pc={rootBPc} onChange={(pc) => changeRoot('b', pc)} /></Field>
      </div>
    </div>
    <div className="tools-controls sc-preset-controls">
      <label className="tools-check"><input type="checkbox" checked={sameRoot} onChange={(e) => change({ sameRoot: e.target.checked, rootBPc: e.target.checked ? config.rootPc : rootBPc })} />Same root</label>
      <Field label="Quick comparison"><select aria-label="Quick comparison" value={pair} onChange={(e) => {
        const next = COMPARISON_PAIRS.find((p) => p.id === e.target.value)
        if (next) change(comparisonPreset(config, next.id))
      }}><option value="custom" disabled>Custom</option>{COMPARISON_PAIRS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
    </div>
    <div className="sc-scales">
      {(['a', 'b'] as const).map((side) => <section key={side} className={`sc-scale sc-${side}`} aria-label={`Scale ${side.toUpperCase()} notes`}>
        <h3><span>{side.toUpperCase()}</span>{side === 'a' ? nameA : nameB}</h3>
        <div className="sc-tone-list">{(side === 'a' ? comparison.tonesA : comparison.tonesB).map((tone) => {
          const group = comparison.pitches.find((p) => p.pc === tone.pc)!.group
          return <span key={tone.pc} className={`sc-tone sc-${group}`}><b>{pretty(tone.note)}</b><small>{tone.degree}</small></span>
        })}</div>
        <p className="muted">{SCALES[config[side]].feel}</p>
      </section>)}
    </div>
    <div className="tools-controls sc-board-controls">
      <Field label="View"><select aria-label="Comparison view" value={config.view} onChange={(e) => change({ view: e.target.value as ComparisonConfig['view'] })}>
        <option value="overlay">Overlay</option><option value="differences">Differences only</option><option value="a">Scale A</option><option value="b">Scale B</option>
      </select></Field>
      <Field label="Labels"><select aria-label="Comparison labels" value={config.labels} onChange={(e) => change({ labels: e.target.value as ComparisonConfig['labels'] })}>
        <option value="note">Notes</option><option value="a">Degrees of A</option><option value="b">Degrees of B</option><option value="none">None</option>
      </select></Field>
      <Field label="From fret"><NumberInput aria-label="From fret" className="tools-num" min={0} max={22} value={config.frets[0]} onChange={(fret) => changeFret(0, fret)} /></Field>
      <Field label="To fret"><NumberInput aria-label="To fret" className="tools-num" min={0} max={22} value={config.frets[1]} onChange={(fret) => changeFret(1, fret)} /></Field>
    </div>
    <div className="sc-legend" aria-label="Pitch membership">
      {(['shared', 'a', 'b'] as const).map((group) => <span key={group}><i className={`sc-swatch sc-${group}`} aria-hidden />{GROUP_LABELS[group]} <b>{group === 'shared' ? comparison.shared.length : group === 'a' ? comparison.onlyA.length : comparison.onlyB.length}</b></span>)}
      <span><i className="sc-tonic-ring sc-tonic-a" aria-hidden />Tonic A: {pretty(comparison.rootA)}</span>
      <span><i className="sc-tonic-ring sc-tonic-b" aria-hidden />Tonic B: {pretty(comparison.rootB)}</span>
      {config.rootPc === rootBPc && <span><i className="sc-tonic-ring sc-tonic-both" aria-hidden />Tonic A and B</span>}
    </div>
    <div className={'tools-board sc-board' + (config.frets[1] - config.frets[0] > 15 ? ' sc-wide' : '')} onClickCapture={() => engine.stop()} onKeyDownCapture={(e) => { if (e.key === 'Enter' || e.key === ' ') engine.stop() }}>
      <Fretboard marks={marks} frets={config.frets} playable={ready === 'ready'} hoverNames noteContext={{ key: root }} ariaLabel={`Scale comparison: ${nameA} and ${nameB}`} />
    </div>
    {config.view === 'differences' && comparison.onlyA.length + comparison.onlyB.length === 0 && <p className="sc-notice" role="status">No different pitches in these scales.</p>}
    {marks.length === 0 && !(config.view === 'differences' && comparison.onlyA.length + comparison.onlyB.length === 0) && <p className="sc-notice" role="status">No matching notes in this fret range.</p>}
    <section className="sc-audio" aria-label="Scale playback">
      <div className="tools-controls">
        <Field label="Tempo"><NumberInput aria-label="Playback tempo" className="tools-num" min={60} max={180} value={config.bpm} onChange={(bpm) => change({ bpm })} /></Field>
        <Field label="Tonic octave"><select aria-label="Tonic octave" value={config.octave} onChange={(e) => change({ octave: Number(e.target.value) })}>{[2, 3, 4].map((octave) => <option key={octave} value={octave}>{octave}: A {spellMidi(comparisonRootMidi(config.rootPc, octave), { key: comparison.rootA })} / B {spellMidi(comparisonRootMidi(rootBPc, octave), { key: comparison.rootB })}</option>)}</select></Field>
        <label className="tools-check"><input type="checkbox" checked={config.upAndBack} onChange={(e) => change({ upAndBack: e.target.checked })} />Up and back</label>
        <label className="tools-check"><input type="checkbox" checked={config.tonicReference ?? false} onChange={(e) => change({ tonicReference: e.target.checked })} />Tonic reference before each scale</label>
      </div>
      <div className="sc-play-buttons">
        <button className="btn sc-play-a" disabled={ready !== 'ready'} onClick={() => play('a')}><Play size={16} aria-hidden />Play A</button>
        <button className="btn sc-play-b" disabled={ready !== 'ready'} onClick={() => play('b')}><Play size={16} aria-hidden />Play B</button>
        <button className="btn" disabled={ready !== 'ready'} onClick={() => play('both')}><Play size={16} aria-hidden />A then B</button>
        <button className="btn ghost" disabled={ready !== 'ready'} onClick={() => play('tonic-a')}><Volume2 size={16} aria-hidden />Tonic A</button>
        <button className="btn ghost" disabled={ready !== 'ready'} onClick={() => play('tonic-b')}><Volume2 size={16} aria-hidden />Tonic B</button>
        <button className="btn ghost sc-stop" aria-label="Stop playback" title="Stop playback" disabled={!playing} onClick={() => engine.stop()}><Square size={17} aria-hidden /></button>
      </div>
      <div className="sc-play-status muted" role="status" aria-live="polite">{ready === 'loading' ? 'Loading sounds...' : ready === 'error' ? 'Sounds unavailable' : playing ? `Playing ${playing.startsWith('tonic-') ? 'tonic ' + playing.slice(-1).toUpperCase() : playing.toUpperCase()}: ${playing === 'a' || playing === 'tonic-a' ? nameA : nameB}` : ''}</div>
      {error && <p className="tools-err" role="alert">{error}</p>}
    </section>
    <section className="sc-breakdown" aria-label="Pitch comparison">
      <div className="sc-breakdown-heading"><h3>Pitch comparison</h3><span className="muted">{summary}</span></div>
      <div className="sc-table-wrap"><table>
        <thead><tr><th>Pitch</th><th>A: {nameA}</th><th>B: {nameB}</th><th>Membership</th></tr></thead>
        <tbody>{comparison.pitches.map((pitch) => <tr key={pitch.pc} data-pc={pitch.pc} data-group={pitch.group}>
          <th scope="row">{pretty(spellPc(pitch.pc, { key: root }))}</th>
          <td>{pitch.a ? <>{pretty(pitch.a.note)} <span className="muted">/ {pitch.a.degree}</span></> : '-'}</td>
          <td>{pitch.b ? <>{pretty(pitch.b.note)} <span className="muted">/ {pitch.b.degree}</span></> : '-'}</td>
          <td><span className="sc-membership"><i className={`sc-swatch sc-${pitch.group}`} aria-hidden />{GROUP_LABELS[pitch.group]}</span></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>
}
