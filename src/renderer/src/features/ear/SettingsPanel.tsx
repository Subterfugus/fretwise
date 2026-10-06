import { INSTRUMENTS, InstrumentId } from '@/audio/engine'
import type { DrillDef, DrillSettings, OptValue } from './types'
import { chooseInstrument } from './useSamples'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function InstrumentSelect({ value }: { value: InstrumentId }) {
  return (
    <label className="ear-field">
      <span className="ear-field-label">Instrument</span>
      <select className="ear-select" value={value} onChange={(e) => chooseInstrument(e.target.value as InstrumentId)}>
        {INSTRUMENTS.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SettingsPanel({
  drill,
  settings,
  onChange,
  instrument
}: {
  drill: DrillDef
  settings: DrillSettings
  onChange: (s: DrillSettings) => void
  instrument: InstrumentId
}) {
  const setOpt = (id: string, v: OptValue) => onChange({ ...settings, opts: { ...settings.opts, [id]: v } })
  const toggleItem = (k: string) => {
    const on = settings.items.includes(k)
    if (on && settings.items.length <= drill.minItems) return
    onChange({ ...settings, items: on ? settings.items.filter((x) => x !== k) : [...settings.items, k] })
  }

  return (
    <div className="ear-settings">
      <div className="ear-settings-row">
        <span className="ear-field-label">Level</span>
        <div className="ear-chips">
          {drill.presets.map((p) => (
            <button
              key={p.id}
              className={'ear-chip' + (sameSet(p.items, settings.items) ? ' on' : '')}
              onClick={() => onChange({ ...settings, items: [...p.items] })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ear-settings-row">
        <span className="ear-field-label">{drill.itemsLabel}</span>
        <div className="ear-chips">
          {drill.items.map((it) => {
            const on = settings.items.includes(it.key)
            return (
              <button
                key={it.key}
                className={'ear-chip check' + (on ? ' on' : '')}
                title={it.sub}
                aria-pressed={on}
                onClick={() => toggleItem(it.key)}
              >
                {it.label}
              </button>
            )
          })}
        </div>
      </div>

      {drill.options.map((o) => {
        const v = settings.opts[o.id] ?? drill.defaults.opts[o.id]
        switch (o.kind) {
          case 'multi': {
            const list = Array.isArray(v) ? v : []
            return (
              <div className="ear-settings-row" key={o.id}>
                <span className="ear-field-label">{o.label}</span>
                <div className="ear-chips">
                  {o.choices.map((c) => {
                    const on = list.includes(c.value)
                    return (
                      <button
                        key={c.value}
                        className={'ear-chip check' + (on ? ' on' : '')}
                        aria-pressed={on}
                        onClick={() => {
                          if (on && list.length <= (o.min ?? 1)) return
                          setOpt(o.id, on ? list.filter((x) => x !== c.value) : [...list, c.value])
                        }}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          }
          case 'select':
            return (
              <div className="ear-settings-row" key={o.id}>
                <span className="ear-field-label">{o.label}</span>
                <div className="ear-segment">
                  {o.choices.map((c) => (
                    <button key={c.value} className={v === c.value ? 'on' : ''} onClick={() => setOpt(o.id, c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          case 'toggle':
            return (
              <label className="ear-toggle" key={o.id} title={o.help}>
                <input type="checkbox" checked={v === true} onChange={(e) => setOpt(o.id, e.target.checked)} />
                <span className="ear-switch" aria-hidden />
                {o.label}
              </label>
            )
          case 'range':
            return (
              <label className="ear-settings-row ear-range" key={o.id}>
                <span className="ear-field-label">{o.label}</span>
                <input
                  type="range"
                  min={o.min}
                  max={o.max}
                  step={o.step}
                  value={typeof v === 'number' ? v : o.min}
                  onChange={(e) => setOpt(o.id, Number(e.target.value))}
                />
                <span className="ear-range-val">
                  {typeof v === 'number' ? v : o.min}
                  {o.suffix}
                </span>
              </label>
            )
        }
      })}

      <label className="ear-toggle">
        <input type="checkbox" checked={settings.weak} onChange={(e) => onChange({ ...settings, weak: e.target.checked })} />
        <span className="ear-switch" aria-hidden />
        Practise weakest (favour items you miss most)
      </label>

      <InstrumentSelect value={instrument} />
    </div>
  )
}
