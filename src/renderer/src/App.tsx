import { Fragment, useEffect, useRef, useState } from 'react'
import { UNITS } from './content/units'
import { useProgress } from './state/progress'
import { isPassed, isUnlocked, prerequisites } from './state/unlock'
import { STAGES, unitLabel } from './content/curriculum'
import { LessonView } from './features/lessons/LessonView'
import { UnitView } from './features/lessons/UnitView'
import { QuizView } from './features/quiz/QuizView'
import { Dashboard } from './features/dashboard/Dashboard'
import { Settings } from './features/settings/Settings'
import { EarTraining } from './features/ear/EarTraining'
import { MicPractice } from './features/mic/MicPractice'
import { Tools, type ToolTab } from './features/tools/Tools'
import { engine } from './audio/engine'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DESKTOP_DOWNLOAD_URL, isDesktop } from './platform'
import { AudioLines, Check, Download, House, LockKeyhole, Mic, Search, Settings2, Wrench } from 'lucide-react'
import { LessonLibrary } from './features/lessons/LessonLibrary'
import { DEFAULT_LIBRARY, type LibraryState } from './features/lessons/lessonSearch'
import type { DictView } from './features/tools/keyDictionary'
import type { ToolLaunch } from './features/tools/toolLaunch'

export interface LessonOrigin { lessonId: string; from?: 'library'; blockIndex: number }

