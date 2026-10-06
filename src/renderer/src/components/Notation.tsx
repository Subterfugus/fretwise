// Standard notation and tab rendering via VexFlow.
import { useEffect, useRef } from 'react'
import {
  Accidental,
  BarNote,
  Dot,
  Formatter,
  GhostNote,
  Renderer,
  Stave,
  StaveNote,
  TabNote,
  TabStave,
  Tuplet,
  Voice,
  type Note as VFNote
} from 'vexflow/bravura'
import type { FretPos } from '@/theory/guitar'
import { parseNote, midi as toMidi } from '@/theory/notes'
import { effectiveCapo, effectiveTuning, soundingMidi, writtenKey } from './tuning'
import { durationBeats, planBeats, tupletGroups } from './noteValues'

export { durationBeats }

const fontsReady = document.fonts ? document.fonts.load('30px Bravura').catch(() => undefined) : Promise.resolve()

/** "C#/4" -> midi */
export function keyToMidi(key: string): number {
  const [n, o] = key.split('/')
  return toMidi(parseNote(n + o))
}

function makeStaveNote(keys: string[], duration: string, clef: string): StaveNote {
  const rest = duration.includes('r')
  const dur = duration.replace('d', '')
  const note = new StaveNote({ keys: rest ? [clef === 'bass' ? 'D/3' : 'B/4'] : keys, duration: dur, clef, autoStem: true })
  if (duration.includes('d')) Dot.buildAndAttach([note], { all: true })
  return note
}

/** Insert barlines every `measureBeats` beats. */
function withBars<T extends VFNote>(notes: T[], beats: number[], measureBeats: number | null): VFNote[] {
  if (!measureBeats) return notes
  const out: VFNote[] = []
  let acc = 0
  notes.forEach((n, i) => {
    out.push(n)
    acc += beats[i]
    if (acc >= measureBeats - 1e-6 && i < notes.length - 1) {
      out.push(new BarNote())
      acc = Math.max(0, acc - measureBeats) // carry any overshoot into the next bar
    }
  })
  return out
}

/**
 * Add accidentals one measure at a time. VexFlow's applyAccidentals remembers an altered
 * pitch for the whole voice; musically an accidental lasts only until the next barline,
 * so a note after the barline must show its sign again.
 */
function applyAccidentalsByMeasure(tickables: VFNote[], keySig: string): void {
  let cur: VFNote[] = []
  const flush = () => {
    if (!cur.length) return
    const v = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(cur)
    Accidental.applyAccidentals([v], keySig)
    cur = []
  }
  for (const t of tickables) {
    if (t instanceof BarNote) flush()
    else cur.push(t)
  }
  flush()
}

function showError(el: HTMLElement, e: unknown) {
  console.error(e)
  el.textContent = 'Notation could not be drawn.'
}

function measureBeatsOf(timeSig?: string): number | null {
  if (!timeSig) return null
  const [n, d] = timeSig.split('/').map(Number)
  const beats = (n * 4) / d
  return Number.isFinite(beats) && beats > 0 ? beats : null // "C" / "C|" etc. => no automatic barlines
}

interface StaffProps {
  notes: { keys: string[]; duration: string }[]
  clef?: 'treble' | 'bass'
  keySig?: string
  timeSig?: string
}

export function Staff({ notes, clef = 'treble', keySig, timeSig }: StaffProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    fontsReady.then(() => {
      const el = ref.current
      if (!el || cancelled) return
      el.innerHTML = ''
      try {
        const mb = measureBeatsOf(timeSig)
        const bars = mb ? Math.floor(notes.reduce((n, x) => n + durationBeats(x.duration), 0) / mb) : 0
        const width = Math.max(260, 90 + notes.length * 44 + (keySig ? 40 : 0) + (timeSig ? 30 : 0) + bars * 20)
        const renderer = new Renderer(el, Renderer.Backends.SVG)
        renderer.resize(width + 10, 130)
        const ctx = renderer.getContext()
        const stave = new Stave(0, 10, width).addClef(clef)
        if (keySig) stave.addKeySignature(keySig)
        if (timeSig) stave.addTimeSignature(timeSig)
        stave.setContext(ctx).draw()
        if (!notes.length) return
        const vfNotes = notes.map((n) => makeStaveNote(n.keys, n.duration, clef))
        const beats = notes.map((n) => durationBeats(n.duration))
        const tickables = withBars(vfNotes, beats, mb)
        applyAccidentalsByMeasure(tickables, keySig ?? 'C')
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(tickables)
        new Formatter().joinVoices([voice]).format([voice], width - stave.getNoteStartX() - 20)
        voice.draw(ctx, stave)
      } catch (e) {
        showError(el, e)
      }
    })
    return () => {
      cancelled = true
    }
  }, [JSON.stringify(notes), clef, keySig, timeSig])
  return <div className="notation" ref={ref} />
}

