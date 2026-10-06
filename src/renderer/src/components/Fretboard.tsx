import { useMemo, useRef, useState } from 'react'
import type { FretMark } from '@/content/types'
import { FretPos, posKey } from '@/theory/guitar'
import { tuningLetters } from '@/theory/tunings'
import { effectiveCapo, effectiveTuning, isDeadFret, shouldShowTuning, soundingMidi, soundingPc } from './tuning'
import { engine } from '@/audio/engine'
import { pretty } from '@/theory/notes'
import { useProgress } from '@/state/progress'
import { useSpelling } from '@/state/useSpelling'
import type { SpellingContext } from '@/theory/spelling'

export interface FretboardProps {
  marks?: FretMark[]
  frets?: [number, number]
  /** Click any fret position (quiz input / drills). Overrides click-to-play-mark behaviour. */
  onPick?: (p: FretPos) => void
  /** Play sound when clicking marks (or any position if onPick set). Default true */
  playable?: boolean
  /** Extra positions to outline (e.g. user's picks) */
  selected?: FretPos[]
  /** Show note name on hover for empty positions */
  hoverNames?: boolean
  className?: string
  activeStrings?: number[]
  ariaLabel?: string
  noteContext?: SpellingContext
  /** Open-string MIDI notes, index 0 = string 1. Default standard tuning: clicks, hover names and string letters follow it. */
  tuning?: number[]
  /** Capo fret. Marks use absolute frets; the capo bar is drawn there and frets behind it are not playable. */
  capo?: number
  /** Draw the open-string letters left of the nut. Default: true only for non-standard tunings. */
  showTuning?: boolean
}

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21]
const STRING_GAP = 26
const PAD_TOP = 18
const PAD_BOTTOM = 24
const OPEN_W = 34