export type Route =
  | { page: 'home' }
  | { page: 'unit'; unitId: string }
  | { page: 'lesson'; lessonId: string; from?: 'library'; blockIndex?: number }
  | { page: 'library'; savedOnly?: boolean }
  | { page: 'quiz'; unitId: string }
  | { page: 'ear' }
  | { page: 'mic' }
  | { page: 'tools'; tab?: ToolTab; dictionaryEntry?: DictView; launch?: ToolLaunch; lessonOrigin?: LessonOrigin }
  | { page: 'settings' }

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'home' })
  // Bumped on every navigation and used as the page's key, so choosing the page you are
  // already on (e.g. "Ear training" while inside a drill) remounts it back to its start.
  const [nav, setNav] = useState(0)
  const progress = useProgress()
  const mainRef = useRef<HTMLElement>(null)
  const [library, setLibrary] = useState<LibraryState>(DEFAULT_LIBRARY)
  const [searchFocus, setSearchFocus] = useState(0)

  const go = (r: Route) => {
    engine.stop()
    if (r.page === 'library' && r.savedOnly !== undefined) setLibrary((s) => ({ ...s, savedOnly: r.savedOnly! }))
    setRoute(r)
    setNav((n) => n + 1)
  }
  useEffect(() => {
    const anchor = route.page === 'lesson' && route.blockIndex !== undefined ? mainRef.current?.querySelector(`[data-lesson-block="${route.blockIndex}"]`) : undefined
    if (!anchor) { mainRef.current?.scrollTo(0, 0); return }
    let cancelled = false
    let frame: number | undefined
    // Notation draws after its font promise resolves; restore against the finished layout.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled) frame = requestAnimationFrame(() => anchor.scrollIntoView({ block: 'start', behavior: 'instant' }))
    })
    return () => { cancelled = true; if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [route])
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.altKey) {
        e.preventDefault()
        engine.stop()
        setRoute({ page: 'library' })
        setNav((n) => n + 1)
        setSearchFocus((n) => n + 1)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  const routeUnit = route.page === 'unit' || route.page === 'quiz' ? UNITS.find((u) => u.id === route.unitId) : undefined
  const activeUnit =
    route.page === 'unit' || route.page === 'quiz'
      ? route.unitId
      : route.page === 'lesson'
        ? UNITS.find((u) => u.lessons.some((l) => l.id === route.lessonId))?.id
        : undefined

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main navigation">
        <button className="brand" aria-label="Fretwise home" onClick={() => go({ page: 'home' })}>
          <img src="/icon.png" alt="" width={26} height={26} /> Fretwise
        </button>
        <button className={'nav-item' + (route.page === 'home' ? ' active' : '')} onClick={() => go({ page: 'home' })}>
          <House className="nav-ico" size={18} aria-hidden /> Dashboard
        </button>
        <button className={'nav-item' + (route.page === 'ear' ? ' active' : '')} onClick={() => go({ page: 'ear' })}>
          <AudioLines className="nav-ico" size={18} aria-hidden /> Ear training
        </button>
        <button className={'nav-item' + (route.page === 'mic' ? ' active' : '')} onClick={() => go({ page: 'mic' })}>
          <Mic className="nav-ico" size={18} aria-hidden /> Tuner &amp; play-along
        </button>
        <button className={'nav-item' + (route.page === 'tools' ? ' active' : '')} onClick={() => go({ page: 'tools' })}>
          <Wrench className="nav-ico" size={18} aria-hidden /> Tools
        </button>
        <div className="nav-section">Curriculum</div>
        <button className={'nav-item' + (route.page === 'library' ? ' active' : '')} title="Search lessons (Ctrl+K)" onClick={() => go({ page: 'library' })}>
          <Search className="nav-ico" size={18} aria-hidden /> Lessons
        </button>
        <div className="nav-units">
          {UNITS.map((u, i) => {
            const unlocked = isUnlocked(u)
            const done = u.lessons.filter((l) => progress.lessonsDone[l.id]).length
            const passed = isPassed(u, progress)
            const stage = u.stage !== UNITS[i - 1]?.stage ? STAGES.findIndex((s) => s.id === u.stage) : -1
            const lockHint = `Pass ${prerequisites(u).map((p) => `${unitLabel(p)} (${p.title})`).join(' and ')} to unlock (or enable "Unlock all" in Settings)`
            return (
              <Fragment key={u.id}>
              {stage >= 0 && <div className="nav-subsection">Stage {stage + 1}: {STAGES[stage].title}</div>}
              <button
                data-unit-id={u.id}
                className={'nav-unit' + (activeUnit === u.id ? ' active' : '') + (unlocked ? '' : ' locked') + (u.elective ? ' elective' : '')}
                onClick={() => go({ page: 'unit', unitId: u.id })}
                title={`${unitLabel(u)}: ${u.title}. ` + (u.elective ? 'Optional elective. ' : '') + (unlocked ? u.summary : lockHint)}
              >
                <span className={'unit-num' + (passed ? ' passed' : '')}>{passed ? <Check size={14} aria-label="Passed" /> : !unlocked ? <LockKeyhole size={13} aria-label="Locked" /> : u.elective ? 'E' : u.number}</span>
                <span className="unit-title">{u.title}</span>
                {u.lessons.length > 0 && (
                  <span className="unit-prog">
                    {done}/{u.lessons.length}
                  </span>
                )}
              </button>
              </Fragment>
            )
          })}
        </div>
        {!isDesktop && (
          <a className="nav-item bottom" href={DESKTOP_DOWNLOAD_URL} title="Download the Fretwise desktop app for Windows">
            <Download className="nav-ico" size={18} aria-hidden /> Download app
          </a>
        )}
        <button className={'nav-item bottom' + (route.page === 'settings' ? ' active' : '')} onClick={() => go({ page: 'settings' })}>
          <Settings2 className="nav-ico" size={18} aria-hidden /> Settings
        </button>
      </nav>
      <main className="main" ref={mainRef}>
        <ErrorBoundary key={nav}>
          {route.page === 'home' && <Dashboard go={go} />}
          {route.page === 'library' && <LessonLibrary state={library} change={setLibrary} go={go} focusRequest={searchFocus} />}
          {route.page === 'ear' && <EarTraining />}
          {route.page === 'mic' && <MicPractice />}
          {route.page === 'tools' && <Tools initialTab={route.tab} launch={route.launch} dictionaryEntry={route.dictionaryEntry} lessonOrigin={route.lessonOrigin} onReturnToLesson={route.lessonOrigin ? () => go({ page: 'lesson', ...route.lessonOrigin! }) : undefined} onDictionaryEntry={(entry) => go({ page: 'tools', tab: 'dictionary', dictionaryEntry: entry, lessonOrigin: route.lessonOrigin })} onToolLaunch={(launch) => go({ page: 'tools', launch, lessonOrigin: route.lessonOrigin })} />}
          {route.page === 'settings' && <Settings />}
          {route.page === 'unit' && (routeUnit ? <UnitView unit={routeUnit} go={go} /> : <div className="page">Unit not found.</div>)}
          {route.page === 'lesson' && <LessonView lessonId={route.lessonId} from={route.from} go={go} />}
          {route.page === 'quiz' &&
            (routeUnit ? (
              <QuizView unit={routeUnit} onExit={() => go({ page: 'unit', unitId: routeUnit.id })} />
            ) : (
              <div className="page">Unit not found.</div>
            ))}
        </ErrorBoundary>
      </main>
    </div>
  )
}
