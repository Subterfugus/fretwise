import { useId, useState } from 'react'
import { BookOpen, GitBranch, ListMusic, Repeat2, Search, Shuffle } from 'lucide-react'
import type { Block } from '@/content/types'
import type { ToolLaunch } from '@/features/tools/toolLaunch'
import { useProgress } from '@/state/progress'
import { lessonToolActions, lessonToolExamples, toolExampleLabel } from './lessonTools'
import './lessonTools.css'

const ICONS = { loop: Repeat2, voiceLeading: GitBranch, explore: ListMusic, identify: Search, dictionary: BookOpen, reharmonisation: Shuffle }

export function LessonToolActions({ block, onOpen }: { block: Block; onOpen: (launch: ToolLaunch) => void }) {
  const id = useId()
  const [index, setIndex] = useState(0)
  const { settings } = useProgress()
  const examples = lessonToolExamples(block)
  const example = examples[Math.min(index, examples.length - 1)]
  if (!example) return null
  const actions = lessonToolActions(example, settings.instrument)
  if (!actions.length) return null
  return <div className="lesson-tool-actions" role="group" aria-label="Open lesson example in a tool">
    {examples.length > 1 ? <label className="lesson-tool-example" htmlFor={id}><span>Example</span><select id={id} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
      {examples.map((e, i) => <option key={i} value={i}>{toolExampleLabel(e)}</option>)}
    </select></label> : <span className="lesson-tool-name">{toolExampleLabel(example)}</span>}
    <div className="lesson-tool-buttons">{actions.map((action) => {
      const Icon = ICONS[action.id as keyof typeof ICONS]
      return <button key={action.id} className="btn ghost" title={`${action.label}: ${toolExampleLabel(example)}`} onClick={() => onOpen(action.launch)}><Icon size={15} aria-hidden />{action.label}</button>
    })}</div>
  </div>
}
