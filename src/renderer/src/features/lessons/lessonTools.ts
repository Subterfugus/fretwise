import type { InstrumentId, SeqEvent } from '@/audio/engine'
import type { Block } from '@/content/types'
import type { ToolExample } from '@/content/toolExamples'
import { CHORDS, buildChord, chordSymbol } from '@/theory/chords'
import { shapePositions, type ChordShape } from '@/theory/guitar'
import { pitchClass, pretty } from '@/theory/notes'
import { SCALES } from '@/theory/scales'
import { findTuning } from '@/theory/tunings'
import { effectiveCapo, effectiveTuning, soundingMidi } from '@/components/tuning'
import { chordLibrary } from '@/features/tools/chordLibrary'
import { identifyVoicing } from '@/features/tools/chordIdentifier'
import { isIdentifierInput } from '@/features/tools/identifierInput'
import { isMinorish, parseChordName, rootName } from '@/features/tools/names'
import { parseRoman, prettyRoman, progressionChords } from '@/features/tools/progressions'
import { isChordDuration } from '@/features/tools/looperTiming'
import type { ToolLaunch } from '@/features/tools/toolLaunch'
import { DEFAULT_VOICE_LEADING } from '@/features/tools/voiceLeadingConfig'
import { DEFAULT_REHARM, validReharmConfig, type ReharmConfig } from '@/features/tools/reharmonisation'

export interface LessonToolAction { id: string; label: string; launch: ToolLaunch }
const validRange = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 22) && v[0] <= v[1]

export function validToolExample(example: unknown): example is ToolExample {
  if (!example || typeof example !== 'object') return false
  const e = example as ToolExample
  try {
    if (typeof e.root !== 'string' || e.label !== undefined && typeof e.label !== 'string') return false
    pitchClass(e.root)
    if (e.kind === 'scale') return Object.hasOwn(SCALES, e.type) && (e.frets === undefined || validRange(e.frets)) && (e.box === undefined || Number.isInteger(e.box) && e.box >= 0 && e.box < SCALES[e.type].intervals.length)
    if (e.kind === 'chord') return Object.hasOwn(CHORDS, e.type)
    return e.kind === 'progression' && Object.hasOwn(SCALES, e.scale) && Array.isArray(e.romans) && e.romans.length > 0 && e.romans.length <= 64
      && e.romans.every((r) => typeof r === 'string' && !!parseRoman(r)) && (e.frets === undefined || validRange(e.frets))
      && (e.durations === undefined || Array.isArray(e.durations) && e.durations.length === e.romans.length && e.durations.every(isChordDuration))
      && (e.bpm === undefined || Number.isInteger(e.bpm) && e.bpm >= 40 && e.bpm <= 220)
      && (e.beats === undefined || [1, 2, 3, 4, 6, 8].includes(e.beats))
  } catch { return false }
}

/** Preserve durations only when the explicit chord context matches every source event. */
function sourceTiming(example: ToolExample, events: SeqEvent[] | undefined): ToolExample {
  if (example.kind !== 'progression' || !validToolExample(example) || example.durations || !events || events.length !== example.romans.length) return example
  const chords = progressionChords(example.root, example.romans)
  if (chords.length !== events.length) return example
  const matches = events.every((event, i) => {
    if (!isChordDuration(event.beats)) return false
    const expected = new Set(buildChord(chords[i].root, chords[i].type).map(pitchClass))
    const played = new Set(event.notes.map((n) => typeof n === 'number' ? n % 12 : pitchClass(n)))
    return played.size >= 2 && [...played].every((pc) => expected.has(pc))
  })
  return matches ? { ...example, durations: events.map((event) => event.beats) } : example
}