export function Fretboard({ marks = [], frets = [0, 12], onPick, playable = true, selected = [], hoverNames = !!onPick, className, activeStrings, ariaLabel = 'Guitar fretboard', noteContext, tuning, capo: capoProp, showTuning }: FretboardProps) {
  const tun = useMemo(() => effectiveTuning(tuning), [tuning])
  const capo = effectiveCapo(capoProp)
  const letters = shouldShowTuning(tuning, showTuning) ? tuningLetters(tun) : null // string 6 first
  const GUTTER = letters ? 22 : 0
  const { settings } = useProgress()
  const spelling = useSpelling()
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const hitRefs = useRef(new Map<string, SVGRectElement>())
  const [lo, hi] = frets
  const showOpen = lo === 0

  // Fret wire x positions; frets get slightly narrower up the neck like a real guitar.
  const geom = useMemo(() => {
    const first = Math.max(lo, 1)
    const xs: number[] = []
    let x = showOpen ? OPEN_W : 12
    xs[first - 1] = x
    for (let f = first; f <= hi; f++) {
      x += 64 * Math.pow(0.965, f - 1)
      xs[f] = x
    }
    return { xs, width: x + 10, first }
  }, [lo, hi, showOpen])

  const height = PAD_TOP + STRING_GAP * 5 + PAD_BOTTOM
  const yOf = (s: number) => PAD_TOP + (s - 1) * STRING_GAP
  /** centre x of a fret cell (fret 0 = open area left of the nut) */
  const xOf = (f: number) => (f === 0 ? OPEN_W / 2 : (geom.xs[f - 1] + geom.xs[f]) / 2)

  // Positions outside the drawn range (including open strings when the range starts above
  // the nut) have no x coordinate; drawing them would put NaN / stray dots on the board.
  const visible = (p: FretPos) => p.string >= 1 && p.string <= 6 && (p.fret === 0 ? showOpen : p.fret >= geom.first && p.fret <= hi)
  const markMap = new Map(marks.filter(visible).map((m) => [posKey(m), m]))
  const visibleSelected = selected.filter(visible)
  const selectedSet = new Set(visibleSelected.map(posKey))
  const interactiveAt = (p: FretPos) => !isDeadFret(p.fret, capo) && (!activeStrings || activeStrings.includes(p.string)) &&
    (!!onPick || (playable && markMap.has(posKey(p))))

  const click = (p: FretPos) => {
    if (!interactiveAt(p)) return
    if (onPick) onPick(p)
    if (playable && (onPick || markMap.has(posKey(p)))) engine.playNote(soundingMidi(p, tun), 1.6).catch(() => undefined)
  }

  const cells: FretPos[] = []
  for (let s = 1; s <= 6; s++) {
    if (showOpen) cells.push({ string: s, fret: 0 })
    for (let f = geom.first; f <= hi; f++) cells.push({ string: s, fret: f })
  }
  const interactiveCells = cells.filter(interactiveAt)
  const tabStop = interactiveCells.some((p) => posKey(p) === focus) ? focus : interactiveCells[0] && posKey(interactiveCells[0])

  const moveFocus = (p: FretPos, key: string) => {
    let candidates = interactiveCells.filter((c) => c.string === p.string)
    let next: FretPos | undefined
    if (key === 'Home') next = candidates[0]
    else if (key === 'End') next = candidates[candidates.length - 1]
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const direction = (key === 'ArrowRight' ? 1 : -1) * (settings.leftHanded ? -1 : 1)
      candidates = candidates.filter((c) => (c.fret - p.fret) * direction > 0)
      next = candidates.sort((a, b) => Math.abs(a.fret - p.fret) - Math.abs(b.fret - p.fret))[0]
    } else {
      const direction = key === 'ArrowDown' ? 1 : -1
      candidates = interactiveCells.filter((c) => (c.string - p.string) * direction > 0)
      next = candidates.sort((a, b) => Math.abs(a.string - p.string) - Math.abs(b.string - p.string) || Math.abs(a.fret - p.fret) - Math.abs(b.fret - p.fret))[0]
    }
    if (next) hitRefs.current.get(posKey(next))?.focus()
  }

  return (
    <svg
      className={'fretboard ' + (className ?? '')}
      viewBox={`0 0 ${geom.width + GUTTER} ${height}`}
      style={{ minWidth: Math.round(Math.max(hi - lo > 15 ? 1040 : 360, (geom.width + GUTTER) * 0.95)), maxHeight: 240, ...(settings.leftHanded ? { transform: 'scaleX(-1)' } : {}) }}
      role={interactiveCells.length ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      {letters && ([6, 5, 4, 3, 2, 1] as const).map((s) => (
        <text key={'tl' + s} className="fb-tuning" x={GUTTER / 2 - 1} y={yOf(s) + 4} textAnchor="middle" style={settings.leftHanded ? { transform: 'scaleX(-1)', transformBox: 'fill-box', transformOrigin: 'center' } : undefined}>
          {pretty(letters[6 - s])}
        </text>
      ))}
      <g transform={GUTTER ? `translate(${GUTTER} 0)` : undefined}>
      <rect className="fb-wood" x={showOpen ? OPEN_W : 12} y={PAD_TOP - 8} width={geom.width - (showOpen ? OPEN_W : 12) - 10} height={STRING_GAP * 5 + 16} rx="3" />
      {/* inlays */}
      {INLAYS.filter((f) => f >= geom.first && f <= hi).map((f) => (
        <circle key={f} className="fb-inlay" cx={xOf(f)} cy={PAD_TOP + STRING_GAP * 2.5} r="6" />
      ))}
      {12 >= geom.first && 12 <= hi && (
        <>
          <circle className="fb-inlay" cx={xOf(12)} cy={PAD_TOP + STRING_GAP * 1.5} r="6" />
          <circle className="fb-inlay" cx={xOf(12)} cy={PAD_TOP + STRING_GAP * 3.5} r="6" />
        </>
      )}
      {/* frets */}
      {geom.xs.map((x, f) =>
        x === undefined ? null : (
          <line key={f} className={f === 0 && showOpen ? 'fb-nut' : 'fb-fret'} x1={x} x2={x} y1={PAD_TOP - 8} y2={PAD_TOP + STRING_GAP * 5 + 8} />
        )
      )}
      {/* strings */}
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={s} className="fb-string" opacity={activeStrings && !activeStrings.includes(s) ? 0.3 : 1} x1={showOpen ? OPEN_W - 6 : 12} x2={geom.width - 10} y1={yOf(s)} y2={yOf(s)} strokeWidth={0.8 + s * 0.35} />
      ))}
      {/* fret numbers */}
      {Array.from({ length: hi - geom.first + 1 }, (_, i) => geom.first + i)
        .filter((f) => INLAYS.includes(f) || f === 12 || f === geom.first)
        .map((f) => (
          <text key={f} className="fb-num" x={xOf(f)} y={height - 6} textAnchor="middle" style={settings.leftHanded ? { transform: 'scaleX(-1)', transformBox: 'fill-box', transformOrigin: 'center' } : undefined}>
            {f}
          </text>
        ))}
      {/* hit areas + hover names */}
      {cells.map((p) => {
        const k = posKey(p)
        const interactive = interactiveAt(p)
        return (
          <rect
            key={'h' + k}
            ref={(el) => { if (el) hitRefs.current.set(k, el); else hitRefs.current.delete(k) }}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive && k === tabStop ? 0 : -1}
            aria-label={interactive ? `String ${p.string}, fret ${p.fret}${markMap.get(k)?.bass ? ', bass note' : ''}${markMap.get(k)?.comparisonTonic ? `, tonic ${markMap.get(k)!.comparisonTonic === 'both' ? 'A and B' : markMap.get(k)!.comparisonTonic!.toUpperCase()}` : ''}` : undefined}
            aria-pressed={interactive && onPick ? selectedSet.has(k) : undefined}
            data-string={p.string}
            data-fret={p.fret}
            onFocus={() => setFocus(k)}
            onKeyDown={interactive ? (e) => {
              if (['Enter', ' '].includes(e.key)) {
                e.preventDefault()
                if (!e.repeat) click(p)
              } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                e.preventDefault()
                moveFocus(p, e.key)
              }
            } : undefined}
            className={interactive ? 'fb-hit' : 'fb-hit off'}
            x={p.fret === 0 ? 0 : geom.xs[p.fret - 1]}
            y={yOf(p.string) - STRING_GAP / 2}
            width={p.fret === 0 ? OPEN_W - 4 : geom.xs[p.fret] - geom.xs[p.fret - 1]}
            height={STRING_GAP}
            onClick={interactive ? () => click(p) : undefined}
            onMouseEnter={hoverNames ? () => setHover(k) : undefined}
            onMouseLeave={hoverNames ? () => setHover(null) : undefined}
          />
        )
      })}
      {/* marks */}
      {[...markMap.values()].map((mk) => (
        <g key={'m' + posKey(mk)} className={`fb-mark ${mk.color ?? 'tone'} ${selectedSet.has(posKey(mk)) ? 'sel' : ''}${mk.comparisonTonic ? ` tonic-${mk.comparisonTonic}` : ''}`} pointerEvents="none">
          {mk.bass && <circle className="fb-bass-ring" cx={xOf(mk.fret)} cy={yOf(mk.string)} r="14" />}
          {mk.comparisonTonic && <circle className="fb-comparison-tonic-ring" cx={xOf(mk.fret)} cy={yOf(mk.string)} r="14" />}
          <circle cx={xOf(mk.fret)} cy={yOf(mk.string)} r="11" />
          {mk.label && (
            <text x={xOf(mk.fret)} y={yOf(mk.string) + 4} textAnchor="middle" style={settings.leftHanded ? { transform: 'scaleX(-1)', transformBox: 'fill-box', transformOrigin: 'center' } : undefined}>
              {pretty(mk.computedNote ? spelling.spellPc(mk.computedNote.pc, { key: mk.computedNote.key }) : mk.label)}
            </text>
          )}
        </g>
      ))}
      {capo >= geom.first && capo <= hi && <rect className="fb-capo" x={geom.xs[capo] - 14} y={PAD_TOP - 12} width={11} height={STRING_GAP * 5 + 24} rx={4} pointerEvents="none" />}
      {/* selected (not already a mark) */}
      {visibleSelected
        .filter((p) => !markMap.has(posKey(p)))
        .map((p) => (
          <circle key={'s' + posKey(p)} className="fb-picked" cx={xOf(p.fret)} cy={yOf(p.string)} r="10" pointerEvents="none" />
        ))}
      {hover && !markMap.has(hover) && (() => {
        const [s, f] = hover.split(':').map(Number)
        return (
          <g className="fb-hover" pointerEvents="none">
            <circle cx={xOf(f)} cy={yOf(s)} r="10" />
            <text x={xOf(f)} y={yOf(s) + 4} textAnchor="middle" style={settings.leftHanded ? { transform: 'scaleX(-1)', transformBox: 'fill-box', transformOrigin: 'center' } : undefined}>
              {onPick ? '' : pretty(spelling.spellPc(soundingPc({ string: s, fret: f }, tun), noteContext))}
            </text>
          </g>
        )
      })()}
      </g>
    </svg>
  )
}
