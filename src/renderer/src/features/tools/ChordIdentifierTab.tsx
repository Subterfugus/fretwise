import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, RotateCcw, Volume2, X } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import type { FretMark } from '@/content/types'
import { useSpelling } from '@/state/useSpelling'
import { CHORDS, buildChord } from '@/theory/chords'
import { intervalNameBySemitones, parseInterval } from '@/theory/intervals'
import { noteName, pitchClass, pretty } from '@/theory/notes'
import { intervalToDegree } from '@/theory/scales'
import { TUNINGS } from '@/theory/tunings'
import { identifyVoicing } from './chordIdentifier'
import { DEFAULT_IDENTIFIER, identifierCapo, identifierMidis, identifierString, isIdentifierInput, type IdentifierInput } from './identifierInput'
import { type DictView, resolveChordRoot } from './keyDictionary'
import { MAJOR_ROOTS } from './names'
import { commitNumberDraft } from './numberInput'
import { Field, NumberInput, Seg, useEngineReady, usePref } from './ui'
import './identifier.css'

function IdentifierFretInput({ fret, max, label, onChange }: { fret: number | null; max: number; label: string; onChange: (fret: number) => void }) {
  const edited = useRef(false)
  const commitMuted = (raw: string, explicit: boolean) => {
    // A muted string also displays zero; an explicit zero commit must still select its open note.
    if (fret === null && (edited.current || explicit) && raw.trim() && Number.isFinite(Number(raw))
      && commitNumberDraft(raw, 0, 0, max) === 0) onChange(0)
    edited.current = false
  }
  return <NumberInput aria-label={label} value={fret ?? 0} min={0} max={max} onChange={onChange}
    onInput={() => { edited.current = true }} onBlur={(e) => commitMuted(e.currentTarget.value, false)}
    onKeyDown={(e) => { if (e.key === 'Enter') commitMuted(e.currentTarget.value, true); if (e.key === 'Escape') edited.current = false }} />
}