interface TabProps {
  events: { pos: FretPos[]; beats?: number }[]
  notation?: boolean
  timeSig?: string
  /** Open-string MIDI notes (index 0 = string 1); the staff above the tab shows the tuned pitches. Default standard. */
  tuning?: number[]
  /** Capo fret: tab frets are relative to the capo, sounding pitch is raised by it. */
  capo?: number
  /** Spell the staff with flats instead of sharps. */
  flats?: boolean
}

export function Tab({ events, notation = true, timeSig, tuning, capo, flats = false }: TabProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    fontsReady.then(() => {
      const el = ref.current
      if (!el || cancelled) return
      el.innerHTML = ''
      try {
        const mb = measureBeatsOf(timeSig)
        const total = events.reduce((n, e) => n + (e.beats ?? 1), 0)
        const bars = mb ? Math.floor(total / mb) : 0
        const width = Math.max(280, 70 + events.length * 42 + (timeSig ? 30 : 0) + bars * 20)
        const renderer = new Renderer(el, Renderer.Backends.SVG)
        const tabY = notation ? 120 : 10
        renderer.resize(width + 10, tabY + 120)
        const ctx = renderer.getContext()
        const beats = events.map((e) => e.beats ?? 1)
        const plans = beats.map(planBeats)
        const groups = tupletGroups(plans)
        const tabStave = new TabStave(0, tabY, width).addTabGlyph()
        if (timeSig && !notation) tabStave.addTimeSignature(timeSig)
        tabStave.setContext(ctx).draw()
        if (!events.length) return
        // An event with no fretted notes is a rest: an invisible placeholder keeps the timing on the tab line
        // (a TabNote with no positions cannot be drawn).
        const tabNotes: VFNote[] = events.map((e, i) =>
          e.pos.length
            ? new TabNote({ positions: e.pos.map((p) => ({ str: p.string, fret: p.fret })), duration: plans[i].duration })
            : new GhostNote({ duration: plans[i].duration })
        )
        const tabTickables = withBars(tabNotes, beats, mb)
        const tabVoice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(tabTickables)
        let staffVoice: Voice | null = null
        let stave: Stave | null = null
        const tuplets: Tuplet[] = groups.map((g) => new Tuplet(g.map((i) => tabNotes[i]), { numNotes: 3, notesOccupied: 2, bracketed: true }))
        if (notation) {
          stave = new Stave(0, 10, width).addClef('treble')
          if (timeSig) stave.addTimeSignature(timeSig)
          stave.setContext(ctx).draw()
          const sn = events.map((e, i) => {
            const keys = [...e.pos].map((p) => soundingMidi(p, tuning, effectiveCapo(capo))).sort((a, b) => a - b).map((m) => writtenKey(m, flats))
            // an event with no fretted notes is a rest
            return makeStaveNote(keys, plans[i].duration + (keys.length ? '' : 'r'), 'treble')
          })
          for (const g of groups) tuplets.push(new Tuplet(g.map((i) => sn[i]), { numNotes: 3, notesOccupied: 2, bracketed: true }))
          const staffTickables = withBars(sn, beats, mb)
          applyAccidentalsByMeasure(staffTickables, 'C')
          staffVoice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(staffTickables)
        }
        const fmt = new Formatter()
        fmt.joinVoices([tabVoice])
        if (staffVoice) {
          fmt.joinVoices([staffVoice])
          fmt.format([staffVoice, tabVoice], width - 70)
          staffVoice.draw(ctx, stave!)
        } else fmt.format([tabVoice], width - 60)
        tabVoice.draw(ctx, tabStave)
        tuplets.forEach((t) => t.setContext(ctx).draw())
      } catch (e) {
        showError(el, e)
      }
    })
    return () => {
      cancelled = true
    }
  }, [JSON.stringify(events), notation, timeSig, JSON.stringify(effectiveTuning(tuning)), capo, flats])
  return <div className="notation" ref={ref} />
}
