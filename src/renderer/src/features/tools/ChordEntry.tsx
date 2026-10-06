// CHORD ENTRY: spelled notes + formula, quality/root pickers, filters, a scrollable "neck map" of voicings grouped by
// position on a shared 0-22 fret axis, and a large detail view with playback and comparison.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { runPlay } from '@/audio/play'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import type { LabelMode } from '@/content/helpers'
import { chordToneMarks } from '@/content/helpers'
import type { FretMark, PlaySpec } from '@/content/types'
import { shapeMidis } from '@/theory/guitar'
import { CHORDS, ChordType, buildChord } from '@/theory/chords'
import { noteName, pitchClass, pretty } from '@/theory/notes'
import { SCALES, ScaleType, intervalToDegree } from '@/theory/scales'
import { useProgress } from '@/state/progress'
import { useSpelling } from '@/state/useSpelling'
import { ChordFilters, DEFAULT_FILTERS, FilterState, isDefaultFilters, isFilterState, toLibraryFilter } from './ChordFilters'
import { LIBRARY_QUALITIES, LibraryVoicing, chordLibrary, filterLibrary } from './chordLibrary'
import { DictView, resolveChordRoot, viewFor } from './keyDictionary'
import { chordLabel, isMinorish, rootName } from './names'
import { AXIS_W, FretRuler, TonesLabel, VoicingStrip, labelFor } from './VoicingStrip'
import { VoicingRegion, VoicingTone, fretText, groupByRegion, omittedText, voicingTones } from './voicingView'
import { Chips, Seg, usePref } from './ui'

const PAGE = 6
const MAX_COMPARE = 4
const INFO_W = 252

const BASS_TEXT: Record<string, string> = { root: 'Root in bass', third: '3rd in bass', fifth: '5th in bass', seventh: '7th in bass', other: 'Other tone in bass' }

function bassText(v: LibraryVoicing): string {
  const base = BASS_TEXT[v.bassRole] ?? 'Bass'
  return v.bassRole === 'other' || v.bassRole === 'root' ? `${base} (${v.bassDegree})` : base
}

export function suggestScales(type: ChordType): ScaleType[] {
  switch (type) {
    case 'maj':
    case 'maj6':
    case 'add9':
      return ['major', 'majorPentatonic', 'lydian']
    case 'maj7':
    case 'maj9':
      return ['major', 'lydian']
    case 'maj7s11':
      return ['lydian']
    case 'min':
    case 'min6':
    case 'min7':
    case 'min9':
    case 'min11':
      return ['dorian', 'naturalMinor', 'minorPentatonic']
    case 'dom7':
    case 'dom9':
    case 'dom13':
    case 'dom11':
      return ['mixolydian', 'blues', 'minorPentatonic']
    case 'dom7b9':
    case 'dom7s9':
      return ['altered', 'diminishedHW', 'phrygianDominant']
    case 'm7b5':
      return ['locrian']
    case 'dim':
    case 'dim7':
      return ['diminishedWH']
    case 'aug':
    case 'aug7':
      return ['wholeTone']
    case 'minMaj7':
      return ['melodicMinor', 'harmonicMinor']
    case 'sus4':
    case 'sus2':
    case 'sus7':
      return ['mixolydian', 'majorPentatonic']
    default:
      return []
  }
}

type Navigate = (view: DictView, opts?: { push?: boolean }) => void

function safeLibrary(root: string, type: ChordType): LibraryVoicing[] {
  try {
    return chordLibrary(root, type)
  } catch (e) {
    console.error(e)
    return []
  }
}

