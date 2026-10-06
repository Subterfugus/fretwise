// Small shared UI pieces for the tools tabs.
import { ReactNode, type InputHTMLAttributes, isValidElement, useCallback, useEffect, useState } from 'react'
import { engine } from '@/audio/engine'
import { useProgress } from '@/state/progress'
import { pretty } from '@/theory/notes'
import { rootName } from './names'
import { useSpelling } from '@/state/useSpelling'
import { commitNumberDraft } from './numberInput'

const PREFIX = 'fretwise.tools.'

/** useState persisted to localStorage (every access guarded: storage can be unavailable). */
export function usePref<T>(key: string, initial: T, valid?: (v: unknown) => boolean, seed?: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (seed !== undefined && (!valid || valid(seed))) return seed
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw !== null) {
        const v = JSON.parse(raw) as unknown
        if (!valid || valid(v)) return v as T
      }
    } catch {
      /* ignore */
    }
    return initial
  })
  // Route seeds are consumed on mount, before rendering or configuring any player.
  useEffect(() => {
    if (seed === undefined || valid && !valid(seed)) return
    try { localStorage.setItem(PREFIX + key, JSON.stringify(seed)) } catch { /* unavailable storage */ }
  }, [key])
  const set = useCallback((v: T | ((p: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [key])
  return [value, set]
}

export function Seg<T extends string | number>({ label, options, value, onChange, disabled }: { label: string; options: { id: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="tools-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={o.id === value} className={o.id === value ? 'on' : ''} disabled={disabled || o.disabled} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

/** Keep partial typing local; only committed, validated numbers reach tool state. */
export function NumberInput({ value, onChange, min, max, step = 1, onBlur, onKeyDown, ...props }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const next = commitNumberDraft(draft, value, min, max, step)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return <input {...props} type="number" min={min} max={max} step={step} value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={(e) => { commit(); onBlur?.(e) }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit() }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)) }
      onKeyDown?.(e)
    }} />
}

/** Twelve root buttons, spelled for a major-ish or minor-ish context. */
export function RootPicker({ pc, onChange, minor = false, label = 'Root note' }: { pc: number; onChange: (pc: number) => void; minor?: boolean; label?: string }) {
  const spelling = useSpelling()
  return (
    <div className="tools-roots" role="group" aria-label={label}>
      {Array.from({ length: 12 }, (_, i) => (
        <button key={i} type="button" aria-pressed={i === pc} className={i === pc ? 'on' : ''} onClick={() => onChange(i)}>
          {pretty(spelling.spellPc(i, { key: rootName(i, minor) + (minor ? 'm' : '') }))}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const labelable = isValidElement<{ type?: string }>(children) && (
    children.type === NumberInput ||
    typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type) && children.props.type !== 'hidden'
  )
  const Container = labelable ? 'label' : 'div'
  return (
    <Container className="tools-field">
      <span className="muted">{label}</span>
      {children}
    </Container>
  )
}

/** Keep the engine's instrument loaded; reports whether samples are ready (for click-to-hear). */
export function useEngineReady(): 'loading' | 'ready' | 'error' {
  const { settings } = useProgress()
  const id = settings.instrument
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(engine.isLoaded(id) ? 'ready' : 'loading')
  useEffect(() => {
    let alive = true
    if (engine.instrument !== id) engine.setInstrument(id).catch(() => undefined)
    if (engine.isLoaded(id)) {
      setState('ready')
      return
    }
    setState('loading')
    engine.load(id).then(
      () => alive && setState('ready'),
      () => alive && setState('error')
    )
    return () => {
      alive = false
    }
  }, [id])
  return state
}

export function Chips({ items }: { items: string[] }) {
  return (
    <span className="tools-chips">
      {items.map((n, i) => (
        <span key={i} className="tools-chip static">
          {pretty(n)}
        </span>
      ))}
    </span>
  )
}
