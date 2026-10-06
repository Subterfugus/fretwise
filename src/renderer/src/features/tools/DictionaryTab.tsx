import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import { LabelMode, playScale, scaleMarks } from '@/content/helpers'
import { diatonicChords } from '@/theory/chords'
import { noteName, pitchClass, pretty } from '@/theory/notes'
import { useSpelling } from '@/state/useSpelling'
import { SCALES, ScaleType, buildScale, degreeLabels, stepPattern } from '@/theory/scales'
import { CHORD_CATEGORIES, SCALE_CATEGORIES } from './catalog'
import { ChordEntry } from './ChordEntry'
import { relatedModes } from './explorer'
import { DictView, KEY_SCALE_OPTIONS, isDictView, isDictionaryQuery, isDictionaryRoot, parseDictionaryQuery, resolveBrowseView, sameView, viewFor, viewLabel } from './keyDictionary'
import { KeyEntry } from './KeyEntry'
import { MAJOR_ROOTS, chordLabel } from './names'
import { Chips, Field, Seg, useEngineReady, usePref } from './ui'
import './dictionary.css'

const EXAMPLES = ['Bm', 'F#m7b5', 'D major', 'E dorian', 'key of Bb', 'Bb maj7', 'C7#9', 'Gsus4', 'Ebdim7', 'A minor pentatonic']

const describe = (v: DictView): string => {
  if (v.kind === 'chord') return `${pretty(chordLabel(v.root, v.type))} chord`
  if (v.kind === 'key') return `${pretty(viewLabel(v))} key`
  return `${pretty(v.root)} ${SCALES[v.type].name} scale`
}

