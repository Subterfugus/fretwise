import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, Play, RotateCcw, Square, Wrench } from 'lucide-react'
import { engine } from '@/audio/engine'
import { Fretboard } from '@/components/Fretboard'
import type { FretMark } from '@/content/types'
import { buildChord } from '@/theory/chords'
import { midiAt, pcAt, type FretPos } from '@/theory/guitar'
import { noteName, pretty } from '@/theory/notes'
import { flushProgress, recordPracticeAnswer, recordPracticeSession, useProgress } from '@/state/progress'
import { useSpelling } from '@/state/useSpelling'
import { rootName } from './names'
import { chordRootFor } from './keyDictionary'
import { Field, RootPicker, Seg, useEngineReady, usePref } from './ui'
import {
  answerTriadRun, BASS_ROLES, chooseTriadQuestion, closestTriadVoicing, diagnoseTriad, gradeTriad,
  TRIAD_INVERSIONS, TRIAD_QUALITIES, TRIAD_SESSION_LENGTH,
  TRIAD_STRING_SETS, triadItemKey, triadPcs, triadQuestionPool, triadVoicings,
  type TriadChallenge, type TriadFailure, type TriadGrade, type TriadInversion, type TriadLevel, type TriadQuality, type TriadRun
} from './triads'
import './triads.css'
import './workspacePolish.css'

