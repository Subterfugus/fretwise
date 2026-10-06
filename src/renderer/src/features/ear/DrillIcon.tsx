import { AudioLines, Guitar, Layers3, ListMusic, Music2, Route, Waypoints } from 'lucide-react'
import type { DrillId } from './types'

const ICONS = { intervals: AudioLines, chords: Layers3, scales: ListMusic, progressions: Route, degrees: Waypoints, melody: Music2, notefinder: Guitar }

export function DrillIcon({ id, size = 22 }: { id: DrillId; size?: number }) {
  const Icon = ICONS[id]
  return <Icon size={size} aria-hidden />
}
