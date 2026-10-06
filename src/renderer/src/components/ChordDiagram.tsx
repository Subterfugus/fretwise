import type { ChordShape } from '@/theory/guitar'
import { shapeMidisIn } from '@/theory/guitar'
import { engine } from '@/audio/engine'
import { pretty } from '@/theory/notes'
import { tuningLetters } from '@/theory/tunings'
import { effectiveCapo, effectiveTuning, shouldShowTuning } from './tuning'

const W = 120
const GAP_X = 18
const GAP_Y = 22
const LEFT = 15
const TOP = 34

interface ChordDiagramProps {
  shape: ChordShape
  playable?: boolean
  hideName?: boolean
  /** Open-string MIDI notes, index 0 = string 1. Default standard: audio follows it, and string letters are shown for non-standard tunings. */
  tuning?: number[]
  /** Capo fret: the shape's frets are relative to the capo; sounding pitch is raised by it. */
  capo?: number
  /** Draw the open-string letters under the diagram. Default: true only for non-standard tunings. */
  showTuning?: boolean
}

export function ChordDiagram({ shape, playable = true, hideName = false, tuning, capo: capoProp, showTuning }: ChordDiagramProps) {
  const capo = effectiveCapo(capoProp)
  const letters = shouldShowTuning(tuning, showTuning) ? tuningLetters(effectiveTuning(tuning)) : null // string 6 first
  const fretted = shape.frets.filter((f): f is number => f !== null && f > 0)
  const maxF = fretted.length ? Math.max(...fretted) : 0
  const minF = fretted.length ? Math.min(...fretted) : 0
  // Show from the nut if the shape fits in the first 4 frets, otherwise from the lowest fret.
  const base = maxF <= 4 ? 1 : minF
  const rows = Math.max(4, maxF - base + 1)
  const H = TOP + rows * GAP_Y + 16
  const x = (i: number) => LEFT + i * GAP_X
  const y = (f: number) => TOP + (f - base + 0.5) * GAP_Y

  const play = () => {
    if (playable) engine.playNotes(shapeMidisIn(shape, effectiveTuning(tuning), capo), 'strum').catch(() => undefined)
  }

  return (
    <figure className={'chord-diagram' + (playable ? ' playable' : '')} onClick={play} title={playable ? 'Click to strum' : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {!hideName && (
          <text className="cd-name" x={LEFT + GAP_X * 2.5} y={14} textAnchor="middle">
            {pretty(shape.name)}
          </text>
        )}
        {capo > 0 && <text className="cd-capo" x={W - 3} y={14} textAnchor="end">capo {capo}</text>}
        {base === 1 ? (
          capo > 0 ? (
            <rect className="cd-capobar" x={x(0) - 6} y={TOP - 4} width={x(5) - x(0) + 12} height={8} rx={4} />
          ) : (
            <line className="cd-nut" x1={x(0)} x2={x(5)} y1={TOP} y2={TOP} />
          )
        ) : (
          <text className="cd-base" x={x(5) + 6} y={TOP + GAP_Y * 0.65}>
            {base}fr
          </text>
        )}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <line key={'f' + r} className="cd-line" x1={x(0)} x2={x(5)} y1={TOP + r * GAP_Y} y2={TOP + r * GAP_Y} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={'s' + i} className="cd-line" x1={x(i)} x2={x(i)} y1={TOP} y2={TOP + rows * GAP_Y} />
        ))}
        {shape.barre !== undefined && shape.barre >= base && (() => {
          const idx = shape.frets.map((f, i) => (f === shape.barre ? i : -1)).filter((i) => i >= 0)
          if (idx.length < 2) return null
          return <rect className="cd-barre" x={x(idx[0]) - 7} y={y(shape.barre) - 7} width={x(idx[idx.length - 1]) - x(idx[0]) + 14} height={14} rx={7} />
        })()}
        {shape.frets.map((f, i) =>
          f === null ? (
            <text key={'x' + i} className="cd-open" x={x(i)} y={TOP - 6} textAnchor="middle">×</text>
          ) : f === 0 ? (
            <circle key={'o' + i} className="cd-openc" cx={x(i)} cy={TOP - 10} r={4} />
          ) : (
            <g key={'d' + i}>
              <circle className="cd-dot" cx={x(i)} cy={y(f)} r={7} />
              {shape.fingers?.[i] ? (
                <text className="cd-finger" x={x(i)} y={y(f) + 3.5} textAnchor="middle">{shape.fingers[i]}</text>
              ) : null}
            </g>
          )
        )}
        {letters && letters.map((l, i) => (
          <text key={'l' + i} className="cd-tuning" x={x(i)} y={TOP + rows * GAP_Y + 12} textAnchor="middle">{pretty(l)}</text>
        ))}
      </svg>
    </figure>
  )
}
