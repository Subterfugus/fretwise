import { useEffect, useRef, useState } from 'react'
import { engine } from '@/audio/engine'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DictionaryTab } from './DictionaryTab'
import { ExplorerTab } from './ExplorerTab'
import { LooperTab } from './LooperTab'
import { MetronomeTab } from './MetronomeTab'
import { TriadsTab } from './TriadsTab'
import { NoteFinderTab } from './NoteFinderTab'
import { ScaleComparisonTab } from './ScaleComparisonTab'
import { ChordIdentifierTab } from './ChordIdentifierTab'
import { VoiceLeadingTab } from './VoiceLeadingTab'
import { ReharmonisationTab } from './ReharmonisationTab'
import type { DictView } from './keyDictionary'
import { Seg, usePref } from './ui'
import { ArrowLeft, ChevronDown, Wrench } from 'lucide-react'
import type { LessonOrigin } from '@/App'
import { findLesson } from '@/content/units'
import type { ToolLaunch } from './toolLaunch'
import './tools.css'

export type ToolTab = 'explorer' | 'dictionary' | 'identifier' | 'voiceLeading' | 'reharmonisation' | 'looper' | 'metronome' | 'triads' | 'noteFinder' | 'scaleComparison'
type Tab = ToolTab
const TABS: { id: Tab; label: string }[] = [
  { id: 'explorer', label: 'Fretboard explorer' },
  { id: 'dictionary', label: 'Chord & scale dictionary' },
  { id: 'identifier', label: 'Chord Identifier' },
  { id: 'voiceLeading', label: 'Voice Leading' },
  { id: 'reharmonisation', label: 'Reharmonisation' },
  { id: 'looper', label: 'Backing-track looper' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'triads', label: 'Triads' },
  { id: 'noteFinder', label: 'Note Finder' },
  { id: 'scaleComparison', label: 'Scale Comparison' }
]
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: 'Explore', tabs: ['explorer', 'dictionary', 'identifier', 'scaleComparison'] },
  { label: 'Harmony', tabs: ['triads', 'voiceLeading', 'reharmonisation'] },
  { label: 'Practise', tabs: ['noteFinder', 'looper', 'metronome'] }
]

export function Tools({ initialTab, launch, dictionaryEntry, lessonOrigin, onReturnToLesson, onDictionaryEntry, onToolLaunch }: { initialTab?: ToolTab; launch?: ToolLaunch; dictionaryEntry?: DictView; lessonOrigin?: LessonOrigin; onReturnToLesson?: () => void; onDictionaryEntry: (entry: DictView) => void; onToolLaunch: (launch: ToolLaunch) => void }) {
  const [savedTab, setSavedTab] = usePref<Tab>('tab', 'explorer', (v) => TABS.some((t) => t.id === v))
  const [requestedTab, setRequestedTab] = useState(launch?.tab ?? initialTab)
  const switcherRef = useRef<HTMLDetailsElement>(null)
  const tab = requestedTab ?? savedTab
  const closeSwitcher = () => {
    if (switcherRef.current) switcherRef.current.open = false
  }
  const setTab = (next: Tab) => {
    setRequestedTab(undefined); setSavedTab(next); closeSwitcher()
    switcherRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'instant' })
    switcherRef.current?.querySelector('summary')?.focus()
  }
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !switcherRef.current?.contains(e.target)) closeSwitcher() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  // Switching tools must not leave the other tool's music running.
  useEffect(() => {
    return () => engine.stop()
  }, [tab])
  return (
    <div className="page tools-page">
      <header className="tools-header"><h1>Tools</h1>
        <div className="tools-tabs"><details className="tools-switcher" ref={switcherRef} onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); closeSwitcher(); switcherRef.current?.querySelector('summary')?.focus() }
        }} onBlur={(e) => { if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) closeSwitcher() }}>
          <summary aria-label={`Choose tool: ${TABS.find((t) => t.id === tab)?.label}`}><Wrench size={17} aria-hidden /><span>{TABS.find((t) => t.id === tab)?.label}</span><ChevronDown size={16} aria-hidden /></summary>
          <div className="tools-switcher-menu">{GROUPS.map((group) => <div key={group.label}>
            <div className="tools-switcher-heading">{group.label}</div>
            <Seg label={`${group.label} tools`} options={TABS.filter((t) => group.tabs.includes(t.id))} value={tab} onChange={setTab} />
          </div>)}</div>
        </details></div>
      </header>
      {lessonOrigin && onReturnToLesson && <div className="tools-lesson-return"><button className="btn ghost" onClick={onReturnToLesson}><ArrowLeft size={16} aria-hidden />Back to {findLesson(lessonOrigin.lessonId)?.lesson.title ?? 'lesson'}</button></div>}
      <ErrorBoundary key={tab}>
        {tab === 'explorer' && <ExplorerTab initialConfig={requestedTab === 'explorer' && launch?.tab === 'explorer' ? launch.config : undefined} />}
        {tab === 'dictionary' && <DictionaryTab entry={requestedTab === 'dictionary' ? launch?.tab === 'dictionary' ? launch.entry : dictionaryEntry : undefined} />}
        {tab === 'identifier' && <ChordIdentifierTab initialInput={requestedTab === 'identifier' && launch?.tab === 'identifier' ? launch.input : undefined} onDictionaryEntry={onDictionaryEntry} />}
        {tab === 'voiceLeading' && <VoiceLeadingTab initialConfig={requestedTab === 'voiceLeading' && launch?.tab === 'voiceLeading' ? launch.config : undefined} onDictionaryEntry={onDictionaryEntry} />}
        {tab === 'reharmonisation' && <ReharmonisationTab initialConfig={requestedTab === 'reharmonisation' && launch?.tab === 'reharmonisation' ? launch.config : undefined} onToolLaunch={onToolLaunch} onDictionaryEntry={onDictionaryEntry} />}
        {tab === 'looper' && <LooperTab initialConfig={requestedTab === 'looper' && launch?.tab === 'looper' ? launch.config : undefined} />}
        {tab === 'metronome' && <MetronomeTab />}
        {tab === 'triads' && <TriadsTab />}
        {tab === 'noteFinder' && <NoteFinderTab />}
        {tab === 'scaleComparison' && <ScaleComparisonTab />}
      </ErrorBoundary>
    </div>
  )
}
