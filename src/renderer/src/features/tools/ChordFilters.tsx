// Filter model + controls for the chord voicing list. Filtering itself is done by chordLibrary's filterLibrary.
import type { BassRole, LibraryFilter, LibraryVoicing, VoicingSize } from './chordLibrary'
import { NumberInput, Seg } from './ui'

export interface FilterState {
  stringSets: string[]
  sizes: VoicingSize[]
  from: number
  to: number
  barre: 'any' | 'only' | 'none'
  bass: 'any' | BassRole
  noOpen: boolean
}

export const DEFAULT_FILTERS: FilterState = { stringSets: [], sizes: [], from: 0, to: 22, barre: 'any', bass: 'any', noOpen: false }

const clampFret = (n: number): number => (Number.isFinite(n) ? Math.min(22, Math.max(0, Math.round(n))) : 0)

export function isFilterState(v: unknown): v is FilterState {
  const o = v as FilterState | null
  return (
    !!o &&
    Array.isArray(o.stringSets) &&
    o.stringSets.every((s) => typeof s === 'string') &&
    Array.isArray(o.sizes) &&
    o.sizes.every((s) => s === 'three' || s === 'four' || s === 'full') &&
    typeof o.from === 'number' &&
    typeof o.to === 'number' &&
    ['any', 'only', 'none'].includes(o.barre) &&
    ['any', 'root', 'third', 'fifth', 'seventh', 'other'].includes(o.bass) &&
    typeof o.noOpen === 'boolean'
  )
}

export const isDefaultFilters = (f: FilterState): boolean =>
  f.stringSets.length === 0 && f.sizes.length === 0 && f.from <= 0 && f.to >= 22 && f.barre === 'any' && f.bass === 'any' && !f.noOpen

/** Translate UI state to the library's filter. String sets that don't exist for this chord are ignored. */
export function toLibraryFilter(f: FilterState, available: string[]): LibraryFilter {
  const from = clampFret(f.from)
  const to = clampFret(f.to)
  return {
    stringSets: f.stringSets.filter((s) => available.includes(s)),
    sizes: f.sizes,
    fretRange: from <= 0 && to >= 22 ? undefined : [Math.min(from, to), Math.max(from, to)],
    barre: f.barre,
    bass: f.bass,
    noOpenStrings: f.noOpen
  }
}

const SIZE_LABEL: Record<VoicingSize, string> = { three: '3 strings', four: '4 strings', full: '5–6 strings' }
const BASS_OPTIONS: { id: FilterState['bass']; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'root', label: 'Root' },
  { id: 'third', label: '3rd' },
  { id: 'fifth', label: '5th' },
  { id: 'seventh', label: '7th' },
  { id: 'other', label: 'Other' }
]

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export function ChordFilters({ value, onChange, library, shown }: { value: FilterState; onChange: (f: FilterState) => void; library: LibraryVoicing[]; shown: number }) {
  const sets = new Map<string, number>()
  for (const v of library) sets.set(v.stringSet, (sets.get(v.stringSet) ?? 0) + 1)
  const setList = [...sets.entries()].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]))
  const patch = (p: Partial<FilterState>) => onChange({ ...value, ...p })
  const active = value.stringSets.filter((s) => sets.has(s))
  return (
    <div className="dict-filters">
      <div className="dict-filter-group">
        <span className="muted" id="dict-f-size">Size</span>
        <div className="dict-toggles" role="group" aria-labelledby="dict-f-size">
          {(['three', 'four', 'full'] as VoicingSize[]).map((s) => (
            <button key={s} type="button" className={'tools-chip' + (value.sizes.includes(s) ? ' on' : '')} aria-pressed={value.sizes.includes(s)} onClick={() => patch({ sizes: toggle(value.sizes, s) })}>
              {SIZE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="dict-filter-group">
        <span className="muted" id="dict-f-bass">Bass note</span>
        <div aria-labelledby="dict-f-bass">
          <Seg<FilterState['bass']> label="Bass note" options={BASS_OPTIONS} value={value.bass} onChange={(bass) => patch({ bass })} />
        </div>
      </div>
      <div className="dict-filter-group">
        <span className="muted" id="dict-f-barre">Barre</span>
        <div aria-labelledby="dict-f-barre">
          <Seg<FilterState['barre']> label="Barre" options={[{ id: 'any', label: 'Any' }, { id: 'only', label: 'Barre only' }, { id: 'none', label: 'No barre' }]} value={value.barre} onChange={(barre) => patch({ barre })} />
        </div>
      </div>
      <div className="dict-filter-group">
        <span className="muted">Fret range</span>
        <div className="dict-range">
          <label>
            <span className="muted">from</span>
            <NumberInput min={0} max={22} value={value.from} aria-label="Lowest fret" onChange={(from) => patch({ from })} />
          </label>
          <label>
            <span className="muted">to</span>
            <NumberInput min={0} max={22} value={value.to} aria-label="Highest fret" onChange={(to) => patch({ to })} />
          </label>
        </div>
      </div>
      <div className="dict-filter-group">
        <span className="muted">&nbsp;</span>
        <label className="tools-check">
          <input type="checkbox" checked={value.noOpen} onChange={(e) => patch({ noOpen: e.target.checked })} /> No open strings
        </label>
      </div>
      <div className="dict-filter-group wide">
        <span className="muted" id="dict-f-sets">String set <small>(1 = high E)</small></span>
        <div className="dict-toggles" role="group" aria-labelledby="dict-f-sets">
          {setList.map(([s, n]) => (
            <button key={s} type="button" className={'tools-chip' + (active.includes(s) ? ' on' : '')} aria-pressed={active.includes(s)} onClick={() => patch({ stringSets: toggle(active, s) })}>
              {s} <small>{n}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="dict-filter-foot">
        <b className="dict-count" role="status" aria-live="polite">
          {shown === library.length ? `${library.length} voicings` : `${shown} of ${library.length} voicings`}
        </b>
        <button type="button" className="btn ghost" disabled={isDefaultFilters(value)} onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset filters
        </button>
      </div>
    </div>
  )
}