/** A diagram's sounding notes are authoritative, including capo and alternate tuning. */
export function shapeToolExample(shape: ChordShape, tuning?: number[], capo = 0): ToolExample | null {
  if (!shape || typeof shape.name !== 'string' || !Array.isArray(shape.frets) || shape.frets.length !== 6 || !shape.frets.every((f) => f === null || Number.isInteger(f) && f >= 0 && f <= 22)) return null
  const c = effectiveCapo(capo)
  const midis = shapePositions(shape).map((p) => soundingMidi(p, tuning, c))
  const result = identifyVoicing(midis)
  const declared = parseChordName(shape.name.split('/')[0])
  const expectedPc = declared ? (pitchClass(declared.root) + c) % 12 : null
  const match = result.matches.find((m) => m.rootPc === expectedPc && m.type === declared?.type) ?? result.matches[0]
  if (!match) return null
  const root = declared && c === 0 && pitchClass(declared.root) === match.rootPc && declared.type === match.type ? declared.root : rootName(match.rootPc, isMinorish(CHORDS[match.type].intervals))
  const changed = declared && (pitchClass(declared.root) !== match.rootPc || declared.type !== match.type)
  return { kind: 'chord', root, type: match.type, shape, tuning, capo: c, label: changed || c > 0 ? `${shape.name} (sounds ${chordSymbol(root, match.type)})` : shape.name }
}