export function DictionaryTab({ entry }: { entry?: DictView }) {
  const ready = useEngineReady()
  const spelling = useSpelling()
  const [query, setQuery] = usePref('dict.query', '', isDictionaryQuery)
  const [stored, setStored] = usePref<DictView>('dict.sel', { kind: 'chord', root: 'C', type: 'maj7' }, isDictView)
  const sel = useMemo<DictView>(() => (stored.kind === 'scale' ? viewFor(stored) : stored), [stored])
  const [browseRoot, setBrowseRoot] = usePref('dict.root', 'C', isDictionaryRoot)
  const browsePc = pitchClass(browseRoot)
  const browsePreferred = spelling.spellPc(browsePc, { key: MAJOR_ROOTS[browsePc] })
  const [touched, setTouched] = useState(false)
  // In-dictionary trail: where we came from when following links (key -> chord -> scale ...).
  const [history, setHistory] = useState<DictView[]>([])
  const results = useMemo(() => parseDictionaryQuery(query), [query])

  const viewKey = `${sel.kind}:${sel.root}:${sel.type}`
  // Switching entries (or leaving the dictionary) must not leave sound running.
  useEffect(() => () => engine.stop(), [viewKey])
  // Following a link or going back should land at the top of the new entry, not mid-page.
  const topRef = useRef<HTMLDivElement>(null)
  const scrollNext = useRef(false)
  useEffect(() => {
    if (!entry || !isDictView(entry)) return
    scrollNext.current = true
    setHistory([])
    setStored(entry.kind === 'scale' ? viewFor(entry) : entry)
  }, [entry, setStored])
  useEffect(() => {
    if (scrollNext.current) {
      scrollNext.current = false
      topRef.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [viewKey])

  /** Follow a link (push: remember where we were) or replace the current entry (pickers). */
  const navigate = useCallback(
    (view: DictView, opts?: { push?: boolean }) => {
      const target = view.kind === 'scale' ? viewFor(view) : view
      if (sameView(target, sel)) return
      if (opts?.push) {
        scrollNext.current = true
        setHistory((h) => [...h, sel])
      }
      setStored(target)
    },
    [sel, setStored]
  )
  /** A fresh start from search or browse: forget the trail. */
  const jump = (view: DictView) => {
    setHistory([])
    setStored(view)
  }
  const goBackTo = (index: number) => {
    const target = history[index]
    if (!target) return
    scrollNext.current = true
    setHistory(history.slice(0, index))
    setStored(target)
  }

  const onQuery = (q: string) => {
    setQuery(q)
    setTouched(true)
    const r = parseDictionaryQuery(q)
    if (r.length) jump(r[0])
  }

  const prev = history[history.length - 1]

  return (
    <div className="tools-pane dict-pane" ref={topRef}>
      <div className="card dict-search-section">
        <div className="tools-controls">
          <Field label="Search a chord, key or scale">
            <div className="dict-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                type="text"
                className="tools-search"
                value={query}
                placeholder="e.g. Bm, F#m7b5, D major, E dorian, key of Bb"
                onChange={(e) => onQuery(e.target.value)}
                spellCheck={false}
                aria-label="Search a chord, key or scale"
              />
            </div>
          </Field>
        </div>
        <div className="tools-chips dict-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="tools-chip" onClick={() => onQuery(ex)}>
              {pretty(ex)}
            </button>
          ))}
        </div>
        {query.trim() && results.length === 0 && touched && (
          <p className="muted">
            Nothing matched "{query}". Try a root plus a type: maj7, m7, m7b5, dim7, aug, sus4, add9, 7#9, 13, a key like "key of Bb" or "D major", or a scale like "E dorian" or "A blues".
          </p>
        )}
        {results.length > 1 && (
          <div className="row">
            <span className="muted">Did you mean:</span>
            {results.map((r, i) => (
              <button key={i} className={'tools-chip' + (sameView(r, sel) ? ' on' : '')} onClick={() => jump(r)}>
                {describe(r)}
              </button>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && prev && (
        <nav className="dict-trail" aria-label="Dictionary history">
          <button type="button" className="btn" onClick={() => goBackTo(history.length - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to {pretty(viewLabel(prev))}
          </button>
          <ol className="dict-crumbs">
            {history.map((h, i) => (
              <li key={i}>
                <button type="button" className="link" onClick={() => goBackTo(i)}>
                  {pretty(viewLabel(h))}
                </button>
              </li>
            ))}
            <li aria-current="page">{pretty(viewLabel(sel))}</li>
          </ol>
        </nav>
      )}

      {sel.kind === 'chord' && <ChordEntry root={sel.root} type={sel.type} ready={ready} onNavigate={navigate} />}
      {sel.kind === 'key' && <KeyEntry key={viewKey} root={sel.root} type={sel.type} ready={ready} onNavigate={navigate} />}
      {sel.kind === 'scale' && <ScaleEntry root={sel.root} type={sel.type} ready={ready} onNavigate={navigate} />}

      <div className="card dict-browse">
        <div className="dict-browse-head">
          <h3 className="tools-h">Browse</h3>
          <Field label="Root">
            <select value={browsePc} onChange={(e) => setBrowseRoot(MAJOR_ROOTS[Number(e.target.value)])}>
              {MAJOR_ROOTS.map((r, pc) => (
                <option key={pc} value={pc}>
                  {pretty(spelling.spellPc(pc, { key: r }))}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h4 className="tools-h4">Keys</h4>
        <div className="tools-chips">
          {KEY_SCALE_OPTIONS.map((t) => {
            const target = resolveBrowseView({ kind: 'key', root: browsePreferred, type: t })
            return <button key={t} className="tools-chip" onClick={() => jump(target)}>
              {pretty(target.root)} {t === 'major' ? 'major' : SCALES[t].name.split(' (')[0].toLowerCase()}
            </button>
          })}
        </div>
        <h4 className="tools-h4">Chords</h4>
        {CHORD_CATEGORIES.map((cat) => (
          <div key={cat.name} className="tools-keyrow">
            <span className="muted tools-keyrow-name">{cat.name}</span>
            <span className="tools-chips">
              {cat.types.map((t) => {
                const target = resolveBrowseView({ kind: 'chord', root: browsePreferred, type: t })
                return <button key={t} className="tools-chip" onClick={() => jump(target)} title={t}>
                  {pretty(chordLabel(target.root, t))}
                </button>
              })}
            </span>
          </div>
        ))}
        <h4 className="tools-h4">Scales</h4>
        {SCALE_CATEGORIES.map((cat) => (
          <div key={cat.name} className="tools-keyrow">
            <span className="muted tools-keyrow-name">{cat.name}</span>
            <span className="tools-chips">
              {cat.types.map((t) => {
                const target = resolveBrowseView({ kind: 'scale', root: browsePreferred, type: t })
                return <button key={t} className="tools-chip" onClick={() => jump(target)}>
                  {pretty(target.root)} {SCALES[t].name}
                </button>
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Entry for scales that are not keys (pentatonic, blues, symmetric ...). Seven-note scales open as KeyEntry. */
function ScaleEntry({ root, type, ready, onNavigate }: { root: string; type: ScaleType; ready: string; onNavigate: (v: DictView, o?: { push?: boolean }) => void }) {
  const def = SCALES[type]
  const [label, setLabel] = useState<LabelMode>('note')
  const notes = buildScale(root, type).map(noteName)
  const marks = useMemo(() => scaleMarks(root, type, { frets: [0, 15], label }), [root, type, label])
  const modes = useMemo(() => relatedModes(root, type), [root, type])
  const chords = useMemo(() => {
    if (def.intervals.length !== 7) return null
    try {
      return diatonicChords(root, type, true)
    } catch {
      return null
    }
  }, [root, type, def.intervals.length])
  return (
    <>
      <div className="card dict-entry-summary">
        <h2 className="tools-title">{pretty(root)} {def.name}</h2>
        <div className="tools-facts">
          <div>
            <span className="muted">Notes</span> <Chips items={notes} />
          </div>
          <div>
            <span className="muted">Formula</span> <b>{pretty(degreeLabels(type).join(' '))}</b>
          </div>
          <div>
            <span className="muted">Steps</span> <b>{stepPattern(type)}</b>
          </div>
          {def.feel && <div className="muted dict-feel">{pretty(def.feel)}</div>}
        </div>
        <div className="row">
          <PlayButton play={playScale(root, type, 3, false)} label="Play scale" />
          <PlayButton play={playScale(root, type, 3, true)} label="Up and back" small />
          <span className="muted">{ready === 'loading' ? 'Loading sounds...' : ''}</span>
        </div>
      </div>
      <div className="card">
        <h3 className="tools-h">On the fretboard</h3>
        <Seg<LabelMode> label="Scale labels" options={[{ id: 'note', label: 'Note' }, { id: 'degree', label: 'Degree' }, { id: 'interval', label: 'Interval' }, { id: 'none', label: 'None' }]} value={label} onChange={setLabel} />
        <div className="tools-board">
          <Fretboard marks={marks} frets={[0, 15]} />
        </div>
      </div>
      <div className="card">
        <h3 className="tools-h">Related modes</h3>
        <div className="tools-chips">
          {modes.map((m) =>
            m.type ? (
              <button key={m.degree} className={'tools-chip' + (m.degree === 1 ? ' on' : '')} onClick={() => onNavigate(viewFor({ kind: 'scale', root: m.root, type: m.type as ScaleType }), { push: true })}>
                <small>{m.degree}</small>
                {pretty(m.root)} {SCALES[m.type].name}
              </button>
            ) : (
              <span key={m.degree} className="tools-chip static">
                <small>{m.degree}</small>
                {pretty(m.root)} (unnamed mode)
              </span>
            )
          )}
        </div>
        {chords && (
          <>
            <h3 className="tools-h">Seventh chords from this scale</h3>
            <div className="tools-chips">
              {chords.map((c) => (
                <button key={c.degree} className="tools-chip" onClick={() => onNavigate({ kind: 'chord', root: c.root, type: c.type }, { push: true })}>
                  <small>{pretty(c.roman)}</small>
                  {pretty(c.symbol)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
