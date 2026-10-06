import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Play, Redo2, Repeat2, RotateCcw, Search, Square, Undo2 } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import { ChordDiagram } from '@/components/ChordDiagram'
import { shapeMarks } from '@/content/helpers'
import { useProgress } from '@/state/progress'
import { buildChord, CHORDS } from '@/theory/chords'
import { noteName, pretty } from '@/theory/notes'
import type { DictView } from './keyDictionary'
import { keyTonic, prettyRoman } from './progressions'
import { bestVoicing } from './voicings'
import { voicingFor } from './looper'
import { Chips, Field, NumberInput, RootPicker, Seg, useEngineReady, usePref } from './ui'
import { DEFAULT_REHARM, REHARM_PRESETS, parseReharmInput, reharmChords, reharmLooperConfig, suggestReharmonisations, validReharmConfig, type ReharmConfig, type ReharmProgression, type ReharmSuggestion } from './reharmonisation'
import { reharmonisationPlayer as player, type ReharmPlaybackStep } from './reharmonisationPlayer'
import type { ToolLaunch } from './toolLaunch'
import './reharmonisation.css'
import './workspacePolish.css'

type Side = 'original' | 'working'
const clone = (p: ReharmProgression): ReharmProgression => ({ romans: [...p.romans], durations: [...p.durations] })
const equal = (a: ReharmProgression, b: ReharmProgression) => JSON.stringify(a) === JSON.stringify(b)
const TECHNIQUES = [
  { id: 'all', label: 'All' }, { id: 'tritone', label: 'Tritone subs' },
  { id: 'secondary', label: 'Secondary dominants' }, { id: 'borrowed', label: 'Borrowed chords' }, { id: 'twoFive', label: 'ii-V' }
] as const
const techniqueName = (kind: ReharmSuggestion['kind']) => TECHNIQUES.find((t) => t.id === kind)!.label
const inputText = (c: ReharmConfig) => c.inputMode === 'romans' ? c.original.romans.join(' ') : reharmChords(c.keyPc, c.minor, c.original).map((chord) => chord.symbol).join(' ')

