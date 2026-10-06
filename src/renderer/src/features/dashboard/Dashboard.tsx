import { UNITS, findLesson } from '@/content/units'
import type { Route } from '@/App'
import { isPassed, isUnlocked } from '@/state/unlock'
import { STAGES, unitLabel } from '@/content/curriculum'
import type { Unit } from '@/content/types'
import { useProgress } from '@/state/progress'
import { ArrowRight, AudioLines, Bookmark, Check, LockKeyhole, Search } from 'lucide-react'
import './dashboard.css'

export function Dashboard({ go }: { go: (r: Route) => void }) {
  const p = useProgress()
  const totalLessons = UNITS.reduce((n, u) => n + u.lessons.length, 0)
  // Count only lessons that still exist (saved progress can mention lessons removed or renamed since).
  const doneLessons = UNITS.reduce((n, u) => n + u.lessons.filter((l) => p.lessonsDone[l.id]).length, 0)
  const passedUnits = UNITS.filter((u) => isPassed(u, p)).length
  const earTotals = Object.values(p.ear).flatMap((d) => Object.values(d))
  const earRight = earTotals.reduce((n, s) => n + s.right, 0)
  const earAll = earTotals.reduce((n, s) => n + s.total, 0)

  // Next lesson: first incomplete lesson in an unlocked unit
  // (along the core path; electives are optional side routes)
  let nextLesson: { id: string; title: string } | null = null
  for (const u of UNITS) {
    if (u.elective) continue
    if (!isUnlocked(u)) break
    const l = u.lessons.find((x) => !p.lessonsDone[x.id])
    if (l) {
      nextLesson = { id: l.id, title: l.title }
      break
    }
  }
  const last = p.lastLesson ? findLesson(p.lastLesson) : null
  const nextQuiz = UNITS.find((u) => isUnlocked(u) && u.lessons.length && u.lessons.every((l) => p.lessonsDone[l.id]) && !isPassed(u, p))

  return (
    <div className="page dashboard">
      <header className="dashboard-heading"><h1>Your practice</h1><div className="dashboard-shortcuts">
        <button className="btn ghost" onClick={() => go({ page: 'ear' })}><AudioLines size={16} aria-hidden />Ear training</button>
        <button className="btn ghost" onClick={() => go({ page: 'library' })}><Search size={16} aria-hidden />Lessons</button>
        <button className="btn ghost" onClick={() => go({ page: 'library', savedOnly: true })}><Bookmark size={16} aria-hidden />Bookmarks</button>
      </div></header>
      {nextLesson && <section className="dashboard-resume" aria-label="Next lesson">
        <div><span className="eyebrow">{doneLessons ? 'Next lesson' : 'First lesson'}</span><h2>{nextLesson.title}</h2>
          {last && <p className="muted small">Last visited: {unitLabel(last.unit)}, {last.lesson.title}</p>}
        </div>
        <button className="btn primary" aria-label={`${doneLessons ? 'Continue' : 'Start'}: ${nextLesson.title}`} onClick={() => go({ page: 'lesson', lessonId: nextLesson.id })}>{doneLessons ? 'Continue lesson' : 'Start lesson'}<ArrowRight size={17} aria-hidden /></button>
      </section>}
      {nextQuiz && <div className="dashboard-quiz"><span>{unitLabel(nextQuiz)}: {nextQuiz.title}</span><button className="btn" onClick={() => go({ page: 'quiz', unitId: nextQuiz.id })}>Take quiz<ArrowRight size={16} aria-hidden /></button></div>}

      <div className="stats">
        <Stat label="Lessons completed" value={`${doneLessons} / ${totalLessons}`} pct={totalLessons ? doneLessons / totalLessons : 0} />
        <Stat label="Units passed" value={`${passedUnits} / ${UNITS.length}`} pct={UNITS.length ? passedUnits / UNITS.length : 0} />
        <Stat label="Ear-training accuracy" value={earAll ? `${Math.round((earRight / earAll) * 100)}%` : '–'} pct={earAll ? earRight / earAll : 0} sub={earAll ? `${earAll} answers` : 'Not started'} />
      </div>

      {!nextLesson && last && <p className="muted small">Last visited: {unitLabel(last.unit)}, {last.lesson.title}</p>}

      <h2>Your path</h2>
      {STAGES.map((stage, si) => {
        const units = UNITS.filter((u) => u.stage === stage.id)
        if (!units.length) return null
        return (
          <section key={stage.id} className="stage">
            <h3 className="stage-title">Stage {si + 1}: {stage.title}</h3>
            <p className="muted small stage-sum">{stage.summary}</p>
            <div className="unit-grid">
              {units.map((u) => <UnitCard key={u.id} u={u} go={go} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function UnitCard({ u, go }: { u: Unit; go: (r: Route) => void }) {
  const p = useProgress()
  const done = u.lessons.filter((l) => p.lessonsDone[l.id]).length
  const q = p.quizzes[u.id]
  const unlocked = isUnlocked(u)
  return (
    <button className={'unit-card' + (unlocked ? '' : ' locked') + (u.elective ? ' elective' : '')} onClick={() => go({ page: 'unit', unitId: u.id })}>
      <div className="unit-card-num">{isPassed(u, p) ? <Check size={16} aria-label="Passed" /> : !unlocked ? <LockKeyhole size={15} aria-label="Locked" /> : u.elective ? 'E' : u.number}</div>
      <div className="unit-card-title">{u.title}</div>
      {u.elective && <div className="unit-card-tag">Optional elective</div>}
      <div className="unit-card-sum">{u.summary}</div>
      <div className="mini-bar">
        <div style={{ width: `${u.lessons.length ? (done / u.lessons.length) * 100 : 0}%` }} />
      </div>
      <div className="unit-card-meta">
        {done}/{u.lessons.length} lessons {q ? `· quiz best ${Math.round(q.best * 100)}%` : ''}
      </div>
    </button>
  )
}

function Stat({ label, value, pct, sub }: { label: string; value: string; pct: number; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="mini-bar">
        <div style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  )
}
