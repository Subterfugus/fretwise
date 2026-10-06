import { useEffect, useRef, useState } from 'react'
import { Download, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { updateProgress, useProgress } from '@/state/progress'
import { isToolPresetConfig, type ToolPreset, type ToolPresetConfigs, type ToolPresetKind } from '@/state/toolPresets'
import './presets.css'

export function PresetControls<K extends ToolPresetKind>({ tool, config, onLoad }: {
  tool: K
  config: ToolPresetConfigs[K]
  onLoad: (config: ToolPresetConfigs[K]) => void
}) {
  const { toolPresets } = useProgress()
  const [selectedId, setSelectedId] = useState('')
  const [action, setAction] = useState<'save' | 'rename' | 'delete' | null>(null)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const presets = toolPresets.filter((p) => p.tool === tool)
  const selected = presets.find((p) => p.id === selectedId)
  const changed = selected && JSON.stringify(config) !== JSON.stringify(selected.config)

  useEffect(() => {
    if (selectedId && !selected) setSelectedId('')
  }, [selectedId, selected])
  useEffect(() => {
    if (action) dialog.current?.showModal()
    else dialog.current?.close()
  }, [action])

  const open = (next: 'save' | 'rename' | 'delete') => {
    setMessage('')
    setName(next === 'save' ? '' : selected?.name ?? '')
    setAction(next)
  }
  const save = () => {
    if (!isToolPresetConfig(tool, config)) {
      setMessage('Check the current settings before saving this preset.')
      return
    }
    const now = Date.now()
    const id = crypto.randomUUID()
    updateProgress((p) => p.toolPresets.push({ id, name: name.trim(), tool, config: structuredClone(config), createdAt: now, updatedAt: now } as ToolPreset))
    setSelectedId(id)
    setMessage(`Saved ${name.trim()}.`)
    setAction(null)
  }
  const update = () => {
    if (!selected || !isToolPresetConfig(tool, config)) return
    updateProgress((p) => {
      const record = p.toolPresets.find((x) => x.id === selected.id)
      if (record) {
        record.config = structuredClone(config)
        record.updatedAt = Date.now()
      }
    })
    setMessage(`Updated ${selected.name}.`)
  }
  const submit = () => {
    if (action === 'save') return save()
    if (!selected) return setAction(null)
    if (action === 'rename') {
      updateProgress((p) => {
        const record = p.toolPresets.find((x) => x.id === selected.id)
        if (record) {
          record.name = name.trim()
          record.updatedAt = Date.now()
        }
      })
      setMessage(`Renamed to ${name.trim()}.`)
    } else {
      updateProgress((p) => { p.toolPresets = p.toolPresets.filter((x) => x.id !== selected.id) })
      setSelectedId('')
      setMessage(`Deleted ${selected.name}.`)
    }
    setAction(null)
  }

  return <div className="preset-toolbar" aria-label="Saved practice presets">
    <label className="preset-picker">
      <span className="muted">Practice preset</span>
      <select aria-label="Practice preset" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setMessage('') }}>
        <option value="">Current settings</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    <div className="preset-actions">
      <button type="button" className="btn ghost preset-icon" title="Load preset" aria-label="Load preset" disabled={!selected} onClick={() => {
        if (!selected) return
        onLoad(structuredClone(selected.config) as ToolPresetConfigs[K])
        setMessage(`Loaded ${selected.name}.`)
      }}><Download size={18} /></button>
      <button type="button" className="btn ghost preset-icon" title="Save as new preset" aria-label="Save as new preset" onClick={() => open('save')}><Plus size={18} /></button>
      <button type="button" className="btn ghost preset-icon" title="Update preset with current settings" aria-label="Update preset with current settings" disabled={!selected || !changed} onClick={update}><RefreshCw size={18} /></button>
      <button type="button" className="btn ghost preset-icon" title="Rename preset" aria-label="Rename preset" disabled={!selected} onClick={() => open('rename')}><Pencil size={18} /></button>
      <button type="button" className="btn ghost preset-icon" title="Delete preset" aria-label="Delete preset" disabled={!selected} onClick={() => open('delete')}><Trash2 size={18} /></button>
    </div>
    <span className="muted preset-status" aria-live="polite">{message || (changed ? 'Unsaved changes' : '')}</span>
    <dialog ref={dialog} className="preset-dialog" onCancel={() => setAction(null)} onClose={() => setAction(null)} aria-labelledby={`preset-title-${tool}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="preset-dialog-head">
          <h3 id={`preset-title-${tool}`}>{action === 'delete' ? 'Delete preset' : action === 'rename' ? 'Rename preset' : 'Save practice preset'}</h3>
          <button type="button" className="btn ghost preset-icon" title="Close" aria-label="Close" onClick={() => setAction(null)}><X size={18} /></button>
        </div>
        {action === 'delete' ? <p>Delete "{selected?.name}"?</p> : <label className="tools-field">
          <span className="muted">Name</span>
          <input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>}
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setAction(null)}>Cancel</button>
          <button className="btn primary" type="submit" disabled={action !== 'delete' && !name.trim()}>{action === 'delete' ? 'Delete' : 'Save'}</button>
        </div>
        {message && <p className="tools-err" role="alert">{message}</p>}
      </form>
    </dialog>
  </div>
}