export function ChordEntry({ root, type, ready, onNavigate }: { root: string; type: ChordType; ready: string; onNavigate: Navigate }) {
  const def = CHORDS[type]
  const spelling = useSpelling()
  const [labelMode, setLabelMode] = usePref<TonesLabel>('dict.labels', 'degree', (v) => v === 'note' || v === 'degree' || v === 'finger')
  const [filters, setFilters] = usePref<FilterState>('dict.filters', DEFAULT_FILTERS, isFilterState)
  const [toneLabel, setToneLabel] = useState<LabelMode>('degree')
  const chordNotes = useMemo(() => buildChord(root, type).map(noteName), [root, type])
  const degrees = useMemo(() => def.intervals.map((iv) => intervalToDegree(iv)), [def])
  const library = useMemo(() => safeLibrary(root, type), [root, type])
  const available = useMemo(() => [...new Set(library.map((v) => v.stringSet))], [library])
  const filtered = useMemo(() => filterLibrary(library, toLibraryFilter(filters, available)), [library, filters, available])
  const qualities = LIBRARY_QUALITIES.includes(type) ? LIBRARY_QUALITIES : [...LIBRARY_QUALITIES, type]
  const minor = isMinorish(def.intervals)
  const toneMarks = useMemo(() => chordToneMarks(root, type, [0, 15], toneLabel), [root, type, toneLabel])
  const scales = suggestScales(type)

  const pickRoot = (pc: number) => {
    const preferred = spelling.spellPc(pc, { key: rootName(pc, minor) + (minor ? 'm' : '') })
    onNavigate({ kind: 'chord', root: resolveChordRoot(pc, preferred, type), type })
  }
  const pickQuality = (t: ChordType) => onNavigate({ kind: 'chord', root: resolveChordRoot(pitchClass(root), root, t), type: t })

  return (
    <>
      <div className="card dict-entry-summary">
        <h2 className="tools-title">
          {pretty(chordLabel(root, type))} <span className="muted">{def.name}</span>
        </h2>
        <div className="tools-facts">
          <div>
            <span className="muted">Notes</span> <Chips items={chordNotes} />
          </div>
          <div>
            <span className="muted">Formula</span> <b>{pretty(def.formula)}</b>
          </div>
          <div>
            <span className="muted">Degrees</span>{' '}
            <span className="tools-chips">
              {degrees.map((d, i) => (
                <span key={i} className="tools-chip static">
                  <small>{pretty(d)}</small>
                  {pretty(chordNotes[i])}
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="dict-pickers">
          <div className="tools-roots" role="group" aria-label="Chord root">
            {Array.from({ length: 12 }, (_, i) => (
              <button key={i} type="button" aria-pressed={i === pitchClass(root)} className={i === pitchClass(root) ? 'on' : ''} onClick={() => pickRoot(i)}>
                {pretty(spelling.spellPc(i, { key: rootName(i, minor) + (minor ? 'm' : '') }))}
              </button>
            ))}
          </div>
          <label className="tools-field">
            <span className="muted">Quality</span>
            <select value={type} onChange={(e) => pickQuality(e.target.value as ChordType)}>
              {qualities.map((q) => (
                <option key={q} value={q}>
                  {pretty(chordLabel(root, q))} ({CHORDS[q].name})
                </option>
              ))}
            </select>
          </label>
        </div>
        {scales.length > 0 && (
          <div className="row dict-related-scales">
            <span className="muted">Scales to play over it:</span>
            {scales.map((s) => (
              <button key={s} className="tools-chip" onClick={() => onNavigate(viewFor({ kind: 'scale', root, type: s }), { push: true })}>
                {pretty(root)} {SCALES[s].name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card dict-filter-section">
        <h3 className="tools-h">Find a voicing</h3>
        <ChordFilters value={filters} onChange={setFilters} library={library} shown={filtered.length} />
      </div>

      <ChordVoicings
        key={root + '|' + type}
        root={root}
        type={type}
        library={library}
        filtered={filtered}
        labelMode={labelMode}
        onLabelMode={setLabelMode}
        ready={ready}
        filtersActive={!isDefaultFilters(filters)}
        onClearFilters={() => setFilters(DEFAULT_FILTERS)}
      />

      <div className="card">
        <h3 className="tools-h">Every chord tone on the neck</h3>
        <Seg<LabelMode> label="Chord tone labels" options={[{ id: 'degree', label: 'Degree' }, { id: 'note', label: 'Note' }, { id: 'interval', label: 'Interval' }]} value={toneLabel} onChange={setToneLabel} />
        <div className="tools-board">
          <Fretboard marks={toneMarks} frets={[0, 15]} />
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function ChordVoicings({
  root,
  type,
  library,
  filtered,
  labelMode,
  onLabelMode,
  ready,
  filtersActive,
  onClearFilters
}: {
  root: string
  type: ChordType
  library: LibraryVoicing[]
  filtered: LibraryVoicing[]
  labelMode: TonesLabel
  onLabelMode: (m: TonesLabel) => void
  ready: string
  filtersActive: boolean
  onClearFilters: () => void
}) {
  const [selId, setSelId] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [shown, setShown] = useState<Record<string, number>>({})
  const [wholeNeck, setWholeNeck] = useState(false)
  const { settings } = useProgress()
  const scroller = useRef<HTMLDivElement>(null)

  const selected = filtered.find((v) => v.id === selId) ?? filtered[0] ?? null
  const regions = useMemo(() => groupByRegion(filtered), [filtered])
  const tonesById = useMemo(() => new Map(library.map((v) => [v.id, voicingTones(root, type, v.shape)])), [library, root, type])

  // Lefty boards run low frets on the right; start scrolled to the nut end.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = settings.leftHanded ? el.scrollWidth : 0
  }, [settings.leftHanded, regions.length])

  const play = (v: LibraryVoicing, mode: 'strum' | 'arpeggio' = 'strum'): PlaySpec => ({ kind: 'shape', shape: v.shape, mode })
  const pick = useCallback((v: LibraryVoicing, run: boolean) => {
    setSelId(v.id)
    if (run) runPlay({ kind: 'shape', shape: v.shape, mode: 'strum' }).catch(() => undefined)
  }, [])
  const toggleCompare = useCallback((id: string) => {
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? c : [...c, id]))
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (!t.hasAttribute('data-vpick') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const all = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-vpick]') ?? [])]
    const i = all.indexOf(t)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : i + (e.key === 'ArrowDown' ? 1 : -1)
    if (all[next]) {
      e.preventDefault()
      all[next].focus()
      all[next].scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  const compared = compare.map((id) => library.find((v) => v.id === id)).filter((v): v is LibraryVoicing => !!v)
  const compareSpec: PlaySpec = {
    kind: 'sequence',
    bpm: 60,
    events: compared.map((v) => ({ notes: shapeMidis(v.shape), beats: 2, mode: 'strum' as const }))
  }

  return (
    <>
      <div className="card dict-map-section">
        <div className="dict-map-head">
          <h3 className="tools-h">
            Voicings up the neck <span className="dict-count">{filtered.length}</span>
          </h3>
          <div className="dict-labelmode">
            <span className="muted">Label</span>
            <Seg<TonesLabel> label="Voicing labels" options={[{ id: 'note', label: 'Notes' }, { id: 'degree', label: 'Degrees' }, { id: 'finger', label: 'Fingers' }]} value={labelMode} onChange={onLabelMode} />
          </div>
        </div>
        <Legend />
        {library.length === 0 ? (
          <p className="muted dict-empty">No playable guitar voicing is in the library for this chord yet. The chord tones on the neck (below) still show where each note lives.</p>
        ) : filtered.length === 0 ? (
          <div className="dict-empty">
            <p>No voicings match these filters.</p>
            {filtersActive && (
              <button type="button" className="btn" onClick={onClearFilters}>
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="dict-neckmap" ref={scroller} onKeyDown={onKeyDown} role="region" aria-label="Voicings by neck position (scrolls sideways)">
            <div className="dict-nm-inner" style={{ width: INFO_W + AXIS_W + 12 }}>
              {regions.map((r) => (
                <RegionBlock
                  key={r.id}
                  region={r}
                  count={Math.max(shown[r.id] ?? PAGE, r.voicings.findIndex((v) => v.id === selected?.id) + 1)}
                  onMore={() => setShown((s) => ({ ...s, [r.id]: (s[r.id] ?? PAGE) + PAGE * 2 }))}
                  tonesById={tonesById}
                  label={labelMode}
                  selectedId={selected?.id ?? null}
                  tabId={regions.flatMap((x) => x.voicings).some((v) => v.id === selected?.id) ? selected?.id ?? null : regions[0]?.voicings[0]?.id ?? null}
                  compare={compare}
                  onPick={pick}
                  onCompare={toggleCompare}
                />
              ))}
            </div>
          </div>
        )}
        <div className="muted">{ready === 'loading' ? 'Loading sounds...' : ''}</div>
      </div>

      {compared.length > 0 && (
        <div className="card dict-compare">
          <h3 className="tools-h">
            Compare <span className="muted">{compared.length} / {MAX_COMPARE}</span>
          </h3>
          <ol className="dict-cmp-list">
            {compared.map((v, i) => (
              <li key={v.id}>
                <button type="button" className="tools-chip" onClick={() => setSelId(v.id)} title="Show this voicing large">
                  <small>{i + 1}</small>
                  {pretty(v.slashName ?? v.symbol)} <span className="muted">{fretText(v.shape)}</span>
                </button>
                <button type="button" className="tools-x" aria-label={`Remove ${v.slashName ?? v.symbol} ${fretText(v.shape)} from comparison`} onClick={() => toggleCompare(v.id)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <div className="row">
            <PlayButton play={compareSpec} label="Play in sequence" />
            <button type="button" className="btn ghost" onClick={() => setCompare([])}>
              Clear comparison
            </button>
          </div>
        </div>
      )}

      {selected && (
        <VoicingDetail
          voicing={selected}
          tones={tonesById.get(selected.id) ?? []}
          label={labelMode}
          wholeNeck={wholeNeck}
          onWholeNeck={setWholeNeck}
          playSpec={play}
          inCompare={compare.includes(selected.id)}
          compareFull={compare.length >= MAX_COMPARE}
          onCompare={() => toggleCompare(selected.id)}
        />
      )}
    </>
  )
}

function Legend() {
  return (
    <p className="dict-legend muted">
      <span className="dict-key root" /> root note &nbsp;
      <span className="dict-key bass" /> lowest sounding note (bass) &nbsp;
      <span className="dict-key tone" /> other chord tone &nbsp;
      {'×'} muted string &nbsp;
      <span className="dict-key barre" /> barre &nbsp;
      <span className="dict-key span" /> frets used
    </p>
  )
}

const RegionBlock = memo(function RegionBlock({
  region,
  count,
  onMore,
  tonesById,
  label,
  selectedId,
  tabId,
  compare,
  onPick,
  onCompare
}: {
  region: VoicingRegion
  count: number
  onMore: () => void
  tonesById: Map<string, VoicingTone[]>
  label: TonesLabel
  selectedId: string | null
  tabId: string | null
  compare: string[]
  onPick: (v: LibraryVoicing, run: boolean) => void
  onCompare: (id: string) => void
}) {
  const vis = region.voicings.slice(0, count)
  const hidden = region.voicings.length - vis.length
  return (
    <section className="dict-region" aria-label={`${region.label}, ${region.voicings.length} voicings`}>
      <div className="dict-nm-head" style={{ gridTemplateColumns: `${INFO_W}px ${AXIS_W}px` }}>
        <div className="dict-nm-title">
          <b>{region.label}</b> <span className="muted">{'·'} {region.voicings.length}</span>
        </div>
        <FretRuler lo={region.lo} hi={region.hi} />
      </div>
      <ul className="dict-rows">
        {vis.map((v) => (
          <VoicingRow
            key={v.id}
            v={v}
            tones={tonesById.get(v.id) ?? []}
            label={label}
            selected={v.id === selectedId}
            tabStop={v.id === tabId}
            inCompare={compare.includes(v.id)}
            compareFull={compare.length >= MAX_COMPARE}
            onPick={onPick}
            onCompare={onCompare}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="btn ghost dict-more" onClick={onMore}>
          Show {Math.min(hidden, PAGE * 2)} more in this region ({hidden} hidden)
        </button>
      )}
    </section>
  )
})

const VoicingRow = memo(function VoicingRow({
  v,
  tones,
  label,
  selected,
  tabStop,
  inCompare,
  compareFull,
  onPick,
  onCompare
}: {
  v: LibraryVoicing
  tones: VoicingTone[]
  label: TonesLabel
  selected: boolean
  tabStop: boolean
  inCompare: boolean
  compareFull: boolean
  onPick: (v: LibraryVoicing, run: boolean) => void
  onCompare: (id: string) => void
}) {
  const name = v.slashName ?? v.symbol
  const omitted = omittedText(v.omitted)
  const bassNote = tones.find((t) => t.isBass)?.note
  const desc = `${name}, ${v.label}, frets ${fretText(v.shape)}, ${bassText(v)}${omitted ? ', ' + omitted : ''}`
  return (
    <li className={'dict-vrow' + (selected ? ' sel' : '')} style={{ gridTemplateColumns: `${INFO_W}px ${AXIS_W}px` }}>
      <div className="dict-vinfo">
        <button type="button" className="dict-vpick" data-vpick="" tabIndex={tabStop ? 0 : -1} aria-pressed={selected} aria-label={desc + '. Press Enter to select and play.'} onClick={() => onPick(v, true)}>
          <span className="dict-vheading"><span className="dict-vname">{pretty(name)}</span><span className="dict-vfrets">{fretText(v.shape)}</span></span>
          <span className="dict-vlabel">{v.label}</span>
          <span className="dict-tags">
            <span className="dict-tag bass" title={bassText(v)}>Bass {pretty(bassNote ?? v.bassDegree)} <small>{pretty(v.bassDegree)}</small></span>
            <span className={'dict-tag src-' + v.source}>{v.source}</span>
            {v.barre && <span className="dict-tag">barre</span>}
            {omitted && <span className="dict-tag omit">{omitted}</span>}
          </span>
        </button>
        <label className="dict-cmp">
          <input type="checkbox" checked={inCompare} disabled={!inCompare && compareFull} onChange={() => onCompare(v.id)} aria-label={`Compare ${name} ${fretText(v.shape)}`} /> Compare
        </label>
      </div>
      <div className="dict-vboard" onClick={() => onPick(v, true)}>
        <VoicingStrip shape={v.shape} tones={tones} label={label} selected={selected} title={desc} />
      </div>
    </li>
  )
})

function VoicingDetail({
  voicing: v,
  tones,
  label,
  wholeNeck,
  onWholeNeck,
  playSpec,
  inCompare,
  compareFull,
  onCompare
}: {
  voicing: LibraryVoicing
  tones: VoicingTone[]
  label: TonesLabel
  wholeNeck: boolean
  onWholeNeck: (b: boolean) => void
  playSpec: (v: LibraryVoicing, mode: 'strum' | 'arpeggio') => PlaySpec
  inCompare: boolean
  compareFull: boolean
  onCompare: () => void
}) {
  const lo = wholeNeck ? 0 : v.hasOpenStrings || v.minFret <= 2 ? 0 : v.minFret - 1
  const hi = wholeNeck ? 22 : Math.min(22, Math.max(v.maxFret + 1, lo + 4))
  const marks: FretMark[] = tones.map((t) => ({
    string: t.string,
    fret: t.fret,
    label: labelFor(t, label) || undefined,
    color: t.isRoot ? 'root' : 'tone',
    bass: t.isBass
  }))
  const muted = v.shape.frets.map((f, i) => (f === null ? 6 - i : 0)).filter(Boolean)
  const omitted = omittedText(v.omitted)
  return (
    <div className="card dict-detail">
      <h3 className="tools-h">Selected voicing</h3>
      <div className="dict-detail-head">
        <div>
          <div className="dict-detail-name">{pretty(v.slashName ?? v.symbol)}</div>
          <div className="muted">
            {v.label} <span className="dict-sep">{'·'}</span> {v.source} <span className="dict-sep">{'·'}</span> frets {fretText(v.shape)}
          </div>
        </div>
        <div className="row dict-detail-play">
          <PlayButton play={playSpec(v, 'strum')} label="Play chord" />
          <PlayButton play={playSpec(v, 'arpeggio')} label="Play arpeggio" small />
          <label className="tools-check">
            <input type="checkbox" checked={inCompare} disabled={!inCompare && compareFull} onChange={onCompare} /> Compare
          </label>
        </div>
      </div>
      <ul className="dict-facts">
        <li>
          <span className="muted">Bass</span> <span><b>{pretty(tones.find((t) => t.isBass)?.note ?? v.bassDegree)}</b> {bassText(v)}
          {v.slashName ? <> {'—'} written {pretty(v.slashName)}</> : null}
          </span>
        </li>
        <li>
          <span className="muted">Strings</span> <span>{v.stringSet} ({v.strings.length} sounding{muted.length ? `; muted ${muted.join(', ')}` : ''})</span>
        </li>
        <li>
          <span className="muted">Frets</span> <span>{v.minFret === v.maxFret && v.minFret === 0 ? 'open' : `${v.minFret}–${v.maxFret}`}
          {v.barre ? ', barre' : ''}
          {v.hasOpenStrings ? ', open strings' : ''}
          </span>
        </li>
        <li>
          <span className="muted">Left out</span> <span className={omitted ? 'dict-omitted' : ''}>{omitted ? omitted + ' (intentional)' : 'nothing, every chord tone is present'}</span>
        </li>
      </ul>
      <div className="row">
        <Seg<'near' | 'whole'> label="Voicing fret range" options={[{ id: 'near', label: 'Zoom to shape' }, { id: 'whole', label: 'Whole neck 0–22' }]} value={wholeNeck ? 'whole' : 'near'} onChange={(m) => onWholeNeck(m === 'whole')} />
      </div>
      <div className="tools-board dict-bigboard" style={{ ['--dict-fb-min' as string]: `${Math.max(620, (hi - lo + 1) * 48)}px` }}>
        <Fretboard marks={marks} frets={[lo, hi]} ariaLabel={`${v.slashName ?? v.symbol} voicing, frets ${fretText(v.shape)}`} />
      </div>
    </div>
  )
}
