// A compact horizontal mini-fretboard for one voicing, drawn on the shared 0-22 fret axis, plus the ruler that
// labels that axis. Rows built from these line up vertically so shapes can be scanned up the neck.
import { useMemo } from 'react'
import type { ChordShape } from '@/theory/guitar'
import { useProgress } from '@/state/progress'
import { pretty } from '@/theory/notes'
import type { VoicingTone } from './voicingView'

export type TonesLabel = 'note' | 'degree' | 'finger'

export const AXIS_FRETS = 22
const OPEN_W = 28
const COL = 32
const GAP = 15
const TOP = 18
const PAD_R = 6
export const AXIS_W = OPEN_W + AXIS_FRETS * COL + PAD_R
const BOARD_H = GAP * 5
export const ROW_H = TOP + BOARD_H + 14

/** x centre of a fret cell (0 = open area), mirrored for left-handed players. */
function makeX(left: boolean) {
  return (fret: number): number => {
    const x = fret === 0 ? OPEN_W / 2 : OPEN_W + (fret - 0.5) * COL
    return left ? AXIS_W - x : x
  }
}
const wireX = (left: boolean, f: number): number => (left ? AXIS_W - (OPEN_W + f * COL) : OPEN_W + f * COL)
const yOf = (string: number): number => TOP + (string - 1) * GAP

const MARKED = [3, 5, 7, 9, 12, 15, 17, 19, 21]

export function labelFor(t: VoicingTone, mode: TonesLabel): string {
  if (mode === 'note') return pretty(t.note)
  if (mode === 'degree') return t.degree
  return t.finger ? String(t.finger) : t.fret === 0 ? '0' : ''
}

/** The fret-number ruler for the common axis. */
export function FretRuler({ lo = 0, hi = AXIS_FRETS }: { lo?: number; hi?: number }) {
  const { settings } = useProgress()
  const left = settings.leftHanded
  const x = makeX(left)
  const nums = Array.from({ length: AXIS_FRETS + 1 }, (_, f) => f).filter((f) => f === 0 || MARKED.includes(f) || f === lo || f === hi)
  return (
    <svg className="dict-ruler" width={AXIS_W} height="22" viewBox={`0 0 ${AXIS_W} 22`} aria-hidden="true">
      <rect className="dict-ruler-band" x={Math.min(x(lo), x(hi)) - COL / 2} width={Math.abs(x(hi) - x(lo)) + COL} y="0" height="22" />
      {nums.map((f) => (
        <text key={f} x={x(f)} y="15" textAnchor="middle" className="dict-ruler-num">
          {f}
        </text>
      ))}
    </svg>
  )
}

export function VoicingStrip({ shape, tones, label, selected, title }: { shape: ChordShape; tones: VoicingTone[]; label: TonesLabel; selected?: boolean; title: string }) {
  const { settings } = useProgress()
  const left = settings.leftHanded
  const x = makeX(left)
  const fretted = tones.filter((t) => t.fret > 0)
  const lo = fretted.length ? Math.min(...fretted.map((t) => t.fret)) : 0
  const hi = fretted.length ? Math.max(...fretted.map((t) => t.fret)) : 0
  const muted = useMemo(() => shape.frets.map((f, i) => (f === null ? 6 - i : 0)).filter(Boolean), [shape])
  const barre = useMemo(() => {
    if (shape.barre === undefined) return null
    const ss = shape.frets.map((f, i) => (f === shape.barre ? 6 - i : 0)).filter(Boolean)
    return ss.length >= 2 ? { fret: shape.barre, s1: Math.min(...ss), s2: Math.max(...ss) } : null
  }, [shape])
  return (
    <svg className={'dict-strip' + (selected ? ' sel' : '')} width={AXIS_W} height={ROW_H} viewBox={`0 0 ${AXIS_W} ${ROW_H}`} role="img" aria-label={title}>
      {fretted.length > 0 && <rect className="dict-span" x={Math.min(x(lo), x(hi)) - COL / 2} y={TOP - 10} width={Math.abs(x(hi) - x(lo)) + COL} height={BOARD_H + 20} rx="5" />}
      {Array.from({ length: AXIS_FRETS + 1 }, (_, f) => (
        <line key={f} className={f === 0 ? 'dict-nut' : 'dict-fret'} x1={wireX(left, f)} x2={wireX(left, f)} y1={TOP - 6} y2={TOP + BOARD_H + 6} />
      ))}
      {MARKED.map((f) => (
        <circle key={f} className="dict-inlay" cx={x(f)} cy={TOP + BOARD_H + 11} r="2" />
      ))}
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={s} className="dict-string" x1={left ? 0 : OPEN_W - 8} x2={left ? AXIS_W - OPEN_W + 8 : AXIS_W} y1={yOf(s)} y2={yOf(s)} strokeWidth={0.7 + s * 0.3} opacity={tones.some((t) => t.string === s) ? 1 : 0.35} />
      ))}
      {muted.map((s) => (
        <text key={'m' + s} className="dict-mute" x={x(0)} y={yOf(s) + 4.5} textAnchor="middle">
          {'×'}
        </text>
      ))}
      {barre && <rect className="dict-barre" x={x(barre.fret) - 10} y={yOf(barre.s1) - 10} width="20" height={yOf(barre.s2) - yOf(barre.s1) + 20} rx="10" />}
      {tones.map((t) => (
        <g key={t.string} className={'dict-dot' + (t.isRoot ? ' root' : '') + (t.fret === 0 ? ' open' : '')}>
          {t.isBass && <circle className="dict-bassring" cx={x(t.fret)} cy={yOf(t.string)} r="12.5" />}
          <circle className="dict-disc" cx={x(t.fret)} cy={yOf(t.string)} r="9.5" />
          <text x={x(t.fret)} y={yOf(t.string) + 3.8} textAnchor="middle">
            {labelFor(t, label)}
          </text>
        </g>
      ))}
    </svg>
  )
}