export function ChordIdentifierTab({ onDictionaryEntry, initialInput }: { onDictionaryEntry: (entry: DictView) => void; initialInput?: IdentifierInput }) {
  const [input, setInput] = usePref('identifier.input', DEFAULT_IDENTIFIER, isIdentifierInput, initialInput)
  const [labels, setLabels] = usePref<'note' | 'degree'>('identifier.labels', 'note', (v) => v === 'note' || v === 'degree')
  const [key, setKey] = usePref('identifier.key', '', (v) => v === '' || MAJOR_ROOTS.includes(v as string))
  const [chosen, setChosen] = useState('')
  const [allNames, setAllNames] = useState(false)
  const spelling = useSpelling()
  const ready = useEngineReady()
  const tuning = TUNINGS.find((t) => t.id === input.tuningId) ?? TUNINGS[0]
  const midis = useMemo(() => identifierMidis(input), [input])
  const result = useMemo(() => identifyVoicing(midis), [midis])
  const context = key ? { key } : undefined
  const names = result.matches.map((m) => {
    const root = resolveChordRoot(m.rootPc, spelling.spellPc(m.rootPc, context), m.type)
    const tones = buildChord(root, m.type)
    const toneNames = new Map(tones.map((n) => [pitchClass(n), noteName(n)]))
    const bass = toneNames.get(m.bassPc) ?? spelling.spellPc(m.bassPc, context)
    return { ...m, root, tones, toneNames, id: `${m.rootPc}:${m.type}`, name: root + CHORDS[m.type].symbol + (m.rootPc === m.bassPc ? '' : '/' + bass) }
  })
  const match = names.find((m) => m.id === chosen) ?? names[0]
  const definition = match && CHORDS[match.type]
  const tonePcs = match ? match.tones.map(pitchClass).filter((pc) => result.pcs.includes(pc)) : result.pcs
  const preferredRoot = match && spelling.spellPc(match.rootPc, context)
  const degree = (pc: number) => {
    if (!match || !definition) return ''
    const iv = definition.intervals.find((v) => (match.rootPc + parseInterval(v).semitones) % 12 === pc)
    return iv ? intervalToDegree(iv) : ''
  }
  const selected: FretMark[] = input.frets.flatMap((f, i) => {
    if (f === null) return []
    const midi = tuning.midi[5 - i] + input.capo + f
    const pc = midi % 12
    return [{ string: 6 - i, fret: f + input.capo, color: match?.rootPc === pc ? 'root' : 'tone', bass: midi === result.bassMidi,
      ...(labels === 'degree' && match ? { label: degree(pc) } : { label: spelling.spellPc(pc, context), computedNote: { pc, key: key || undefined } }) }]
  })
  const updateString = (i: number, fret: number | null) => setInput((p) => identifierString(p, i, fret))
  // A changed physical input invalidates both a chosen alternative and any old playback.
  useEffect(() => { setChosen(''); setAllNames(false); engine.stop() }, [input])
  useEffect(() => () => engine.stop(), [])

  return <div className="tools-pane identifier-pane">
    <div className="tools-controls identifier-controls">
      <Field label="Tuning"><select value={input.tuningId} onChange={(e) => setInput({ ...input, tuningId: e.target.value })}>
        {TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></Field>
      <Field label="Capo"><NumberInput aria-label="Capo fret" value={input.capo} min={0} max={12} onChange={(c) => setInput(identifierCapo(input, c))} /></Field>
      <Field label="Spelling context"><select value={key} onChange={(e) => setKey(e.target.value)}>
        <option value="">No key</option>{MAJOR_ROOTS.map((r) => <option key={r} value={r}>{pretty(r)} major</option>)}
      </select></Field>
      <Field label="Labels"><Seg label="Identifier labels" value={labels} onChange={setLabels} options={[{ id: 'note', label: 'Notes' }, { id: 'degree', label: 'Degrees' }]} /></Field>
    </div>
    <section className="identifier-result" aria-label="Chord identification" aria-live="polite">
      <div className="identifier-name">
        <h2>{match ? pretty(match.name) : result.kind === 'empty' ? 'No strings selected' : result.kind === 'note' ? pretty(spelling.spellMidi(midis[0], context)) : result.kind === 'interval' ? result.interval?.label : 'No standard name'}</h2>
        <span className="muted">{match ? CHORDS[match.type].name : result.kind === 'unknown' ? 'These notes do not match the supported chord names.' : ''}</span>
      </div>
      {!!midis.length && <div className="identifier-facts">
        <div className="identifier-bass"><span className="muted">Bass </span><b>{pretty(spelling.spellMidi(result.bassMidi!, context))}</b></div>
        {match && <div className="identifier-bass-degree"><span className="muted">Bass degree </span><b>{pretty(degree(result.bassPc!))}</b></div>}
        <div className="identifier-tones"><span className="muted">Tones </span><span className="identifier-tone-list">{tonePcs.map((pc) => <span key={pc} className={'identifier-tone' + (match?.rootPc === pc ? ' root' : '')}>{pretty(match?.toneNames.get(pc) ?? spelling.spellPc(pc, context))}<small>{match ? pretty(degree(pc)) : intervalNameBySemitones((pc - result.bassPc! + 12) % 12)}</small></span>)}</span></div>
      </div>}
      {match && preferredRoot !== match.root && <p className="muted">{pretty(match.root)} and {pretty(preferredRoot!)} sound the same. {pretty(match.root)} keeps this chord's spelling readable.</p>}
      {match && <p className={'identifier-omissions' + (match.omitted.length ? ' omitted' : ' muted')}>{match.omitted.length ? `Omitted: ${match.omitted.map((i) => pretty(intervalToDegree(CHORDS[match.type].intervals[i]))).join(', ')}${match.omitted.includes(0) ? ' (root inferred)' : ''}.` : 'All chord tones present.'}</p>}
      {!match && result.interval && <p className="muted">Interval above the bass: {result.interval.semitones} semitones.</p>}
      {names.length > 1 && <div className="identifier-alternatives" role="group" aria-label="Alternative chord names">
        {(allNames ? names : names.slice(0, 6)).map((m) => <button key={m.id} className={'tools-chip' + (m.id === match?.id ? ' on' : '')} aria-pressed={m.id === match?.id} onClick={() => setChosen(m.id)}>
          {pretty(m.name)}{m.omitted.length > 0 && <small>omits {m.omitted.map((i) => pretty(intervalToDegree(CHORDS[m.type].intervals[i]))).join(', ')}</small>}
        </button>)}
        {names.length > 6 && <button className="btn ghost" onClick={() => setAllNames(!allNames)}>{allNames ? 'Fewer names' : `All ${names.length} names`}</button>}
      </div>}
      <div className="row identifier-actions">
        {!!midis.length && <><PlayButton play={{ kind: 'notes', notes: midis, mode: 'strum' }} label="Strum" /><PlayButton play={{ kind: 'notes', notes: [...midis].sort((a, b) => a - b), mode: 'arpeggio' }} label="Arpeggio" /></>}
        {match && <button className="btn" onClick={() => onDictionaryEntry({ kind: 'chord', root: match.root, type: match.type })}><BookOpen size={16} aria-hidden /> Open dictionary</button>}
        <button className="btn ghost" title="Mute all strings" onClick={() => setInput({ ...input, frets: Array(6).fill(null) })}><X size={16} aria-hidden /> Clear</button>
        <button className="btn ghost" title="Restore open C in standard tuning" onClick={() => setInput(DEFAULT_IDENTIFIER)}><RotateCcw size={16} aria-hidden /> Reset</button>
      </div>
      {ready === 'error' && <p className="tools-err">Sounds could not load. Naming still works.</p>}
    </section>
    <div className="tools-board"><Fretboard ariaLabel="Chord identifier fretboard" marks={selected} selected={selected} frets={[0, 22]} tuning={tuning.midi} capo={input.capo} showTuning noteContext={context} hoverNames playable={false}
      onPick={(p) => { const i = 6 - p.string; const f = p.fret - input.capo; updateString(i, input.frets[i] === f ? null : f) }} /></div>
    <div className="identifier-strings" role="group" aria-label="Strings and relative frets">
      <div className="identifier-string-head" aria-hidden="true"><span>String</span><span>Tuning</span><span className="identifier-state-head">State</span><span>Fret</span><span>Sounding</span></div>
      {input.frets.map((f, i) => <div className="identifier-string" key={i}>
        <b>String {6 - i}</b>
        <span className="muted">{pretty(spelling.spellPc(tuning.midi[5 - i] % 12, context))}</span>
        <button className={'btn ghost' + (f === null ? ' on' : '')} aria-label={`Mute string ${6 - i}`} aria-pressed={f === null} title="Mute" onClick={() => updateString(i, null)}><X size={16} aria-hidden /> <span>Mute</span></button>
        <button className={'btn ghost' + (f === 0 ? ' on' : '')} aria-label={`Open string ${6 - i}`} aria-pressed={f === 0} title="Open string" onClick={() => updateString(i, 0)}><Volume2 size={16} aria-hidden /> <span>Open</span></button>
        <IdentifierFretInput label={`String ${6 - i} fret relative to capo`} fret={f} max={22 - input.capo} onChange={(v) => updateString(i, v)} />
        <span className={'identifier-sounding' + (f === null ? ' muted' : '')}>{f === null ? 'Muted' : pretty(spelling.spellMidi(tuning.midi[5 - i] + input.capo + f, context))}</span>
      </div>)}
    </div>
  </div>
}
