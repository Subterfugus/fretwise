import { useRef, useState } from 'react'
import { engine, INSTRUMENTS, InstrumentId } from '@/audio/engine'
import { getProgress, importProgress, resetProgress, updateProgress, useProgress } from '@/state/progress'
import { PlayButton } from '@/components/PlayButton'
import { OPEN_CHORDS, shapeMidis } from '@/theory/guitar'
import { CIRCLE_MAJOR, CIRCLE_MINOR } from '@/theory/keys'
import { pretty } from '@/theory/notes'
import type { NoteNameSetting } from '@/theory/spelling'
import { ThemePicker } from './ThemePicker'
import { Download, RotateCcw, Upload } from 'lucide-react'
import { DESKTOP_DOWNLOAD_URL, isDesktop, offerDesktopDownload } from '@/platform'
import './settings.css'

export function Settings() {
  const { settings } = useProgress()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef<InstrumentId | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ name: string; data: unknown } | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)

  const setInstrument = async (id: InstrumentId) => {
    updateProgress((p) => void (p.settings.instrument = id))
    latest.current = id
    setLoading(true)
    setError(null)
    try {
      await engine.setInstrument(id)
    } catch (e) {
      // Only report for the instrument the user chose last; an older, superseded load failing is irrelevant.
      if (latest.current === id) setError(e instanceof Error ? e.message : String(e))
    } finally {
      // An earlier selection finishing must not hide the "loading" state of a later one.
      if (latest.current === id) setLoading(false)
    }
  }

  const exportProgress = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(getProgress(), null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `fretwise-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const chooseImport = async (file: File | undefined) => {
    if (!file) return
    setImportNote(null)
    setPendingImport(null)
    try {
      const data: unknown = JSON.parse(await file.text())
      // Checked again by importProgress; testing here lets a wrong file fail before the confirmation step.
      if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1) throw new Error('not a progress file')
      setPendingImport({ name: file.name, data })
    } catch {
      setImportNote(`"${file.name}" is not a Fretwise progress file.`)
    }
  }

  const confirmImport = () => {
    if (!pendingImport) return
    const ok = importProgress(pendingImport.data)
    setImportNote(ok ? `Imported "${pendingImport.name}".` : `"${pendingImport.name}" is not a Fretwise progress file.`)
    setPendingImport(null)
    if (!ok) return
    const s = getProgress().settings
    engine.setVolume(s.volume)
    void setInstrument(s.instrument)
  }

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section className="settings-section">
        <h3>Sound</h3>
        <label className="field">
          <span>Instrument</span>
          <select value={settings.instrument} onChange={(e) => setInstrument(e.target.value as InstrumentId)}>
            {INSTRUMENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          {loading && <span className="muted">Loading samples…</span>}
          {error && <span className="muted">Could not load samples: {error}</span>}
        </label>
        <label className="field">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              engine.setVolume(v)
              updateProgress((p) => void (p.settings.volume = v))
            }}
          />
        </label>
        <PlayButton play={{ kind: 'notes', notes: shapeMidis(OPEN_CHORDS.G), mode: 'strum' }} label="Test sound (G chord)" />
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <ThemePicker />
      </section>

      <section className="settings-section">
        <h3>Learning</h3>
        <label className="field">
          <span>Note names</span>
          <select aria-label="Note names" value={typeof settings.noteNames === 'object' ? 'key' : settings.noteNames} onChange={(e) => {
            const value = e.target.value
            updateProgress((p) => { p.settings.noteNames = value === 'key' ? { key: 'C' } : value as NoteNameSetting })
          }}>
            <option value="auto">Auto (by key)</option>
            <option value="sharps">Always sharps</option>
            <option value="flats">Always flats</option>
            <option value="key">By key</option>
          </select>
        </label>
        {typeof settings.noteNames === 'object' && <label className="field">
          <span>Key</span>
          <select aria-label="Key" value={settings.noteNames.key} onChange={(e) => updateProgress((p) => { p.settings.noteNames = { key: e.target.value } })}>
            {CIRCLE_MAJOR.map((key, i) => <option key={key} value={key}>{pretty(key)} major / {pretty(CIRCLE_MINOR[i])} minor</option>)}
          </select>
        </label>}
        <label className="check">
          <input type="checkbox" checked={settings.unlockAll} onChange={(e) => updateProgress((p) => void (p.settings.unlockAll = e.target.checked))} />
          Unlock all units (browse freely without passing quizzes)
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.leftHanded} onChange={(e) => updateProgress((p) => void (p.settings.leftHanded = e.target.checked))} />
          Left-handed fretboard (mirror diagrams)
        </label>
      </section>

      <section className="settings-section">
        <h3>Progress</h3>
        <p className="muted">
          Your progress is saved automatically {isDesktop ? 'on this computer' : 'in this browser'}. Export it to a file to keep a backup or to
          move it to another device{isDesktop ? ' or the web version' : ' or the Windows desktop app'}.
        </p>
        <div className="row">
          <button className="btn" onClick={exportProgress}>
            <Download size={16} aria-hidden /> Export progress
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={16} aria-hidden /> Import progress…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void chooseImport(e.target.files?.[0])
              e.target.value = '' // so choosing the same file again still fires onChange
            }}
          />
        </div>
        {pendingImport && (
          <div className="row">
            <span>Replace all progress, bookmarks, presets and settings here with "{pendingImport.name}"? This cannot be undone.</span>
            <button className="btn danger" onClick={confirmImport}>
              Yes, replace
            </button>
            <button className="btn ghost" onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>
        )}
        {importNote && <p className="muted" role="status">{importNote}</p>}
        {confirm ? (
          <div className="row">
            <span>Erase lesson, quiz, ear-training, mic and practice progress? Saved presets and bookmarks stay.</span>
            <button
              className="btn danger"
              onClick={() => {
                resetProgress()
                setConfirm(false)
              }}
            >
              Yes, reset
            </button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setConfirm(true)}>
            <RotateCcw size={16} aria-hidden /> Reset progress…
          </button>
        )}
      </section>

      {offerDesktopDownload && (
        <section className="settings-section">
          <h3>Desktop app</h3>
          <p className="muted">Fretwise is also a Windows app that works offline and keeps your progress in a file on your computer.</p>
          <a className="btn" href={DESKTOP_DOWNLOAD_URL}>
            <Download size={16} aria-hidden /> Download for Windows
          </a>
        </section>
      )}

      <p className="muted small">
        Instrument samples: tonejs-instruments by Nicholaus P. Brosowsky (CC-BY 3.0). Notation: VexFlow. Audio: Tone.js.
      </p>
    </div>
  )
}