export function ReharmonisationTab({ initialConfig, onToolLaunch, onDictionaryEntry }: { initialConfig?: ReharmConfig; onToolLaunch: (launch: ToolLaunch) => void; onDictionaryEntry: (entry: DictView) => void }) {
  const { settings } = useProgress()
  const ready = useEngineReady()
  const boardRef = useRef<HTMLDivElement>(null)
  const [config, setConfig] = usePref<ReharmConfig>('reharmonisation.config', DEFAULT_REHARM, validReharmConfig, initialConfig)
  const [draft, setDraft] = useState(() => inputText(config))
  const [newBeats, setNewBeats] = useState(config.original.durations[0])
  const [beatsEdited, setBeatsEdited] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [undo, setUndo] = useState<ReharmProgression[]>([])
  const [redo, setRedo] = useState<ReharmProgression[]>([])
  const [technique, setTechnique] = useState<typeof TECHNIQUES[number]['id']>('all')
  const [target, setTarget] = useState<number | null>(null)
  const [limit, setLimit] = useState(12)
  const [selected, setSelected] = useState<{ side: Side; index: number }>({ side: 'working', index: 0 })
  const [lastChange, setLastChange] = useState<{ indices: number[]; explanation: string } | null>(null)
  const state = useSyncExternalStore(player.subscribe, player.getState)
  const dirty = draft !== inputText(config) || beatsEdited
  const changed = !equal(config.original, config.working)
  const tonic = keyTonic(config.keyPc, config.minor)
  const originalChords = useMemo(() => reharmChords(config.keyPc, config.minor, config.original), [config.keyPc, config.minor, config.original])
  const workingChords = useMemo(() => reharmChords(config.keyPc, config.minor, config.working), [config.keyPc, config.minor, config.working])
  const suggestions = useMemo(() => suggestReharmonisations(config), [config])
  const filtered = suggestions.filter((s) => (technique === 'all' || s.kind === technique) && (target === null || s.index === target))
  const focus = state.status === 'playing' && state.side && state.index >= 0 ? { side: state.side, index: state.index } : selected
  const focusChords = focus.side === 'original' ? originalChords : workingChords
  const currentIndex = Math.min(focus.index, focusChords.length - 1)
  const current = focusChords[currentIndex]
  const shape = useMemo(() => {
    if (!current) return null
    try { return bestVoicing(current.root, current.type) } catch { return null }
  }, [current])
  const marks = useMemo(() => shape && current ? shapeMarks(shape, current.root, 'note').map((m) => m.computedNote ? { ...m, computedNote: { ...m.computedNote, key: tonic + (config.minor ? 'm' : '') } } : m) : [], [shape, current, tonic, config.minor])
  const fretHi = shape ? Math.max(12, ...shape.frets.map((f) => f ?? 0)) : 12

  useEffect(() => () => player.stop(), [])
  useEffect(() => { engine.stop() }, [settings.instrument])
  useEffect(() => { setLimit(12) }, [technique, target, config.working])
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const centreBoard = () => {
      const cells = marks.flatMap((mark) => {
        const cell = board.querySelector(`[data-string="${mark.string}"][data-fret="${mark.fret}"]`)
        return cell ? [cell.getBoundingClientRect()] : []
      })
      if (!cells.length) return
      const centre = (Math.min(...cells.map((cell) => cell.left)) + Math.max(...cells.map((cell) => cell.right))) / 2
      board.scrollLeft += centre - board.getBoundingClientRect().left - board.clientWidth / 2
    }
    centreBoard()
    const observer = new ResizeObserver(centreBoard)
    observer.observe(board)
    return () => observer.disconnect()
  }, [marks, settings.leftHanded])

  const change = (next: ReharmConfig, refreshDraft = false) => {
    engine.stop()
    setConfig(next)
    setInputError(null)
    if (refreshDraft) { setDraft(inputText(next)); setNewBeats(next.original.durations[0]); setBeatsEdited(false) }
  }
  const replaceSource = (next: ReharmConfig) => {
    change(next, true)
    setUndo([]); setRedo([]); setLastChange(null); setTarget(null); setSelected({ side: 'working', index: 0 })
  }
  const setProgression = () => {
    if (!dirty) return
    engine.stop()
    const parsed = parseReharmInput(draft, config.inputMode, config.keyPc, config.minor, newBeats)
    if (!parsed.progression) { setInputError(parsed.error); return }
    replaceSource({ ...config, original: clone(parsed.progression), working: clone(parsed.progression) })
  }
  const apply = (s: ReharmSuggestion) => {
    const live = suggestions.find((candidate) => candidate.id === s.id)
    if (!live || dirty) return
    setUndo((history) => [...history.slice(-29), clone(config.working)])
    setRedo([])
    change({ ...config, working: clone(live.result) })
    setLastChange({ indices: [...live.changedIndices], explanation: live.explanation })
    setSelected({ side: 'working', index: live.changedIndices[0] })
    setTarget(null)
  }
  const restore = (direction: 'undo' | 'redo') => {
    const history = direction === 'undo' ? undo : redo
    const next = history.at(-1)
    if (!next) return
    if (direction === 'undo') { setUndo(history.slice(0, -1)); setRedo((h) => [...h.slice(-29), clone(config.working)]) }
    else { setRedo(history.slice(0, -1)); setUndo((h) => [...h.slice(-29), clone(config.working)]) }
    change({ ...config, working: clone(next) })
    setLastChange(null); setTarget(null); setSelected({ side: 'working', index: 0 })
  }
  const steps = (side: Side): ReharmPlaybackStep[] => (side === 'original' ? originalChords : workingChords).map((chord, index) => ({ notes: voicingFor(chord), beats: config[side].durations[index], side, index }))
  const play = (which: Side | 'both') => {
    if (dirty) return
    const sequence = which === 'both' ? [...steps('original'), { notes: [], beats: 1, side: null, index: -1 } as ReharmPlaybackStep, ...steps('working')] : steps(which)
    void player.start(sequence, config.bpm, config.mode, settings.instrument)
  }
  const hearChord = (side: Side, index: number) => {
    if (dirty) return
    setSelected({ side, index })
    void player.start([steps(side)[index]], config.bpm, config.mode, settings.instrument)
  }

  return <div className="tools-pane tool-workspace reharm-pane">
    <h2>Reharmonisation</h2>
    <div className="tools-controls reharm-source-controls">
      <Field label="Starting progression"><select aria-label="Reharmonisation preset" value={REHARM_PRESETS.find((p) => p.minor === config.minor && JSON.stringify(p.romans) === JSON.stringify(config.original.romans))?.id ?? 'custom'} onChange={(e) => {
        const preset = REHARM_PRESETS.find((p) => p.id === e.target.value)
        if (preset) { const source = { romans: [...preset.romans], durations: preset.romans.map(() => 4) }; replaceSource({ ...config, minor: preset.minor, original: clone(source), working: clone(source) }) }
      }}><option value="custom" disabled>Custom</option>{REHARM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Key centre"><RootPicker label="Reharmonisation key" pc={config.keyPc} minor={config.minor} onChange={(keyPc) => { change({ ...config, keyPc }, true); setLastChange(null) }} /></Field>
      <Field label="Tonality"><Seg label="Reharmonisation tonality" value={config.minor ? 'minor' : 'major'} options={[{ id: 'major', label: 'Major' }, { id: 'minor', label: 'Minor' }]} onChange={(value) => { change({ ...config, minor: value === 'minor' }, true); setLastChange(null) }} /></Field>
    </div>
    <details className="workspace-details reharm-source-editor">
    <summary>Edit original progression</summary>
    <form className="reharm-input" onSubmit={(e) => { e.preventDefault(); setProgression() }}>
      <div className="tools-controls">
        <Field label="Input"><Seg label="Progression input format" value={config.inputMode} options={[{ id: 'romans', label: 'Roman numerals' }, { id: 'names', label: 'Chord symbols' }]} onChange={(inputMode) => change({ ...config, inputMode }, true)} /></Field>
        <Field label="New chord beats"><NumberInput aria-label="New progression chord beats" min={0.25} max={32} step={0.25} value={newBeats} onChange={(value) => { engine.stop(); setNewBeats(value); setBeatsEdited(true); setInputError(null) }} /></Field>
      </div>
      <label className="reharm-draft-label" htmlFor="reharm-progression">Original progression</label>
      <div className="reharm-entry-row"><input id="reharm-progression" aria-label="Reharmonisation progression" value={draft} aria-invalid={!!inputError} aria-describedby={inputError ? 'reharm-input-error' : undefined} onChange={(e) => { engine.stop(); setDraft(e.target.value); setInputError(null) }} /><button className="btn" type="submit" disabled={!dirty}><Check size={16} aria-hidden />Set progression</button></div>
      {inputError && <p className="tools-err" id="reharm-input-error" role="alert">{inputError}</p>}
      {dirty && !inputError && <p className="muted reharm-draft-status" role="status">Unapplied changes</p>}
    </form>
    </details>

    <div className="reharm-playback">
      <div className="tools-controls">
        <Field label="Tempo"><NumberInput aria-label="Reharmonisation tempo" min={40} max={220} value={config.bpm} onChange={(bpm) => change({ ...config, bpm })} /></Field>
        <Field label="Sound"><Seg label="Reharmonisation playback mode" value={config.mode} options={[{ id: 'block', label: 'Chord' }, { id: 'strum', label: 'Strum' }, { id: 'arpeggio', label: 'Arpeggio' }]} onChange={(mode) => change({ ...config, mode })} /></Field>
      </div>
      <div className="row reharm-transport">
        <button className="btn" disabled={dirty} onClick={() => play('original')}><Play size={16} aria-hidden />Before</button>
        <button className="btn" disabled={dirty} onClick={() => play('working')}><Play size={16} aria-hidden />After</button>
        <button className="btn" disabled={dirty} onClick={() => play('both')}><Play size={16} aria-hidden />Before then after</button>
        <button className="btn ghost reharm-icon" disabled={state.status === 'stopped'} aria-label="Stop reharmonisation playback" title="Stop playback" onClick={player.stop}><Square size={16} aria-hidden /></button>
        <button className="btn primary" disabled={dirty} onClick={() => { engine.stop(); onToolLaunch({ tab: 'looper', config: reharmLooperConfig(config, 'working', settings.instrument) }) }}><Repeat2 size={16} aria-hidden />Send to Looper</button>
      </div>
      <div className="reharm-status muted" role="status" aria-live="polite">{state.status === 'loading' ? 'Loading sounds...' : state.status === 'playing' ? state.side ? `Playing ${state.side === 'original' ? 'before' : 'after'}${state.index >= 0 ? `: chord ${state.index + 1}` : ''}` : 'Comparison gap' : ''}</div>
      {state.error && <p className="tools-err" role="alert">{state.error}</p>}
    </div>

    {(['original', 'working'] as const).map((side) => <section className="reharm-sequence" key={side} aria-label={side === 'original' ? 'Original progression' : 'Reharmonised progression'} data-side={side}>
      <div className="reharm-row-heading"><h3>{side === 'original' ? 'Before' : 'After'} <span className="muted">{pretty(tonic)} {config.minor ? 'minor' : 'major'}</span></h3><span className="muted">{config[side].durations.reduce((sum, beats) => sum + beats, 0)} beats</span>
        {side === 'working' && <div className="reharm-history">
          <button className="btn ghost reharm-icon" disabled={!undo.length || dirty} aria-label="Undo reharmonisation" title="Undo change" onClick={() => restore('undo')}><Undo2 size={17} aria-hidden /></button>
          <button className="btn ghost reharm-icon" disabled={!redo.length || dirty} aria-label="Redo reharmonisation" title="Redo change" onClick={() => restore('redo')}><Redo2 size={17} aria-hidden /></button>
          <button className="btn ghost" disabled={!changed || dirty} onClick={() => { setUndo((h) => [...h.slice(-29), clone(config.working)]); setRedo([]); change({ ...config, working: clone(config.original) }); setLastChange(null); setTarget(null); setSelected({ side: 'working', index: 0 }) }}><RotateCcw size={16} aria-hidden />Reset to original</button>
        </div>}
      </div>
      <ol className="reharm-chords">{(side === 'original' ? originalChords : workingChords).map((chord, index) => <li key={index} className={'reharm-chord' + (state.status === 'playing' && state.side === side && state.index === index ? ' sounding' : '') + (focus.side === side && currentIndex === index ? ' selected' : '') + (side === 'working' && lastChange?.indices.includes(index) ? ' changed' : '')}>
        <button className="reharm-chord-select" aria-pressed={focus.side === side && currentIndex === index} aria-label={`Inspect ${side === 'original' ? 'before' : 'after'} chord ${index + 1}: ${pretty(chord.symbol)}`} onClick={() => { engine.stop(); setSelected({ side, index }) }}><small>{index + 1}. {prettyRoman(chord.roman)}</small><b>{pretty(chord.symbol)}</b><span>{config[side].durations[index]} beats</span></button>
        <button className="btn ghost reharm-icon" disabled={dirty} aria-label={`Hear ${side === 'original' ? 'before' : 'after'} chord ${index + 1}: ${pretty(chord.symbol)}`} title={`Hear ${pretty(chord.symbol)}`} onClick={() => hearChord(side, index)}><Play size={14} aria-hidden /></button>
      </li>)}</ol>
    </section>)}
    {lastChange && <p className="reharm-explanation" role="status">{pretty(lastChange.explanation)}</p>}

    {current && <section className="reharm-inspector" aria-label="Selected reharmonisation chord">
      <div className="reharm-row-heading"><h3>{pretty(current.symbol)} <span className="muted">{CHORDS[current.type].name}</span></h3><button className="btn ghost" aria-label="Open reharmonisation chord in dictionary" onClick={() => { engine.stop(); onDictionaryEntry({ kind: 'chord', root: current.root, type: current.type }) }}><Search size={16} aria-hidden />Dictionary</button></div>
      {shape ? <div ref={boardRef} className="tools-board" onClickCapture={() => engine.stop()} onKeyDownCapture={(e) => { if (e.key === 'Enter' || e.key === ' ') engine.stop() }}><Fretboard marks={marks} frets={[0, fretHi]} playable={ready === 'ready'} ariaLabel={`${pretty(current.symbol)} guitar voicing`} noteContext={{ key: tonic + (config.minor ? 'm' : '') }} /></div> : <p className="muted">No compact guitar shape; playback uses the chord tones.</p>}
      <div className="reharm-tone-detail">{shape && <ChordDiagram shape={{ ...shape, name: current.symbol }} playable={false} />}<div><span className="muted">Chord tones</span><Chips items={buildChord(current.root, current.type).map(noteName)} /><p className="muted">{CHORDS[current.type].formula}</p><button className="btn ghost" disabled={dirty} onClick={() => hearChord(focus.side, currentIndex)}><Play size={16} aria-hidden />Hear chord</button></div></div>
    </section>}

    <section className="reharm-suggestions" aria-label="Reharmonisation suggestions">
      <div className="reharm-row-heading"><h3>Suggestions</h3><span className="muted">{filtered.length}</span></div>
      <div className="tools-controls"><Field label="Technique"><Seg label="Reharmonisation technique" value={technique} options={[...TECHNIQUES]} onChange={setTechnique} /></Field>
        <Field label="Chord"><select aria-label="Suggestion chord" value={target ?? 'all'} onChange={(e) => setTarget(e.target.value === 'all' ? null : Number(e.target.value))}><option value="all">All chords</option>{workingChords.map((chord, index) => <option key={index} value={index}>{index + 1}: {pretty(chord.symbol)}</option>)}</select></Field>
      </div>
      {!filtered.length && <p className="muted">No matching substitutions for this progression and timing.</p>}
      <ul className="reharm-suggestion-list">{filtered.slice(0, limit).map((s) => <li key={s.id} data-kind={s.kind} data-index={s.index}>
        <div><span className="reharm-technique muted">{techniqueName(s.kind)} · chord {s.index + 1}</span><h4>{pretty(s.title)}</h4><p>{pretty(s.explanation)}</p></div>
        <button className="btn" disabled={dirty} aria-label={`Apply ${techniqueName(s.kind)} at chord ${s.index + 1}: ${pretty(s.title)}`} onClick={() => apply(s)}><Check size={16} aria-hidden />Apply</button>
      </li>)}</ul>
      {filtered.length > limit && <button className="btn ghost" onClick={() => setLimit(limit + 12)}>Show more</button>}
    </section>

  </div>
}