const LEVELS: { id: TriadLevel; label: string }[] = [
  { id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' }
]
const FAILURES: Record<TriadFailure, string> = {
  configuration: 'This configuration has no playable answer.', strings: 'Use exactly one note on each requested string.',
  range: 'Keep all three notes in the displayed fret range.', span: 'Keep the highest and lowest frets no more than four apart.',
  tones: 'Use the root, third, and fifth exactly once each.', bass: 'The lowest sounding note must match the requested inversion.'
}

type AudioReady = ReturnType<typeof useEngineReady>

function TriadAudio({ positions, ready }: { positions: FretPos[]; ready: AudioReady }) {
  const [error, setError] = useState('')
  const play = async (mode: 'block' | 'arpeggio') => {
    engine.stop()
    setError('')
    try {
      await engine.playNotes(positions.map((p) => midiAt(p)).sort((a, b) => a - b), mode, { gap: 0.35, duration: 1.7 })
    } catch {
      setError('Sounds unavailable. Try again once the instrument has loaded.')
    }
  }
  return <>
    <div className="row triads-actions">
      <button className="btn" title="Play chord" disabled={!positions.length || ready !== 'ready'} onClick={() => void play('block')}><Play size={16} aria-hidden />Play chord</button>
      <button className="btn ghost" title="Play from the bass note upwards" disabled={!positions.length || ready !== 'ready'} onClick={() => void play('arpeggio')}><Play size={16} aria-hidden />Arpeggiate</button>
      <button className="btn ghost triads-icon" title="Stop sound" aria-label="Stop sound" onClick={() => engine.stop()}><Square size={16} aria-hidden /></button>
    </div>
    {ready !== 'ready' && <p className="muted" role="status">{ready === 'loading' ? 'Loading sounds...' : 'Sounds unavailable'}</p>}
    {error && <p className="tools-err" role="status">{error}</p>}
  </>
}

function useTriadNames(c: TriadChallenge) {
  const { spellPc } = useSpelling()
  const minor = c.quality !== 'maj'
  const context = { key: rootName(c.rootPc, minor) + (minor ? 'm' : '') }
  const preferred = spellPc(c.rootPc, context)
  const theoryRoot = c.quality === 'dim'
    ? chordRootFor(c.rootPc, c.quality)
    : rootName(c.rootPc, minor)
  const displayRoot = c.quality === 'dim' ? theoryRoot : preferred
  const theoryNotes = buildChord(theoryRoot, c.quality).map(noteName)
  const pcs = triadPcs(c)
  const namePosition = (p: FretPos) => {
    const index = pcs.indexOf(pcAt(p))
    return index < 0 ? spellPc(pcAt(p), context) : theoryNotes[index]
  }
  const marksFor = (positions: FretPos[], labels: 'note' | 'degree' = 'note'): FretMark[] => positions.map((p) => ({
    ...p,
    label: labels === 'degree' ? (TRIAD_QUALITIES[c.quality].degrees[pcs.indexOf(pcAt(p))] ?? '?').replace(/^b/, '\u266d') : namePosition(p),
    color: pcAt(p) === c.rootPc ? 'root' : 'tone'
  }))
  return { theoryRoot, theoryNotes, namePosition, marksFor, title: `${pretty(displayRoot)} ${TRIAD_QUALITIES[c.quality].name}` }
}

function TriadDiagnosisView({ c, picks }: { c: TriadChallenge; picks: FretPos[] }) {
  const { theoryNotes, namePosition } = useTriadNames(c)
  const diagnosis = diagnoseTriad(c, picks)
  const nameTone = (tone: { pc: number; role: number | null }) => pretty(tone.role === null
    ? namePosition(diagnosis.notes.find((p) => p.pc === tone.pc)!) : theoryNotes[tone.role])
  return <div className="triads-diagnosis">
    {diagnosis.notes.length > 0 && <table className="triads-notes" aria-label="Selected note roles">
      <thead><tr><th scope="col">String</th><th scope="col">Fret</th><th scope="col">Note</th><th scope="col">Role</th></tr></thead>
      <tbody>{diagnosis.notes.map((p) => <tr key={`${p.string}:${p.fret}`}>
        <th scope="row">{p.string}</th><td>{p.fret}</td><td>{pretty(namePosition(p))}</td>
        <td>{p.role === null ? 'Outside chord' : BASS_ROLES[p.role]}{p.duplicate && <span className="triads-duplicate"> · Duplicate</span>}{p.bass && <strong className="triads-bass-label"> · Bass</strong>}</td>
      </tr>)}</tbody>
    </table>}
    {diagnosis.missing.length > 0 && <p>Missing: {diagnosis.missing.map((t) => `${nameTone(t)} (${BASS_ROLES[t.role!]})`).join(', ')}.</p>}
    {diagnosis.duplicated.length > 0 && <p>Duplicated: {diagnosis.duplicated.map((t) => `${nameTone(t)} (${t.count} copies)`).join(', ')}. Use each chord tone once.</p>}
    {diagnosis.outside.length > 0 && <p>Outside this chord: {diagnosis.outside.map(nameTone).join(', ')}.</p>}
    {diagnosis.notes.some((p) => p.bass) && <p className="triads-bass-summary">Lowest sounding {diagnosis.notes.filter((p) => p.bass).length === 1 ? 'note' : 'notes'}: {diagnosis.notes.filter((p) => p.bass).map((p) => `${pretty(namePosition(p))} on string ${p.string}, fret ${p.fret}`).join('; ')}.
      {' '}{diagnosis.bassMatches ? 'The bass matches this inversion.' : `This inversion needs ${pretty(theoryNotes[c.inversion])}, the ${BASS_ROLES[c.inversion]}, in the bass.`}</p>}
  </div>
}

function TriadExplore({ ready }: { ready: AudioReady }) {
  const [rootPc, setRootPc] = usePref('triads.root', 0, (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) < 12)
  const [quality, setQuality] = usePref<TriadQuality>('triads.quality', 'maj', (v) => v === 'maj' || v === 'min' || v === 'dim')
  const [stringSet, setStringSet] = usePref('triads.strings', 0, (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) < 4)
  const [inversion, setInversion] = usePref<TriadInversion>('triads.inversion', 0, (v) => v === 0 || v === 1 || v === 2)
  const [labels, setLabels] = usePref<'note' | 'degree'>('triads.labels', 'note', (v) => v === 'note' || v === 'degree')
  const [maxFret, setMaxFret] = usePref('triads.maxFret', 12, (v) => v === 12 || v === 22)
  const [shapeIndex, setShapeIndex] = useState(0)
  const c: TriadChallenge = { rootPc, quality, stringSet, inversion, frets: [0, maxFret] }
  const shapes = useMemo(() => triadVoicings(c), [rootPc, quality, stringSet, inversion, maxFret])
  const { theoryRoot, theoryNotes, marksFor, title } = useTriadNames(c)
  useEffect(() => { setShapeIndex(0); engine.stop() }, [rootPc, quality, stringSet, inversion, maxFret])
  const index = Math.min(shapeIndex, Math.max(0, shapes.length - 1))
  const positions = shapes[index] ?? []
  return <section className="triads-section" aria-label="Explore triads">
    <div className="tools-controls">
      <Field label="Quality"><select value={quality} onChange={(e) => setQuality(e.target.value as TriadQuality)}>{Object.entries(TRIAD_QUALITIES).map(([id, q]) => <option key={id} value={id}>{q.name}</option>)}</select></Field>
      <Field label="Strings"><select value={stringSet} onChange={(e) => setStringSet(Number(e.target.value))}>{TRIAD_STRING_SETS.map((strings, i) => <option key={i} value={i}>{strings.join(', ')}</option>)}</select></Field>
      <Field label="Labels"><Seg label="Triad labels" options={[{ id: 'note', label: 'Notes' }, { id: 'degree', label: 'Chord degrees' }]} value={labels} onChange={setLabels} /></Field>
      <Field label="Frets"><Seg label="Triad fret range" options={[{ id: 12, label: '0-12' }, { id: 22, label: '0-22' }]} value={maxFret} onChange={setMaxFret} /></Field>
    </div>
    <RootPicker pc={rootPc} minor={quality !== 'maj'} onChange={setRootPc} />
    <Seg label="Triad inversion" options={TRIAD_INVERSIONS.map((label, id) => ({ id: id as TriadInversion, label }))} value={inversion} onChange={setInversion} />
    <div className="triads-heading"><h2>{title}</h2><span className="muted">{pretty(theoryNotes.join(' - '))}</span></div>
    <p>{TRIAD_INVERSIONS[inversion]}: {pretty(theoryNotes[inversion])}, the {BASS_ROLES[inversion]} of {pretty(theoryRoot)}, is in the bass.</p>
    <div className={`tools-board ${maxFret > 15 ? 'triads-wide-board' : ''}`}><Fretboard marks={marksFor(positions, labels)} frets={c.frets} activeStrings={[...TRIAD_STRING_SETS[stringSet]]} ariaLabel={`${title}, ${TRIAD_INVERSIONS[inversion]}`} playable={ready === 'ready'} /></div>
    {shapes.length ? <>
      <div className="row triads-shapes">
        <button className="btn ghost triads-icon" aria-label="Previous voicing" title="Previous voicing" disabled={index === 0} onClick={() => { engine.stop(); setShapeIndex(index - 1) }}><ArrowLeft size={16} aria-hidden /></button>
        <span>Voicing {index + 1} of {shapes.length}</span>
        <button className="btn ghost triads-icon" aria-label="Next voicing" title="Next voicing" disabled={index === shapes.length - 1} onClick={() => { engine.stop(); setShapeIndex(index + 1) }}><ArrowRight size={16} aria-hidden /></button>
      </div>
      <TriadAudio positions={positions} ready={ready} />
    </> : <p className="muted">No compact voicing in this range. Choose frets 0-22.</p>}
  </section>
}

function TriadBuild({ ready }: { ready: AudioReady }) {
  const [level, setLevel] = usePref<TriadLevel>('triads.level', 'beginner', (v) => LEVELS.some((l) => l.id === v))
  const [run, setRunState] = useState<TriadRun | null>(null)
  const runRef = useRef<TriadRun | null>(null)
  const [picks, setPicks] = useState<FretPos[]>([])
  const [showSolution, setShowSolution] = useState(false)
  const [repair, setRepair] = useState<{ picks: FretPos[]; grade: TriadGrade | null } | null>(null)
  const [finished, setFinished] = useState(false)
  const scored = useRef(false)
  const sessionSaved = useRef(false)
  const startedAt = useRef(0)
  const progress = useProgress().practice.triads
  const question = run?.questions[run.index]
  const c: TriadChallenge = question ?? { rootPc: 0, quality: 'maj', stringSet: 0, inversion: 0, frets: [0, 12] }
  const { theoryRoot, title, theoryNotes, marksFor, namePosition } = useTriadNames(c)
  const result = run?.answers[run.index]
  const setRun = (value: TriadRun) => {
    runRef.current = value
    setRunState(value)
  }
  const saveSession = (current: TriadRun) => {
    if (sessionSaved.current || !current.answers.length) return
    sessionSaved.current = true
    recordPracticeSession('triads', {
      right: current.answers.filter((a) => a.correct).length, total: current.answers.length,
      assisted: current.answers.filter((a) => a.assisted).length, durationMs: Math.max(0, Date.now() - startedAt.current)
    })
  }
  useEffect(() => {
    const savePartial = () => {
      engine.stop()
      const current = runRef.current
      if (current && current.answers.length && !sessionSaved.current) {
        sessionSaved.current = true
        recordPracticeSession('triads', {
          right: current.answers.filter((a) => a.correct).length, total: current.answers.length,
          assisted: current.answers.filter((a) => a.assisted).length, durationMs: Math.max(0, Date.now() - startedAt.current)
        })
      }
    }
    const close = () => { savePartial(); flushProgress(true) }
    window.addEventListener('beforeunload', close)
    window.addEventListener('pagehide', close)
    return () => {
      window.removeEventListener('beforeunload', close)
      window.removeEventListener('pagehide', close)
      savePartial()
    }
  }, [])
  const begin = () => {
    engine.stop()
    const pool = triadQuestionPool(level)
    const questions = []
    let previous: string | undefined
    for (let i = 0; i < TRIAD_SESSION_LENGTH; i++) {
      const q = chooseTriadQuestion(pool, previous)
      if (!q) return
      questions.push(q)
      previous = triadItemKey(q)
    }
    startedAt.current = Date.now()
    scored.current = false
    sessionSaved.current = false
    setRun({ questions, index: 0, answers: [] })
    setPicks([])
    setShowSolution(false)
    setRepair(null)
    setFinished(false)
  }
  const submit = (assisted = false) => {
    const current = runRef.current
    if (!current || scored.current) return
    const next = answerTriadRun(current, picks, assisted)
    if (next === current) return
    scored.current = true
    const answer = next.answers[current.index]
    recordPracticeAnswer('triads', triadItemKey(current.questions[current.index]), answer.correct, answer.assisted)
    setRun(next)
    setShowSolution(assisted)
  }
  const next = () => {
    const current = runRef.current
    if (!current || !current.answers[current.index]) return
    engine.stop()
    setRepair(null)
    if (current.index === TRIAD_SESSION_LENGTH - 1) {
      saveSession(current)
      setFinished(true)
    } else {
      scored.current = false
      setRun({ ...current, index: current.index + 1 })
      setPicks([])
      setShowSolution(false)
    }
  }
  if (!run || finished) return <section className="triads-section" aria-label="Build triads">
    {finished && run && <div className="triads-summary" role="status"><h2>Session complete</h2><p><strong>{run.answers.filter((a) => a.correct).length} / {run.answers.length}</strong> correct</p><p className="muted">{run.answers.filter((a) => a.assisted).length} assisted</p></div>}
    <Field label="Difficulty"><Seg label="Triad difficulty" options={LEVELS} value={level} onChange={setLevel} /></Field>
    <p className="muted">{level === 'beginner' ? 'C, G, and D major; strings 1-3; root position; frets 0-12.' : level === 'intermediate' ? 'All roots; major and minor; strings 1-3 or 2-4; all inversions; frets 0-12.' : 'All roots; major, minor, and diminished; all adjacent string sets and inversions; frets 0-22.'}</p>
    <button className="btn" onClick={begin}><Play size={16} aria-hidden />{finished ? 'New session' : 'Start session'}</button>
    {progress.history.length > 0 && <p className="muted">Last session: {progress.history.at(-1)!.right} / {progress.history.at(-1)!.total} correct, {progress.history.at(-1)!.assisted} assisted</p>}
  </section>
  const workingPicks = repair?.picks ?? picks
  const correction = closestTriadVoicing(c, workingPicks)!
  const displayed = showSolution ? correction.positions : workingPicks
  const displayDiagnosis = diagnoseTriad(c, displayed)
  const displayMarks = marksFor(displayed).map((mark) => {
    const note = displayDiagnosis.notes.find((p) => p.string === mark.string && p.fret === mark.fret)!
    return { ...mark, bass: note.bass, color: note.role === null ? 'muted' as const : note.duplicate ? 'accent' as const : mark.color }
  })
  const canPick = !result || (!!repair && !showSolution)
  const feedbackGrade = repair?.grade ?? result?.grade
  const selectFret = (p: FretPos) => {
    if ((!repair && scored.current) || !TRIAD_STRING_SETS[c.stringSet].some((s) => s === p.string)) return
    const replace = (old: FretPos[]) => [...old.filter((x) => x.string !== p.string), p].sort((a, b) => a.string - b.string)
    if (repair) setRepair({ picks: replace(repair.picks), grade: null })
    else setPicks(replace(picks))
  }
  return <section className="triads-section" aria-label="Build triads">
    <div className="triads-heading"><h2>Build {title}</h2><span className="muted">Question {run.index + 1} / {TRIAD_SESSION_LENGTH}</span></div>
    <p className="triads-prompt"><strong>{TRIAD_INVERSIONS[c.inversion]}</strong> on strings {TRIAD_STRING_SETS[c.stringSet].join(', ')}; frets {c.frets.join('-')}.</p>
    <p className="muted">One note per string. Highest and lowest frets at most four apart.</p>
    <div className={`tools-board ${c.frets[1] - c.frets[0] > 15 ? 'triads-wide-board' : ''}`}><Fretboard frets={c.frets} activeStrings={[...TRIAD_STRING_SETS[c.stringSet]]} ariaLabel={`${title}, ${TRIAD_INVERSIONS[c.inversion]}${showSolution ? ', closest correction' : repair ? ', repair selection' : ', your selection'}`} selected={displayed} marks={result ? displayMarks : []} hoverNames={false} playable={!!result && ready === 'ready'} onPick={canPick ? selectFret : undefined} /></div>
    {!result ? <>
      <p className="muted">{TRIAD_STRING_SETS[c.stringSet].map((string) => `String ${string}: ${picks.find((p) => p.string === string)?.fret ?? '-'}`).join(' | ')}</p>
      <div className="row triads-actions">
        <button className="btn" disabled={picks.length !== 3} onClick={() => submit()}><Check size={16} aria-hidden />Submit</button>
        <button className="btn ghost" title="Reveal an answer; counts as assisted" onClick={() => submit(true)}><Eye size={16} aria-hidden />Reveal</button>
        <button className="btn ghost triads-icon" title="Clear selected frets" aria-label="Clear selected frets" disabled={!picks.length} onClick={() => setPicks([])}><RotateCcw size={16} aria-hidden /></button>
      </div>
    </> : <>
      <div className="triads-feedback" role="status">
        <strong className="triads-original-result">{repair ? 'Original result: ' : ''}{result.assisted ? 'Assisted answer' : result.correct ? 'Correct' : 'Incorrect'}</strong>
        {repair && <p className="triads-repair-status"><strong>{repair.grade?.correct ? 'Shape repaired' : repair.grade ? 'Not repaired yet' : 'Repair attempt'}</strong> · Unscored</p>}
        {(!repair || repair.grade) && feedbackGrade && !feedbackGrade.correct && <p>{FAILURES[feedbackGrade.reason]}</p>}
        <TriadDiagnosisView c={c} picks={workingPicks} />
        <p>{pretty(theoryNotes.join(' - '))}. {pretty(theoryNotes[c.inversion])} is the {BASS_ROLES[c.inversion]} of {pretty(theoryRoot)} and must be the lowest sounding note for {TRIAD_INVERSIONS[c.inversion].toLowerCase()}.</p>
      </div>
      {!result.correct && <>
        <div className="row triads-actions">
          <button className="btn ghost" aria-pressed={showSolution} onClick={() => { engine.stop(); setShowSolution((v) => !v) }}><Eye size={16} aria-hidden />{showSolution ? repair ? 'Repair selection' : 'Your selection' : 'Closest correction'}</button>
          {!repair ? <button className="btn" onClick={() => { engine.stop(); setShowSolution(false); setRepair({ picks: [...picks], grade: null }) }}><Wrench size={16} aria-hidden />Repair this shape</button> : <>
            <button className="btn" disabled={repair.picks.length !== 3 || showSolution || !!repair.grade?.correct} onClick={() => { engine.stop(); setRepair({ ...repair, grade: gradeTriad(c, repair.picks) }) }}><Check size={16} aria-hidden />Check repair</button>
            <button className="btn ghost" onClick={() => { engine.stop(); setRepair(null); setShowSolution(false) }}><ArrowLeft size={16} aria-hidden />Original attempt</button>
          </>}
        </div>
        {correction.changes.length > 0 && <details className="triads-changes">
          <summary>Suggested changes: {correction.changes.length} {correction.changes.length === 1 ? 'string' : 'strings'}{workingPicks.length === 3 ? `, ${correction.distance} total fret ${correction.distance === 1 ? 'step' : 'steps'}` : ''}</summary>
          <ul>{correction.changes.map(({ string, from, to }) => <li key={string}>String {string}: {from ? `move ${pretty(namePosition(from))} at fret ${from.fret} to` : 'add'} {pretty(namePosition(to))} at fret {to.fret} ({BASS_ROLES[triadPcs(c).indexOf(pcAt(to))]}).</li>)}</ul>
        </details>}
      </>}
      <p className="muted triads-audio-label">{showSolution ? 'Closest correction' : repair ? 'Repair selection' : 'Your selection'}</p>
      <TriadAudio positions={displayed} ready={ready} />
      <button className="btn" onClick={next}>{run.index === TRIAD_SESSION_LENGTH - 1 ? 'Finish session' : 'Next'}<ArrowRight size={16} aria-hidden /></button>
    </>}
  </section>
}

export function TriadsTab() {
  const ready = useEngineReady()
  const [mode, setMode] = usePref<'explore' | 'build'>('triads.mode', 'explore', (v) => v === 'explore' || v === 'build')
  useEffect(() => () => engine.stop(), [mode])
  return <div className="tools-pane tool-workspace triads-pane">
    <Seg label="Triad mode" options={[{ id: 'explore', label: 'Explore' }, { id: 'build', label: 'Build' }]} value={mode} onChange={setMode} />
    {mode === 'explore' ? <TriadExplore ready={ready} /> : <TriadBuild ready={ready} />}
  </div>
}
