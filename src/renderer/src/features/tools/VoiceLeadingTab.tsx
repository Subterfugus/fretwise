import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Minus, Play, Square } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import type { FretMark } from '@/content/types'
import { useProgress } from '@/state/progress'
import { useSpelling } from '@/state/useSpelling'
import { CHORDS, chordSymbol } from '@/theory/chords'
import { shapeMidis } from '@/theory/guitar'
import { pretty } from '@/theory/notes'
import type { DictView } from './keyDictionary'
import { rootName } from './names'
import { prettyRoman, progressionChords } from './progressions'
import { Field, NumberInput, RootPicker, Seg, usePref } from './ui'
import { DEFAULT_VOICE_LEADING, VOICE_LEADING_PRESETS, VOICE_LEADING_STRING_SETS, parseVoiceLeadingInput, validVoiceLeadingConfig, type VoiceLeadingConfig } from './voiceLeadingConfig'
import { voiceLeadingCandidates, voiceLeadingPath, voiceLeadingTransition } from './voiceLeading'
import { voiceLeadingPlayer } from './voiceLeadingPlayer'
import { fretText, voicingTones } from './voicingView'
import type { LibraryVoicing } from './chordLibrary'
import './voiceLeading.css'
import './workspacePolish.css'

export function VoiceLeadingTab({ onDictionaryEntry, initialConfig }: { onDictionaryEntry: (entry: DictView) => void; initialConfig?: VoiceLeadingConfig }) {
  const { settings } = useProgress()
  const spelling = useSpelling()
  const [config, setConfig] = usePref<VoiceLeadingConfig>('voiceLeading.config', DEFAULT_VOICE_LEADING, validVoiceLeadingConfig, initialConfig)
  const [draft, setDraft] = useState(config.romans.join(' '))
  const [inputError, setInputError] = useState<string | null>(null)
  const [viewIdx, setViewIdx] = useState(0)
  const [playOffset, setPlayOffset] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const state = useSyncExternalStore(voiceLeadingPlayer.subscribe, voiceLeadingPlayer.getState)
  const tonic = rootName(config.keyPc, config.minor)
  const noteKey = tonic + (config.minor ? 'm' : '')
  const chords = useMemo(() => progressionChords(tonic, config.romans), [tonic, config.romans])
  const strings = VOICE_LEADING_STRING_SETS.find((s) => s.id === config.stringSet)!.strings
  const options = useMemo(() => ({ strings, fretRange: config.frets, startId: config.startId ?? undefined }), [strings, config.frets, config.startId])
  const path = useMemo(() => voiceLeadingPath(chords, options), [chords, options])
  const starts = useMemo(() => chords[0] ? voiceLeadingCandidates(chords[0], options) : [], [chords, options])
  const active = state.status !== 'stopped'
  const currentIndex = Math.min(state.status === 'playing' && state.index >= 0 ? playOffset + state.index : viewIdx, Math.max(0, path.voicings.length - 1))
  const current = path.voicings[currentIndex]
  const next = path.voicings[currentIndex + 1]
  const transition = useMemo(() => current && next ? voiceLeadingTransition(current, next) : null, [current, next])
  const currentTones = useMemo(() => current ? voicingTones(chords[currentIndex].root, current.type, current.shape) : [], [current, chords, currentIndex])
  const nextTones = useMemo(() => next ? voicingTones(chords[currentIndex + 1].root, next.type, next.shape) : [], [next, chords, currentIndex])

  useEffect(() => () => voiceLeadingPlayer.stop(), [])
  useEffect(() => { engine.stop() }, [settings.instrument])
  useEffect(() => {
    if (state.status === 'playing' && state.index >= 0) setViewIdx(playOffset + state.index)
  }, [state.status, state.index, playOffset])
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const centreBoard = () => {
      const cells = [...currentTones, ...nextTones].flatMap((t) => {
        const cell = board.querySelector(`[data-string="${t.string}"][data-fret="${t.fret}"]`)
        return cell ? [cell.getBoundingClientRect()] : []
      })
      if (!cells.length) return
      const centre = (Math.min(...cells.map((c) => c.left)) + Math.max(...cells.map((c) => c.right))) / 2
      board.scrollLeft += centre - board.getBoundingClientRect().left - board.clientWidth / 2
    }
    centreBoard()
    const observer = new ResizeObserver(centreBoard)
    observer.observe(board)
    return () => observer.disconnect()
  }, [currentTones, nextTones, settings.leftHanded, config.frets])

  const change = (partial: Partial<VoiceLeadingConfig>, resetPath = false) => {
    engine.stop()
    setConfig({ ...config, ...partial, ...(resetPath ? { startId: null } : {}) })
    setViewIdx(0)
    setInputError(null)
  }
  const select = (i: number) => { engine.stop(); setViewIdx(i) }
  const choosePreset = (id: string) => {
    const preset = VOICE_LEADING_PRESETS.find((p) => p.id === id)
    if (!preset) return
    change({ romans: preset.romans, minor: preset.minor, stringSet: preset.strings }, true)
    setDraft(preset.romans.join(' '))
  }
  const apply = () => {
    const parsed = parseVoiceLeadingInput(draft)
    if (parsed.error) { setInputError(parsed.error); return }
    change({ romans: parsed.romans }, true)
  }
  const changeFret = (index: 0 | 1, value: number) => change({ frets: index === 0 ? [value, Math.max(value, config.frets[1])] : [Math.min(value, config.frets[0]), value] }, true)
  const play = (single?: number) => {
    const voicings = single === undefined ? path.voicings : [path.voicings[single]]
    if (!voicings.length || !voicings[0]) return
    setPlayOffset(single ?? 0)
    setViewIdx(single ?? 0)
    void voiceLeadingPlayer.start(voicings.map((v) => shapeMidis(v.shape)), config.bpm, config.beats, config.mode, settings.instrument)
  }
  const name = (v: LibraryVoicing) => {
    const symbol = chordSymbol(spelling.spellPc(v.rootPc, { key: noteKey }), v.type)
    return pretty(v.bassPc === v.rootPc ? symbol : `${symbol}/${spelling.spellPc(v.bassPc, { key: noteKey })}`)
  }
  const marks: FretMark[] = [
    ...nextTones.filter((t) => !currentTones.some((c) => c.string === t.string && c.fret === t.fret)).map((t): FretMark => ({
      string: t.string, fret: t.fret, color: 'ghost', label: config.labels === 'degree' ? t.degree : config.labels === 'finger' ? String(t.finger ?? 0) : t.note,
      ...(config.labels === 'note' ? { computedNote: { pc: t.pc, key: noteKey } } : {})
    })),
    ...currentTones.map((t): FretMark => ({
      string: t.string, fret: t.fret, bass: t.isBass,
      color: nextTones.some((n) => n.string === t.string && n.midi === t.midi) ? 'accent' : t.isRoot ? 'root' : 'tone',
      label: config.labels === 'degree' ? t.degree : config.labels === 'finger' ? String(t.finger ?? 0) : t.note,
      ...(config.labels === 'note' ? { computedNote: { pc: t.pc, key: noteKey } } : {})
    }))
  ]
  const presetId = VOICE_LEADING_PRESETS.find((p) => p.minor === config.minor && p.romans.join(' ') === config.romans.join(' '))?.id ?? 'custom'

  return <div className="tools-pane tool-workspace vl-pane">
    <h2>Voice Leading</h2>
    <div className="tools-controls">
      <Field label="Progression"><select aria-label="Voice-leading progression" value={presetId} onChange={(e) => choosePreset(e.target.value)}>
        <option value="custom" disabled>Custom</option>
        {VOICE_LEADING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></Field>
      <Field label="Key centre"><Seg label="Key centre" value={config.minor ? 'minor' : 'major'} options={[{ id: 'major', label: 'Major' }, { id: 'minor', label: 'Minor' }]} onChange={(v) => change({ minor: v === 'minor' }, true)} /></Field>
      <Field label="Strings"><select aria-label="Voice-leading strings" value={config.stringSet} onChange={(e) => change({ stringSet: e.target.value }, true)}>
        {VOICE_LEADING_STRING_SETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select></Field>
    </div>
    <RootPicker pc={config.keyPc} minor={config.minor} onChange={(keyPc) => change({ keyPc }, true)} />
    <details className="workspace-details vl-settings">
    <summary>Custom progression and voicing options</summary>
    <form className="vl-custom" onSubmit={(e) => { e.preventDefault(); apply() }}>
      <Field label="Custom Roman numerals"><input aria-label="Custom Roman numerals" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2112} spellCheck={false} /></Field>
      <button type="submit" className="btn">Apply</button>
    </form>
    {inputError && <p role="alert" className="tools-err">{inputError}</p>}
    <div className="tools-controls">
      <Field label="From fret"><NumberInput aria-label="Voice-leading from fret" className="tools-num" min={0} max={22} value={config.frets[0]} onChange={(v) => changeFret(0, v)} /></Field>
      <Field label="To fret"><NumberInput aria-label="Voice-leading to fret" className="tools-num" min={0} max={22} value={config.frets[1]} onChange={(v) => changeFret(1, v)} /></Field>
      <Field label="Starting shape"><select aria-label="Starting shape" value={starts.some((v) => v.id === config.startId) ? config.startId! : ''} onChange={(e) => change({ startId: e.target.value || null })}>
        <option value="">Automatic</option>
        {starts.map((v) => <option key={v.id} value={v.id}>{name(v)} | {fretText(v.shape)}</option>)}
      </select></Field>
      <Field label="Labels"><select aria-label="Voice-leading labels" value={config.labels} onChange={(e) => change({ labels: e.target.value as VoiceLeadingConfig['labels'] })}>
        <option value="note">Notes</option><option value="degree">Degrees</option><option value="finger">Fingers</option>
      </select></Field>
    </div>
    </details>
    {path.missing.length > 0 ? <div className="vl-empty" role="status">
      <h3>No complete path in this range</h3>
      <p>Missing shapes: {path.missing.map((i) => `${i + 1}. ${pretty(chords[i].symbol)}`).join(', ')}.</p>
      <button className="btn" onClick={() => change({ frets: [0, 22], ...(chords.some((c) => CHORDS[c.type].intervals.length >= 4) ? { stringSet: '1-2-3-4' } : {}) }, true)}>Use full neck{strings.length === 3 && chords.some((c) => CHORDS[c.type].intervals.length >= 4) ? ' and four strings' : ''}</button>
    </div> : <>
      <div className="vl-summary"><b>{pretty(spelling.spellPc(config.keyPc, { key: noteKey }))} {config.minor ? 'minor' : 'major'}</b><span>{path.totalMovement} semitones total movement</span><span>Standard tuning</span></div>
      <ol className="vl-path" aria-label="Voice-leading chord sequence">
        {path.voicings.map((v, i) => <li key={`${i}-${v.id}`} className={i === currentIndex ? 'vl-active' : ''}>
          <button className="vl-step" aria-label={`Select chord ${i + 1}: ${name(v)}`} aria-current={i === currentIndex ? 'step' : undefined} onClick={() => select(i)}>
            <small>{i + 1}. {prettyRoman(chords[i].roman)}</small><strong>{name(v)}</strong><code>{fretText(v.shape)}</code>
            <small>{i === 0 ? 'Start' : `${voiceLeadingTransition(path.voicings[i - 1], v).movement} semitones`}</small>
            {v.omitted.length > 0 && <small>Omits {v.omitted.map(pretty).join(', ')}</small>}
          </button>
          <button className="vl-audition" aria-label={`Play chord ${i + 1}: ${name(v)}`} title={`Play ${name(v)}`} onClick={() => play(i)}><Play size={15} aria-hidden /></button>
        </li>)}
      </ol>
      <div className="tools-controls vl-playback">
        <button className="btn primary" aria-label="Play voice-leading sequence" title="Play sequence" onClick={() => play()}><Play size={17} aria-hidden />Play sequence</button>
        <button className="btn" disabled={!active} aria-label="Stop voice-leading playback" title="Stop" onClick={() => engine.stop()}><Square size={17} aria-hidden /></button>
        <Field label="Tempo"><NumberInput aria-label="Voice-leading tempo" className="tools-num" min={40} max={220} value={config.bpm} onChange={(bpm) => change({ bpm })} /></Field>
        <Field label="Beats per chord"><select aria-label="Voice-leading beats per chord" value={config.beats} onChange={(e) => change({ beats: Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
        <Field label="Playback"><select aria-label="Voice-leading playback mode" value={config.mode} onChange={(e) => change({ mode: e.target.value as VoiceLeadingConfig['mode'] })}><option value="block">Together</option><option value="strum">Strum</option><option value="arpeggio">Arpeggio</option></select></Field>
        <span className="muted" role="status">{state.status === 'loading' ? 'Loading sound...' : state.status === 'playing' ? 'Playing' : ''}</span>
      </div>
      {current && <section className="vl-detail" aria-label="Selected voice-leading shape">
        <div className="vl-heading"><h3>{currentIndex + 1}. {name(current)}</h3><span className="muted">{current.label}</span>
          <div className="vl-actions">
            <button className="btn ghost" aria-label="Previous chord" title="Previous chord" disabled={currentIndex === 0} onClick={() => select(currentIndex - 1)}><ArrowLeft size={18} aria-hidden /></button>
            <button className="btn ghost" aria-label="Next chord" title="Next chord" disabled={!next} onClick={() => select(currentIndex + 1)}><ArrowRight size={18} aria-hidden /></button>
            <button className="btn ghost" aria-label="Open selected chord in dictionary" title="Open chord in dictionary" onClick={() => onDictionaryEntry({ kind: 'chord', root: chords[currentIndex].root, type: current.type })}><BookOpen size={18} aria-hidden /></button>
          </div>
        </div>
        {current.omitted.length > 0 && <p className="muted">Omitted degrees: {current.omitted.map(pretty).join(', ')}.</p>}
        <div className="vl-legend"><span><i className="vl-tone-swatch" />Current</span><span><i className="vl-held-swatch" />Held on the same string</span>{next && <span><i className="vl-next-swatch" />Next: {name(next)}</span>}</div>
        <div ref={boardRef} className={`tools-board vl-board ${config.frets[1] - config.frets[0] > 15 ? 'vl-wide' : ''}`}>
          <Fretboard marks={marks} frets={config.frets} activeStrings={strings} selected={nextTones.map((t) => ({ string: t.string, fret: t.fret }))} ariaLabel="Voice-leading fretboard" noteContext={{ key: noteKey }} playable />
        </div>
        <div className="vl-movement-header"><h3>{next ? `${name(current)} to ${name(next)}` : 'Final chord'}</h3>{transition && <span>{transition.held} held voices · {transition.movement} semitones</span>}</div>
        <div className="vl-table-wrap"><table className="vl-movement"><thead><tr><th>String</th><th>Current tone</th><th>Fret</th>{next && <><th>Movement</th><th>Next tone</th><th>Fret</th></>}</tr></thead>
          <tbody>{[...currentTones].sort((a, b) => a.string - b.string).map((t) => {
            const move = transition?.moves.find((m) => m.string === t.string)
            const target = nextTones.find((n) => n.string === t.string)
            return <tr key={t.string} className={move?.semitones === 0 ? 'vl-held' : ''}><th>{t.string}</th><td>{pretty(spelling.spellMidi(t.midi, { key: noteKey }))} <small>{t.degree}</small></td><td>{t.fret}</td>
              {move && target && <><td><span className="vl-direction">{move.semitones === 0 ? <Minus size={15} aria-hidden /> : move.semitones > 0 ? <ArrowUp size={15} aria-hidden /> : <ArrowDown size={15} aria-hidden />}{move.semitones === 0 ? 'Hold' : `${move.semitones > 0 ? 'Up' : 'Down'} ${Math.abs(move.semitones)}`}</span></td><td>{pretty(spelling.spellMidi(target.midi, { key: noteKey }))} <small>{target.degree}</small></td><td>{target.fret}</td></>}
            </tr>
          })}</tbody></table></div>
      </section>}
    </>}
    {state.error && <p className="tools-err" role="alert">{state.error}</p>}
  </div>
}
