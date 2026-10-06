import { useEffect, useMemo, useRef } from 'react'
import { Bookmark, Check, LockKeyhole, Search, X } from 'lucide-react'
import type { Route } from '@/App'
import { UNITS } from '@/content/units'
import { unitLabel } from '@/content/curriculum'
import { useProgress } from '@/state/progress'
import { isUnlocked } from '@/state/unlock'
import { BookmarkButton } from './BookmarkButton'
import { buildLessonIndex, highlightMatches, searchLessons, type LibraryState } from './lessonSearch'
import './library.css'

const INDEX = buildLessonIndex(UNITS)
const Highlight = ({ text, query }: { text: string; query: string }) => <>{highlightMatches(text, query).map((p, i) => p.match ? <mark key={i}>{p.text}</mark> : p.text)}</>

export function LessonLibrary({ state, change, go, focusRequest }: {
  state: LibraryState; change: (s: LibraryState) => void; go: (r: Route) => void; focusRequest: number
}) {
  const progress = useProgress()
  const searchRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchLessons(INDEX, state, progress.lessonsDone, progress.bookmarks), [state, progress.lessonsDone, progress.bookmarks])
  const savedCount = INDEX.filter((e) => progress.bookmarks.includes(e.id)).length
  const set = (s: Partial<LibraryState>) => change({ ...state, ...s })
  useEffect(() => { if (focusRequest) { searchRef.current?.focus(); searchRef.current?.select() } }, [focusRequest])
  const clear = () => { set({ query: '' }); searchRef.current?.focus() }

  return <div className="page lesson-library">
    <h1>Lessons</h1>
    <div className="library-tabs" role="group" aria-label="Lesson collection">
      <button aria-pressed={!state.savedOnly} className={!state.savedOnly ? 'on' : ''} onClick={() => set({ savedOnly: false })}>All lessons <span>{INDEX.length}</span></button>
      <button aria-pressed={state.savedOnly} className={state.savedOnly ? 'on' : ''} onClick={() => set({ savedOnly: true })}><Bookmark size={16} aria-hidden />Bookmarks <span>{savedCount}</span></button>
    </div>
    <div className="library-search" role="search">
      <Search size={19} aria-hidden />
      <input ref={searchRef} type="text" aria-label="Search lessons" placeholder="Search lessons" maxLength={240} value={state.query}
        onChange={(e) => set({ query: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); clear() } }} />
      <button className="library-clear" aria-label="Clear search" title="Clear search" disabled={!state.query} onClick={clear}><X size={18} aria-hidden /></button>
    </div>
    <div className="library-filters">
      <label>Unit<select aria-label="Filter by unit" value={state.unitId} onChange={(e) => set({ unitId: e.target.value })}>
        <option value="">All units</option>{UNITS.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}: {u.title}</option>)}
      </select></label>
      <label>Progress<select aria-label="Filter by progress" value={state.status} onChange={(e) => set({ status: e.target.value as LibraryState['status'] })}>
        <option value="all">All lessons</option><option value="incomplete">Not completed</option><option value="completed">Completed</option>
      </select></label>
      <button className="btn ghost" disabled={!state.query && !state.unitId && state.status === 'all'} onClick={() => change({ ...state, query: '', unitId: '', status: 'all' })}><X size={15} aria-hidden />Clear filters</button>
    </div>
    <p className="library-count muted" role="status" aria-live="polite">{results.length} {results.length === 1 ? 'lesson' : 'lessons'}{state.savedOnly ? ' bookmarked' : ''}</p>
    {!results.length ? <div className="library-empty">
      <h2>{state.savedOnly && !savedCount ? 'No bookmarked lessons' : 'No matching lessons'}</h2>
      {!!savedCount || !state.savedOnly ? <button className="btn" onClick={() => change({ ...state, query: '', unitId: '', status: 'all' })}>Clear filters</button> :
        <button className="btn" onClick={() => change({ query: '', unitId: '', status: 'all', savedOnly: false })}>Browse lessons</button>}
    </div> : <ul className="library-results" aria-label="Lessons">
      {results.map(({ entry, snippet }) => {
        const unlocked = isUnlocked(UNITS.find((u) => u.id === entry.unitId)!)
        const done = !!progress.lessonsDone[entry.id]
        return <li className="library-result" key={entry.id} data-lesson-id={entry.id}>
          <button className="library-open" aria-label={unlocked ? `Open ${entry.title}` : `View locked unit for ${entry.title}`}
            onClick={() => go(unlocked ? { page: 'lesson', lessonId: entry.id, from: 'library' } : { page: 'unit', unitId: entry.unitId })}>
            <span className="library-meta">{entry.unitLabel} / Lesson {entry.lessonNumber} <span>{done && <><Check size={14} aria-hidden />Completed</>}{!unlocked && <><LockKeyhole size={14} aria-hidden />Locked</>}</span></span>
            <span className="library-title"><Highlight text={entry.title} query={state.query} /></span>
            <span className="library-unit"><Highlight text={entry.unitTitle} query={state.query} /></span>
            {snippet && <span className="library-snippet"><Highlight text={snippet} query={state.query} /></span>}
          </button>
          <BookmarkButton lesson={entry} />
        </li>
      })}
    </ul>}
  </div>
}
