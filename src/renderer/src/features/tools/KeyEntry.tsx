// KEY ENTRY: scale notes + degrees, diatonic triads and seventh chords with Roman numerals and function.
// Every chord links to its CHORD ENTRY (the dictionary keeps a back-stack so "Back to D major" works).
import { useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { runPlay } from '@/audio/play'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import { LabelMode, playChord, playScale, scaleMarks } from '@/content/helpers'
import type { PlaySpec } from '@/content/types'
import { shapeMidis } from '@/theory/guitar'
import { pitchClass, pretty } from '@/theory/notes'
import { SCALES, ScaleType } from '@/theory/scales'
import { useSpelling } from '@/state/useSpelling'
import { chordLibrary } from './chordLibrary'
import { relatedModes } from './explorer'
import { DictView, KEY_SCALE_OPTIONS, KeyChordRow, commonVoicing, keyData, keyScaleName, resolveKeyRoot, viewFor } from './keyDictionary'
import { isMinorish, rootName } from './names'
import { fretText } from './voicingView'
import { Chips, Seg } from './ui'

type Navigate = (view: DictView, opts?: { push?: boolean }) => void

export function KeyEntry({ root, type, ready, onNavigate }: { root: string; type: ScaleType; ready: string; onNavigate: Navigate }) {
  const spelling = useSpelling()
  const data = useMemo(() => keyData(root, type), [root, type])
  const [label, setLabel] = useState<LabelMode>('note')
  const [played, setPlayed] = useState<Record<string, string>>({})
  const libs = useRef(new Map<string, ReturnType<typeof chordLibrary>>())
  const minor = isMinorish(SCALES[type].intervals)
  const marks = useMemo(() => scaleMarks(root, type, { frets: [0, 15], label }), [root, type, label])
  const modes = useMemo(() => relatedModes(root, type), [root, type])
  const options = KEY_SCALE_OPTIONS.includes(type) ? KEY_SCALE_OPTIONS : [...KEY_SCALE_OPTIONS, type]

  const voicingFor = (row: KeyChordRow) => {
    const k = row.root + '|' + row.type
    let lib = libs.current.get(k)
    if (!lib) {
      try {
        lib = chordLibrary(row.root, row.type)
      } catch {
        lib = []
      }
      libs.current.set(k, lib)
    }
    return commonVoicing(lib)
  }
  const playRow = (row: KeyChordRow) => {
    const v = voicingFor(row)
    const key = row.symbol
    if (!v) {
      setPlayed((p) => ({ ...p, [key]: 'no library shape, simple close voicing' }))
      return runPlay(playChord(row.root, row.type, 3, 'strum'))
    }
    setPlayed((p) => ({ ...p, [key]: `${v.label}, ${fretText(v.shape)}` }))
    return runPlay({ kind: 'shape', shape: v.shape, mode: 'strum' })
  }
  const playAll = (rows: KeyChordRow[]) => async () => {
    const events = rows.map((r) => {
      const v = voicingFor(r)
      return { notes: v ? shapeMidis(v.shape) : playChordNotes(r), beats: 2, mode: 'strum' as const }
    })
    const spec: PlaySpec = { kind: 'sequence', events, bpm: 72 }
    await runPlay(spec)
  }

  const pickRoot = (pc: number) => {
    const preferred = spelling.spellPc(pc, { key: rootName(pc, minor) + (minor ? 'm' : '') })
    onNavigate({ kind: 'key', root: resolveKeyRoot(pc, preferred, type), type })
  }
  const pickScale = (t: ScaleType) => onNavigate({ kind: 'key', root: resolveKeyRoot(pitchClass(root), root, t), type: t })

  return (
    <>
      <div className="card dict-entry-summary">
        <h2 className="tools-title">
          Key of {pretty(root)} {keyScaleName(type)}
        </h2>
        <div className="dict-pickers">
          <div className="tools-roots" role="group" aria-label="Key root">
            {Array.from({ length: 12 }, (_, i) => (
              <button key={i} type="button" aria-pressed={i === pitchClass(root)} className={i === pitchClass(root) ? 'on' : ''} onClick={() => pickRoot(i)}>
                {pretty(spelling.spellPc(i, { key: rootName(i, minor) + (minor ? 'm' : '') }))}
              </button>
            ))}
          </div>
          <label className="tools-field">
            <span className="muted">Scale / mode</span>
            <select value={type} onChange={(e) => pickScale(e.target.value as ScaleType)}>
              {options.map((t) => (
                <option key={t} value={t}>
                  {keyScaleName(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tools-facts">
          <div>
            <span className="muted">Notes</span> <Chips items={data.notes} />
          </div>
          <div>
            <span className="muted">Degrees</span>{' '}
            <span className="tools-chips">
              {data.degrees.map((d, i) => (
                <span key={i} className="tools-chip static">
                  <small>{pretty(d)}</small>
                  {pretty(data.notes[i])}
                </span>
              ))}
            </span>
          </div>
          <div>
            <span className="muted">Steps</span> <b>{data.steps}</b>
          </div>
          {SCALES[type].feel && <div className="muted dict-feel">{pretty(SCALES[type].feel ?? '')}</div>}
        </div>
        <div className="row">
          <PlayButton play={playScale(root, type, 3, false)} label="Play scale" />
          <PlayButton play={playScale(root, type, 3, true)} label="Up and back" small />
          <span className="muted">{ready === 'loading' ? 'Loading sounds...' : ''}</span>
        </div>
      </div>

      <ChordTable title="Triads" rows={data.triads} played={played} onPlay={playRow} onAll={playAll(data.triads)} onOpen={(r) => onNavigate(r.link, { push: true })} />
      <ChordTable title="Seventh chords" rows={data.sevenths} played={played} onPlay={playRow} onAll={playAll(data.sevenths)} onOpen={(r) => onNavigate(r.link, { push: true })} />

      <div className="card">
        <h3 className="tools-h">On the fretboard</h3>
        <Seg<LabelMode> label="Fretboard labels" options={[{ id: 'note', label: 'Note' }, { id: 'degree', label: 'Degree' }, { id: 'interval', label: 'Interval' }, { id: 'none', label: 'None' }]} value={label} onChange={setLabel} />
        <div className="tools-board">
          <Fretboard marks={marks} frets={[0, 15]} />
        </div>
      </div>

      <div className="card">
        <h3 className="tools-h">
          Related modes
        </h3>
        <div className="tools-chips">
          {modes.map((m) =>
            m.type ? (
              <button key={m.degree} className={'tools-chip' + (m.degree === 1 ? ' on' : '')} onClick={() => onNavigate(viewFor({ kind: 'scale', root: m.root, type: m.type as ScaleType }), { push: true })}>
                <small>{m.degree}</small>
                {pretty(m.root)} {SCALES[m.type].name.split(' (')[0]}
              </button>
            ) : (
              <span key={m.degree} className="tools-chip static">
                <small>{m.degree}</small>
                {pretty(m.root)} (unnamed mode)
              </span>
            )
          )}
        </div>
      </div>
    </>
  )
}

function playChordNotes(r: KeyChordRow): number[] {
  const spec = playChord(r.root, r.type, 3, 'strum')
  return spec.kind === 'notes' ? spec.notes.map((n) => Number(n)) : []
}

function ChordTable({ title, rows, played, onPlay, onAll, onOpen }: { title: string; rows: KeyChordRow[]; played: Record<string, string>; onPlay: (r: KeyChordRow) => Promise<unknown>; onAll: () => Promise<unknown>; onOpen: (r: KeyChordRow) => void }) {
  return (
    <div className="card dict-key-table">
      <div className="dict-map-head">
        <h3 className="tools-h">
          {title}
        </h3>
        <PlayButton play={onAll} label={`Play all ${title.toLowerCase()}`} small />
      </div>
      <div className="dict-table-wrap">
        <table className="dict-table">
          <thead>
            <tr>
              <th scope="col">Degree</th>
              <th scope="col">Chord</th>
              <th scope="col">Function</th>
              <th scope="col">Listen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.degree}>
                <th scope="row" className="dict-roman">
                  {pretty(r.roman)}
                </th>
                <td>
                  <button type="button" className="tools-chip dict-chordlink" onClick={() => onOpen(r)} title={`Open ${r.symbol} positions`} aria-label={`Open ${r.symbol} chord entry and positions`}>
                    {pretty(r.symbol)} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </td>
                <td className="muted">{r.fn}</td>
                <td>
                  <div className="dict-listen">
                    <PlayButton play={() => onPlay(r)} label="Play" small />
                    {played[r.symbol] && <span className="muted dict-played">{played[r.symbol]}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
