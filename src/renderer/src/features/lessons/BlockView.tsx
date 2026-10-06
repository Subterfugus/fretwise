import type { Block } from '@/content/types'
import { Markdown } from '@/components/Markdown'
import { Fretboard } from '@/components/Fretboard'
import { ChordDiagram } from '@/components/ChordDiagram'
import { Staff, Tab, keyToMidi, durationBeats } from '@/components/Notation'
import { PlayButton } from '@/components/PlayButton'
import { CircleOfFifths } from '@/components/CircleOfFifths'
import { QuestionView } from '@/features/quiz/QuestionView'
import { PlayItBlock } from '@/features/mic/PlayItBlock'
import { playMarks } from '@/content/helpers'
import { effectiveCapo, soundingMidi, tuningCaption } from '@/components/tuning'
import { pretty } from '@/theory/notes'
import type { ToolLaunch } from '@/features/tools/toolLaunch'
import { LessonToolActions } from './LessonToolActions'

const TIP_TITLES = { tip: 'Tip', warning: 'Watch out', theory: 'Theory note', practice: 'Practice' }

export function BlockView({ block, onOpenTool }: { block: Block; onOpenTool?: (launch: ToolLaunch) => void }) {
  return <><BlockContent block={block} />{onOpenTool && <LessonToolActions block={block} onOpen={onOpenTool} />}</>
}

function BlockContent({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return (
        <div className="b-text">
          <Markdown md={block.md} />
        </div>
      )
    case 'tip': {
      const tone = block.tone ?? 'tip'
      return (
        <aside className={'b-tip ' + tone}>
          <div className="b-tip-title">{TIP_TITLES[tone]}</div>
          <Markdown md={block.md} />
        </aside>
      )
    }
    case 'fretboard':
      return (
        <figure className="b-figure">
          <div className="fb-wrap">
            <Fretboard marks={block.marks} frets={block.frets} playable={block.playable ?? true} tuning={block.tuning} capo={block.capo} showTuning={block.showTuning} />
          </div>
          <figcaption>
            {block.caption && <span>{pretty(block.caption)}</span>}
            {block.playAll && <PlayButton small play={playMarks(block.marks, true, block.tuning)} label="Play all" />}
          </figcaption>
        </figure>
      )
    case 'chords':
      return (
        <figure className="b-figure">
          <div className="chord-row">
            {block.shapes.map((s, i) => (
              <ChordDiagram key={i} shape={s} tuning={block.tuning} capo={block.capo} showTuning={block.showTuning} />
            ))}
          </div>
          <figcaption>{pretty(block.caption ?? 'Click a chord to hear it strummed.')}</figcaption>
        </figure>
      )
    case 'tab':
      return (
        <figure className="b-figure">
          <div className="notation-scroll">
            <Tab events={block.events} notation={block.notation ?? true} timeSig={block.timeSig} tuning={block.tuning} capo={block.capo} flats={block.flats} />
          </div>
          {tuningCaption(block.tuning, block.capo) && <div className="tab-tuning">{pretty(tuningCaption(block.tuning, block.capo))}</div>}
          <figcaption>
            {block.caption && <span>{pretty(block.caption)}</span>}
            <PlayButton
              small
              play={{
                kind: 'sequence',
                bpm: block.bpm ?? 90,
                events: block.events.map((e) => ({ notes: e.pos.map((p) => soundingMidi(p, block.tuning, effectiveCapo(block.capo))), beats: e.beats ?? 1 }))
              }}
            />
          </figcaption>
        </figure>
      )
    case 'staff':
      return (
        <figure className="b-figure">
          <div className="notation-scroll">
            <Staff notes={block.notes} clef={block.clef} keySig={block.keySig} timeSig={block.timeSig} />
          </div>
          <figcaption>
            {block.caption && <span>{pretty(block.caption)}</span>}
            {(block.playable ?? true) && (
              <PlayButton
                small
                play={{
                  kind: 'sequence',
                  bpm: block.bpm ?? 90,
                  events: block.notes.map((n) => ({
                    notes: n.duration.includes('r') ? [] : n.keys.map((k) => keyToMidi(k) - (block.concertPitch || block.clef === 'bass' ? 0 : 12)),
                    beats: durationBeats(n.duration)
                  }))
                }}
              />
            )}
          </figcaption>
        </figure>
      )
    case 'audio':
      return (
        <div className="b-audio">
          <PlayButton play={block.play} label={block.label} />
        </div>
      )
    case 'audioRow':
      return (
        <div className="b-audio row">
          {block.items.map((it, i) => (
            <PlayButton key={i} play={it.play} label={it.label} />
          ))}
        </div>
      )
    case 'table':
      return (
        <figure className="b-figure">
          <table className="b-table">
            <thead>
              <tr>{block.headers.map((h, i) => <th key={i}>{pretty(h)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{pretty(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {block.caption && <figcaption>{pretty(block.caption)}</figcaption>}
        </figure>
      )
    case 'circleOfFifths':
      return (
        <figure className="b-figure center">
          <CircleOfFifths highlight={block.highlight} />
          <figcaption>Click any key to hear its tonic chord.</figcaption>
        </figure>
      )
    case 'tryIt':
      return (
        <div className="b-tryit">
          <div className="b-tryit-title">Try it</div>
          <QuestionView question={block.question} practice />
        </div>
      )
    case 'playIt':
      return <PlayItBlock block={block} />
  }
}