export function lessonToolExamples(block: Block): ToolExample[] {
  const examples: ToolExample[] = [...(block.toolExamples ?? [])]
  if (block.type === 'audio' && block.play.toolExample) examples.push({ ...sourceTiming(block.play.toolExample, block.play.kind === 'sequence' ? block.play.events : undefined), label: block.play.toolExample.label ?? block.label })
  if (block.type === 'audio' && block.play.kind === 'shape' && !block.play.toolExample) {
    const example = shapeToolExample(block.play.shape, block.play.tuning, block.play.capo)
    if (example) examples.push(example)
  }
  if (block.type === 'audioRow') for (const item of block.items) if (item.play.toolExample) examples.push({ ...sourceTiming(item.play.toolExample, item.play.kind === 'sequence' ? item.play.events : undefined), label: item.play.toolExample.label ?? item.label })
  if (block.type === 'audioRow') for (const item of block.items) if (item.play.kind === 'shape' && !item.play.toolExample) {
    const example = shapeToolExample(item.play.shape, item.play.tuning, item.play.capo)
    if (example) examples.push(example)
  }
  if (block.type === 'fretboard') for (const mark of block.marks) if (mark.toolExample) examples.push(mark.toolExample.kind === 'scale' ? { ...mark.toolExample, frets: mark.toolExample.frets ?? block.frets } : mark.toolExample)
  if (block.type === 'chords') for (const shape of block.shapes) {
    const example = shapeToolExample(shape, block.tuning, block.capo)
    if (example) examples.push(example)
  }
  // Quiz content does not become a shortcut to an answer, even if it carries helper metadata.
  if (block.type === 'tryIt' || block.type === 'playIt') return []
  const seen = new Set<string>()
  const sourceEvents = block.type === 'audio' && block.play.kind === 'sequence' ? block.play.events : block.type === 'tab' ? block.events.map((event) => ({ notes: event.pos.map((p) => soundingMidi(p, block.tuning, effectiveCapo(block.capo))), beats: event.beats ?? 1 })) : undefined
  return examples.filter(validToolExample).map((example) => sourceTiming(example, sourceEvents)).filter((example) => {
    const { label: _label, ...context } = example
    const key = JSON.stringify(context)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function toolExampleLabel(e: ToolExample): string {
  if (e.label) return pretty(e.label)
  if (e.kind === 'scale') return `${pretty(e.root)} ${SCALES[e.type].name}`
  if (e.kind === 'chord') return pretty(chordSymbol(e.root, e.type))
  return `${pretty(e.root)}: ${e.romans.map(prettyRoman).join(' - ')}`
}

function explorerLaunch(root: string, type: ToolExample & { kind: 'scale' }): ToolLaunch {
  const frets = type.frets ?? [0, 15]
  return { tab: 'explorer', config: { mode: 'scale', scaleRoot: pitchClass(root), chordRoot: pitchClass(root), scale: type.type, chord: 'maj', label: 'note', maxFret: frets[1] > 15 ? 22 : 15,
    posKind: type.box !== undefined ? 'box' : type.frets ? 'window' : 'all', caged: 'E', box: type.box ?? 0, boxWindow: type.box !== undefined && type.frets !== undefined, lo: frets[0], hi: frets[1] } }
}

export function lessonToolActions(e: ToolExample, instrument: InstrumentId): LessonToolAction[] {
  if (!validToolExample(e)) return []
  if (e.kind === 'scale') return [{ id: 'explore', label: 'Explore this scale', launch: explorerLaunch(e.root, e) }]
  if (e.kind === 'progression') {
    const minor = isMinorish(SCALES[e.scale].intervals)
    const range = e.frets ?? [0, 12]
    const four = e.romans.some((r) => buildChord(e.root, parseRoman(r)!.type).length >= 4)
    const reharm: ReharmConfig = { ...DEFAULT_REHARM, keyPc: pitchClass(e.root), minor, bpm: e.bpm ?? 90,
      original: { romans: [...e.romans], durations: e.durations ? [...e.durations] : e.romans.map(() => e.beats ?? 4) },
      working: { romans: [...e.romans], durations: e.durations ? [...e.durations] : e.romans.map(() => e.beats ?? 4) } }
    const tonal = ['major', 'ionian', 'naturalMinor', 'aeolian', 'harmonicMinor', 'melodicMinor'].includes(e.scale)
    return [
      { id: 'loop', label: 'Loop this', launch: { tab: 'looper', config: { presetId: 'custom', romans: [...e.romans], keyPc: pitchClass(e.root), keyMinor: minor, bpm: e.bpm ?? 90, beats: e.beats ?? 4, ...(e.durations ? { durations: [...e.durations] } : {}), loopSection: null, countInBeats: 0, style: 'strum8', bass: 'root', drums: 'basic', instrument, volume: 0.8, label: 'note', selectedScale: e.scale, showScale: true, viewIdx: 0, targetOn: true, targetMode: 'all', targetPreview: true, fretLo: range[0], fretHi: range[1] } } },
      { id: 'voiceLeading', label: 'See the voice leading', launch: { tab: 'voiceLeading', config: { ...DEFAULT_VOICE_LEADING, romans: [...e.romans], keyPc: pitchClass(e.root), minor, stringSet: four ? '1-2-3-4' : '1-2-3', frets: [...range], startId: null, bpm: e.bpm ?? 90, beats: e.beats ?? 4 } } },
      { id: 'explore', label: 'Explore this scale', launch: explorerLaunch(e.root, { kind: 'scale', root: e.root, type: e.scale, frets: e.frets }) },
      ...(tonal && validReharmConfig(reharm) ? [{ id: 'reharmonisation', label: 'Reharmonise this', launch: { tab: 'reharmonisation' as const, config: reharm } }] : [])
    ]
  }
  const actions: LessonToolAction[] = []
  const shape = e.shape ?? chordLibrary(e.root, e.type).find((v) => !v.omitted.length)?.shape ?? chordLibrary(e.root, e.type)[0]?.shape
  // Library frets already represent the sounding chord in standard tuning.
  const tuning = findTuning(effectiveTuning(e.shape ? e.tuning : undefined))
  const input = shape && tuning ? { tuningId: tuning.id, capo: e.shape ? effectiveCapo(e.capo) : 0, frets: [...shape.frets] } : undefined
  if (input && isIdentifierInput(input)) actions.push({ id: 'identify', label: 'Identify chord', launch: { tab: 'identifier', input } })
  actions.push({ id: 'dictionary', label: 'See all shapes', launch: { tab: 'dictionary', entry: { kind: 'chord', root: e.root, type: e.type } } })
  return actions
}
