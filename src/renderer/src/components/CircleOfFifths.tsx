import { CIRCLE_MAJOR, CIRCLE_MINOR, keySignature } from '@/theory/keys'
import { engine } from '@/audio/engine'
import { buildChord } from '@/theory/chords'
import { midi, pitchClass, pretty, toNote } from '@/theory/notes'

export function CircleOfFifths({ highlight }: { highlight?: string }) {
  const R1 = 120
  const R2 = 80
  const C = 150
  const play = (root: string, minor: boolean) => {
    const r = toNote(root)
    r.octave = 3
    engine.playNotes(buildChord(r, minor ? 'min' : 'maj').map(midi), 'strum').catch(() => undefined)
  }
  // "highlight" is a key name like "G", "Eb" or "Em"; match enharmonically (F# also lights Gb).
  const hlMinor = !!highlight && /^[A-Ga-g][#b♯♭]?m$/.test(highlight)
  let hlPc = -1
  try {
    if (highlight) hlPc = pitchClass(hlMinor ? highlight.slice(0, -1) : highlight)
  } catch {
    /* unparseable highlight: nothing lit */
  }
  return (
    <svg className="circle5" viewBox="0 0 300 300" width="300" height="300">
      <circle cx={C} cy={C} r={142} className="c5-ring" />
      <circle cx={C} cy={C} r={100} className="c5-ring inner" />
      {CIRCLE_MAJOR.map((k, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2
        const ks = keySignature(k)
        const hl = !!highlight && pitchClass(hlMinor ? CIRCLE_MINOR[i] : k) === hlPc
        return (
          <g key={k} className={'c5-key' + (hl ? ' hl' : '')}>
            <g onClick={() => play(k, false)} className="c5-hit">
              <circle cx={C + R1 * Math.cos(a)} cy={C + R1 * Math.sin(a)} r={17} />
              <text x={C + R1 * Math.cos(a)} y={C + R1 * Math.sin(a) + 5} textAnchor="middle" className="c5-major">
                {pretty(k)}
              </text>
            </g>
            <g onClick={() => play(CIRCLE_MINOR[i], true)} className="c5-hit">
              <circle cx={C + R2 * Math.cos(a)} cy={C + R2 * Math.sin(a)} r={14} />
              <text x={C + R2 * Math.cos(a)} y={C + R2 * Math.sin(a) + 4} textAnchor="middle" className="c5-minor">
                {pretty(CIRCLE_MINOR[i])}m
              </text>
            </g>
            <text x={C + 46 * Math.cos(a)} y={C + 46 * Math.sin(a) + 3} textAnchor="middle" className="c5-sig">
              {ks.count === 0 ? '' : Math.abs(ks.count) + (ks.count > 0 ? '♯' : '♭')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
