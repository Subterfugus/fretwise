import { useMemo } from 'react'
import { Fretboard } from '@/components/Fretboard'
import { PlayButton } from '@/components/PlayButton'
import { playScale } from '@/content/helpers'
import { CHORDS, ChordType, diatonicChords } from '@/theory/chords'
import { CAGED_ORDER, CagedForm } from '@/theory/guitar'
import { pitchClass, pretty } from '@/theory/notes'
import { SCALES, ScaleType } from '@/theory/scales'
import { ALL_CHORD_TYPES, ALL_SCALE_TYPES } from './catalog'
import { ExplorerSpec, PositionFilter, boxCount, explorerInfo, explorerMarks, explorerRoot } from './explorer'
import { isMinorish, rootName } from './names'
import { Chips, Field, NumberInput, RootPicker, Seg, useEngineReady, usePref } from './ui'
import { safeVoicing } from './useVoicing'
import { LabelMode } from '@/content/helpers'
import { engine } from '@/audio/engine'
import { PresetControls } from './PresetControls'
import type { ExplorerPresetConfig } from '@/state/toolPresets'
import './workspacePolish.css'

type PosKind = PositionFilter['kind']

export function ExplorerTab({ initialConfig }: { initialConfig?: ExplorerPresetConfig }) {
  const ready = useEngineReady()
  const [mode, setMode] = usePref<'scale' | 'chord'>('ex.mode', 'scale', undefined, initialConfig?.mode)
  const [scaleRoot, setScaleRoot] = usePref('ex.scaleRoot', 0, undefined, initialConfig?.scaleRoot)
  const [chordRoot, setChordRoot] = usePref('ex.chordRoot', 0, undefined, initialConfig?.chordRoot)
  const [scale, setScale] = usePref<ScaleType>('ex.scale', 'major', (v) => typeof v === 'string' && Object.hasOwn(SCALES, v), initialConfig?.scale)
  const [chord, setChord] = usePref<ChordType>('ex.chord', 'maj', (v) => typeof v === 'string' && Object.hasOwn(CHORDS, v), initialConfig?.chord)
  const [label, setLabel] = usePref<LabelMode>('ex.label', 'note', undefined, initialConfig?.label)
  const [maxFret, setMaxFret] = usePref('ex.maxFret', 15, undefined, initialConfig?.maxFret)
  const [posKind, setPosKind] = usePref<PosKind>('ex.posKind', 'all', undefined, initialConfig?.posKind)
  const [caged, setCaged] = usePref<CagedForm>('ex.caged', 'E', undefined, initialConfig?.caged)
  const [box, setBox] = usePref('ex.box', 0, undefined, initialConfig?.box)
  const [boxWindow, setBoxWindow] = usePref('ex.boxWindow', false, (v) => typeof v === 'boolean', initialConfig ? initialConfig.boxWindow ?? false : undefined)
  const [lo, setLo] = usePref('ex.lo', 0, undefined, initialConfig?.lo)
  const [hi, setHi] = usePref('ex.hi', 5, undefined, initialConfig?.hi)

  const effectiveKind: PosKind = mode === 'chord' && posKind === 'box' ? 'all' : posKind
  const position: PositionFilter =
    effectiveKind === 'caged' ? { kind: 'caged', form: caged } : effectiveKind === 'box' ? { kind: 'box', degree: box, ...(boxWindow ? { frets: [lo, hi] as [number, number] } : {}) } : effectiveKind === 'window' ? { kind: 'window', lo, hi } : { kind: 'all' }

  const rootPc = mode === 'scale' ? scaleRoot : chordRoot
  const spec: ExplorerSpec = { mode, rootPc, scale, chord, label, maxFret, position }
  const root = explorerRoot(spec)
  const info = useMemo(() => explorerInfo(spec), [mode, rootPc, scale, chord]) // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => explorerMarks(spec), [mode, rootPc, scale, chord, label, maxFret, effectiveKind, caged, box, boxWindow, lo, hi]) // eslint-disable-line react-hooks/exhaustive-deps
  const minor = isMinorish(mode === 'scale' ? SCALES[scale].intervals : CHORDS[chord].intervals)

  // Key context for "chords in this key" (always follows the scale selection).
  const keyRoot = rootName(scaleRoot, isMinorish(SCALES[scale].intervals))
  const keyChords = useMemo(() => {
    if (SCALES[scale].intervals.length !== 7) return null
    try {
      return { triads: diatonicChords(keyRoot, scale, false), sevenths: diatonicChords(keyRoot, scale, true) }
    } catch {
      return null
    }
  }, [keyRoot, scale])

  const pickChord = (r: string, t: ChordType) => {
    setChordRoot(pitchClass(r))
    setChord(t)
    setMode('chord')
  }
  const voicing = mode === 'chord' ? safeVoicing(root, chord) : null
  const presetConfig: ExplorerPresetConfig = { mode, scaleRoot, chordRoot, scale, chord, label, maxFret, posKind, caged, box, boxWindow, lo, hi }
  const loadPreset = (c: ExplorerPresetConfig) => {
    engine.stop()
    setMode(c.mode)
    setScaleRoot(c.scaleRoot)
    setChordRoot(c.chordRoot)
    setScale(c.scale)
    setChord(c.chord)
    setLabel(c.label)
    setMaxFret(c.maxFret)
    setPosKind(c.posKind)
    setCaged(c.caged)
    setBox(c.box)
    setBoxWindow(c.boxWindow ?? false)
    setLo(c.lo)
    setHi(c.hi)
  }

  return (
    <div className="tools-pane tool-workspace explorer-workspace">
      <PresetControls tool="explorer" config={presetConfig} onLoad={loadPreset} />
      <div className="workspace-band explorer-neck">
        <div className="tools-controls">
          <Seg label="Explore scale or chord" options={[{ id: 'scale', label: 'Scale / mode' }, { id: 'chord', label: 'Chord' }]} value={mode} onChange={setMode} />
          {mode === 'scale' ? (
            <Field label="Scale">
              <select value={scale} onChange={(e) => setScale(e.target.value as ScaleType)}>
                {ALL_SCALE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SCALES[t].name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Chord">
              <select value={chord} onChange={(e) => setChord(e.target.value as ChordType)}>
                {ALL_CHORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {pretty(`${CHORDS[t].symbol || 'maj'} - ${CHORDS[t].name}`)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <RootPicker pc={rootPc} minor={minor} onChange={mode === 'scale' ? setScaleRoot : setChordRoot} />
        <div className="workspace-musical-heading"><h3>{pretty(info.title)}</h3><div className="explorer-notes"><span className="muted">Notes</span><Chips items={info.notes} /></div></div>
        <div className="tools-board">
          <Fretboard marks={marks} frets={[0, maxFret]} hoverNames noteContext={{ key: root + (minor ? 'm' : '') }} />
        </div>
        <div className="tools-controls">
          <Field label="Labels">
            <Seg<LabelMode>
              label="Fretboard labels"
              options={[{ id: 'note', label: 'Note' }, { id: 'interval', label: 'Interval' }, { id: 'degree', label: 'Degree' }, { id: 'none', label: 'None' }]}
              value={label}
              onChange={setLabel}
            />
          </Field>
          <Field label="Frets">
            <Seg label="Fretboard range" options={[{ id: 15, label: '0-15' }, { id: 22, label: '0-22' }]} value={maxFret} onChange={setMaxFret} />
          </Field>
          <Field label="Show">
            <select value={effectiveKind} onChange={(e) => setPosKind(e.target.value as PosKind)}>
              <option value="all">Whole neck</option>
              <option value="caged">CAGED position</option>
              {mode === 'scale' && <option value="box">Box ({SCALES[scale].intervals.length <= 5 ? '2' : '3'} notes per string)</option>}
              <option value="window">Fret window</option>
            </select>
          </Field>
          {effectiveKind === 'caged' && (
            <Field label="Shape">
              <Seg label="Chord shape" options={CAGED_ORDER.map((f) => ({ id: f, label: f }))} value={caged} onChange={setCaged} />
            </Field>
          )}
          {effectiveKind === 'box' && (
            <>
            <Field label="Box">
              <Seg label="Scale box" options={Array.from({ length: boxCount(scale) }, (_, i) => ({ id: i, label: String(i + 1) }))} value={box % boxCount(scale)} onChange={setBox} />
            </Field>
            <Field label="Limit box to fret window"><input type="checkbox" checked={boxWindow} onChange={(e) => setBoxWindow(e.target.checked)} /></Field>
            </>
          )}
          {(effectiveKind === 'window' || effectiveKind === 'box' && boxWindow) && (
            <>
              <Field label="From fret">
                <NumberInput min={0} max={22} value={lo} onChange={setLo} className="tools-num" />
              </Field>
              <Field label="To fret">
                <NumberInput min={0} max={22} value={hi} onChange={setHi} className="tools-num" />
              </Field>
            </>
          )}
        </div>
        <div className="row workspace-transport">
          {mode === 'scale' ? (
            <>
              <PlayButton play={playScale(root, scale, 3, false)} label="Play scale" />
              <PlayButton play={playScale(root, scale, 3, true)} label="Up and back" small />
            </>
          ) : voicing ? (
            <>
              <PlayButton play={{ kind: 'shape', shape: voicing, mode: 'strum' }} label="Play chord" />
              <PlayButton play={{ kind: 'shape', shape: voicing, mode: 'arpeggio' }} label="Arpeggiate" small />
            </>
          ) : null}
          <span className="muted">{ready === 'loading' ? 'Loading sounds...' : ready === 'error' ? 'Sounds unavailable' : ''}</span>
        </div>
      </div>

      <div className="workspace-band explorer-formula">
        <h3 className="tools-h">{pretty(info.title)} formula</h3>
        <div className="tools-facts">
          <div>
            <span className="muted">Formula</span> <b>{pretty(info.formula)}</b>
          </div>
          {info.steps && (
            <div>
              <span className="muted">Steps</span> <b>{info.steps}</b>
            </div>
          )}
          {info.feel && <div className="muted">{pretty(info.feel)}</div>}
        </div>
      </div>

      <div className="workspace-band explorer-key">
        <h3 className="tools-h">Chords in {pretty(keyRoot)} {SCALES[scale].name.split(' (')[0].toLowerCase()}</h3>
        {keyChords ? (
          <>
            {([['Triads', keyChords.triads], ['Seventh chords', keyChords.sevenths]] as const).map(([name, list]) => (
              <div key={name} className="tools-keyrow">
                <span className="muted tools-keyrow-name">{name}</span>
                <span className="tools-chips">
                  {list.map((c) => (
                    <button
                      key={c.degree}
                      className={'tools-chip' + (mode === 'chord' && c.type === chord && pitchClass(c.root) === chordRoot ? ' on' : '')}
                      onClick={() => pickChord(c.root, c.type)}
                      title="Show this chord on the fretboard"
                    >
                      <small>{pretty(c.roman)}</small>
                      {pretty(c.symbol)}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {mode === 'chord' && (
              <div className="row">
                <button className="btn ghost" onClick={() => setMode('scale')}>
                  Back to the scale
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">Diatonic chords require a seven-note scale or mode.</p>
        )}
      </div>
    </div>
  )
}
